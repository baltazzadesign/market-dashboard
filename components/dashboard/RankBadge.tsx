import {RANKS} from '@/lib/member-ranks';
import s from './MemberArea.module.css';
// Original vector drawings following the Korean rank motifs, sized for UI use.
function Star({x,y,size=5}:{x:number;y:number;size?:number}){return <polygon points={Array.from({length:10},(_,i)=>{const a=i*Math.PI/5-Math.PI/2,r=i%2?size*.42:size;return `${x+Math.cos(a)*r},${y+Math.sin(a)*r}`;}).join(' ')}/>;}
function Flower({x,y}:{x:number;y:number}){return <g transform={`translate(${x} ${y})`}>{[0,72,144,216,288].map(a=><ellipse key={a} cx="0" cy="-2.8" rx="2.5" ry="3.5" transform={`rotate(${a})`}/>)}<circle r="1.4" fill="#85745a"/></g>;}
function Leaves(){return <g fill="none" stroke="currentColor" strokeWidth="1.1"><path d="M18 34C8 34 5 29 5 24M18 34C28 34 31 29 31 24"/>{[0,1,2].map(i=><g key={i}><path d={`M${7+i*3} ${29+i*1.5}q-5 -1 -3 -5q4 0 3 5M${29-i*3} ${29+i*1.5}q5 -1 3 -5q-4 0 -3 5`}/></g>)}</g>;}
export function RankIcon({rank}:{rank:number}){
 const gold=rank>=5&&rank<=9;
 return <svg className={s.rankIcon} viewBox="0 0 36 38" aria-hidden="true" style={{color:gold?'#deb96b':'#e5e7dc'}} fill="currentColor">
 {rank===0?<g fill="none" stroke="#8d937f" strokeWidth="1.5"><path d="M18 7l9 4v8c0 7-9 12-9 12S9 26 9 19v-8z"/><path d="M14 19h8"/></g>:rank<=4?<>{Array.from({length:rank},(_,i)=><rect key={i} x="7" y={24-(rank-1)*5+i*5} width="22" height="3" rx=".5"/>)}</>:rank<=8?<>{rank===8&&<Star x={18} y={6} size={4}/>}<g fill="none" stroke="currentColor" strokeWidth="2.3">{Array.from({length:Math.min(3,rank-4)},(_,i)=><path key={i} d={`M8 ${17+i*5}l10 -6l10 6`}/>)}</g><Leaves/></>:rank<=12?<>{Array.from({length:rank===9?1:rank-9},(_,i)=>{const n=rank===9?1:rank-9,x=18-(n-1)*5+i*10;return <path key={i} d={`M${x} 14l4 4l-4 4l-4 -4z`}/>;})}<Leaves/></>:rank<=15?<>{Array.from({length:rank-12},(_,i)=><Flower key={i} x={18-(rank-13)*6+i*12} y={18}/>)}<Leaves/></>:<>{Array.from({length:rank-15},(_,i)=>{const n=rank-15,a=-Math.PI/2+i*2*Math.PI/5;return <Star key={i} x={n===5?18+12*Math.cos(a):n<=3?18-(n-1)*6+i*12:10+(i%2)*16} y={n===5?19+12*Math.sin(a):n<=3?19:12+Math.floor(i/2)*14} size={n===5?4.4:5.2}/>;})}</>}
 </svg>;
}
export default function RankBadge({rank}:{rank:number}){return <span className={s.rankBadge} title={rank===0?'신규 가입 단계':RANKS[rank]}><RankIcon rank={rank}/><span>{RANKS[rank]??'회원'}</span></span>;}

export function AdminBadge({role}:{role?:string}){if(role!=='admin'&&role!=='owner')return null;return <span className={s.adminBadge}><svg viewBox="0 0 36 38" className={s.rankIcon} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M18 3L31 8v12c0 8-13 15-13 15S5 28 5 20V8Z" fill="currentColor" fillOpacity=".08"/>{role==='owner'?<><path d="M10 13l4 4l4-7l4 7l4-4l-2 12H12Z" fill="currentColor" strokeLinejoin="round"/><path d="M12 28h12"/></>:<><path d="M11 19l5 5l10-11" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M13 29h10"/></>}</svg><span>{role==='owner'?'최고 관리자':'관리자'}</span></span>;}
