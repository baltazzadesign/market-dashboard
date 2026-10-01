"use client";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber, investorRowsCsv, minuteLabel, type MarketRow } from "@/lib/balta-model";
import { investorCategories, investorMarketLabels, investorSourceLabel, type InvestorKey, type InvestorMarket } from "@/lib/investor-flow";
import { observedDomain, type Domain } from "./chart-model";
import { downloadCsv } from "./RecordsPanel";
import { Icon } from "./Icon";
import styles from "./InvestorFlowPanel.module.css";

export default function InvestorFlowPanel({ rows, date, domain, loading = false }: {
  rows: MarketRow[]; date: string; domain?: Domain; loading?: boolean;
}) {
  const [market, setMarket] = useState<InvestorMarket>("combined");
  const [selected, setSelected] = useState<InvestorKey[]>(["financialInvestment", "investmentTrust", "privateEquity", "pension"]);
  const [hover, setHover] = useState<number | null>(null);
  const bounds = domain ?? observedDomain(rows);
  const visibleRows = useMemo(() => rows.filter(r => r.minute >= bounds[0] && r.minute <= bounds[1]), [rows, bounds[0], bounds[1]]);
  const selectedRow = visibleRows.find(r => r.minute === hover) ?? visibleRows.at(-1);
  const snapshot = selectedRow?.investorFlows;
  const flow = snapshot?.[market];
  const hasAny = visibleRows.some(r => investorCategories.some(c => r.investorFlows?.[market].values[c.key] != null));
  const hasSelected = visibleRows.some(r => selected.some(key => r.investorFlows?.[market].values[key] != null));
  const data = useMemo(() => visibleRows.flatMap((row, i) => {
    const point = { minute: row.minute, ...row.investorFlows?.[market].values };
    // Omitted minutes must break the line too, not imply uninterrupted collection.
    return i && row.minute > visibleRows[i - 1].minute + 1 ? [{ minute: visibleRows[i - 1].minute + 1 }, point] : [point];
  }), [visibleRows, market]);
  useEffect(() => setHover(null), [date, market, bounds[0], bounds[1]]);
  const toggle = (key: InvestorKey) => setSelected(current => current.includes(key) ? current.filter(v => v !== key) : [...current, key]);
  return <section className={styles.panel} aria-label="투자자 세부 수급" data-investor-panel>
    <div className={styles.header}>
      <div><h2>투자자 세부 수급 <small>누적 순매수 · 억원</small></h2><p>{date} · {minuteLabel(bounds[0])}–{minuteLabel(bounds[1])}</p></div>
      <div className={styles.actions}>
        <div className={styles.segments} aria-label="세부 수급 시장">{(["combined", "kospi", "kosdaq"] as const).map(key => <button key={key} type="button" aria-pressed={market === key} onClick={() => setMarket(key)}>{investorMarketLabels[key]}</button>)}</div>
        <button type="button" className={styles.csv} disabled={!rows.length} onClick={() => downloadCsv("baltatool-" + date + "-investors.csv", investorRowsCsv(rows))} title="전체 시간·합산·KOSPI·KOSDAQ 및 원본 금액"><Icon name="download" size={14}/>세부 CSV</button>
      </div>
    </div>
    <div className={styles.status}>
      <span><strong>{hover !== null && selectedRow?.minute === hover ? "커서" : "최근 기록"} {selectedRow?.time ?? "—"}</strong> · {investorSourceLabel(flow?.source)}</span>
      <div><button type="button" onClick={() => setSelected(investorCategories.map(c => c.key))}>모두 표시</button><button type="button" onClick={() => setSelected([])}>모두 숨김</button></div>
    </div>
    <div className={styles.values}>{investorCategories.map(c => <button key={c.key} type="button" aria-label={c.label + " 차트 표시"} aria-pressed={selected.includes(c.key)} onClick={() => toggle(c.key)}>
      <span><i style={{ background: c.color }}/>{c.label}</span><strong style={{ color: c.color }}>{formatNumber(flow?.values[c.key], 0, true)}</strong>
    </button>)}</div>
    {loading ? <div className={styles.empty}>세부 수급 기록을 불러오는 중입니다.</div> : !hasAny ? <div className={styles.empty}><strong>표시할 세부 수급 기록이 없습니다.</strong><p>업데이트 후 수집된 기록부터 표시됩니다. 미수집·오류 값은 ‘—’로 표시합니다.</p></div> : !selected.length ? <div className={styles.empty}>위 항목 이름을 눌러 차트를 표시하세요.</div> : !hasSelected ? <div className={styles.empty}>선택한 항목은 이 구간에 수집된 값이 없습니다.</div> :
      <div className={styles.plot} onMouseLeave={() => setHover(null)}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={data} margin={{ top: 16, right: 14, bottom: 8, left: 0 }} onMouseMove={state => {
            const minute = Number(state.activeLabel);
            setHover(state.activeLabel != null && Number.isFinite(minute) ? minute : null);
          }} onMouseLeave={() => setHover(null)}>
            <CartesianGrid stroke="#333a33" strokeOpacity={.5} strokeDasharray="2 6" vertical={false}/>
            <XAxis dataKey="minute" type="number" domain={bounds} allowDataOverflow tickFormatter={minuteLabel} minTickGap={38} tick={{ fill: "#969c8f", fontSize: 11 }} axisLine={false} tickLine={false}/>
            <YAxis width={66} domain={["auto", "auto"]} tickFormatter={value => formatNumber(value)} tick={{ fill: "#969c8f", fontSize: 11 }} axisLine={false} tickLine={false}/>
            <ReferenceLine y={0} stroke="#b8a779" strokeWidth={1.5} strokeOpacity={.8} ifOverflow="extendDomain"/>
            <Tooltip content={() => null} cursor={{ stroke: "#d6ba77", strokeDasharray: "4 4" }}/>
            {investorCategories.filter(c => selected.includes(c.key)).map(c => <Line key={c.key} type="linear" dataKey={c.key} name={c.label} stroke={c.color} strokeWidth={2} dot={{ r: 1.3, fill: c.color, strokeWidth: 0 }} activeDot={{ r: 4, fill: c.color }} connectNulls={false} isAnimationActive={false}/>)}
          </LineChart>
        </ResponsiveContainer>
      </div>}
    <div className={styles.footer}><span>{market === "combined" ? "KOSPI + KOSDAQ · 두 시장의 값이 모두 있을 때만 항목별 합산" : investorMarketLabels[market] + " 시장 수집값"}</span><span>+ 순매수 / − 순매도 · 항목을 눌러 표시 전환</span></div>
    <details className={styles.note}><summary>분류·수집 기준</summary><p>괄호는 API 원문 명칭입니다. 연기금은 API의 ‘기금’ 값이며, 기타 단체를 임의로 합치지 않습니다. 기타법인은 별도 항목입니다. 기관 총액은 API의 기관계 값을 유지하므로 위 항목의 합계로 다시 계산하지 않습니다.</p><p>시간은 앱의 수집 시각이며 체결 시각이 아닙니다. 장후에도 API가 제공한 누적값을 기록하며, 장후 거래만의 수급으로 해석하지 않습니다. 미수집 구간은 선을 연결하지 않습니다. 기타 단체와 변환 전 원본 금액은 세부 CSV에 별도로 포함됩니다.</p></details>
  </section>;
}
