"use client";
import { useEffect, useRef, useState } from 'react';
import type { ReversalResult, ReversalUniverse } from '@/lib/reversal-model';
type Issue = {code:string;name:string;stage:'quotes'|'detail'};
export type ReversalScan = {
  date:string;phase:'intraday'|'after';startedAt:string;finishedAt:string;total:number;checked:number;
  detailTotal:number;detailDone:number;rows:ReversalResult[];issues:Issue[];warnings:string[];
  stage:'idle'|'quotes'|'detail'|'done'|'partial';saved:boolean;
};
const blank = (): ReversalScan => ({date:'',phase:'after',startedAt:'',finishedAt:'',total:0,checked:0,detailTotal:0,detailDone:0,rows:[],issues:[],warnings:[],stage:'idle',saved:false});
const key = 'baltatool:reversal-scan:v1';
class ScanError extends Error { constructor(message:string, public status:number) {super(message);} }
async function get<T>(params:Record<string,string>,signal:AbortSignal):Promise<T> {
  const r = await fetch('/api/market/reversal?'+new URLSearchParams(params),{cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(45000)])});
  const body = await r.json();
  if(!r.ok || !body.ok) throw new ScanError(body.error||'후보 조회에 실패했습니다.',r.status);
  return body;
}
function validSnapshot(v: unknown): v is ReversalScan {
  if (!v || typeof v!=='object') return false;
  const s = v as ReversalScan;
  return typeof s.date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && ['after','intraday'].includes(s.phase) &&
    ['total','checked','detailTotal','detailDone'].every(k=>Number.isInteger(s[k as keyof ReversalScan]) && Number(s[k as keyof ReversalScan])>=0) &&
    typeof s.startedAt==='string' && typeof s.finishedAt==='string' && Array.isArray(s.warnings) && s.warnings.every(x=>typeof x==='string') &&
    Array.isArray(s.issues) && s.issues.every(i=>i && typeof i.code==='string' && typeof i.name==='string') && Array.isArray(s.rows) && s.rows.length<=5000 &&
    s.rows.every(r=>r && /^\d{6}$/.test(r.code) && typeof r.name==='string' && typeof r.date==='string' && typeof r.asOf==='string' &&
      ['match','review','excluded'].includes(r.status) && ['kospi','kosdaq'].includes(r.market) &&
      [r.marketCap,r.close].every(n=>n===null || typeof n==='number' && Number.isFinite(n)) &&
      [r.rates,r.volumes,r.averages,r.volumeRatios,r.closes].every(a=>Array.isArray(a) && a.every(n=>n===null || typeof n==='number' && Number.isFinite(n))) &&
      Array.isArray(r.reasons) && r.reasons.every(x=>typeof x==='string') && Array.isArray(r.limitDates) && r.limitDates.every(x=>typeof x==='string') &&
      r.checks && ['cap','candles','volume','limit'].every(k=>['pass','fail','unknown'].includes(r.checks[k as keyof typeof r.checks])));
}
export default function useReversalScanner() {
  const [scan,setScan] = useState<ReversalScan>(blank),[running,setRunning] = useState(false),[error,setError] = useState(''),[storageError,setStorageError] = useState('');
  const controller = useRef<AbortController|null>(null), mounted = useRef(true);
  useEffect(()=>{
    mounted.current=true;
    try {const raw=localStorage.getItem(key);if(raw){const parsed=JSON.parse(raw);if(validSnapshot(parsed))setScan({...parsed,stage:parsed.stage==='done'?'done':'partial',saved:true});}} catch {}
    return()=>{mounted.current=false;controller.current?.abort();};
  },[]);
  async function start() {
    if(controller.current)return;
    const c = new AbortController();controller.current=c;setRunning(true);setError('');setStorageError('');
    let next=blank();setScan(next);
    const update=()=>{if(mounted.current)setScan({...next,rows:[...next.rows],issues:[...next.issues]});};
    try {
      const u=await get<ReversalUniverse>({stage:'universe'},c.signal);
      next={...next,date:u.date,phase:u.phase,startedAt:new Date().toISOString(),total:u.rows.length,warnings:u.warnings,stage:'quotes'};update();
      const selected=new Set<string>();let failures=0;
      for(let i=0;i<u.rows.length;i+=30) {
        if(c.signal.aborted)throw new DOMException('중지','AbortError');
        const stocks=u.rows.slice(i,i+30);
        try {
          const r=await get<{selected:string[];missing:string[]}>({stage:'quotes',codes:stocks.map(s=>s.code).join(','),context:u.context},c.signal);
          const allowed=new Set(stocks.map(s=>s.code));
          r.selected.filter(code=>allowed.has(code)).forEach(code=>selected.add(code));
          next.issues.push(...stocks.filter(s=>r.missing.includes(s.code)).map(s=>({...s,stage:'quotes' as const})));
          failures=0;
        } catch(e) {
          if(c.signal.aborted || e instanceof ScanError && [401,409].includes(e.status))throw e;
          next.issues.push(...stocks.map(s=>({...s,stage:'quotes' as const})));
          if(++failures>=2)throw new Error('시세 조회가 연속으로 실패해 중단했습니다. 연결 상태를 확인하고 전체 재조회해 주세요.');
        }
        next.checked+=stocks.length;next.detailTotal=selected.size;update();
      }
      next.stage='detail';update();
      for(const stock of u.rows.filter(s=>selected.has(s.code))) {
        if(c.signal.aborted)throw new DOMException('중지','AbortError');
        try {
          const r=await get<{row:ReversalResult}>({stage:'detail',codes:stock.code,context:u.context},c.signal);
          next.rows.push(r.row);failures=0;
        } catch(e) {
          if(c.signal.aborted || e instanceof ScanError && [401,409].includes(e.status))throw e;
          next.issues.push({...stock,stage:'detail'});
          if(++failures>=2)throw new Error('상세 조회가 연속으로 실패해 중단했습니다. 전체 재조회해 주세요.');
        }
        next.detailDone++;update();
      }
      next.stage=next.issues.length?'partial':'done';
    } catch(e) {
      next.stage='partial';
      if(mounted.current)setError(c.signal.aborted?'조회가 중지되었습니다. 확인된 결과만 표시합니다.':e instanceof Error?e.message:'조회하지 못했습니다.');
    } finally {
      next.finishedAt=new Date().toISOString();update();
      if(next.date)try {localStorage.setItem(key,JSON.stringify(next));} catch {if(mounted.current)setStorageError('이 브라우저에 결과를 저장하지 못했습니다. CSV로 내려받을 수 있습니다.');}
      controller.current=null;if(mounted.current)setRunning(false);
    }
  }
  return {scan,running,error,storageError,start,stop:()=>controller.current?.abort()};
}
