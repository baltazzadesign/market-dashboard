"use client";
import { useEffect, useId, useRef, useState } from 'react';
import { stockInvestors, type StockFlowRow, type StockFlowValues, type StockFlowUnit, type StockFlowMode, type StockInvestor } from '@/lib/stock-flow-model';
import s from './StockFlowWorkspace.module.css';
import type {CashTimelineDay} from '@/lib/cash-flow-timeline';

export const flowNumber = (v: number | null | undefined, unit: StockFlowUnit, signed = true) => v == null ? '—' : (signed && v > 0 ? '+' : '') + new Intl.NumberFormat('ko-KR',{maximumFractionDigits:unit === 'money' ? 2 : 0}).format(v);
const priceNumber = (v: number) => new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0}).format(v);
function compact(v: number) { return Math.abs(v) >= 10000 ? (v/10000).toLocaleString('ko-KR',{maximumFractionDigits:1})+'만' : v.toLocaleString('ko-KR',{maximumFractionDigits:1}); }
export default function StockFlowChart({rows,values,selected,unit,mode,split,showPrice,onSelect,activeIndex,cashDays,onFilingSelect}: {
  rows:StockFlowRow[]; values:StockFlowValues[]; selected:StockInvestor[]; unit:StockFlowUnit; mode:StockFlowMode;
  split:boolean; showPrice:boolean; onSelect:(index:number)=>void; activeIndex?:number|null; cashDays?:CashTimelineDay[]; onFilingSelect?:(index:number)=>void;
}) {
  const container = useRef<HTMLDivElement>(null), [width,setWidth] = useState(1000), [hover,setHover] = useState<number|null>(null);
  const clip = useId().replaceAll(':','');
  useEffect(()=>{const el=container.current;if(!el)return;const observer=new ResizeObserver(([e])=>setWidth(Math.max(260,e.contentRect.width)));observer.observe(el);return ()=>observer.disconnect();},[]);
  const small=width<520, height=split?640:450, left=small?48:68, right=small?52:72, top=34, bottom=34;
  const plotW=width-left-right, volumeTop=height-bottom-51, volumeH=42;
  const priceBottom=split?230:volumeTop-23, flowTop=split?278:top, flowBottom=volumeTop-23;
  const lows=rows.map(r=>r.low),highs=rows.map(r=>r.high),min=Math.min(...lows),max=Math.max(...highs);
  const spread=max-min||Math.max(1,max*.02), upper=max+spread*.12, lower=min-spread*.12;
  const bound=Math.max(1,...values.flatMap(v=>selected.flatMap(k=>v[k]===null?[]:[Math.abs(v[k]!)])))*1.12;
  const x=(i:number)=>left+(i+.5)*plotW/Math.max(1,rows.length);
  const py=(v:number)=>top+(upper-v)/(upper-lower)*(priceBottom-top);
  const fy=(v:number)=>flowTop+(bound-v)/(2*bound)*(flowBottom-flowTop);
  const bar=Math.max(.8,Math.min(12,plotW/Math.max(1,rows.length)*.62));
  const maxVolume=Math.max(1,...rows.map(r=>r.volume??0));
  const tickCount=Math.min(rows.length,small?3:6),ticks=Array.from({length:tickCount},(_,i)=>Math.round(i*(rows.length-1)/Math.max(1,tickCount-1)));
  const cursor=hover??activeIndex??null;
  const active=hover===null?null:rows[Math.min(hover,rows.length-1)];
  function select(i:number) { const index=Math.max(0,Math.min(rows.length-1,i));setHover(index);onSelect(index); }
  function lineSegments(key:StockInvestor) {
    const groups:number[][]=[];
    values.forEach((v,i)=>{if(v[key]!==null){if(!i||values[i-1][key]===null)groups.push([]);groups.at(-1)!.push(i);}});
    return groups;
  }
  return <div className={s.plotWrap} ref={container}>
    {!rows.length ? <div className={s.empty}>이 기간에 표시할 주가 기록이 없습니다.</div> : <>
    <svg data-stock-flow-chart data-layout={split?'split':'overlay'} className={s.plot} viewBox={`0 0 ${width} ${height}`} style={{height}} role="img" tabIndex={0} aria-label="주가 캔들과 투자자별 순매수 차트. 좌우 방향키로 날짜 선택" onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();select((hover??rows.length-1)+(e.key==='ArrowLeft'?-1:1));}if(e.key==='Home'){e.preventDefault();select(0);}if(e.key==='End'){e.preventDefault();select(rows.length-1);}}} onPointerMove={e=>{const rect=e.currentTarget.getBoundingClientRect();const mx=(e.clientX-rect.left)/rect.width*width;select(Math.floor((mx-left)/plotW*rows.length));}} onPointerLeave={()=>setHover(null)}>
      <title>주가와 투자자 수급 · KRX 일별</title>
      <defs><clipPath id={clip}><rect x={left} y={top-1} width={plotW} height={height-top-bottom+2}/></clipPath></defs>
      <text x={left} y={14} fill="#aeb5a7" fontSize="11">{showPrice?'주가 (원)':'주가 숨김'}</text>
      <text x={width-right} y={split?flowTop-14:14} fill="#aeb5a7" fontSize="11" textAnchor="end">{mode==='cumulative'?'누적':'일별'} 순매수 ({unit==='money'?'억원':'주'})</text>
      {Array.from({length:5},(_,i)=>{const v=upper-(upper-lower)*i/4;return <g key={'p'+i}><line x1={left} x2={width-right} y1={py(v)} y2={py(v)} stroke="#263029" strokeDasharray="2 3"/>{showPrice&&<text x={left-8} y={py(v)+4} textAnchor="end" fill="#9da797" fontSize={small?9:10}>{small?compact(v):priceNumber(v)}</text>}</g>;})}
      {[-1,0,1].map(t=>{const v=bound*t;return <g key={'f'+t}>{t===0&&<line data-flow-zero x1={left} x2={width-right} y1={fy(0)} y2={fy(0)} stroke="#64d8ed" strokeWidth="1.5" opacity=".7" strokeDasharray="5 4"/>}<text x={width-right+7} y={fy(v)+4} fill={t===0?'#8fdae5':'#9da797'} fontSize={small?9:10}>{t===0?'0':(t>0?'+':'')+compact(v)}</text></g>;})}
      {ticks.map((i,j)=><g key={i}><line x1={x(i)} x2={x(i)} y1={top} y2={height-bottom} stroke="#263029" strokeDasharray="2 3"/><text x={x(i)} y={height-10} textAnchor={j===0?'start':j===ticks.length-1?'end':'middle'} fill="#9da797" fontSize="10">{rows[i].date.slice(2).replaceAll('-','.')}</text></g>)}
      <g clipPath={`url(#${clip})`}>
        {showPrice&&rows.map((r,i)=>{const color=r.close>=r.open?'#f06a60':'#48bba9';return <g key={r.date} data-price-candle><line x1={x(i)} x2={x(i)} y1={py(r.high)} y2={py(r.low)} stroke={color}/><rect x={x(i)-bar/2} y={Math.min(py(r.open),py(r.close))} width={bar} height={Math.max(1,Math.abs(py(r.open)-py(r.close)))} fill={color}/></g>;})}
        {stockInvestors.filter(c=>selected.includes(c.key)).map(c=><g key={c.key} data-flow-line={c.key}>{lineSegments(c.key).map((group,j)=>group.length===1?<circle key={j} cx={x(group[0])} cy={fy(values[group[0]][c.key]!)} r="2.3" fill={c.color}/>:<polyline key={j} points={group.map(i=>`${x(i)},${fy(values[i][c.key]!)}`).join(' ')} stroke={c.color} strokeWidth="2" fill="none" strokeLinejoin="round"/>)}</g>)}
        {rows.map((r,i)=>r.volume===null?null:<rect key={'v'+r.date} x={x(i)-bar/2} y={volumeTop+volumeH-r.volume/maxVolume*volumeH} width={bar} height={r.volume/maxVolume*volumeH} fill={r.close>=r.open?'#ba625655':'#439d9055'}/>)}
        {cursor!==null&&rows[cursor]&&<line data-image-exclude x1={x(cursor)} x2={x(cursor)} y1={top} y2={height-bottom} stroke="#e4c17b" strokeDasharray="3 4"/>}
      </g>
      {cashDays?.map((day,i)=>day.filings.length&&rows[i]?<g key={'filing'+day.date} data-cash-filing role="button" tabIndex={0} aria-label={`${day.filings.map(f=>f.label+(f.correction?' 정정':'')+' 공시 '+f.date).join(', ')}. 상세 보기`} onClick={()=>{select(i);onFilingSelect?.(i);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();select(i);onFilingSelect?.(i);}}} style={{cursor:'pointer'}}><title>{day.filings.map(f=>f.name+' · '+f.date).join(' / ')}</title><line x1={x(i)} x2={x(i)} y1={top+15} y2={height-bottom} stroke="#bca477" opacity=".3" strokeDasharray="3 4"/><rect data-filing-hit x={x(i)-15} y={top-11} width="30" height="30" fill="transparent"/><circle cx={x(i)} cy={top+4} r="9" fill="#302819" stroke={day.filings.some(f=>f.correction)?'#b29ac8':'#d9b871'}/><text x={x(i)} y={top+7} textAnchor="middle" fontSize="9" fill="#edcf91">{day.filings.some(f=>f.correction)?'정':'공'}</text></g>:null)}
      <line x1={left} x2={width-right} y1={volumeTop-6} y2={volumeTop-6} stroke="#2d362a"/>
      <text x={left} y={volumeTop-12} fill="#8c9788" fontSize="10">거래량 (주)</text>
    </svg>
    {active&&hover!==null&&<div className={s.tooltip} style={{[x(hover)>width*.55?'left':'right']:'8%'}} role="status"><b>{active.date}</b><span>종가 <strong>{priceNumber(active.close)}원</strong></span><small>시 {priceNumber(active.open)} · 고 {priceNumber(active.high)} · 저 {priceNumber(active.low)}</small>{stockInvestors.filter(c=>selected.includes(c.key)).map(c=><span key={c.key} style={{color:c.color}}>{c.label}<strong>{flowNumber(values[hover]?.[c.key],unit)}{values[hover]?.[c.key]!=null?(unit==='money'?'억':'주'):''}</strong></span>)}<small>{mode==='cumulative'?'선택 기간 누적':'선택일 순매수'} · {unit==='money'?'금액':'수량'}</small></div>}
    </>}
  </div>;
}
