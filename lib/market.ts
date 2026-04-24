export const TZ = "Asia/Seoul";

export function getKstNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
}

export function formatDateKst(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatHHMM(date: Date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function formatDisplayTime(date: Date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// 2026 대한민국 공휴일 기준
export const HOLIDAYS_2026 = new Set([
  "2026-01-01",
  "2026-02-16",
  "2026-02-17",
  "2026-02-18",
  "2026-03-02",
  "2026-05-01",
  "2026-05-05",
  "2026-05-25",
  "2026-06-03",
  "2026-06-06",
  "2026-07-17",
  "2026-08-17",
  "2026-09-24",
  "2026-09-25",
  "2026-09-26",
  "2026-10-05",
  "2026-10-09",
  "2026-12-25",
]);

export function isHoliday(date: Date) {
  return HOLIDAYS_2026.has(formatDateKst(date));
}

export function getSessionType(date: Date): "NXT" | "REG" | "CLOSED" {
  const mins = date.getHours() * 60 + date.getMinutes();

  const nxtStart = 8 * 60 + 50;   // 08:50
  const nxtEnd = 9 * 60;          // 09:00
  const regStart = 9 * 60;        // 09:00
  const regEnd = 15 * 60 + 30;    // 15:30

  if (mins >= nxtStart && mins < nxtEnd) return "NXT";
  if (mins >= regStart && mins <= regEnd) return "REG";
  return "CLOSED";
}

export function isRecordable(date: Date) {
  if (isWeekend(date)) return false;
  if (isHoliday(date)) return false;
  return getSessionType(date) !== "CLOSED";
}