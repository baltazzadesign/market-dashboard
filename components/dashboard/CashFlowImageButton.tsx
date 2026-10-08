'use client';
import { buildCashFlowImage, type CashFlowImageData } from '@/lib/cash-flow-image';
import CashFlowChart from './CashFlowChart';
import ChartImageButton from './ChartImageButton';
import { snapshotPlot } from './chart-image';

export default function CashFlowImageButton({ data, range, quarter, loading }: {
  data: CashFlowImageData | null; range: number; quarter: boolean; loading: boolean;
}) {
  const hasRows = data && ('quarters' in data ? data.quarters.length : data.years.length) > 0;
  return <ChartImageButton label={quarter ? '분기 PNG 저장' : '연간 PNG 저장'}
    title="현재 표시 기간의 차트·주요 지표·수치표·분석을 PNG 한 장으로 저장합니다."
    disabled={loading || !hasRows} createJob={() => {
      if (!data) throw new Error('현금흐름 데이터가 없습니다.');
      // Clone before staging: switching stock/period or refreshing cannot mix data.
      const snapshot = buildCashFlowImage(structuredClone(data), range);
      return {
        plots: 1, filename: snapshot.filename,
        content: <div style={{ width: 1336, height: 420 }}><CashFlowChart rows={snapshot.charts} exporting/></div>,
        report: root => {
          const plot = snapshotPlot(root.querySelector<SVGSVGElement>('svg.recharts-surface'));
          if (!plot) throw new Error('현금흐름 차트가 준비되지 않았습니다. 다시 저장해 주세요.');
          return { ...snapshot.report, panels: snapshot.report.panels.map((panel, i) => i === 0 ? { ...panel, plot } : panel) };
        },
      };
    }}/>
}
