"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { stockFlowCSV, stockFlowSeries, stockFlowTotals, stockInvestors, stockRanges, type StockFlowMode, type StockFlowResponse, type StockFlowUnit, type StockInvestor, type StockRange } from '@/lib/stock-flow-model';
import StockFlowChart, { flowNumber } from './StockFlowChart';
import StockChartImageButton from './StockChartImageButton';
import useStockCashFlow from './useStockCashFlow';
import StockCashFlowPanel,{StockCashFlowDetail,StockCashFilingDialog} from './StockCashFlowPanel';
import {alignCashTimeline,type CashFlowView,type CashTimelineDay} from '@/lib/cash-flow-timeline';
import { Icon } from './Icon';
import s from './StockFlowWorkspace.module.css';
type Stock = {code:string;name:string;market:string};
const periods:Record<StockRange,string>={'1M':'1개월','3M':'3개월','6M':'6개월','1Y':'1년'};
const num=(v:number|null|undefined)=>v==null?'—':v.toLocaleString('ko-KR');
export default function StockFlowWorkspace({initialCode='',initialQuery=''}:{initialCode?:string;initialQuery?:string}) {
  const [code,setCode]=useState(initialCode || (initialQuery ? '' : '005930'));
  const [query,setQuery]=useState(initialQuery),[results,setResults]=useState<Stock[]>([]),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState(''),[searchOpen,setSearchOpen]=useState(Boolean(initialQuery)),[searchIndex,setSearchIndex]=useState(-1);
  const [range,setRange]=useState<StockRange>('1M'),[data,setData]=useState<StockFlowResponse|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
  const [unit,setUnit]=useState<StockFlowUnit>('money'),[mode,setMode]=useState<StockFlowMode>('cumulative'),[split,setSplit]=useState(false),[showPrice,setShowPrice]=useState(true),[selected,setSelected]=useState<StockInvestor[]>(['foreign','institution','individual']),[day,setDay]=useState<number|null>(null);
  const [showCash,setShowCash]=useState(true),[cashView,setCashView]=useState<CashFlowView>('quarter'),[filingDay,setFilingDay]=useState<CashTimelineDay|null>(null);
  const cash=useStockCashFlow(code,showCash,refresh);
  const searchBox=useRef<HTMLDivElement>(null),initialResolved=useRef(false);
  const visible=data?.code===code&&data.range===range?data:null;
  function choose(stock:Stock) { setCode(stock.code);setQuery(stock.name);setSearchOpen(false);setSearchError('');setDay(null);setFilingDay(null);window.history.replaceState(null,'','/stock-flow?code='+stock.code); }
  useEffect(()=>{
    if(!searchOpen || !query.trim()){setResults([]);setSearching(false);return;}
    const controller=new AbortController();let alive=true;setSearching(true);setSearchError('');setSearchIndex(-1);setResults([]);
    const timer=setTimeout(async()=>{
      try {
        const r=await fetch('/api/market/stocks?q='+encodeURIComponent(query.trim()),{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]),cache:'no-store'});const body=await r.json();
        if(!r.ok||!body.ok)throw new Error(r.status===401?'로그인이 필요합니다.':body.error||'종목 검색에 실패했습니다.');
        if(!alive)return;
        const list:Stock[]=Array.isArray(body.rows)?body.rows.filter((v:Stock)=>/^\d{6}$/.test(v.code)&&typeof v.name==='string'):[];setResults(list);
        if(initialQuery&&!initialResolved.current){initialResolved.current=true;const exact=list.find(v=>v.code===initialQuery||v.name===initialQuery);if(exact)choose(exact);else if(/^\d{6}$/.test(initialQuery))choose({code:initialQuery,name:initialQuery,market:'KRX'});}
      } catch(e) {if(alive){setSearchError(e instanceof Error?e.message:'종목 검색에 실패했습니다.');if(!initialResolved.current&&/^\d{6}$/.test(initialQuery)){initialResolved.current=true;choose({code:initialQuery,name:initialQuery,market:'KRX'});}}}
      finally {if(alive)setSearching(false);}
    },300);
    return ()=>{alive=false;clearTimeout(timer);controller.abort();};
  },[query,searchOpen,initialQuery]);
  useEffect(()=>{
    if(!code)return;
    const controller=new AbortController();let alive=true;setLoading(true);setData(null);setError('');setDay(null);
    (async()=>{try{const r=await fetch('/api/market/stock-flow?'+new URLSearchParams({code,range}),{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(55000)])});const body=await r.json();if(!r.ok||!body.ok)throw new Error(r.status===401?'로그인이 필요합니다. 새로 로그인해 주세요.':body.error||'종목 데이터를 불러오지 못했습니다.');if(alive)setData(body);}catch(e){if(alive)setError(e instanceof Error&&e.name==='TimeoutError'?'조회 시간이 길어지고 있습니다. 다시 조회해 주세요.':e instanceof Error?e.message:'조회에 실패했습니다.');}finally{if(alive)setLoading(false);}})();
    return ()=>{alive=false;controller.abort();};
  },[code,range,refresh]);
  useEffect(()=>{function outside(e:PointerEvent){if(!searchBox.current?.contains(e.target as Node))setSearchOpen(false);}document.addEventListener('pointerdown',outside);return ()=>document.removeEventListener('pointerdown',outside);},[]);
  const rows=visible?.rows??[];
  const cashDays=useMemo(()=>alignCashTimeline(rows.map(r=>r.date),cash.data?.events??[]),[rows,cash.data]);
  const cashDay=cashDays[Math.min(day??rows.length-1,rows.length-1)];
  const values=useMemo(()=>stockFlowSeries(rows,unit,mode),[rows,unit,mode]);
  const totals=useMemo(()=>stockFlowTotals(rows,unit),[rows,unit]);
  const selectedDay=rows[Math.min(day??rows.length-1,rows.length-1)],suffix=unit==='money'?'억':'주';
  const missingCumulative=mode==='cumulative'&&selected.some(k=>rows.some(r=>r[unit][k]===null));
  function toggle(key:StockInvestor) {setSelected(v=>v.includes(key)?v.filter(k=>k!==key):[...v,key]);}
  function submit(e:FormEvent) {e.preventDefault();const q=query.trim();if(/^\d{6}$/.test(q))choose(results.find(v=>v.code===q)??{code:q,name:q,market:'KRX'});else if(searchIndex>=0&&results[searchIndex])choose(results[searchIndex]);else{const exact=results.find(v=>v.name===q);if(exact)choose(exact);else if(results.length===1)choose(results[0]);else setSearchOpen(true);}}
  function download(){if(!visible?.rows.length)return;const url=URL.createObjectURL(new Blob([stockFlowCSV(visible)],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=`stock-flow-${code}-${range}-${visible.end}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const investorToggle=(i:typeof stockInvestors[number])=>{const available=!visible||rows.some(r=>r[unit][i.key]!==null);return <button key={i.key} className={s.investor} aria-pressed={selected.includes(i.key)} disabled={!available} onClick={()=>toggle(i.key)} style={{'--investor-color':i.color} as React.CSSProperties} title={available?i.label+' 표시 전환':'이 기간에 제공된 값이 없습니다'}><span className={s.check} aria-hidden="true">{selected.includes(i.key)?'✓':''}</span>{i.label}{!available&&<small>미제공</small>}</button>;};
  return <main className={s.page}>
    <div className={s.hero}><div><span className={s.eyebrow}>STOCK FLOW ANALYSIS</span><h1>종목 수급 분석</h1><p>주가와 투자자별 수급을 하나의 차트에서</p></div>
      <div className={s.searchBox} ref={searchBox}><form onSubmit={submit} role="search"><label htmlFor="stock-flow-search">종목명 또는 종목코드 검색</label><div className={s.searchInput}><input id="stock-flow-search" value={query} placeholder="삼성전자 또는 005930" maxLength={60} role="combobox" aria-expanded={searchOpen} aria-controls="stock-flow-results" aria-autocomplete="list" aria-activedescendant={searchIndex>=0?'stock-result-'+searchIndex:undefined} autoComplete="off" onFocus={()=>{if(query)setSearchOpen(true);}} onChange={e=>{setQuery(e.target.value);setSearchOpen(true);}} onKeyDown={e=>{if(e.key==='Escape')setSearchOpen(false);if(e.key==='ArrowDown'){e.preventDefault();setSearchOpen(true);setSearchIndex(i=>Math.min(i+1,results.length-1));}if(e.key==='ArrowUp'){e.preventDefault();setSearchIndex(i=>Math.max(0,i-1));}}}/><button aria-label="종목 조회"><Icon name="search" size={21}/></button></div></form>
      {searchOpen&&query.trim()&&<div className={s.results} id="stock-flow-results" role="listbox" aria-label="검색된 종목">{searching?<p role="status">종목 검색 중…</p>:searchError?<p role="alert">{searchError} 6자리 종목코드로 직접 조회할 수도 있어요.</p>:results.length?results.map((r,i)=><button id={'stock-result-'+i} role="option" aria-selected={i===searchIndex} key={r.code} onClick={()=>choose(r)}><strong>{r.name}</strong><span>{r.code} · {r.market.toUpperCase()}</span></button>):<p>검색 결과가 없습니다. 종목명이나 코드를 확인해 주세요.</p>}</div>}
      </div><span className={s.badge}>KRX · 일별 수급</span>
    </div>
    <div className={s.quote}><div><h2>{visible?.name||code||'종목을 검색해 주세요'}</h2>{code&&<span>{code} · {visible?.market||'KRX'}</span>}</div>{code&&<><strong>{num(visible?.price)}<small>원</small></strong>{visible?.rate!=null&&<b className={visible.rate>=0?s.up:s.down}>{flowNumber(visible.change,'quantity')} ({flowNumber(visible.rate,'money')}%)</b>}</>}<button className={s.refresh} onClick={()=>setRefresh(v=>v+1)} disabled={!code||loading}><Icon name="refresh" size={15}/>{loading?'조회 중':'새로고침'}</button></div>
    {error&&<div className={s.notice} role="alert"><Icon name="warning"/>{error}<button onClick={()=>setRefresh(v=>v+1)}>다시 조회</button></div>}
    {visible?.warnings.map(w=><div className={s.notice} key={w}><Icon name="help" size={16}/>{w}</div>)}
    <div className="toolbar" style={{marginBottom:12}}><a className="button" href={'/cash-flow?code='+code}>기업 현금흐름 ↗</a><StockChartImageButton data={visible} selected={selected} mode={mode} unit={unit} split={split} showPrice={showPrice} loading={loading} showCash={showCash} cashData={cash.data} cashView={cashView} cashLoading={cash.loading} cashError={cash.error}/></div>
    <div className={s.layout}><section className={s.chartCard} aria-label="주가와 수급 분석">
      <div className={s.chartHeading}><h2>주가 + 투자자 수급</h2><div className={s.segment} aria-label="조회 기간">{stockRanges.map(r=><button key={r} aria-pressed={range===r} onClick={()=>setRange(r)}>{periods[r]}</button>)}</div><span className={s.daily}>일봉</span><div className={s.segment} aria-label="차트 배치"><button aria-pressed={!split} onClick={()=>setSplit(false)}>겹쳐보기</button><button aria-pressed={split} onClick={()=>setSplit(true)}>분리보기</button></div></div>
      <div className={s.toolbar}><button className={s.investor} aria-pressed={showPrice} onClick={()=>setShowPrice(v=>!v)} style={{'--investor-color':'#dce4d5'} as React.CSSProperties}><span className={s.check} aria-hidden="true">{showPrice?'✓':''}</span>주가</button>{stockInvestors.slice(0,3).map(investorToggle)}<button className={s.investor} aria-pressed={showCash} onClick={()=>{setShowCash(v=>!v);setFilingDay(null);}} style={{'--investor-color':'#d9b871'} as React.CSSProperties}><span className={s.check} aria-hidden="true">{showCash?'✓':''}</span>현금흐름</button><div className={s.segment} aria-label="수급 계산 방식"><button aria-pressed={mode==='cumulative'} onClick={()=>setMode('cumulative')}>누적 순매수</button><button aria-pressed={mode==='daily'} onClick={()=>setMode('daily')}>일별 순매수</button></div><div className={s.segment} aria-label="수급 단위"><button aria-pressed={unit==='money'} onClick={()=>setUnit('money')}>금액</button><button aria-pressed={unit==='quantity'} onClick={()=>setUnit('quantity')}>수량</button></div></div>
      {loading?<div className={s.empty} role="status"><span className={s.loadingDot}/><strong>주가와 투자자 수급을 불러오는 중</strong><small>선택 기간이 길면 조회에 시간이 걸릴 수 있어요.</small></div>:!code?<div className={s.empty}>종목을 검색하면 주가와 투자자별 수급을 확인할 수 있어요.</div>:error?<div className={s.empty}>데이터를 받지 못했습니다. 다시 조회해 주세요.</div>:<StockFlowChart key={code+range} rows={rows} values={values} selected={selected} unit={unit} mode={mode} split={split} showPrice={showPrice} onSelect={setDay} activeIndex={showCash?day:null} cashDays={showCash&&cash.data?cashDays:undefined} onFilingSelect={i=>setFilingDay(cashDays[i])}/>}
      <div className={s.chartCaption}><span>{rows.length?`${rows[0].date} ~ ${rows.at(-1)!.date} · ${rows.length}개 일봉`:'KRX 일봉 · 원주가'}</span><span>왼쪽: 주가 · 오른쪽: 수급</span></div>
      {missingCumulative&&<p className={s.gapNote}>미제공 날짜부터 누적선을 끊어 표시합니다. 이후 제공된 값은 ‘일별 순매수’에서 확인할 수 있어요.</p>}
      {showCash&&code&&!loading&&!error&&<StockCashFlowPanel days={cashDays} data={cash.data} view={cashView} onView={setCashView} activeIndex={day} onSelect={setDay} loading={cash.loading} error={cash.error} onRetry={cash.reload}/>}
      <details className={s.detailInvestors} open><summary>세부 투자자 선택 <small>제공 데이터 기준</small></summary><div>{stockInvestors.slice(3).map(investorToggle)}</div><p>기관과 기관 세부 항목은 일부 겹치는 분류입니다. 기타법인은 기관과 별도입니다.</p></details>
    </section>
    <aside className={s.sidebar}>
      <section className={s.sideCard}><h2>선택 기간 누적 순매수</h2><p className={s.sideSubtitle}>{unit==='money'?'금액 · 억원':'수량 · 주'} · {periods[range]}</p>{totals.filter(t=>selected.includes(t.key)).map(t=><div className={s.total} key={t.key}><span style={{color:t.color}}><i/>{t.label}</span><strong style={{color:t.color}}>{flowNumber(t.value,unit)}{t.value!==null?suffix:''}</strong>{!t.complete&&<small>{t.count?`확인분 합계 · ${t.count}/${t.total}일`:'제공된 값 없음'}</small>}</div>)}{!selected.length&&<p className={s.sideSubtitle}>표시할 투자자를 선택해 주세요.</p>}</section>
      {showCash&&cash.data&&<section className={s.sideCard} aria-label="선택일 현금흐름"><h2>선택일 현금흐름</h2><StockCashFlowDetail day={cashDay} view={cashView}/></section>}
      <section className={s.sideCard}><h2>표시 기준</h2><div className={s.basis}><Icon name="chart"/><div><strong>일별 수급</strong><p>수급 기준일 {visible?.flowAsOf||'—'}</p></div></div><div className={s.basis}><Icon name="layers"/><div><strong>{mode==='cumulative'?'선택 기간 누적':'일별 순매수'}</strong><p>{mode==='cumulative'?'기간 첫 거래일부터 순매수를 합산':'각 거래일의 순매수를 표시'}</p></div></div><div className={s.basis}><Icon name="clock"/><div><strong>주가·수급 날짜 연동</strong><p>KRX 기준 · 일봉은 원주가</p></div></div><p className={s.basisNote}>당일 수급은 15:40 이후 산출됩니다. 장중 추정치가 아니며, 집계가 지연되면 최근 제공된 일자를 표시합니다.</p>{visible&&<small className={s.fetched}>조회 {new Date(visible.asOf).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})}</small>}</section>
      <section className={s.sideCard}><div className={s.sideHeading}><h2>선택일 상세</h2><button onClick={download} disabled={!rows.length}><Icon name="download" size={13}/>CSV</button></div><p className={s.sideSubtitle}>{selectedDay?.date||'—'} · 일별 순매수</p>{selectedDay&&<><div className={s.closePrice}>종가 <strong>{num(selectedDay.close)}원</strong></div><div className={s.dayValues}>{stockInvestors.filter(c=>selected.includes(c.key)).map(c=><div key={c.key} style={{color:c.color}}><span>{c.label}</span><strong>{flowNumber(selectedDay[unit][c.key],unit)}{selectedDay[unit][c.key]!==null?suffix:''}</strong></div>)}</div><p className={s.sideSubtitle}>거래량 {num(selectedDay.volume)}주</p></>}</section>
    </aside></div>
    <StockCashFilingDialog day={filingDay} view={cashView} onClose={()=>setFilingDay(null)}/>
    <footer className={s.footer}><Icon name="help" size={15}/>순매수는 매수−매도입니다. 누적 수급은 보유 잔고가 아닙니다. 미제공 값은 ‘—’로 표시합니다.</footer>
  </main>;
}
