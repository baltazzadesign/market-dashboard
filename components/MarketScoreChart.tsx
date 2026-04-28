"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
  Legend,
} from "recharts";

type ScoreLog = {
  time?: string;
  createdAt?: string;
  marketScore?: number;
  score?: number;
  kospiScore?: number;
  kosdaqScore?: number;
  marketState?: string;
};

function hasFallbackState(value?: string) {
  const text = String(value ?? "").toUpperCase();
  return text.includes("FALLBACK") || text.includes("ERROR") || text.includes("SKIPPED");
}

function formatTime(log: ScoreLog) {
  if (log.time) return log.time;
  if (!log.createdAt) return "";
  return new Date(log.createdAt).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  });
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;

  const fallback = payload?.[0]?.payload?.fallbackFlag;

  return (
    <div
      style={{
        background: "rgba(2, 6, 23, 0.94)",
        border: `1px solid ${fallback ? "rgba(250, 204, 21, 0.55)" : "rgba(148, 163, 184, 0.22)"}`,
        borderRadius: 14,
        padding: "10px 12px",
        color: "#e5e7eb",
        boxShadow: "0 18px 44px rgba(0,0,0,0.45)",
        backdropFilter: "blur(16px)",
        minWidth: 136,
      }}
    >
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8, fontWeight: 900 }}>
        {label} {fallback ? "· 데이터 보정" : ""}
      </div>
      {payload.map((item: any) => (
        <div
          key={`${item.name}-${item.dataKey}`}
          style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", fontSize: 12, lineHeight: 1.7 }}
        >
          <span style={{ color: item.color, fontWeight: 900 }}>{item.name}</span>
          <strong style={{ color: "#f8fafc", fontWeight: 950 }}>
            {Number(item.value ?? 0).toLocaleString()}
          </strong>
        </div>
      ))}
    </div>
  );
}

export default function MarketScoreChart({ logs = [] }: { logs: ScoreLog[] }) {
  const data = logs.map((log) => ({
    time: formatTime(log),
    score: Number(log.marketScore ?? log.score ?? 0),
    kospi: Number(log.kospiScore ?? 0),
    kosdaq: Number(log.kosdaqScore ?? 0),
    fallbackFlag: hasFallbackState(log.marketState),
  }));

  return (
    <section
      className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-2xl backdrop-blur-xl"
      style={{
        boxShadow: "0 22px 60px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-white">시장점수 차트</h2>
          <p className="mt-1 text-xs font-semibold text-slate-400">
            1분 로그 기반 · 노란 점은 데이터 보정 구간
          </p>
        </div>
        <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-black text-sky-200">
          실시간 흐름
        </span>
      </div>

      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="3 5" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }}
              minTickGap={30}
              tickLine={false}
              axisLine={{ stroke: "rgba(148,163,184,0.18)" }}
            />
            <YAxis
              domain={[-100, 100]}
              tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="plainline" wrapperStyle={{ color: "#cbd5e1", fontSize: 11, fontWeight: 800, paddingTop: 4 }} />
            <ReferenceLine y={0} stroke="rgba(148,163,184,0.42)" strokeDasharray="4 4" />
            <ReferenceLine y={70} stroke="rgba(34,197,94,0.22)" strokeDasharray="3 6" />
            <ReferenceLine y={-70} stroke="rgba(96,165,250,0.22)" strokeDasharray="3 6" />
            <Line
              type="monotone"
              dataKey="score"
              name="시장점수"
              stroke="#38bdf8"
              strokeWidth={2.4}
              dot={(props: any) =>
                props?.payload?.fallbackFlag ? (
                  <circle cx={props.cx} cy={props.cy} r={3.8} fill="#facc15" stroke="#020617" strokeWidth={1.5} />
                ) : (
                  <></>
                )
              }
              activeDot={{ r: 4.8, strokeWidth: 0 }}
              isAnimationActive={false}
              connectNulls
              style={{ filter: "drop-shadow(0 0 9px rgba(56,189,248,0.5))" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
