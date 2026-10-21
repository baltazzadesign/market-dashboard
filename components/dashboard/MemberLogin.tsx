"use client";
import {useState,type FormEvent} from 'react';
import {Icon} from './Icon';
import s from '@/app/login/login.module.css';
export default function MemberLogin({setup=false}:{setup?:boolean}){
 const [visible,setVisible]=useState(false);
 const [register,setRegister]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');
 const data=Object.fromEntries(new FormData(e.currentTarget));
 if((register||setup)&&data.password!==data.confirm){setError('비밀번호 확인이 일치하지 않습니다.');setBusy(false);return;}
 try{const r=await fetch('/api/auth/'+(setup?'setup':register?'register':'login'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}),j=await r.json();if(!r.ok)throw Error(j.error);
 if(register){setRegister(false);setMessage('가입했습니다. 아이디와 비밀번호로 로그인하세요.');}
 else if(setup){location.assign('/login');}else location.assign('/');
 }catch(e){setError(e instanceof Error?e.message:'연결을 확인하세요.');}finally{setBusy(false);}}

 const title=setup?'관리자 초기 설정':register?'발타툴 회원가입':'발타툴 입장';
 return <main className={s.shell}><div className={s.ambient} aria-hidden="true"/>
 <header className={s.header}><a href="/" className={s.brand}><img src="/assets/balta-logo-v2.webp" alt="발타툴 BALTATOOL" width="200" height="76"/></a><span className={s.headerNote}>시장을 읽는 또 하나의 감각<span>MARKET INTELLIGENCE</span></span></header>
 <div className={s.stage}><section className={s.visual} aria-label="발타툴 브랜드 아트워크"><img className={s.art} src="/assets/balta-login-art.jpg" alt="금빛 달과 산수, 화투를 든 발바닥 타짜" width="869" height="1810" fetchPriority="high"/><div className={s.artGlow}/><span className={s.artCaption}>THE ART OF READING THE MARKET</span></section>
 <section className={s.entry} aria-labelledby="login-title"><div className={s.introduction}><p className={s.eyebrow}><span/> B A L T A T O O L</p><h1>시장을 읽는 눈,<br/><span>흐름을 잡는 감각.</span></h1><p className={s.description}>흩어진 시장의 신호를 한곳에.<br/> 오늘의 흐름을 발타툴에서 만나보세요.</p></div>
 <form key={String(register)} className={s.card} onSubmit={submit} aria-busy={busy}><div className={s.cardHeading}><span className={s.lock}><Icon name="lock" size={22}/></span><div><p className={s.cardKicker}>YOUR MARKET WORKSPACE</p><h2 id="login-title">{title}</h2></div><span className={s.seal}>발타</span></div><p className={s.cardDescription}>{setup?'KLTbaltatool 계정의 비밀번호를 설정하세요.':register?'나만의 계정으로 시장을 읽고 생각을 나누세요.':'아이디와 비밀번호로 나의 대시보드를 열어주세요.'}</p>
 <fieldset className={s.fields} disabled={busy}>
 {setup?<label className={s.label}>초기 설정 키<div className={s.passwordField}><input name="token" type="password" required autoComplete="off"/></div></label>:<label className={s.label}>아이디<div className={s.passwordField}><input name="username" required pattern="[A-Za-z0-9_]{4,24}" minLength={4} maxLength={24} autoComplete="username" autoCapitalize="none" placeholder="아이디를 입력하세요"/></div></label>}
 {register&&<label className={s.label}>닉네임<div className={s.passwordField}><input name="nickname" required maxLength={24} autoComplete="nickname" placeholder="게시판에서 사용할 이름"/></div></label>}
 <label className={s.label} htmlFor="member-password">비밀번호</label><div className={s.passwordField}><Icon name="lock" size={17}/><input id="member-password" name="password" type={visible?'text':'password'} required minLength={register||setup?12:1} maxLength={128} autoComplete={register||setup?'new-password':'current-password'} placeholder={register||setup?'12자 이상 입력하세요':'비밀번호를 입력하세요'}/><button className={s.visibility} type="button" aria-label={visible?'비밀번호 숨기기':'비밀번호 표시'} aria-pressed={visible} onClick={()=>setVisible(v=>!v)}><Icon name={visible?'eyeOff':'eye'}/></button></div>
 {(register||setup)&&<label className={s.label}>비밀번호 확인<div className={s.passwordField}><input name="confirm" type="password" required minLength={12} maxLength={128} autoComplete="new-password" placeholder="비밀번호를 다시 입력하세요"/></div></label>}
 </fieldset>{error&&<p className={s.error} role="alert">{error}</p>}{message&&<p className={s.cardDescription} role="status">{message}</p>}
 <button className={s.submit} disabled={busy}>{busy?'확인 중…':setup?'관리자 활성화':register?'회원가입':'대시보드 열기'}<Icon name="arrow"/></button>
 {!setup&&<button className={s.switchMode} type="button" disabled={busy} onClick={()=>{setRegister(!register);setVisible(false);setError('');setMessage('');}}>{register?'이미 계정이 있으신가요? 로그인':'처음 오셨나요? 회원가입'}</button>}
 <div className={s.foot}><Icon name="shield" size={15}/><span>{setup?'설정 키는 한 번 사용하면 폐기됩니다.':register?'신규 회원은 훈련병으로 시작합니다.':'개인 계정 · 이 브라우저에서 24시간 로그인 유지'}</span></div></form>
 <div className={s.features}><span>시장 지수</span><i/><span>투자자 수급</span><i/><span>발타 게시판</span></div></section></div>
 <footer className={s.footer}><span>GOOD DATA. BETTER DECISIONS.</span><span>© {new Date().getFullYear()} BALTATOOL</span></footer></main>;
}