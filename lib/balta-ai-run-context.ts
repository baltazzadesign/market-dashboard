import { marketClosedReason } from './market-calendar';

export type ResearchPhase = 'morning' | 'close';
export class ResearchBoundaryError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'ResearchBoundaryError'; }
}
const schedules: Record<string, {phase: ResearchPhase; hour: number; minute: number; days: number[]}> = {
  '37 22 * * 0-4': {phase:'morning',hour:22,minute:37,days:[0,1,2,3,4]},
  '27 23 * * 0-4': {phase:'morning',hour:23,minute:27,days:[0,1,2,3,4]},
  '17 8 * * 1-5': {phase:'close',hour:8,minute:17,days:[1,2,3,4,5]},
  '47 9 * * 1-5': {phase:'close',hour:9,minute:47,days:[1,2,3,4,5]},
};
export function validResearchDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) &&
    new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;
}
export function seoulDate(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new ResearchBoundaryError('INVALID_CLOCK');
  return new Date(now.getTime()+9*3600000).toISOString().slice(0,10);
}
// GitHub does not supply an occurrence timestamp for cron. Our explicit policy is
// the latest matching occurrence <= the ORIGINAL run.created_at, within 12 hours.
// Never use run_started_at (changes on rerun), the runner clock, or a previous
// trading day fallback. Longer/ambiguous delays require a dated manual dispatch.
export function resolveScheduledResearch(schedule: string, createdAt: string) {
  const spec = schedules[schedule];
  if (!spec) throw new ResearchBoundaryError('UNKNOWN_SCHEDULE');
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(createdAt))
    throw new ResearchBoundaryError('INVALID_RUN_CREATED_AT');
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) throw new ResearchBoundaryError('INVALID_RUN_CREATED_AT');
  for (let day=0;day<8;day++) {
    const slot=new Date(created); slot.setUTCHours(spec.hour,spec.minute,0,0);
    slot.setUTCDate(slot.getUTCDate()-day);
    if (slot.getTime()>created || !spec.days.includes(slot.getUTCDay())) continue;
    if (created-slot.getTime()>12*3600000) throw new ResearchBoundaryError('SCHEDULE_DELAY_OUTSIDE_WINDOW');
    return {phase:spec.phase,tradeDate:seoulDate(slot),scheduledAt:slot.toISOString(),runCreatedAt:createdAt,
      schedule,selection:'latest_schedule_before_original_run_creation' as const};
  }
  throw new ResearchBoundaryError('SCHEDULE_OCCURRENCE_NOT_FOUND');
}
export function researchBoundary(phase: ResearchPhase, date: string, now: Date, holidays: string[]=[], verifiedYears=['2026']) {
  if (!validResearchDate(date)) throw new ResearchBoundaryError('INVALID_TRADE_DATE');
  if (!verifiedYears.includes(date.slice(0,4))) throw new ResearchBoundaryError('EXCHANGE_CALENDAR_YEAR_NOT_VERIFIED');
  if (date>seoulDate(now)) throw new ResearchBoundaryError('FUTURE_TRADE_DATE');
  const closed=marketClosedReason(date,holidays);
  if (closed) return {closed,verifyMorningOnly:false};
  if (phase==='close' && now.getTime()<Date.parse(date+'T16:30:00+09:00'))
    throw new ResearchBoundaryError('CLOSE_BEFORE_TARGET_1630_KST');
  return {closed:null,verifyMorningOnly:phase==='morning' && now.getTime()>=Date.parse(date+'T09:00:00+09:00')};
}
export function closePriceStatus(date: string, now: Date) {
  return now.getTime()<Date.parse(date+'T18:30:00+09:00')?'provisional':'vendor_daily_unofficial';
}
