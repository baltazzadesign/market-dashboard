'use client';
import Link from 'next/link';
import {useCallback,useEffect,useState} from 'react';
import s from './PredictionNotifications.module.css';
type Notice={id:string;day:string;market:'kospi'|'kosdaq';result:string;reward:number};
export default function PredictionNotifications(){
 const [items,setItems]=useState<Notice[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=useCallback(async(signal?:AbortSignal)=>{try{const response=await fetch('/api/predictions/notifications',{cache:'no-store',signal});if(response.status===401){setItems([]);return;}if(response.ok){const body=await response.json();setItems(body.items);}}catch{/* Keep the site usable if notifications are temporarily unavailable. */}},[]);
 useEffect(()=>{const controller=new AbortController();void load(controller.signal);const refresh=()=>{if(!document.hidden)void load(controller.signal);};const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);};},[load]);
 async function dismiss(){if(busy)return;setBusy(true);setError('');try{const response=await fetch('/api/predictions/notifications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ids:items.map(n=>n.id)})});if(!response.ok)throw Error();await load();}catch{setError('읽음 처리에 실패했습니다. 다시 눌러주세요.');}finally{setBusy(false);}}
 if(!items.length)return null;
 const points=items.reduce((total,n)=>total+n.reward,0);
 return <aside className={s.notice} aria-label="새 미니게임 결과"><div role="status"><strong>지수 맞히기 결과 {items.length}건</strong><p>{points?`+${points.toLocaleString()} P가 지급되었습니다.`:'새 결과가 도착했습니다. 포인트 차감은 없습니다.'}</p></div><ul>{items.slice(0,2).map(n=><li key={n.id}>{n.day} {n.market==='kospi'?'코스피':'코스닥'} · {n.result==='win'?'적중 +100 P':n.result==='flat'?'보합 0 P':'오답 0 P'}</li>)}</ul>{items.length>2&&<small>외 {items.length-2}건</small>}<div className={s.actions}><Link href="/predictions#scorecard">성적·결과 보기</Link><button disabled={busy} onClick={()=>void dismiss()}>{busy?'처리 중…':'확인 · 닫기'}</button></div>{error&&<p role="alert">{error}</p>}</aside>;
}
