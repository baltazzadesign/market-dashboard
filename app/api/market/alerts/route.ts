import { readMarketDay, requestedDate, marketError } from "@/lib/balta-data";
import { buildMarketEvents } from "@/lib/balta-signals";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const date = requestedDate(request);
    const rows = await readMarketDay(date, request.signal);
    const events = buildMarketEvents(rows);
    const alerts = events.map(e => ({ ...e, createdAt: e.date + "T" + e.time + ":00+09:00" }));
    const summary = {
      total: alerts.length, strong: alerts.filter(e => e.level === "강").length,
      medium: alerts.filter(e => e.level === "중").length, weak: alerts.filter(e => e.level === "약").length,
      lastCreatedAt: alerts[0]?.createdAt ?? null,
    };
    const signals = alerts.filter(e => e.source !== "시장 알림");
    const count = (type: string) => signals.filter(e => e.type.startsWith(type)).length;
    return Response.json({ ok: true, selectedDate: date, alerts, summary, recentStrong: alerts.find(e => e.level === "강") ?? null, signals,
      signalSummary: { total: signals.length, crossUp: count("CROSS_UP"), crossDown: count("CROSS_DOWN"),
        accelUp: count("ACCEL_UP"), accelDown: count("ACCEL_DOWN"), overheat: count("SCORE_OVERHEAT"), oversold: count("SCORE_OVERSOLD"),
        lastCreatedAt: signals[0]?.createdAt ?? null } });
  } catch (error) { return marketError(error); }
}
