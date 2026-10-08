import type { CashFlowResponse } from './cash-flow-model';
import type { QuarterCashFlowResponse } from './cash-flow-quarter';
import type { ChartImageReport, ImageMetric } from '@/components/dashboard/chart-image';

export type CashFlowImageData = CashFlowResponse | QuarterCashFlowResponse;
export type CashFlowChartRow = { year: string; 영업: number | null; 투자: number | null; 재무: number | null; 잉여현금: number | null };
export const CASH_FLOW_COLORS = { operating: '#d9b871', investing: '#8299b4', financing: '#b29ac8', fcf: '#82ceb0' };
const number = (v: number) => v.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
const money = (v: number | null) => v === null ? '—' : number(v / 1e8);
const amount = (v: number | null) => v === null ? '—' : money(v) + '억원';
const percent = (v: number | null) => v === null ? '—' : number(v) + '%';
const delta = (v: number | null) => v === null ? '—' : (v > 0 ? '+' : '') + amount(v);
const sign = (v: number | null) => v === null ? '?' : v > 0 ? '+' : v < 0 ? '−' : '0';

// Values and analysis come from the loaded response. Export does not fetch data
// or recompute quarterly cash flows, TTM, or the annual three-year score.
export function buildCashFlowImage(data: CashFlowImageData, requestedRange: number): {
  filename: string; charts: CashFlowChartRow[]; report: ChartImageReport;
} {
  const quarter = 'quarters' in data;
  const range = quarter ? (requestedRange === 4 ? 4 : 8) : (requestedRange === 3 ? 3 : 5);
  const allRows = 'quarters' in data ? data.quarters : data.years.map(row => ({
    ...row, period: String(row.year), label: row.year + ' 사업연도', previousReceipt: null, calculation: '',
  }));
  const rows = allRows.slice(-range), latest = rows.at(-1);
  if (!latest) throw new Error('저장할 현금흐름 데이터가 없습니다.');
  const label = quarter ? '분기' : '연간', mode = quarter ? 'quarter' : 'annual';
  const displayRange = `${rows[0].period} ~ ${latest.period}`;
  const analysis = data.analysis;
  const metrics: ImageMetric[] = [
    { label: '영업현금흐름', value: amount(latest.operating), color: CASH_FLOW_COLORS.operating },
    { label: '잉여현금흐름 (FCF)', value: amount(latest.fcf), color: CASH_FLOW_COLORS.fcf },
    { label: '현금전환율', value: percent(latest.conversion), color: '#e3dac0' },
    { label: '순재무 유입 비중', value: percent(latest.fundingShare), color: CASH_FLOW_COLORS.financing },
  ];
  const sections = [{ title: '핵심 해석', text: analysis.summary.join(' ') || '필요한 공시 데이터를 확인한 뒤 분석합니다.' }];
  if ('quarters' in data) {
    const { yoy, ttm } = data.analysis;
    sections.push(
      { title: '전년 동기 비교', text: `${yoy.label} · 영업현금 ${delta(yoy.operating)} · 잉여현금 ${delta(yoy.fcf)}\n영업현금 증감률 ${percent(yoy.operatingPercent)} · ${analysis.change}` },
      { title: '최근 4분기 합산', text: `${ttm.label}\n영업현금 ${amount(ttm.operating)} · 잉여현금 ${amount(ttm.fcf)} · 현금전환율 ${percent(ttm.conversion)}\n연속된 4개 분기의 확인 가능한 계정만 합산합니다.` },
    );
  } else {
    sections.push({ title: '현금흐름 점수', text: `${analysis.score ?? '—'} / 100 · ${analysis.scoreReason}\n전년 대비 점수 변화 · ${analysis.change}` });
    if (analysis.parts.length) sections.push({ title: '점수 구성', text: analysis.parts.map(p => `${p.label} ${p.points} / ${p.max} · ${p.detail}`).join('\n') });
  }
  sections.push({ title: '기간별 구조', text: rows.map(r => `${r.period} · ${r.regime} · 영업 ${sign(r.operating)} / 투자 ${sign(r.investing)} / 재무 ${sign(r.financing)} · ${r.basis === 'CFS' ? '연결' : '별도'} · ${r.status === 'ok' ? '조회 완료' : r.status === 'error' ? '조회 실패' : '공시 미확인·계산 보류'}`).join('\n') });
  sections.push({ title: '위험·추가 확인', text: analysis.risks.join('\n') || '공시 원문에서 세부 조건을 확인하세요.' });
  if (!quarter && latest.fundingItems.length) sections.push({ title: '조달 계정', text: latest.fundingItems.map(r => `${r.kind} · ${r.account} · ${amount(r.value)}`).join('\n') + '\n상·하위 계정 중복 가능성이 있어 합산하지 않습니다.' });
  const warnings = [...new Set(data.warnings), ...rows.flatMap(r => [...new Set(r.warnings)].map(w => `${r.period} · ${w}`))];
  if (warnings.length) sections.push({ title: '데이터 확인', text: warnings.join('\n') });
  sections.push({ title: '공시 접수번호', text: rows.map(r => `${r.period} · ${quarter ? '당기' : '원문'} ${r.receipt ?? '—'}${quarter ? ' · 직전 누적 ' + (r.previousReceipt ?? '—') : ''}${r.calculation ? '\n계산: ' + r.calculation : ''}`).join('\n') });
  const method = quarter
    ? '단독 분기: Q1 그대로, Q2 반기−Q1, Q3 3분기 누적−반기, Q4 연간−3분기 누적. 같은 연도·재무제표 기준의 직전 공시가 없으면 계산을 보류합니다. 누적 취득액 감소·부호 변경 시 취득액과 FCF도 보류합니다. 12월 결산 기업 기준이며 정정·재분류 영향은 원문을 확인하세요.'
    : '점수는 최근 3개 사업연도의 필수 계정과 업종이 확인될 때 계산하며, 표시 기간(3년·5년)을 바꿔도 달라지지 않습니다. 순이익이 0 이하이면 현금전환율은 계산하지 않고 해당 점수는 0점입니다. 전년 대비 ±10점 이상을 개선·악화로 표시합니다.';
  const fetched = new Date(data.fetchedAt);
  const fetchedAt = Number.isNaN(fetched.getTime()) ? '확인 불가' : fetched.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
  return {
    filename: `baltatool-cash-flow-${data.code}-${mode}-${rows[0].period}-${latest.period}.png`,
    charts: rows.map(r => ({ year: r.period.replace('-', ' '), 영업: r.operating === null ? null : r.operating / 1e8, 투자: r.investing === null ? null : r.investing / 1e8, 재무: r.financing === null ? null : r.financing / 1e8, 잉여현금: r.fcf === null ? null : r.fcf / 1e8 })),
    report: {
      title: `${data.name} · 기업 현금흐름 (${label})`,
      subtitle: [`${data.code} · ${data.basis === 'CFS' ? '연결' : '별도'}재무제표 · ${quarter ? '단독 분기 · 각 3개월 금액' : '사업연도별 금액'} · ${displayRange}`, `표시 ${rows.length}개 ${quarter ? '분기' : '사업연도'} · 조회 ${fetchedAt} KST · 출처 OpenDART`],
      panels: [{ title: '현금의 흐름', subtitle: `주요 지표: ${latest.label} 기준 · 금액 단위 억원`, metrics, wide: true, notes: ['막대: 영업(금색) · 투자(청색) · 재무(보라색) / 선: 잉여현금(민트색)', '미확인 값은 0으로 대체하지 않으며, 잉여현금의 빈 구간은 선을 연결하지 않습니다.'] }],
      tables: [{ title: `${quarter ? '분기별' : '연간'} 수치표`, subtitle: '금액: 억원 · 취득액: 유형·무형자산 취득 합계 · —: 미확인 또는 계산 불가', columns: [
        { label: quarter ? '분기' : '사업연도', weight: 1.05 },
        { label: '영업', align: 'right', color: CASH_FLOW_COLORS.operating },
        { label: '투자', align: 'right', color: CASH_FLOW_COLORS.investing },
        { label: '재무', align: 'right', color: CASH_FLOW_COLORS.financing },
        { label: '순이익', align: 'right' }, { label: '취득액', align: 'right' },
        { label: '잉여현금', align: 'right', color: CASH_FLOW_COLORS.fcf },
        { label: '현금전환율', align: 'right' },
      ], rows: rows.map(r => [r.period, ...[r.operating, r.investing, r.financing, r.netIncome, r.capex, r.fcf].map(money), percent(r.conversion)]) }],
      briefing: { title: '현금흐름 해석', badge: 'OpenDART · 공시 기반', subtitle: [latest.label + ' 기준 · 저장 버튼을 누른 시점의 조회 결과'], headline: latest.regime, sections, notes: [method, 'FCF = 영업현금 − 유형·무형자산 취득액. 두 취득 계정이 모두 확인될 때 계산하며 기업 인수·금융자산 투자·리스 지출 등은 제외합니다.', '현금전환율 = 영업현금 ÷ 양수인 순이익. 순재무 유입 비중 = 양수인 재무현금 ÷ 양수인 활동별 순현금 유입 합계로, 총차입금이나 외부자금 의존도를 뜻하지 않습니다.', '현금흐름의 부호 조합은 유형 분류이며 성장 단계나 상장폐지 가능성을 확정하지 않습니다.'] },
      notes: ['원문: https://dart.fss.or.kr/dsaf001/main.do?rcpNo=접수번호 (위 번호를 대입)', `조회 결과는 최대 6시간 재사용될 수 있습니다. · baltatool.com/cash-flow?code=${data.code}&period=${mode}`],
    },
  };
}
