"use client";
import Link from "next/link";
import { marketClosedReason, monthWeekdaySlots } from "@/lib/market-calendar";
import dynamic from "next/dynamic";
import {useEffect,useMemo,useState} from "react";
import {Brand,Icon} from "./Icon";
import {Modal} from "./Modal";
import {useMarketFeed} from "./useMarketFeed";
import {buildMarketEvents} from "@/lib/balta-signals";
import {kstParts,formatNumber as n,valueClass,isValidDate,OPEN_MINUTE,CLOSE_MINUTE,record} from "@/lib/balta-model";
import {shiftMonth,monthEnd,validMonth,monthlyReport,estimatePositions,investors,investorNames,type DailyMarket,type Market} from "@/lib/market-history-model";
import type {ChartKind,Domain} from "./chart-model";
const HistoryCharts=dynamic(()=>import("./HistoryCharts"),{ssr:false,loading:()=> <div className="chart-loading">차트 준비 중</div>});
const MarketChart=dynamic(()=>import("./MarketCharts"),{ssr:false,loading:()=> <div className="chart-loading">차트 준비 중</div>});
const colors={foreign:"#5294ff",institution:"#ff545f",individual:"#f2ce53"};
type Tab="calendar"|"review"|"positions";
const tabNames:Record<Tab,string>={calendar:"시장 캘린더",review:"월간 종합 평가",positions:"추정 포지션"};
function pct(value:number|null){return value===null?"—":n(value,2,true)+"%";}
function money(value:number|null){return value===null?"—":Math.abs(value)>=10000?n(value/10000,2,true)+"조":n(value,0,true)+"억";}
function Stat({label,value,detail,tone=""}:{label:string;value:string;detail?:string;tone?:string}){return <div className="history-stat"><span>{label}</span><strong className={"num "+tone}>{value}</strong>{detail&&<small>{detail}</small>}</div>;}
function DayDetail({date,onClose}:{date:string;onClose:()=>void}){
  const feed=useMarketFeed(date,false,false),[kind,setKind]=useState<ChartKind>("flow"),[domain,setDomain]=useState<Domain>([OPEN_MINUTE,CLOSE_MINUTE]);
  const events=useMemo(()=>buildMarketEvents(feed.rows),[feed.rows]);
  return <Modal open onClose={onClose} title={date+" · 장중 상세"} wide><div className="history-detail">
    <div className="toolbar"><div className="segmented">{([['flow','투자자 수급'],['kospi','KOSPI'],['kosdaq','KOSDAQ'],['breadth','시장폭'],['score','시장점수']] as [ChartKind,string][]).map(([key,label])=><button key={key} onClick={()=>setKind(key)} className={key===kind?"active":""} aria-pressed={key===kind}>{label}</button>)}</div><Link href={"/daily?date="+date} className="button small">일별 분석 열기</Link></div>
    {feed.loading?<div className="chart-loading">장중 기록 조회 중</div>:feed.error?<div className="empty-state" role="alert"><strong>{feed.error}</strong><button className="button" onClick={()=>void feed.refresh(true)}>다시 시도</button></div>:!feed.rows.length?<div className="empty-state"><strong>저장된 장중 기록이 없습니다.</strong><p>해당 날짜가 휴장일인지 또는 수집이 누락되었는지 확인해 주세요.</p></div>:<MarketChart rows={feed.rows} kind={kind} domain={domain} onDomainChange={setDomain} events={events} showMarkers onReset={()=>setDomain([OPEN_MINUTE,CLOSE_MINUTE])} dataCaption="저장된 장중 기록"/>}
    <p className="history-footnote">장중 수급은 KOSPI·KOSDAQ 합계입니다. 월간 화면의 시장별 수급과 범위가 다릅니다.</p>
  </div></Modal>;
}
export default function HistoryWorkspace(){
  const [closedDates,setClosedDates]=useState<Record<string,string>>({});
  const [today,setToday]=useState(""),[month,setMonth]=useState(""),[market,setMarket]=useState<Market>("kospi"),[tab,setTab]=useState<Tab>("calendar");
  const [lookback,setLookback]=useState(3),[days,setDays]=useState<DailyMarket[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[reload,setReload]=useState(0),[asOf,setAsOf]=useState("");
  const [detail,setDetail]=useState<string|null>(null),[start,setStart]=useState(""),[end,setEnd]=useState("");
  useEffect(()=>{const d=kstParts().date;setToday(d);setMonth(d.slice(0,7));const key=new URLSearchParams(window.location.search).get("tab");if(key&&key in tabNames)setTab(key as Tab);},[]);
  useEffect(()=>{if(!month)return;setStart(shiftMonth(month,-lookback+1)+"-01");setEnd(monthEnd(month)<today?monthEnd(month):today);},[month,lookback,today]);
  useEffect(()=>{
    if(!month)return;const controller=new AbortController();let active=true;
    setLoading(true);setError("");setDays([]);setClosedDates({});
    fetch("/api/market/history?month="+month+"&months="+Math.max(3,lookback),{cache:"no-store",signal:controller.signal}).then(async res=>{
      if(res.status===401){window.location.assign("/login");return;}
      const body=record(await res.json());if(!res.ok||body.ok!==true||!Array.isArray(body.days))throw new Error(String(body.error??"시장 기록을 조회하지 못했습니다."));
      if(active){setDays(body.days as DailyMarket[]);setClosedDates(record(body.closedDates) as Record<string,string>);setAsOf(String(body.asOf??""));}
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:"조회 오류");}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;controller.abort();};
  },[month,lookback,reload]);
  useEffect(()=>{if(!month||month!==today.slice(0,7))return;const id=setInterval(()=>{if(!document.hidden){const d=kstParts().date;setToday(d);setReload(v=>v+1);}},60000);return()=>clearInterval(id);},[month,today]);
  const report=useMemo(()=>monthlyReport(days,month,market),[days,month,market]);
  const positions=useMemo(()=>estimatePositions(days,market,start,end),[days,market,start,end]);
  const byDate=useMemo(()=>new Map(report.days.map(d=>[d.date,d])),[report.days]);
  const dates=useMemo(()=>monthWeekdaySlots(month),[month]);
  const summary=report.current;
  function changeMonth(value:string){if(validMonth(value)&&value<=today.slice(0,7))setMonth(value);}
  return <div className="workspace history-workspace">
    <a className="skip-link" href="#main-content">본문으로 이동</a>
    <aside className="sidebar" aria-label="주 메뉴"><Link href="/"><Brand/></Link><div className="workspace-label">WORKSPACE</div><nav className="nav-list"><Link className="nav-link" href="/" title="시장 대시보드"><Icon name="grid"/><span className="nav-label">시장 대시보드</span></Link><Link className="nav-link" href="/daily" title="일별 분석"><Icon name="chart"/><span className="nav-label">일별 분석</span></Link>{(Object.keys(tabNames) as Tab[]).map(key=><button key={key} title={tabNames[key]} className={"nav-link"+(tab===key?" active":"")} aria-pressed={tab===key} onClick={()=>setTab(key)}><Icon name={key==="calendar"?"calendar":key==="review"?"layers":"chart"}/><span className="nav-label">{tabNames[key]}</span></button>)}</nav><div className="sidebar-bottom"><div className="sidebar-note"><Icon name="layers"/><span><strong>KR MARKET</strong>KOSPI · KOSDAQ</span></div></div></aside>
    <header className="topbar"><div className="mobile-brand"><Link href="/"><Brand/></Link></div><div className="breadcrumb"><Icon name="layers" size={15}/><span>워크스페이스</span><Icon name="right" size={12}/><strong>{tabNames[tab]}</strong></div><div className="topbar-meta"><span className="clock-label num">{asOf||"—"} KST</span><span className="tag">{loading?"조회 중":"저장 기록 분석"}</span></div></header>
    <main id="main-content" className="main-content">
      <div className="page-heading"><div><h1>{tabNames[tab]}</h1><p>{tab==="calendar"?"하루의 흐름을 쌓아, 한 달의 방향을 읽습니다.":tab==="review"?"수익률·시장폭·수급으로 살펴보는 시장의 체력.":"투자주체의 순매수 흐름을 지수 가격에 연결합니다."}</p></div><div className="toolbar"><button className="button icon" disabled={!month} aria-label="이전 달" onClick={()=>changeMonth(shiftMonth(month,-1))}><Icon name="left"/></button><label className="date-control"><Icon name="calendar"/><span className="sr-only">조회 월</span><input type="month" value={month} min="2000-01" max={today.slice(0,7)} onChange={e=>changeMonth(e.target.value)}/></label><button className="button icon" aria-label="다음 달" disabled={!month||month>=today.slice(0,7)} onClick={()=>changeMonth(shiftMonth(month,1))}><Icon name="right"/></button><button className="button icon" disabled={loading} aria-label="시장 기록 새로고침" onClick={()=>setReload(v=>v+1)}><Icon name="refresh" className={loading?"spin":""}/></button></div></div>
      <div className="history-toolbar"><div className="segmented">{(Object.keys(tabNames) as Tab[]).map(key=><button key={key} className={tab===key?"active":""} aria-pressed={tab===key} onClick={()=>setTab(key)}>{tabNames[key]}</button>)}</div>{tab!=="calendar"&&<div className="segmented" aria-label="분석 시장">{(["kospi","kosdaq"] as Market[]).map(key=><button key={key} onClick={()=>setMarket(key)} aria-pressed={market===key} className={market===key?"active":""}>{key.toUpperCase()}</button>)}</div>}</div>
      {month&&(month.slice(0,4)!=="2026"||(tab==="positions"&&start&&start.slice(0,4)!=="2026"))&&<div className="notice" role="status"><Icon name="calendar"/><span>2026년 외의 기간은 주말·고정 휴일만 기본 반영됩니다. 대체·음력·임시 휴장일은 해당 연도 목록을 추가로 설정해야 합니다.</span></div>}
      {error?<div className="notice" role="alert"><Icon name="warning"/><span>{error}</span><button className="button small" onClick={()=>setReload(v=>v+1)}>다시 시도</button></div>:loading?<div className="chart-loading" role="status"><Icon name="refresh" className="spin"/>시장 기록을 불러오는 중</div>:<>
      {!days.length&&<div className="notice" role="status"><Icon name="calendar"/><span>조회 기간의 저장 기록이 없습니다. 데이터 수집 후 캘린더와 분석이 채워집니다.</span></div>}
      {tab==="calendar"&&<section className="panel"><div className="panel-header"><div><h2 className="panel-title">{month.replace("-","년 ")}월</h2><p className="panel-subtitle">{report.days.length}일 기록 · 날짜를 눌러 장중 그래프 확인</p></div><span className="tag">수급·시장폭: 양 시장 합계</span></div><div className="calendar-scroll"><div className="market-calendar"><div className="calendar-week">{['월','화','수','목','금'].map(d=><div key={d}>{d}</div>)}</div><div className="calendar-days">{dates.map((date,i)=>{
        if(!date)return <div className="calendar-blank" key={'blank'+i}/>;
        const closure=closedDates[date]??marketClosedReason(date),day=closure?undefined:byDate.get(date),future=date>today;
        return <button key={date} className={"calendar-day"+(day?" has-data":"")+(date===today?" is-today":"")+(closure?" is-closed":"")} disabled={future||Boolean(closure)} onClick={()=>setDetail(date)} aria-label={date+(closure?" "+closure+" 휴장":day?" 시장 기록 상세":" 기록 조회")}>
          <span className="calendar-date"><strong>{Number(date.slice(8))}</strong><small>{closure?"휴장":day?(day.finalized?"마감 기록":day.time+" 미완료"):future?"예정":"기록 없음"}</small></span>
          {day?<><span className="calendar-index"><span>KOSPI</span><b className={valueClass(day.kospi.changePct)}>{pct(day.kospi.changePct)}</b></span><span className="calendar-index"><span>KOSDAQ</span><b className={valueClass(day.kosdaq.changePct)}>{pct(day.kosdaq.changePct)}</b></span><span className="calendar-breadth"><span>상승 {n(day.up)} / 하락 {n(day.down)}</span><span>시장폭 <b className={valueClass(day.breadth)}>{n(day.breadth,0,true)}</b></span></span><span className="calendar-flows">{investors.map(key=><span key={key}><i style={{color:colors[key]}}>{investorNames[key]}</i><b>{money(day.flows[key])}</b></span>)}</span><span className="calendar-turnover">거래대금 <b>{money(day.turnover)}</b></span><span className="calendar-pulse"><span>Pulse <b>{n(day.pulse)}</b></span><span className="pulse-track"><i style={{width:(day.pulse??0)+"%",background:day.pulse===null?"transparent":day.pulse>=50?"#ff545f":"#5294ff"}}/></span></span></>:<span className="calendar-no-data">{closure??(future?"—":"미수집")}</span>}
        </button>;
      })}</div></div></div><p className="history-footnote">등락률은 전일 대비입니다. —는 결측값입니다. Pulse는 기존 시장점수(−100~100)를 0~100으로 환산한 값입니다. 주말은 숨기고 공휴일·증시 휴장일은 거래 데이터와 모든 집계에서 제외합니다. 평일 휴장일은 요일 정렬을 위해 날짜와 휴장명만 표시합니다.</p></section>}
      {tab==="review"&&<>
        <div className="history-review-top"><section className="panel score-panel"><span className="history-eyebrow">MONTHLY MARKET SCORE</span><div className="score-number num">{n(summary.score)}<small>/ 100</small></div><strong>{summary.score===null?"평가 대기":summary.score>=70?"강한 시장 흐름":summary.score>=55?"상승 우위":summary.score>=45?"중립 구간":summary.score>=30?"약한 시장 흐름":"하락 압력 우위"}</strong><p>{summary.asOf??"마감 기록 없음"} 기준 · {month===today.slice(0,7)?"월중 잠정 평가":"저장 기록 기준 평가"}</p><div className="score-components">{summary.components.map(c=><div key={c.label}><span>{c.label}<small>{c.weight}%</small></span><span className="score-track"><i style={{width:(c.value??0)+"%"}}/></span><b className="num">{n(c.value)}</b></div>)}</div><p>평가 항목 확보 {summary.coverage}% · 결측 항목 제외 후 가중치 재조정</p></section>
        <div className="history-stat-grid"><Stat label={market.toUpperCase()+" 월 수익률"} value={pct(summary.monthReturn)} tone={valueClass(summary.monthReturn)} detail={summary.baselineDate?summary.baselineDate+" 마감 기록 대비":"전월 마감 기록 필요"}/><Stat label="상승일 / 하락일" value={summary.upDays+" / "+summary.downDays} detail={"보합 "+summary.flatDays+"일 · 등락 확인 "+summary.returnDays+"일"}/><Stat label="평균 시장폭" value={n(summary.averageBreadth,0,true)+"개"} detail={"양 시장 합계 · 평균 정규화 폭 "+pct(summary.breadth)}/><Stat label="일간 변동성" value={summary.volatility===null?"—":n(summary.volatility,2)+"%"} detail="일간 등락률의 표본 표준편차"/><Stat label="전월 대비 시장 체력" value={report.strengthDelta===null?"—":n(report.strengthDelta,1,true)+"점"} tone={valueClass(report.strengthDelta)} detail={"공통 항목 "+report.comparisonCoverage+"% 기준"}/><Stat label="평균 Market Pulse" value={n(summary.pulse,1)} detail={"마감 기록 "+summary.days+"일 · 미완료 제외 "+summary.provisional+"일"}/></div></div>
        <section className="panel"><div className="panel-header"><div><h2 className="panel-title">{market.toUpperCase()} 월 누적 수급</h2><p className="panel-subtitle">거래일별 마감 순매수 합계 · 유효 기록 {summary.flowDays}/{summary.days}일</p></div></div><div className="history-flow-grid">{investors.map(key=><Stat key={key} label={investorNames[key]} value={money(summary.flowTotals[key])} detail="부분 기록이면 관측된 날짜만 합산"/>)}</div></section>
        <div className="history-best-grid">{([{label:"최고 거래일",day:summary.best},{label:"최악 거래일",day:summary.worst}]).map(item=><section className="panel best-day" key={item.label}><div><span>{item.label}</span><strong className={"num "+valueClass(item.day?.[market].changePct)}>{pct(item.day?.[market].changePct??null)}</strong></div>{item.day?<button className="button" onClick={()=>setDetail(item.day!.date)}>{item.day.date}<Icon name="right"/></button>:<span>등락률 기록 필요</span>}</section>)}</div>
        <section className="panel"><div className="panel-header"><h2 className="panel-title">집계 기준</h2></div><div className="history-method"><p>월 수익률은 저장된 전월 마지막 마감 지수와 선택 월 마지막 마감 지수의 비율입니다. 수집이 중단된 경우 실제 월말 수익률과 다를 수 있습니다. 미완료 거래일은 월간 통계에서 제외합니다.</p><p>Market Score는 수익률 30%, 양 시장의 평균 시장폭 30%, 상승일 비율 15%, 선택 시장 외국인·기관 합산 순매수일 비율 15%, 안정성 10%를 합친 설명용 지표입니다. 전월 비교는 양쪽에 있는 항목만 동일 가중치로 비교하며, 월중에는 전월 전체 관측 기간과 비교합니다.</p><p>과거 기록에 시장별 수급·등락률·거래대금이 없으면 해당 지표는 계산하지 않습니다. 기록된 일수는 실제 거래일 전체가 아닐 수 있습니다.</p></div></section>
      </>}
      {tab==="positions"&&<>
        <div className="notice position-disclaimer"><Icon name="help"/><span><strong>실제 보유 원가가 아닌 지수 환산 추정치입니다.</strong> 시장별 순매수 금액을 해당 지수 가격으로 환산합니다. 종목별 매입가·실제 보유수량·확정 손익을 뜻하지 않습니다.</span></div>
        <div className="history-position-controls"><label>조회 범위 <select className="filter-select" value={lookback} onChange={e=>setLookback(Number(e.target.value))}>{[3,6,12,24].map(v=><option key={v} value={v}>{v}개월</option>)}</select></label><label>시작 <input type="date" value={start} min={month?shiftMonth(month,-lookback)+"-01":undefined} max={end} onChange={e=>{if(isValidDate(e.target.value)&&e.target.value<=end)setStart(e.target.value);}}/></label><label>종료 <input type="date" value={end} min={start} max={month&&monthEnd(month)<today?monthEnd(month):today} onChange={e=>{if(isValidDate(e.target.value)&&e.target.value>=start)setEnd(e.target.value);}}/></label><span>{market.toUpperCase()} {n(positions.currentPrice,2)} · {positions.priceDate??"가격 없음"} {positions.priceTime??""}</span></div>
        <div className="history-position-grid">{positions.positions.map(p=><section className="panel position-card" key={p.key} style={{borderTopColor:colors[p.key]}}><div className="position-heading"><h2 style={{color:colors[p.key]}}>{investorNames[p.key]}</h2><span className={"tag "+valueClass(p.pnlPct)}>{p.pnlPct===null?"계산 대기":p.pnlPct>0?"수익권":p.pnlPct<0?"손실권":"손익분기"}</span></div><span className="position-caption">추정 평균매입단가 · 지수 포인트</span><strong className="position-price num">{n(p.averageCost,2)}</strong><div className="position-pnl"><span>기준 지수 대비 추정 손익률</span><b className={valueClass(p.pnlPct)}>{pct(p.pnlPct)}</b></div><dl><div><dt>기간 누적 순매수</dt><dd>{money(p.net)}</dd></div><div><dt>추정 잔여 원금</dt><dd>{p.observations?money(p.cost):"—"}</dd></div><div><dt>유효 마감 기록</dt><dd>{p.observations}/{positions.closedDays}일</dd></div></dl>{p.unmatchedSell>0&&<p className="history-footnote">기간 이전 보유분으로 간주한 초과 매도 {money(p.unmatchedSell)}</p>}{p.observations===0&&<p className="history-footnote">시장별 정상 수급·가격 기록을 수집하면 계산합니다.</p>}</section>)}</div>
        <HistoryCharts result={positions}/>
        <details className="panel history-method"><summary>추정 방법과 데이터 범위</summary><p>조회 시작 보유량은 0입니다. 순매수일에는 금액 ÷ 당일 마감 지수로 환산 수량을 늘리고, 순매도일에는 같은 방식의 환산 수량을 기존 가격대에 비례해 차감합니다. 잔여 원금 ÷ 환산 수량이 추정 평단입니다. 잔여 수량이 없으면 평단과 손익률을 표시하지 않습니다.</p><p>매도액이 추정 보유분을 초과하면 잔여 포지션을 0으로 만들고 초과분은 기간 이전 보유분으로 간주합니다. 공매도 포지션을 만들지 않습니다. 양의 순매수만 누적한 실제 매수단가가 아니며, 거래대금 전체나 계좌 내역을 이용한 값도 아닙니다.</p><p>수급 출처와 지수 가격이 정상인 15:30 마감 기록만 사용합니다. 미완료 {positions.excludedDays}일은 포지션 증감에서 제외하고, 손익률 비교에는 선택 종료일 이내 최신 정상 지수를 사용합니다. 종료일을 과거로 지정하면 당시 기준으로 계산합니다.</p></details>
      </>}
      </>}
      <footer className="workspace-footer"><span>저장 시각 기준 · KST · 금액은 억원 · 추정 지표는 투자 결과를 보장하지 않습니다.</span><Link href="/">실시간 대시보드로<Icon name="right" size={13}/></Link></footer>
    </main>
    <nav className="mobile-nav" aria-label="모바일 메뉴"><Link href="/"><Icon name="grid"/><span>대시보드</span></Link>{(Object.keys(tabNames) as Tab[]).map(key=><button key={key} className={tab===key?"active":""} onClick={()=>setTab(key)}><Icon name={key==="calendar"?"calendar":key==="review"?"layers":"chart"}/><span>{key==="calendar"?"캘린더":key==="review"?"월간 평가":"추정 포지션"}</span></button>)}</nav>
    {detail&&<DayDetail key={detail} date={detail} onClose={()=>setDetail(null)}/>}
  </div>;
}
