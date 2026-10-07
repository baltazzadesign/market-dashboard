'use client';
import {useEffect,useState} from 'react';
import type {StockDisclosureResponse} from '@/lib/stock-disclosures';
export default function useStockDisclosures(code:string,start:string,end:string,enabled:boolean,refresh:number){
  const [state,setState]=useState<{key:string;data:StockDisclosureResponse|null;loading:boolean;error:string}>({key:'',data:null,loading:false,error:''});
  const [retry,setRetry]=useState(0),key=[code,start,end,refresh,retry].join(':');
  const valid=enabled&&/^\d{6}$/.test(code)&&!!start&&!!end;
  useEffect(()=>{
    if(!valid)return;
    const controller=new AbortController();let alive=true;
    setState({key,data:null,loading:true,error:''});
    (async()=>{
      try{
        const response=await fetch('/api/market/disclosures?'+new URLSearchParams({code,start,end}),{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(55000)])}),body=await response.json();
        if(!response.ok||!body.ok)throw new Error(response.status===401?'로그인이 필요합니다.':body.error||'공시를 불러오지 못했습니다.');
        if(body.code!==code||body.start!==start||body.end!==end||!Array.isArray(body.items))throw new Error('공시 조회 결과를 확인하지 못했습니다.');
        if(alive)setState({key,data:body,loading:false,error:''});
      }catch(e){if(alive)setState({key,data:null,loading:false,error:e instanceof Error&&e.name==='TimeoutError'?'공시 조회가 지연되고 있습니다. 다시 조회해 주세요.':e instanceof Error?e.message:'공시 조회에 실패했습니다.'});}
    })();
    return()=>{alive=false;controller.abort();};
  },[key,valid,code,start,end]);
  const current=valid&&state.key===key;
  return {data:current?state.data:null,loading:valid&&(!current||state.loading),error:current?state.error:'',reload:()=>setRetry(v=>v+1)};
}
