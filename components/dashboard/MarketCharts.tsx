"use client";
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Area, AreaChart, Brush, ComposedChart, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceDot, ReferenceArea } from "recharts";
import { type MarketRow, type MarketEvent, OPEN_MINUTE, REGULAR_CLOSE_MINUTE, CLOSE_MINUTE, minuteLabel, formatNumber, record, numeric, sourceLabel, breadthLabel } from "@/lib/balta-model";
import { Icon } from "./Icon";
import { chartColors as colors, chartNames, MIN_WINDOW, seriesMap, chartSeriesValue, fitDomain, zoomDomain, panDomain, observedDomain, comparisonBaseline, relativeIndexValue, chartTicks, type ChartKind, type Domain, type Series } from "./chart-model";
export type { ChartKind, Domain } from "./chart-model";
export { chartNames, fitDomain } from "./chart-model";
import styles from "./MarketCharts.module.css";

function activeMinute(event: unknown) {
  const minute = numeric(record(event).activeLabel);
  return minute === null ? null : Math.round(Math.max(OPEN_MINUTE, Math.min(CLOSE_MINUTE, minute)));
}
function displayValue(row: MarketRow | undefined, series: Series) {
  const value = chartSeriesValue(row, series);
  return formatNumber(value, series.digits ?? 0, series.signed) + (value === null ? "" : series.unit ?? "");
}
function ChartTooltip({ active, payload, label, series, row, percent, baseline }: {
  active?: boolean; payload?: readonly unknown[]; label?: unknown; series: Series[];
  row?: MarketRow; percent: boolean; baseline?: MarketRow;
}) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip"><strong className="num">{minuteLabel(Number(label))}</strong>
    {series.map(item => <div className="tooltip-row" key={item.key}>
      <span style={{ color: item.color }}>{item.name}</span>
      <strong className="num">{displayValue(row, item)}{percent && relativeIndexValue(row, item, baseline) !== null && <small> · {formatNumber(relativeIndexValue(row, item, baseline), 2, true)}%</small>}</strong>
    </div>)}
    {series.some(item => ["foreignFlow", "instFlow", "indivFlow"].includes(item.key)) && row && row.flowSource !== "LIVE" && <div className={styles.sourceNote}>{sourceLabel(row.flowSource)}</div>}
    {series.some(item => ["diff", "accel", "marketScore", "upRatio", "downRatio"].includes(item.key)) && row && row.breadthSource !== "LIVE" && <div className={styles.sourceNote}>{breadthLabel(row.breadthSource)}</div>}
  </div>;
}
type ChartProps = {
  rows: MarketRow[]; kind: ChartKind; domain: Domain; onDomainChange?: (domain: Domain) => void;
  selectedMinute?: number | null; events?: MarketEvent[]; showMarkers?: boolean; compact?: boolean; autoScale?: boolean; syncGroup?: string;
  hoverMinute?: number | null; onHoverMinute?: (minute: number | null) => void; onExpand?: () => void; onReset?: () => void; onLatest?: () => void;
  dataCaption?: string; refreshing?: boolean; hideMeta?: boolean;
};
function MarketChart({ rows, kind, domain, onDomainChange, selectedMinute, events = [], showMarkers = true, compact = false, autoScale = true, syncGroup = "balta-main", hoverMinute = null, onHoverMinute, onExpand, onReset, onLatest, dataCaption = "", refreshing = false, hideMeta = false }: ChartProps) {
  const id = useId().replace(/:/g, "");
  const plot = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [drag, setDrag] = useState<Domain | null>(null);
  const [dragMode, setDragMode] = useState<"zoom" | "pan">("zoom");
  const [localHover, setLocalHover] = useState<number | null>(null);
  const dragOrigin = useRef<Domain | null>(null);
  const dragBounds = useRef<{ left: number; width: number } | null>(null);
  const [plotWidth, setPlotWidth] = useState(500);
  const [indexMode, setIndexMode] = useState<"percent" | "raw">("percent");
  const allSeries = seriesMap[kind];
  const visible = useMemo(() => allSeries.filter(series => !hidden.includes(series.key)), [allSeries, hidden]);
  const percent = kind === "index" && indexMode === "percent";
  const dualAxis = kind === "index" && !percent;
  const baseline = useMemo(() => comparisonBaseline(rows), [rows]);
  const rowByMinute = useMemo(() => new Map(rows.map(row => [row.minute, row])), [rows]);
  const valueForPlot = useCallback((row: MarketRow | undefined, series: Series) => percent
    ? relativeIndexValue(row, series, baseline) : chartSeriesValue(row, series), [percent, baseline]);
  const axisFor = (series: Series) => percent ? "left" : series.axis ?? "left";
  const leftInset = 66, rightInset = dualAxis ? 84 : 32;
  const latest = rows.at(-1), fullDomain = domain[0] === OPEN_MINUTE && domain[1] === CLOSE_MINUTE;
  const width = domain[1] - domain[0];
  const allPoints = useMemo(() => {
    return Array.from({ length: CLOSE_MINUTE - OPEN_MINUTE + 1 }, (_, index) => {
      const minute = OPEN_MINUTE + index;
      const row = rowByMinute.get(minute);
      const point: Record<string, unknown> = { minute, time: minuteLabel(minute) };
      if (row) Object.assign(point, row);
      for (const series of allSeries) point[series.key] = valueForPlot(row, series);
      return point;
    });
  }, [rowByMinute, allSeries, valueForPlot]);
  const points = useMemo(() => allPoints.slice(domain[0] - OPEN_MINUTE, domain[1] - OPEN_MINUTE + 1), [allPoints, domain]);
  const inspectedMinute = onHoverMinute ? hoverMinute : localHover;
  const inspectedRow = inspectedMinute === null ? undefined : rowByMinute.get(inspectedMinute);
  const isInspecting = inspectedMinute !== null;
  const readoutRow = isInspecting ? inspectedRow : latest;
  const referenceMinute = inspectedMinute ?? selectedMinute;
  const setHover = (minute: number | null) => { setLocalHover(minute); onHoverMinute?.(minute); };
  const reset = () => { setHover(null); if (onReset) onReset(); else onDomainChange?.(observedDomain(rows)); };
  const zoom = (factor: number, anchor?: number) => onDomainChange?.(zoomDomain(domain, factor, anchor));
  const pan = (direction: number) => onDomainChange?.(panDomain(domain, direction * Math.max(1, Math.round(width / 4))));

  // Native, non-passive wheel listener allows chart zoom without hijacking ordinary page scroll.
  useEffect(() => {
    const element = plot.current;
    if (!element || !onDomainChange) return;
    const wheel = (event: WheelEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || !event.deltaY) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect(), left = leftInset, right = rightInset;
      const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left - left) / Math.max(1, rect.width - left - right)));
      onDomainChange(zoomDomain(domain, event.deltaY > 0 ? 1.25 : .8, domain[0] + fraction * (domain[1] - domain[0])));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [domain, leftInset, rightInset, onDomainChange]);

  const fixedDomain = useMemo(() => {
    if (kind === "score") return [-110, 110];
    if (kind === "ratio") return [-3, 103];
    if (["index", "kospi", "kosdaq"].includes(kind) || autoScale) return ["auto", "auto"];
    const max = Math.max(kind === "flow" ? 1200 : 1800, ...rows.filter(row => row.minute >= domain[0] && row.minute <= domain[1]).flatMap(row => visible.map(s => Math.abs(chartSeriesValue(row, s) ?? 0))));
    return [-Math.ceil(max * 1.05), Math.ceil(max * 1.05)];
  }, [kind, autoScale, rows, domain, visible]);
  const ticks = chartTicks(domain, Math.max(120, plotWidth - leftInset - rightInset));
  const markerPoints = useMemo(() => {
    if (!showMarkers || !visible.length || kind === "ratio") return [];
    const turningType = /^(PIVOT_|BREADTH_REVERSAL_|FLOW_REVERSAL_|INDEX_FLOW_DIVERGENCE_|INTRADAY_(HIGH|LOW)_TURN)/;
    const gap = Math.max(3, Math.ceil(width / (compact ? 9 : 16)));
    const selected: { event: MarketEvent; y: number; series: Series }[] = [];
    for (const event of [...events].sort((a, b) => (a.level === "강" ? 0 : 1) - (b.level === "강" ? 0 : 1) || a.minute - b.minute)) {
      if (event.minute < domain[0] || event.minute > domain[1]) continue;
      if (event.level !== "강" && !turningType.test(event.type)) continue;
      if (selected.some(point => Math.abs(point.event.minute - event.minute) < gap)) continue;
      const row = rowByMinute.get(event.minute);
      // Position every marker on an actually visible series, never on hidden flowPower.
      const series = visible.find(item => valueForPlot(row, item) !== null);
      if (!series) continue;
      const value = valueForPlot(row, series);
      if (value !== null) selected.push({ event, y: value, series });
    }
    return selected;
  }, [showMarkers, visible, kind, width, compact, events, domain, rowByMinute, valueForPlot]);
  const hasData = points.some(point => visible.some(series => point[series.key] !== null && point[series.key] !== undefined));
  const unit = percent ? "%" : kind === "flow" ? "억원" : kind === "ratio" ? "%" : kind === "score" ? "점" : kind === "breadth" ? "개" : kind === "accel" ? "개" : "pt";
  const axisTick = (value: number) => Number(value).toLocaleString("ko-KR", { maximumFractionDigits: percent ? 3 : ["index", "kospi", "kosdaq"].includes(kind) ? 2 : 0 });
  const currentVisible = latest && latest.minute >= domain[0] && latest.minute <= domain[1];
  return <div className={styles.chart + " terminal-chart" + (compact ? " is-compact" : "")} data-chart-kind={kind} data-inspecting={isInspecting || undefined}>
    <div className="chart-readout">
      <div className={"chart-readout-meta" + (hideMeta ? " " + styles.hiddenMeta : "")}><span className="num">{isInspecting ? "커서 " + minuteLabel(inspectedMinute) : "최신 " + (latest?.time ?? "—")}{isInspecting && !inspectedRow ? " · 기록 없음" : " 기준"}</span><span>{refreshing ? "갱신 중…" : dataCaption}</span></div>
      <div className="chart-values" aria-label={isInspecting ? "커서 시각 수치 및 차트 항목 표시" : "최신 수치 및 차트 항목 표시"}>
        {allSeries.map(s => <button key={s.key} className="series-card" aria-pressed={!hidden.includes(s.key)} aria-label={s.name + " " + displayValue(readoutRow, s) + ", 그래프 " + (hidden.includes(s.key) ? "표시" : "숨기기")} onClick={() => setHidden(old => old.includes(s.key) ? old.filter(x => x !== s.key) : [...old, s.key])}>
          <span className="series-name"><i style={{ background: s.color }}/>{s.name}<span className="series-visibility">{hidden.includes(s.key) ? "숨김" : ""}</span></span>
          <strong className="num" style={{ color: s.color }}>{displayValue(readoutRow, s)}</strong>{percent && <small className={styles.changeValue}>{formatNumber(relativeIndexValue(readoutRow, s, baseline), 2, true)}{relativeIndexValue(readoutRow, s, baseline) === null ? "" : "%"}</small>}
        </button>)}
      </div>
      {kind === "flow" && readoutRow && readoutRow.flowSource !== "LIVE" && <div className="chart-source-note"><Icon name="warning" size={13}/>{sourceLabel(readoutRow.flowSource)}</div>}
      {["breadth", "ratio", "score", "accel"].includes(kind) && readoutRow && readoutRow.breadthSource !== "LIVE" && <div className="chart-source-note"><Icon name="warning" size={13}/>{breadthLabel(readoutRow.breadthSource)}</div>}
    </div>
    {kind === "index" && <div className={styles.comparisonTools}>
      <div className="segmented" aria-label="지수 비교 기준"><button className={percent ? "active" : ""} aria-pressed={percent} onClick={() => setIndexMode("percent")}>변화율</button><button className={!percent ? "active" : ""} aria-pressed={!percent} onClick={() => setIndexMode("raw")}>지수</button></div>
      <span>{percent ? baseline ? baseline.time + " = 0% · 전일 대비 아님" : "공통 기준 시각 없음" : "왼쪽 KOSPI · 오른쪽 KOSDAQ"}</span>
    </div>}
    <div className="chart-controls">
      <div className="chart-control-group"><button className="button ghost icon small" aria-label="차트 확대" title="확대 (+)" disabled={!onDomainChange || width <= MIN_WINDOW} onClick={() => zoom(.5)}>+</button><button className="button ghost icon small" aria-label="차트 축소" title="축소 (−)" disabled={!onDomainChange || fullDomain} onClick={() => zoom(2)}>−</button><span className="chart-zoom num">{((CLOSE_MINUTE - OPEN_MINUTE) / width).toFixed(1)}×</span><button className="button ghost icon small" aria-label="이전 시간대로 이동" disabled={!onDomainChange || domain[0] <= OPEN_MINUTE} onClick={() => pan(-1)}><Icon name="left" size={14}/></button><button className="button ghost icon small" aria-label="다음 시간대로 이동" disabled={!onDomainChange || domain[1] >= CLOSE_MINUTE} onClick={() => pan(1)}><Icon name="right" size={14}/></button></div>
      <div className="chart-control-group">{!compact && <button className="button ghost small" aria-pressed={dragMode === "pan"} onClick={() => setDragMode(old => old === "zoom" ? "pan" : "zoom")} title="드래그 동작 전환">{dragMode === "zoom" ? "드래그: 확대" : "드래그: 이동"}</button>}<button className="button ghost small" onClick={reset} disabled={!onDomainChange}>초기화</button>{!compact && <button className="button ghost small" disabled={!latest || !onDomainChange} onClick={() => { if (onLatest) onLatest(); else if (latest) onDomainChange?.(fitDomain(latest.minute - 60, latest.minute)); }}>최근 1시간</button>}{onExpand && <button className="button ghost icon small" aria-label={chartNames[kind] + " 화면 확대"} onClick={onExpand}><Icon name="expand" size={15}/></button>}</div>
    </div>
    <div className="chart-inspection" id={id + "-help"}><span className="num">{minuteLabel(domain[0])}–{minuteLabel(domain[1])}</span><span>{compact ? "시간축·커서 연동" : "드래그 확대 · Ctrl/⌘ + 휠 · 더블클릭 초기화"}</span></div>
    <div ref={plot} className={"chart-frame chart-plot" + (compact ? " compact" : "") + (dragMode === "pan" ? " pan-mode" : "")} role="group" tabIndex={0} aria-label={chartNames[kind] + " 차트. 플러스·마이너스 키로 확대·축소, 좌우 방향키로 시간 이동, Home 키로 초기화."} aria-describedby={id + "-help"}
      onDoubleClick={reset} onKeyDown={event => { if (event.target !== event.currentTarget || !onDomainChange) return; if (["+", "=", "-", "ArrowLeft", "ArrowRight", "Home", "Escape"].includes(event.key)) event.preventDefault(); if (["+", "="].includes(event.key)) zoom(.5); else if (event.key === "-") zoom(2); else if (event.key === "ArrowLeft") pan(-1); else if (event.key === "ArrowRight") pan(1); else if (event.key === "Home") reset(); else if (event.key === "Escape") { setDrag(null); setHover(null); } }}>
      <span className={styles.axisUnit} aria-hidden="true">{unit}</span>
      {!hasData && <div className={styles.emptyPlot}>{visible.length ? "이 구간에 표시할 기록이 없습니다" : "지표 이름을 눌러 그래프를 표시하세요"}</div>}
      <ResponsiveContainer width="100%" height="100%" minWidth={0} onResize={value => setPlotWidth(value)}>
        <ComposedChart data={points} margin={{ top: 20, left: 4, right: 32, bottom: 4 }} syncId={syncGroup} syncMethod="value" accessibilityLayer
          onMouseDown={event => { const m = activeMinute(event); if (onDomainChange && m !== null) { setDrag([m, m]); dragOrigin.current = [...domain]; const rect = plot.current?.getBoundingClientRect(); if (rect) dragBounds.current = { left: rect.left + leftInset, width: Math.max(1, rect.width - leftInset - rightInset) }; } }}
          onMouseMove={(event, mouse) => { const m = activeMinute(event); setHover(m); if (!drag || m === null) return; if (dragMode === "pan" && dragOrigin.current && dragBounds.current) { const fraction = (mouse.clientX - dragBounds.current.left) / dragBounds.current.width; const originMinute = dragOrigin.current[0] + fraction * (dragOrigin.current[1] - dragOrigin.current[0]); onDomainChange?.(panDomain(dragOrigin.current, drag[0] - originMinute)); } else setDrag([drag[0], m]); }}
          onMouseUp={event => { const m = activeMinute(event); if (drag && dragMode === "zoom" && onDomainChange) { const end = m ?? drag[1]; if (Math.abs(end - drag[0]) >= 2) onDomainChange(fitDomain(drag[0], end)); } setDrag(null); }}
          onMouseLeave={() => { setDrag(null); setHover(null); }}
          onTouchStart={event => setHover(activeMinute(event))} onTouchMove={event => setHover(activeMinute(event))} onTouchEnd={() => setHover(null)}>
          <defs>{allSeries.map(s => <linearGradient key={s.key} id={id + s.key} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity={kind === "flow" || kind === "index" ? .025 : .12}/><stop offset="100%" stopColor={s.color} stopOpacity={.008}/></linearGradient>)}</defs>
          <CartesianGrid vertical={false} stroke="#30343b" strokeOpacity={.45} strokeDasharray="2 6"/>
          <XAxis dataKey="minute" type="number" domain={domain} ticks={ticks} tickFormatter={minuteLabel} tick={{ fill: "#999fa9", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#33373e" }} minTickGap={18} height={32} allowDataOverflow />
          <YAxis yAxisId="left" domain={fixedDomain} tick={{ fill: "#999fa9", fontSize: 12 }} tickFormatter={axisTick} ticks={kind === "score" ? [-100, -50, 0, 50, 100] : kind === "ratio" ? [0, 25, 50, 75, 100] : undefined} allowDecimals={percent || ["index", "kospi", "kosdaq"].includes(kind)} tickLine={false} axisLine={false} width={62} tickCount={5}/>
          {dualAxis && <YAxis yAxisId="right" orientation="right" domain={["auto", "auto"]} tick={{ fill: colors.violet, fontSize: 12 }} tickLine={false} axisLine={false} width={52}/>}
          <Tooltip content={props => hideMeta ? null : <ChartTooltip active={props.active} payload={props.payload} label={props.label} series={visible} row={rowByMinute.get(Number(props.label))} percent={percent} baseline={baseline}/>} cursor={false} isAnimationActive={false} wrapperStyle={{ pointerEvents: "none", zIndex: 10 }}/>
          {domain[0] < REGULAR_CLOSE_MINUTE && domain[1] > REGULAR_CLOSE_MINUTE && <ReferenceLine yAxisId="left" x={REGULAR_CLOSE_MINUTE} stroke="#6f7782" strokeOpacity={.45} strokeDasharray="4 5" label={{ value: "정규장 마감", fill: "#8f98a6", fontSize: 10, position: "insideTopRight" }}/>}
          {(percent || !["index", "kospi", "kosdaq"].includes(kind)) && <ReferenceLine yAxisId="left" y={kind === "ratio" ? 50 : 0} stroke="#717780" strokeOpacity={.6} strokeDasharray="4 5"/>}
          {kind === "score" && <><ReferenceLine yAxisId="left" y={70} stroke="#60353a" strokeDasharray="3 6"/><ReferenceLine yAxisId="left" y={-70} stroke="#304361" strokeDasharray="3 6"/></>}
          {visible.map(s => <Area key={s.key} yAxisId={axisFor(s)} dataKey={s.key} name={s.name} type="linear" stroke={s.color} strokeWidth={compact ? 1.8 : 2} fill={"url(#" + id + s.key + ")"} baseValue={!percent && ["index", "kospi", "kosdaq"].includes(kind) ? "dataMin" : 0} dot={false} activeDot={isInspecting ? { r: 4, stroke: "#0d0f12", strokeWidth: 2 } : false} connectNulls={false} isAnimationActive={false}/>)}
          {markerPoints.map(({ event, y, series }) => <ReferenceDot key={event.id} yAxisId={axisFor(series)} x={event.minute} y={y} r={3.5} fill={event.direction === "up" ? colors.red : event.direction === "down" ? colors.blue : colors.yellow} stroke="#0d0f12" strokeWidth={1.5}
            shape={props => <g><title>{event.time + " · " + event.label + " · " + event.message}</title><circle cx={props.cx} cy={props.cy} r={3.5} fill={props.fill} stroke="#0d0f12" strokeWidth={1.5}/></g>}/>)}
          {currentVisible && <ReferenceLine yAxisId="left" x={latest.minute} stroke="#aeb4bf" strokeOpacity={.3} strokeDasharray="2 5"/>}
          {currentVisible && visible.map(s => { const value = valueForPlot(latest, s); return value === null ? null : <ReferenceDot key={s.key} yAxisId={axisFor(s)} x={latest.minute} y={value} r={3} fill={s.color} stroke="#0d0f12" strokeWidth={1.5}/>; })}
          {referenceMinute != null && referenceMinute >= domain[0] && referenceMinute <= domain[1] && <ReferenceLine yAxisId="left" x={referenceMinute} stroke="#ccd0d6" strokeDasharray="3 4" label={{ value: minuteLabel(referenceMinute), position: "insideTopRight", fill: "#dbe2ec", fontSize: 10 }}/>}
          {drag && dragMode === "zoom" && <ReferenceArea yAxisId="left" x1={Math.min(...drag)} x2={Math.max(...drag)} fill="#9caec7" fillOpacity={.15} stroke="#99a8bd" strokeOpacity={.45}/>}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
    {!compact && onDomainChange && <div className="chart-navigator"><div className="navigator-caption"><span>전체 장 탐색</span><span className="num">{minuteLabel(domain[0])}–{minuteLabel(domain[1])} · {width}분</span></div><div className="navigator-frame"><ResponsiveContainer width="100%" height="100%" minWidth={0}><ComposedChart data={allPoints} margin={{ top: 0, left: 0, right: 0, bottom: 0 }}><Brush dataKey="minute" height={40} y={0} travellerWidth={9} startIndex={domain[0] - OPEN_MINUTE} endIndex={domain[1] - OPEN_MINUTE} stroke="#636b77" fill="#101215" tickFormatter={minuteLabel} ariaLabel="조회 시간 범위. 양끝 핸들로 확대하고 선택 영역을 끌어 이동하세요." onChange={value => { if (value.startIndex != null && value.endIndex != null) onDomainChange(fitDomain(OPEN_MINUTE + value.startIndex, OPEN_MINUTE + value.endIndex)); }}><AreaChart data={allPoints}><Area dataKey={allSeries[0].key} stroke={allSeries[0].color} fill={allSeries[0].color} fillOpacity={.06} strokeWidth={1} isAnimationActive={false} connectNulls={false}/></AreaChart></Brush></ComposedChart></ResponsiveContainer></div><div className="navigator-inputs"><label>시작 <input type="range" min={OPEN_MINUTE} max={domain[1] - MIN_WINDOW} value={domain[0]} aria-label="차트 시작 시각" aria-valuetext={minuteLabel(domain[0])} onChange={e => onDomainChange([Number(e.target.value), domain[1]])}/></label><label>끝 <input type="range" min={domain[0] + MIN_WINDOW} max={CLOSE_MINUTE} value={domain[1]} aria-label="차트 종료 시각" aria-valuetext={minuteLabel(domain[1])} onChange={e => onDomainChange([domain[0], Number(e.target.value)])}/></label></div></div>}
  </div>;
}
export default memo(MarketChart);
