"use client";
import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { Area, AreaChart, Brush, ComposedChart, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceDot, ReferenceArea } from "recharts";
import { type MarketRow, type MarketEvent, OPEN_MINUTE, CLOSE_MINUTE, minuteLabel, formatNumber, record, numeric, sourceLabel } from "@/lib/balta-model";
import { Icon } from "./Icon";
import { chartColors as colors, chartNames, chartPoints, fitDomain, MIN_WINDOW, panDomain, seriesMap, seriesValue, zoomDomain, type ChartKind, type Domain, type Series } from "./chart-model";
export type { ChartKind, Domain } from "./chart-model";
export { chartNames, fitDomain } from "./chart-model";

function activeMinute(event: unknown) {
  const minute = numeric(record(event).activeLabel);
  return minute === null ? null : Math.round(Math.max(OPEN_MINUTE, Math.min(CLOSE_MINUTE, minute)));
}
function displayValue(row: MarketRow | undefined, series: Series) {
  const value = seriesValue(row, series);
  return formatNumber(value, series.digits ?? 0, series.signed) + (value === null ? "" : series.unit ?? "");
}
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: readonly unknown[]; label?: unknown }) {
  if (!active || !payload?.length) return null;
  const row = record(record(payload[0]).payload);
  return <div className="chart-tooltip"><strong className="num">{minuteLabel(Number(label))}</strong>
    {payload.map((value, index) => { const item = record(value); return <div className="tooltip-row" key={index}><span style={{ color: String(item.color) }}>{String(item.name)}</span><strong className="num">{formatNumber(numeric(item.value), ["kospi", "kosdaq"].includes(String(item.dataKey)) ? 2 : ["upRatio", "downRatio"].includes(String(item.dataKey)) ? 1 : 0)}</strong></div>; })}
    {row.flowSource && row.flowSource !== "LIVE" ? <div className="panel-subtitle" style={{ marginTop: 6 }}>{sourceLabel(String(row.flowSource))}</div> : null}
  </div>;
}
type ChartProps = {
  rows: MarketRow[]; kind: ChartKind; domain: Domain; onDomainChange?: (domain: Domain) => void;
  selectedMinute?: number | null; events?: MarketEvent[]; showMarkers?: boolean; compact?: boolean; autoScale?: boolean; syncGroup?: string;
  hoverMinute?: number | null; onHoverMinute?: (minute: number | null) => void; onExpand?: () => void; onReset?: () => void; onLatest?: () => void;
  dataCaption?: string; refreshing?: boolean;
};
function MarketChart({ rows, kind, domain, onDomainChange, selectedMinute, events = [], showMarkers = true, compact = false, autoScale = true, syncGroup = "balta-main", hoverMinute = null, onHoverMinute, onExpand, onReset, onLatest, dataCaption = "", refreshing = false }: ChartProps) {
  const id = useId().replace(/:/g, "");
  const plot = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [drag, setDrag] = useState<Domain | null>(null);
  const [dragMode, setDragMode] = useState<"zoom" | "pan">("zoom");
  const [localHover, setLocalHover] = useState<number | null>(null);
  const dragOrigin = useRef<Domain | null>(null);
  const dragBounds = useRef<{ left: number; width: number } | null>(null);
  const allSeries = seriesMap[kind], visible = allSeries.filter(s => !hidden.includes(s.key));
  const latest = rows.at(-1), fullDomain = domain[0] === OPEN_MINUTE && domain[1] === CLOSE_MINUTE;
  const width = domain[1] - domain[0];
  const allPoints = useMemo(() => chartPoints(rows), [rows]);
  const points = useMemo(() => allPoints.slice(domain[0] - OPEN_MINUTE, domain[1] - OPEN_MINUTE + 1), [allPoints, domain]);
  const inspectedMinute = onHoverMinute ? hoverMinute : localHover;
  const inspectedRow = inspectedMinute === null ? undefined : rows.find(row => row.minute === inspectedMinute);
  const referenceMinute = inspectedMinute ?? selectedMinute;
  const setHover = (minute: number | null) => { setLocalHover(minute); onHoverMinute?.(minute); };
  const reset = () => { setHover(null); if (onReset) onReset(); else onDomainChange?.([OPEN_MINUTE, CLOSE_MINUTE]); };
  const zoom = (factor: number, anchor?: number) => onDomainChange?.(zoomDomain(domain, factor, anchor));
  const pan = (direction: number) => onDomainChange?.(panDomain(domain, direction * Math.max(1, Math.round(width / 4))));

  // Native, non-passive wheel listener allows chart zoom without hijacking ordinary page scroll.
  useEffect(() => {
    const element = plot.current;
    if (!element || !onDomainChange) return;
    const wheel = (event: WheelEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || !event.deltaY) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect(), left = 64, right = kind === "index" ? 56 : 20;
      const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left - left) / Math.max(1, rect.width - left - right)));
      onDomainChange(zoomDomain(domain, event.deltaY > 0 ? 1.25 : .8, domain[0] + fraction * (domain[1] - domain[0])));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [domain, kind, onDomainChange]);

  const fixedDomain = useMemo(() => {
    if (kind === "score") return [-100, 100];
    if (kind === "ratio") return [0, 100];
    if (["index", "kospi", "kosdaq"].includes(kind) || autoScale) return ["auto", "auto"];
    const max = Math.max(kind === "flow" ? 1200 : 1800, ...rows.filter(row => row.minute >= domain[0] && row.minute <= domain[1]).flatMap(row => visible.map(s => Math.abs(seriesValue(row, s) ?? 0))));
    return [-Math.ceil(max * 1.05), Math.ceil(max * 1.05)];
  }, [kind, autoScale, rows, domain, visible]);
  const step = width <= 15 ? 2 : width <= 45 ? 5 : width <= 120 ? 15 : compact ? 60 : 30;
  const ticks: number[] = [];
  for (let m = Math.ceil(domain[0] / step) * step; m <= domain[1]; m += step) ticks.push(m);
  if (domain[1] === CLOSE_MINUTE && !ticks.includes(CLOSE_MINUTE)) ticks.push(CLOSE_MINUTE);
  const markerEvents = showMarkers && visible.length > 0 && ["breadth", "score"].includes(kind) ? events.filter(e => e.level === "강" && e.minute >= domain[0] && e.minute <= domain[1]).filter((e, i, all) => all.findIndex(x => x.minute === e.minute) === i) : [];
  const currentVisible = latest && latest.minute >= domain[0] && latest.minute <= domain[1];
  return <div className={"terminal-chart" + (compact ? " is-compact" : "")}>
    <div className="chart-readout">
      <div className="chart-readout-meta"><span className="num">최신 {latest?.time ?? "—"} 기준</span><span>{refreshing ? "갱신 중…" : dataCaption}</span></div>
      <div className="chart-values" aria-label="최신 수치 및 차트 항목 표시">
        {allSeries.map(s => <button key={s.key} className="series-card" aria-pressed={!hidden.includes(s.key)} aria-label={s.name + " " + displayValue(latest, s) + ", 그래프 " + (hidden.includes(s.key) ? "표시" : "숨기기")} onClick={() => setHidden(old => old.includes(s.key) ? old.filter(x => x !== s.key) : [...old, s.key])}>
          <span className="series-name"><i style={{ background: s.color }}/>{s.name}<span className="series-visibility">{hidden.includes(s.key) ? "숨김" : ""}</span></span>
          <strong className="num" style={{ color: s.color }}>{displayValue(latest, s)}</strong>
        </button>)}
      </div>
      {kind === "flow" && latest && latest.flowSource !== "LIVE" && <div className="chart-source-note"><Icon name="warning" size={13}/>{sourceLabel(latest.flowSource)}</div>}
    </div>
    <div className="chart-controls">
      <div className="chart-control-group"><button className="button ghost icon small" aria-label="차트 확대" title="확대 (+)" disabled={!onDomainChange || width <= MIN_WINDOW} onClick={() => zoom(.5)}>+</button><button className="button ghost icon small" aria-label="차트 축소" title="축소 (−)" disabled={!onDomainChange || fullDomain} onClick={() => zoom(2)}>−</button><span className="chart-zoom num">{(390 / width).toFixed(1)}×</span><button className="button ghost icon small" aria-label="이전 시간대로 이동" disabled={!onDomainChange || domain[0] <= OPEN_MINUTE} onClick={() => pan(-1)}><Icon name="left" size={14}/></button><button className="button ghost icon small" aria-label="다음 시간대로 이동" disabled={!onDomainChange || domain[1] >= CLOSE_MINUTE} onClick={() => pan(1)}><Icon name="right" size={14}/></button></div>
      <div className="chart-control-group">{!compact && <button className="button ghost small" aria-pressed={dragMode === "pan"} onClick={() => setDragMode(old => old === "zoom" ? "pan" : "zoom")} title="드래그 동작 전환">{dragMode === "zoom" ? "드래그: 확대" : "드래그: 이동"}</button>}<button className="button ghost small" onClick={reset} disabled={!onDomainChange}>전체</button>{!compact && <button className="button ghost small" disabled={!latest || !onDomainChange} onClick={() => { if (onLatest) onLatest(); else if (latest) onDomainChange?.(fitDomain(latest.minute - 60, latest.minute)); }}>최근 1시간</button>}{onExpand && <button className="button ghost icon small" aria-label={chartNames[kind] + " 화면 확대"} onClick={onExpand}><Icon name="expand" size={15}/></button>}</div>
    </div>
    <div className="chart-inspection" id={id + "-help"}><span className="num">{inspectedMinute !== null ? "커서 " + minuteLabel(inspectedMinute) : minuteLabel(domain[0]) + "–" + minuteLabel(domain[1])}</span>{inspectedMinute !== null ? inspectedRow ? visible.map(s => <span key={s.key} style={{ color: s.color }}>{s.name} <strong className="num">{displayValue(inspectedRow, s)}</strong></span>) : <span>해당 시각 기록 없음</span> : <span>{compact ? "시간축 연동" : "Ctrl/⌘ + 휠 확대 · 더블클릭 초기화"}</span>}</div>
    <div ref={plot} className={"chart-frame chart-plot" + (compact ? " compact" : "") + (dragMode === "pan" ? " pan-mode" : "")} role="group" tabIndex={0} aria-label={chartNames[kind] + " 차트. 플러스·마이너스 키로 확대·축소, 좌우 방향키로 시간 이동, Home 키로 초기화."} aria-describedby={id + "-help"}
      onDoubleClick={reset} onKeyDown={event => { if (event.target !== event.currentTarget || !onDomainChange) return; if (["+", "=", "-", "ArrowLeft", "ArrowRight", "Home", "Escape"].includes(event.key)) event.preventDefault(); if (["+", "="].includes(event.key)) zoom(.5); else if (event.key === "-") zoom(2); else if (event.key === "ArrowLeft") pan(-1); else if (event.key === "ArrowRight") pan(1); else if (event.key === "Home") reset(); else if (event.key === "Escape") { setDrag(null); setHover(null); } }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={points} margin={{ top: 14, left: 2, right: 16, bottom: 4 }} syncId={syncGroup} syncMethod="value" accessibilityLayer
          onMouseDown={event => { const m = activeMinute(event); if (onDomainChange && m !== null) { setDrag([m, m]); dragOrigin.current = [...domain]; const rect = plot.current?.getBoundingClientRect(); if (rect) dragBounds.current = { left: rect.left + 64, width: Math.max(1, rect.width - 64 - (kind === "index" ? 56 : 20)) }; } }}
          onMouseMove={(event, mouse) => { const m = activeMinute(event); setHover(m); if (!drag || m === null) return; if (dragMode === "pan" && dragOrigin.current && dragBounds.current) { const fraction = (mouse.clientX - dragBounds.current.left) / dragBounds.current.width; const originMinute = dragOrigin.current[0] + fraction * (dragOrigin.current[1] - dragOrigin.current[0]); onDomainChange?.(panDomain(dragOrigin.current, drag[0] - originMinute)); } else setDrag([drag[0], m]); }}
          onMouseUp={event => { const m = activeMinute(event); if (drag && dragMode === "zoom" && onDomainChange) { const end = m ?? drag[1]; if (Math.abs(end - drag[0]) >= 2) onDomainChange(fitDomain(drag[0], end)); } setDrag(null); }}
          onMouseLeave={() => { setDrag(null); setHover(null); }}>
          <defs>{allSeries.map(s => <linearGradient key={s.key} id={id + s.key} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity={kind === "flow" ? .11 : .16}/><stop offset="100%" stopColor={s.color} stopOpacity={.008}/></linearGradient>)}</defs>
          <CartesianGrid vertical={false} stroke="#30343b" strokeOpacity={.65} strokeDasharray="2 6"/>
          <XAxis dataKey="minute" type="number" domain={domain} ticks={ticks} tickFormatter={minuteLabel} tick={{ fill: "#999fa9", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#33373e" }} minTickGap={18} height={32} allowDataOverflow />
          <YAxis yAxisId="left" domain={fixedDomain} tick={{ fill: "#999fa9", fontSize: 12 }} tickFormatter={v => Math.abs(Number(v)) >= 10000 ? (Number(v) / 1000).toFixed(1) + "k" : Number(v).toLocaleString("ko-KR", { maximumFractionDigits: 0 })} tickLine={false} axisLine={false} width={62} tickCount={5}/>
          {kind === "index" && <YAxis yAxisId="right" orientation="right" domain={["auto", "auto"]} tick={{ fill: colors.violet, fontSize: 12 }} tickLine={false} axisLine={false} width={52}/>}
          <Tooltip content={<ChartTooltip/>} cursor={false} isAnimationActive={false}/>
          {!["index", "kospi", "kosdaq"].includes(kind) && <ReferenceLine yAxisId="left" y={kind === "ratio" ? 50 : 0} stroke="#717780" strokeOpacity={.6} strokeDasharray="4 5"/>}
          {kind === "score" && <><ReferenceLine yAxisId="left" y={70} stroke="#60353a" strokeDasharray="3 6"/><ReferenceLine yAxisId="left" y={-70} stroke="#304361" strokeDasharray="3 6"/></>}
          {visible.map(s => <Area key={s.key} yAxisId={s.axis ?? "left"} dataKey={s.key} name={s.name} type="linear" stroke={s.color} strokeWidth={compact ? 1.65 : 1.9} fill={"url(#" + id + s.key + ")"} baseValue={["index", "kospi", "kosdaq"].includes(kind) ? "dataMin" : 0} dot={false} activeDot={{ r: 4, stroke: "#0d0f12", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false}/>)}
          {markerEvents.map(e => <ReferenceDot key={e.id} yAxisId="left" x={e.minute} y={kind === "score" ? e.marketScore : e.diff} r={3} fill={e.direction === "up" ? colors.red : e.direction === "down" ? colors.blue : colors.yellow} stroke="#0d0f12" strokeWidth={1.5}/>)}
          {currentVisible && <ReferenceLine yAxisId="left" x={latest.minute} stroke="#aeb4bf" strokeOpacity={.3} strokeDasharray="2 5"/>}
          {currentVisible && visible.map(s => { const value = seriesValue(latest, s); return value === null ? null : <ReferenceDot key={s.key} yAxisId={s.axis ?? "left"} x={latest.minute} y={value} r={3} fill={s.color} stroke="#0d0f12" strokeWidth={1.5}/>; })}
          {referenceMinute != null && referenceMinute >= domain[0] && referenceMinute <= domain[1] && <ReferenceLine yAxisId="left" x={referenceMinute} stroke="#ccd0d6" strokeDasharray="3 4"/>}
          {drag && dragMode === "zoom" && <ReferenceArea yAxisId="left" x1={Math.min(...drag)} x2={Math.max(...drag)} fill="#9caec7" fillOpacity={.15} stroke="#99a8bd" strokeOpacity={.45}/>}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
    {!compact && onDomainChange && <div className="chart-navigator"><div className="navigator-caption"><span>전체 장 탐색</span><span className="num">{minuteLabel(domain[0])}–{minuteLabel(domain[1])} · {width}분</span></div><div className="navigator-frame"><ResponsiveContainer width="100%" height="100%" minWidth={0}><ComposedChart data={allPoints} margin={{ top: 0, left: 0, right: 0, bottom: 0 }}><Brush dataKey="minute" height={40} y={0} travellerWidth={9} startIndex={domain[0] - OPEN_MINUTE} endIndex={domain[1] - OPEN_MINUTE} stroke="#636b77" fill="#101215" tickFormatter={minuteLabel} ariaLabel="조회 시간 범위. 양끝 핸들로 확대하고 선택 영역을 끌어 이동하세요." onChange={value => { if (value.startIndex != null && value.endIndex != null) onDomainChange(fitDomain(OPEN_MINUTE + value.startIndex, OPEN_MINUTE + value.endIndex)); }}><AreaChart data={allPoints}><Area dataKey={allSeries[0].key} stroke={allSeries[0].color} fill={allSeries[0].color} fillOpacity={.06} strokeWidth={1} isAnimationActive={false} connectNulls={false}/></AreaChart></Brush></ComposedChart></ResponsiveContainer></div><div className="navigator-inputs"><label>시작 <input type="range" min={OPEN_MINUTE} max={domain[1] - MIN_WINDOW} value={domain[0]} aria-label="차트 시작 시각" aria-valuetext={minuteLabel(domain[0])} onChange={e => onDomainChange([Number(e.target.value), domain[1]])}/></label><label>끝 <input type="range" min={domain[0] + MIN_WINDOW} max={CLOSE_MINUTE} value={domain[1]} aria-label="차트 종료 시각" aria-valuetext={minuteLabel(domain[1])} onChange={e => onDomainChange([domain[0], Number(e.target.value)])}/></label></div></div>}
  </div>;
}
export default memo(MarketChart);
