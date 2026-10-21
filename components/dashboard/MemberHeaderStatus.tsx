"use client";
import {useEffect,useState} from 'react';
import {rankProgress,type Member} from '@/lib/member-ranks';
import RankBadge,{AdminBadge} from './RankBadge';
import styles from './TerminalHeader.module.css';

export default function MemberHeaderStatus({member}:{member:Member}) {
 const [now,setNow]=useState(()=>Date.now());
 const [hidden,setHidden]=useState<boolean|null>(null);
 useEffect(()=>{try{setHidden(localStorage.getItem('balta.member-header.hidden')==='1');}catch{setHidden(false);}},[]);
 function toggle(){const next=!hidden;setHidden(next);try{localStorage.setItem('balta.member-header.hidden',next?'1':'0');}catch{}}

 useEffect(()=>{const refresh=()=>setNow(Date.now());const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[]);
 const progress=rankProgress(member,now);
 if(hidden===null)return null;
 if(hidden)return <div className={styles.memberStrip}><div className={styles.memberCollapsed}><button type="button" className={styles.memberToggle} onClick={toggle} aria-expanded={false}>내 정보 보기 <span aria-hidden="true">⌄</span></button></div></div>;

 return <div className={styles.memberStrip}><div className={styles.memberInner}>
  <div className={styles.memberIdentity}><RankBadge rank={progress.rank}/><a href="/mypage" className={styles.memberNickname} title="마이페이지 열기">{member.nickname}</a><AdminBadge role={member.role}/></div>
  <div className={styles.memberExperience}>
   <div className={styles.experienceLabels}><span>{progress.detail}</span><strong>{progress.label}</strong></div>
   <div className={styles.experienceTrack} role="progressbar" aria-label="다음 계급까지 경험치" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-valuetext={progress.detail+' · '+progress.label}><span style={{width:progress.percent+'%'}}/></div>
  </div>
  <button type="button" className={styles.memberToggle} onClick={toggle} aria-expanded={true} aria-label="계급, 닉네임, 경험치 숨기기">숨기기 <span aria-hidden="true">⌃</span></button>
 </div></div>;
}
