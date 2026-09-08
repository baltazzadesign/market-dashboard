"use client";
import { useId, type CSSProperties } from "react";
import { type MarketRow, type MarketEvent, formatNumber as fmt, valueClass, marketTone, marketNarrative, sourceLabel } from "@/lib/balta-model";
import { Icon, type IconName } from "./Icon";
function Sparkline({ values, color }: { values: (number | null)[]; color: string }) {
  const id = useId().replace(/:/g, "");
  const data = values.filter((v): v is number => v !== null);
  if (data.length < 2) return null;
  const min = Math.min(...data), range = Math.max(...data) - min || 1;
  const segments: string[][] = [];
  values.forEach((value, index) => {
    if (value === null) return;
    if (index === 0 || values[index - 1] === null) segments.push([]);
    segments.at(-1)!.push(`${(index / (values.length - 1) * 280).toFixed(1)},${(42 - (value - min) / range * 34).toFixed(1)}`);
  });
  return <svg className="metric-spark" viewBox="0 0 280 52" preserveAspectRatio="none" fill="none" aria-hidden="true">
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop stopColor={color} stopOpacity=".24"/><stop offset="1" stopColor={color} stopOpacity="0"/></linearGradient></defs>
    {segments.map((points, index) => <g key={index}><path d={`M${points[0].split(",")[0]},52 L${points.join(" L")} L${points.at(-1)!.split(",")[0]},52 Z`} fill={`url(#${id})`}/><polyline points={points.join(" ")} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/></g>)}
  </svg>;
}

function ScoreGauge({ value }: { value?: number }) {
  const id = useId().replace(/:/g, "");
  const score = value != null && Number.isFinite(value) ? Math.max(-100, Math.min(100, value)) : null;
  const angle = Math.PI * (1 - ((score ?? 0) + 100) / 200);
  return <div className="score-gauge" role={score === null ? undefined : "meter"} aria-label="시장점수" aria-valuemin={score === null ? undefined : -100} aria-valuemax={score === null ? undefined : 100} aria-valuenow={score ?? undefined} aria-valuetext={score === null ? undefined : `${fmt(score, 0, true)}점`}>
    <svg viewBox="0 0 220 125" fill="none" aria-hidden="true">
      <defs><linearGradient id={id} x1="20" y1="0" x2="200" y2="0" gradientUnits="userSpaceOnUse"><stop stopColor="var(--down)"/><stop offset=".5" stopColor="#555f7d"/><stop offset="1" stopColor="var(--up)"/></linearGradient></defs>
      <path d="M20 110 A90 90 0 0 1 200 110" stroke="#263047" strokeWidth="9" strokeLinecap="round"/>
      <path d="M20 110 A90 90 0 0 1 200 110" stroke={`url(#${id})`} strokeWidth="9" strokeLinecap="round" opacity={score === null ? .2 : 1}/>
      <path d="M34 110 A76 76 0 0 1 186 110" stroke="#687998" strokeOpacity=".4" strokeDasharray="1 9"/>
      {score !== null && <circle cx={110 + 90 * Math.cos(angle)} cy={110 - 90 * Math.sin(angle)} r="6" fill="white" stroke="#111b2d" strokeWidth="3"/>}
    </svg>
    <div className="gauge-value"><span>시장점수</span><strong className={"num " + valueClass(score)}>{fmt(score, 0, true)}</strong></div>
    <div className="gauge-labels"><span>−100 약세</span><span>강세 +100</span></div>
  </div>;
}
export function Metrics({ rows, loading }: { rows: MarketRow[]; loading: boolean }) {
  const last = rows.at(-1), prev = rows.at(-2);
  function delta(current?: number | null, previous?: number | null) {
    if (current == null || previous == null || previous === 0) return <span>직전 비교 없음</span>;
    const move = current - previous;
    return <><span className={valueClass(move)}>{move > 0 ? "▲" : move < 0 ? "▼" : "―"} {fmt(Math.abs(move / previous * 100), 2)}%</span><span>직전 기록 대비</span></>;
  }
  const cards: { name: string; value: number | null | undefined; icon: IconName; digits?: number; unit?: string; signed?: boolean; foot: React.ReactNode; series: (number | null)[]; color?: string }[] = [
    { name: "KOSPI", value: last?.kospi, digits: 2, icon: "chart", foot: delta(last?.kospi, prev?.kospi), series: rows.map(r=>r.kospi) },
    { name: "KOSDAQ", value: last?.kosdaq, digits: 2, icon: "chart", foot: delta(last?.kosdaq, prev?.kosdaq), series: rows.map(r=>r.kosdaq), color: "#b4a0f4" },
    { name: "시장 폭", value: last?.diff, unit: "개", signed: true, icon: "activity", foot: <><span className="positive">상승 {fmt(last?.up)}</span><span>·</span><span className="negative">하락 {fmt(last?.down)}</span></>, series: rows.map(r=>r.diff), color: last && last.diff < 0 ? "#79aaff" : "#ff7c8a" },
    { name: "외국인 + 기관", value: last?.flowPower, unit: "억", signed: true, icon: "layers", foot: <span>{last ? sourceLabel(last.flowSource) : "수급 기록 대기"}</span>, series: rows.map(r=>r.flowPower), color: last && (last.flowPower ?? 0) < 0 ? "#79aaff" : "#ff7c8a" },
  ];
  return <div className="metric-grid">{cards.map(card => <section key={card.name} className="metric" aria-label={card.name} style={{ "--metric-color": card.color ?? "#7de2d1" } as CSSProperties}><div className="metric-label"><span>{card.name}</span><span className="metric-icon"><Icon name={card.icon} size={17}/></span></div>{loading ? <><div className="loading-line large"/><div className="loading-line"/></> : <><div className={"metric-value num " + (card.signed ? valueClass(card.value) : "")}>{fmt(card.value, card.digits ?? 0, card.signed)}{card.unit && card.value != null && <small>{card.unit}</small>}</div><div className="metric-foot">{card.foot}</div><div className="metric-trend"><Sparkline values={card.series.slice(-60)} color={card.color ?? "#7de2d1"}/></div></>}</section>)}</div>;
}
export function MarketSummary({ row }: { row?: MarketRow }) {
  const total = row ? row.up + row.down + row.flat : 0;
  return <section className="panel briefing-panel"><div className="market-summary"><div className="summary-eyebrow"><span><Icon name="activity" size={15}/>시장 브리핑</span><span className="num">{row?.time ?? "—"} 기준</span></div><h2 className={"summary-tone " + valueClass(row?.diff)}>{marketTone(row)}</h2><p className="summary-copy">{marketNarrative(row)}</p><ScoreGauge value={row?.marketScore}/></div><div className="breadth-strip"><div className="breadth-counts"><span className="positive">상승<strong className="num">{row ? fmt(row.upRatio*100, 1) + "%" : "—"}</strong></span><span className="muted" style={{ textAlign: "center" }}>보합<strong className="num">{row && total ? fmt(row.flat/total*100, 1) + "%" : "—"}</strong></span><span className="negative" style={{ textAlign: "right" }}>하락<strong className="num">{row ? fmt(row.downRatio*100, 1) + "%" : "—"}</strong></span></div><div className="breadth-bar" aria-hidden="true">{row && total > 0 && <><span style={{ width: row.up/total*100+"%", background:"var(--up)" }}/><span style={{ width:row.flat/total*100+"%", background:"#667184" }}/><span style={{ width:row.down/total*100+"%", background:"var(--down)" }}/></>}</div></div></section>;
}
export function FlowPanel({ row }: { row?: MarketRow }) {
  const entries = [{ name:"외국인", value:row?.foreignFlow, color:"#b4a0f4" },{ name:"기관", value:row?.instFlow, color:"#f1c278" },{ name:"개인", value:row?.indivFlow, color:"#79aaff" }];
  const max = Math.max(1,...entries.map(e => Math.abs(e.value ?? 0)));
  return <section className="panel"><div className="panel-header"><h2 className="panel-title">투자자 수급</h2><span className="panel-subtitle">누적 · 억원</span></div><div className="flow-list">{entries.map(e=><div className="flow-row" key={e.name}><div className="flow-row-head"><span style={{ display:"flex",gap:8,alignItems:"center" }}><span className="legend-line" style={{ color:e.color, width:8, height:8, borderRadius:2 }}/>{e.name}</span><strong className={"num " + valueClass(e.value)}>{fmt(e.value,0,true)}</strong></div><div className="flow-track" aria-hidden="true"><div className="flow-track-fill" style={{ width:Math.abs(e.value??0)/max*100+"%", background:e.color }}/></div></div>)}</div><div className="flow-total"><span className="muted">외국인 + 기관</span><strong className={"num " + valueClass(row?.flowPower)}>{fmt(row?.flowPower,0,true)}</strong></div>{row && row.flowSource !== "LIVE" && <div className="chart-footer"><Icon name="warning" size={14}/>{sourceLabel(row.flowSource)}</div>}</section>;
}
export function SignalPanel({ events, onSelect, onAll }: { events: MarketEvent[]; onSelect:(minute:number)=>void; onAll:()=>void }) {
  return <section className="panel signal-panel"><div className="panel-header"><h2 className="panel-title"><Icon name="bell" size={16}/>주요 신호</h2><span className="tag">{events.length}개</span></div>{!events.length ? <div className="empty-state compact"><Icon name="activity" size={25}/><p>감지된 신호가 없습니다.</p></div> : <div className="events-preview">{events.slice(0,4).map(event=><button className="event-item" key={event.id} onClick={()=>onSelect(event.minute)} title={event.time+" 신호를 차트에서 확인"}><span className={"event-glyph "+event.direction}><Icon name={event.direction==="up"?"up":event.direction==="down"?"down":"activity"} size={15}/></span><span className="event-copy"><strong>{event.label}</strong><p>{event.message}</p><span className="event-meta"><span className="num">{event.time}</span><span>{event.level} · {event.source}</span></span></span></button>)}</div>}<button className="panel-link" onClick={onAll}>신호 기록 모두 보기<Icon name="right" size={14}/></button></section>;
}
export function SessionSummary({ rows, events }: { rows: MarketRow[]; events: MarketEvent[] }) {
  if (!rows.length) return null;
  const high = rows.reduce((best,row)=>row.diff>best.diff?row:best);
  const low = rows.reduce((best,row)=>row.diff<best.diff?row:best);
  const flowRows = rows.filter(row=>row.flowPower!==null && row.flowSource==="LIVE");
  const flow = flowRows.length ? flowRows.reduce((best,row)=>Math.abs(row.flowPower??0)>Math.abs(best.flowPower??0)?row:best) : null;
  const cards = [
    { label:"최고 시장 폭",value:high.diff,time:high.time,unit:"개" },
    { label:"최저 시장 폭",value:low.diff,time:low.time,unit:"개" },
    { label:"최대 합산 수급 · 절댓값",value:flow?.flowPower,time:flow?.time??"정상 수급 기록 없음",unit:"억" },
  ];
  return <section className="panel"><div className="panel-header"><h2 className="panel-title">기록 요약</h2><span className="panel-subtitle num">{rows[0].time}–{rows.at(-1)?.time} · {rows.length}개 기록</span></div><div className="session-grid">{cards.map(card=><div className="session-item" key={card.label}><span>{card.label}</span><strong className={"num "+valueClass(card.value)}>{fmt(card.value,0,true)}<small style={{fontSize:12,fontWeight:400,marginLeft:4}}>{card.value!=null?card.unit:""}</small></strong><span className="num">{card.time}</span></div>)}<div className="session-item"><span>주요 신호</span><strong className="num">{events.length}<small style={{fontSize:12,fontWeight:400,marginLeft:4}}>개</small></strong><span>강한 신호 {events.filter(e=>e.level==="강").length}개</span></div></div></section>;
}
