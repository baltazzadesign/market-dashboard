'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { kstParts } from '@/lib/balta-model';
import { monthWeekdaySlots } from '@/lib/market-calendar';
import { investorLabel, rankingAmount, type RankingMarket } from '@/lib/investor-ranking';
import type { StockInvestor } from '@/lib/stock-flow-model';
import { defaultFlowWatchCriteria, flowWatchCSV, flowWatchKinds, flowWatchLabels, shiftFlowMonth, type FlowDaySummary, type FlowRun, type FlowWatchEvent, type FlowWatchKind, type FlowWatchReport } from '@/lib/investor-flow-watch';
import { Icon } from './Icon';
import FlowWatchImageButton from './FlowWatchImageButton';
import s from './InvestorFlowWatch.module.css';

const amount=(n:number|null)=>n===null?'—':rankingAmount(n);
const runDays=(run:FlowRun|null)=>run?`${run.days}일${run.exact?'':' 이상'}`:'—';
const ratio=(n:number|null)=>n===null?'—':n.toLocaleString('ko-KR',{maximumFractionDigits:1})+'%';
const descriptions={buying:'기준 이상 순매수를 이어가는 종목',exit:'연속 순매수 뒤 오늘 순매도로 전환',reentry:'이탈 뒤 오늘 처음 순매수를 재개'};
function Trail({event}:{event:FlowWatchEvent}){
  const maximum=Math.max(1,...event.trail.map(day=>Math.abs(day.net??0)));
  return <div className={s.trail} aria-label="최근 10거래일 순매수 흐름">{event.trail.map(day=><span key={day.date} title={`${day.date} · ${day.net===null?'미확인':amount(day.net)+'억원'}`} className={day.net===null?s.unknown:day.net>0?s.trailBuy:day.net<0?s.trailSell:s.neutral}>
    <i style={{height:day.net===null?0:day.net===0?1:Math.max(3,Math.abs(day.net)/maximum*17)}}/><em className={s.srOnly}>{day.date}: {day.net===null?'미확인':amount(day.net)+'억원'}</em>
  </span>)}</div>;
}
function CalendarDay({day,selected,onChoose}:{day:FlowDaySummary;selected:boolean;onChoose:()=>void}){
  const active=day.status==='ready'||day.status==='partial';
  return <button className={`${s.day} ${selected?s.selectedDay:''} ${!active?s.quietDay:''}`} onClick={onChoose} disabled={day.status==='future'||day.status==='closed'} aria-pressed={selected}
    aria-label={`${day.date} ${active?`연속 순매수 ${day.counts.buying}종목, 매수 이탈 ${day.counts.exit}종목, 이탈 후 재매수 ${day.counts.reentry}종목`:day.reason||(day.status==='future'?'미래 날짜':'미수집')}`}>
    <span className={s.dayTop}><b>{Number(day.date.slice(-2))}</b>{active&&<small>{day.status==='partial'?'일부':day.backfilled?'소급':''}</small>}</span>
    {active?<span className={s.dayCounts}><span className={s.buying}>연속 <strong>{day.covered?day.counts.buying:'—'}</strong></span><span className={s.exit}>이탈 <strong>{day.covered?day.counts.exit:'—'}</strong></span><span className={s.reentry}>재매수 <strong>{day.covered?day.counts.reentry:'—'}</strong></span></span>
      :<span className={s.dayEmpty}>{day.status==='future'?'—':day.reason||'미수집'}</span>}
  </button>;
}
export default function InvestorFlowWatch({investor,market,view,initialDate=''}:{investor:StockInvestor;market:RankingMarket;view:'watch'|'calendar';initialDate?:string}){
  const today=kstParts().date;
  const [month,setMonth]=useState(initialDate?.slice(0,7)||today.slice(0,7)),[date,setDate]=useState(initialDate),[criteria,setCriteria]=useState(defaultFlowWatchCriteria);
  const [category,setCategory]=useState<FlowWatchKind>('buying'),[query,setQuery]=useState(''),[sort,setSort]=useState('amount'),[limit,setLimit]=useState(50),[refresh,setRefresh]=useState(0);
  const [result,setResult]=useState<{key:string;data:FlowWatchReport}|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(true);
  const lastRefresh=useRef(0),key=[month,date,investor,market,criteria.minimumDays,criteria.reentryWindow,criteria.minimumAmount,refresh].join('|');
  const data=result?.key===key?result.data:null;
  useEffect(()=>{
    const abort=new AbortController();let alive=true;setPending(true);setError('');
    const params=new URLSearchParams({month,investor,market,days:String(criteria.minimumDays),window:String(criteria.reentryWindow),amount:String(criteria.minimumAmount)});if(date)params.set('date',date);
    if(lastRefresh.current!==refresh){params.set('fresh','1');lastRefresh.current=refresh;}
    (async()=>{try{
      const response=await fetch('/api/market/investor-flow-watch?'+params,{cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(55000)])});
      const body=await response.json();if(!response.ok||!body.ok)throw Error(response.status===401?'로그인이 필요합니다. 다시 로그인해 주세요.':body.error||'수급 추적을 불러오지 못했습니다.');
      if(alive){setResult({key,data:body});setLimit(50);}
    }catch(e){if(alive){setResult(null);setError(e instanceof Error&&e.name==='TimeoutError'?'조회 시간이 길어지고 있습니다. 다시 조회해 주세요.':e instanceof Error?e.message:'수급 추적 조회 실패');}}
    finally{if(alive)setPending(false);}})();
    return()=>{alive=false;abort.abort();};
  },[key,month,date,investor,market,criteria.minimumDays,criteria.reentryWindow,criteria.minimumAmount,refresh]);
  const rows=useMemo(()=>{
    const found=(data?.events??[]).filter(row=>row.kind===category&&(!query.trim()||(row.name+' '+row.code).toLowerCase().includes(query.trim().toLowerCase())));
    return found.sort((a,b)=>sort==='days'?(b.previousRun?.days||b.run.days)-(a.previousRun?.days||a.run.days)||Math.abs(b.net)-Math.abs(a.net):sort==='accumulated'?(b.previousRun?.total||b.run.total)-(a.previousRun?.total||a.run.total)||Math.abs(b.net)-Math.abs(a.net):Math.abs(b.net)-Math.abs(a.net)||a.code.localeCompare(b.code));
  },[data,category,query,sort]);
  const selected=data?.selected,hasDay=selected&&(selected.status==='ready'||selected.status==='partial');
  function changeMonth(value:string){setMonth(value);setDate('');setQuery('');}
  function choose(kind:FlowWatchKind){setCategory(kind);setLimit(50);}
  function download(){if(!data)return;const url=URL.createObjectURL(new Blob([flowWatchCSV(data,category,rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`baltatool-flow-${investor}-${market}-${category}-${data.selectedDate}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <section className={s.workspace} aria-label="투자자 수급 추적">
    <div className={s.heading}><div><span className={s.eyebrow}>수급의 지속과 전환</span><h2>{view==='calendar'?'수급 캘린더':'연속 매수 흐름 추적'}</h2><p>순매수의 지속, 첫 이탈, 재개 시점을 거래일별로 확인합니다.</p></div><button className={s.refresh} disabled={pending} onClick={()=>setRefresh(n=>n+1)}><Icon name="refresh" size={14}/>{pending?'조회 중':'추적 새로고침'}</button></div>
    <div className={s.criteria}>
      <label>연속 순매수 기준 <select aria-label="연속 순매수 기준" value={criteria.minimumDays} onChange={e=>setCriteria(c=>({...c,minimumDays:Number(e.target.value)}))}>{[2,3,5,10].map(n=><option key={n} value={n}>{n}거래일 이상</option>)}</select></label>
      <label>재매수 확인 기간 <select aria-label="재매수 확인 기간" value={criteria.reentryWindow} onChange={e=>setCriteria(c=>({...c,reentryWindow:Number(e.target.value)}))}>{[3,5,10].map(n=><option key={n} value={n}>이탈 후 {n}거래일 이내</option>)}</select></label>
      <label>당일 순매수·순매도 규모 <select aria-label="당일 금액 최소" value={criteria.minimumAmount} onChange={e=>setCriteria(c=>({...c,minimumAmount:Number(e.target.value)}))}>{[0,1,5,10,50,100].map(n=><option key={n} value={n}>{n?n+'억원 이상':'전체 금액'}</option>)}</select></label>
    </div>
    <div className={s.period}>
      <div><button aria-label="이전 달" onClick={()=>changeMonth(shiftFlowMonth(month,-1))} disabled={month<='2000-01'}>‹</button><label><span className={s.srOnly}>수급 추적 월</span><input type="month" min="2000-01" max={today.slice(0,7)} value={month} onChange={e=>{if(e.target.value&&e.target.value>= '2000-01'&&e.target.value<=today.slice(0,7))changeMonth(e.target.value);}}/></label><button aria-label="다음 달" onClick={()=>changeMonth(shiftFlowMonth(month,1))} disabled={month>=today.slice(0,7)}>›</button></div>
      <label className={s.dayPicker}>기준일 <input type="date" aria-label="수급 추적 기준일" value={date||data?.selectedDate||''} max={today} onChange={e=>{if(e.target.value&&e.target.value<=today){setDate(e.target.value);setMonth(e.target.value.slice(0,7));}}}/></label>
      <button onClick={()=>{setMonth(today.slice(0,7));setDate('');setRefresh(n=>n+1);}}>최근 수집일</button>
      <span className={s.periodHint}>연속은 진행 종목 수 · 이탈·재매수는 해당일 신규 발생 수</span>
    </div>
    {error?<div className={s.notice} role="alert"><strong>수급 추적을 불러오지 못했어요.</strong><p>{error}</p><button onClick={()=>setRefresh(n=>n+1)}>다시 조회</button></div>
      :!data?<div className={s.empty} role="status">일별 수급 이력을 확인하고 있어요.</div>
      :<>
        <div className={s.asOf}><strong>{data.selectedDate.replaceAll('-','.')} · {investorLabel(investor)}</strong><span>{selected?.backfilled?'소급조회 · 당시 전체 종목 목록 미검증':'저장 이력 기준'}{selected?.observedAt?' · 이력 보완 '+new Date(selected.observedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST':''}</span></div>
        <div className={s.cards}>{flowWatchKinds.map(kind=><button key={kind} className={`${s.card} ${s[kind]} ${category===kind?s.activeCard:''}`} aria-pressed={category===kind} onClick={()=>choose(kind)}><span>{flowWatchLabels[kind]}</span><strong>{hasDay&&selected.covered?selected.counts[kind].toLocaleString('ko-KR'):'—'}<small>종목</small></strong><p>{descriptions[kind]}</p></button>)}</div>
        {selected?.status==='partial'&&<p className={s.notice}>당일 금액 확인 {selected.covered.toLocaleString('ko-KR')} / {selected.expected.toLocaleString('ko-KR')}종목 · 이력 부족 등 판단 보류 {selected.undetermined.toLocaleString('ko-KR')}종목. 확인된 신호만 표시합니다.</p>}
        {view==='calendar'&&<div className={s.calendarSection}><div className={s.calendarHeader}><h3>{Number(month.slice(0,4))}년 {Number(month.slice(5))}월</h3><span>월~금 · 날짜를 누르면 아래 목록에 표시</span><FlowWatchImageButton data={data} rows={rows} kind={category} query={query} sort={sort} calendar/></div><div className={s.weekdays}>{['월','화','수','목','금'].map(day=><span key={day}>{day}</span>)}</div>
          <div className={s.calendarGrid}>{monthWeekdaySlots(month).map((date,i)=>date?<CalendarDay key={date} day={data.days.find(d=>d.date===date)!} selected={date===data.selectedDate} onChoose={()=>setDate(date)}/>:<div key={'blank'+i} className={s.blankDay}/>)}</div>
          <p className={s.calendarNote}><span className={s.buying}>● 연속</span><span className={s.exit}>● 이탈</span><span className={s.reentry}>● 재매수</span>‘일부’는 금액 누락·이력 부족 포함, ‘소급’은 조회 시점 종목 목록으로 과거 수급 복원. 날짜별 건수를 합산하면 같은 종목이 중복될 수 있습니다.</p>
        </div>}
        <div className={s.listHeader}><div><h3>{flowWatchLabels[category]} <small>{hasDay?rows.length:0}종목</small></h3><p>{category==='buying'?`${criteria.minimumDays}거래일 이상 순매수 진행`:category==='exit'?`직전 ${criteria.minimumDays}거래일 이상 연속 순매수 → 오늘 순매도`:`연속 순매수 이탈 → ${criteria.reentryWindow}거래일 안에 첫 순매수 재개`}</p></div><button disabled={!rows.length} onClick={download}><Icon name="download" size={14}/>목록 CSV</button></div>
        <div className={s.listTools}><input aria-label="추적 목록 종목 검색" placeholder="목록에서 종목명·코드 검색" value={query} onChange={e=>{setQuery(e.target.value);setLimit(50);}}/><select aria-label="추적 목록 정렬" value={sort} onChange={e=>setSort(e.target.value)}><option value="amount">당일 금액 큰 순</option><option value="days">매수 연속일 긴 순</option><option value="accumulated">매수 구간 누적액 큰 순</option></select><FlowWatchImageButton key={category} data={data} rows={rows} kind={category} query={query} sort={sort}/><span>단위 억원 · 검색은 아래 목록에 적용</span></div>
        {!hasDay?<div className={s.empty}><strong>{selected?.status==='closed'?selected.reason+' · 휴장일':selected?.status==='future'?'아직 도래하지 않은 날짜예요.':'이 날짜의 수급 이력이 없어요.'}</strong><p>{data.historyStart?'수집된 다른 날짜를 선택해 주세요.':'업데이트한 수집기를 한 번 실행하면 최근 거래일 이력부터 채워집니다.'}</p></div>
          :!rows.length?<div className={s.empty}><strong>{selected.covered?'현재 조건에 해당하는 종목이 없어요.':'해당 투자자의 당일 금액이 확인되지 않았어요.'}</strong><p>{selected.status==='partial'?'누락되거나 이력이 부족한 종목은 분류에서 제외했습니다.':'연속일·금액 기준 또는 종목 검색어를 확인해 주세요.'}</p></div>
          :<div className={s.tableWrap}><table><thead><tr><th>종목 · 최근 10거래일</th><th>당일 순매수</th><th>{category==='buying'?'매수 지속':'직전 매수 구간'}</th><th>{category==='buying'?'연속 구간 합계':'직전 구간 합계'}</th><th>{category==='buying'?'최근 5일 합계':category==='exit'?'당일 이탈 비율':'재매수 / 매도구간'}</th><th>확인 포인트</th></tr></thead><tbody>{rows.slice(0,limit).map(row=><tr key={row.code}>
            <td><Link className={s.stock} href={`/stock-flow?code=${row.code}&investor=${investor}&mode=daily`} prefetch={false}>{row.name} <span aria-hidden="true">↗</span></Link><small className={s.code}>{row.code} · {row.market.toUpperCase()}</small><Trail event={row}/></td>
            <td className={row.net>=0?s.buying:s.exit}>{amount(row.net)}</td><td>{runDays(category==='buying'?row.run:row.previousRun)}<small className={s.subValue}>{(category==='buying'?row.run:row.previousRun)?.start.slice(5)}부터</small></td>
            <td>{amount(category==='buying'?row.run.total:row.previousRun?.total??null)}{!(category==='buying'?row.run:row.previousRun)?.exact&&<small className={s.subValue}>확인된 구간 합계</small>}</td>
            <td>{category==='buying'?amount(row.fiveDayNet):category==='exit'?ratio(row.sellRatio):ratio(row.reentryRatio)}<small className={s.subValue}>{category==='buying'?'5거래일 모두 확인 시':category==='exit'?'직전 구간 순매수액 대비':`매도 규모 ${amount(row.soldAmount)}억 대비`}</small></td>
            <td><span className={`${s.eventTag} ${s[row.kind]}`}>{category==='buying'?(row.newStreak?`오늘 ${criteria.minimumDays}일 달성`:'매수 지속'):category==='exit'?'첫 순매도':'재매수 첫날'}</span><small className={s.subValue}>{category==='reentry'?`${row.exitDate?.slice(5)} 이탈 · ${row.gapDays}거래일 후`:category==='exit'?'0원 중단은 이탈에서 제외':'종목 차트에서 가격 흐름 확인'}</small></td>
          </tr>)}</tbody></table></div>}
        {rows.length>limit&&<button className={s.more} onClick={()=>setLimit(n=>n+50)}>50종목 더 보기 · {Math.min(limit,rows.length)} / {rows.length}</button>}
        <details className={s.method}><summary>분류 기준과 데이터 범위</summary><div><p><strong>연속 순매수:</strong> 기준일 포함 {criteria.minimumDays}거래일 이상 매일 순매수 금액이 양수. 시작 이전 기록이 없으면 ‘N일 이상’으로 표시하고 확인된 구간만 합산합니다.</p><p><strong>매수 이탈:</strong> 전일까지 {criteria.minimumDays}거래일 이상 연속 순매수하던 종목이 오늘 처음 음수로 전환. 0원 중단과 미수집은 순매도로 해석하지 않습니다.</p><p><strong>이탈 후 재매수:</strong> 위 이탈 이후 중간에 양수 없이 {criteria.reentryWindow}거래일 안에 처음 양수로 전환. 이탈 후 0원인 날도 경과 거래일에 포함합니다.</p><p><strong>금액 필터:</strong> 판정을 마친 종목에서 당일 순매수 금액의 절댓값이 {criteria.minimumAmount}억원 이상인 종목만 표시합니다. 작은 양수도 연속일 계산에는 포함됩니다.</p><p><strong>이탈·재매수 비율:</strong> 당일 순매도 ÷ 직전 연속 순매수 구간 합계, 재매수 당일 순매수 ÷ 이탈~재개 직전의 순매도 합계. 100%를 넘을 수 있습니다.</p>{data.warnings.map(w=><p key={w}>{w}</p>)}<p>이력 확인 범위 {data.historyStart??'없음'} ~ {data.historyEnd??'없음'} · KRX 일별 순매수 · 한국투자증권</p></div></details>
      </>}
  </section>;
}
