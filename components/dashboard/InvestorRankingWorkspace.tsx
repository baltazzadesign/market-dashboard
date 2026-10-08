'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { investorLabel, rankingAmount, rankingInvestors, rankingMarketLabels, rankingMarkets, rankingNotes, streakLabel, type RankingEntry, type RankingMarket, type RankingResponse } from '@/lib/investor-ranking';
import type { StockInvestor } from '@/lib/stock-flow-model';
import InvestorRankingImageButton from './InvestorRankingImageButton';
import { Icon } from './Icon';
import s from './InvestorRankingWorkspace.module.css';

function RankingList({rows,side,total,count,maximum,partial}:{rows:RankingEntry[];side:'buy'|'sell';total:number;count:number;maximum:number;partial:boolean}){
  const buy=side==='buy';
  return <section className={`${s.list} ${buy?s.buy:s.sell}`} aria-label={buy?'순매수 TOP30':'순매도 TOP30'}>
    <header><div><span className={s.dot}/><h2>{buy?'순매수':'순매도'} <small>TOP 30</small></h2></div><span>{partial?'확인 범위 내 ':''}{count.toLocaleString('ko-KR')}종목</span></header>
    <div className={s.listMeta}><span>상위 {rows.length}종목 합계</span><strong>{rankingAmount(total)} <small>억원</small></strong></div>
    <ol>{rows.map((row,i)=><li key={row.code}>
      <Link href={'/stock-flow?code='+row.code} prefetch={false} title={`${row.name} (${row.code}) · ${rankingAmount(row.net)}억원 · 연속 ${streakLabel(row)} · 종목 수급 분석 열기`}>
        <span className={s.rank}>{String(i+1).padStart(2,'0')}</span>
        <div className={s.rowBody}><div className={s.rowTop}><strong>{row.name}</strong><span className={s.amount}>{rankingAmount(row.net)}</span></div>
          <div className={s.rowDetail}><span>{row.code} · {row.market.toUpperCase()}</span><span className={s.streak} title={row.exact?'이전 거래일에 0 또는 반대 방향으로 전환':'이전 기록 누락 또는 조회 한계. 확인된 연속일의 최소값입니다.'}>연속 {streakLabel(row)}</span></div>
          <div className={s.track} aria-hidden="true"><i style={{width:Math.abs(row.net)/maximum*100+'%'}}/></div>
        </div><span className={s.arrow} aria-hidden="true">↗</span>
      </Link>
    </li>)}</ol>
    {!rows.length&&<p className={s.noRows}>확인된 종목 중 {buy?'순매수':'순매도'} 종목이 없습니다.</p>}
  </section>;
}
export default function InvestorRankingWorkspace(){
  const [investor,setInvestor]=useState<StockInvestor>('pension'),[market,setMarket]=useState<RankingMarket>('all'),[date,setDate]=useState(''),[refresh,setRefresh]=useState(0);
  const [result,setResult]=useState<{key:string;data:RankingResponse}|null>(null),[dates,setDates]=useState<string[]>([]),[pending,setPending]=useState(true),[error,setError]=useState('');
  const key=[investor,market,date,refresh].join('|'),visible=result?.key===key?result.data:null;
  const loading=pending||!visible&&!error;
  useEffect(()=>{
    let alive=true;const abort=new AbortController();setPending(true);setError('');
    (async()=>{try{
      const params=new URLSearchParams({investor,market});if(date)params.set('date',date);
      const response=await fetch('/api/market/investor-ranking?'+params,{cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(20000)])});
      const body=await response.json();if(!response.ok||!body.ok)throw Error(response.status===401?'로그인이 필요합니다. 다시 로그인해 주세요.':body.error||'순위 조회에 실패했습니다.');
      if(alive){setResult({key,data:body});setDates(body.dates);}
    }catch(e){if(alive){setResult(null);setError(e instanceof Error&&e.name==='TimeoutError'?'조회 시간이 길어지고 있습니다. 다시 조회해 주세요.':e instanceof Error?e.message:'순위 조회에 실패했습니다.');}}
    finally{if(alive)setPending(false);}})();
    return()=>{alive=false;abort.abort();};
  },[investor,market,date,refresh,key]);
  const group=visible?.group,partial=!!group&&group.covered<group.expected;
  const maximum=Math.max(1,...(group?.buy??[]).map(r=>r.net),...(group?.sell??[]).map(r=>-r.net));
  return <main className={s.page}>
    <div className={s.hero}><div><span className={s.eyebrow}>INVESTOR FLOW RANKING</span><h1>{investorLabel(investor)} 매매 순위</h1><p>어떤 종목을 담고, 어떤 종목을 덜었을까.</p></div><span className={s.sourceTag}>KRX · 장후 일별 수급</span></div>
    <div className={s.controls}>
      <div className={s.tabs} role="group" aria-label="투자 주체">{rankingInvestors.map(key=><button key={key} aria-pressed={investor===key} onClick={()=>setInvestor(key)}>{investorLabel(key)}</button>)}</div>
      <div className={s.filters}><div className={s.marketTabs} role="group" aria-label="시장">{rankingMarkets.map(key=><button key={key} aria-pressed={market===key} onClick={()=>setMarket(key)}>{key==='all'?'전체':rankingMarketLabels[key]}</button>)}</div>
        <label>기준일 <select aria-label="순위 기준일" value={date} onChange={e=>setDate(e.target.value)}><option value="">최근 수집일{dates[0]?' · '+dates[0]:''}</option>{dates.map(day=><option key={day} value={day}>{day}</option>)}</select></label>
        <button onClick={()=>setRefresh(v=>v+1)} disabled={pending} className={s.refresh}><Icon name="refresh" size={14}/>{pending?'조회 중':'새로고침'}</button><InvestorRankingImageButton data={visible} disabled={loading}/>
      </div>
    </div>
    {error?<div role="alert" className={s.notice}><strong>순위를 불러오지 못했어요.</strong><p>{error}</p><button onClick={()=>setRefresh(v=>v+1)}>다시 조회</button></div>
      :loading?<div className={s.empty} role="status"><span className={s.eyebrow}>LOADING</span><h2>저장된 매매 순위를 불러오는 중</h2><p>선택한 날짜와 투자 주체를 확인하고 있어요.</p></div>
      :!group?<div className={s.empty}><span className={s.eyebrow}>WAITING FOR DATA</span><h2>아직 수집된 순위가 없어요.</h2><p>장후 수집이 끝나면 순매수·순매도 TOP30을 여기서 확인할 수 있습니다.</p><p>저장된 날짜만 조회할 수 있어요. 첫 적용 시 수집기를 한 번 실행해 주세요.</p></div>
      :<>
        <div className={s.asOf}><div><strong>{visible!.date?.replaceAll('-','.')}</strong><span>{rankingMarketLabels[market]}</span><b className={partial?s.partial:s.complete}>{partial?'일부 수집':'수집 완료'}</b></div><span>조회 완료 {new Date(visible!.collectedAt!).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})} KST</span></div>
        {partial&&<p className={s.notice} role="status">{group.expected-group.covered}종목의 금액이 아직 확인되지 않았습니다. 아래 순위와 합계는 확인된 {group.covered}종목 기준이며, 누락 종목 수집 후 바뀔 수 있습니다.</p>}
        <div className={s.metrics}>
          <div className={s.buy}><span>순매수 종목 전체 합계</span><strong>{group.covered?rankingAmount(group.buyTotal):'—'}<small>억</small></strong><p>{group.buyCount.toLocaleString('ko-KR')}종목 · {partial?'확인된 범위':'선택 범위'} 기준</p></div>
          <div className={s.sell}><span>순매도 종목 전체 합계</span><strong>{group.covered?rankingAmount(group.sellTotal):'—'}<small>억</small></strong><p>{group.sellCount.toLocaleString('ko-KR')}종목 · {partial?'확인된 범위':'선택 범위'} 기준</p></div>
          <div><span>합산 순매수</span><strong className={group.buyTotal+group.sellTotal>=0?s.positive:s.negative}>{group.covered?rankingAmount(group.buyTotal+group.sellTotal):'—'}<small>억</small></strong><p>순매수 종목 + 순매도 종목</p></div>
          <div><span>금액 확인 / 대상 종목</span><strong>{group.covered.toLocaleString('ko-KR')}<small> / {group.expected.toLocaleString('ko-KR')}</small></strong><p>순매수 0원 {group.zero.toLocaleString('ko-KR')}종목 포함</p></div>
        </div>
        <div className={s.legend}><p><span className={s.buy}>● 순매수</span><span className={s.sell}>● 순매도</span>단위 억원 · 양쪽 막대 동일 금액 척도</p><span>종목을 누르면 수급 분석으로 연결 ↗</span></div>
        <div className={s.lists}>
          <RankingList rows={group.buy} side="buy" total={group.buy.reduce((s,r)=>s+r.net,0)} count={group.buyCount} maximum={maximum} partial={partial}/>
          <RankingList rows={group.sell} side="sell" total={group.sell.reduce((s,r)=>s+r.net,0)} count={group.sellCount} maximum={maximum} partial={partial}/>
        </div>
        <details className={s.method}><summary>집계 기준과 연속일 계산</summary><ul>{rankingNotes(visible!).map(note=><li key={note}>{note}</li>)}</ul><p>수집 구간: {new Date(visible!.startedAt!).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})} ~ {new Date(visible!.collectedAt!).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})} KST</p></details>
      </>}
    <footer className={s.footer}><strong>BALTATOOL</strong><span>투자자 매매 순위</span><Link href="/stock-flow">종목 수급 분석 ↗</Link></footer>
  </main>;
}
