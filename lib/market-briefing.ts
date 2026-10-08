import { formatNumber as fmt, isValidDate, kstParts, moveDate, normalizeRow, numeric, record, timeToMinute, type MarketRow } from './balta-model';
import { marketClosedReason } from './market-calendar';
import type { NewsItem } from './terminal-model';
import { interpretBriefing, type BriefingInsight } from './market-briefing-insight';

export type BriefingPoint = {
  time: string; minute: number;
  kospi: { price: number | null; change: number | null; verified?: boolean };
  kosdaq: { price: number | null; change: number | null; verified?: boolean };
  breadth: { up: number; down: number; flat: number; total: number; share: number } | null;
  foreign: number | null; institution: number | null; individual: number | null;
};
export type BriefingSector = { code: string; name: string; market: 'kospi' | 'kosdaq'; change: number; time: string; rank: number; count: number };
export type Briefing = {
  ok: true; date: string; today: string; generatedAt: string; closedReason: string | null;
  latest: BriefingPoint | null; headline: string; summary: { title: string; text: string }[];
  timeline: { time: string; title: string; text: string }[];
  sectors: BriefingSector[]; count: number; firstTime: string | null; warnings: string[];
  insight: BriefingInsight | null;
};

export function briefingDates(today: string, holidays: readonly string[] = []) {
  const dates = [today];
  for (let i = 1; dates.length < 4 && i < 32; i++) {
    const date = moveDate(today, -i);
    if (!marketClosedReason(date, holidays)) dates.push(date);
  }
  return dates;
}

function point(raw: unknown, row: MarketRow): BriefingPoint {
  const extra = record(record(raw).market_data ?? record(raw).marketData);
  const quote = (key: 'kospi' | 'kosdaq') => {
    const data = record(extra[key]);
    const source = String(data.priceSource ?? '');
    const unavailable = source !== '' && source !== 'LIVE';
    const price = unavailable ? null : numeric(data.price) ?? row[key];
    return { price: price !== null && price > 0 ? price : null, verified: source === 'LIVE',
      change: unavailable || price === null || price <= 0 ? null : numeric(data.changePct) };
  };
  const total = row.up + row.down + row.flat;
  const breadth = row.breadthSource === 'LIVE' && [row.up, row.down, row.flat].every(n => Number.isInteger(n) && n >= 0) && total > 0
    ? { up: row.up, down: row.down, flat: row.flat, total, share: row.up / total * 100 } : null;
  return { time: row.time, minute: row.minute, kospi: quote('kospi'), kosdaq: quote('kosdaq'), breadth,
    foreign: row.flowSource === 'LIVE' ? row.foreignFlow : null,
    institution: row.flowSource === 'LIVE' ? row.instFlow : null,
    individual: row.flowSource === 'LIVE' ? row.indivFlow : null };
}

export function briefingPoints(rawRows: unknown[], date: string, now: Date) {
  const clock = kstParts(now), found = new Map<number, { id: number; value: BriefingPoint }>();
  for (const raw of rawRows) {
    const r = record(raw), storedDate = String(r.date ?? r.createdat ?? date).slice(0, 10);
    if (storedDate !== date) continue;
    const row = normalizeRow(raw, date);
    if (row.session !== 'REGULAR' || row.minute < 540 || row.minute > 930 || (date === clock.date && row.minute > clock.minute)) continue;
    const previous = found.get(row.minute);
    if (!previous || row.id > previous.id) found.set(row.minute, { id: row.id, value: point(raw, row) });
  }
  return [...found.values()].map(x => x.value).sort((a, b) => a.minute - b.minute);
}

function combined(p: BriefingPoint) {
  return p.foreign !== null && p.institution !== null ? p.foreign + p.institution : null;
}
function flowText(value: number | null) {
  return value === null ? '확인 필요' : value === 0 ? '순매수·순매도 균형' : `${fmt(Math.abs(value))}억원 순${value > 0 ? '매수' : '매도'}`;
}
export function briefingHeadline(p: BriefingPoint) {
  const changes = [p.kospi.change, p.kosdaq.change], b = p.breadth, flow = combined(p);
  const index = changes.every(x => x !== null) ? changes.every(x => x! > 0) ? '양 시장 지수 상승' : changes.every(x => x! < 0) ? '양 시장 지수 하락' : '양 시장 지수 혼조' : null;
  const breadth = b ? b.up > b.down ? '상승 종목 우세' : b.up < b.down ? '하락 종목 우세' : '상승·하락 종목 균형' : null;
  const first = index ?? breadth ?? '수집된 시장 기록';
  if (flow !== null) return `${first}, 외국인·기관 ${flow === 0 ? '합산 수급 균형' : flow > 0 ? '합산 순매수' : '합산 순매도'}`;
  return `${first} · ${index && breadth ? breadth : '수급 확인 필요'}`;
}
export function briefingSummaries(p: BriefingPoint) {
  const index = (label: string, q: BriefingPoint['kospi']) => `${label} ${q.price === null ? '확인 필요' : fmt(q.price, 2) + 'pt'}${q.change === null ? '' : ` (전일 대비 ${fmt(q.change, 2, true)}%)`}`;
  const b = p.breadth, flow = combined(p);
  const breadth = b ? `상승 ${fmt(b.up)}개 · 하락 ${fmt(b.down)}개 · 보합 ${fmt(b.flat)}개. 조회된 ${fmt(b.total)}개 중 상승 비율 ${fmt(b.share, 1)}%.` : '정상 출처의 시장폭 값이 없어 상승·하락 확산을 판단하지 않습니다.';
  let observation = '정상 수급과 시장폭이 함께 확인되면 두 지표의 방향을 비교합니다.';
  if (b && flow !== null) {
    const direction = Math.sign(b.up - b.down);
    observation = direction === 0 || flow === 0 ? '시장폭 또는 합산 수급이 균형입니다. 뚜렷한 동반 방향은 확인되지 않습니다.'
      : direction === Math.sign(flow) ? `시장폭과 외국인·기관 합산 수급이 ${direction > 0 ? '상승 종목 우세·순매수' : '하락 종목 우세·순매도'} 방향으로 일치합니다.`
      : '시장폭과 외국인·기관 합산 수급의 방향이 엇갈립니다. 지수 움직임과 함께 확인하세요.';
  }
  return [{ title: '지수 흐름', text: `${index('코스피', p.kospi)} · ${index('코스닥', p.kosdaq)}.` },
    { title: '시장 내부', text: breadth },
    { title: '투자자 수급', text: `외국인 ${flowText(p.foreign)}, 기관 ${flowText(p.institution)}, 개인 ${flowText(p.individual)}. 당일 누적 기준입니다.` },
    { title: '관찰 포인트', text: observation }];
}

export function briefingSectors(rows: unknown[], date: string, now: Date): BriefingSector[] {
  const clock = kstParts(now), found = new Map<string, BriefingSector>();
  for (const value of rows) {
    const row = record(value), market = String(row.market).toLowerCase();
    if (!['kospi', 'kosdaq'].includes(market) || (row.trade_date && row.trade_date !== date)) continue;
    const time = String(row.time ?? ''), minute = timeToMinute(time);
    if (minute < 540 || minute > 930 || (date === clock.date && minute > clock.minute)) continue;
    for (const value of Array.isArray(row.sectors) ? row.sectors : []) {
      const s = record(value), code = String(s.code ?? '').trim(), name = String(s.name ?? '').trim(), change = numeric(s.change);
      if (!code || !name || change === null || ['0001', '1001'].includes(code) || /^(종합|코스피|코스닥|KOSPI|KOSDAQ)$/i.test(name)) continue;
      // The feed also includes strategy/derivative indices, which are not industries.
      if (/인버스|레버리지|선물|inverse|leverag|futures|^F[-\s]/i.test(name)) continue;
      const key = market + ':' + code;
      if (found.has(key) && timeToMinute(found.get(key)!.time) >= minute) continue;
      found.set(key, { code, name, change, market: market as 'kospi' | 'kosdaq', time, rank: 0, count: 0 });
    }
  }
  const all = [...found.values()].sort((a, b) => b.change - a.change || a.name.localeCompare(b.name, 'ko'));
  return all.map(s => {
    const group = all.filter(x => x.market === s.market);
    return { ...s, rank: group.findIndex(x => x.code === s.code) + 1, count: group.length };
  });
}

export function buildBriefing(date: string, rawRows: unknown[], sectors: unknown[], now = new Date(), warnings: string[] = [], closedReason: string | null = null): Briefing {
  const points = closedReason ? [] : briefingPoints(rawRows, date, now), latest = points.at(-1) ?? null;
  const clock = kstParts(now), notices = [...warnings];
  if (latest) {
    if (!latest.breadth) notices.push('최신 기록의 시장폭 출처 또는 값이 불완전합니다. 직전 값을 현재 값으로 대체하지 않았습니다.');
    if ([latest.foreign, latest.institution, latest.individual].some(x => x === null)) notices.push('최신 기록의 일부 투자자 수급은 확인할 수 없습니다.');
    if ([latest.kospi.price, latest.kosdaq.price].some(x => x === null)) notices.push('최신 기록의 일부 지수를 확인할 수 없습니다.');
    if (date === clock.date && clock.minute >= 540 && clock.minute <= 935 && clock.minute - latest.minute >= 5) notices.push(`마지막 시장 기록은 ${latest.time}입니다. 현재 시각과 차이가 있습니다.`);
    if ((date < clock.date || clock.minute >= 935) && latest.minute < 930) notices.push(`마지막 기록이 ${latest.time}로, 정규장 종가 요약이 아닙니다.`);
    if (points.some((p, i) => i > 0 && p.minute - points[i - 1].minute > 10)) notices.push('시장 기록 사이에 10분이 넘는 공백이 있습니다. 시간대별 요약은 실제 저장 시각을 표시합니다.');
  }
  const picked = new Map<number, BriefingPoint>();
  if (points[0]) picked.set(points[0].minute, points[0]);
  for (let minute = 600; minute <= 900; minute += 60) {
    const at = points.filter(p => p.minute <= minute).at(-1);
    if (at) picked.set(at.minute, at);
  }
  if (latest) picked.set(latest.minute, latest);
  const blocked = latest && date === clock.date && clock.minute >= 540 && clock.minute < 930 && clock.minute - latest.minute >= 5
    ? `마지막 기록(${latest.time})이 5분 이상 지연되어 현재 방향 판단을 보류합니다.` : undefined;
  const insight = interpretBriefing(points, { blocked, historical: date < clock.date || clock.minute >= 930 });
  return { ok: true, date, today: clock.date, generatedAt: now.toISOString(), closedReason, latest,
    headline: latest ? briefingHeadline(latest) : closedReason ? `${closedReason} · 시장 휴장` : '선택한 날짜의 시장 기록이 없습니다',
    summary: latest ? briefingSummaries(latest) : [],
    insight,
    timeline: [...picked.values()].map(p => {
      const at = interpretBriefing(points.filter(row => row.minute <= p.minute), { historical: true });
      return { time: p.time, title: briefingHeadline(p), text: at
        ? at.explanation.map(s => s.text).join(' ') + ` 해당 시점 판단: ${at.outlook.label}. ${at.outlook.text}`
        : briefingSummaries(p).slice(0, 3).map(s => s.text).join(' ') };
    }),
    sectors: closedReason ? [] : briefingSectors(sectors, date, now), count: points.length, firstTime: points[0]?.time ?? null,
    warnings: [...new Set(notices)] };
}

// The existing news feed is a latest-headline feed, not an historical archive.
export function briefingNews(items: NewsItem[], date: string, now = new Date()) {
  if (!isValidDate(date) || date !== kstParts(now).date) return [];
  const seen = new Set<string>();
  return items.filter(item => {
    const published = Date.parse(item.publishedAt);
    if (!Number.isFinite(published) || published > now.getTime() || kstParts(new Date(published)).date !== date || !item.title || seen.has(item.title)) return false;
    try { const url = new URL(item.url); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return false; } catch { return false; }
    seen.add(item.title); return true;
  }).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 6);
}
