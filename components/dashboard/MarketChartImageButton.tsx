"use client";
import { formatNumber, minuteLabel, sourceLabel, breadthLabel, type MarketRow, type MarketEvent } from '@/lib/balta-model';
import { investorCategories, investorSourceLabel } from '@/lib/investor-flow';
import { buildMarketChartBriefing } from '@/lib/market-chart-briefing';
import MarketChart from './MarketCharts';
import InvestorFlowPanel from './InvestorFlowPanel';
import ChartImageButton from './ChartImageButton';
import { snapshotPlot, type ImagePanel } from './chart-image';
import { chartNames, seriesMap, chartSeriesValue, comparisonBaseline, relativeIndexValue, observedDomain, type ChartKind, type Domain } from './chart-model';
import s from './ChartImageButton.module.css';

const kinds: ChartKind[] = ['flow', 'breadth', 'ratio', 'kospi', 'kosdaq', 'score', 'index', 'accel'];
export default function MarketChartImageButton({ rows, date, domain, events = [], markers = false, loading = false, warning = '' }: {
  rows: MarketRow[]; date: string; domain?: Domain; events?: MarketEvent[]; markers?: boolean; loading?: boolean; warning?: string;
}) {
  return <ChartImageButton label="전체 차트 PNG 저장" title="기본 차트 8개 + 투자자 세부 수급 + 시장 브리핑을 한 장으로 저장 · KOSPI + KOSDAQ 합산" disabled={loading || !date || !rows.length} createJob={() => {
    const bounds = domain ?? observedDomain(rows), visible = rows.filter(row => row.minute >= bounds[0] && row.minute <= bounds[1]);
    const last = visible.at(-1), latest = rows.at(-1), base = comparisonBaseline(rows);
    const flow = last?.investorFlows?.combined;
    const hasDetails = visible.some(row => investorCategories.some(c => row.investorFlows?.combined.values[c.key] != null));
    const time = minuteLabel(bounds[0]) + '–' + minuteLabel(bounds[1]);
    const suffix = `구간 마지막 기록 ${last?.time ?? '—'}`;
    const briefing = buildMarketChartBriefing(rows, date, bounds);
    return {
      filename: `baltatool-${date}-${minuteLabel(bounds[0]).replace(':','')}-${minuteLabel(bounds[1]).replace(':','')}-all-charts.png`,
      plots: hasDetails ? 9 : 8,
      content: <div className={s.grid}>{kinds.map(kind => <section key={kind} data-image-kind={kind}><MarketChart rows={rows} kind={kind} domain={bounds} events={events} showMarkers={markers} compact hideMeta syncGroup="balta-image-export"/></section>)}<div className={s.investors}><InvestorFlowPanel rows={rows} date={date} domain={bounds} initialSelected={investorCategories.map(c => c.key)}/></div></div>,
      report: root => {
        const panels: ImagePanel[] = kinds.map(kind => {
          const index = kind === 'index';
          const subtitle = index ? `변화율 (%) · ${base?.time ?? '—'} = 0% · 전일 대비 아님` : kind === 'flow' ? '누적 순매수 · 억원 · KOSPI + KOSDAQ 합산' : kind === 'score' ? '상승 비율 − 하락 비율 · 보합 포함 · 점' : kind === 'ratio' ? '전체 종목 중 상승·하락 비율 · %' : kind === 'breadth' ? '상승 종목 수 − 하락 종목 수 · 개' : kind === 'accel' ? '가속도 · 개 · 청록색 0 기준선' : '시장 지수 · pt';
          const dataSource = kind === 'flow' ? sourceLabel(last?.flowSource ?? 'EMPTY') : ['breadth','ratio','score','accel'].includes(kind) ? breadthLabel(last?.breadthSource ?? 'EMPTY') : '';
          return {
            title: chartNames[kind], subtitle,
            metrics: seriesMap[kind].map(series => {
              const value = index ? relativeIndexValue(last, series, base) : chartSeriesValue(last, series);
              return { label: series.name, value: formatNumber(value, index ? 2 : series.digits ?? 0, index || series.signed) + (value === null ? '' : index ? '%' : series.unit ?? ''), color: series.color };
            }),
            plot: snapshotPlot(root.querySelector(`[data-image-kind="${kind}"] .chart-plot svg.recharts-surface`)),
            notes: [suffix + (dataSource ? ' · ' + dataSource : ''), ...(!visible.some(row => seriesMap[kind].some(series => chartSeriesValue(row, series) !== null)) ? ['이 구간에 표시할 기록이 없습니다.'] : [])],
          };
        });
        panels.push({
          title: '투자자 세부 수급', subtitle: 'KOSPI + KOSDAQ 합산 · 누적 순매수 · 억원 · 8개 항목 모두 표시', wide: true,
          metrics: investorCategories.map(c => ({ label: c.label, value: formatNumber(flow?.values[c.key], 0, true), color: c.color })),
          plot: snapshotPlot(root.querySelector('[data-investor-panel] svg.recharts-surface')),
          empty: '표시할 세부 수급 기록이 없습니다. 미수집·오류 값은 ‘—’로 표시합니다.',
          notes: [suffix + ' · ' + investorSourceLabel(flow?.source), '두 시장의 값이 모두 있을 때만 항목별 합산 · 미수집 구간은 선을 연결하지 않습니다.'],
        });
        return { title: '시장 차트 전체 + 투자자 세부 수급 + 시장 브리핑', subtitle: [`${date} · ${time} KST · 마지막 수집 ${latest?.time ?? '—'} · 표시 구간 ${visible.length}개 기록`, '기본 차트 8개 + 세부 수급 + 시장 브리핑 · 고정 2열 배치 · 신호 표시 ' + (markers ? '켜짐' : '꺼짐')], panels, briefing,
          notes: [...(warning ? ['조회 안내: ' + warning] : []), '출처: 발타툴에 저장된 시장 기록 · 시간은 앱 수집 시각(KST) · 미수집·오류 값은 —, 선은 연결하지 않음', '수급은 제공된 누적 순매수이며 장후 거래만의 수급을 뜻하지 않습니다. 기관 세부 항목 합계를 기관 총액으로 해석하지 않습니다.'] };
      },
    };
  }}/>;
}
