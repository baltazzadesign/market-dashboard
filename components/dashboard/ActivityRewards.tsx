"use client";
import {useEffect,useState} from 'react';
import {api} from './member-client';
import s from './MemberArea.module.css';
type History={id:string;kind:string;points:number;created_at:string};
type Rewards={points:number;checked:boolean;streak:number;day:string;elapsedDays:number;bonusDays:number;effectiveDays:number;history:History[];hasMore:boolean};
const labels:Record<string,string>={prediction_stock:'종목 양봉·음봉 적중',prediction_kospi:'코스피 방향 적중',prediction_kosdaq:'코스닥 방향 적중',attendance:'출석 체크',streak:'7일 연속 출석 보너스',post:'게시글 작성',comment:'댓글 작성',post_removed:'게시글 삭제 · 적립 회수',comment_removed:'댓글 삭제 · 적립 회수'};
export default function ActivityRewards(){
 const [data,setData]=useState<Rewards|null>(null),[page,setPage]=useState(0),[reload,setReload]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{let active=true;setLoading(true);const refresh=()=>api('/api/activity?page='+page).then(j=>{if(active){setData(j);setError('');}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});void refresh();window.addEventListener('focus',refresh);const timer=setInterval(refresh,60000);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);};},[page,reload]);
 async function checkin(){setBusy(true);setError('');setMessage('');try{const j=await api('/api/activity','POST',{action:'checkin'});setMessage(j.already?'오늘 출석은 이미 완료했습니다.':j.streak+'일 연속 출석! '+j.awarded+'P가 적립됐습니다.');setPage(0);setReload(n=>n+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className={s.panel} id="activity"><div className={s.sectionHeading}><h2>출석과 활동 포인트</h2><span>ACTIVITY REWARDS</span></div>
 {error&&<p role="alert" className={s.error}>{error}</p>}{message&&<p role="status" className={s.notice}>{message}</p>}
 {data?<><div className={s.rewardSummary}><div><small>활동 포인트</small><strong>{data.points.toLocaleString()} P</strong></div><div><small>진급 반영 기간</small><strong>{data.elapsedDays}일 + {data.bonusDays}일</strong><span>가입 기간 + 활동 보너스</span></div><div><small>연속 출석</small><strong>{data.streak}일</strong><span>다음 연속 출석 보너스까지 {7-data.streak%7}회</span></div></div><div className={s.actions}><button className={s.primary} disabled={busy||loading||data.checked} onClick={()=>void checkin()}>{busy?'출석 처리 중…':data.checked?'오늘 출석 완료 ✓':'오늘 출석 체크 +10P'}</button><span className={s.muted}>{data.day} · 한국 시간 자정 기준</span></div></>:<p className={s.muted}>포인트를 불러오는 중…</p>}
 <p className={s.notice}>출석 10P · 게시글 20P(하루 1개) · 댓글 5P(하루 2개) · 7일 연속 출석마다 추가 30P<br/>100P마다 진급 기간 1일을 더하며, 가입 기간의 50%까지만 반영합니다. 진급 시 차감하지 않습니다.<br/>삭제한 글·댓글의 포인트는 회수되며 당일 지급 횟수는 복구되지 않습니다. 원사 이후와 수동 지정 계급에는 가속이 적용되지 않습니다.</p>
 <h3>적립·회수 내역</h3>{loading?<p className={s.muted}>내역을 불러오는 중…</p>:data?.history.length?data.history.map(row=><div className={s.row} key={row.id}><div><strong>{labels[row.kind]??'활동'}</strong><p className={s.muted}>{new Date(row.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</p></div><strong className={row.points<0?s.rewardDeduction:s.rewardCredit}>{row.points>0?'+':''}{row.points} P</strong></div>):<p className={s.muted}>첫 출석 체크로 포인트를 모아보세요. 적용 이전 활동은 소급 지급하지 않습니다.</p>}
 <div className={s.actions}><button disabled={busy||loading||page===0} onClick={()=>setPage(n=>n-1)}>이전</button><span>{page+1} 페이지</span><button disabled={busy||loading||!data?.hasMore} onClick={()=>setPage(n=>n+1)}>다음</button></div></section>;
}
