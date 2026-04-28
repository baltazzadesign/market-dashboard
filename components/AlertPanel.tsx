"use client";

import { useMemo, useState } from "react";

type AlertItem = {
  time?: string;
  level?: string;
  message?: string;
  type?: string;
  category?: string;
};

function getAlertBadge(level?: string) {
  const v = String(level ?? "").toUpperCase();
  if (v.includes("강") || v.includes("HIGH") || v.includes("위험")) {
    return { label: "강", className: "border-red-400/40 bg-red-500/10 text-red-300" };
  }
  if (v.includes("중") || v.includes("MID") || v.includes("MEDIUM")) {
    return { label: "중", className: "border-amber-400/40 bg-amber-500/10 text-amber-300" };
  }
  if (v.includes("약") || v.includes("LOW")) {
    return { label: "약", className: "border-sky-400/40 bg-sky-500/10 text-sky-300" };
  }
  return { label: "알림", className: "border-white/15 bg-white/5 text-slate-300" };
}

function translateAlert(text?: string) {
  const raw = String(text ?? "").trim();
  if (!raw) return "알림 내용 없음";
  return raw
    .replaceAll("BULL", "상승 우위")
    .replaceAll("BEAR", "하락 우위")
    .replaceAll("NEUTRAL", "보합")
    .replaceAll("FLOW_LIVE", "수급 정상")
    .replaceAll("FLOW_FALLBACK", "수급 보정")
    .replaceAll("BREADTH_LIVE", "종목 정상")
    .replaceAll("BREADTH_FALLBACK", "종목 보정")
    .replaceAll("SIGNAL", "신호")
    .replaceAll("ALERT", "알림");
}

export default function AlertPanel({ alerts = [] }: { alerts: AlertItem[] }) {
  const [filter, setFilter] = useState<"전체" | "강" | "중" | "약">("전체");

  const filteredAlerts = useMemo(() => {
    if (filter === "전체") return alerts;
    return alerts.filter((alert) => getAlertBadge(alert.level).label === filter);
  }, [alerts, filter]);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl transition hover:border-sky-300/25">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold tracking-tight text-white">실시간 알림</h2>
          <p className="mt-1 text-xs text-slate-400">중요 신호와 보정 상태를 모아 보여줍니다</p>
        </div>

        <div className="flex gap-1 rounded-full border border-white/10 bg-black/20 p-1">
          {(["전체", "강", "중", "약"] as const).map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                filter === item
                  ? "bg-sky-400 text-slate-950 shadow-[0_0_18px_rgba(56,189,248,0.35)]"
                  : "text-slate-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
        {filteredAlerts.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-slate-400">
            현재 표시할 알림이 없습니다
          </div>
        ) : (
          filteredAlerts.map((alert, index) => {
            const badge = getAlertBadge(alert.level);
            return (
              <div
                key={`${alert.time ?? "time"}-${index}`}
                className="group rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 transition hover:-translate-y-0.5 hover:border-sky-300/30 hover:bg-slate-900/60"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold ${badge.className}`}>
                    {badge.label}
                  </span>
                  <span className="text-xs font-bold text-slate-500">{alert.time || "-"}</span>
                </div>
                <p className="text-sm font-semibold leading-relaxed text-slate-100">
                  {translateAlert(alert.message ?? alert.type)}
                </p>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
