'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {cashStepPaths,type CashTimelineDay,type CashFlowView} from '@/lib/cash-flow-timeline';
import s from './StockCashFlow.module.css';
export default function StockCashFlowChart({days,view,activeIndex,onSelect}:{days:CashTimelineDay[];view:CashFlowView;activeIndex?:number|null;onSelect:(index:number)=>void}){
  const container=useRef<HTMLDivElement>(null),[width,setWidth]=useState(1000),id=useId().replaceAll(':','');
  useEffect(()=>{const el=container.current;if(!el)return;const observer=new ResizeObserver(([e])=>setWidth(Math.max(260,e.contentRect.width)));observer.observe(el);return()=>observer.disconnect();},[]);
  const small=width<520,left=small?48:68,right=small?52:72,height=238,top=22,bottom=37,plotW=width-left-right;
  const values=days.flatMap(d=>[d.event?.[view].operating,d.event?.[view].fcf].filter((v):v is number=>v!=null).map(v=>v/1e8));
  const min=Math.min(0,...values),max=Math.max(0,...values),pad=Math.max((max-min)*.13,1),low=min-pad,high=max+pad;
  const x=(i:number)=>left+(i+.5)*plotW/Math.max(1,days.length),y=(v:number)=>top+(high-v)/(high-low)*(height-bottom-top);
  const tickCount=Math.min(days.length,small?3:6);
  const ticks=Array.from({length:tickCount},(_,i)=>Math.round(i*(days.length-1)/Math.max(1,tickCount-1)));
  function select(index:number){if(days.length)onSelect(Math.max(0,Math.min(days.length-1,index)));}
  return <div ref={container} className={s.plotWrap}>
    <svg data-stock-cash-chart data-view={view} className={s.plot} viewBox={`0 0 ${width} ${height}`} style={{height}} role="img" tabIndex={0} aria-label="공시 반영일 기준 영업현금흐름과 잉여현금흐름 계단 차트. 좌우 방향키로 날짜 선택" onPointerMove={e=>{const r=e.currentTarget.getBoundingClientRect();select(Math.floor(((e.clientX-r.left)/r.width*width-left)/plotW*days.length));}} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();select((activeIndex??days.length-1)+(e.key==='ArrowLeft'?-1:1));}if(e.key==='Home'){e.preventDefault();select(0);}if(e.key==='End'){e.preventDefault();select(days.length-1);}}}>
      <title>기업 현금흐름 · {view==='ttm'?'최근 4분기 합계':'단독 분기'} · 억원</title>
      <defs><clipPath id={id}><rect x={left} y={top-3} width={plotW} height={height-top-bottom+6}/></clipPath></defs>
      <text x={left} y="12" fill="#aeb5a7" fontSize="10">현금흐름 (억원)</text>
      {Array.from({length:3},(_,i)=>{const v=max-(max-min)*i/2;return <g key={i}><line x1={left} x2={width-right} y1={y(v)} y2={y(v)} stroke="#29342c" strokeDasharray="2 4"/><text x={left-8} y={y(v)+4} textAnchor="end" fill="#9da797" fontSize={small?9:10}>{v.toLocaleString('ko-KR',{notation:'compact',maximumFractionDigits:1})}</text></g>;})}
      <line data-cash-zero x1={left} x2={width-right} y1={y(0)} y2={y(0)} stroke="#bda36b" strokeWidth="1.25" opacity=".8"/>
      {ticks.map((i,j)=><text key={i} x={x(i)} y={height-12} fill="#9da797" fontSize="10" textAnchor={j===0?'start':j===ticks.length-1?'end':'middle'}>{days[i].date.slice(2).replaceAll('-','.')}</text>)}
      <g clipPath={`url(#${id})`}>
        {days.map((d,i)=>d.filings.length?<line key={d.date} x1={x(i)} x2={x(i)} y1={top} y2={height-bottom} stroke="#bca477" opacity=".25" strokeDasharray="3 4"/>:null)}
        {([['operating','#d9b871'],['fcf','#82ceb0']] as const).map(([key,color])=><g key={key} data-cash-series={key}>{cashStepPaths(days,view,key,x,y).map((path,i)=><path key={i} d={path} fill="none" stroke={color} strokeWidth="2.2"/>)}{days.map((d,i)=>{const v=d.event?.[view][key];return v!=null&&(i===0||days[i-1].event?.[view][key]!==v||i===days.length-1)?<circle key={i} cx={x(i)} cy={y(v/1e8)} r="2.8" fill="#101810" stroke={color} strokeWidth="1.5"/>:null;})}</g>)}
        {activeIndex!=null&&days[activeIndex]&&<line data-image-exclude x1={x(activeIndex)} x2={x(activeIndex)} y1={top} y2={height-bottom} stroke="#e4c17b" strokeDasharray="3 4"/>}
      </g>
      {!values.length&&<text x={width/2} y={height/2} fill="#aeb5a7" textAnchor="middle" fontSize={small?11:12}>이 구간의 공시 기준 수치를 확인할 수 없습니다</text>}
    </svg>
  </div>;
}
