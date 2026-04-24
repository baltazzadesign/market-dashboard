"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts"

type ScoreLog = {
  time?: string
  createdAt?: string
  marketScore?: number
  score?: number
  kospiScore?: number
  kosdaqScore?: number
}

export default function MarketScoreChart({ logs = [] }: { logs: ScoreLog[] }) {
  const data = logs.map((log) => ({
    time:
      log.time ??
      (log.createdAt
        ? new Date(log.createdAt).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : ""),
    score: Number(log.marketScore ?? log.score ?? 0),
    kospi: Number(log.kospiScore ?? 0),
    kosdaq: Number(log.kosdaqScore ?? 0),
  }))

  return (
    <section className="rounded-2xl border border-white/10 bg-[#111827] p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">시장점수 차트</h2>
        <span className="text-xs text-gray-400">1분 로그 기반</span>
      </div>

      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
            <XAxis
              dataKey="time"
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              minTickGap={30}
            />
            <YAxis
              domain={[-100, 100]}
              tick={{ fill: "#9ca3af", fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                background: "#020617",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 12,
                color: "#fff",
              }}
            />
            <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4" />
            <Line
              type="monotone"
              dataKey="score"
              name="시장점수"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}