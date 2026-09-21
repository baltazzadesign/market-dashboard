"use client";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";

type Mover = { code:string; name:string; price:number; rate:number; diff:number; volume:number };
type Payload = { ok?:boolean; kospi?:{movers?:Mover[]}; kosdaq?:{movers?:Mover[]}; error?:string };

function n(value:number, digits=0){
  if(!Number.isFinite(value)) return "—";
  return value.toLocaleString("ko-KR",{minimumFractionDigits:digits,maximumFractionDigits:digits});
}

export default function MarketMovers(){
  const [rows,setRows]=useState<Mover[]>([]);
  const [tab,setTab]=useState<"up"|"down">("up");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    (async()=>{
      try{
        const res=await fetch("/api/market/breadth-test?pages=1&count=20",{cache:"no-store",signal:controller.signal});
        const json=await res.json() as Payload;
        if(!res.ok||json.ok===false) throw new Error(json.error||"등락 종목을 불러오지 못했습니다.");
        const merged=[...(json.kospi?.movers??[]),...(json.kosdaq?.movers??[])];
        const byCode=new Map<string,Mover>();
        for(const row of merged){ const key=row.code||row.name; if(!byCode.has(key)) byCode.set(key,row); }
        setRows([...byCode.values()]);
      }catch(err){ if(!controller.signal.aborted) setError(err instanceof Error?err.message:"등락 종목 조회 실패"); }
      finally{ if(!controller.signal.aborted) setLoading(false); }
    })();
    return()=>controller.abort();
  },[]);
  const list=useMemo(()=>rows.slice().sort((a,b)=>tab==="up"?b.rate-a.rate:a.rate-b.rate).slice(0,5),[rows,tab]);
  return <section className="overview-summary-card movers-card">
    <div className="panel-header movers-head"><h2 className="panel-title">상위 등락 종목</h2><div className="movers-tabs"><button className={tab==="up"?"active":""} onClick={()=>setTab("up")}>상승률</button><button className={tab==="down"?"active":""} onClick={()=>setTab("down")}>하락률</button></div></div>
    <div className="movers-table-head"><span>순위</span><span>종목명</span><span>현재가</span><span>등락률</span></div>
    {loading?<div className="overview-mini-state"><Icon name="refresh" className="spin"/>조회 중</div>:error?<div className="overview-mini-state">저장된 시장 데이터 표시 중</div>:<div className="movers-table">{list.map((row,index)=><div className="movers-row" key={(row.code||row.name)+index}><span>{index+1}</span><strong title={row.code}>{row.name||row.code}</strong><span className="num">{n(row.price)}</span><b className={row.rate>0?"positive":row.rate<0?"negative":""}>{row.rate>0?"▲ ":row.rate<0?"▼ ":""}{n(Math.abs(row.rate),2)}%</b></div>)}</div>}
    <div className="movers-foot"><span>KIS 등락률 순위 기준</span><a href="/research">전체보기 <Icon name="right" size={11}/></a></div>
  </section>;
}
