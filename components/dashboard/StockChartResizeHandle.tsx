'use client';
import {useRef,useState} from 'react';
import s from './StockChartResizeHandle.module.css';
export default function StockChartResizeHandle({axis='y',value,min,max,onChange,onReset,label,scale=()=>1}:{axis?:'x'|'y';value:number;min:number;max:number;onChange:(value:number)=>void;onReset:()=>void;label:string;scale?:()=>number}){
  const drag=useRef<{id:number;start:number;value:number;scale:number}|null>(null),[active,setActive]=useState(false);
  function stop(){drag.current=null;setActive(false);}
  return <div className={axis==='x'?s.vertical:s.horizontal} data-chart-resizer={axis} data-dragging={active||undefined} role="separator" aria-orientation={axis==='x'?'vertical':'horizontal'} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={value+(axis==='x'?'%':'픽셀')} tabIndex={0} title={`${label}: 드래그 또는 방향키로 조절 · 더블클릭으로 기본 크기`} onDoubleClick={onReset}
    onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();drag.current={id:e.pointerId,start:axis==='x'?e.clientX:e.clientY,value,scale:scale()};e.currentTarget.setPointerCapture(e.pointerId);setActive(true);}}
    onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;onChange(Math.max(min,Math.min(max,d.value+((axis==='x'?e.clientX:e.clientY)-d.start)*d.scale)));}}
    onPointerUp={e=>{if(drag.current?.id===e.pointerId){stop();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}}
    onPointerCancel={stop} onLostPointerCapture={stop}
    onKeyDown={e=>{const step=axis==='x'?2:20,negative=axis==='x'?'ArrowLeft':'ArrowUp',positive=axis==='x'?'ArrowRight':'ArrowDown';if([negative,positive,'Home','End'].includes(e.key)){e.preventDefault();onChange(e.key==='Home'?min:e.key==='End'?max:Math.max(min,Math.min(max,value+(e.key===negative?-step:step))));}}}>
    <span aria-hidden="true"/><small aria-hidden="true">높이 조절</small>
  </div>;
}
