"use client";
import { memo, useId, useMemo, useState } from "react";
import { Area, ComposedChart, Line, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceDot, ReferenceArea } from "recharts";
import { type MarketRow, type MarketEvent, OPEN_MINUTE, CLOSE_MINUTE, minuteLabel, formatNumber, record, numeric, sourceLabel } from "@/lib/balta-model";
export type ChartKind = "breadth" | "score" | "flow" | "index" | "ratio" | "accel";
export type Domain = [number, number];
type Series = { key: keyof MarketRow; name: string; color: string; unit?: string; axis?: string };
const colors = { mint: "#7de2d1", red: "#ff7c8a", blue: "#79aaff", violet: "#b4a0f4", gold: "#f1c278" };
export const chartNames: Record<ChartKind, string> = { breadth: "시장 폭", score: "시장점수", flow: "투자자 수급", index: "시장 지수", ratio: "상승·하락 비율", accel: "가속도" };
const seriesMap: Record<ChartKind, Series[]> = {
  breadth: [{ key: "diff", name: "상승 − 하락 종목", color: colors.mint, unit: "개" }],
  score: [{ key: "marketScore", name: "시장점수", color: colors.mint, unit: "점" }],
  flow: [{ key: "foreignFlow", name: "외국인", color: colors.violet, unit: "억" }, { key: "instFlow", name: "기관", color: colors.gold, unit: "억" }, { key: "indivFlow", name: "개인", color: colors.blue, unit: "억" }],
  index: [{ key: "kospi", name: "KOSPI", color: colors.mint, axis: "left" }, { key: "kosdaq", name: "KOSDAQ", color: colors.violet, axis: "right" }],
  ratio: [{ key: "upRatio", name: "상승", color: colors.red, unit: "%" }, { key: "downRatio", name: "하락", color: colors.blue, unit: "%" }],
  accel: [{ key: "accel", name: "가속도", color: colors.gold }],
};
export function fitDomain(start: number, end: number): Domain {
  const width = Math.max(30, Math.min(CLOSE_MINUTE - OPEN_MINUTE, end - start));
  const left = Math.max(OPEN_MINUTE, Math.min(CLOSE_MINUTE - width, start));
  return [Math.round(left), Math.round(left + width)];
}
function activeMinute(event: unknown) {
  const e = record(event), minute = numeric(e.activeLabel);
  return minute === null ? null : Math.max(OPEN_MINUTE, Math.min(CLOSE_MINUTE, minute));
}
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: readonly unknown[]; label?: unknown }) {
  if (!active || !payload?.length) return null;
  const row = record(record(payload[0]).payload);
  return <div className="chart-tooltip"><strong className="num">{minuteLabel(Number(label))}</strong>
    {payload.map((value, index) => { const item = record(value); return <div className="tooltip-row" key={index}><span style={{ color: String(item.color) }}>{String(item.name)}</span><strong className="num">{formatNumber(numeric(item.value), ["kospi", "kosdaq", "upRatio", "downRatio"].includes(String(item.dataKey)) ? 2 : 0)}</strong></div>; })}
    {row.flowSource && row.flowSource !== "LIVE" ? <div className="panel-subtitle" style={{ marginTop: 6 }}>{sourceLabel(String(row.flowSource))}</div> : null}
  </div>;
}
type ChartProps = {
  rows: MarketRow[]; kind: ChartKind; domain: Domain; onDomainChange?: (domain: Domain) => void;
  selectedMinute?: number | null; events?: MarketEvent[]; showMarkers?: boolean; compact?: boolean; autoScale?: boolean; syncGroup?: string;
};
function MarketChart({ rows, kind, domain, onDomainChange, selectedMinute, events = [], showMarkers = true, compact = false, autoScale = true, syncGroup = "balta-main" }: ChartProps) {
  const id = useId().replace(/:/g, "");
  const [hidden, setHidden] = useState<string[]>([]);
  const [drag, setDrag] = useState<Domain | null>(null);
  const allSeries = seriesMap[kind], visible = allSeries.filter(s => !hidden.includes(s.key));
  const points = useMemo(() => {
    const byMinute = new Map(rows.map(r => [r.minute, r]));
    return Array.from({ length: domain[1] - domain[0] + 1 }, (_, i) => {
      const minute = domain[0] + i, row = byMinute.get(minute);
      if (!row) return { minute };
      return { ...row, upRatio: row.upRatio * 100, downRatio: row.downRatio * 100 };
    });
  }, [rows, domain]);
  const fixedDomain = useMemo(() => {
    if (kind === "score") return [-100, 100];
    if (kind === "ratio") return [0, 100];
    if (kind === "index" || autoScale) return ["auto", "auto"];
    const max = Math.max(kind === "flow" ? 1200 : 1800, ...rows.flatMap(row => allSeries.map(s => Math.abs(numeric(row[s.key]) ?? 0))));
    return [-Math.ceil(max * 1.05), Math.ceil(max * 1.05)];
  }, [kind, autoScale, rows, allSeries]);
  const step = domain[1] - domain[0] <= 60 ? 15 : 60;
  const ticks: number[] = [];
  for (let m = Math.ceil(domain[0] / step) * step; m <= domain[1]; m += step) ticks.push(m);
  if (domain[1] === CLOSE_MINUTE && !ticks.includes(CLOSE_MINUTE)) ticks.push(CLOSE_MINUTE);
  const markerEvents = showMarkers && ["breadth", "score"].includes(kind) ? events.filter(e => e.minute >= domain[0] && e.minute <= domain[1]).filter((e, i, all) => all.findIndex(x => x.minute === e.minute) === i) : [];
  const single = visible.length === 1;
  return <>
    <div className="chart-toolbar"><div className="chart-legend" aria-label="차트 항목 표시">
      {allSeries.map(s => <button key={s.key} className="legend-button" aria-pressed={!hidden.includes(s.key)} onClick={() => setHidden(old => old.includes(s.key) ? old.filter(x => x !== s.key) : [...old, s.key])}><span className="legend-line" style={{ color: s.color }}/>{s.name}</button>)}
    </div><span className="panel-subtitle">{kind === "flow" ? "단위: 억원" : kind === "index" ? "좌: KOSPI · 우: KOSDAQ" : kind === "ratio" ? "단위: %" : kind === "breadth" ? "단위: 종목 수" : ""}</span></div>
    <div className={"chart-frame" + (compact ? " compact" : "")} role="img" aria-label={chartNames[kind] + " " + minuteLabel(domain[0]) + "부터 " + minuteLabel(domain[1]) + "까지의 추이. 상세 수치는 하단 기록 표에서 확인할 수 있습니다."}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={points} margin={{ top: 12, left: 3, right: 12, bottom: 4 }} syncId={syncGroup} syncMethod="value"
          onMouseDown={event => { const m = activeMinute(event); if (onDomainChange && m !== null) setDrag([m, m]); }}
          onMouseMove={event => { const m = activeMinute(event); if (drag && m !== null) setDrag([drag[0], m]); }}
          onMouseUp={event => { const m = activeMinute(event); if (drag && onDomainChange) { const end = m ?? drag[1]; if (Math.abs(end - drag[0]) >= 10) onDomainChange(fitDomain(Math.min(drag[0], end), Math.max(drag[0], end))); } setDrag(null); }}
          onMouseLeave={() => setDrag(null)}>
          <defs>{allSeries.map(s => <linearGradient key={s.key} id={id + s.key} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity={.30}/><stop offset="100%" stopColor={s.color} stopOpacity={.015}/></linearGradient>)}</defs>
          <CartesianGrid vertical={false} stroke="#2a3850" strokeOpacity={.65} strokeDasharray="2 6"/>
          <XAxis dataKey="minute" type="number" domain={domain} ticks={ticks} tickFormatter={minuteLabel} tick={{ fill: "#a0aec6", fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={18} height={32} allowDataOverflow />
          <YAxis yAxisId="left" domain={fixedDomain} tick={{ fill: "#a0aec6", fontSize: 12 }} tickFormatter={v => Math.abs(Number(v)) >= 10000 ? (Number(v)/1000).toFixed(0) + "k" : Number(v).toLocaleString("ko-KR", { maximumFractionDigits: 0 })} tickLine={false} axisLine={false} width={58} tickCount={5}/>
          {kind === "index" && <YAxis yAxisId="right" orientation="right" domain={["auto", "auto"]} tick={{ fill: colors.violet, fontSize: 12 }} tickLine={false} axisLine={false} width={50}/>}
          <Tooltip content={<ChartTooltip/>} cursor={{ stroke: "#687990", strokeDasharray: "4 4" }} isAnimationActive={false}/>
          {kind !== "index" && <ReferenceLine yAxisId="left" y={kind === "ratio" ? 50 : 0} stroke="#56637a" strokeDasharray="4 4"/>}
          {kind === "score" && <><ReferenceLine yAxisId="left" y={70} stroke="#6b404c" strokeDasharray="3 6"/><ReferenceLine yAxisId="left" y={-70} stroke="#354e74" strokeDasharray="3 6"/></>}
          {visible.map(s => single && kind !== "index" ? <Area key={s.key} yAxisId={s.axis ?? "left"} dataKey={s.key} name={s.name} type="linear" stroke={s.color} strokeWidth={2.4} fill={"url(#" + id + s.key + ")"} dot={false} activeDot={{ r: 4, stroke: "#11151e", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false}/>
            : <Line key={s.key} yAxisId={s.axis ?? "left"} dataKey={s.key} name={s.name} type="linear" stroke={s.color} strokeWidth={2.4} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#11151e" }} connectNulls={false} isAnimationActive={false}/>)}
          {markerEvents.map(e => <ReferenceDot key={e.id} yAxisId="left" x={e.minute} y={kind === "score" ? e.marketScore : e.diff} r={3.5} fill={e.direction === "up" ? colors.red : e.direction === "down" ? colors.blue : colors.gold} stroke="#11151e" strokeWidth={1.8}/>)}
          {selectedMinute != null && selectedMinute >= domain[0] && selectedMinute <= domain[1] && <ReferenceLine yAxisId="left" x={selectedMinute} stroke={colors.gold} strokeDasharray="4 4" label={{ value: minuteLabel(selectedMinute), fill: colors.gold, fontSize: 12, position: "insideTopRight" }}/>}
          {drag && <ReferenceArea yAxisId="left" x1={Math.min(...drag)} x2={Math.max(...drag)} fill={colors.mint} fillOpacity={.12}/>}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  </>;
}
export default memo(MarketChart);
export function Sparkline({ values, color = colors.mint }: { values: (number | null)[]; color?: string }) {
  const data = values.filter((v): v is number => v !== null);
  if (data.length < 2) return null;
  const min = Math.min(...data), range = Math.max(...data) - min || 1;
  const points = data.map((v, i) => (i/(data.length-1)*80).toFixed(1) + "," + (27-(v-min)/range*24).toFixed(1)).join(" ");
  return <svg className="metric-spark" viewBox="0 0 80 30" fill="none" aria-hidden="true"><polyline points={points} stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
