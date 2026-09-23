import { marketClosedReason, parseAdditionalHolidays } from './market-calendar';
export type FutureSession = 'DAY' | 'NIGHT';
export type SessionMode = FutureSession | 'ALL';
export type CalendarDay = { open: boolean; dayOpen?: string; dayClose?: string; nightClosed?: boolean };
export type FutureCalendar = Record<string, CalendarDay>;
// KRX product specifications and night-session rules, verified 2026-09-22.
// Opening auctions are not trades. Closing auctions at 15:45 / 06:00 are retained.
export const FUTURES_SESSION = { dayOpen: '08:45', dayClose: '15:45', expiryClose: '15:20', nightOpen: '18:00', nightClose: '06:00', timeZone: 'Asia/Seoul' } as const;
export function validDate(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d+'T00:00:00Z')) && new Date(d+'T00:00:00Z').toISOString().slice(0,10) === d;
}
export function addDate(d: string, days: number) { return new Date(Date.parse(d+'T00:00:00Z') + days * 86400000).toISOString().slice(0,10); }
export function kstParts(now: Date) {
  const s = new Date(now.getTime()+9*3600000).toISOString();
  return { date: s.slice(0,10), time: s.slice(11,19) };
}
export function kstInstant(date: string, time: string) { return new Date(date+'T'+(time.length===5?time+':00':time)+'+09:00').toISOString(); }
export function configuredCalendar(extra: FutureCalendar = {}): FutureCalendar {
  const result = { ...extra };
  for (const d of parseAdditionalHolidays(process.env.MARKET_HOLIDAYS)) result[d] = { open: false };
  const overrides = process.env.FUTURES_SESSION_OVERRIDES;
  if (overrides) {
    const parsed = JSON.parse(overrides);
    for (const [d,v] of Object.entries(parsed)) {
      const row = v as CalendarDay;
      if (!validDate(d) || typeof row?.open !== 'boolean' || [row.dayOpen,row.dayClose].some(t=>t!=null&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw Error('선물 세션 설정 오류');
      result[d] = row;
    }
  }
  return result;
}
export function isOpenDate(d: string, calendar: FutureCalendar = {}) {
  return calendar[d]?.open ?? !marketClosedReason(d);
}
export function nextSpotDate(openingDate: string, calendar: FutureCalendar = {}) {
  let d = openingDate;
  for (let i=0;i<35;i++) { d=addDate(d,1); if(isOpenDate(d,calendar))return d; }
  return null;
}
export function sessionBounds(openingDate: string, session: FutureSession, calendar: FutureCalendar = {}, expiry?: string | null) {
  const cfg = FUTURES_SESSION, day = calendar[openingDate];
  return {
    start: kstInstant(openingDate,session==='NIGHT'?cfg.nightOpen:day?.dayOpen??cfg.dayOpen),
    end: kstInstant(session==='NIGHT'?addDate(openingDate,1):openingDate,session==='NIGHT'?cfg.nightClose:expiry===openingDate?cfg.expiryClose:day?.dayClose??cfg.dayClose),
  };
}
export function sessionAt(now: Date, calendar: FutureCalendar = {}, expiry?: string | null, includeClosingTrade = false) {
  const {date,time}=kstParts(now), cfg=FUTURES_SESSION;
  const nightMorning=time.slice(0,5)<cfg.nightClose || (includeClosingTrade&&time===cfg.nightClose+':00');
  const openingDate=nightMorning?addDate(date,-1):date;
  const night=(nightMorning||time.slice(0,5)>=cfg.nightOpen)&&isOpenDate(openingDate,calendar)&&!calendar[openingDate]?.nightClosed;
  const bounds=sessionBounds(date,'DAY',calendar,expiry);
  const day=isOpenDate(date,calendar)&&now.getTime()>=Date.parse(bounds.start)&&(now.getTime()<Date.parse(bounds.end)||(includeClosingTrade&&now.getTime()===Date.parse(bounds.end)));
  const session: FutureSession|'CLOSED'=night?'NIGHT':day?'DAY':'CLOSED';
  return { session, openingDate:night?openingDate:date, tradingDate:night?addDate(openingDate,1):date,
    nextSpotDate:nextSpotDate(night?openingDate:date,calendar), asOf:now.toISOString() };
}
export function latestSession(now: Date, session: FutureSession, calendar: FutureCalendar = {}) {
  let d=kstParts(now).date;
  for(let i=0;i<35;i++,d=addDate(d,-1)) {
    const b=sessionBounds(d,session,calendar);
    if(isOpenDate(d,calendar)&&!(session==='NIGHT'&&calendar[d]?.nightClosed)&&Date.parse(b.start)<=now.getTime())return { openingDate:d,tradingDate:session==='NIGHT'?addDate(d,1):d,...b };
  }
  throw Error('선물 거래일을 확인하지 못했습니다.');
}
export function contractTradable(expiry: string, now: Date) {
  return validDate(expiry)&&now.getTime()<Date.parse(kstInstant(expiry,FUTURES_SESSION.expiryClose));
}
