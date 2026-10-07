"use client";
import { stockFlowSeries, stockFlowTotals, stockInvestors, type StockFlowResponse, type StockFlowMode, type StockFlowUnit, type StockInvestor } from '@/lib/stock-flow-model';
import StockCashFlowChart from './StockCashFlowChart';
import {alignCashTimeline,type CashTimelineResponse,type CashFlowView} from '@/lib/cash-flow-timeline';
import {cashDisplayText} from '@/lib/cash-flow-display';
import StockFlowChart, { flowNumber } from './StockFlowChart';
import ChartImageButton from './ChartImageButton';
import { snapshotPlot } from './chart-image';
import s from './ChartImageButton.module.css';
import type {StockDisclosureDay} from '@/lib/stock-disclosures';

export default function StockChartImageButton({ data, selected, mode, unit, split, showPrice, loading, showCash=false, cashData=null, cashView='quarter', cashLoading=false, cashError='', chartHeight, cashHeight, disclosureDays, disclosureWarnings = [] }: {
  data: StockFlowResponse | null; selected: StockInvestor[]; mode: StockFlowMode; unit: StockFlowUnit; split: boolean; showPrice: boolean; loading: boolean; showCash?:boolean; cashData?:CashTimelineResponse|null; cashView?:CashFlowView; cashLoading?:boolean; cashError?:string; chartHeight?:number; cashHeight?:number;disclosureDays?:StockDisclosureDay[];disclosureWarnings?:string[];
}) {
  return <ChartImageButton title="주가·거래량·선택한 투자자 수급·현금흐름·기간 합계를 PNG로 저장" disabled={loading || !data?.rows.length || showCash&&cashLoading} createJob={() => {
    if (!data?.rows.length) throw new Error('데이터가 없습니다.');
    const values = stockFlowSeries(data.rows, unit, mode), totals = stockFlowTotals(data.rows, unit).filter(c => selected.includes(c.key));
    const last = data.rows.at(-1)!, suffix = unit === 'money' ? '억' : '주', label = mode === 'cumulative' ? '누적 순매수' : '일별 순매수';
    const missing = mode === 'cumulative' && data.rows.some(row => selected.some(key => row[unit][key] === null));
    const cashDays=alignCashTimeline(data.rows.map(r=>r.date),cashData?.code===data.code?cashData.events:[]),cash=cashDays.at(-1)?.event;
    const includeCash=showCash&&cashData?.code===data.code;
    return {
      plots: includeCash?2:1, filename: `baltatool-${data.name}-${data.code}-${data.start}-${data.end}-${mode}-${unit}.png`,
      content: <div className={s.stock}><StockFlowChart rows={data.rows} values={values} selected={selected} unit={unit} mode={mode} split={split} showPrice={showPrice} onSelect={() => {}} cashDays={includeCash?cashDays:undefined} height={chartHeight} disclosureDays={disclosureDays}/>{includeCash&&<StockCashFlowChart days={cashDays} view={cashView} onSelect={()=>{}} height={cashHeight}/>}</div>,
      report: root => ({
        title: `${data.name} (${data.code}) · 종목 수급 분석`,
        subtitle: [`${data.rows[0].date} ~ ${last.date} · ${data.rows.length}개 일봉 · KRX 원주가 · ${split ? '분리보기' : '겹쳐보기'}`, `주가 기준일 ${last.date} · 수급 기준일 ${data.flowAsOf ?? '—'} · ${label} (${unit === 'money' ? '억원' : '주'})`],
        panels: [{ title: '주가 + 투자자 수급', subtitle: `${showPrice ? '주가 표시' : '주가 숨김'} · ${selected.length ? stockInvestors.filter(c => selected.includes(c.key)).map(c => c.label).join(' / ') : '선택한 투자자 없음'}`, metrics: [], plot: snapshotPlot(root.querySelector('svg[data-stock-flow-chart]')), wide: true },
          ...(showCash?[{title:'기업 현금흐름',subtitle:`${last.date} 기준 · ${cash?.label??'공시 미확인'} · ${cashView==='ttm'?'최근 4분기 합계':'단독 분기'} · 금액 단위 자동 표시`,metrics:includeCash?[{label:'영업현금흐름',value:cashDisplayText(cash?.[cashView].operating),color:'#d9b871'},{label:'잉여현금흐름',value:cashDisplayText(cash?.[cashView].fcf),color:'#82ceb0'}]:[],plot:includeCash?snapshotPlot(root.querySelector('svg[data-stock-cash-chart]')):undefined,empty:cashError||'공시를 연결하지 못해 현금흐름을 표시하지 않았습니다.',notes:['공시일 다음 거래일부터 반영 · 정정 전 수치 미확인 구간은 공백 · 일별 발생액이 아닙니다.'],wide:true}]:[]),
          { title: '선택 기간 누적 순매수', subtitle: `선택한 투자자 · ${unit === 'money' ? '억원' : '주'} · 일별 순매수를 기간 합산`, wide: true,
            metrics: totals.map(c => ({ label: c.label + (c.complete ? '' : ` · 확인 ${c.count}/${c.total}일`), value: flowNumber(c.value, unit) + (c.value === null ? '' : suffix), color: c.color })),
            empty: selected.length ? '위 수치는 선택 기간 합계입니다. 일부 날짜가 누락된 항목은 확인된 날짜의 합계만 표시합니다.' : '표시할 투자자가 선택되지 않았습니다.' }],
        notes: [...data.warnings,...disclosureWarnings,...(disclosureDays?['공시 표식: DART 접수일 기준 · 일봉이 없으면 다음 기록일에 표시 · 숫자는 묶인 공시 건수 · 장중/장후 시각을 구분하지 않습니다.']:[]), ...(showCash?(cashData?.warnings??[cashError||'현금흐름 공시를 연결하지 못했습니다.']):[]),...(includeCash?['현금흐름 출처: OpenDART · 현재 조회된 공시와 접수일을 연결한 참고 차트이며 과거 시점의 모든 정정 전 원본을 복원하지 않습니다.']:[]), ...(missing ? ['미제공 날짜부터 누적선을 끊어 표시합니다. 이후 제공된 값은 일별 순매수에서 확인할 수 있습니다.'] : []), `조회 시각 ${new Date(data.asOf).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })} KST · 출처: 한국투자증권 Open API`, '수급은 일별 제공값이며 장중 추정치가 아닙니다. 미제공 값은 —로 표시합니다. 누적 순매수는 보유 잔고가 아닙니다.'],
      }),
    };
  }}/>;
}
