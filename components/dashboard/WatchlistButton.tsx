"use client";
import {useEffect,useState} from 'react';
import {api} from './member-client';
import s from './WatchlistButton.module.css';
export default function WatchlistButton({code}:{code:string}){
 const [saved,setSaved]=useState(false),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;setReady(false);setError('');const refresh=()=>api('/api/watchlist').then(j=>{if(active){setSaved(j.rows.some((row:{code:string})=>row.code===code));setReady(true);}}).catch(e=>{if(active)setError(e.message);});void refresh();window.addEventListener('balta:watchlist-updated',refresh);return()=>{active=false;window.removeEventListener('balta:watchlist-updated',refresh);};},[code]);
 async function toggle(){setBusy(true);setError('');try{await api('/api/watchlist',saved?'DELETE':'POST',{code});setSaved(!saved);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <span className={s.wrap}><button type="button" disabled={!ready||busy} aria-pressed={saved} onClick={()=>void toggle()}>{busy?'저장 중…':saved?'★ 관심 종목':'☆ 관심 종목 저장'}</button>{error&&<small role="alert">{error} <a href="/mypage#watchlist">관심 종목 관리</a></small>}</span>;
}
