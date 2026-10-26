'use client';
import {useCallback,useEffect,useState} from 'react';
import s from './PredictionGame.module.css';
type Entry={id:string;day:string;market:'kospi'|'kosdaq';direction:'up'|'down';result:'win'|'lose'|'flat'|null;reward:number};
type State={day:string;time:string;closed:string|null;open:boolean;history:Entry[];warning:string};
const names={kospi:'코스피',kosdaq:'코스닥'};
export default function PredictionGame(){
 const [data,setData]=useState<State|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{try{const response=await fetch('/api/predictions',{cache:'no-store'}),body=await response.json();if(!response.ok)throw Error(body.error);setData(body);setError('');}catch(e){setError(e instanceof Error?e.message:'조회 실패');}},[]);
 useEffect(()=>{void load();const id=setInterval(()=>{if(!document.hidden)void load();},30000);return()=>clearInterval(id);},[load]);
 async function choose(market:string,direction:string){setBusy(true);setMessage('');try{const response=await fetch('/api/predictions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({market,direction})}),body=await response.json();if(!response.ok)throw Error(body.error);setMessage('선택이 저장되었습니다. 오후 2시 전까지 변경할 수 있습니다.');await load();}catch(e){setError(e instanceof Error?e.message:'저장 실패');}finally{setBusy(false);}}
 return <main className={s.main}><header className={s.hero}><small>BALTATOOL · DAILY CHALLENGE</small><h1>오늘의 지수 맞히기</h1><p>오늘 종가는 전 거래일보다 오를까요, 내릴까요?</p><strong>적중한 지수마다 +100 P · 오답 패널티 없음</strong></header>
 <section className={s.panel}><div className={s.heading}><div><h2>{data?.day??'오늘'}의 선택</h2><p>한국 시간 09:00 시작 · 14:00 마감</p></div><span className={s.badge}>{!data?'불러오는 중':data.closed?'휴장 · '+data.closed:data.open?'참여 가능':data.time<'09:00'?'오전 9시 시작':'참여 마감'}</span></div>
 {error&&<p role="alert">{error} <button onClick={()=>void load()}>다시 조회</button></p>}{message&&<p role="status">{message}</p>}{data?.warning&&<p role="status">{data.warning}</p>}
 <div className={s.grid}>{(['kospi','kosdaq'] as const).map(market=>{const entry=data?.history.find(r=>r.day===data.day&&r.market===market);return <article className={s.card} key={market}><small>{market.toUpperCase()}</small><h2>{names[market]}</h2><p>{entry?'내 선택: '+(entry.direction==='up'?'상승 ▲':'하락 ▼'):'아직 선택하지 않았습니다.'}</p><div className={s.choices}>{(['up','down'] as const).map(direction=><button key={direction} className={direction==='up'?s.up:s.down} aria-pressed={entry?.direction===direction} disabled={!data?.open||busy} onClick={()=>void choose(market,direction)}>{direction==='up'?'▲ 상승':'▼ 하락'}{entry?.direction===direction?' ✓':''}</button>)}</div><p>{entry?.result==='win'?'+100 P 지급 완료':entry?.result==='lose'?'아쉽지만 다음 기회에 · 차감 없음':entry?.result==='flat'?'보합 · 지급/차감 없음':entry?'마감 후 판정 대기':'지수별 하루 한 번 참여 · 마감 전 수정 가능'}</p></article>;})}</div>
 <p className={s.note}>당일 정규장 종가와 전 거래일 종가를 비교합니다. 오후 4시부터 종가 데이터를 확인하며, 오후 6시 예약 확인과 이 페이지 조회 시 미판정 건을 재확인합니다. 데이터 누락 시 대기하며, 보합은 보상 없이 종료합니다. 두 지수 모두 적중하면 하루 최대 200 P입니다.</p></section>
 <section className={s.panel}><h2>내 최근 참여 기록</h2><p>최근 60건 · 포인트는 마이페이지 적립 내역에서도 확인할 수 있습니다.</p><div className={s.history}>{data?.history.length?data.history.map(r=><div className={s.row} key={r.id}><span>{r.day}<small>{names[r.market]} · {r.direction==='up'?'상승':'하락'} 선택</small></span><strong>{r.result==='win'?'+100 P':r.result==='lose'?'오답 · 0 P':r.result==='flat'?'보합 · 0 P':'판정 대기'}</strong></div>):<p>참여 기록이 없습니다.</p>}</div></section></main>;
}
