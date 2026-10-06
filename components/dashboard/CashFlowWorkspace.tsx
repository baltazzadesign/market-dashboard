'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CashFlowResponse } from '@/lib/cash-flow-model';
import s from './CashFlowWorkspace.module.css';
type Stock = {code:string;name:string;market:string};
const money = (v:number|null|undefined) => v==null ? '—' : (v/1e8).toLocaleString('ko-KR',{maximumFractionDigits:1});
const percent = (v:number|null|undefined) => v==null ? '—' : v.toLocaleString('ko-KR',{maximumFractionDigits:1})+'%';
const sign = (v:number|null) => v===null?'?':v>0?'+':v<0?'−':'0';
const source = (receipt:string) => 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo='+receipt;
export default function CashFlowWorkspace({initialCode=''}:{initialCode?:string}) {
  const [code,setCode]=useState(initialCode || '005930'),[query,setQuery]=useState(initialCode || '삼성전자');
  const [results,setResults]=useState<Stock[]>([]),[searchError,setSearchError]=useState(''),[searching,setSearching]=useState(false);
  const [data,setData]=useState<CashFlowResponse|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0),[range,setRange]=useState<3|5>(5);
  const searchController=useRef<AbortController|null>(null);
  useEffect(()=>()=>searchController.current?.abort(),[]);
  useEffect(()=>{
    const controller=new AbortController();let alive=true;
    setLoading(true);setError('');setData(null);
    (async()=>{
      try{
        const r=await fetch('/api/market/cash-flow?'+new URLSearchParams({code}),{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(55000)])});
        const body=await r.json();
        if(!r.ok||!body.ok)throw new Error(r.status===401?'로그인이 필요합니다. 다시 로그인해 주세요.':body.error || '재무정보를 불러오지 못했습니다.');
        if(alive)setData(body);
      }catch(e){if(alive)setError(e instanceof Error && e.name==='TimeoutError'?'조회 시간이 길어지고 있습니다. 다시 조회해 주세요.':e instanceof Error?e.message:'조회에 실패했습니다.');}
      finally{if(alive)setLoading(false);}
    })();
    return()=>{alive=false;controller.abort();};
  },[code,refresh]);
  function choose(stock:Stock){searchController.current?.abort();setSearching(false);setResults([]);setSearchError('');setQuery(stock.name);setCode(stock.code);window.history.replaceState(null,'','/cash-flow?code='+stock.code);}
  async function search(e:FormEvent){
    e.preventDefault();const q=query.trim();if(!q)return;
    searchController.current?.abort();setResults([]);setSearchError('');
    if(/^\d{6}$/.test(q)){choose({code:q,name:q,market:''});return;}
    const controller=new AbortController();searchController.current=controller;setSearching(true);
    try{
      const response=await fetch('/api/market/stocks?q='+encodeURIComponent(q),{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
      const body=await response.json();
      if(!response.ok||!body.ok)throw new Error(body.error||'종목 검색에 실패했습니다.');
      if(controller.signal.aborted)return;
      const rows:Stock[]=Array.isArray(body.rows)?body.rows.filter((r:Stock)=>/^\d{6}$/.test(r.code)&&typeof r.name==='string'):[];
      const exact=rows.find(r=>r.name===q);
      if(exact)choose(exact);else{setResults(rows);if(!rows.length)setSearchError('검색 결과가 없습니다. 6자리 종목코드로도 조회할 수 있습니다.');}
    }catch(e){if(!controller.signal.aborted)setSearchError(e instanceof Error?e.message:'검색에 실패했습니다.');}
    finally{if(!controller.signal.aborted)setSearching(false);}
  }
  const visible=data?.code===code?data:null, latest=visible?.years.at(-1), analysis=visible?.analysis;
  const years=visible?.years.slice(-range)??[];
  const charts=years.map(r=>({year:String(r.year),영업:r.operating===null?null:r.operating/1e8,투자:r.investing===null?null:r.investing/1e8,재무:r.financing===null?null:r.financing/1e8,잉여현금:r.fcf===null?null:r.fcf/1e8}));
  function download(){
    if(!visible)return;
    const lines=[['사업연도','기준','조회상태','영업현금_원','투자현금_원','재무현금_원','순이익_원','유형무형취득_원','잉여현금_원','현금전환율_pct','순재무유입비중_pct','유형','접수번호'],...visible.years.map(r=>[r.year,r.basis,r.status,r.operating,r.investing,r.financing,r.netIncome,r.capex,r.fcf,r.conversion,r.fundingShare,r.regime,r.receipt])];
    const csv='\ufeff'+lines.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`cash-flow-${code}-${visible.endYear}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <main className={s.page} id="main-content">
    <header className={s.hero}><div><span className={s.eyebrow}>종목별 재무 분석</span><h1>기업 현금흐름</h1><p>벌어들인 현금, 투자한 현금, 조달한 현금을 함께 읽습니다.</p></div><form className={s.search} onSubmit={search} role="search"><label htmlFor="cash-flow-search">종목명 또는 코드</label><div><input id="cash-flow-search" value={query} onChange={e=>{searchController.current?.abort();setSearching(false);setResults([]);setSearchError('');setQuery(e.target.value);}} maxLength={60} autoComplete="off" placeholder="삼성전자 또는 005930"/><button disabled={searching}>{searching?'검색 중':'조회'}</button></div></form></header>
    {searchError&&<p className={s.notice} role="alert">{searchError}</p>}
    {results.length>0&&<div className={s.results} aria-label="종목 검색 결과">{results.map(r=><button key={r.code} onClick={()=>choose(r)}><strong>{r.name}</strong><span>{r.code} · {r.market}</span></button>)}</div>}
    <div className={s.context}><div><h2>{visible?.name||code}</h2><span>{code}{visible?` · ${visible.basis==='CFS'?'연결':'별도'}재무제표 · 사업보고서`:''}</span></div><div className={s.actions}><Link href={'/stock-flow?code='+code}>종목 수급 ↗</Link><button onClick={download} disabled={!visible}>자료 저장</button><button onClick={()=>setRefresh(v=>v+1)} disabled={loading}>재조회</button></div></div>
    {error&&<section className={s.empty} role="alert"><h2>현금흐름을 불러오지 못했습니다</h2><p>{error}</p><button onClick={()=>setRefresh(v=>v+1)}>다시 조회</button></section>}
    {loading&&<section className={s.empty} role="status"><span className={s.loader}/><h2>5개 사업연도의 공시를 확인하고 있습니다</h2><p>영업·투자·재무활동과 세부 취득 계정을 대조합니다.</p></section>}
    {visible&&latest&&analysis&&<>
      {visible.warnings.length>0&&<div className={s.notice} role="status">{visible.warnings.map(w=><p key={w}>{w}</p>)}</div>}
      <section className={s.overview} aria-label="최신 사업연도 분석"><div className={s.judgment}><div className={s.sectionLabel}>{latest.year} 사업연도 · 현금흐름 구조</div><h2>{latest.regime}</h2><div className={s.signs}>{[['영업',latest.operating],['투자',latest.investing],['재무',latest.financing]].map(([name,v])=><span key={String(name)}>{name}<b>{sign(v as number|null)}</b></span>)}</div><p>{analysis.summary.join(' ') || '필요한 공시 데이터를 확인한 뒤 분석을 표시합니다.'}</p><span className={s.change}>전년 대비 점수 변화 · {analysis.change}</span></div><div className={s.score}><span>현금흐름 점수</span><strong>{analysis.score??'—'}<small>/ 100</small></strong><p>{analysis.scoreReason}</p><a href="#cash-flow-method">계산 기준 보기 ↓</a></div></section>
      <section className={s.metrics} aria-label="핵심 지표">{[
        {label:'영업현금흐름',value:money(latest.operating),unit:'억원',note:'본업에서 실제로 유입·유출된 현금'},
        {label:'잉여현금흐름',value:money(latest.fcf),unit:'억원',note:'영업현금 − 유형·무형자산 취득액'},
        {label:'현금전환율',value:percent(latest.conversion),unit:'',note:'영업현금 ÷ 양수인 순이익'},
        {label:'순재무 유입 비중',value:percent(latest.fundingShare),unit:'',note:'양수인 활동별 순현금 유입 합계 대비'},
      ].map(m=><article key={m.label}><h3>{m.label}</h3><strong>{m.value}<small>{m.unit}</small></strong><p>{m.note}</p></article>)}</section>
      <section className={s.panel}><div className={s.panelHeading}><div><h2>현금의 흐름</h2><p>사업연도 기준 · 억원 · 빈 값은 선을 연결하지 않습니다</p></div><div className={s.segment}>{([3,5] as const).map(n=><button key={n} aria-pressed={range===n} onClick={()=>setRange(n)}>{n}년</button>)}</div></div>
        <div className={s.chart} role="img" aria-label="연도별 영업·투자·재무현금 막대와 잉여현금 선 그래프. 정확한 수치는 아래 표에 있습니다."><ResponsiveContainer width="100%" height="100%"><ComposedChart data={charts} margin={{top:15,right:10,bottom:5,left:5}}><CartesianGrid stroke="#262d36" vertical={false}/><XAxis dataKey="year" stroke="#919daa" tickLine={false}/><YAxis stroke="#919daa" tickLine={false} width={72} tickFormatter={v=>Number(v).toLocaleString('ko-KR',{notation:'compact'})}/><Tooltip contentStyle={{background:'#141b24',border:'1px solid #394654',borderRadius:10}} labelStyle={{color:'#edf1f5'}} formatter={v=>[Number(v).toLocaleString('ko-KR',{maximumFractionDigits:1})+'억원']}/><Legend/><ReferenceLine y={0} stroke="#a6b3c2" strokeWidth={1.5}/><Bar isAnimationActive={false} dataKey="영업" fill="#5fa8f5" maxBarSize={28} radius={[3,3,0,0]}/><Bar isAnimationActive={false} dataKey="투자" fill="#8895a8" maxBarSize={28} radius={[3,3,0,0]}/><Bar isAnimationActive={false} dataKey="재무" fill="#b49bea" maxBarSize={28} radius={[3,3,0,0]}/><Line isAnimationActive={false} dataKey="잉여현금" stroke="#62d5bb" strokeWidth={2.5} dot={{r:4}} connectNulls={false}/></ComposedChart></ResponsiveContainer></div>
      </section>
      <div className={s.columns}><section className={s.panel}><div className={s.panelHeading}><h2>연도별 구조 변화</h2><span>영업 / 투자 / 재무</span></div><ol className={s.timeline}>{years.map(r=><li key={r.year}><strong>{r.year}</strong><div><b>{r.regime}</b><small>{r.status==='error'?'조회 실패':r.status==='missing'?'공시 데이터 없음':r.basis==='CFS'?'연결재무제표':'별도재무제표'}</small></div><code>{sign(r.operating)} / {sign(r.investing)} / {sign(r.financing)}</code></li>)}</ol></section><section className={s.panel}><div className={s.panelHeading}><h2>위험·추가 확인</h2><span>{latest.year} 기준</span></div><ul className={s.risks}>{analysis.risks.map(r=><li key={r}>{r}</li>)}</ul><div className={s.funding}>{latest.fundingItems.length?latest.fundingItems.map((r,i)=><div key={i}><span><b>{r.kind}</b>{r.account}</span><strong>{money(r.value)}억</strong></div>):<p>현금흐름표에서 조달 관련 세부 계정이 검출되지 않았습니다.</p>}<small>확인된 계정만 표시하며, 상·하위 계정 중복 가능성 때문에 합산하지 않습니다.</small></div>{latest.receipt&&<a className={s.source} href={source(latest.receipt)} target="_blank" rel="noopener noreferrer">공시 원문에서 조건 확인 ↗</a>}</section></div>
      <section className={s.panel}><div className={s.panelHeading}><h2>연간 수치와 출처</h2><span>금액: 억원 · —: 미확인 또는 계산 불가</span></div><div className={s.tableWrap}><table><caption className={s.srOnly}>최근 {range}개 사업연도의 현금흐름 및 이익</caption><thead><tr><th>사업연도</th><th>영업</th><th>투자</th><th>재무</th><th>순이익</th><th>취득액</th><th>잉여현금</th><th>현금전환율</th><th>공시</th></tr></thead><tbody>{years.map(r=><tr key={r.year}><th scope="row">{r.year}</th>{[r.operating,r.investing,r.financing,r.netIncome,r.capex,r.fcf].map((v,i)=><td key={i} className={v!==null&&v<0?s.negative:undefined}>{money(v)}</td>)}<td>{percent(r.conversion)}</td><td>{r.receipt?<a href={source(r.receipt)} target="_blank" rel="noopener noreferrer" aria-label={r.year+'년 공시 원문'}>원문 ↗</a>:'—'}</td></tr>)}</tbody></table></div>
        <details className={s.details}><summary>계정 매칭·누락 내역 확인</summary>{years.map(r=><div key={r.year}><h3>{r.year} 사업연도</h3>{r.warnings.map(w=><p key={w}>{w}</p>)}{r.evidence.map((e,i)=><p key={i}><b>{e.label}</b> ← {e.account} · {money(e.value)}억원 <small>({e.method==='id'?'표준 계정':'계정명'} 매칭)</small></p>)}</div>)}</details>
      </section>
      <section className={s.method} id="cash-flow-method"><h2>평가 기준</h2><p>영업·투자·재무활동의 부호 조합은 현금흐름 유형을 나타냅니다. 기업의 성장 단계나 상장폐지 가능성을 확정하는 기준은 아닙니다.</p><div className={s.scoreParts}>{(analysis.parts.length?analysis.parts:[{label:'영업현금 지속성',max:30,points:null,detail:'최근 3년 양수 횟수 × 10점'},{label:'잉여현금 지속성',max:30,points:null,detail:'최근 3년 양수 횟수 × 10점'},{label:'이익의 현금 전환',max:20,points:null,detail:'현금전환율 0~100%를 0~20점 반영'},{label:'순재무 유입 비중',max:20,points:null,detail:'(1 − 순재무 유입 비중) × 20점'}]).map(p=><div key={p.label}><span>{p.label}</span><strong>{p.points??'—'}<small> / {p.max}</small></strong><p>{p.detail}</p></div>)}</div><p>최근 3년의 필수 계정과 업종을 확인한 경우에만 점수를 계산합니다. 순이익이 0 이하이면 현금전환율은 계산하지 않고 해당 점수는 0점입니다. 전년 대비 ±10점 이상이면 개선·악화로 표시합니다. 표시 기간을 바꿔도 점수 기준은 같습니다.</p><p>순재무 유입 비중 = 양수인 재무현금흐름 ÷ 영업·투자·재무 각각의 양수 부분 합계. 순유입 기준의 참고치이며 총차입·총상환·총조달액이나 실제 외부자금 의존율을 뜻하지 않습니다.</p><p>잉여현금흐름은 영업현금에서 유형·무형자산 취득액을 차감합니다. 취득액 중 하나라도 누락되면 계산하지 않습니다. 인수합병·금융자산 투자·리스 상환은 이 산식에 포함하지 않습니다.</p></section>
      <footer className={s.footer}><span>출처: 금융감독원 OpenDART · 연간 공시 · 최근 분기 변동 미반영</span><span>조회 {new Date(visible.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · 최대 6시간 재사용</span></footer>
    </>}
  </main>;
}
