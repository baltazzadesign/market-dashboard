"use client";
import {useEffect,useMemo,useState} from 'react';
import {compareAtTime,closingReport} from '@/lib/market-comparison';
import {type MarketRow,type MarketEvent,formatNumber as f} from '@/lib/balta-model';
export default function ComparisonReport({rows,events,date}:{rows:MarketRow[];events:MarketEvent[];date:string}){
 const current=rows.at(-1),time=current?.time;
 const [data,setData]=useState<{key:string;rows:MarketRow[]}>({key:'',rows:[]}),[error,setError]=useState(''),[loading,setLoading]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{
  if(!date||!time)return;const controller=new AbortController();setLoading(true);setError('');
  fetch('/api/market/comparison?date='+date+'&time='+time,{signal:controller.signal}).then(async r=>{const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'조회 실패');if(!controller.signal.aborted)setData({key:date+' '+time,rows:j.rows});}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[date,time,retry]);
 const history=data.key===date+' '+time?data.rows:[];
 const comparison=current?compareAtTime(current,history):[];
 const report=useMemo(()=>closingReport(rows,events,date),[rows,events,date]);
 function download(){const url=URL.createObjectURL(new Blob([report.text],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='market-report-'+date+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <section className="panel" id="closing-report" style={{scrollMarginTop:80}}><div className="panel-header"><h2 className="panel-title">동시간대 비교 · 일일 리포트</h2><button className="button small" disabled={!rows.length} onClick={download}>리포트 저장</button></div><div className="diagnostic-body"><div><h3>{time??'—'} 기준 · 이전 기록과 비교</h3><p>직전 60일에서 같은 시각 기록이 있는 최근 최대 20거래일. 해당 시각이 누락된 날은 제외됩니다.</p>{loading?<p>비교 기록 조회 중…</p>:error?<p role="alert">{error} <button className="button small" onClick={()=>setRetry(v=>v+1)}>다시 조회</button></p>:<><div className="diagnostic-table"><table><thead><tr><th>지표</th><th>선택일</th><th>과거 평균</th><th>평균 대비 차이</th><th>유효 표본</th></tr></thead><tbody>{comparison.map(c=><tr key={c.key}><td>{c.label} ({c.unit})</td><td>{f(c.value,0,true)}</td><td>{f(c.mean,0,true)}</td><td>{f(c.delta,0,true)}</td><td>{c.count}일</td></tr>)}</tbody></table></div><details><summary>비교 날짜 {history.length}일</summary><p>{history.map(r=>r.date).join(', ')||'기록 없음'}</p></details><small>정상 출처만 지표별 집계합니다. 표본이 적거나 수집 누락이 있으면 전체 시장의 평소 수준을 대표하지 않을 수 있습니다.</small></>}</div><details open><summary>{report.complete?'장 마감 리포트':'장중 / 미완료 리포트'}</summary><pre style={{whiteSpace:'pre-wrap',fontFamily:'inherit',fontSize:13,lineHeight:1.9}}>{report.text}</pre></details></div></section>;
}
