'use client';
import {useEffect,useState} from 'react';
import type {CashTimelineResponse} from '@/lib/cash-flow-timeline';
export default function useStockCashFlow(code:string,enabled:boolean,refresh:number){
  const [data,setData]=useState<CashTimelineResponse|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!enabled||!/^\d{6}$/.test(code)){setLoading(false);return;}
    const controller=new AbortController();let alive=true;setLoading(true);setError('');setData(null);
    (async()=>{try{
      const r=await fetch('/api/market/cash-flow/timeline?'+new URLSearchParams({code}),{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(58000)])}),body=await r.json();
      if(!r.ok||!body.ok)throw new Error(r.status===401?'로그인이 필요합니다.':body.error||'현금흐름을 불러오지 못했습니다.');
      if(alive)setData(body);
    }catch(e){if(alive)setError(e instanceof Error&&e.name==='TimeoutError'?'공시 연결이 지연되고 있습니다. 다시 조회해 주세요.':e instanceof Error?e.message:'현금흐름 조회에 실패했습니다.');}
    finally{if(alive)setLoading(false);}})();
    return()=>{alive=false;controller.abort();};
  },[code,enabled,refresh,retry]);
  return {data:data?.code===code?data:null,loading,error,reload:()=>setRetry(v=>v+1)};
}
