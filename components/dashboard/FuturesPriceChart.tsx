"use client";
import { useState } from 'react';
import { formatNumber as n } from '@/lib/balta-model';
import { FUTURE_PRODUCTS, type FutureProduct, type FuturesResponse, type FutureRange, type FutureSeries } from '@/lib/futures-model';
import type { SessionMode } from '@/lib/futures-session';
import { useTerminalData } from './useTerminalData';
import { CandlePlot } from './TerminalCandlePlot';
import { Icon } from './Icon';
import { Modal } from './Modal';
import styles from './TerminalPriceChart.module.css';
const ranges:FutureRange[]=['1D','1W','1M','3M','1Y'];
const modes:Record<SessionMode,string>={DAY:'주간',NIGHT:'야간',ALL:'통합'};
const dateTime=(s:string)=>new Date(s).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
export function FuturesPriceChart({product}:{product:FutureProduct}) {
  const [mode,setMode]=useState<SessionMode>('DAY'),[range,setRange]=useState<FutureRange>('1D'),[series,setSeries]=useState<FutureSeries>('current'),[line,setLine]=useState(false),[expanded,setExpanded]=useState(false);
  const url='/api/market/futures?'+new URLSearchParams({product,session:mode,range,series});
  const feed=useTerminalData<FuturesResponse>(url,10000),data=feed.data,q=data?.quote;
  const name=mode==='NIGHT'?FUTURE_PRODUCTS[product].replace(' 선물',' 야간선물'):FUTURE_PRODUCTS[product];
  const status=data?.status==='DAY'?'주간선물':data?.status==='NIGHT'?'야간선물':null;
  const plot=(height=228)=>feed.loading&&!data?<div className="terminal-empty terminal-price-empty" role="status">선물 시세 조회 중…</div>:!data?.candles.length?<div className="terminal-empty terminal-price-empty" role="status">{feed.error?'선물 데이터를 조회하지 못했습니다.':'아직 표시할 선물 기록이 없습니다.'}</div>:<CandlePlot candles={data.candles} range={range} height={height} line={line} timeScale={range==='1D'} priceDigits={2}/>;
  return <div className={styles.futures}>
    <div className={'terminal-chart-tools '+styles.tools}>
      <div className="terminal-segments" aria-label="선물 세션">{(Object.keys(modes) as SessionMode[]).map(v=><button key={v} className={mode===v?'active':''} aria-pressed={mode===v} onClick={()=>setMode(v)}>{modes[v]}</button>)}</div>
      <div className={'terminal-time-switch '+styles.periods}>{ranges.map(v=><button key={v} className={range===v?'active':''} aria-pressed={range===v} onClick={()=>setRange(v)}>{v}</button>)}</div>
      <select aria-label="선물 차트 표시 방식" value={line?'line':'candle'} onChange={e=>setLine(e.target.value==='line')}><option value="candle">캔들</option><option value="line">라인</option></select>
      <button className="terminal-icon-button" aria-label="선물 차트 확대" onClick={()=>setExpanded(true)}><Icon name="expand" size={16}/></button>
    </div>
    <div className={styles.contract}><strong>{name}</strong><span>{data?.contract?`${data.contract.contract_code} · 만기 ${data.contract.expiry}`:'최근월물 확인 중'}</span></div>
    <div className={styles.sessionStatus} role="status"><span className={data?.live?styles.live:''}>{!data?'조회 중':!status?'장 마감':data.live?`● ${status} 거래중`:`${status} 세션 · 수신 확인 중`}</span><label>이력 <select aria-label="선물 이력 기준" value={series} onChange={e=>setSeries(e.target.value as FutureSeries)}><option value="current">현재월물</option><option value="continuous">수집 연속선물</option></select></label></div>
    <div className="terminal-price-readout"><strong>{n(q?.price,2)}</strong>{q?.rate!=null&&<span className={q.rate>=0?'positive':'negative'}>{n(q.change,2,true)} ({n(q.rate,2,true)}%)</span>}</div>
    {q&&<div className={styles.observed}>{q.session==='NIGHT'?'야간':'주간'} {q.eventTimeKnown?'체결':'REST 조회'} {dateTime(q.observed_at)}{q.contract_code!==data?.contract?.contract_code?` · ${q.contract_code} 마지막 수신`:''}{!q.eventTimeKnown?' · 체결 시각 미제공':''}</div>}
    {feed.error&&<div className={styles.warning} role="alert">{feed.error} {data?'마지막 조회 기록을 표시합니다.':''}<button onClick={feed.refresh}>다시 조회</button></div>}
    {plot()}
    <div className="terminal-chart-caption"><span>{data?.caption??'선물 가격 차트'}</span><span>{mode==='ALL'?'주간 / 야간 영역 구분':'KST'}</span></div>
    {mode==='NIGHT'&&data?.status!=='NIGHT'&&data?.nightEnd&&<p className={styles.observed}>최근 야간장 종료 {dateTime(data.nightEnd)} · {q?'마지막 관측가 '+n(q.price,2):'수신 기록 없음'}</p>}
    <dl className={styles.metrics}>{[['시가',q?.open],['고가',q?.high],['저가',q?.low],['거래량',q?.volume],['거래대금',q?.turnover],['미결제약정',q?.openInterest],['Basis (KIS)',q?.basis],['괴리율',q?.divergence]].map(([label,value])=><div key={String(label)}><dt>{label}</dt><dd>{n(value as number|null|undefined,label==='거래량'||label==='미결제약정'||label==='거래대금'?0:2)}{label==='괴리율'&&value!=null?'%':''}</dd></div>)}</dl>
    {!!data?.warnings.length&&<details className={styles.notes}><summary>데이터 안내{data.warnings.length>0?' · '+data.warnings.length:''}</summary>{data.warnings.map(w=><p key={w}>{w}</p>)}</details>}
    <Modal open={expanded} onClose={()=>setExpanded(false)} title={`${name} · ${modes[mode]} · ${range}`} wide><div className="terminal-expanded-chart">{plot(360)}<div className="terminal-chart-caption">{data?.caption} · {series==='continuous'?'무보정 수집 연속선물':'현재월물'}</div></div></Modal>
  </div>;
}
