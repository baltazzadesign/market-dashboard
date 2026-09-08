"use client";
import { useState } from "react";
import { ResponsiveContainer,ComposedChart,Line,BarChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip,Brush,ReferenceLine } from "recharts";
import { estimatePositions, investorNames, investors, type Investor } from "@/lib/market-history-model";
import { formatNumber } from "@/lib/balta-model";
export const positionColors:Record<Investor,string>={foreign:"#5294ff",institution:"#ff545f",individual:"#f2ce53"};
type Result=ReturnType<typeof estimatePositions>;
const tick={fill:"#a4a8b1",fontSize:12};
const tooltipStyle={background:"#111316",border:"1px solid #404650",borderRadius:8,color:"#e6e8ec"};
export default function HistoryCharts({result}:{result:Result}){
  const [hidden,setHidden]=useState<Investor[]>([]),[reset,setReset]=useState(0);
  const visible=investors.filter(key=>!hidden.includes(key));
  return <>
    <section className="panel">
      <div className="panel-header"><div><h2 className="panel-title">지수와 추정 평단 추이</h2><p className="panel-subtitle">지수 포인트 · 하단 선택 영역으로 기간 확대</p></div><button className="button small" onClick={()=>setReset(v=>v+1)}>확대 초기화</button></div>
      <div className="history-legend">{investors.map(key=><button key={key} aria-pressed={!hidden.includes(key)} style={{color:positionColors[key],opacity:hidden.includes(key)?.45:1}} onClick={()=>setHidden(old=>old.includes(key)?old.filter(x=>x!==key):[...old,key])}>{investorNames[key]} 추정 평단</button>)}</div>
      {result.chart.length?<div className="history-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart key={reset} data={result.chart} margin={{top:15,left:8,right:26,bottom:8}}>
        <CartesianGrid vertical={false} stroke="#30343b" strokeDasharray="2 6"/><XAxis dataKey="date" tick={tick} tickFormatter={v=>String(v).slice(5)} minTickGap={24}/><YAxis domain={["auto","auto"]} width={65} tick={tick} tickFormatter={v=>formatNumber(v,0)}/>
        <Tooltip contentStyle={tooltipStyle} formatter={(v)=>formatNumber(typeof v==="number"?v:null,2)}/>
        <Line name="지수" dataKey="price" stroke="#cbd3df" dot={result.chart.length===1} strokeWidth={2} isAnimationActive={false} connectNulls={false}/>
        {visible.map(key=><Line key={key} name={investorNames[key]+" 추정 평단"} dataKey={key} stroke={positionColors[key]} dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls={false}/>)}
        {result.positions.filter(p=>visible.includes(p.key)&&p.averageCost!==null).map(p=><ReferenceLine key={p.key} y={p.averageCost!} stroke={positionColors[p.key]} strokeDasharray="3 6" ifOverflow="extendDomain"/>)}
        {result.chart.length>1&&<Brush dataKey="date" height={30} stroke="#636b77" fill="#101215" tickFormatter={v=>String(v).slice(5)}/>}
      </ComposedChart></ResponsiveContainer></div>:<div className="empty-state">선택 기간의 지수 기록이 없습니다.</div>}
      <p className="history-footnote">실선은 날짜별 추정 평단, 점선은 조회 기간 마지막 추정 평단입니다. 결측값은 연결하지 않습니다.</p>
    </section>
    <section className="panel"><div className="panel-header"><div><h2 className="panel-title">가격대별 추정 잔여 포지션</h2><p className="panel-subtitle">가로축: 추정 잔여 원금(억원) · 세로축: 지수 가격 구간의 중간값</p></div></div>
      {result.distribution.length?<div className="history-chart distribution"><ResponsiveContainer width="100%" height="100%"><BarChart data={result.distribution} layout="vertical" margin={{top:4,right:24,bottom:12,left:12}}><CartesianGrid horizontal={false} stroke="#30343b" strokeDasharray="2 6"/><XAxis type="number" tick={tick}/><YAxis type="category" dataKey="price" width={70} tick={tick} tickFormatter={v=>formatNumber(v,1)}/><Tooltip contentStyle={tooltipStyle} labelFormatter={v=>"지수 "+formatNumber(Number(v),1)} formatter={v=>formatNumber(typeof v==="number"?v:null,1)+"억"}/>{visible.map(key=><Bar key={key} dataKey={key} name={investorNames[key]} fill={positionColors[key]} stackId="positions" isAnimationActive={false}/>)}</BarChart></ResponsiveContainer></div>:<div className="empty-state">계산 가능한 잔여 매수 포지션이 없습니다.</div>}
    </section>
  </>;
}
