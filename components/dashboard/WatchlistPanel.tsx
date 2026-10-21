"use client";
import {useEffect,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {api} from './member-client';
import s from './MemberArea.module.css';
type Stock={code:string;name:string;market:string};
export default function WatchlistPanel(){
 const [rows,setRows]=useState<Stock[]>([]),[results,setResults]=useState<Stock[]>([]),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[searched,setSearched]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{let active=true;api('/api/watchlist').then(j=>{if(active)setRows(j.rows);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 async function search(e:FormEvent){e.preventDefault();if(!query.trim())return;setBusy(true);setError('');setMessage('');setResults([]);setSearched(false);try{const j=await api('/api/market/stocks?q='+encodeURIComponent(query.trim()));setResults(j.rows);setSearched(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function toggle(stock:Stock,remove:boolean){setBusy(true);setError('');setMessage('');try{await api('/api/watchlist',remove?'DELETE':'POST',{code:stock.code});const j=await api('/api/watchlist');setRows(j.rows);setMessage(stock.name+(remove?'을 관심 종목에서 해제했습니다.':'을 관심 종목에 저장했습니다.'));window.dispatchEvent(new Event('balta:watchlist-updated'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className={s.panel} id="watchlist"><div className={s.sectionHeading}><h2>관심 종목 <small>{rows.length} / 100</small></h2><span>WATCHLIST</span></div><p className={s.muted}>계정에 저장되어 다른 기기에서도 확인할 수 있습니다. 종목을 누르면 수급 분석으로 이동합니다.</p>
 {error&&<p className={s.error} role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 <form className={s.actions} onSubmit={search}><input aria-label="관심 종목 검색" placeholder="종목명 또는 6자리 코드" value={query} onChange={e=>setQuery(e.target.value)} maxLength={60} required/><button disabled={busy||loading}>검색</button></form>
 {searched&&<div className={s.searchResults}><h3>검색 결과</h3>{results.length?results.map(stock=>{const saved=rows.some(row=>row.code===stock.code);return <div className={s.row} key={stock.code}><div><strong>{stock.name}</strong><p className={s.muted}>{stock.code} · {stock.market.toUpperCase()}</p></div><button disabled={busy||saved||rows.length>=100} onClick={()=>void toggle(stock,false)}>{saved?'저장됨':'☆ 저장'}</button></div>;}):<p className={s.muted}>검색 결과가 없습니다.</p>}</div>}
 {loading?<p className={s.empty}>관심 종목을 불러오는 중…</p>:rows.length?<div className={s.watchGrid}>{rows.map(stock=><article className={s.watchCard} key={stock.code}><Link href={'/stock-flow?code='+stock.code}><strong>{stock.name}</strong><span>{stock.code} · {stock.market.toUpperCase()}</span><small>수급 분석 보기 →</small></Link><button disabled={busy} aria-label={stock.name+' 관심 종목 해제'} onClick={()=>void toggle(stock,true)}>★ 해제</button></article>)}</div>:<p className={s.empty}>관심 종목을 검색해 첫 종목을 저장해 보세요.</p>}
 </section>;
}
