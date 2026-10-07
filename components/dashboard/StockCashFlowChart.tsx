'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {cashStepPaths,type CashTimelineDay,type CashFlowView} from '@/lib/cash-flow-timeline';
import {cashAxis} from '@/lib/cash-flow-display';
import s from './StockCashFlow.module.css';
export default function StockCashFlowChart({days,view,activeIndex,onSelect,height=216}:{days:CashTimelineDay[];view:CashFlowView;activeIndex?:number|null;onSelect:(index:number)=>void;height?:number}){
  const container=useRef<HTMLDivElement>(null),[width,setWidth]=useState(1000),id=useId().replaceAll(':','');
  useEffect(()=>{const el=container.current;if(!el)return;const observer=new ResizeObserver(([e])=>setWidth(Math.max(260,e.contentRect.width)));observer.observe(el);return()=>observer.disconnect();},[]);
  const small=width<520,left=small?48:68,right=small?52:72,top=38,bottom=31,plotW=width-left-right;
  const raw=days.flatMap(d=>[d.event?.[view].operating,d.event?.[view].fcf].filter((v):v is number=>v!=null)),axis=cashAxis(raw),values=raw.map(v=>v/axis.divisor);
  const min=Math.min(0,...values),max=Math.max(0,...values),pad=Math.max((max-min)*.12,axis.unit==='조원'?.01:1),low=min-pad,high=max+pad;
  const x=(i:number)=>left+(i+.5)*plotW/Math.max(1,days.length),y=(v:number)=>top+(high-v)/(high-low)*(height-bottom-top);
  const tickCount=Math.min(days.length,small?3:6),ticks=Array.from({length:tickCount},(_,i)=>Math.round(i*(days.length-1)/Math.max(1,tickCount-1)));
  const yTicks=max===min?[high,0,low]:[max,(min+max)/2,min];
  const bands:{start:number;end:number;period:string|null;label:string}[]=[];
  days.forEach((d,i)=>{const key=d.event?.period??null,last=bands.at(-1);if(last?.period===key)last.end=i;else bands.push({start:i,end:i,period:key,label:d.event?.label??'미확인'});});
  const series=[['operating','#d9b871'],['fcf','#82ceb0']] as const;
  const endLabels=series.flatMap(([key,color])=>{const v=days.at(-1)?.event?.[view][key];return v==null?[]:[{key,color,value:v/axis.divisor,py:y(v/axis.divisor),labelY:y(v/axis.divisor)}];}).sort((a,b)=>a.py-b.py);
  if(endLabels.length===2&&endLabels[1].labelY-endLabels[0].labelY<18){const mid=(endLabels[0].py+endLabels[1].py)/2;const first=Math.max(top+4,Math.min(height-bottom-22,mid-9));endLabels[0].labelY=first;endLabels[1].labelY=first+18;}
  function select(index:number){if(days.length)onSelect(Math.max(0,Math.min(days.length-1,index)));}
  const axisNumber=(v:number)=>v.toLocaleString('ko-KR',{maximumFractionDigits:axis.unit==='조원'?2:1});
  return <div ref={container} className={s.plotWrap}>
    <svg data-stock-cash-chart data-view={view} data-chart-height={height} className={s.plot} viewBox={`0 0 ${width} ${height}`} style={{height}} role="img" tabIndex={0} aria-label="공시 반영일 기준 영업현금흐름과 잉여현금흐름 계단 차트. 좌우 방향키로 날짜 선택" onPointerMove={e=>{const r=e.currentTarget.getBoundingClientRect();select(Math.floor(((e.clientX-r.left)/r.width*width-left)/plotW*days.length));}} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();select((activeIndex??days.length-1)+(e.key==='ArrowLeft'?-1:1));}if(e.key==='Home'){e.preventDefault();select(0);}if(e.key==='End'){e.preventDefault();select(days.length-1);}}}>
      <title>기업 현금흐름 · {view==='ttm'?'최근 4분기 합계':'단독 분기'} · {axis.unit}</title>
      <defs><clipPath id={id}><rect x={left} y={top-3} width={plotW} height={height-top-bottom+6}/></clipPath></defs>
      <text data-cash-axis-unit x={left-9} y="19" textAnchor="end" fill="#acb59f" fontSize="10">{axis.unit}</text>
      {bands.map((b,i)=>{const bx=x(b.start-.5),bw=x(b.end+.5)-bx;return <g key={b.start} data-cash-period-band><rect x={bx} y="3" width={bw} height="24" fill={i%2?'#cfb36d0f':'#91b49b0d'}/>{bw>42&&<text x={bx+bw/2} y="19" textAnchor="middle" fill="#b0b69f" fontSize="10">{bw>105?b.label:b.label.replace(/^\d{4}년 /,'')}</text>}<line x1={bx} x2={bx} y1={top} y2={height-bottom} stroke="#4c5941" opacity=".4" strokeDasharray="3 5"/></g>;})}
      {yTicks.map((v,i)=><g key={i}><line x1={left} x2={width-right} y1={y(v)} y2={y(v)} stroke="#35422f" strokeDasharray="2 5"/><text x={left-9} y={y(v)+4} textAnchor="end" fill="#9eac91" fontSize={small?9:10}>{axisNumber(v)}</text></g>)}
      <line data-cash-zero x1={left} x2={width-right} y1={y(0)} y2={y(0)} stroke="#ad9e6c" strokeWidth="1.25" opacity=".8"/>
      {ticks.map((i,j)=><text key={i} x={x(i)} y={height-9} fill="#93a085" fontSize="10" textAnchor={j===0?'start':j===ticks.length-1?'end':'middle'}>{days[i].date.slice(2).replaceAll('-','.')}</text>)}
      <g clipPath={`url(#${id})`}>
        {days.map((d,i)=>d.filings.length?<line key={d.date} x1={x(i)} x2={x(i)} y1={top} y2={height-bottom} stroke="#bca477" opacity=".3" strokeDasharray="3 4"/>:null)}
        {series.map(([key,color])=><g key={key} data-cash-series={key}>{cashStepPaths(days,view,key,x,eok=>y(eok*1e8/axis.divisor)).map((path,i)=><path key={i} d={path} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round"/>)}{days.map((d,i)=>{const v=d.event?.[view][key];return v!=null&&(i===0||days[i-1].event?.[view][key]!==v||i===days.length-1)?<circle key={i} cx={x(i)} cy={y(v/axis.divisor)} r="3" fill="#101810" stroke={color} strokeWidth="1.5"/>:null;})}</g>)}
        {activeIndex!=null&&days[activeIndex]&&<g data-image-exclude><line x1={x(activeIndex)} x2={x(activeIndex)} y1={top} y2={height-bottom} stroke="#e4c17b" strokeDasharray="3 4"/>{series.map(([key,color])=>{const v=days[activeIndex].event?.[view][key];return v==null?null:<circle key={key} cx={x(activeIndex)} cy={y(v/axis.divisor)} r="4" stroke={color} strokeWidth="2" fill="#0c140e"/>;})}</g>}
      </g>
      {endLabels.map(e=><g key={e.key}><line x1={x(days.length-1)+4} x2={width-right+5} y1={e.py} y2={e.labelY} stroke={e.color} opacity=".55"/><text x={width-right+8} y={e.labelY+4} fill={e.color} fontSize={small?9:10} fontWeight="600">{axisNumber(e.value)}</text></g>)}
      {!values.length&&<text x={width/2} y={(top+height-bottom)/2} fill="#aeb5a7" textAnchor="middle" fontSize={small?10:12}>이 구간의 공시 기준 수치를 확인할 수 없습니다</text>}
    </svg>
  </div>;
}
