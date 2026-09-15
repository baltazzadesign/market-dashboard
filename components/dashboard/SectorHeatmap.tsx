"use client";

import {useCallback,useEffect,useMemo,useState} from 'react';
import {isValidDate,kstParts} from '@/lib/balta-model';
import {rankSectorStrength,type Sector,type SectorStrength} from '@/lib/market-research';

type MarketFilter='all'|'kospi'|'kosdaq';
type Snapshot={time?:string;capturedAt?:string|null;market_data?:{sectors?:Sector[]}};
type ApiResponse={ok?:boolean;date?:string;snapshot?:Snapshot|null;error?:string};

function tone(score:number){
 const alpha=Math.min(.72,.12+Math.abs(score)/100*.6);
 if(score>0)return `rgba(239,68,68,${alpha})`;
 if(score<0)return `rgba(59,130,246,${alpha})`;
 return 'rgba(148,163,184,.12)';
}
function borderTone(score:number){
 if(score>0)return 'rgba(248,113,113,.7)';
 if(score<0)return 'rgba(96,165,250,.7)';
 return 'rgba(148,163,184,.25)';
}
function changeText(value:number|null){return value==null?'—':`${value>0?'+':''}${value.toFixed(2)}%`;}
function scoreText(value:number){return `${value>0?'+':''}${value}`;}
function marketName(value:'kospi'|'kosdaq'){return value==='kospi'?'KOSPI':'KOSDAQ';}
function strengthLabel(value:number){if(value>=60)return '강한 주도';if(value>=25)return '강세';if(value<=-60)return '강한 약세';if(value<=-25)return '약세';return '중립';}

export default function SectorHeatmap({dateOverride,compact=false}:{dateOverride?:string;compact?:boolean}={}){
 const [date,setDate]=useState('');
 const [filter,setFilter]=useState<MarketFilter>('all');
 const [sectors,setSectors]=useState<Sector[]>([]);
 const [snapshotTime,setSnapshotTime]=useState('');
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [selectedKey,setSelectedKey]=useState('');

 useEffect(()=>{
  const today=kstParts().date;
  if(dateOverride&&isValidDate(dateOverride)&&dateOverride<=today){setDate(dateOverride);return;}
  const requested=new URLSearchParams(window.location.search).get('date');
  setDate(requested&&isValidDate(requested)&&requested<=today?requested:today);
 },[dateOverride]);

 const load=useCallback(async()=>{
  if(!date)return;
  setLoading(true);setError('');
  try{
   const response=await fetch(`/api/market/sectors?date=${encodeURIComponent(date)}`,{cache:'no-store'});
   const json=await response.json() as ApiResponse;
   if(response.status===401){window.location.assign('/login');return;}
   if(!response.ok||json.ok!==true)throw new Error(json.error??'섹터 데이터를 불러오지 못했습니다.');
   const raw=json.snapshot?.market_data?.sectors;
   setSectors(Array.isArray(raw)?raw:[]);
   setSnapshotTime(String(json.snapshot?.time??''));
  }catch(e){setError(e instanceof Error?e.message:'섹터 데이터를 불러오지 못했습니다.');}
  finally{setLoading(false);}
 },[date]);

 useEffect(()=>{void load();},[load]);

 const ranked=useMemo(()=>rankSectorStrength(sectors),[sectors]);
 const visible=useMemo(()=>ranked.filter(s=>filter==='all'||s.market===filter),[ranked,filter]);
 const visibleKeys=useMemo(()=>new Set(visible.map(s=>`${s.market}:${s.code}`)),[visible]);
 const selected=useMemo(()=>{
  if(selectedKey&&visibleKeys.has(selectedKey))return visible.find(s=>`${s.market}:${s.code}`===selectedKey)??null;
  return visible[0]??null;
 },[selectedKey,visible,visibleKeys]);
 const leaders=visible.slice(0,5);
 const laggards=[...visible].sort((a,b)=>a.strength-b.strength).slice(0,5);
 const positive=visible.filter(s=>s.strength>10).length;
 const negative=visible.filter(s=>s.strength<-10).length;
 const neutral=Math.max(0,visible.length-positive-negative);

 function changeDate(next:string){
  if(!isValidDate(next))return;
  const params=new URLSearchParams(window.location.search);params.set('date',next);
  window.location.assign(`${window.location.pathname}?${params.toString()}`);
 }

 return <section className={'panel sector-heatmap-panel'+(compact?' compact':'')} style={compact?undefined:{maxWidth:1400,margin:'18px auto 30px',padding:18}} aria-labelledby="sector-heatmap-title">
  <div className="panel-header sector-heatmap-header" style={{display:'flex',gap:16,alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap'}}>
   <div><h2 id="sector-heatmap-title" className="panel-title" style={{marginBottom:5}}>섹터 강도 · Heatmap</h2><p className="panel-subtitle" style={{margin:0}}>색 강도 = 상대 섹터 강도 · 타일 크기 = 거래대금 순위</p></div>
   <div className="toolbar" style={{gap:8,flexWrap:'wrap'}}>
    {!dateOverride&&<input aria-label="섹터 날짜" type="date" value={date} max={kstParts().date} onChange={e=>changeDate(e.target.value)}/>}
    {(['all','kospi','kosdaq'] as const).map(value=><button key={value} type="button" className={'button small'+(filter===value?' active':'')} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{value==='all'?'전체':value.toUpperCase()}</button>)}
    <button type="button" className="button small" disabled={loading} onClick={()=>void load()}>{loading?'조회 중':'새로고침'}</button>
   </div>
  </div>

  {error?<div role="alert" style={{padding:'20px 0'}}>{error}</div>:loading?<div style={{padding:'28px 0'}}>섹터 데이터 조회 중…</div>:!visible.length?<div style={{padding:'28px 0'}}>해당 날짜의 섹터 저장 데이터가 없습니다.</div>:<>
   <div className="sector-heatmap-stats" style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:10,margin:'16px 0'}}>
    <div style={{padding:12,border:'1px solid #2a313b',borderRadius:8,background:'#11161c'}}><small>강세 섹터</small><div style={{fontSize:22,fontWeight:800,marginTop:4,color:'#ff7474'}}>{positive}</div></div>
    <div style={{padding:12,border:'1px solid #2a313b',borderRadius:8,background:'#11161c'}}><small>중립 섹터</small><div style={{fontSize:22,fontWeight:800,marginTop:4}}>{neutral}</div></div>
    <div style={{padding:12,border:'1px solid #2a313b',borderRadius:8,background:'#11161c'}}><small>약세 섹터</small><div style={{fontSize:22,fontWeight:800,marginTop:4,color:'#6ea8ff'}}>{negative}</div></div>
   </div>

   <div className="sector-heatmap-layout" style={{display:'grid',gridTemplateColumns:compact?'1fr':'minmax(0,2fr) minmax(260px,.8fr)',gap:14,alignItems:'start'}}>
    <div>
     <div className="sector-heatmap-map" style={{display:'grid',gridTemplateColumns:compact?'repeat(3,minmax(0,1fr))':'repeat(6,minmax(0,1fr))',gridAutoFlow:'dense',gap:8}}>
      {visible.map(sector=>{
       const key=`${sector.market}:${sector.code}`;
       const span=sector.sizeLevel===3?2:1;
       return <button key={key} type="button" onClick={()=>setSelectedKey(key)} aria-pressed={selected?.code===sector.code&&selected?.market===sector.market} style={{gridColumn:`span ${span}`,minHeight:sector.sizeLevel===3?118:sector.sizeLevel===2?96:84,textAlign:'left',padding:12,borderRadius:8,border:`1px solid ${borderTone(sector.strength)}`,background:tone(sector.strength),color:'#f4f7fb',cursor:'pointer',overflow:'hidden'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'baseline'}}><strong style={{fontSize:sector.sizeLevel===3?16:14,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{sector.name}</strong><span style={{fontWeight:800}}>{changeText(sector.change)}</span></div>
        <div style={{display:'flex',justifyContent:'space-between',gap:8,marginTop:8,fontSize:12,opacity:.88}}><span>{marketName(sector.market)}</span><span>강도 {scoreText(sector.strength)}</span></div>
       </button>;
      })}
     </div>
     <small style={{display:'block',marginTop:10,opacity:.7}}>강도 점수는 당일 조회된 섹터들의 등락률과 거래대금 집중도를 결합한 상대 점수입니다. 절대 매매 신호가 아닙니다.</small>
    </div>

    <aside className="sector-heatmap-detail" style={{display:compact?'none':'grid',gap:10}}>
     {selected&&<div style={{padding:14,border:'1px solid #303844',borderRadius:9,background:'#11161c'}}>
      <small>{marketName(selected.market)} · #{selected.rank}</small>
      <h3 style={{margin:'5px 0 12px',fontSize:20}}>{selected.name}</h3>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
       <div><small>등락률</small><strong style={{display:'block',marginTop:3}}>{changeText(selected.change)}</strong></div>
       <div><small>강도</small><strong style={{display:'block',marginTop:3}}>{scoreText(selected.strength)} · {strengthLabel(selected.strength)}</strong></div>
       <div><small>지수</small><strong style={{display:'block',marginTop:3}}>{selected.price.toLocaleString('ko-KR',{maximumFractionDigits:2})}</strong></div>
       <div><small>거래대금 비중</small><strong style={{display:'block',marginTop:3}}>{(selected.turnoverShare*100).toFixed(1)}%</strong></div>
      </div>
     </div>}
     <div style={{padding:14,border:'1px solid #303844',borderRadius:9,background:'#11161c'}}><strong>주도 섹터 TOP 5</strong>{leaders.map((s,i)=><div key={`${s.market}:${s.code}`} style={{display:'grid',gridTemplateColumns:'24px 1fr auto',gap:8,paddingTop:9,fontSize:13}}><span>{i+1}</span><span>{s.name}</span><b style={{color:'#ff7c7c'}}>{scoreText(s.strength)}</b></div>)}</div>
     <div style={{padding:14,border:'1px solid #303844',borderRadius:9,background:'#11161c'}}><strong>약세 섹터 BOTTOM 5</strong>{laggards.map((s,i)=><div key={`${s.market}:${s.code}`} style={{display:'grid',gridTemplateColumns:'24px 1fr auto',gap:8,paddingTop:9,fontSize:13}}><span>{i+1}</span><span>{s.name}</span><b style={{color:'#6ea8ff'}}>{scoreText(s.strength)}</b></div>)}</div>
    </aside>
   </div>
   <div className="sector-heatmap-foot" style={{marginTop:12,fontSize:12,opacity:.65}}>저장 시각: {snapshotTime||'확인 불가'} · 섹터 {visible.length}개</div>
  </>}
 </section>;
}
