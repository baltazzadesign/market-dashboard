"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";

type Row = {
  id: number;
  time: string;
  up: number;
  down: number;
  flat: number;
  diff: number;
  accel: number;
  upRatio: number;
  downRatio: number;
  kospi: number;
  kosdaq: number;
  foreignFlow?: number;
  instFlow?: number;
  indivFlow?: number;
  flowPower?: number;
  flowTrend?: number;
  flowMomentum?: number;
  marketState?: string;
  signals?: any[];
};

type AlertItem = {
  id?: number;
  time: string;
  level: "약" | "중" | "강";
  message: string;
  color?: string;
  diff?: number;
  accel?: number;
  marketScore?: number;
  createdAt?: string;
};

type AlertFilter = "전체" | "강" | "중" | "약";

type AlertSummary = {
  total?: number;
  strong?: number;
  medium?: number;
  weak?: number;
  lastCreatedAt?: string | null;
};

function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isTodayDate(date: string) {
  return !date || date === getTodayDate();
}

type SignalItem = {
  time: string;
  type: string;
  direction: "상방" | "하방" | "중립";
  strength: "약" | "중" | "강";
  message: string;
  color: string;
  diff?: number;
  prevDiff?: number;
  accel?: number;
  marketScore?: number;
  createdAt?: string;
};

function formatTime(t: string) {
  if (!t) return "";

  if (t.includes("시")) {
    const h = t.split("시")[0].trim();
    const m = t.split("시")[1].split("분")[0].trim();
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  }

  if (t.includes(":")) {
    const parts = t.split(":");
    return `${parts[0].padStart(2, "0")}:${parts[1]}`;
  }

  return t;
}


function getAlertColor(level?: string, fallback?: string) {
  if (fallback) return fallback;
  if (level === "강") return "#ef4444";
  if (level === "중") return "#f97316";
  return "#facc15";
}


function getSignalDirection(type?: string): "상방" | "하방" | "중립" {
  if (!type) return "중립";
  if (type.includes("UP") || type.includes("OVERHEAT")) return "상방";
  if (type.includes("DOWN") || type.includes("OVERSOLD")) return "하방";
  return "중립";
}

function getSignalColor(type?: string) {
  if (!type) return "#94a3b8";
  if (type.includes("CROSS_UP")) return "#22c55e";
  if (type.includes("CROSS_DOWN")) return "#60a5fa";
  if (type.includes("ACCEL_UP")) return "#16a34a";
  if (type.includes("ACCEL_DOWN")) return "#38bdf8";
  if (type.includes("OVERHEAT")) return "#ef4444";
  if (type.includes("OVERSOLD")) return "#3b82f6";
  return "#a78bfa";
}

function getSignalIcon(type?: string) {
  if (!type) return "⚪";
  if (type.includes("CROSS_UP")) return "🟢";
  if (type.includes("CROSS_DOWN")) return "🔵";
  if (type.includes("ACCEL_UP")) return "🟠";
  if (type.includes("ACCEL_DOWN")) return "🟠";
  if (type.includes("OVERHEAT")) return "🔴";
  if (type.includes("OVERSOLD")) return "🟣";
  return "⚪";
}

function getSignalLabel(type?: string) {
  switch (type) {
    case "CROSS_UP":
      return "0선 상향";
    case "CROSS_DOWN":
      return "0선 하향";
    case "ACCEL_UP":
      return "상승 가속";
    case "ACCEL_DOWN":
      return "하락 가속";
    case "SCORE_OVERHEAT":
      return "과열";
    case "SCORE_OVERSOLD":
      return "침체";
    default:
      return type ?? "SIGNAL";
  }
}

function getSignalStrength(type?: string, accel?: number, marketScore?: number): "약" | "중" | "강" {
  const absAccel = Math.abs(Number(accel ?? 0));
  const absScore = Math.abs(Number(marketScore ?? 0));

  if (type?.includes("SCORE") && absScore >= 70) return "강";
  if (type?.includes("ACCEL") && absAccel >= 300) return "강";
  if (type?.includes("CROSS")) return "중";
  return "중";
}

function normalizeDbSignal(signal: any): SignalItem {
  return {
    time: formatTime(signal.time),
    type: signal.type ?? "SIGNAL",
    direction: getSignalDirection(signal.type),
    strength: getSignalStrength(signal.type, signal.accel, signal.marketScore),
    message: signal.message ?? signal.type ?? "SIGNAL",
    color: getSignalColor(signal.type),
    diff: signal.diff,
    prevDiff: signal.prevDiff,
    accel: signal.accel,
    marketScore: signal.marketScore,
    createdAt: signal.createdAt,
  };
}

function marketScore(row?: Row) {
  if (!row) return 0;

  const scoreByDiff = Math.max(-60, Math.min(60, row.diff / 20));
  const scoreByRatio = Math.max(
    -40,
    Math.min(40, (row.upRatio - row.downRatio) * 100)
  );

  return Math.round(scoreByDiff + scoreByRatio);
}

function marketTone(row?: Row) {
  if (!row) return "중립";
  if (row.diff >= 800) return "매우 강한 상승";
  if (row.diff >= 300) return "강한 상승";
  if (row.diff >= 100) return "상승 우세";
  if (row.diff <= -800) return "매우 강한 하락";
  if (row.diff <= -300) return "강한 하락";
  if (row.diff <= -100) return "하락 우세";
  return "중립";
}



function getFlowPower(row?: Row) {
  if (!row) return 0;
  if (typeof row.flowPower === "number") return row.flowPower;
  return Number(row.foreignFlow ?? 0) + Number(row.instFlow ?? 0);
}

function getFlowTrend(row?: Row, prev?: Row) {
  if (!row) return 0;
  if (typeof row.flowTrend === "number") return row.flowTrend;
  return getFlowPower(row) - getFlowPower(prev);
}

function formatFlow(value?: number) {
  return Number(value ?? 0).toLocaleString();
}

function flowTone(row?: Row, prev?: Row) {
  const power = getFlowPower(row);
  const trend = getFlowTrend(row, prev);

  if (power >= 5000 && trend >= 0) return "외인/기관 매수 우세";
  if (power <= -5000 && trend <= 0) return "외인/기관 매도 우세";
  if (power >= 0 && trend < 0) return "매수세 둔화";
  if (power < 0 && trend > 0) return "매도세 완화";
  return "수급 중립";
}


function getFlowColor(value?: number) {
  const n = Number(value ?? 0);
  if (n > 0) return "#ef4444";
  if (n < 0) return "#60a5fa";
  return "#94a3b8";
}

function getFlowBg(value?: number) {
  const n = Number(value ?? 0);
  if (n > 0) return "rgba(239, 68, 68, 0.12)";
  if (n < 0) return "rgba(96, 165, 250, 0.12)";
  return "rgba(148, 163, 184, 0.10)";
}

function getFlowStrength(value?: number) {
  const n = Math.abs(Number(value ?? 0));
  if (n >= 10000) return "강";
  if (n >= 5000) return "중";
  if (n >= 1500) return "약";
  return "미약";
}

function getFlowDirection(value?: number) {
  const n = Number(value ?? 0);
  if (n > 0) return "순매수";
  if (n < 0) return "순매도";
  return "중립";
}

function getFlowBadge(row?: Row, prev?: Row) {
  const power = getFlowPower(row);
  const trend = getFlowTrend(row, prev);
  const strength = getFlowStrength(power);

  if (power > 0 && trend > 0) return { label: `매수 강화 ${strength}`, color: "#ef4444", bg: "rgba(239, 68, 68, 0.14)" };
  if (power > 0 && trend <= 0) return { label: `매수 둔화 ${strength}`, color: "#f97316", bg: "rgba(249, 115, 22, 0.14)" };
  if (power < 0 && trend < 0) return { label: `매도 강화 ${strength}`, color: "#60a5fa", bg: "rgba(96, 165, 250, 0.14)" };
  if (power < 0 && trend >= 0) return { label: `매도 완화 ${strength}`, color: "#38bdf8", bg: "rgba(56, 189, 248, 0.14)" };
  return { label: "수급 중립", color: "#94a3b8", bg: "rgba(148, 163, 184, 0.10)" };
}

function getFlowNarrative(row?: Row, prev?: Row) {
  if (!row) return "데이터 대기 중";

  const power = getFlowPower(row);
  const trend = getFlowTrend(row, prev);
  const foreign = Number(row.foreignFlow ?? 0);
  const inst = Number(row.instFlow ?? 0);
  const indiv = Number(row.indivFlow ?? 0);

  if (foreign > 0 && inst > 0 && power >= 5000) {
    return "외국인과 기관이 동시에 강하게 받치는 구간";
  }

  if (foreign < 0 && inst < 0 && power <= -5000) {
    return "외국인과 기관이 동시에 압박하는 구간";
  }

  if (row.diff > 0 && power < 0) {
    return "시장은 오르지만 외인·기관 수급은 따라오지 않는 다이버전스";
  }

  if (row.diff < 0 && power > 0) {
    return "시장은 약하지만 외인·기관이 받치는 매집 가능 구간";
  }

  if (power > 0 && trend > 0) return "외인·기관 수급이 개선되는 상승 우호 구간";
  if (power < 0 && trend < 0) return "외인·기관 수급 압박이 커지는 하락 경계 구간";

  if (Math.abs(indiv) > Math.abs(power) * 1.5 && Math.abs(indiv) >= 5000) {
    return "개인 수급 영향이 큰 구간이라 방향성 신뢰도는 낮음";
  }

  return "수급 방향성이 뚜렷하지 않은 관망 구간";
}

function buildSignals(rows: Row[]) {
  const signals: SignalItem[] = [];

  if (rows.length < 2) return signals;

  const recentRows = rows.slice(-20);

  recentRows.forEach((row, index) => {
    if (index === 0) return;

    const prev = recentRows[index - 1];
    const time = formatTime(row.time);
    const score = marketScore(row);
    const prevScore = marketScore(prev);
    const kospiMove = Number(row.kospi) - Number(prev.kospi);
    const kosdaqMove = Number(row.kosdaq) - Number(prev.kosdaq);
    const indexMove = kospiMove + kosdaqMove;

    if (prev.diff <= 0 && row.diff > 0) {
      signals.push({
        time,
        type: "0선 돌파",
        direction: "상방",
        strength: row.accel >= 150 || score >= 50 ? "강" : "중",
        message: `Diff가 0선 상방 돌파 / 현재 ${row.diff}`,
        color: "#22c55e",
      });
    }

    if (prev.diff >= 0 && row.diff < 0) {
      signals.push({
        time,
        type: "0선 이탈",
        direction: "하방",
        strength: row.accel <= -150 || score <= -50 ? "강" : "중",
        message: `Diff가 0선 하방 이탈 / 현재 ${row.diff}`,
        color: "#60a5fa",
      });
    }

    if (prev.accel <= 0 && row.accel >= 200) {
      signals.push({
        time,
        type: "가속 전환",
        direction: "상방",
        strength: row.accel >= 350 ? "강" : "중",
        message: `상승 가속 전환 / 가속도 +${row.accel}`,
        color: "#16a34a",
      });
    }

    if (prev.accel >= 0 && row.accel <= -200) {
      signals.push({
        time,
        type: "가속 전환",
        direction: "하방",
        strength: row.accel <= -350 ? "강" : "중",
        message: `하락 가속 전환 / 가속도 ${row.accel}`,
        color: "#38bdf8",
      });
    }

    if (prevScore < 50 && score >= 50) {
      signals.push({
        time,
        type: "시장점수 강화",
        direction: "상방",
        strength: score >= 70 ? "강" : "중",
        message: `시장점수 상승권 진입 / ${score}점`,
        color: "#facc15",
      });
    }

    if (prevScore > -50 && score <= -50) {
      signals.push({
        time,
        type: "시장점수 약화",
        direction: "하방",
        strength: score <= -70 ? "강" : "중",
        message: `시장점수 하락권 진입 / ${score}점`,
        color: "#f97316",
      });
    }

    if (indexMove >= 0 && row.diff <= -300) {
      signals.push({
        time,
        type: "다이버전스",
        direction: "하방",
        strength: row.diff <= -700 ? "강" : "중",
        message: `지수는 버티지만 하락 종목 우세 / Diff ${row.diff}`,
        color: "#a78bfa",
      });
    }

    if (indexMove <= 0 && row.diff >= 300) {
      signals.push({
        time,
        type: "다이버전스",
        direction: "상방",
        strength: row.diff >= 700 ? "강" : "중",
        message: `지수는 약하지만 상승 종목 확산 / Diff ${row.diff}`,
        color: "#2dd4bf",
      });
    }
  });

  return signals.slice(-10).reverse();
}

function signalSummary(signals: SignalItem[]) {
  const latest = signals[0];
  const strongCount = signals.filter((signal) => signal.strength === "강").length;
  const upCount = signals.filter((signal) => signal.direction === "상방").length;
  const downCount = signals.filter((signal) => signal.direction === "하방").length;

  let bias = "중립";
  let color = "#e5e7eb";

  if (upCount > downCount) {
    bias = "상방 우세";
    color = "#22c55e";
  } else if (downCount > upCount) {
    bias = "하방 우세";
    color = "#60a5fa";
  }

  return {
    latest,
    strongCount,
    upCount,
    downCount,
    bias,
    color,
  };
}

function makeAlerts(rows: Row[]) {
  const alerts: AlertItem[] = [];

  rows.slice(-20).forEach((row) => {
    const time = formatTime(row.time);
    const score = marketScore(row);

    if (row.diff >= 800) {
      alerts.push({
        time,
        level: "강",
        message: `상승 종목 우세 강함 / 차이 ${row.diff}`,
        color: "#ef4444",
      });
    } else if (row.diff <= -800) {
      alerts.push({
        time,
        level: "강",
        message: `하락 종목 우세 강함 / 차이 ${row.diff}`,
        color: "#3b82f6",
      });
    } else if (row.diff >= 300) {
      alerts.push({
        time,
        level: "중",
        message: `상승 우세 흐름 / 차이 ${row.diff}`,
        color: "#f97316",
      });
    } else if (row.diff <= -300) {
      alerts.push({
        time,
        level: "중",
        message: `하락 우세 흐름 / 차이 ${row.diff}`,
        color: "#60a5fa",
      });
    }

    if (row.accel >= 250) {
      alerts.push({
        time,
        level: "중",
        message: `상승 가속 감지 / 가속도 +${row.accel}`,
        color: "#22c55e",
      });
    } else if (row.accel <= -250) {
      alerts.push({
        time,
        level: "중",
        message: `하락 가속 감지 / 가속도 ${row.accel}`,
        color: "#38bdf8",
      });
    }

    if (score >= 70) {
      alerts.push({
        time,
        level: "강",
        message: `시장점수 과열권 진입 / ${score}점`,
        color: "#ef4444",
      });
    } else if (score <= -70) {
      alerts.push({
        time,
        level: "강",
        message: `시장점수 침체권 진입 / ${score}점`,
        color: "#3b82f6",
      });
    }
  });

  return alerts.slice(-8).reverse();
}

export default function DailyPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [dbAlerts, setDbAlerts] = useState<AlertItem[]>([]);
  const [dbSignals, setDbSignals] = useState<SignalItem[]>([]);
  const [alertFilter, setAlertFilter] = useState<AlertFilter>("전체");
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [selectedDate, setSelectedDate] = useState("");

  async function loadData(dateValue = selectedDate) {
    const dateQuery = dateValue ? `?date=${dateValue}` : "";

    // 오늘/실시간 화면일 때만 live를 호출해서 1분 기록을 갱신합니다.
    // 과거 날짜 조회 중에는 새 기록을 만들지 않고 DB에 저장된 데이터만 가져옵니다.
    if (isTodayDate(dateValue)) {
      await fetch("/api/market/live", { cache: "no-store" });
    }

    const res = await fetch(`/api/market/daily${dateQuery}`, { cache: "no-store" });
    const json = await res.json();

    if (json.ok) {
      setRows(json.rows ?? []);
    }

    const alertRes = await fetch("/api/alerts", { cache: "no-store" });
    const alertJson = await alertRes.json();

    if (alertJson.ok) {
      setDbAlerts(
        (alertJson.alerts ?? []).map((alert: AlertItem) => ({
          ...alert,
          time: formatTime(alert.time),
          color: getAlertColor(alert.level, alert.color),
        }))
      );
      setSummary(alertJson.summary ?? null);
      setDbSignals(
        (alertJson.signals ?? []).map((signal: any) => normalizeDbSignal(signal))
      );
    }
  }

  useEffect(() => {
    loadData(selectedDate);

    if (!isTodayDate(selectedDate)) {
      return;
    }

    const interval = setInterval(() => {
      loadData(selectedDate);
    }, 60000);

    return () => clearInterval(interval);
  }, [selectedDate]);

  const chartRows = rows.map((r, index) => {
    const prev = index > 0 ? rows[index - 1] : undefined;

    return {
      ...r,
      timeLabel: formatTime(r.time),
      upRatioPct: Number(r.upRatio) * 100,
      downRatioPct: Number(r.downRatio) * 100,
      score: marketScore(r),
      foreignFlowValue: Number(r.foreignFlow ?? 0),
      instFlowValue: Number(r.instFlow ?? 0),
      indivFlowValue: Number(r.indivFlow ?? 0),
      flowPowerValue: getFlowPower(r),
      flowTrendValue: getFlowTrend(r, prev),
      flowMomentumValue: Number(r.flowMomentum ?? getFlowPower(r)),
      foreignInstFlowValue: Number(r.foreignFlow ?? 0) + Number(r.instFlow ?? 0),
    };
  });

  const last = rows[rows.length - 1];
  const prevLast = rows.length >= 2 ? rows[rows.length - 2] : undefined;
  const localAlerts = makeAlerts(rows);
  const sourceAlerts = dbAlerts.length > 0 ? dbAlerts : localAlerts;
  const alerts =
    alertFilter === "전체"
      ? sourceAlerts.slice(0, 12)
      : sourceAlerts.filter((alert) => alert.level === alertFilter).slice(0, 12);

  const localSignals = buildSignals(rows);
  const signals = dbSignals.length > 0 ? dbSignals : localSignals;
  const sigSummary = signalSummary(signals);

  return (
    <div
      style={{
        background: "#020617",
        minHeight: "100vh",
        color: "white",
        padding: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 20,
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "#020617",
          padding: "6px 0 10px",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>📊 DAILY LOG</h1>
          <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>
            {selectedDate ? `${selectedDate} 저장 데이터 조회 중` : "오늘 실시간 데이터 조회 중"}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {selectedDate && (
            <button
              onClick={() => setSelectedDate("")}
              style={{
                border: "1px solid #334155",
                background: "#020617",
                color: "#cbd5e1",
                borderRadius: 999,
                padding: "9px 12px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              오늘 LIVE
            </button>
          )}

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: "1px solid #38bdf8",
              background: "rgba(56, 189, 248, 0.10)",
              color: "#e5e7eb",
              borderRadius: 999,
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            <span>📅 날짜 선택</span>
            <input
              type="date"
              value={selectedDate || getTodayDate()}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                colorScheme: "dark",
                background: "transparent",
                color: "#e5e7eb",
                border: "none",
                outline: "none",
                fontWeight: 800,
                cursor: "pointer",
              }}
            />
          </label>
        </div>
      </div>

      {summary && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <SummaryCard title="오늘 ALERT" value={summary.total ?? 0} color="#facc15" />
          <SummaryCard title="강" value={summary.strong ?? 0} color="#ef4444" />
          <SummaryCard title="중" value={summary.medium ?? 0} color="#f97316" />
          <SummaryCard title="약" value={summary.weak ?? 0} color="#eab308" />
        </div>
      )}

      {last && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <SummaryCard title="시장점수" value={marketScore(last)} color="#facc15" />
          <SummaryCard
            title="차이"
            value={last.diff}
            color={last.diff >= 0 ? "#22c55e" : "#60a5fa"}
          />
          <SummaryCard
            title="상승비율"
            value={`${(last.upRatio * 100).toFixed(2)}%`}
            color="#22c55e"
          />
          <SummaryCard title="시장상태" value={marketTone(last)} color="#e5e7eb" />
        </div>
      )}

      {last && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <SummaryCard
            title="수급 파워(외인+기관)"
            value={formatFlow(getFlowPower(last))}
            color={getFlowPower(last) >= 0 ? "#ef4444" : "#60a5fa"}
          />
          <SummaryCard
            title="수급 추세"
            value={formatFlow(getFlowTrend(last, prevLast))}
            color={getFlowTrend(last, prevLast) >= 0 ? "#ef4444" : "#60a5fa"}
          />
          <SummaryCard
            title="수급 모멘텀"
            value={formatFlow(Number(last.flowMomentum ?? getFlowPower(last)))}
            color={Number(last.flowMomentum ?? getFlowPower(last)) >= 0 ? "#ef4444" : "#60a5fa"}
          />
          <SummaryCard
            title="수급상태"
            value={String(last.marketState ?? flowTone(last, prevLast))}
            color="#e5e7eb"
          />
        </div>
      )}

      {last && (
        <FlowStatusPanel row={last} prev={prevLast} />
      )}

      {signals.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <SummaryCard title="SIGNAL 방향" value={sigSummary.bias} color={sigSummary.color} />
          <SummaryCard title="상방 SIGNAL" value={sigSummary.upCount} color="#22c55e" />
          <SummaryCard title="하방 SIGNAL" value={sigSummary.downCount} color="#60a5fa" />
          <SummaryCard title="강한 SIGNAL" value={sigSummary.strongCount} color="#ef4444" />
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 620px",
          gap: 20,
          alignItems: "start",
        }}
      >
        <div
          style={{
            maxHeight: "calc(100vh - 220px)",
            overflow: "auto",
            border: "1px solid #1e293b",
            borderRadius: 14,
          }}
        >
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={th}>시간</th>
                <th style={th}>상승</th>
                <th style={th}>하락</th>
                <th style={th}>보합</th>
                <th style={th}>차이</th>
                <th style={th}>가속도</th>
                <th style={th}>상승비율</th>
                <th style={th}>하락비율</th>
                <th style={th}>KOSPI</th>
                <th style={th}>KOSDAQ</th>
                <th style={th}>외국인</th>
                <th style={th}>기관</th>
                <th style={th}>개인</th>
                <th style={th}>수급파워</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td style={td}>{formatTime(row.time)}</td>
                  <td style={{ ...td, color: "#ff4d7d" }}>{row.up}</td>
                  <td style={{ ...td, color: "#60a5fa" }}>{row.down}</td>
                  <td style={td}>{row.flat}</td>
                  <td
                    style={{
                      ...td,
                      color: row.diff >= 0 ? "#22c55e" : "#60a5fa",
                    }}
                  >
                    {row.diff}
                  </td>
                  <td style={{ ...td, color: "#f59e0b" }}>{row.accel ?? 0}</td>
                  <td style={td}>{(Number(row.upRatio) * 100).toFixed(2)}%</td>
                  <td style={td}>{(Number(row.downRatio) * 100).toFixed(2)}%</td>
                  <td style={td}>{Number(row.kospi).toLocaleString()}</td>
                  <td style={td}>{Number(row.kosdaq).toLocaleString()}</td>
                  <td style={{ ...td, color: Number(row.foreignFlow ?? 0) >= 0 ? "#ef4444" : "#60a5fa" }}>
                    {formatFlow(Number(row.foreignFlow ?? 0))}
                  </td>
                  <td style={{ ...td, color: Number(row.instFlow ?? 0) >= 0 ? "#ef4444" : "#60a5fa" }}>
                    {formatFlow(Number(row.instFlow ?? 0))}
                  </td>
                  <td style={{ ...td, color: Number(row.indivFlow ?? 0) >= 0 ? "#ef4444" : "#60a5fa" }}>
                    {formatFlow(Number(row.indivFlow ?? 0))}
                  </td>
                  <td style={{ ...td, color: getFlowPower(row) >= 0 ? "#ef4444" : "#60a5fa" }}>
                    {formatFlow(getFlowPower(row))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          style={{
            position: "sticky",
            top: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <ChartBox title="시장점수">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartRows}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="timeLabel" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} domain={[-100, 100]} />
                <Tooltip />
                <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" />
                <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" />
                <ReferenceLine y={-70} stroke="#3b82f6" strokeDasharray="3 3" />
                <Line
                  type="monotone"
                  dataKey="score"
                  name="시장점수"
                  stroke="#facc15"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartBox>

          <AlertBox alerts={alerts} filter={alertFilter} onFilterChange={setAlertFilter} />

          <SignalBox signals={signals} />

          <ChartBox title="시장 차이 추이">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartRows}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="timeLabel" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip />
                <Line type="monotone" dataKey="diff" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartBox>

          <ChartBox title="FLOW 고급 상태">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartRows}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="timeLabel" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} domain={["auto", "auto"]} />
                <Tooltip formatter={(value) => Number(value).toLocaleString()} />
                <Legend />
                <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="foreignInstFlowValue" name="외인+기관" stroke="#facc15" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="flowMomentumValue" name="모멘텀" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="flowTrendValue" name="추세변화" stroke="#a78bfa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartBox>

          <ChartBox title="외국인 / 기관 / 개인 수급">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartRows}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="timeLabel" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} domain={["auto", "auto"]} />
                <Tooltip formatter={(value) => Number(value).toLocaleString()} />
                <Legend />
                <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="foreignFlowValue" name="외국인" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="instFlowValue" name="기관" stroke="#f97316" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="indivFlowValue" name="개인" stroke="#38bdf8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartBox>

          <ChartBox title="수급 파워 / 추세">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartRows}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="timeLabel" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} domain={["auto", "auto"]} />
                <Tooltip formatter={(value) => Number(value).toLocaleString()} />
                <Legend />
                <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="flowPowerValue" name="수급파워(외인+기관)" stroke="#facc15" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="flowTrendValue" name="수급추세" stroke="#a78bfa" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="flowMomentumValue" name="수급모멘텀" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartBox>

          <ChartBox title="상승 / 하락 종목 수">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartRows}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="timeLabel" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="up" name="상승" stroke="#ff4d7d" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="down" name="하락" stroke="#60a5fa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartBox>

          <ChartBox title="상승 / 하락 비율">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartRows}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="timeLabel" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="upRatioPct" name="상승비율" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="downRatioPct" name="하락비율" stroke="#60a5fa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartBox>

          <ChartBox title="KOSPI">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartRows}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="timeLabel" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} domain={["auto", "auto"]} />
                <Tooltip />
                <Line type="monotone" dataKey="kospi" name="KOSPI" stroke="#38bdf8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartBox>

          <ChartBox title="KOSDAQ">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartRows}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="timeLabel" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} domain={["auto", "auto"]} />
                <Tooltip />
                <Line type="monotone" dataKey="kosdaq" name="KOSDAQ" stroke="#a78bfa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartBox>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  color,
}: {
  title: string;
  value: string | number;
  color: string;
}) {
  return (
    <div
      style={{
        background: "#111827",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function ChartBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#111827",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <h3 style={{ fontSize: 14, color: "#cbd5e1", marginBottom: 12 }}>{title}</h3>
      {children}
    </div>
  );
}

function FlowStatusPanel({
  row,
  prev,
}: {
  row: Row;
  prev?: Row;
}) {
  const badge = getFlowBadge(row, prev);
  const foreign = Number(row.foreignFlow ?? 0);
  const inst = Number(row.instFlow ?? 0);
  const indiv = Number(row.indivFlow ?? 0);
  const power = getFlowPower(row);
  const trend = getFlowTrend(row, prev);
  const momentum = Number(row.flowMomentum ?? power);

  return (
    <div
      style={{
        background: "#0f172a",
        border: `1px solid ${badge.color}`,
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 5 }}>FLOW STATUS</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#e5e7eb" }}>
            {getFlowNarrative(row, prev)}
          </div>
        </div>

        <div
          style={{
            color: badge.color,
            background: badge.bg,
            border: `1px solid ${badge.color}`,
            borderRadius: 999,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 900,
            whiteSpace: "nowrap",
          }}
        >
          {badge.label}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 10,
        }}
      >
        <FlowMiniCard title="외국인" value={foreign} />
        <FlowMiniCard title="기관" value={inst} />
        <FlowMiniCard title="개인" value={indiv} />
        <FlowMiniCard title="외인+기관" value={power} strong />
        <FlowMiniCard title="추세" value={trend} />
        <FlowMiniCard title="모멘텀" value={momentum} />
        <FlowMiniCard title="강도" value={getFlowStrength(power)} textColor={badge.color} />
      </div>
    </div>
  );
}

function FlowMiniCard({
  title,
  value,
  strong,
  textColor,
}: {
  title: string;
  value: number | string;
  strong?: boolean;
  textColor?: string;
}) {
  const isNumber = typeof value === "number";
  const color = textColor ?? (isNumber ? getFlowColor(value) : "#e5e7eb");
  const bg = isNumber ? getFlowBg(value) : "rgba(148, 163, 184, 0.10)";

  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${strong ? color : "#1e293b"}`,
        borderRadius: 12,
        padding: 12,
        minHeight: 76,
      }}
    >
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: strong ? 19 : 16, fontWeight: 900, color }}>
        {isNumber ? formatFlow(value) : value}
      </div>
      {isNumber && (
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
          {getFlowDirection(value)}
        </div>
      )}
    </div>
  );
}

function AlertBox({
  alerts,
  filter,
  onFilterChange,
}: {
  alerts: AlertItem[];
  filter: AlertFilter;
  onFilterChange: (filter: AlertFilter) => void;
}) {
  return (
    <div
      style={{
        background: "#111827",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <h3 style={{ fontSize: 14, color: "#cbd5e1", margin: 0 }}>
          ALERT
        </h3>

        <div style={{ display: "flex", gap: 6 }}>
          {(["전체", "강", "중", "약"] as AlertFilter[]).map((item) => (
            <button
              key={item}
              onClick={() => onFilterChange(item)}
              style={{
                border: "1px solid #334155",
                background: filter === item ? "#334155" : "#020617",
                color: filter === item ? "#ffffff" : "#94a3b8",
                borderRadius: 999,
                padding: "4px 8px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {alerts.length === 0 ? (
        <div
          style={{
            color: "#64748b",
            fontSize: 13,
            padding: 12,
            background: "#020617",
            borderRadius: 10,
          }}
        >
          현재 발생한 ALERT 없음
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {alerts.map((alert, index) => (
            <div
              key={alert.id ?? index}
              style={{
                background: "#020617",
                border: `1px solid ${getAlertColor(alert.level, alert.color)}`,
                borderRadius: 10,
                padding: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 6,
                  fontSize: 12,
                  color: "#94a3b8",
                }}
              >
                <span style={{ color: getAlertColor(alert.level, alert.color), fontWeight: 800 }}>
                  {alert.level}
                </span>
                <span>{alert.time}</span>
              </div>
              <div style={{ fontSize: 13, color: "#e5e7eb" }}>
                {alert.message}
              </div>

              {(typeof alert.marketScore === "number" ||
                typeof alert.diff === "number" ||
                typeof alert.accel === "number") && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    color: "#94a3b8",
                  }}
                >
                  {typeof alert.marketScore === "number" ? `점수 ${alert.marketScore}` : ""}
                  {typeof alert.diff === "number" ? ` / 차이 ${alert.diff}` : ""}
                  {typeof alert.accel === "number" ? ` / 가속 ${alert.accel}` : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function isRecentStrongSignal(signal: SignalItem) {
  const now = new Date();
  const signalTime = new Date();
  const [hour, minute] = String(signal.time ?? "").split(":");

  if (!hour || !minute) return false;

  signalTime.setHours(Number(hour), Number(minute), 0, 0);

  const diffMs = now.getTime() - signalTime.getTime();
  const isWithin3Minutes = diffMs >= 0 && diffMs <= 3 * 60 * 1000;

  if (!isWithin3Minutes) return false;

  if (signal.type === "CROSS_UP" || signal.type === "CROSS_DOWN") return true;

  if (signal.type === "ACCEL_UP" || signal.type === "ACCEL_DOWN") {
    return Math.abs(Number(signal.accel ?? 0)) > 200;
  }

  if (signal.type === "SCORE_OVERHEAT" || signal.type === "SCORE_OVERSOLD") return true;

  return false;
}

function SignalBox({ signals }: { signals: SignalItem[] }) {
  const filteredSignals = signals
    .filter(isRecentStrongSignal)
    .slice(0, 10);

  return (
    <div
      style={{
        background: "#111827",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <h3 style={{ fontSize: 14, color: "#cbd5e1", marginBottom: 12 }}>
        SIGNAL
      </h3>

      {filteredSignals.length === 0 ? (
        <div
          style={{
            color: "#64748b",
            fontSize: 13,
            padding: 12,
            background: "#020617",
            borderRadius: 10,
          }}
        >
          최근 3분 내 강한 SIGNAL 없음
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredSignals.map((signal, index) => (
            <div
              key={`${signal.time}-${signal.type}-${index}`}
              style={{
                background: "#020617",
                border: `1px solid ${signal.color}`,
                borderRadius: 10,
                padding: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 6,
                  fontSize: 12,
                  color: "#94a3b8",
                }}
              >
                <span style={{ color: signal.color, fontWeight: 800 }}>
                  {getSignalIcon(signal.type)} {getSignalLabel(signal.type)}
                </span>
                <span>{signal.time}</span>
              </div>

              <div style={{ fontSize: 13, color: "#e5e7eb", marginBottom: 6 }}>
                {signal.message}
              </div>

              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
                diff {signal.diff ?? "-"} / accel {signal.accel ?? "-"} / score {signal.marketScore ?? "-"}
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 11,
                    color: signal.color,
                    border: `1px solid ${signal.color}`,
                    borderRadius: 999,
                    padding: "2px 7px",
                  }}
                >
                  {signal.direction}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#cbd5e1",
                    border: "1px solid #334155",
                    borderRadius: 999,
                    padding: "2px 7px",
                  }}
                >
                  {signal.strength}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 20,
  padding: "12px",
  borderBottom: "1px solid #334155",
  background: "#0f172a",
  color: "#e5e7eb",
  textAlign: "center",
  whiteSpace: "nowrap",
  boxShadow: "0 1px 0 rgba(51,65,85,0.9), 0 8px 18px rgba(2,6,23,0.45)",
};

const td: React.CSSProperties = {
  padding: "10px",
  borderBottom: "1px solid #1e293b",
  textAlign: "center",
  whiteSpace: "nowrap",
};