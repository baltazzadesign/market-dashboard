"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Brand, Icon } from "./Icon";
import MarketChart from "./MarketCharts";
import { useMarketFeed } from "./useMarketFeed";
import { buildMarketEvents } from "@/lib/balta-signals";
import { CLOSE_MINUTE, OPEN_MINUTE, formatNumber, kstParts, minuteLabel, moveDate, type MarketRow } from "@/lib/balta-model";
import { chartColors, type Domain } from "./chart-model";
import { BaltaJungyongHeaderLink } from "./BaltaJungyongHeaderLink";

type SpeedRow={minute:number;foreign:number;inst:number;indiv:number};
type HourRow={hour:string;foreign:number;inst:number;indiv:number};
const fmt=(v:number|null|undefined,d=0,signed=false)=>formatNumber(v,d,signed);
function sign(v:number|null|undefined){return (v??0)>0?"positive":(v??0)<0?"negative":"";}

function velocity(rows:MarketRow[],step=5){
  const byMinute=new Map(rows.map(r=>[r.minute,r]));
  return rows.map(row=>{
    const prev=byMinute.get(row.minute-step);
    return {minute:row.minute,foreign:(row.foreignFlow??0)-(prev?.foreignFlow??row.foreignFlow??0),inst:(row.instFlow??0)-(prev?.instFlow??row.instFlow??0),indiv:(row.indivFlow??0)-(prev?.indivFlow??row.indivFlow??0)} as SpeedRow;
  });
}
function hourly(rows:MarketRow[]){
  const groups=new Map<number,MarketRow[]>();
  rows.forEach(r=>{const h=Math.floor(r.minute/60);groups.set(h,[...(groups.get(h)??[]),r]);});
  return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([h,list])=>{
    const first=list[0],last=list.at(-1)!;
    const delta=(key:"foreignFlow"|"instFlow"|"indivFlow")=>(last[key]??0)-(first[key]??0);
    return {hour:String(h).padStart(2,"0")+"시",foreign:delta("foreignFlow"),inst:delta("instFlow"),indiv:delta("indivFlow")} as HourRow;
  });
}
function axis(v:number){const a=Math.abs(v);return a>=10000?(v/1000).toFixed(1)+"k":Math.round(v).toLocaleString("ko-KR");}
function MiniTooltip({active,payload,label}:{active?:boolean;payload?:Array<{name?:string;value?:number;color?:string}>;label?:number|string}){
  if(!active||!payload?.length)return null;
  return <div className="flow-tooltip"><strong>{typeof label==="number"?minuteLabel(label):label}</strong>{payload.map((p,i)=><span key={(p.name??"")+i}><i style={{background:p.color}}/>{p.name}<b>{fmt(p.value,0,true)}</b></span>)}</div>;
}
function SpeedChart({data}:{data:SpeedRow[]}){
  return <div className="flow-mini-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{top:8,right:8,left:0,bottom:0}}><CartesianGrid vertical={false} stroke="#302719" strokeDasharray="2 5"/><XAxis dataKey="minute" type="number" domain={[OPEN_MINUTE,CLOSE_MINUTE]} tickFormatter={minuteLabel} tick={{fill:"#8f8778",fontSize:9}} axisLine={{stroke:"#3b2d1c"}} tickLine={false}/><YAxis width={42} tickFormatter={axis} tick={{fill:"#80786c",fontSize:9}} axisLine={false} tickLine={false}/><Tooltip content={<MiniTooltip/>}/><ReferenceLine y={0} stroke="#7c725f" strokeOpacity={.5}/><Bar dataKey="foreign" name="외국인" fill={chartColors.blue} isAnimationActive={false}/><Bar dataKey="inst" name="기관" fill={chartColors.red} isAnimationActive={false}/><Bar dataKey="indiv" name="개인" fill={chartColors.yellow} isAnimationActive={false}/></BarChart></ResponsiveContainer></div>;
}
function SpreadChart({rows}:{rows:MarketRow[]}){
  const data=rows.map(r=>({minute:r.minute,spread:(r.foreignFlow??0)-(r.instFlow??0)}));
  return <div className="flow-mini-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{top:8,right:8,left:0,bottom:0}}><CartesianGrid vertical={false} stroke="#302719" strokeDasharray="2 5"/><XAxis dataKey="minute" type="number" domain={[OPEN_MINUTE,CLOSE_MINUTE]} tickFormatter={minuteLabel} tick={{fill:"#8f8778",fontSize:9}} axisLine={{stroke:"#3b2d1c"}} tickLine={false}/><YAxis width={42} tickFormatter={axis} tick={{fill:"#80786c",fontSize:9}} axisLine={false} tickLine={false}/><Tooltip content={<MiniTooltip/>}/><ReferenceLine y={0} stroke="#7c725f" strokeOpacity={.5}/><Line dataKey="spread" name="외국인-기관" stroke="#b677ff" strokeWidth={2} dot={false} isAnimationActive={false}/></ComposedChart></ResponsiveContainer></div>;
}
function PressureChart({rows}:{rows:MarketRow[]}){
  const speeds=velocity(rows,5); const data=speeds.map((r,i)=>({minute:r.minute,power:(r.foreign+r.inst),breadth:rows[i]?.diff??0}));
  return <div className="flow-mini-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{top:8,right:8,left:0,bottom:0}}><CartesianGrid vertical={false} stroke="#302719" strokeDasharray="2 5"/><XAxis dataKey="minute" type="number" domain={[OPEN_MINUTE,CLOSE_MINUTE]} tickFormatter={minuteLabel} tick={{fill:"#8f8778",fontSize:9}} axisLine={{stroke:"#3b2d1c"}} tickLine={false}/><YAxis width={42} tickFormatter={axis} tick={{fill:"#80786c",fontSize:9}} axisLine={false} tickLine={false}/><Tooltip content={<MiniTooltip/>}/><ReferenceLine y={0} stroke="#7c725f" strokeOpacity={.5}/><Line dataKey="power" name="외인+기관 5분 변화" stroke="#f0d3a0" strokeWidth={1.8} dot={false} isAnimationActive={false}/></ComposedChart></ResponsiveContainer></div>;
}
function HourChart({data}:{data:HourRow[]}){
  return <div className="flow-bottom-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{top:8,right:8,left:0,bottom:0}}><CartesianGrid vertical={false} stroke="#302719" strokeDasharray="2 5"/><XAxis dataKey="hour" tick={{fill:"#8f8778",fontSize:9}} axisLine={{stroke:"#3b2d1c"}} tickLine={false}/><YAxis width={44} tickFormatter={axis} tick={{fill:"#80786c",fontSize:9}} axisLine={false} tickLine={false}/><Tooltip content={<MiniTooltip/>}/><ReferenceLine y={0} stroke="#7c725f" strokeOpacity={.5}/><Bar dataKey="foreign" name="외국인" fill={chartColors.blue}/><Bar dataKey="inst" name="기관" fill={chartColors.red}/><Bar dataKey="indiv" name="개인" fill={chartColors.yellow}/></BarChart></ResponsiveContainer></div>;
}

export default function MarketFlowWorkspace(){
  const [date,setDate]=useState(""); const [today,setToday]=useState(""); const [domain,setDomain]=useState<Domain>([OPEN_MINUTE,CLOSE_MINUTE]);
  useEffect(()=>{const p=kstParts();setToday(p.date);setDate(p.date);},[]);
  const feed=useMarketFeed(date,!!date&&date===today,true); const rows=feed.rows; const last=rows.at(-1); const events=useMemo(()=>buildMarketEvents(rows.filter(r=>r.session==="REGULAR")),[rows]);
  const speed=useMemo(()=>velocity(rows),[rows]); const byHour=useMemo(()=>hourly(rows),[rows]);
  const combined=(last?.foreignFlow??0)+(last?.instFlow??0);
  const speedLast=speed.at(-1);
  const switches=useMemo(()=>{const out:{time:string;label:string;tone:string}[]=[];let prev:number|null=null;for(const row of rows){const v=row.flowPower;if(v==null)continue;if(prev!==null&&Math.sign(prev)!==Math.sign(v)&&Math.abs(prev-v)>20)out.push({time:row.time,label:v>=0?"외인+기관 순매수 전환":"외인+기관 순매도 전환",tone:v>=0?"positive":"negative"});prev=v;}return out.slice(-4).reverse();},[rows]);
  const chartProps={rows,kind:"flow" as const,domain,selectedMinute:null,events,showMarkers:true,autoScale:true,onDomainChange:setDomain,hoverMinute:null,onHoverMinute:()=>{},onReset:()=>setDomain([OPEN_MINUTE,CLOSE_MINUTE]),onLatest:()=>{const end=last?.minute??CLOSE_MINUTE;setDomain([Math.max(OPEN_MINUTE,end-60),end]);},refreshing:feed.refreshing,dataCaption:feed.warning||"5분까지 확대 · 실시간 수급"};
  const cards=[
    {name:"외국인",value:last?.foreignFlow,color:chartColors.blue,delta:speedLast?.foreign},
    {name:"기관",value:last?.instFlow,color:chartColors.red,delta:speedLast?.inst},
    {name:"개인",value:last?.indivFlow,color:chartColors.yellow,delta:speedLast?.indiv},
    {name:"외국인 + 기관",value:combined,color:"#61a6ff",delta:(speedLast?.foreign??0)+(speedLast?.inst??0)},
  ];
  return <div className="flow-page-shell">
    <header className="flow-topbar">
      <Link href="/" className="topnav-brand"><Brand/></Link>
      <nav className="flow-topnav" aria-label="주요 메뉴"><Link href="/">대시보드</Link><Link href="/flow" className="active">시장 수급</Link><Link href="/?chart=breadth">시장폭</Link><Link href="/#market-pulse">Market Pulse</Link><Link href="/research">섹터 분석</Link><Link href="/research">종목 스캐너</Link><Link href="/history">캘린더</Link></nav>
      <div className="flow-top-actions"><Link className="topnav-search" href="/research"><Icon name="search" size={14}/><span>종목명 또는 코드 검색...</span></Link><a href="/baltagyeong.html" className="reading-link"><Icon name="book" size={15}/>발타경</a><BaltaJungyongHeaderLink/></div>
    </header>
    <main className="flow-page-main">
      <section className="flow-hero"><div><span>MARKET FLOW INTELLIGENCE</span><h1>시장 수급</h1><p>외국인, 기관, 개인의 흐름을 실시간으로 추적합니다.</p><small>수급이 움직이는 곳에, 기회가 있습니다.</small></div><div className="flow-hero-quote"><b>流</b><strong>흐름을 읽는 자가<br/>시장을 이끈다.</strong></div><div className="flow-date-tools"><button onClick={()=>setDate(d=>moveDate(d,-1))}><Icon name="left"/></button><label><Icon name="calendar"/><input type="date" value={date} max={today||undefined} onChange={e=>setDate(e.target.value)}/></label><button disabled={!date||date>=today} onClick={()=>setDate(d=>moveDate(d,1))}><Icon name="right"/></button><button onClick={()=>void feed.refresh(true)}><Icon name="refresh" className={feed.refreshing?"spin":""}/></button></div></section>
      {feed.error&&<div className="flow-notice"><Icon name="warning"/>{feed.error}</div>}
      <section className="flow-stat-grid">{cards.map(card=><article key={card.name} className="flow-stat" style={{"--flow-color":card.color} as CSSProperties}><span>{card.name}</span><strong style={{color:card.color}}>{fmt(card.value,0,true)}<small>억원</small></strong><p>최근 5분 <b className={sign(card.delta)}>{fmt(card.delta,0,true)}</b></p><div className="flow-stat-spark"/></article>)}</section>
      <section className="flow-primary-grid">
        <article className="flow-panel flow-cumulative"><div className="flow-panel-head"><div><h2>투자주체별 누적 수급 <small>(억원)</small></h2><div className="flow-legend"><span><i style={{background:chartColors.blue}}/>외국인 <b>{fmt(last?.foreignFlow,0,true)}</b></span><span><i style={{background:chartColors.red}}/>기관 <b>{fmt(last?.instFlow,0,true)}</b></span><span><i style={{background:chartColors.yellow}}/>개인 <b>{fmt(last?.indivFlow,0,true)}</b></span></div></div><span className="flow-panel-time">{last?.time??"—"} 기준</span></div>{rows.length?<MarketChart {...chartProps}/>:<div className="flow-empty">수급 기록을 불러오는 중입니다.</div>}</article>
        <aside className="flow-side-stack"><article className="flow-panel"><div className="flow-panel-head"><div><h2>순매수 속도 <small>(5분 변화)</small></h2><p>누적 수급의 단기 가속을 비교합니다.</p></div></div><SpeedChart data={speed}/></article><article className="flow-panel"><div className="flow-panel-head"><div><h2>수급 압력 <small>(외인+기관)</small></h2><p>체결강도가 아닌 저장된 수급 변화 기반 지표입니다.</p></div><b className={sign((speedLast?.foreign??0)+(speedLast?.inst??0))}>{fmt((speedLast?.foreign??0)+(speedLast?.inst??0),0,true)}</b></div><PressureChart rows={rows}/></article></aside>
      </section>
      <section className="flow-secondary-grid"><article className="flow-panel"><div className="flow-panel-head"><h2>시간대별 수급 비교 <small>(억원)</small></h2></div><HourChart data={byHour}/></article><article className="flow-panel"><div className="flow-panel-head"><div><h2>외국인 vs 기관 스프레드</h2><p>누적 순매수 차이</p></div><b>{fmt((last?.foreignFlow??0)-(last?.instFlow??0),0,true)}</b></div><SpreadChart rows={rows}/></article><article className="flow-panel flow-switch-panel"><div className="flow-panel-head"><div><h2>수급 전환 시점</h2><p>외국인+기관 합산 수급의 0선 전환</p></div></div><div className="flow-switch-list">{switches.length?switches.map((item,i)=><div key={item.time+i}><span className="num">{item.time}</span><strong className={item.tone}>{item.label}</strong></div>):<p>오늘 감지된 주요 전환이 없습니다.</p>}</div></article></section>
      <section className="flow-bottom-grid"><article className="flow-panel flow-kpi-table"><h2>실시간 주요 지표</h2><div><span>KOSPI</span><b>{fmt(last?.kospi,2)}</b></div><div><span>KOSDAQ</span><b>{fmt(last?.kosdaq,2)}</b></div><div><span>시장폭</span><b className={sign(last?.diff)}>{fmt(last?.diff,0,true)}</b></div><div><span>외인+기관</span><b className={sign(combined)}>{fmt(combined,0,true)}</b></div></article><article className="flow-panel flow-signal-list"><h2>오늘의 핵심 신호</h2>{events.slice(-4).reverse().map(e=><div key={e.id}><span className="num">{e.time}</span><strong>{e.label}</strong><em>{e.level}</em></div>)}{!events.length&&<p>현재 표시할 신호가 없습니다.</p>}</article><article className="flow-panel flow-cta"><div><Icon name="chart" size={30}/><h2>차트 전체보기</h2><p>더 다양한 수급 차트를 확인하세요.</p></div><Link href="/daily">상세 차트 보기 <Icon name="right" size={14}/></Link></article></section>
      <footer className="flow-footer"><Brand/><span>GOOD DATA. BETTER DECISIONS.</span><nav><Link href="/disclaimer">책임면책고지</Link><Link href="/history">시장 캘린더</Link><Link href="/research">시장 리서치</Link></nav></footer>
    </main>
  </div>;
}
