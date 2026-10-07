'use client';
import {useEffect,useState} from 'react';
export const stockChartDefaults={share:78,price:450,split:640,cash:216};
export const stockChartLimits={share:[55,84],price:[300,850],split:[480,1100],cash:[160,560]} as const;
export type StockChartSizeKey=keyof typeof stockChartDefaults;
const storageKey='baltatool:stock-chart-layout:v1';
const clamp=(key:StockChartSizeKey,value:number)=>Math.round(Math.max(stockChartLimits[key][0],Math.min(stockChartLimits[key][1],value)));
export default function useStockChartSize(){
  const [size,setSize]=useState(stockChartDefaults),[ready,setReady]=useState(false);
  useEffect(()=>{
    try{
      const stored=JSON.parse(localStorage.getItem(storageKey)??'null');
      if(stored&&typeof stored==='object')setSize(Object.fromEntries(Object.entries(stockChartDefaults).map(([key,fallback])=>[key,typeof stored[key]==='number'&&Number.isFinite(stored[key])?clamp(key as StockChartSizeKey,stored[key]):fallback])) as typeof stockChartDefaults);
    }catch{/* Restricted storage still allows resizing for this visit. */}
    setReady(true);
  },[]);
  useEffect(()=>{
    if(!ready)return;
    const timer=setTimeout(()=>{try{localStorage.setItem(storageKey,JSON.stringify(size));}catch{}},150);
    return()=>clearTimeout(timer);
  },[ready,size]);
  return {size,set:(key:StockChartSizeKey,value:number)=>{if(Number.isFinite(value))setSize(current=>({...current,[key]:clamp(key,value)}));},reset:()=>setSize({...stockChartDefaults})};
}
