import { type MarketRow, numeric, record, timeToMinute, formatNumber as fmt, signalLabel } from './balta-model';
import { rankSectorStrength, type Sector } from './market-research';

export type PulseRegime = '강세' | '상승 지속' | '혼조' | '위험' | '투매' | '반전 시도' | '판정 대기';
export type PulseFactor = { name: string; weight: number; value: number | null; detail: string };
export type PulseSectorSnapshot = { date: string; time: string; sectors: unknown[] };
export type MarketPulse = { score: number | null; regime: PulseRegime; coverage: number; date: string; time: string; factors: PulseFactor[]; reasons: string[] };
const clamp = (n: number) => Math.max(-1, Math.min(1, n));
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
function breadth(r: MarketRow): number | null {
  const counts = [r.up, r.down, r.flat];
  const total = r.up + r.down + r.flat;
  return r.breadthSource === 'LIVE' && counts.every(n => finite(n) && n >= 0) && total > 0 ? (r.up - r.down) / total : null;
}
const flowValid = (r: MarketRow) => r.flowSource === 'LIVE' && finite(r.foreignFlow) && finite(r.instFlow);
const UP = new Set(['PIVOT_UP_CONFIRMED','BREADTH_REVERSAL_UP','FLOW_REVERSAL_BUY','INDEX_FLOW_DIVERGENCE_BULL','INTRADAY_LOW_TURN']);
const DOWN = new Set(['PIVOT_DOWN_CONFIRMED','BREADTH_REVERSAL_DOWN','FLOW_REVERSAL_SELL','INDEX_FLOW_DIVERGENCE_BEAR','INTRADAY_HIGH_TURN']);

// Snapshot times are supplied separately for each market by the existing sectors API.
// Never use a later snapshot or one more than 15 minutes old for an earlier row.
function sectorFactor(snapshot: PulseSectorSnapshot | null, row: MarketRow): PulseFactor {
  const missing: PulseFactor = { name: '섹터 강도', weight: 15, value: null, detail: '동시간대 양 시장 섹터 자료 없음' };
  if (!snapshot || snapshot.date !== row.date) return missing;
  const sectors: Sector[] = [];
  const seen = new Set<string>();
  for (const market of ['kospi', 'kosdaq'] as const) {
    const part = snapshot.time.split('/').find(p => p.trim().toLowerCase().startsWith(market + ' '));
    const minute = timeToMinute(part ?? '');
    if (minute < 540 || minute > 930 || minute > row.minute || row.minute - minute > 15) return missing;
    const group: Sector[] = [];
    for (const raw of snapshot.sectors) {
      const s = record(raw), change = numeric(s.change), price = numeric(s.price);
      const code = String(s.code ?? ''), name = String(s.name ?? '');
      if (s.market !== market || !code || !name || change === null || price === null || price <= 0 || seen.has(market + ':' + code)) continue;
      seen.add(market + ':' + code);
      group.push({ market, code, name, change, price, turnoverRaw: numeric(s.turnoverRaw) });
    }
    if (group.length < 3) return missing;
    sectors.push(...group);
  }
  const ranked = rankSectorStrength(sectors);
  // Balance the two markets so that the market with more sector codes cannot dominate.
  const means = (['kospi','kosdaq'] as const).map(m => {
    const group = ranked.filter(s => s.market === m);
    return group.reduce((sum,s) => sum + s.strength / 100, 0) / group.length;
  });
  return { ...missing, value: (means[0] + means[1]) / 2, detail: '강도 양수 ' + ranked.filter(s => s.strength > 0).length + '/' + ranked.length + '개 · ' + snapshot.time };
}

/** Deterministic display-only rules. Does not overwrite marketScore or saved signals. */
export function calculateMarketPulse(input: MarketRow[], snapshot: PulseSectorSnapshot | null = null): MarketPulse {
  const date = input.map(r => r.date).sort().at(-1) ?? '';
  const unique = new Map<number, MarketRow>();
  for (const r of input) if (r.date === date && r.session === 'REGULAR' && r.minute >= 540 && r.minute <= 930) {
    const old = unique.get(r.minute);
    if (!old || r.id >= old.id) unique.set(r.minute, r);
  }
  const rows = [...unique.values()].sort((a,b) => a.minute - b.minute), row = rows.at(-1);
  if (!row) return { score: null, regime: '판정 대기', coverage: 0, date, time: '', factors: [], reasons: ['정규장 기록이 필요합니다.'] };
  const b = breadth(row);
  const before = rows.filter(r => row.minute - r.minute >= 10 && row.minute - r.minute <= 15).at(-1);
  const oldB = before ? breadth(before) : null;
  const foreign = flowValid(row) ? row.foreignFlow! : null, inst = flowValid(row) ? row.instFlow! : null;
  const f = foreign !== null && inst !== null ? (clamp(foreign / 3000) + clamp(inst / 3000)) / 2 : null;
  const moves = (['kospi','kosdaq'] as const).map(key => {
    const current = row[key], old = before?.[key];
    return finite(current) && finite(old) && current > 0 && old > 0 ? (current / old - 1) * 100 : null;
  });
  const index = moves.every(finite) ? (clamp(moves[0]! / .5) + clamp(moves[1]! / .5)) / 2 : null;
  const recent = rows.filter(r => row.minute - r.minute <= 5);
  const types = new Set(recent.flatMap(r => r.signals.map(s => String(s.type ?? '')).filter(t =>
    (UP.has(t) || DOWN.has(t)) && breadth(r) !== null && flowValid(r))));
  const up = [...types].some(t => UP.has(t)), down = [...types].some(t => DOWN.has(t));
  const acceleration = b !== null && oldB !== null ? clamp((b - oldB) / .15) : null;
  const previous = rows.at(-2);
  const shortAccel = previous && row.minute - previous.minute <= 3 && breadth(previous) !== null && b !== null && finite(row.accel)
    ? clamp(row.accel / 150) : null;
  const momentum = acceleration === null ? null : clamp(acceleration * (shortAccel === null ? .7 : .5) + (shortAccel ?? 0) * .2 + (Number(up) - Number(down)) * .3);
  const factors: PulseFactor[] = [
    { name: '시장폭', weight: 30, value: b === null ? null : clamp(b / .6), detail: b === null ? '정상 시장폭 자료 없음' : '상승 ' + fmt(row.up) + ' · 하락 ' + fmt(row.down) },
    { name: '외국인·기관 수급', weight: 25, value: f, detail: f === null ? '정상 수급 자료 없음' : '외국인 ' + fmt(foreign,0,true) + '억 · 기관 ' + fmt(inst,0,true) + '억' },
    { name: 'KOSPI·KOSDAQ 방향', weight: 20, value: index, detail: index === null ? '10~15분 전 양 지수 기록 필요' : before!.time + ' 대비 ' + fmt(moves[0],2,true) + '% / ' + fmt(moves[1],2,true) + '%' },
    sectorFactor(snapshot,row),
    { name: '장중 가속·변곡', weight: 10, value: momentum, detail: momentum === null ? '10~15분 전 정상 시장폭 기록 필요' : '시장폭 비율 변화 ' + fmt((b! - oldB!) * 100,1,true) + '%p' + (shortAccel === null ? '' : ' · 직전 가속 ' + fmt(row.accel,0,true) + '개') + (types.size ? ' · ' + [...types].map(signalLabel).join(', ') : ' · 최근 변곡 신호 없음') },
  ];
  const coverage = factors.reduce((sum,f) => sum + (f.value === null ? 0 : f.weight),0);
  const score = coverage ? Math.round(50 + factors.reduce((sum,f) => sum + (f.value ?? 0) * f.weight,0) / coverage * 50) : null;
  let regime: PulseRegime = '판정 대기';
  const reasons: string[] = [];
  if (coverage >= 65 && b !== null && f !== null && index !== null && score !== null) {
    const falling = moves.every(v => v !== null && v <= -.15);
    const rising = moves.every(v => v !== null && v >= .05);
    if (b <= -.5 && f <= -.25 && falling && (momentum ?? 0) <= 0) { regime = '투매'; reasons.push('하락 종목 확산·동반 지수 하락·순매도가 겹칩니다.'); }
    else if (oldB !== null && oldB < -.15 && b < .2 && momentum !== null && momentum >= .35 && up && !down && index > 0 && f >= -.2) { regime = '반전 시도'; reasons.push('약했던 시장폭이 개선되고 상방 변곡과 지수 회복이 확인됩니다.'); }
    else if (score <= 35 || (b < -.2 && index < 0) || (down && momentum !== null && momentum < -.3 && index < 0)) { regime = '위험'; reasons.push('시장폭·지수 흐름 또는 하방 변곡이 약세를 가리킵니다.'); }
    else if (score >= 72 && b >= .3 && f > 0 && rising && !down) { regime = '강세'; reasons.push('상승 종목 확산과 순매수, 양 지수 상승이 일치합니다.'); }
    else if (score >= 58 && b > .1 && oldB !== null && oldB > .1 && f >= 0 && rising && momentum !== null && momentum >= -.1 && !down) { regime = '상승 지속'; reasons.push('10~15분 전부터 상승 종목 우위가 이어지고 양 지수가 상승합니다.'); }
    else { regime = '혼조'; reasons.push('지표 간 방향이 엇갈리거나 뚜렷한 국면 조건을 충족하지 않습니다.'); }
  } else reasons.push('시장폭·정상 수급·양 지수 비교 기록이 갖춰져야 국면을 판정합니다.');
  return { score, regime, coverage, date, time: row.time, factors, reasons };
}
