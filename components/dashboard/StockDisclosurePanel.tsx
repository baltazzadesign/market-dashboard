'use client';
import {useEffect,useState} from 'react';
import {stockDisclosureUrl,type StockDisclosureMarker,type StockDisclosureResponse} from '@/lib/stock-disclosures';
import {Modal} from './Modal';
import s from './StockDisclosures.module.css';

type StatusProps={data:StockDisclosureResponse|null;loading:boolean;error:string;onRetry:()=>void;onOpen:()=>void};
export default function StockDisclosurePanel({data,loading,error,onRetry,onOpen}:StatusProps){
  return <section className={s.status} aria-label="종목 공시 연결">
    <div className={s.statusHeading}><strong><span aria-hidden="true">◉</span> 공시 연결</strong>{loading?<span role="status">공시를 불러오는 중…</span>:error?<><span role="alert">{error}</span><button onClick={onRetry}>공시 재조회</button></>:data?<><span>{data.partial?'일부 조회 · ':''}{data.items.length.toLocaleString('ko-KR')}건 · {data.start}–{data.end}</span><button onClick={onOpen} disabled={!data.items.length}>공시 목록 보기 ↗</button></>:<span>주가 조회 후 공시를 연결합니다.</span>}</div>
    {data?.warnings.map(w=><p className={s.warning} key={w}>{w} <button onClick={onRetry}>다시 조회</button></p>)}
    {!loading&&!error&&data&&!data.items.length?<p>조회 기간에 DART에서 확인된 공시가 없습니다.</p>:<p>하단 공시 표식을 누르면 원문을 볼 수 있습니다. 촘촘한 공시는 묶어서 표시합니다.</p>}
    <details><summary>공시 표시 기준</summary><p>접수일 기준이며 장중·장후 시각을 구분하지 않습니다. 해당 날짜의 일봉이 없으면 다음 일봉에 표시하며, 다음 일봉도 없으면 공시 목록에서 확인할 수 있습니다. 원문에 적힌 실제 접수일을 함께 확인해 주세요.</p><p>공시와 당일 주가 움직임의 인과관계를 뜻하지 않습니다. 위쪽 재무공시 표식과 현금흐름 차트는 기존의 ‘공시 다음 거래일 반영’ 기준을 사용합니다.</p>{data&&<p>출처: OpenDART · 조회 {new Date(data.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · 최대 1분 캐시</p>}</details>
  </section>;
}
export function StockDisclosureDialog({open,onClose,data,selection}:{open:boolean;onClose:()=>void;data:StockDisclosureResponse|null;selection:StockDisclosureMarker|null}){
  const [query,setQuery]=useState(''),[count,setCount]=useState(30);
  useEffect(()=>{setQuery('');setCount(30);},[open,selection]);
  const items=selection?.items??data?.items??[],filtered=items.filter(f=>(f.name+' '+f.filer+' '+f.date).toLowerCase().includes(query.toLowerCase())).slice().sort((a,b)=>b.date.localeCompare(a.date)||b.receipt.localeCompare(a.receipt));
  const dates=[...new Set(items.map(f=>f.date))].sort();
  return <Modal open={open} onClose={onClose} title="종목 공시"><div className={s.dialog}>
    <div className={s.summary}><strong>{data?.name||'선택 종목'} <small>{data?.code}</small></strong><span>{selection?(dates.length===1?dates[0]:dates[0]+'–'+dates.at(-1)):data?.start+'–'+data?.end} · {items.length}건{data?.partial?' · 일부 조회':''}</span></div>
    {selection&&items.some(f=>!selection.dates.includes(f.date))&&<p className={s.warning}>일봉이 없는 날짜의 공시가 포함되어 있습니다. 차트 표시는 다음 기록일({selection.dates.join(', ')})에 연결했습니다.</p>}
    <p className={s.note}>아래 날짜는 실제 접수일입니다. 제목을 누르면 DART 원문이 새 탭에서 열립니다.</p>
    <label className={s.search}><span>공시 검색</span><input type="search" value={query} placeholder="공시명·제출인·날짜" onChange={e=>{setQuery(e.target.value);setCount(30);}}/></label>
    <ul className={s.list}>{filtered.slice(0,count).map(f=><li key={f.receipt}><a href={stockDisclosureUrl(f.receipt)} target="_blank" rel="noopener noreferrer"><div><time>{f.date}</time>{f.correction&&<span>정정 공시</span>}{f.hasCorrection&&<span>후속 정정 있음</span>}{f.withdrawn&&<span className={s.withdrawn}>철회</span>}</div><strong>{f.name}<b aria-hidden="true">↗</b></strong><small>{f.filer||'제출인 미확인'} · 접수번호 {f.receipt}</small></a></li>)}</ul>
    {!filtered.length&&<p className={s.note}>검색 조건에 맞는 공시가 없습니다.</p>}
    {filtered.length>count&&<button className={s.more} onClick={()=>setCount(n=>n+30)}>더 보기 ({count}/{filtered.length})</button>}
    <p className={s.note}>정정·철회가 표시된 문서는 후속 공시와 원문 내용을 함께 확인해 주세요.</p>
  </div></Modal>;
}
