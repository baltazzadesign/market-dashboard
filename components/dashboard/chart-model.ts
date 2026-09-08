import { CLOSE_MINUTE, OPEN_MINUTE, numeric, type MarketRow } from "@/lib/balta-model";

export type ChartKind = "breadth" | "score" | "flow" | "index" | "kospi" | "kosdaq" | "ratio" | "accel";
export type Domain = [number, number];
export type Series = { key: keyof MarketRow; name: string; color: string; unit?: string; axis?: string; digits?: number; signed?: boolean };
export const MIN_WINDOW = 5;
export const chartColors = { blue: "#5294ff", red: "#ff545f", yellow: "#f2ce53", green: "#40c990", violet: "#aa92ed", mint: "#74c9b8" };
export const chartNames: Record<ChartKind, string> = {
  breadth: "시장 폭", ratio: "상승·하락 비율", flow: "투자자 수급", kospi: "KOSPI", kosdaq: "KOSDAQ", score: "시장점수", index: "시장 지수 비교", accel: "가속도",
};
export const seriesMap: Record<ChartKind, Series[]> = {
  breadth: [{ key: "diff", name: "상승 − 하락", color: chartColors.yellow, unit: "개", signed: true }],
  ratio: [{ key: "upRatio", name: "상승", color: chartColors.red, unit: "%", digits: 1 }, { key: "downRatio", name: "하락", color: chartColors.blue, unit: "%", digits: 1 }],
  flow: [{ key: "foreignFlow", name: "외인", color: chartColors.blue, unit: "억", signed: true }, { key: "instFlow", name: "기관", color: chartColors.red, unit: "억", signed: true }, { key: "indivFlow", name: "개인", color: chartColors.yellow, unit: "억", signed: true }],
  kospi: [{ key: "kospi", name: "KOSPI", color: chartColors.green, digits: 2 }],
  kosdaq: [{ key: "kosdaq", name: "KOSDAQ", color: chartColors.violet, digits: 2 }],
  index: [{ key: "kospi", name: "KOSPI", color: chartColors.green, digits: 2, axis: "left" }, { key: "kosdaq", name: "KOSDAQ", color: chartColors.violet, digits: 2, axis: "right" }],
  score: [{ key: "marketScore", name: "시장점수", color: chartColors.mint, unit: "점", signed: true }],
  accel: [{ key: "accel", name: "가속도", color: chartColors.yellow, signed: true }],
};

export function fitDomain(start: number, end: number): Domain {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [OPEN_MINUTE, CLOSE_MINUTE];
  const width = Math.round(Math.max(MIN_WINDOW, Math.min(CLOSE_MINUTE - OPEN_MINUTE, Math.abs(end - start))));
  const left = Math.round(Math.max(OPEN_MINUTE, Math.min(CLOSE_MINUTE - width, Math.min(start, end))));
  return [left, left + width];
}
export function zoomDomain(domain: Domain, factor: number, anchor = (domain[0] + domain[1]) / 2): Domain {
  const width = Math.max(MIN_WINDOW, Math.min(CLOSE_MINUTE - OPEN_MINUTE, Math.round((domain[1] - domain[0]) * factor)));
  const point = Math.max(domain[0], Math.min(domain[1], anchor));
  const fraction = (point - domain[0]) / (domain[1] - domain[0]);
  return fitDomain(point - width * fraction, point + width * (1 - fraction));
}
export function panDomain(domain: Domain, minutes: number): Domain {
  return fitDomain(domain[0] + minutes, domain[1] + minutes);
}
export function seriesValue(row: MarketRow | undefined, series: Series): number | null {
  const value = numeric(row?.[series.key]);
  return value !== null && (series.key === "upRatio" || series.key === "downRatio") ? value * 100 : value;
}
export function chartPoints(rows: MarketRow[]) {
  const byMinute = new Map(rows.map(row => [row.minute, row]));
  return Array.from({ length: CLOSE_MINUTE - OPEN_MINUTE + 1 }, (_, i) => {
    const minute = OPEN_MINUTE + i, row = byMinute.get(minute);
    return row ? { ...row, upRatio: row.upRatio * 100, downRatio: row.downRatio * 100 } : { minute };
  });
}
