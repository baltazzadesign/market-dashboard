export const OPEN_MINUTE = 9 * 60;
export const CLOSE_MINUTE = 15 * 60 + 30;
export type RawRecord = Record<string, unknown>;
export type SignalLevel = "강" | "중" | "약";
export type MarketRow = {
  id: number; date: string; time: string; minute: number;
  up: number; down: number; flat: number; diff: number; accel: number;
  upRatio: number; downRatio: number; kospi: number | null; kosdaq: number | null;
  foreignFlow: number | null; instFlow: number | null; indivFlow: number | null;
  flowPower: number | null; flowTrend: number | null; flowMomentum: number | null;
  flowSource: string; breadthSource: string; marketState: string; marketTone: string;
  marketScore: number; signals: RawRecord[]; alert: string; createdAt: string;
};
export type MarketEvent = {
  id: string; date: string; time: string; minute: number; type: string;
  label: string; message: string; direction: "up" | "down" | "neutral";
  level: SignalLevel; source: "수집 신호" | "차트 분석" | "시장 알림";
  score?: number; conditionRate?: number; diff: number; marketScore: number;
};

export function record(value: unknown): RawRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RawRecord : {};
}
export function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const cleaned = typeof value === "string" ? value.replace(/,/g, "").trim() : value;
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
export function kstParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (key: string) => parts.find(p => p.type === key)?.value ?? "";
  return { date: [get("year"), get("month"), get("day")].join("-"),
    time: get("hour") + ":" + get("minute"), clock: get("hour") + ":" + get("minute") + ":" + get("second"),
    minute: Number(get("hour")) * 60 + Number(get("minute")),
    weekend: [0, 6].includes(new Date([get("year"), get("month"), get("day")].join("-") + "T12:00:00+09:00").getUTCDay()) };
}
export function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z"))
    && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
}
export function moveDate(value: string, days: number) {
  const date = new Date(value + "T12:00:00Z"); date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function formatTime(value: unknown) {
  const text = String(value ?? "");
  const match = text.match(/(\d{1,2})\s*(?::|시)\s*(\d{1,2})/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return "";
  return match[1].padStart(2, "0") + ":" + match[2].padStart(2, "0");
}
export function timeToMinute(value: unknown) {
  const time = formatTime(value);
  if (!time) return -1;
  const [h, m] = time.split(":").map(Number); return h * 60 + m;
}
export function minuteLabel(value: number) {
  return String(Math.floor(value / 60)).padStart(2, "0") + ":" + String(Math.floor(value % 60)).padStart(2, "0");
}
export function calcScore(diff: number, upRatio: number, downRatio: number) {
  return Math.round(Math.max(-60, Math.min(60, diff / 20)) + Math.max(-40, Math.min(40, (upRatio - downRatio) * 100)));
}
export function normalizeRow(value: unknown, date: string): MarketRow {
  const r = record(value), n = (key: string) => numeric(r[key]);
  const time = formatTime(r.time);
  const up = n("up") ?? 0, down = n("down") ?? 0, flat = n("flat") ?? 0;
  const total = up + down + flat;
  const diff = n("diff") ?? up - down;
  const ratio = (value: unknown, fallback: number) => Math.max(0, Math.min(1, numeric(value) ?? fallback));
  const upRatio = ratio(r.upRatio ?? r.upratio, total ? up / total : 0);
  const downRatio = ratio(r.downRatio ?? r.downratio, total ? down / total : 0);
  const state = String(r.marketState ?? r.marketstate ?? "");
  const flowSource = String(r.flowSource ?? r.flowsource ?? r.flowStatus ?? state.match(/FLOW_(LIVE|FALLBACK|EMPTY|ERROR|FILTERED)/i)?.[1] ?? "UNKNOWN").toUpperCase();
  const breadthSource = String(r.breadthSource ?? state.match(/BREADTH_(LIVE|FALLBACK|EMPTY|ERROR|FILTERED|SKIPPED)/i)?.[1] ?? "UNKNOWN").toUpperCase();
  const unavailable = ["EMPTY", "ERROR", "FILTERED"].includes(flowSource);
  const flow = (v: unknown) => unavailable ? null : numeric(v);
  const foreignFlow = flow(r.foreignFlow ?? r.foreignflow ?? r.foreign);
  const instFlow = flow(r.instFlow ?? r.instflow ?? r.inst);
  const indivFlow = flow(r.indivFlow ?? r.indivflow ?? r.indiv);
  const flowPower = flow(r.flowPower ?? r.flowpower) ?? (foreignFlow !== null && instFlow !== null ? foreignFlow + instFlow : null);
  return {
    id: n("id") ?? 0, date, time, minute: timeToMinute(time), up, down, flat, diff, accel: n("accel") ?? 0,
    upRatio, downRatio, kospi: (n("kospi") ?? 0) > 0 ? n("kospi") : null, kosdaq: (n("kosdaq") ?? 0) > 0 ? n("kosdaq") : null,
    foreignFlow, instFlow, indivFlow, flowPower, flowTrend: flow(r.flowTrend ?? r.flowtrend), flowMomentum: flow(r.flowMomentum ?? r.flowmomentum),
    flowSource, breadthSource, marketState: state, marketTone: String(r.marketTone ?? r.markettone ?? ""),
    marketScore: Math.max(-100, Math.min(100, numeric(r.marketScore ?? r.marketscore) ?? calcScore(diff, upRatio, downRatio))),
    signals: Array.isArray(r.signals) ? r.signals.map(record) : [], alert: String(r.alert ?? ""),
    createdAt: String(r.createdAt ?? r.created_at ?? r.createdat ?? ""),
  };
}
export function normalizeRows(values: unknown[], date: string) {
  const rows = new Map<number, MarketRow>();
  for (const value of values) {
    const row = normalizeRow(value, date);
    if (row.minute < OPEN_MINUTE || row.minute > CLOSE_MINUTE || row.up + row.down + row.flat <= 0) continue;
    const prior = rows.get(row.minute);
    if (!prior || row.id >= prior.id) rows.set(row.minute, row);
  }
  return Array.from(rows.values()).sort((a, b) => a.minute - b.minute);
}
export function formatNumber(value: number | null | undefined, digits = 0, signed = false) {
  if (value == null || !Number.isFinite(value)) return "—";
  return (signed && value > 0 ? "+" : "") + value.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function valueClass(value: number | null | undefined) { return value && value > 0 ? "positive" : value && value < 0 ? "negative" : ""; }
export function verifiedFlow(row?: MarketRow) {
  return Boolean(row && row.flowSource === "LIVE" && row.foreignFlow !== null && row.instFlow !== null);
}
export function sourceLabel(source?: string) {
  return ({ LIVE: "정상 수급", FALLBACK: "직전 수급 유지", EMPTY: "수급 대기", ERROR: "수급 오류", FILTERED: "수급 제외", UNKNOWN: "출처 미확인" } as Record<string, string>)[source ?? ""] ?? "출처 미확인";
}
export function breadthLabel(source?: string) {
  return ({ LIVE: "정상 종목수", FALLBACK: "직전 종목수 유지", EMPTY: "종목수 대기", ERROR: "종목수 오류", FILTERED: "종목수 제외", SKIPPED: "종목수 제외", UNKNOWN: "종목수 출처 미확인" } as Record<string, string>)[source ?? ""] ?? "종목수 출처 미확인";
}
export function marketTone(row?: MarketRow) {
  if (!row) return "시장 데이터 대기";
  if (row.diff >= 800) return "강한 상승 확산";
  if (row.diff >= 300) return "상승 종목 우세";
  if (row.diff <= -800) return "강한 하락 확산";
  if (row.diff <= -300) return "하락 종목 우세";
  return "방향 탐색 구간";
}
export function marketNarrative(row?: MarketRow) {
  if (!row) return "기록이 들어오면 시장 폭과 수급을 함께 보여줍니다.";
  const breadth = row.diff >= 0 ? "상승" : "하락";
  const flow = !verifiedFlow(row) ? "수급 상태를 함께 확인하세요." : (row.flowPower ?? 0) >= 0 ? "외국인·기관 합산 수급은 순매수입니다." : "외국인·기관 합산 수급은 순매도입니다.";
  return breadth + " 종목이 " + formatNumber(Math.abs(row.diff)) + "개 더 많습니다. " + flow;
}
export function dataStatus(row: MarketRow | undefined, date: string, error: string, now = new Date()) {
  const kst = kstParts(now);
  if (error) return { label: "연결 확인 필요", tone: "error", detail: row ? "마지막 조회값 유지" : "데이터를 불러오지 못했습니다" };
  if (date !== kst.date) return { label: "과거 기록", tone: "neutral", detail: date };
  if (!row) return { label: "데이터 대기", tone: "neutral", detail: "선택한 날짜에 기록 없음" };
  if (kst.weekend || kst.minute < OPEN_MINUTE || kst.minute > CLOSE_MINUTE) return { label: "정규장 시간 외", tone: "neutral", detail: "마지막 기록 " + row.time };
  const delay = kst.minute - row.minute;
  if (delay >= 3) return { label: "데이터 지연", tone: "warn", detail: delay + "분 전 기록" };
  if (["FALLBACK", "ERROR", "EMPTY", "FILTERED"].includes(row.flowSource) || ["FALLBACK", "ERROR", "EMPTY", "SKIPPED"].includes(row.breadthSource))
    return { label: "일부 데이터 확인", tone: "warn", detail: sourceLabel(row.flowSource) };
  return { label: "최신 기록", tone: "", detail: row.time + " 기준" };
}
export function signalLabel(type: string) {
  return ({
    CROSS_UP: "0선 상향 돌파", CROSS_DOWN: "0선 하향 이탈",
    ACCEL_UP: "상승 가속", ACCEL_UP_STRONG: "강한 상승 가속",
    ACCEL_DOWN: "하락 가속", ACCEL_DOWN_STRONG: "강한 하락 가속",
    SCORE_OVERHEAT: "시장점수 과열", SCORE_OVERHEAT_STRONG: "강한 과열",
    SCORE_OVERSOLD: "시장점수 침체", SCORE_OVERSOLD_STRONG: "강한 침체",
    FLOW_STRONG_BUY: "외국인·기관 매수 확대", FLOW_STRONG_SELL: "외국인·기관 매도 확대",
    FLOW_DIVERGENCE: "수급 다이버전스", FLOW_FALLBACK: "직전 수급 유지",
    BREADTH_FALLBACK: "직전 종목수 유지", ACCUMULATION: "매집 조건 감지", DISTRIBUTION: "분배 조건 감지",
    REAL_DIVERGENCE: "다이버전스", STRONG_TREND_UP: "강한 상승 추세", STRONG_TREND_DOWN: "강한 하락 추세",
  } as Record<string, string>)[type] ?? type.replace(/_/g, " ");
}
export function eventDirection(type: string): MarketEvent["direction"] {
  if (/UP|BUY|ACCUMULATION|OVERHEAT|매집/.test(type)) return "up";
  if (/DOWN|SELL|DISTRIBUTION|OVERSOLD|위험/.test(type)) return "down";
  return "neutral";
}
export function eventLevel(value: unknown): SignalLevel {
  const v = String(value ?? "").toUpperCase();
  if (["강", "HIGH", "DANGER", "STRONG"].includes(v)) return "강";
  if (["약", "LOW", "INFO", "WEAK"].includes(v)) return "약";
  return "중";
}
export function csvCell(value: unknown) {
  if (value == null) return "";
  let text = String(value);
  if (typeof value === "string" && /^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function rowsCsv(rows: MarketRow[]) {
  const headers = ["날짜","시간","상승 종목","하락 종목","보합 종목","시장 폭","가속도","상승 비율(%)","하락 비율(%)","시장점수","KOSPI","KOSDAQ","외국인(억원)","기관(억원)","개인(억원)","합산수급(억원)","수급상태","종목수상태"];
  const values = rows.map(r => [r.date,r.time,r.up,r.down,r.flat,r.diff,r.accel,Number((r.upRatio*100).toFixed(2)),Number((r.downRatio*100).toFixed(2)),r.marketScore,r.kospi,r.kosdaq,r.foreignFlow,r.instFlow,r.indivFlow,r.flowPower,r.flowSource,r.breadthSource]);
  return "\uFEFF" + [headers,...values].map(row => row.map(csvCell).join(",")).join("\r\n");
}
export function eventsCsv(events: MarketEvent[]) {
  return "\uFEFF" + [["날짜","시간","신호","강도","내용","출처","조건충족률(%)"],...events.map(e=>[e.date,e.time,e.label,e.level,e.message,e.source,e.conditionRate ?? ""])].map(row=>row.map(csvCell).join(",")).join("\r\n");
}
