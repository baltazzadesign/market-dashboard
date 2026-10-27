'use client';
import {useEffect,useState} from 'react';
import s from './PredictionGame.module.css';
import c from './PredictionLeaderboard.module.css';
type Row={position:number;nickname:string;points:number;wins:number;decided:number;entries:number;mine:boolean};
type Board={period:string;from:string|null;through:string;total:number;rows:Row[];me:Row|null};
const periods=[['week','이번 주'],['month','이번 달'],['all','전체']] as const;
const rate=(r:Row)=>r.decided?Math.round(r.wins/r.decided*100)+'%':'—';
export default function PredictionLeaderboard(){
 const [period,setPeriod]=useState('week'),[data,setData]=useState<Board|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();async function load(){try{
  const res=await fetch('/api/predictions/leaderboard?period='+period,{signal:controller.signal,cache:'no-store'}),body=await res.json();
  if(!res.ok)throw Error(body.error);setData(body);setError('');
 }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'순위를 불러오지 못했습니다.');}}
 void load();const timer=setInterval(()=>{if(!document.hidden)void load();},60000);return()=>{controller.abort();clearInterval(timer);};},[period,retry]);
 const current=data?.period===period?data:null;
 return <section id="leaderboard" className={`${s.panel} ${c.section}`} aria-labelledby="leaderboard-title">
  <div className={s.heading}><div><small>BALTATOOL · LEADERBOARD</small><h2 id="leaderboard-title">예측 랭킹</h2><p>지수 + 종목 적중 포인트 · TOP 50</p></div><div className={c.periods} role="group" aria-label="순위 기간">{periods.map(([value,label])=><button key={value} aria-pressed={period===value} onClick={()=>{setPeriod(value);setError('');}}>{label}</button>)}</div></div>
  {error?<p role="alert">{error} <button className={s.save} onClick={()=>setRetry(n=>n+1)}>다시 조회</button></p>:!current?<p role="status">순위를 불러오는 중…</p>:<>
   <div className={c.mine}><div><span>내 순위</span><strong>{current.me?current.me.position+'위':'아직 순위 없음'}</strong></div><div><span>획득 포인트</span><strong>{(current.me?.points??0).toLocaleString()} <small>P</small></strong></div><div><span>적중률</span><strong>{current.me?rate(current.me):'—'}</strong></div></div>
   <p className={c.caption}>{current.from??'전체 기록'} ~ {current.through} · {current.total.toLocaleString()}명 · 한국 시간 기준</p>
   {current.rows.length?<div className={c.tableWrap}><table className={c.table}><thead><tr><th scope="col">순위</th><th scope="col">닉네임</th><th scope="col">적중</th><th scope="col">적중률</th><th scope="col">포인트</th></tr></thead><tbody>{current.rows.map((r,index)=><tr key={index} className={r.mine?c.myRow:undefined}><td><span className={r.position<=3?c.medal:c.place}>{r.position}</span></td><td>{r.nickname}{r.mine&&<span className={c.you}>나</span>}</td><td>{r.wins}<small> / {r.decided}</small></td><td>{rate(r)}</td><td><strong>{r.points.toLocaleString()} P</strong></td></tr>)}</tbody></table></div>:<div className={c.empty}>아직 판정된 기록이 없습니다.<br/><small>첫 적중으로 이번 기간의 순위를 시작해 보세요.</small></div>}
  </>}
  <p className={s.note}>동일 포인트는 공동 순위입니다. 출석·게시글 포인트는 제외하며, 참여일 기준으로 집계합니다. 이번 주는 월요일부터, 이번 달은 1일부터입니다. 적중률은 적중 ÷ (적중 + 오답)이며 보합·판정 대기는 제외합니다. 결과 판정 후 반영되며 1분마다 갱신합니다.</p>
 </section>;
}
