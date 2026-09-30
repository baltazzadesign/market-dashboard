// KIS TR074 FHPTJ04030000: use documented net BUY MONEY fields only.
// API names in parentheses are intentional; do not infer broader classifications.
export const investorCategories = [
  { key: "financialInvestment", field: "scrt_ntby_tr_pbmn", label: "금융투자(증권)", color: "#72b6ff" },
  { key: "investmentTrust", field: "ivtr_ntby_tr_pbmn", label: "투신", color: "#f1bc60" },
  { key: "privateEquity", field: "pe_fund_ntby_tr_pbmn", label: "사모", color: "#c8a3ff" },
  { key: "bank", field: "bank_ntby_tr_pbmn", label: "은행", color: "#6ad4c3" },
  { key: "insurance", field: "insu_ntby_tr_pbmn", label: "보험", color: "#ffa277" },
  { key: "otherFinance", field: "mrbn_ntby_tr_pbmn", label: "기타금융(종금)", color: "#aed778" },
  { key: "pension", field: "fund_ntby_tr_pbmn", label: "연기금(기금)", color: "#ff829e" },
  { key: "otherCorporation", field: "etc_corp_ntby_tr_pbmn", label: "기타법인", color: "#d0d7e1" },
] as const;
export const allInvestorCategories = [...investorCategories,
  { key: "otherOrganization", field: "etc_orgt_ntby_tr_pbmn", label: "기타 단체", color: "#919eab" },
] as const;
export type InvestorKey = typeof allInvestorCategories[number]["key"];
export type InvestorValues = Record<InvestorKey, number | null>;
export type InvestorMarket = "combined" | "kospi" | "kosdaq";
export type InvestorSource = "LIVE" | "PARTIAL" | "EMPTY" | "ERROR";
export type InvestorBreakdown = { values: InvestorValues; raw: InvestorValues };
export type InvestorMarketFlow = InvestorBreakdown & { source: InvestorSource };
export type InvestorFlowSnapshot = {
  version: 1; unit: "KRW_100M"; divisor: 100; capturedAt: string;
  kospi: InvestorMarketFlow; kosdaq: InvestorMarketFlow; combined: InvestorMarketFlow;
};
type FlowInput = { source: string; breakdown?: InvestorBreakdown } | undefined;
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
function money(v: unknown): number | null {
  if (typeof v !== "number" && typeof v !== "string") return null;
  const text = typeof v === "string" ? v.replace(/,/g, "").trim() : v;
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
function valuesFrom(fn: (key: InvestorKey, field: string) => number | null): InvestorValues {
  return Object.fromEntries(allInvestorCategories.map(c => [c.key, fn(c.key, c.field)])) as InvestorValues;
}
// Preserve the existing TR074 /100 -> integer-억원 display conversion.
// The supplied spec does not state the original amount unit; retain raw values
// to check against HTS [0403]. Never apply this conversion twice.
export function parseInvestorBreakdown(row: unknown): InvestorBreakdown {
  const data = object(row);
  const raw = valuesFrom((_key, field) => money(data[field]));
  return { raw, values: valuesFrom(key => raw[key] === null ? null : Math.round(raw[key]! / 100)) };
}
function availability(values: InvestorValues): InvestorSource {
  const count = investorCategories.filter(c => values[c.key] !== null).length;
  return count === investorCategories.length ? "LIVE" : count ? "PARTIAL" : "EMPTY";
}
function marketFlow(input: FlowInput): InvestorMarketFlow {
  if (!input || !["LIVE", "PARTIAL"].includes(input.source) || !input.breakdown) {
    return { raw: valuesFrom(() => null), values: valuesFrom(() => null), source: input?.source === "ERROR" ? "ERROR" : "EMPTY" };
  }
  const raw = valuesFrom(key => money(input.breakdown?.raw[key]));
  const values = valuesFrom(key => raw[key] === null ? null : Math.round(raw[key]! / 100));
  return { raw, values, source: availability(values) };
}
export function buildInvestorFlows(markets: { kospi?: FlowInput; kosdaq?: FlowInput } | undefined, capturedAt: string): InvestorFlowSnapshot {
  const kospi = marketFlow(markets?.kospi), kosdaq = marketFlow(markets?.kosdaq);
  const sum = (a: number | null, b: number | null) => a === null || b === null || !Number.isFinite(a + b) ? null : a + b;
  // Match existing aggregate-flow rounding: round each market, then add.
  const values = valuesFrom(key => sum(kospi.values[key], kosdaq.values[key]));
  const raw = valuesFrom(key => sum(kospi.raw[key], kosdaq.raw[key]));
  const source = kospi.source === "ERROR" || kosdaq.source === "ERROR" ? "ERROR" : availability(values);
  return { version: 1, unit: "KRW_100M", divisor: 100, capturedAt, kospi, kosdaq, combined: { values, raw, source } };
}
export function normalizeInvestorFlows(input: unknown): InvestorFlowSnapshot | null {
  const data = object(input);
  if (data.version !== 1 || data.unit !== "KRW_100M" || data.divisor !== 100 || typeof data.capturedAt !== "string" || !Number.isFinite(Date.parse(data.capturedAt))) return null;
  const parse = (v: unknown): FlowInput => {
    const row = object(v), raw = object(row.raw);
    return { source: String(row.source), breakdown: { raw: valuesFrom(key => money(raw[key])), values: valuesFrom(() => null) } };
  };
  return buildInvestorFlows({ kospi: parse(data.kospi), kosdaq: parse(data.kosdaq) }, data.capturedAt);
}
export const investorMarketLabels: Record<InvestorMarket, string> = { combined: "합산", kospi: "KOSPI", kosdaq: "KOSDAQ" };
export function investorSourceLabel(source?: string) {
  return ({ LIVE: "정상 수집", PARTIAL: "일부 항목 누락", EMPTY: "미수집", ERROR: "수집 오류" } as Record<string, string>)[source ?? ""] ?? "미수집";
}
