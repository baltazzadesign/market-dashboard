import { formatNumber as fmt, minuteLabel, numeric, type MarketRow } from './balta-model';
import { briefingHeadline, briefingSummaries, type BriefingPoint } from './market-briefing';
import { investorCategories } from './investor-flow';

export type ChartBriefing = {
  title: string; subtitle: string[]; headline: string;
  sections: { title: string; text: string }[]; notes: string[];
};
const sessions: Record<string, string> = { REGULAR: '정규장', AFTER_HOURS_CLOSE: '장후 종가', KRX_AFTER_MARKET: '애프터마켓', OLD_AFTER_HOURS_SINGLE_PRICE: '시간외 단일가', CLOSED: '장 종료', UNKNOWN: '세션 확인 필요' };

/** Pure snapshot: never fetch newer briefing data while the PNG is rendering. */
export function buildMarketChartBriefing(rows: MarketRow[], date: string, bounds: readonly [number, number]): ChartBriefing {
  const visible = rows.filter(r => r.date === date && r.minute >= bounds[0] && r.minute <= bounds[1]).sort((a, b) => a.minute - b.minute);
  const last = visible.at(-1), first = visible[0], range = `${minuteLabel(bounds[0])}–${minuteLabel(bounds[1])}`;
  const subtitle = [`${date} · 표시 구간 ${range} KST · 요약 기준 ${last?.time ?? '—'} · ${visible.length}개 기록`];
  if (!last) return { title: '시장 브리핑', subtitle, headline: '선택 구간의 시장 기록이 없습니다', sections: [], notes: ['구간 밖의 기록으로 브리핑을 대체하지 않습니다.'] };

  const price = (value: unknown) => { const n = numeric(value); return n !== null && n > 0 ? n : null; };
  const total = last.up + last.down + last.flat;
  const breadth = last.breadthSource === 'LIVE' && [last.up, last.down, last.flat].every(n => Number.isInteger(n) && n >= 0) && total > 0
    ? { up: last.up, down: last.down, flat: last.flat, total, share: last.up / total * 100 } : null;
  // Normalized chart rows have index levels, but not a verified previous close.
  const p: BriefingPoint = { time: last.time, minute: last.minute,
    kospi: { price: price(last.kospi), change: null }, kosdaq: { price: price(last.kosdaq), change: null }, breadth,
    foreign: last.flowSource === 'LIVE' ? numeric(last.foreignFlow) : null,
    institution: last.flowSource === 'LIVE' ? numeric(last.instFlow) : null,
    individual: last.flowSource === 'LIVE' ? numeric(last.indivFlow) : null };
  const sections = briefingSummaries(p);
  const index = (key: 'kospi' | 'kosdaq', label: string) => {
    const value = p[key].price, start = price(first[key]);
    const change = value !== null && start !== null && first.minute < last.minute && visible.every(r => r.session === last.session) ? (value / start - 1) * 100 : null;
    return `${label} ${value === null ? '확인 필요' : fmt(value, 2) + 'pt'}${change === null ? '' : ` (${first.time} 대비 ${fmt(change, 2, true)}%)`}`;
  };
  sections[0] = { title: '지수 흐름', text: `${index('kospi', '코스피')} · ${index('kosdaq', '코스닥')}. 변화율은 표시 구간 첫 기록 대비이며 전일 대비가 아닙니다.` };

  const detail = last.investorFlows?.combined;
  if (detail && ['LIVE', 'PARTIAL'].includes(detail.source)) {
    const known = investorCategories.flatMap(c => {
      const value = numeric(detail.values[c.key]);
      return value === null ? [] : [{ name: c.label, value }];
    });
    const buy = [...known].filter(x => x.value > 0).sort((a, b) => b.value - a.value)[0];
    const sell = [...known].filter(x => x.value < 0).sort((a, b) => a.value - b.value)[0];
    if (buy || sell) sections.push({ title: '세부 수급', text: `조회된 ${known.length}개 항목 중 ${[
      buy ? `${buy.name}이 순매수 최대(${fmt(buy.value, 0, true)}억원)` : '',
      sell ? `${sell.name}이 순매도 최대(${fmt(sell.value, 0, true)}억원)` : '',
    ].filter(Boolean).join(', ')}입니다.${detail.source === 'PARTIAL' ? ' 일부 항목이 누락되어 전체 항목의 순위는 아닙니다.' : ''}` });
  }
  const notes = [`${sessions[last.session] ?? '세션 확인 필요'} · 저장 버튼을 누른 시점의 차트 기록으로 생성한 자동 요약입니다.`];
  if (!breadth) notes.push('시장폭은 정상 출처를 확인할 수 없어 판단에서 제외했습니다.');
  if ([p.foreign, p.institution, p.individual].some(v => v === null)) notes.push('확인되지 않은 수급과 직전 값 유지 상태는 현재 순매수·순매도로 판단하지 않았습니다.');
  if (p.kospi.price === null || p.kosdaq.price === null) notes.push('일부 지수 값은 확인되지 않았습니다.');
  if (visible.some(r => r.session !== last.session)) notes.push(`여러 거래 세션이 포함된 구간입니다. 요약은 마지막 기록의 ${sessions[last.session] ?? '확인되지 않은 세션'} 기준이며 세션 간 지수 변화율은 계산하지 않습니다.`);
  if (last.session !== 'REGULAR') notes.push('수급은 제공된 누적 값으로, 장후 거래만의 수급을 뜻하지 않습니다.');
  return { title: '시장 브리핑', subtitle, headline: briefingHeadline(p), sections, notes };
}
