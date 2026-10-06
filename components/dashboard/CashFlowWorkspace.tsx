'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CashFlowResponse } from '@/lib/cash-flow-model';
import type { QuarterCashFlowResponse } from '@/lib/cash-flow-quarter';
type Period = 'annual' | 'quarter';
type ResponseData = CashFlowResponse | QuarterCashFlowResponse;
import s from './CashFlowWorkspace.module.css';
type Stock = {code:string;name:string;market:string};
const money = (v:number|null|undefined) => v==null ? '—' : (v/1e8).toLocaleString('ko-KR',{maximumFractionDigits:1});
const percent = (v:number|null|undefined) => v==null ? '—' : v.toLocaleString('ko-KR',{maximumFractionDigits:1})+'%';
const changeMoney = (v:number|null) => v===null?'—':(v>0?'+':'')+money(v);
const sign = (v:number|null) => v===null?'?':v>0?'+':v<0?'−':'0';
const source = (receipt:string) => 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo='+receipt;
export default function CashFlowWorkspace({initialCode='',initialPeriod='annual'}:{initialCode?:string;initialPeriod?:Period}) {
  const [period,setPeriod]=useState<Period>(initialPeriod),[quarterRange,setQuarterRange]=useState<4|8>(8);
  const [code,setCode]=useState(initialCode || '005930'),[query,setQuery]=useState(initialCode || '삼성전자');
  const [results,setResults]=useState<Stock[]>([]),[searchError,setSearchError]=useState(''),[searching,setSearching]=useState(false);
  const [data,setData]=useState<ResponseData|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0),[range,setRange]=useState<3|5>(5);
  const searchController=useRef<AbortController|null>(null);
  useEffect(()=>()=>searchController.current?.abort(),[]);
  useEffect(()=>{
    const controller=new AbortController();let alive=true;
    setLoading(true);setError('');setData(null);
    (async()=>{
      try{
        const r=await fetch('/api/market/cash-flow?'+new URLSearchParams({code,period}),{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(55000)])});
        const body=await r.json();
        if(!r.ok||!body.ok)throw new Error(r.status===401?'로그인이 필요합니다. 다시 로그인해 주세요.':body.error || '재무정보를 불러오지 못했습니다.');
        if(alive)setData(body);
      }catch(e){if(alive)setError(e instanceof Error && e.name==='TimeoutError'?'조회 시간이 길어지고 있습니다. 다시 조회해 주세요.':e instanceof Error?e.message:'조회에 실패했습니다.');}
      finally{if(alive)setLoading(false);}
    })();
    return()=>{alive=false;controller.abort();};
  },[code,period,refresh]);
  function choose(stock:Stock){searchController.current?.abort();setSearching(false);setResults([]);setSearchError('');setQuery(stock.name);setCode(stock.code);updateUrl(stock.code,period);}
  function updateUrl(nextCode:string,nextPeriod:Period){window.history.replaceState(null,'','/cash-flow?'+new URLSearchParams({code:nextCode,period:nextPeriod}));}
  function switchPeriod(next:Period){setPeriod(next);updateUrl(code,next);}
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
  const visible=data?.code===code && ('quarters' in data ? 'quarter' : 'annual')===period?data:null;
  const quarterly=visible&&'quarters' in visible?visible:null;
  const isQuarter=period==='quarter';
  const allRows=visible?('quarters' in visible?visible.quarters.map(r=>({...r,display:r.period.replace('-',' '),title:r.label})):visible.years.map(r=>({...r,period:String(r.year),display:String(r.year),title:r.year+' 사업연도',previousReceipt:null,calculation:''}))):[];
  const latest=allRows.at(-1),analysis=visible?.analysis;
  const years=allRows.slice(-(isQuarter?quarterRange:range));
  const charts=years.map(r=>({year:r.display,영업:r.operating===null?null:r.operating/1e8,투자:r.investing===null?null:r.investing/1e8,재무:r.financing===null?null:r.financing/1e8,잉여현금:r.fcf===null?null:r.fcf/1e8}));
  function download(){
    if(!visible)return;
    const lines=[['기간','구분','기준','조회상태','영업현금_원','투자현금_원','재무현금_원','순이익_원','유형무형취득_원','잉여현금_원','현금전환율_pct','순재무유입비중_pct','유형','접수번호','직전누적_접수번호','계산방식'],...allRows.map(r=>[r.period,period,r.basis,r.status,r.operating,r.investing,r.financing,r.netIncome,r.capex,r.fcf,r.conversion,r.fundingShare,r.regime,r.receipt,r.previousReceipt,r.calculation])];
    const csv='\ufeff'+lines.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`cash-flow-${code}-${period}-${latest?.period??visible.endYear}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <main className={s.page} id="main-content">
    <header className={s.hero}><div><span className={s.eyebrow}>종목별 재무 분석</span><h1>기업 현금흐름</h1><p>벌어들인 현금, 투자한 현금, 조달한 현금을 함께 읽습니다.</p></div><form className={s.search} onSubmit={search} role="search"><label htmlFor="cash-flow-search">종목명 또는 코드</label><div><input id="cash-flow-search" value={query} onChange={e=>{searchController.current?.abort();setSearching(false);setResults([]);setSearchError('');setQuery(e.target.value);}} maxLength={60} autoComplete="off" placeholder="삼성전자 또는 005930"/><button disabled={searching}>{searching?'검색 중':'조회'}</button></div></form></header>
    {searchError&&<p className={s.notice} role="alert">{searchError}</p>}
    {results.length>0&&<div className={s.results} aria-label="종목 검색 결과">{results.map(r=><button key={r.code} onClick={()=>choose(r)}><strong>{r.name}</strong><span>{r.code} · {r.market}</span></button>)}</div>}
    <div className={s.context}><div><h2>{visible?.name||code}</h2><span>{code}{visible?` · ${visible.basis==='CFS'?'연결':'별도'}재무제표 · ${isQuarter?'단독 분기':'사업보고서'}`:''}</span></div><div className={s.actions}><Link href={'/stock-flow?code='+code}>종목 수급 ↗</Link><button onClick={download} disabled={!visible}>자료 저장</button><button onClick={()=>setRefresh(v=>v+1)} disabled={loading}>재조회</button></div></div>
    <div className={s.periodBar}><div className={s.periodTabs} role="group" aria-label="조회 기준">{([['annual','연간'],['quarter','분기']] as const).map(([key,label])=><button key={key} aria-pressed={period===key} onClick={()=>switchPeriod(key)}>{label}</button>)}</div><p>{isQuarter?'각 분기의 3개월 금액 · 최근 8개 분기':'사업연도별 금액 · 최근 5개년'}</p></div>
    {error&&<section className={s.empty} role="alert"><h2>현금흐름을 불러오지 못했습니다</h2><p>{error}</p><button onClick={()=>setRefresh(v=>v+1)}>다시 조회</button></section>}
    {loading&&<section className={s.empty} role="status"><span className={s.loader}/><h2>{isQuarter?'분기·반기·사업보고서를 확인하고 있습니다':'5개 사업연도의 공시를 확인하고 있습니다'}</h2><p>{isQuarter?'누적 공시를 대조해 단독 분기 금액을 계산합니다.':'영업·투자·재무활동과 세부 취득 계정을 대조합니다.'}</p></section>}
    {visible&&latest&&analysis&&<>
      {visible.warnings.length>0&&<div className={s.notice} role="status">{visible.warnings.map(w=><p key={w}>{w}</p>)}</div>}
      <section className={s.overview} aria-label="최신 기간 분석"><div className={s.judgment}><div className={s.sectionLabel}>{latest.title} · 현금흐름 구조</div><h2>{latest.regime}</h2><div className={s.signs}>{[['영업',latest.operating],['투자',latest.investing],['재무',latest.financing]].map(([name,v])=><span key={String(name)}>{name}<b>{sign(v as number|null)}</b></span>)}</div><p>{analysis.summary.join(' ') || '필요한 공시 데이터를 확인한 뒤 분석을 표시합니다.'}</p><span className={s.change}>{isQuarter?'영업현금 비교':'전년 대비 점수 변화'} · {analysis.change}</span></div>{quarterly?<div className={s.quarterComparison}><span>전년 동기 비교</span><small>{quarterly.analysis.yoy.label}</small><dl><div><dt>영업현금 증감</dt><dd>{changeMoney(quarterly.analysis.yoy.operating)}<small>억원</small></dd></div><div><dt>잉여현금 증감</dt><dd>{changeMoney(quarterly.analysis.yoy.fcf)}<small>억원</small></dd></div></dl><p>{quarterly.analysis.yoy.operatingPercent===null?'비교할 금액이 없거나 전년 영업현금이 0 이하이면 증감률을 표시하지 않습니다.':`영업현금 증감률 ${percent(quarterly.analysis.yoy.operatingPercent)}`}</p><a href="#cash-flow-method">분기 계산 기준 ↓</a></div>:<div className={s.score}><span>현금흐름 점수</span><strong>{analysis.score??'—'}<small>/ 100</small></strong>{analysis.score!==null&&<div className={s.scoreTrack} aria-hidden="true"><span style={{width:`${analysis.score}%`}}/></div>}<p>{analysis.scoreReason}</p><a href="#cash-flow-method">계산 기준 보기 ↓</a></div>}</section>
      <section className={s.metrics} aria-label={isQuarter?'최신 단독 분기 지표':'최신 연간 지표'}>{[
        {label:'영업현금흐름',value:money(latest.operating),unit:'억원',note:'본업에서 실제로 유입·유출된 현금'},
        {label:'잉여현금흐름',value:money(latest.fcf),unit:'억원',note:'영업현금 − 유형·무형자산 취득액'},
        {label:'현금전환율',value:percent(latest.conversion),unit:'',note:'영업현금 ÷ 양수인 순이익'},
        {label:'순재무 유입 비중',value:percent(latest.fundingShare),unit:'',note:'양수인 활동별 순현금 유입 합계 대비'},
      ].map(m=><article key={m.label}><h3>{m.label}</h3><strong>{m.value}<small>{m.unit}</small></strong><p>{m.note}</p></article>)}</section>
      {quarterly&&<section className={s.ttm} aria-label="최근 4분기 합산"><div><h2>최근 4분기 합산</h2><p>{quarterly.analysis.ttm.label}</p></div><dl><div><dt>영업현금</dt><dd>{money(quarterly.analysis.ttm.operating)}<small>억원</small></dd></div><div><dt>잉여현금</dt><dd>{money(quarterly.analysis.ttm.fcf)}<small>억원</small></dd></div><div><dt>현금전환율</dt><dd>{percent(quarterly.analysis.ttm.conversion)}</dd></div></dl><small>연속된 4개 분기의 확인 가능한 계정만 합산합니다.</small></section>}
      <section className={s.panel}><div className={s.panelHeading}><div><h2>현금의 흐름</h2><p>{isQuarter?'단독 분기':'사업연도'} 기준 · 억원 · 빈 값은 선을 연결하지 않습니다</p></div><div className={s.segment} role="group" aria-label="표시 기간">{isQuarter?([4,8] as const).map(n=><button key={n} aria-pressed={quarterRange===n} onClick={()=>setQuarterRange(n)}>{n}분기</button>):([3,5] as const).map(n=><button key={n} aria-pressed={range===n} onClick={()=>setRange(n)}>{n}년</button>)}</div></div>
        <div className={s.chart} role="img" aria-label={`${isQuarter?'분기별':'연도별'} 영업·투자·재무현금 막대와 잉여현금 선 그래프. 정확한 수치는 아래 표에 있습니다.`}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={charts} margin={{top:15,right:10,bottom:5,left:5}}><CartesianGrid stroke="var(--cf-rule)" vertical={false} strokeDasharray="3 5"/><XAxis dataKey="year" minTickGap={12} tick={{fontSize:11}} stroke="var(--cf-muted)" tickLine={false} axisLine={false}/><YAxis stroke="var(--cf-muted)" tickLine={false} axisLine={false} width={72} tickFormatter={v=>Number(v).toLocaleString('ko-KR',{notation:'compact'})}/><Tooltip cursor={{fill:'var(--cf-raised)',fillOpacity:0.65}} contentStyle={{background:'var(--cf-surface)',border:'1px solid var(--cf-border)',borderRadius:6,fontSize:12,boxShadow:'0 8px 24px #0005'}} labelStyle={{color:'var(--cf-gold)',marginBottom:8}} formatter={v=>[Number(v).toLocaleString('ko-KR',{maximumFractionDigits:1})+'억원']}/><ReferenceLine y={0} stroke="var(--cf-muted)" strokeWidth={1.5}/><Bar isAnimationActive={false} dataKey="영업" fill="var(--cf-operating)" maxBarSize={28} radius={[3,3,0,0]}/><Bar isAnimationActive={false} dataKey="투자" fill="var(--cf-investing)" maxBarSize={28} radius={[3,3,0,0]}/><Bar isAnimationActive={false} dataKey="재무" fill="var(--cf-financing)" maxBarSize={28} radius={[3,3,0,0]}/><Line isAnimationActive={false} dataKey="잉여현금" stroke="var(--cf-fcf)" strokeWidth={2.5} dot={{r:3.5,fill:'var(--cf-surface)',strokeWidth:2}} activeDot={{r:5}} connectNulls={false}/></ComposedChart></ResponsiveContainer></div><div className={s.legend} aria-label="차트 범례">{[['영업','operating'],['투자','investing'],['재무','financing'],['잉여현금','fcf']].map(([label,key])=><span key={key} style={{'--series-color':`var(--cf-${key})`} as CSSProperties}><i className={key==='fcf'?s.lineKey:undefined} aria-hidden="true"/>{label}</span>)}</div>
      </section>
      <div className={s.columns}><section className={s.panel}><div className={s.panelHeading}><h2>{isQuarter?'분기별':'연도별'} 구조 변화</h2><span>영업 / 투자 / 재무</span></div><ol className={s.timeline}>{years.map(r=><li key={r.period}><strong>{r.display}</strong><div><b>{r.regime}</b><small>{r.status==='error'?'조회 실패':r.status==='missing'?(isQuarter?'공시 미확인·계산 보류':'공시 데이터 없음'):r.basis==='CFS'?'연결재무제표':'별도재무제표'}</small></div><span className={s.flowSigns}>{sign(r.operating)} / {sign(r.investing)} / {sign(r.financing)}</span></li>)}</ol></section><section className={s.panel}><div className={s.panelHeading}><h2>위험·추가 확인</h2><span>{latest.display} 기준</span></div><ul className={s.risks}>{analysis.risks.map(r=><li key={r}>{r}</li>)}</ul><div className={s.funding}>{isQuarter?<p>조달 세부 계정은 누적 공시와의 혼동을 막기 위해 분기 화면에 표시하지 않습니다. CB·BW·차입 등의 조건은 공시 원문을 확인하세요.</p>:latest.fundingItems.length?latest.fundingItems.map((r,i)=><div key={i}><span><b>{r.kind}</b>{r.account}</span><strong>{money(r.value)}억</strong></div>):<p>현금흐름표에서 조달 관련 세부 계정이 검출되지 않았습니다.</p>}{!isQuarter&&<small>확인된 계정만 표시하며, 상·하위 계정 중복 가능성 때문에 합산하지 않습니다.</small>}</div>{latest.receipt&&<a className={s.source} href={source(latest.receipt)} target="_blank" rel="noopener noreferrer">공시 원문에서 조건 확인 ↗</a>}</section></div>
      <section className={s.panel}><div className={s.panelHeading}><h2>{isQuarter?'분기별':'연간'} 수치와 출처</h2><span>금액: 억원 · —: 미확인 또는 계산 불가</span></div><div className={s.tableWrap}><table><caption className={s.srOnly}>최근 {isQuarter?quarterRange:range}개 {isQuarter?'분기':'사업연도'}의 현금흐름 및 이익</caption><thead><tr><th>{isQuarter?'분기':'사업연도'}</th><th>영업</th><th>투자</th><th>재무</th><th>순이익</th><th>취득액</th><th>잉여현금</th><th>현금전환율</th><th>공시</th></tr></thead><tbody>{years.map(r=><tr key={r.period}><th scope="row">{r.display}</th>{[r.operating,r.investing,r.financing,r.netIncome,r.capex,r.fcf].map((v,i)=><td key={i} className={v!==null&&v<0?s.negative:undefined}>{money(v)}</td>)}<td>{percent(r.conversion)}</td><td>{r.receipt?<a href={source(r.receipt)} target="_blank" rel="noopener noreferrer" aria-label={r.title+' 공시 원문'}>{isQuarter?'당기':'원문'} ↗</a>:'—'}{r.previousReceipt&&<a className={s.previousSource} href={source(r.previousReceipt)} target="_blank" rel="noopener noreferrer" aria-label={r.title+' 계산에 사용한 직전 누적 공시'}>직전 ↗</a>}</td></tr>)}</tbody></table></div>
        <details className={s.details}><summary>계정 매칭·누락 내역 확인</summary>{years.map(r=><div key={r.period}><h3>{r.title}</h3>{isQuarter&&<p>{r.calculation} · 아래 계정 금액은 원본 누적값입니다.</p>}{r.warnings.map(w=><p key={w}>{w}</p>)}{r.evidence.map((e,i)=><p key={i}><b>{e.label}</b> ← {e.account} · {money(e.value)}억원 <small>({e.method==='id'?'표준 계정':'계정명'} 매칭)</small></p>)}</div>)}</details>
      </section>
      <section className={s.method} id="cash-flow-method"><h2>{isQuarter?'분기 계산 기준':'평가 기준'}</h2><p>영업·투자·재무활동의 부호 조합은 현금흐름 유형을 나타냅니다. 기업의 성장 단계나 상장폐지 가능성을 확정하는 기준은 아닙니다.</p>{isQuarter?<div className={s.quarterMethod}><p><b>1분기</b> 1분기 공시 그대로 · <b>2분기</b> 반기 − 1분기 · <b>3분기</b> 3분기 누적 − 반기 · <b>4분기</b> 연간 − 3분기 누적</p><p>순이익도 누적금액을 차감합니다. 같은 사업연도·같은 연결/별도 기준의 직전 공시가 없으면 계산을 보류합니다. 누적 취득액 감소나 부호 변경이 있으면 취득액과 잉여현금도 보류합니다.</p><p>12월 결산 기업을 지원합니다. 정정·재분류 공시 차이가 차감값에 반영될 수 있으며 원문 두 건을 함께 확인할 수 있습니다. 100점 평가는 최근 3개 사업연도를 사용하는 연간 화면에서 제공합니다.</p></div>:<><div className={s.scoreParts}>{(analysis.parts.length?analysis.parts:[{label:'영업현금 지속성',max:30,points:null,detail:'최근 3년 양수 횟수 × 10점'},{label:'잉여현금 지속성',max:30,points:null,detail:'최근 3년 양수 횟수 × 10점'},{label:'이익의 현금 전환',max:20,points:null,detail:'현금전환율 0~100%를 0~20점 반영'},{label:'순재무 유입 비중',max:20,points:null,detail:'(1 − 순재무 유입 비중) × 20점'}]).map(p=><div key={p.label}><span>{p.label}</span><strong>{p.points??'—'}<small> / {p.max}</small></strong><p>{p.detail}</p></div>)}</div><p>최근 3년의 필수 계정과 업종을 확인한 경우에만 점수를 계산합니다. 순이익이 0 이하이면 현금전환율은 계산하지 않고 해당 점수는 0점입니다. 전년 대비 ±10점 이상이면 개선·악화로 표시합니다. 표시 기간을 바꿔도 점수 기준은 같습니다.</p></>}<p>순재무 유입 비중 = 양수인 재무현금흐름 ÷ 영업·투자·재무 각각의 양수 부분 합계. 순유입 기준의 참고치이며 총차입·총상환·총조달액이나 실제 외부자금 의존율을 뜻하지 않습니다.</p><p>잉여현금흐름은 영업현금에서 유형·무형자산 취득액을 차감합니다. 취득액 중 하나라도 누락되면 계산하지 않습니다. 인수합병·금융자산 투자·리스 상환은 이 산식에 포함하지 않습니다.</p></section>
      <footer className={s.footer}><span>출처: 금융감독원 OpenDART · {isQuarter?'분기·반기·사업보고서':'사업보고서 · 최근 분기 변동 미반영'}</span><span>조회 {new Date(visible.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · 최대 6시간 재사용</span></footer>
    </>}
  </main>;
}
