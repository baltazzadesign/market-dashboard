'use client';
import PredictionLeaderboard from './PredictionLeaderboard';
import {useCallback,useEffect,useState} from 'react';
import PredictionResultCard,{type PredictionEntry} from './PredictionResultCard';
import StockPredictionGame from './StockPredictionGame';
import PredictionStats,{type Stats} from './PredictionStats';
import s from './PredictionGame.module.css';
type Entry=PredictionEntry;
type State={day:string;time:string;closed:string|null;open:boolean;history:Entry[];warning:string;serverNow:number;stats:Stats;poll:Partial<Record<'kospi'|'kosdaq',{up:number;down:number;total:number}>>};
const names={kospi:'코스피',kosdaq:'코스닥'};
export default function PredictionGame(){
 const [clock,setClock]=useState(0),[received,setReceived]=useState(0);
 const [data,setData]=useState<State|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{try{const response=await fetch('/api/predictions',{cache:'no-store'}),body=await response.json();if(!response.ok)throw Error(body.error);setData(body);setReceived(performance.now());setClock(performance.now());setError('');}catch(e){setError(e instanceof Error?e.message:'조회 실패');}},[]);
 useEffect(()=>{void load();const id=setInterval(()=>{if(!document.hidden)void load();},30000);return()=>clearInterval(id);},[load]);
 useEffect(()=>{const timer=setInterval(()=>setClock(performance.now()),1000);return()=>clearInterval(timer);},[]);
 const now=data?data.serverNow+Math.max(0,clock-received):0,deadline=data?Date.parse(data.day+'T14:00:00+09:00'):0,remaining=Math.max(0,Math.ceil((deadline-now)/1000)),canChoose=Boolean(data?.open&&remaining>0);
 const countdown=String(Math.floor(remaining/3600)).padStart(2,'0')+':'+String(Math.floor(remaining/60)%60).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');
 async function choose(market:string,direction:string){setBusy(true);setMessage('');try{const response=await fetch('/api/predictions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({market,direction})}),body=await response.json();if(!response.ok)throw Error(body.error);setMessage('선택이 저장되었습니다. 오후 2시 전까지 변경할 수 있습니다.');await load();}catch(e){setError(e instanceof Error?e.message:'저장 실패');}finally{setBusy(false);}}
 return <main className={s.main}><header className={s.hero}><div><small>BALTATOOL · DAILY CHALLENGE</small><h1>오늘의 방향, 당신의 선택</h1><p>지수부터 관심 종목까지.<br/>시장을 읽고 포인트를 쌓아보세요.</p></div><div className={s.heroReward}><span>한 번의 적중</span><strong>+100 <small>P</small></strong><small>오답 패널티 없음</small></div></header><nav className={s.tabs} aria-label="예측 게임 바로가기"><a href="#indices">지수 상승·하락 <span>2개 지수</span></a><a href="#stocks">종목 양봉·음봉 <span>하루 3종목</span></a><a href="#leaderboard">예측 랭킹 <span>TOP 50</span></a></nav>
 <section id="indices" className={s.panel}><div className={s.heading}><div><h2>오늘의 지수 맞히기</h2><p>{data?.day} · 09:00–14:00 KST</p></div><span className={s.badge}>{!data?'불러오는 중':data.closed?'휴장 · '+data.closed:canChoose?'참여 가능':data.time<'09:00'?'오전 9시 시작':'참여 마감'}</span></div>
 {data&&!data.closed&&<div className={s.countdown}>{now< Date.parse(data.day+'T09:00:00+09:00')?'오전 9시에 참여가 시작됩니다.':remaining>0?<>참여 마감까지 <strong>{countdown}</strong></>:'참여 마감 · 저장한 선택이 확정되었습니다.'}</div>}
 {error&&<p role="alert">{error} <button onClick={()=>void load()}>다시 조회</button></p>}{message&&<p role="status">{message}</p>}{data?.warning&&<p role="status">{data.warning}</p>}
 <div className={s.grid}>{(['kospi','kosdaq'] as const).map(market=>{const entry=data?.history.find(r=>r.day===data.day&&r.market===market),poll=data?.poll?.[market],up=poll?.total?Math.round(poll.up/poll.total*100):0;return <article className={s.card} key={market}><small>{market.toUpperCase()}</small><h2>{names[market]}</h2><p>{entry?'내 선택: '+(entry.direction==='up'?'상승 ▲':'하락 ▼'):'아직 선택하지 않았습니다.'}</p><div className={s.choices}>{(['up','down'] as const).map(direction=><button key={direction} className={direction==='up'?s.up:s.down} aria-pressed={entry?.direction===direction} disabled={!canChoose||busy} onClick={()=>void choose(market,direction)}>{direction==='up'?'▲ 상승':'▼ 하락'}{entry?.direction===direction?' ✓':''}</button>)}</div>{poll?<div className={s.poll}><div><span>상승 {up}%</span><span>하락 {100-up}%</span></div><div className={s.pollBar}><i style={{width:up+'%'}}/></div><small>{poll.total.toLocaleString()}명 참여 · 30초마다 갱신</small></div>:<p className={s.note}>선택을 저장하면 이 지수의 참여 비율이 공개됩니다.</p>}<p>{entry?.result==='win'?'+100 P 지급 완료':entry?.result==='lose'?'아쉽지만 다음 기회에 · 차감 없음':entry?.result==='flat'?'보합 · 지급/차감 없음':entry?'마감 후 판정 대기':'지수별 하루 한 번 참여 · 마감 전 수정 가능'}</p></article>;})}</div>
 <details className={s.rules}><summary>판정 기준과 포인트 안내</summary><p className={s.note}>당일 정규장 종가와 전 거래일 종가를 비교합니다. 오후 4시부터 종가 데이터를 확인하며, 오후 6시 예약 확인과 이 페이지 조회 시 미판정 건을 재확인합니다. 데이터 누락 시 대기하며, 보합은 보상 없이 종료합니다. 두 지수 모두 적중하면 하루 최대 200 P입니다.</p></details></section>
 <StockPredictionGame/>
 <PredictionLeaderboard/>
 <div id="scorecard">{data?.stats&&<PredictionStats stats={data.stats}/>}</div>
 {data?.history.some(r=>r.result)&&<section className={s.panel}><h2>내 결과 카드</h2><p>최근 판정 6건 · 실제 종가와 받은 포인트를 확인하고 저장하세요.</p><div className={s.grid}>{data.history.filter(r=>r.result).slice(0,6).map(r=><PredictionResultCard key={r.id} entry={r}/>)}</div></section>}
 <section className={s.panel}><h2>내 최근 참여 기록</h2><p>최근 60건 · 포인트는 마이페이지 적립 내역에서도 확인할 수 있습니다.</p><div className={s.history}>{data?.history.length?data.history.map(r=><div className={s.row} key={r.id}><span>{r.day}<small>{names[r.market]} · {r.direction==='up'?'상승':'하락'} 선택</small></span><strong>{r.result==='win'?'+100 P':r.result==='lose'?'오답 · 0 P':r.result==='flat'?'보합 · 0 P':'판정 대기'}</strong></div>):<p>참여 기록이 없습니다.</p>}</div></section></main>;
}
