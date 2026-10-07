'use client';
import {disclosureUrl,type CashTimelineDay,type CashTimelineResponse,type CashFlowView} from '@/lib/cash-flow-timeline';
import {cashDisplay,cashDisplayText} from '@/lib/cash-flow-display';
import StockCashFlowChart from './StockCashFlowChart';
import StockChartResizeHandle from './StockChartResizeHandle';
import {stockChartDefaults,stockChartLimits} from './useStockChartSize';
import {Modal} from './Modal';
import s from './StockCashFlow.module.css';
const percentage=(v:number|null|undefined)=>v==null?'—':v.toLocaleString('ko-KR',{maximumFractionDigits:1})+'%';
const modeLabel=(view:CashFlowView)=>view==='ttm'?'최근 4분기 합계':'단독 분기';
function Period({day,view}:{day:CashTimelineDay|undefined;view:CashFlowView}){
  const e=day?.event;
  return <div className={s.period}><span>실적 기준</span><strong>{e?e.label+(view==='ttm'?'까지':''):'공시 미확인'}</strong><p>{e?.basis==='CFS'?'연결':e?.basis==='OFS'?'별도':'—'} · {modeLabel(view)}</p><small>차트 선택일 {day?.date??'—'}</small></div>;
}
export function CashFlowMetrics({day,view}:{day:CashTimelineDay|undefined;view:CashFlowView}){
  const m=day?.event?.[view];
  return <div className={s.metricGrid}>{([['operating','영업현금흐름'],['fcf','잉여현금흐름']] as const).map(([key,label])=>{const d=cashDisplay(m?.[key]);return <div className={s.metric} key={key}><span><i/>{label}</span><strong title={d.exact}>{d.value}<small>{d.unit}</small></strong><p>{view==='ttm'?'연속 4분기 합계':'단독 3개월 발생액'}</p></div>;})}</div>;
}
export default function StockCashFlowPanel({days,data,view,onView,activeIndex,onSelect,loading,error,onRetry,height=216,onHeightChange,onFilingSelect}:{days:CashTimelineDay[];data:CashTimelineResponse|null;view:CashFlowView;onView:(view:CashFlowView)=>void;activeIndex:number|null;onSelect:(index:number)=>void;loading:boolean;error:string;onRetry:()=>void;height?:number;onHeightChange?:(height:number)=>void;onFilingSelect?:(index:number)=>void}){
  const day=days[Math.min(activeIndex??days.length-1,days.length-1)];
  const filings=days.flatMap((d,index)=>d.filings.map(f=>({f,index})));
  return <section className={s.panel} aria-label="기업 현금흐름 보조차트">
    <div className={s.heading}><div className={s.title}><span aria-hidden="true">↳</span><h3>기업 현금흐름</h3><small>공시 기준</small></div><div className={s.segment} role="group" aria-label="현금흐름 계산 방식"><button aria-pressed={view==='quarter'} onClick={()=>onView('quarter')}>단독 분기</button><button aria-pressed={view==='ttm'} onClick={()=>onView('ttm')}>최근 4분기</button></div></div>
    {loading?<div className={s.state} role="status">현금흐름과 공시 날짜를 연결하고 있습니다…</div>:error?<div className={s.state} role="alert"><p>{error}</p><button onClick={onRetry}>현금흐름 재조회</button></div>:<>
      <div className={s.summary} data-cash-summary><Period day={day} view={view}/><CashFlowMetrics day={day} view={view}/></div>
      <div className={s.legend}><span><i/>영업현금흐름</span><span><i/>잉여현금흐름</span><small>날짜를 가리키면 수치가 함께 바뀝니다</small></div>
      <StockCashFlowChart days={days} view={view} activeIndex={activeIndex} onSelect={onSelect} height={height}/>
      {onHeightChange&&<StockChartResizeHandle value={height} min={stockChartLimits.cash[0]} max={stockChartLimits.cash[1]} onChange={onHeightChange} onReset={()=>onHeightChange(stockChartDefaults.cash)} label="현금흐름 차트 높이"/>}
      {filings.length>0&&<div className={s.filings} aria-label="표시 구간의 현금흐름 공시"><span>공시 원문</span>{filings.map(({f,index})=><button key={f.receipt} onClick={()=>{onSelect(index);onFilingSelect?.(index);}} title={`${f.date} 접수 · ${f.name}`}><time>{f.date.slice(5).replace('-','.')}</time><span>{f.quarter}분기{f.correction?' 정정':''}</span><b aria-hidden="true">↗</b></button>)}</div>}
      {day?.event?.reason&&<p className={s.warning}>{day.event.reason}</p>}
      {view==='ttm'&&day?.event&&!day.event.reason&&day.event.ttm.operating===null&&<p className={s.warning}>연속된 4개 분기의 당시 수치를 모두 확인할 수 없어 합계를 보류합니다.</p>}
      <div className={s.footnote}><span>공시 다음 거래일부터 반영 · 일별 발생액 아님</span><details className={s.details}><summary>표시 기준·조회 상태</summary><p>새 공시 전까지 수평으로 유지하며 미확인 구간은 연결하지 않습니다. 표식과 공시 버튼을 선택하면 실제 접수일과 원문을 확인할 수 있습니다.</p><p>금액은 크기에 따라 억원·조원으로 표시합니다. 수급의 금액·수량 선택과 독립적이며, 카드의 숫자에 마우스를 올리면 원 단위 금액을 확인할 수 있습니다.</p><p>현재 조회된 보고서의 접수번호를 날짜와 연결합니다. 정정 전 원본 수치를 복원하지 못한 구간은 비워두므로 완전한 과거 시점 데이터나 백테스트 결과를 제공하는 화면은 아닙니다.</p>{data?.warnings.map(w=><p key={w}>{w}</p>)}{data&&<p>출처: OpenDART · 재무 조회 {new Date(data.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</p>}</details></div>
    </>}
  </section>;
}
export function StockCashFlowDetail({day,view}:{day:CashTimelineDay|undefined;view:CashFlowView}){
  const e=day?.event;
  return <div className={s.detail} data-cash-detail><p className={s.meta}>{e?e.label+(view==='ttm'?'까지':''):'공시 미확인'} · {modeLabel(view)}</p><div className={s.conversion}><span>현금전환율</span><strong>{percentage(e?.[view].conversion)}</strong><small>영업현금 ÷ 양수인 순이익</small></div>{view==='quarter'&&<div className={s.comparison}><span>전년 동기 대비 · 증감 금액</span><dl><div><dt><i/>영업현금흐름</dt><dd title={cashDisplay(e?.yoyOperating).exact}>{cashDisplayText(e?.yoyOperating,true)}</dd></div><div><dt><i/>잉여현금흐름</dt><dd title={cashDisplay(e?.yoyFcf).exact}>{cashDisplayText(e?.yoyFcf,true)}</dd></div></dl></div>}<p className={s.meta}>차트 선택일 {day?.date??'—'}<br/>해당 날짜에 반영 가능한 공시 기준</p>{e?.reason&&<p className={s.warning}>{e.reason}</p>}{e&&<details className={s.details}><summary>계산에 사용한 공시 원문</summary>{e.sources.length?e.sources.map(f=><a key={f.receipt} href={disclosureUrl(f.receipt)} target="_blank" rel="noopener noreferrer">{f.label}{f.correction?' · 정정':''} · {f.date} ↗</a>):<p>해당 시점의 계산 근거를 확인할 수 없습니다.</p>}</details>}</div>;
}
export function StockCashFilingDialog({day,view,onClose}:{day:CashTimelineDay|null;view:CashFlowView;onClose:()=>void}){
  return <Modal open={!!day} onClose={onClose} title="현금흐름 공시"><div className={s.dialog}>{day&&<><Period day={day} view={view}/><CashFlowMetrics day={day} view={view}/><p className={s.meta}>차트 반영 {day.date} · 실제 접수일은 아래 원문별로 표시됩니다.</p>{day.filings.map(f=><a key={f.receipt} href={disclosureUrl(f.receipt)} target="_blank" rel="noopener noreferrer"><strong>{f.name}</strong><span>{f.date} 접수 · 원문 보기 ↗</span></a>)}{day.event?.reason&&<p className={s.warning}>{day.event.reason}</p>}</>}</div></Modal>;
}
