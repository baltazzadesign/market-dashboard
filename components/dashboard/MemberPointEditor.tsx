'use client';
import {useEffect,useRef,useState} from 'react';
import type {Member} from '@/lib/member-ranks';
import {api} from './member-client';
import s from './MemberArea.module.css';
type Adjustment={id:string;actor_name:string;delta:number;reason:string;balance_after:number;created_at:string};
export default function MemberPointEditor({member,onClose,onSaved}:{member:Member;onClose:()=>void;onSaved:(balance:number)=>void}){
 const [balance,setBalance]=useState(member.activity_points??0),[mode,setMode]=useState('add'),[amount,setAmount]=useState('100'),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[history,setHistory]=useState<Adjustment[]>([]),[reload,setReload]=useState(0);
 const pending=useRef<{key:string;id:string}|null>(null);
 useEffect(()=>{const panel=document.getElementById('member-point-editor');panel?.focus({preventScroll:true});panel?.scrollIntoView({block:'start'});},[member.id]);
 useEffect(()=>{let active=true;api('/api/members/points?id='+member.id).then(j=>{if(active){setBalance(j.balance);setHistory(j.history);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[member.id,reload]);
 async function save(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');
  const delta=Number(amount)*(mode==='add'?1:-1),key=JSON.stringify([member.id,delta,reason.trim()]);
  if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
  try{const j=await api('/api/members/points','POST',{id:member.id,delta,reason,requestId:pending.current.id});setBalance(j.balance);onSaved(j.balance);setMessage((j.already?'이미 반영된 요청입니다.':'포인트 변경을 저장했습니다.')+' 현재 '+j.balance.toLocaleString()+' P');setReason('');pending.current=null;setReload(n=>n+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section id="member-point-editor" tabIndex={-1} className={s.panel} aria-label="회원 포인트 조정" style={{marginTop:20,scrollMarginTop:220}}><div className={s.sectionHeading}><h2>{member.nickname} · 포인트 조정</h2><button disabled={busy} onClick={onClose}>닫기</button></div><p>{member.username} · 보유 <strong>{balance.toLocaleString()} P</strong></p>
 <form className={s.form} onSubmit={save}><div className={s.actions}><label>처리 방식<select disabled={busy} value={mode} onChange={e=>setMode(e.target.value)}><option value="add">추가</option><option value="subtract">차감</option></select></label><label>포인트<input disabled={busy} type="number" min="1" max="10000" step="1" required value={amount} onChange={e=>setAmount(e.target.value)}/></label></div><label>변경 사유<input disabled={busy} required minLength={2} maxLength={200} value={reason} onChange={e=>setReason(e.target.value)} placeholder="예: 이벤트 보상, 중복 지급 정정"/></label><p className={s.muted}>1회 최대 10,000P · 차감 후 잔액은 0P 이상이어야 합니다. 활동 진급에 반영되며, 미니게임 랭킹에는 포함되지 않습니다.</p><div><button className={s.primary} disabled={busy}>{busy?'저장 중…':mode==='add'?'포인트 추가':'포인트 차감'}</button></div></form>
 {error&&<p role="alert" className={s.error}>{error}</p>}{message&&<p role="status">{message}</p>}
 <h3>관리자 조정 내역 · 최근 30건</h3>{history.length?history.map(r=><div className={s.row} key={r.id}><div><strong>{r.delta>0?'+':''}{r.delta.toLocaleString()} P · 잔액 {r.balance_after.toLocaleString()} P</strong><p style={{overflowWrap:'anywhere'}}>{r.reason}</p><small className={s.muted}>{r.actor_name} · {new Date(r.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</small></div></div>):<p className={s.muted}>관리자 조정 기록이 없습니다.</p>}</section>;
}
