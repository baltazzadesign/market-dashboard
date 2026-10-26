'use client';
import {useRef,useState} from 'react';
import s from './PredictionGame.module.css';
export type PredictionEntry={id:string;day:string;market:'kospi'|'kosdaq';direction:'up'|'down';result:'win'|'lose'|'flat'|null;reward:number;close?:number;previous_close?:number};
export default function PredictionResultCard({entry:r}:{entry:PredictionEntry}){
 const ref=useRef<HTMLDivElement>(null),lock=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const pct=r.close&&r.previous_close?(r.close/r.previous_close-1)*100:null;
 async function save(){if(!ref.current||lock.current)return;lock.current=true;setBusy(true);setError('');let clone:HTMLElement|null=null;try{
  const {toBlob}=await import('html-to-image');clone=ref.current.cloneNode(true) as HTMLElement;Object.assign(clone.style,{position:'fixed',left:'-10000px',top:'0',width:'440px',boxSizing:'border-box'});document.body.appendChild(clone);await document.fonts.ready;
  const blob=await toBlob(clone,{pixelRatio:2,backgroundColor:'#10170f',style:{position:'static',left:'auto',top:'auto'}});if(!blob)throw Error('이미지 생성 실패');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`baltatool-result-${r.day}-${r.market}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }catch{setError('저장하지 못했습니다. 다시 시도하세요.');}finally{clone?.remove();lock.current=false;setBusy(false);}}
 return <article><div ref={ref} className={s.resultCard}><small>BALTATOOL · 오늘의 지수 맞히기</small><h3>{r.day} · {r.market==='kospi'?'코스피':'코스닥'}</h3><strong className={s.resultTitle}>{r.result==='win'?'적중! +100 P':r.result==='lose'?'다음 기회에 · 0 P':'보합 · 0 P'}</strong><p>내 선택 <b>{r.direction==='up'?'▲ 상승':'▼ 하락'}</b></p><p>실제 등락률 <b>{pct===null?'확인 대기':`${pct>0?'+':''}${pct.toFixed(2)}%`}</b></p><p>종가 <b>{r.close?.toLocaleString('ko-KR',{maximumFractionDigits:2})??'—'}</b></p><small>전 거래일 종가 대비 · 오답 차감 없음 · baltatool.com</small></div><button className={s.save} disabled={busy} onClick={()=>void save()}>{busy?'이미지 생성 중…':'결과 카드 PNG 저장'}</button>{error&&<p role="alert">{error}</p>}</article>;
}
