'use client';
import {useEffect,useState} from 'react';

export const dailyChartDefaults={share:74,main:375,investors:310,flow:260,index:260,breadth:260,ratio:260,kospi:260,kosdaq:260,score:260,accel:260,records:500};
export type DailyChartSizeKey=keyof typeof dailyChartDefaults;
export const dailyChartLimits:Record<DailyChartSizeKey,readonly [number,number]>={share:[55,84],main:[260,900],investors:[220,800],flow:[180,700],index:[180,700],breadth:[180,700],ratio:[180,700],kospi:[180,700],kosdaq:[180,700],score:[180,700],accel:[180,700],records:[240,900]};
const storageKey='baltatool:daily-chart-layout:v1';
const clamp=(key:DailyChartSizeKey,value:number)=>Math.round(Math.max(dailyChartLimits[key][0],Math.min(dailyChartLimits[key][1],value)));

export default function useDailyChartSize(enabled:boolean){
  const [size,setSize]=useState(dailyChartDefaults),[ready,setReady]=useState(false);
  useEffect(()=>{
    if(!enabled)return;
    try{
      const stored=JSON.parse(localStorage.getItem(storageKey)??'null');
      if(stored&&typeof stored==='object')setSize(Object.fromEntries(Object.entries(dailyChartDefaults).map(([key,fallback])=>[key,typeof stored[key]==='number'&&Number.isFinite(stored[key])?clamp(key as DailyChartSizeKey,stored[key]):fallback])) as typeof dailyChartDefaults);
    }catch{/* 크기 조절은 브라우저 저장이 차단되어도 작동합니다. */}
    setReady(true);
  },[enabled]);
  useEffect(()=>{
    if(!enabled||!ready)return;
    const timer=setTimeout(()=>{try{localStorage.setItem(storageKey,JSON.stringify(size));}catch{}},150);
    return()=>clearTimeout(timer);
  },[enabled,ready,size]);
  return {size,set:(key:DailyChartSizeKey,value:number)=>{if(Number.isFinite(value))setSize(current=>({...current,[key]:clamp(key,value)}));},reset:()=>setSize({...dailyChartDefaults})};
}
