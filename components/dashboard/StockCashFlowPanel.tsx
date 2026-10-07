'use client';
import {cashAmount,disclosureUrl,type CashTimelineDay,type CashTimelineResponse,type CashFlowView} from '@/lib/cash-flow-timeline';
import StockCashFlowChart from './StockCashFlowChart';
import {Modal} from './Modal';
import s from './StockCashFlow.module.css';
const percentage=(v:number|null|undefined)=>v==null?'—':v.toLocaleString('ko-KR',{maximumFractionDigits:1})+'%';
export function CashFlowMetrics({day,view}:{day:CashTimelineDay|undefined;view:CashFlowView}){
  const e=day?.event,m=e?.[view];
  return <><div className={s.metricGrid}><div><span>영업현금흐름</span><strong>{cashAmount(m?.operating)}<small>억원</small></strong></div><div><span>잉여현금흐름</span><strong>{cashAmount(m?.fcf)}<small>억원</small></strong></div></div><p className={s.meta}>{e?`${e.label}까지 · ${e.basis==='CFS'?'연결':'별도'} · ${view==='ttm'?'최근 4분기 합계':'단독 분기'}`:'선택일 이전에 확인된 공시 없음'}</p></>;
}
export default function StockCashFlowPanel({days,data,view,onView,activeIndex,onSelect,loading,error,onRetry}:{days:CashTimelineDay[];data:CashTimelineResponse|null;view:CashFlowView;onView:(view:CashFlowView)=>void;activeIndex:number|null;onSelect:(index:number)=>void;loading:boolean;error:string;onRetry:()=>void}){
  const day=days[Math.min(activeIndex??days.length-1,days.length-1)];
  return <section className={s.panel} aria-label="기업 현금흐름 보조차트">
    <div className={s.heading}><div><span className={s.kicker}>수급과 함께 보는 기업의 현금</span><h3>기업 현금흐름</h3></div><div className={s.segment} role="group" aria-label="현금흐름 계산 방식"><button aria-pressed={view==='quarter'} onClick={()=>onView('quarter')}>단독 분기</button><button aria-pressed={view==='ttm'} onClick={()=>onView('ttm')}>최근 4분기</button></div></div>
    {loading?<div className={s.state} role="status">현금흐름과 공시 날짜를 연결하고 있습니다…</div>:error?<div className={s.state} role="alert"><p>{error}</p><button onClick={onRetry}>현금흐름 재조회</button></div>:<>
      <div className={s.readout}><span>{day?.date??'—'} 기준</span><CashFlowMetrics day={day} view={view}/></div>
      <StockCashFlowChart days={days} view={view} activeIndex={activeIndex} onSelect={onSelect}/>
      <div className={s.legend}><span><i/>영업현금흐름</span><span><i/>잉여현금흐름</span><small>공시 이후 갱신 · 일별 발생액이 아닙니다</small></div>
      {day?.event?.reason&&<p className={s.note}>{day.event.reason}</p>}
      {view==='ttm'&&day?.event&&!day.event.reason&&day.event.ttm.operating===null&&<p className={s.note}>연속된 4개 분기의 당시 수치를 모두 확인할 수 없어 합계를 보류합니다.</p>}
      <p className={s.note}>공시일 다음 거래일부터 반영합니다. 새 공시가 없으면 수평으로 유지하며 미확인 구간은 연결하지 않습니다.</p>
      <details className={s.details}><summary>공시 연결 기준·조회 상태</summary><p>공시 표식은 다음 거래일에 배치합니다. 표식을 선택하면 실제 접수일과 원문을 확인할 수 있습니다. 현금흐름은 억원 단위이며 수급의 금액·수량 선택과 독립적입니다.</p><p>현재 조회된 보고서의 접수번호를 날짜와 연결합니다. 정정 전 원본 수치를 복원하지 못한 구간은 비워두므로 완전한 과거 시점 데이터나 백테스트 결과를 제공하는 화면은 아닙니다.</p>{data?.warnings.map(w=><p key={w}>{w}</p>)}{data&&<p>출처: OpenDART · 재무 조회 {new Date(data.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</p>}</details>
    </>}
  </section>;
}
export function StockCashFlowDetail({day,view}:{day:CashTimelineDay|undefined;view:CashFlowView}){
  const e=day?.event;
  return <div className={s.detail} data-cash-detail><p className={s.meta}>{day?.date??'—'}에 반영 가능한 공시 기준</p><CashFlowMetrics day={day} view={view}/><dl><div><dt>현금전환율</dt><dd>{percentage(e?.[view].conversion)}</dd></div>{view==='quarter'&&<><div><dt>영업현금 전년 동기 증감</dt><dd>{cashAmount(e?.yoyOperating,true)}<small>억원</small></dd></div><div><dt>잉여현금 전년 동기 증감</dt><dd>{cashAmount(e?.yoyFcf,true)}<small>억원</small></dd></div></>}</dl>{e?.reason&&<p className={s.note}>{e.reason}</p>}{e&&<details className={s.details}><summary>계산에 사용한 공시 원문</summary>{e.sources.length?e.sources.map(f=><a key={f.receipt} href={disclosureUrl(f.receipt)} target="_blank" rel="noopener noreferrer">{f.label}{f.correction?' · 정정':''} · {f.date} ↗</a>):<p>해당 시점의 계산 근거를 확인할 수 없습니다.</p>}</details>}</div>;
}
export function StockCashFilingDialog({day,view,onClose}:{day:CashTimelineDay|null;view:CashFlowView;onClose:()=>void}){
  return <Modal open={!!day} onClose={onClose} title="현금흐름 공시"><div className={s.dialog}>{day&&<><p className={s.meta}>차트 반영 {day.date} · 실제 접수일은 아래 원문별로 표시됩니다.</p><CashFlowMetrics day={day} view={view}/>{day.filings.map(f=><a key={f.receipt} href={disclosureUrl(f.receipt)} target="_blank" rel="noopener noreferrer"><strong>{f.name}</strong><span>{f.date} 접수 · 원문 보기 ↗</span></a>)}{day.event?.reason&&<p className={s.note}>{day.event.reason}</p>}</>}</div></Modal>;
}
