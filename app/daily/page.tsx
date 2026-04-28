"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode, WheelEvent } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
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
  flowSource?: string;
  flowsource?: string;
  flowStatus?: string;
  flowstatus?: string;
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

function timeToMinute(time: string) {
  const normalized = formatTime(time);
  const [h, m] = normalized.split(":").map((v) => Number(v));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
  return h * 60 + m;
}

const MARKET_OPEN_MINUTE = 9 * 60;
const MARKET_CLOSE_MINUTE = 15 * 60 + 30;
const MARKET_TIME_TICKS = Array.from(
  { length: Math.floor((MARKET_CLOSE_MINUTE - MARKET_OPEN_MINUTE) / 30) + 1 },
  (_, index) => MARKET_OPEN_MINUTE + index * 30
);

function minuteToTimeLabel(value: any) {
  const minuteValue = Number(value);
  if (!Number.isFinite(minuteValue)) return "";
  const hour = Math.floor(minuteValue / 60);
  const minute = minuteValue % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function clampMinuteDomain(start: number, end: number): [number, number] {
  const totalRange = MARKET_CLOSE_MINUTE - MARKET_OPEN_MINUTE;
  const minRange = 30;
  let nextStart = Number(start);
  let nextEnd = Number(end);

  if (!Number.isFinite(nextStart) || !Number.isFinite(nextEnd)) {
    return [MARKET_OPEN_MINUTE, MARKET_CLOSE_MINUTE];
  }

  let range = nextEnd - nextStart;
  if (range < minRange) {
    const center = (nextStart + nextEnd) / 2;
    nextStart = center - minRange / 2;
    nextEnd = center + minRange / 2;
    range = minRange;
  }

  if (range >= totalRange) {
    return [MARKET_OPEN_MINUTE, MARKET_CLOSE_MINUTE];
  }

  if (nextStart < MARKET_OPEN_MINUTE) {
    nextEnd += MARKET_OPEN_MINUTE - nextStart;
    nextStart = MARKET_OPEN_MINUTE;
  }

  if (nextEnd > MARKET_CLOSE_MINUTE) {
    nextStart -= nextEnd - MARKET_CLOSE_MINUTE;
    nextEnd = MARKET_CLOSE_MINUTE;
  }

  nextStart = Math.max(MARKET_OPEN_MINUTE, nextStart);
  nextEnd = Math.min(MARKET_CLOSE_MINUTE, nextEnd);

  return [Math.round(nextStart), Math.round(nextEnd)];
}

function getTicksForDomain(domain?: [number, number]) {
  if (!domain) return MARKET_TIME_TICKS;
  const ticks = MARKET_TIME_TICKS.filter((tick) => tick >= domain[0] && tick <= domain[1]);
  if (ticks.length >= 2) return ticks;
  return [Math.round(domain[0]), Math.round(domain[1])];
}

function clampChartValue(value: any, limit = 120000) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  if (n > limit) return limit;
  if (n < -limit) return -limit;
  return n;
}

function clampChartNullable(value: any, limit = 120000) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n > limit) return limit;
  if (n < -limit) return -limit;
  return n;
}

function getSessionChartRows<T extends { timeLabel: string; up?: number; down?: number; kospi?: number; kosdaq?: number }>(rows: T[]) {
  const regularRows = rows.filter((row) => {
    const minute = timeToMinute(row.timeLabel);
    return minute >= 8 * 60 + 50 && minute <= 15 * 60 + 40;
  });

  const cleanRegularRows = regularRows.filter((row) => {
    const hasBreadth = Number(row.up ?? 0) > 0 || Number(row.down ?? 0) > 0;
    const hasIndex = Number(row.kospi ?? 0) > 1000 || Number(row.kosdaq ?? 0) > 100;
    return hasBreadth && hasIndex;
  });

  return cleanRegularRows.length > 3 ? cleanRegularRows : rows;
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

function isLiveFlowRow(row?: Row | any) {
  const source = getFlowSource(row);
  // 예전 데이터처럼 source가 없는 행은 기존 표시를 유지합니다.
  if (!source) return true;
  return source === "LIVE";
}

function getCleanMarketState(value?: string) {
  return String(value ?? "").replace(/\|FLOW_(LIVE|FALLBACK|EMPTY|ERROR|FILTERED)$/i, "");
}

function getFlowSource(row?: Row | any) {
  const explicit = String(
    row?.flowSource ??
      row?.flowsource ??
      row?.flowStatus ??
      row?.flowstatus ??
      ""
  ).toUpperCase();

  if (explicit) return explicit;

  const state = String(row?.marketState ?? row?.marketstate ?? "");
  const match = state.match(/FLOW_(LIVE|FALLBACK|EMPTY|ERROR|FILTERED)/i);
  return match ? match[1].toUpperCase() : "";
}

function buildRowsWithFlowFallback(rows: Row[]) {
  let lastLiveFlow: { foreignFlow: number; instFlow: number; indivFlow: number; flowPower: number; flowMomentum: number } | null = null;

  return rows.map((row) => {
    const source = getFlowSource(row);
    const hasSource = Boolean(source);
    const isLive = !hasSource || source === "LIVE";

    const current = {
      foreignFlow: Number(row.foreignFlow ?? 0),
      instFlow: Number(row.instFlow ?? 0),
      indivFlow: Number(row.indivFlow ?? 0),
      flowPower: getFlowPower(row),
      flowMomentum: Number(row.flowMomentum ?? getFlowPower(row)),
    };

    if (isLive) {
      lastLiveFlow = current;
      return {
        ...row,
        marketState: getCleanMarketState(row.marketState),
        flowDisplaySource: source || "LIVE",
        flowFallback: false,
      } as Row & { flowDisplaySource: string; flowFallback: boolean };
    }

    if (!lastLiveFlow) {
      return {
        ...row,
        marketState: getCleanMarketState(row.marketState),
        flowDisplaySource: source,
        flowFallback: true,
      } as Row & { flowDisplaySource: string; flowFallback: boolean };
    }

    return {
      ...row,
      foreignFlow: lastLiveFlow.foreignFlow,
      instFlow: lastLiveFlow.instFlow,
      indivFlow: lastLiveFlow.indivFlow,
      flowPower: lastLiveFlow.flowPower,
      flowMomentum: lastLiveFlow.flowMomentum,
      marketState: getCleanMarketState(row.marketState),
      flowDisplaySource: source,
      flowFallback: true,
    } as Row & { flowDisplaySource: string; flowFallback: boolean };
  });
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

function buildSessionSummary(rows: any[]) {
  if (!rows.length) {
    return {
      highDiff: 0,
      highDiffTime: "-",
      lowDiff: 0,
      lowDiffTime: "-",
      maxAccel: 0,
      maxAccelTime: "-",
      minAccel: 0,
      minAccelTime: "-",
      dangerCount: 0,
      accumulationCount: 0,
      signalCount: 0,
      flowPeak: 0,
      flowPeakTime: "-",
      flowLow: 0,
      flowLowTime: "-",
      latestTime: "-",
    };
  }

  const highDiffRow = rows.reduce((best, row) => Number(row.diff ?? 0) > Number(best.diff ?? 0) ? row : best, rows[0]);
  const lowDiffRow = rows.reduce((best, row) => Number(row.diff ?? 0) < Number(best.diff ?? 0) ? row : best, rows[0]);
  const maxAccelRow = rows.reduce((best, row) => Number(row.accel ?? 0) > Number(best.accel ?? 0) ? row : best, rows[0]);
  const minAccelRow = rows.reduce((best, row) => Number(row.accel ?? 0) < Number(best.accel ?? 0) ? row : best, rows[0]);
  const flowPeakRow = rows.reduce((best, row) => Number(row.foreignInstFlowValue ?? 0) > Number(best.foreignInstFlowValue ?? 0) ? row : best, rows[0]);
  const flowLowRow = rows.reduce((best, row) => Number(row.foreignInstFlowValue ?? 0) < Number(best.foreignInstFlowValue ?? 0) ? row : best, rows[0]);

  return {
    highDiff: Number(highDiffRow.diff ?? 0),
    highDiffTime: highDiffRow.timeLabel ?? "-",
    lowDiff: Number(lowDiffRow.diff ?? 0),
    lowDiffTime: lowDiffRow.timeLabel ?? "-",
    maxAccel: Number(maxAccelRow.accel ?? 0),
    maxAccelTime: maxAccelRow.timeLabel ?? "-",
    minAccel: Number(minAccelRow.accel ?? 0),
    minAccelTime: minAccelRow.timeLabel ?? "-",
    dangerCount: rows.filter((row) => row.divergenceType === "danger").length,
    accumulationCount: rows.filter((row) => row.divergenceType === "accumulation").length,
    signalCount: rows.filter((row) => row.signalMarkerColor).length,
    flowPeak: Number(flowPeakRow.foreignInstFlowValue ?? 0),
    flowPeakTime: flowPeakRow.timeLabel ?? "-",
    flowLow: Number(flowLowRow.foreignInstFlowValue ?? 0),
    flowLowTime: flowLowRow.timeLabel ?? "-",
    latestTime: rows[rows.length - 1]?.timeLabel ?? "-",
  };
}

function getActiveLabelFromChartEvent(event: any) {
  const raw = Number(event?.activeLabel ?? event?.activePayload?.[0]?.payload?.timeMinuteValue);
  if (!Number.isFinite(raw)) return null;
  return Math.max(MARKET_OPEN_MINUTE, Math.min(MARKET_CLOSE_MINUTE, Math.round(raw)));
}

function getIndexChangeInfo(value?: number, prevValue?: number) {
  const current = Number(value ?? 0);
  const prev = Number(prevValue ?? 0);

  if (!Number.isFinite(current) || !Number.isFinite(prev) || prev <= 0) {
    return { diff: 0, pct: 0, color: "#94a3b8", icon: "▲" };
  }

  const diff = current - prev;
  const pct = (diff / prev) * 100;

  if (diff > 0) return { diff, pct, color: "#22c55e", icon: "▲" };
  if (diff < 0) return { diff, pct, color: "#ef4444", icon: "▼" };

  return { diff, pct, color: "#94a3b8", icon: "▲" };
}

function buildEnhancedChartRows(data: any[], signals: SignalItem[]) {
  return data.map((row, index) => {
    const prev = index > 0 ? data[index - 1] : null;
    const matchedSignal = signals.find((signal) => signal.time === row.timeLabel);

    const kospiMove = prev ? Number(row.kospi ?? 0) - Number(prev.kospi ?? 0) : 0;
    const kosdaqMove = prev ? Number(row.kosdaq ?? 0) - Number(prev.kosdaq ?? 0) : 0;
    const indexMove = kospiMove + kosdaqMove;
    const flowMove = prev
      ? Number(row.foreignInstFlowValue ?? 0) - Number(prev.foreignInstFlowValue ?? 0)
      : 0;

    const dangerDivergence = Boolean(prev && indexMove >= 0 && flowMove <= -5000);
    const accumulationDivergence = Boolean(prev && indexMove <= 0 && flowMove >= 5000);

    const divergenceType = dangerDivergence
      ? "danger"
      : accumulationDivergence
        ? "accumulation"
        : "";

    return {
      ...row,
      indexMoveValue: indexMove,
      flowMoveValue: flowMove,
      divergenceType,
      divergenceLabel: dangerDivergence
        ? "위험 다이버전스"
        : accumulationDivergence
          ? "매집 다이버전스"
          : "",
      divergenceColor: dangerDivergence
        ? "#ef4444"
        : accumulationDivergence
          ? "#22c55e"
          : "#94a3b8",
      signalMarkerColor: matchedSignal?.color ?? "",
      signalMarkerLabel: matchedSignal ? getSignalLabel(matchedSignal.type) : "",
      signalMarkerDirection: matchedSignal?.direction ?? "",
    };
  });
}


function playSignalBeep() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.28);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch {
    // 알림음은 브라우저 정책에 따라 차단될 수 있어 무시합니다.
  }
}

export default function DailyPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [dbAlerts, setDbAlerts] = useState<AlertItem[]>([]);
  const [dbSignals, setDbSignals] = useState<SignalItem[]>([]);
  const [alertFilter, setAlertFilter] = useState<AlertFilter>("전체");
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [chartsCollapsed, setChartsCollapsed] = useState(false);
  const [showRebound, setShowRebound] = useState(true);
  const [showDangerDivergence, setShowDangerDivergence] = useState(true);
  const [showAccumulationDivergence, setShowAccumulationDivergence] = useState(true);
  const [showSignalMarker, setShowSignalMarker] = useState(true);
  const [chartPanelFullscreen, setChartPanelFullscreen] = useState(false);
  const [chartZoomDomain, setChartZoomDomain] = useState<[number, number]>([
    MARKET_OPEN_MINUTE,
    MARKET_CLOSE_MINUTE,
  ]);
  const [hoverMinute, setHoverMinute] = useState<number | null>(null);
  const [dragStartMinute, setDragStartMinute] = useState<number | null>(null);
  const [dragEndMinute, setDragEndMinute] = useState<number | null>(null);
  const [signalNotifyEnabled, setSignalNotifyEnabled] = useState(false);
  const notifiedSignalRef = useRef<string>("");

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

  const resetChartZoom = () => {
    setChartZoomDomain([MARKET_OPEN_MINUTE, MARKET_CLOSE_MINUTE]);
  };

  const handleFullscreenChartWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const [start, end] = chartZoomDomain;
    const currentRange = end - start;
    const totalRange = MARKET_CLOSE_MINUTE - MARKET_OPEN_MINUTE;

    if (currentRange <= 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const rawRatio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5;
    const anchorRatio = Math.max(0.05, Math.min(0.95, rawRatio));
    const anchorMinute = start + currentRange * anchorRatio;

    const zoomFactor = event.deltaY < 0 ? 0.82 : 1.22;
    const nextRange = Math.max(30, Math.min(totalRange, currentRange * zoomFactor));
    const nextStart = anchorMinute - nextRange * anchorRatio;
    const nextEnd = nextStart + nextRange;

    setChartZoomDomain(clampMinuteDomain(nextStart, nextEnd));
  };


  const handleChartMouseMove = (event: any) => {
    const activeMinute = getActiveLabelFromChartEvent(event);
    setHoverMinute((prev) => (prev === activeMinute ? prev : activeMinute));
    if (dragStartMinute !== null && activeMinute !== null) {
      setDragEndMinute((prev) => (prev === activeMinute ? prev : activeMinute));
    }
  };

  const handleChartMouseLeave = () => {
    setHoverMinute((prev) => (prev === null ? prev : null));
    if (dragStartMinute === null) {
      setDragEndMinute((prev) => (prev === null ? prev : null));
    }
  };

  const handleChartDragStart = (event: any) => {
    const activeMinute = getActiveLabelFromChartEvent(event);
    if (activeMinute === null) return;
    setDragStartMinute(activeMinute);
    setDragEndMinute(activeMinute);
  };

  const handleChartDragEnd = (event: any) => {
    const activeMinute = getActiveLabelFromChartEvent(event) ?? dragEndMinute;
    if (dragStartMinute === null || activeMinute === null) {
      setDragStartMinute(null);
      setDragEndMinute(null);
      return;
    }

    const start = Math.min(dragStartMinute, activeMinute);
    const end = Math.max(dragStartMinute, activeMinute);

    if (end - start >= 10) {
      setChartZoomDomain(clampMinuteDomain(start, end));
    }

    setDragStartMinute(null);
    setDragEndMinute(null);
  };

  const enableSignalNotification = async () => {
    if (!("Notification" in window)) {
      alert("이 브라우저는 알림을 지원하지 않습니다.");
      return;
    }

    if (Notification.permission === "granted") {
      setSignalNotifyEnabled(true);
      return;
    }

    const permission = await Notification.requestPermission();
    setSignalNotifyEnabled(permission === "granted");
  };

  const flowDisplayRows = useMemo(() => buildRowsWithFlowFallback(rows), [rows]);

  const chartRows = useMemo(
    () =>
      flowDisplayRows.map((r, index) => {
        const prev = index > 0 ? flowDisplayRows[index - 1] : undefined;

        return {
          ...r,
          timeLabel: formatTime(r.time),
          timeMinuteValue: timeToMinute(r.time),
          upRatioPct: Number(r.upRatio) * 100,
          downRatioPct: Number(r.downRatio) * 100,
          score: marketScore(r),

          // GAS 방식과 동일하게 수급 실패 구간은 직전 정상값으로 표시합니다.
          foreignFlowValue: Number(r.foreignFlow ?? 0),
          instFlowValue: Number(r.instFlow ?? 0),
          indivFlowValue: Number(r.indivFlow ?? 0),
          flowPowerValue: getFlowPower(r),
          flowTrendValue: getFlowTrend(r, prev),
          flowMomentumValue: Number(r.flowMomentum ?? getFlowPower(r)),
          foreignInstFlowValue: Number(r.foreignFlow ?? 0) + Number(r.instFlow ?? 0),
        };
      }),
    [flowDisplayRows]
  );

  const visibleChartRows = useMemo(
    () =>
      getSessionChartRows(chartRows)
        .filter(
          (row) =>
            row.timeMinuteValue >= MARKET_OPEN_MINUTE &&
            row.timeMinuteValue <= MARKET_CLOSE_MINUTE
        )
        .map((row) => ({
          ...row,
          foreignFlowValue: clampChartNullable(row.foreignFlowValue),
          instFlowValue: clampChartNullable(row.instFlowValue),
          indivFlowValue: clampChartNullable(row.indivFlowValue),
          flowPowerValue: clampChartNullable(row.flowPowerValue),
          flowTrendValue: clampChartNullable(row.flowTrendValue),
          flowMomentumValue: clampChartNullable(row.flowMomentumValue),
          foreignInstFlowValue: clampChartNullable(row.foreignInstFlowValue),
        })),
    [chartRows]
  );

  const last = flowDisplayRows[flowDisplayRows.length - 1];
  const prevLast = flowDisplayRows.length >= 2 ? flowDisplayRows[flowDisplayRows.length - 2] : undefined;

  const localAlerts = useMemo(() => makeAlerts(flowDisplayRows), [flowDisplayRows]);
  const sourceAlerts = dbAlerts.length > 0 ? dbAlerts : localAlerts;
  const alerts = useMemo(
    () =>
      alertFilter === "전체"
        ? sourceAlerts.slice(0, 12)
        : sourceAlerts.filter((alert) => alert.level === alertFilter).slice(0, 12),
    [alertFilter, sourceAlerts]
  );

  const localSignals = useMemo(() => buildSignals(flowDisplayRows), [flowDisplayRows]);
  const signals = useMemo(
    () => (dbSignals.length > 0 ? dbSignals : localSignals),
    [dbSignals, localSignals]
  );
  const sigSummary = useMemo(() => signalSummary(signals), [signals]);
  const enhancedChartRows = useMemo(
    () => buildEnhancedChartRows(visibleChartRows, signals),
    [visibleChartRows, signals]
  );
  const latestDivergence = useMemo(
    () => [...enhancedChartRows].reverse().find((row) => row.divergenceType),
    [enhancedChartRows]
  );
  const sessionSummary = useMemo(
    () => buildSessionSummary(enhancedChartRows),
    [enhancedChartRows]
  );
  const latestStrongSignal = useMemo(
    () => signals.find((signal) => signal.strength === "강") ?? signals[0],
    [signals]
  );

  useEffect(() => {
    if (!signalNotifyEnabled || !("Notification" in window) || Notification.permission !== "granted") return;

    const latestDivergenceRow = [...enhancedChartRows].reverse().find((row) => row.divergenceType);
    const target = latestStrongSignal
      ? {
          key: `signal-${latestStrongSignal.time}-${latestStrongSignal.type}-${latestStrongSignal.message}`,
          title: `SIGNAL ${getSignalLabel(latestStrongSignal.type)}`,
          body: `${latestStrongSignal.time} / ${latestStrongSignal.message}`,
        }
      : latestDivergenceRow
        ? {
            key: `divergence-${latestDivergenceRow.timeLabel}-${latestDivergenceRow.divergenceType}`,
            title: latestDivergenceRow.divergenceLabel,
            body: `${latestDivergenceRow.timeLabel} / 수급 변화 ${formatFlow(latestDivergenceRow.flowMoveValue)}`,
          }
        : null;

    if (!target || notifiedSignalRef.current === target.key) return;
    notifiedSignalRef.current = target.key;
    new Notification(target.title, { body: target.body });
  }, [signalNotifyEnabled, latestStrongSignal, enhancedChartRows]);

  return (
    <div
      style={{
        background:
          "radial-gradient(circle at top left, rgba(56,189,248,0.18), transparent 32%), radial-gradient(circle at top right, rgba(168,85,247,0.16), transparent 34%), linear-gradient(135deg, #020617 0%, #07111f 46%, #020617 100%)",
        minHeight: "100vh",
        color: "white",
        padding: 24,
        fontFamily:
          "Pretendard, Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 18,
          position: "relative",
          background: "transparent",
          backdropFilter: "none",
          borderBottom: "none",
          padding: "0 0 2px",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>📊 DAILY LOG</h1>
          <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>
            {selectedDate ? `${selectedDate} 저장 데이터 조회 중` : "오늘 실시간 데이터 조회 중"}
          </div>
        </div>

        <div
          className="daily-floating-date"
          style={{
            position: "fixed",
            top: 18,
            right: 24,
            zIndex: 80,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px",
            border: "1px solid rgba(56, 189, 248, 0.30)",
            borderRadius: 999,
            background:
              "linear-gradient(145deg, rgba(15,23,42,0.62), rgba(2,6,23,0.46))",
            backdropFilter: "blur(14px)",
            boxShadow:
              "0 12px 34px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
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
              border: "1px solid rgba(56, 189, 248, 0.42)",
              background: "rgba(56, 189, 248, 0.08)",
              color: "#e5e7eb",
              borderRadius: 999,
              padding: "7px 11px",
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
            value={getCleanMarketState(String(last.marketState ?? flowTone(last, prevLast)))}
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

      {latestDivergence && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <SummaryCard
            title="FLOW 다이버전스"
            value={latestDivergence.divergenceLabel}
            color={latestDivergence.divergenceColor}
          />
          <SummaryCard
            title="발생 시간"
            value={latestDivergence.timeLabel}
            color="#e5e7eb"
          />
          <SummaryCard
            title="수급 변화"
            value={formatFlow(latestDivergence.flowMoveValue)}
            color={latestDivergence.flowMoveValue >= 0 ? "#22c55e" : "#ef4444"}
          />
        </div>
      )}

      {enhancedChartRows.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <SummaryCard title="세션 최고 Diff" value={`${sessionSummary.highDiff.toLocaleString()} / ${sessionSummary.highDiffTime}`} color="#22c55e" />
          <SummaryCard title="세션 최저 Diff" value={`${sessionSummary.lowDiff.toLocaleString()} / ${sessionSummary.lowDiffTime}`} color="#60a5fa" />
          <SummaryCard title="다이버전스" value={`위험 ${sessionSummary.dangerCount} / 매집 ${sessionSummary.accumulationCount}`} color="#facc15" />
          <SummaryCard title="수급 범위" value={`${formatFlow(sessionSummary.flowLow)} ~ ${formatFlow(sessionSummary.flowPeak)}`} color="#38bdf8" />
        </div>
      )}

      <div
        className="daily-main-layout"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(420px, 560px)",
          gap: 20,
          alignItems: "start",
        }}
      >
        <div
          className="daily-table-scroll"
          style={{
            maxHeight: "calc(100vh - 220px)",
            overflowY: "auto",
            overflowX: "auto",
            border: "1px solid rgba(56, 189, 248, 0.18)",
            borderRadius: 22,
            background:
              "linear-gradient(145deg, rgba(15,23,42,0.78), rgba(2,6,23,0.68))",
            backdropFilter: "blur(18px)",
            boxShadow:
              "0 22px 70px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.04)",
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
              {flowDisplayRows.map((row, index) => (
                <tr
                  key={row.id}
                  style={{
                    background: index % 2 === 0 ? "rgba(15, 23, 42, 0.18)" : "rgba(2, 6, 23, 0.24)",
                  }}
                >
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
                  <IndexCell value={row.kospi} prevValue={flowDisplayRows[index - 1]?.kospi} />
                  <IndexCell value={row.kosdaq} prevValue={flowDisplayRows[index - 1]?.kosdaq} />
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
          className="daily-chart-panel"
          style={{
            position: "sticky",
            top: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            minWidth: 0,
            maxWidth: "100%",
            overflow: "visible",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              border: "1px solid rgba(56, 189, 248, 0.16)",
              borderRadius: 18,
              background: "linear-gradient(145deg, rgba(15,23,42,0.82), rgba(2,6,23,0.66))",
              boxShadow: "0 12px 32px rgba(0,0,0,0.30)",
              backdropFilter: "blur(16px)",
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 950, color: "#f8fafc" }}>CHART PANEL</div>
              <div style={{ marginTop: 3, fontSize: 11, color: "#94a3b8" }}>노란점=반등 / 빨강=위험 / 초록=매집 / 보라=SIGNAL / X축 09:00~15:30</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowRebound((v) => !v)}
                style={{
                  border: "1px solid rgba(250,204,21,0.34)",
                  background: showRebound ? "rgba(250,204,21,0.12)" : "rgba(15,23,42,0.88)",
                  color: showRebound ? "#fde68a" : "#94a3b8",
                  borderRadius: 999,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                반등표시 {showRebound ? "ON" : "OFF"}
              </button>

              <button
                onClick={() => setShowDangerDivergence((v) => !v)}
                style={{
                  border: "1px solid rgba(239,68,68,0.34)",
                  background: showDangerDivergence ? "rgba(239,68,68,0.12)" : "rgba(15,23,42,0.88)",
                  color: showDangerDivergence ? "#fecaca" : "#94a3b8",
                  borderRadius: 999,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                위험 {showDangerDivergence ? "ON" : "OFF"}
              </button>

              <button
                onClick={() => setShowAccumulationDivergence((v) => !v)}
                style={{
                  border: "1px solid rgba(34,197,94,0.34)",
                  background: showAccumulationDivergence ? "rgba(34,197,94,0.12)" : "rgba(15,23,42,0.88)",
                  color: showAccumulationDivergence ? "#bbf7d0" : "#94a3b8",
                  borderRadius: 999,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                매집 {showAccumulationDivergence ? "ON" : "OFF"}
              </button>

              <button
                onClick={() => setShowSignalMarker((v) => !v)}
                style={{
                  border: "1px solid rgba(168,85,247,0.34)",
                  background: showSignalMarker ? "rgba(168,85,247,0.12)" : "rgba(15,23,42,0.88)",
                  color: showSignalMarker ? "#e9d5ff" : "#94a3b8",
                  borderRadius: 999,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                SIGNAL {showSignalMarker ? "ON" : "OFF"}
              </button>

              <button
                onClick={enableSignalNotification}
                style={{
                  border: "1px solid rgba(250,204,21,0.34)",
                  background: signalNotifyEnabled ? "rgba(250,204,21,0.14)" : "rgba(15,23,42,0.88)",
                  color: signalNotifyEnabled ? "#fde68a" : "#94a3b8",
                  borderRadius: 999,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                알림 {signalNotifyEnabled ? "ON" : "OFF"}
              </button>

              <button
                onClick={() => setChartPanelFullscreen(true)}
                style={{
                  border: "1px solid rgba(56,189,248,0.32)",
                  background: "rgba(15,23,42,0.88)",
                  color: "#e5e7eb",
                  borderRadius: 999,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: "pointer",
                  boxShadow: "0 0 14px rgba(56,189,248,0.10)",
                }}
              >
                전체보기
              </button>

              <button
                onClick={() => setChartsCollapsed((v) => !v)}
                style={{
                  border: "1px solid rgba(56,189,248,0.32)",
                  background: chartsCollapsed ? "rgba(56,189,248,0.18)" : "rgba(15,23,42,0.88)",
                  color: "#e5e7eb",
                  borderRadius: 999,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: "pointer",
                  boxShadow: "0 0 18px rgba(56,189,248,0.16)",
                }}
              >
                {chartsCollapsed ? "차트 펼치기" : "차트 접기"}
              </button>
            </div>
          </div>

          {chartsCollapsed ? (
            <div
              style={{
                border: "1px solid rgba(148, 163, 184, 0.16)",
                borderRadius: 20,
                padding: 18,
                background: "linear-gradient(145deg, rgba(15,23,42,0.82), rgba(2,6,23,0.70))",
                color: "#94a3b8",
                boxShadow: "0 14px 34px rgba(0,0,0,0.24)",
              }}
            >
              차트가 접혀 있습니다. 왼쪽 데이터 확인 시 화면 가림을 줄일 수 있습니다.
            </div>
          ) : (
            <>
          <MiniChart
            title="1. Net Breadth · 전체 상승-하락 폭"
            data={enhancedChartRows}
            height={220}
            referenceLines={[0]}
            lines={[{ key: "diff", name: "상승-하락", color: "#facc15" }]}
            showRebound={showRebound}
            showDangerDivergence={showDangerDivergence}
            showAccumulationDivergence={showAccumulationDivergence}
            showSignalMarker={showSignalMarker}
            hoverMinute={hoverMinute}
            onHoverMinuteChange={handleChartMouseMove}
            onHoverLeave={handleChartMouseLeave}
          />

          <MiniChart
            title="2. Breadth Ratio · 상승/하락 비율"
            data={enhancedChartRows}
            height={220}
            referenceLines={[0]}
            domain={[0, 80]}
            lines={[
              { key: "upRatioPct", name: "상승비율", color: "#ef4444" },
              { key: "downRatioPct", name: "하락비율", color: "#60a5fa" },
            ]}
            showRebound={showRebound}
            showDangerDivergence={showDangerDivergence}
            showAccumulationDivergence={showAccumulationDivergence}
            showSignalMarker={showSignalMarker}
            hoverMinute={hoverMinute}
            onHoverMinuteChange={handleChartMouseMove}
            onHoverLeave={handleChartMouseLeave}
          />

          <MiniChart
            title="3. Flow · 외국인 / 기관 / 개인 수급"
            data={enhancedChartRows}
            height={240}
            referenceLines={[0]}
            lines={[
              { key: "foreignFlowValue", name: "외국인", color: "#60a5fa" },
              { key: "instFlowValue", name: "기관", color: "#ef4444" },
              { key: "indivFlowValue", name: "개인", color: "#facc15" },
            ]}
            showRebound={showRebound}
            showDangerDivergence={showDangerDivergence}
            showAccumulationDivergence={showAccumulationDivergence}
            showSignalMarker={showSignalMarker}
            hoverMinute={hoverMinute}
            onHoverMinuteChange={handleChartMouseMove}
            onHoverLeave={handleChartMouseLeave}
          />

          <MiniChart
            title="4. KOSPI 지수"
            data={enhancedChartRows}
            height={220}
            referenceLines={[0]}
            domain={["auto", "auto"]}
            lines={[{ key: "kospi", name: "KOSPI", color: "#facc15" }]}
            showRebound={showRebound}
            showDangerDivergence={showDangerDivergence}
            showAccumulationDivergence={showAccumulationDivergence}
            showSignalMarker={showSignalMarker}
            hoverMinute={hoverMinute}
            onHoverMinuteChange={handleChartMouseMove}
            onHoverLeave={handleChartMouseLeave}
          />

          <MiniChart
            title="5. KOSDAQ 지수"
            data={enhancedChartRows}
            height={220}
            referenceLines={[0]}
            domain={["auto", "auto"]}
            lines={[{ key: "kosdaq", name: "KOSDAQ", color: "#a78bfa" }]}
            showRebound={showRebound}
            showDangerDivergence={showDangerDivergence}
            showAccumulationDivergence={showAccumulationDivergence}
            showSignalMarker={showSignalMarker}
            hoverMinute={hoverMinute}
            onHoverMinuteChange={handleChartMouseMove}
            onHoverLeave={handleChartMouseLeave}
          />

          <AlertBox alerts={alerts} filter={alertFilter} onFilterChange={setAlertFilter} />

          <SignalBox signals={signals} />
            </>
          )}
        </div>
      </div>

      {chartPanelFullscreen && (
        <div
          onClick={() => setChartPanelFullscreen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(2, 6, 23, 0.92)",
            backdropFilter: "blur(18px)",
            padding: 24,
            overflow: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 1480,
              margin: "0 auto",
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 16,
            }}
          >
            <div
              style={{
                gridColumn: "1 / -1",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: "8px 2px 4px",
              }}
            >
              <div>
                <div style={{ fontSize: 20, fontWeight: 950, color: "#f8fafc" }}>CHART PANEL 전체보기</div>
                <div style={{ marginTop: 4, fontSize: 12, color: "#94a3b8" }}>
                  반등 {showRebound ? "ON" : "OFF"} / 위험 {showDangerDivergence ? "ON" : "OFF"} / 매집 {showAccumulationDivergence ? "ON" : "OFF"} / SIGNAL {showSignalMarker ? "ON" : "OFF"}
                  <span style={{ color: "#38bdf8", marginLeft: 10 }}>휠 확대 {minuteToTimeLabel(chartZoomDomain[0])}~{minuteToTimeLabel(chartZoomDomain[1])}</span>
                  <span style={{ color: "#facc15", marginLeft: 10 }}>드래그 확대 가능</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={resetChartZoom}
                  style={{
                    border: "1px solid rgba(56,189,248,0.32)",
                    background: "rgba(15,23,42,0.92)",
                    color: "#bae6fd",
                    borderRadius: 999,
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  줌 초기화
                </button>
              <button
                onClick={() => setChartPanelFullscreen(false)}
                style={{
                  border: "1px solid rgba(148, 163, 184, 0.24)",
                  background: "rgba(15,23,42,0.92)",
                  color: "#e5e7eb",
                  borderRadius: 999,
                  padding: "10px 14px",
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                닫기
              </button>
              </div>
            </div>

            <MiniChart title="1. Net Breadth · 전체 상승-하락 폭" data={enhancedChartRows} height={320} referenceLines={[0]} lines={[{ key: "diff", name: "상승-하락", color: "#facc15" }]} showRebound={showRebound} showDangerDivergence={showDangerDivergence} showAccumulationDivergence={showAccumulationDivergence} showSignalMarker={showSignalMarker} xDomain={chartZoomDomain} onChartWheel={handleFullscreenChartWheel} hoverMinute={hoverMinute} onHoverMinuteChange={handleChartMouseMove} onHoverLeave={handleChartMouseLeave} onChartDragStart={handleChartDragStart} onChartDragEnd={handleChartDragEnd} dragStartMinute={dragStartMinute} dragEndMinute={dragEndMinute} />
            <MiniChart title="2. Breadth Ratio · 상승/하락 비율" data={enhancedChartRows} height={320} referenceLines={[0]} domain={[0, 80]} lines={[{ key: "upRatioPct", name: "상승비율", color: "#ef4444" }, { key: "downRatioPct", name: "하락비율", color: "#60a5fa" }]} showRebound={showRebound} showDangerDivergence={showDangerDivergence} showAccumulationDivergence={showAccumulationDivergence} showSignalMarker={showSignalMarker} xDomain={chartZoomDomain} onChartWheel={handleFullscreenChartWheel} hoverMinute={hoverMinute} onHoverMinuteChange={handleChartMouseMove} onHoverLeave={handleChartMouseLeave} onChartDragStart={handleChartDragStart} onChartDragEnd={handleChartDragEnd} dragStartMinute={dragStartMinute} dragEndMinute={dragEndMinute} />
            <div style={{ gridColumn: "1 / -1" }}>
              <MiniChart title="3. Flow · 외국인 / 기관 / 개인 수급" data={enhancedChartRows} height={340} referenceLines={[0]} lines={[{ key: "foreignFlowValue", name: "외국인", color: "#60a5fa" }, { key: "instFlowValue", name: "기관", color: "#ef4444" }, { key: "indivFlowValue", name: "개인", color: "#facc15" }]} showRebound={showRebound} showDangerDivergence={showDangerDivergence} showAccumulationDivergence={showAccumulationDivergence} showSignalMarker={showSignalMarker} xDomain={chartZoomDomain} onChartWheel={handleFullscreenChartWheel} hoverMinute={hoverMinute} onHoverMinuteChange={handleChartMouseMove} onHoverLeave={handleChartMouseLeave} onChartDragStart={handleChartDragStart} onChartDragEnd={handleChartDragEnd} dragStartMinute={dragStartMinute} dragEndMinute={dragEndMinute} />
            </div>
            <MiniChart title="4. KOSPI 지수" data={enhancedChartRows} height={320} referenceLines={[0]} domain={["auto", "auto"]} lines={[{ key: "kospi", name: "KOSPI", color: "#22c55e" }]} showRebound={showRebound} showDangerDivergence={showDangerDivergence} showAccumulationDivergence={showAccumulationDivergence} showSignalMarker={showSignalMarker} xDomain={chartZoomDomain} onChartWheel={handleFullscreenChartWheel} hoverMinute={hoverMinute} onHoverMinuteChange={handleChartMouseMove} onHoverLeave={handleChartMouseLeave} onChartDragStart={handleChartDragStart} onChartDragEnd={handleChartDragEnd} dragStartMinute={dragStartMinute} dragEndMinute={dragEndMinute} />
            <MiniChart title="5. KOSDAQ 지수" data={enhancedChartRows} height={320} referenceLines={[0]} domain={["auto", "auto"]} lines={[{ key: "kosdaq", name: "KOSDAQ", color: "#a78bfa" }]} showRebound={showRebound} showDangerDivergence={showDangerDivergence} showAccumulationDivergence={showAccumulationDivergence} showSignalMarker={showSignalMarker} xDomain={chartZoomDomain} onChartWheel={handleFullscreenChartWheel} hoverMinute={hoverMinute} onHoverMinuteChange={handleChartMouseMove} onHoverLeave={handleChartMouseLeave} onChartDragStart={handleChartDragStart} onChartDragEnd={handleChartDragEnd} dragStartMinute={dragStartMinute} dragEndMinute={dragEndMinute} />
          </div>
        </div>
      )}

      <style jsx global>{`
        .daily-table-scroll::-webkit-scrollbar {
          width: 7px;
          height: 7px;
        }

        .daily-table-scroll::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.34);
          border-radius: 999px;
        }

        .daily-table-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #0ea5e9, #2563eb 55%, #7c3aed);
          border-radius: 999px;
          box-shadow: 0 0 14px rgba(56, 189, 248, 0.35);
        }

        .daily-table-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #38bdf8, #3b82f6 55%, #8b5cf6);
        }

        .daily-table-scroll {
          scrollbar-width: thin;
          scrollbar-color: #2563eb rgba(15, 23, 42, 0.34);
        }

        @media (max-width: 760px) {
          .daily-floating-date {
            right: 12px !important;
            top: 12px !important;
            transform: scale(0.92);
            transform-origin: top right;
          }
        }

        @media (max-width: 1180px) {
          .daily-main-layout {
            grid-template-columns: 1fr !important;
          }

          .daily-chart-panel {
            position: relative !important;
            top: auto !important;
          }
        }
      `}</style>
    </div>
  );
}

type ChartLineConfig = {
  key: string;
  name: string;
  color: string;
};

function ModernTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;

  const displayLabel = typeof label === "number" ? minuteToTimeLabel(label) : label;

  return (
    <div
      style={{
        background: "rgba(2, 6, 23, 0.92)",
        border: "1px solid rgba(148, 163, 184, 0.22)",
        borderRadius: 12,
        padding: "10px 12px",
        color: "#e5e7eb",
        boxShadow: "0 18px 44px rgba(0,0,0,0.42)",
        backdropFilter: "blur(16px)",
        minWidth: 132,
      }}
    >
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 7, fontWeight: 800 }}>{displayLabel}</div>
      {payload.map((item: any) => (
        <div key={`${item.name}-${item.dataKey}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", fontSize: 12, lineHeight: 1.7 }}>
          <span style={{ color: item.color, fontWeight: 800 }}>{item.name}</span>
          <strong style={{ color: "#f8fafc", fontWeight: 900 }}>{Number(item.value ?? 0).toLocaleString()}</strong>
        </div>
      ))}
    </div>
  );
}

function chartMarkerDot(
  props: any,
  data: any[],
  dataKey: string,
  isPrimaryLine: boolean,
  showRebound: boolean,
  showDangerDivergence: boolean,
  showAccumulationDivergence: boolean,
  showSignalMarker: boolean
) {
  const { cx, cy, payload, index } = props;

  if (cx === undefined || cy === undefined || !payload) return null;

  if (isPrimaryLine && payload.divergenceType) {
    const isDanger = payload.divergenceType === "danger";
    const shouldShowDivergence = isDanger ? showDangerDivergence : showAccumulationDivergence;

    if (shouldShowDivergence) {
      const color = isDanger ? "#ef4444" : "#22c55e";

      return (
        <g>
          <circle
            cx={cx}
            cy={cy}
            r={3}
            fill="rgba(2, 6, 23, 0.92)"
            stroke={color}
            strokeWidth={1.35}
          />
          <circle cx={cx} cy={cy} r={1.05} fill={color} />
        </g>
      );
    }
  }

  if (isPrimaryLine && showSignalMarker && payload.signalMarkerColor) {
    return (
      <g>
        <circle
          cx={cx}
          cy={cy}
          r={2.8}
          fill="rgba(2, 6, 23, 0.92)"
          stroke={payload.signalMarkerColor}
          strokeWidth={1.25}
        />
        <path
          d={`M ${cx} ${cy - 1.5} L ${cx + 1.5} ${cy} L ${cx} ${cy + 1.5} L ${cx - 1.5} ${cy} Z`}
          fill={payload.signalMarkerColor}
        />
      </g>
    );
  }

  if (!showRebound) return null;

  if (index < 2) return null;

  const prev = Number(data[index - 1]?.[dataKey]);
  const prev2 = Number(data[index - 2]?.[dataKey]);
  const curr = Number(payload[dataKey]);

  if (!Number.isFinite(prev) || !Number.isFinite(prev2) || !Number.isFinite(curr)) {
    return null;
  }

  if (prev < prev2 && curr > prev) {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={2.6}
        fill="#facc15"
        stroke="rgba(2, 6, 23, 0.95)"
        strokeWidth={0.8}
      />
    );
  }

  return null;
}

function MiniChart({
  title,
  data,
  lines,
  height = 200,
  domain,
  referenceLines = [],
  showRebound = true,
  showDangerDivergence = true,
  showAccumulationDivergence = true,
  showSignalMarker = true,
  xDomain,
  onChartWheel,
  hoverMinute,
  onHoverMinuteChange,
  onHoverLeave,
  onChartDragStart,
  onChartDragEnd,
  dragStartMinute,
  dragEndMinute,
}: {
  title: string;
  data: any[];
  lines: ChartLineConfig[];
  height?: number;
  domain?: any;
  referenceLines?: number[];
  showRebound?: boolean;
  showDangerDivergence?: boolean;
  showAccumulationDivergence?: boolean;
  showSignalMarker?: boolean;
  xDomain?: [number, number];
  onChartWheel?: (event: WheelEvent<HTMLDivElement>) => void;
  hoverMinute?: number | null;
  onHoverMinuteChange?: (event: any) => void;
  onHoverLeave?: () => void;
  onChartDragStart?: (event: any) => void;
  onChartDragEnd?: (event: any) => void;
  dragStartMinute?: number | null;
  dragEndMinute?: number | null;
}) {
  const chartId = title.replace(/[^a-zA-Z0-9]/g, "");
  const activeXDomain: [number, number] = xDomain ?? [MARKET_OPEN_MINUTE, MARKET_CLOSE_MINUTE];
  const activeXTicks = getTicksForDomain(activeXDomain);

  return (
    <ChartBox title={title}>
      <div
        onWheel={onChartWheel}
        style={{
          cursor: onChartWheel ? "zoom-in" : "default",
          touchAction: onChartWheel ? "none" : "auto",
          transform: "translateZ(0)",
          willChange: "transform",
        }}
        title={onChartWheel ? "마우스 휠로 시간축을 확대/축소할 수 있습니다" : undefined}
      >
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 22, left: 20, bottom: 0 }}
          onMouseMove={onHoverMinuteChange}
          onMouseLeave={onHoverLeave}
          onMouseDown={onChartDragStart}
          onMouseUp={onChartDragEnd}
        >
          <defs>
            {lines.map((line) => (
              <linearGradient key={`gradient-${line.key}`} id={`areaGradient-${chartId}-${line.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={line.color} stopOpacity={0.30} />
                <stop offset="55%" stopColor={line.color} stopOpacity={0.10} />
                <stop offset="100%" stopColor={line.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
            <filter id={`chartGlow-${chartId}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <CartesianGrid stroke="rgba(148, 163, 184, 0.11)" vertical={false} strokeDasharray="3 8" />
          <XAxis
            dataKey="timeMinuteValue"
            type="number"
            domain={activeXDomain}
            ticks={activeXTicks}
            tickFormatter={minuteToTimeLabel}
            interval={0}
            allowDataOverflow
            stroke="rgba(203, 213, 225, 0.62)"
            fontSize={10}
            tickLine={false}
            axisLine={{ stroke: "rgba(148, 163, 184, 0.18)" }}
          />
          <YAxis
            stroke="rgba(203, 213, 225, 0.62)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            width={62}
            domain={domain ?? ["auto", "auto"]}
            tickMargin={8}
          />
          <Tooltip content={<ModernTooltip />} />
          {referenceLines.map((value) => (
            <ReferenceLine
              key={value}
              y={value}
              stroke={value === 0 ? "rgba(226, 232, 240, 0.38)" : "rgba(148, 163, 184, 0.22)"}
              strokeDasharray="4 6"
            />
          ))}
          {hoverMinute !== null && (
            <ReferenceLine
              x={hoverMinute}
              stroke="rgba(250, 204, 21, 0.72)"
              strokeDasharray="3 4"
              ifOverflow="extendDomain"
            />
          )}
          {dragStartMinute !== null && dragEndMinute !== null && Math.abs(Number(dragEndMinute) - Number(dragStartMinute)) > 1 && (
            <ReferenceArea
              x1={Math.min(Number(dragStartMinute), Number(dragEndMinute))}
              x2={Math.max(Number(dragStartMinute), Number(dragEndMinute))}
              strokeOpacity={0.25}
              fill="rgba(56, 189, 248, 0.18)"
              ifOverflow="hidden"
            />
          )}
          {lines.map((line) => (
            <Area
              key={`area-${line.key}`}
              type="monotone"
              dataKey={line.key}
              stroke="none"
              fill={`url(#areaGradient-${chartId}-${line.key})`}
              fillOpacity={1}
              isAnimationActive={false}
              connectNulls
            />
          ))}
          {lines.map((line, lineIndex) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              name={line.name}
              stroke={line.color}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={(props) =>
                chartMarkerDot(
                  props,
                  data,
                  line.key,
                  lineIndex === 0,
                  showRebound,
                  showDangerDivergence,
                  showAccumulationDivergence,
                  showSignalMarker
                )
              }
              activeDot={{
                r: 3.5,
                strokeWidth: 1.2,
                stroke: "rgba(255,255,255,0.9)",
                fill: line.color,
              }}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      </div>
    </ChartBox>
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
        background:
          "linear-gradient(145deg, rgba(15,23,42,0.86), rgba(30,41,59,0.58))",
        border: "1px solid rgba(148, 163, 184, 0.16)",
        borderRadius: 18,
        padding: 18,
        boxShadow: "0 18px 40px rgba(0,0,0,0.28)",
        backdropFilter: "blur(16px)",
      }}
    >
      <div style={{ fontSize: 12, color: "#93c5fd", marginBottom: 10, fontWeight: 800, letterSpacing: 0.2 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 950, color, textShadow: "0 0 18px rgba(255,255,255,0.10)" }}>{value}</div>
    </div>
  );
}

function ChartBox({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        background:
          "linear-gradient(145deg, rgba(15,23,42,0.88), rgba(30,41,59,0.58))",
        border: "1px solid rgba(148, 163, 184, 0.16)",
        borderRadius: 18,
        padding: 14,
        boxShadow: "0 14px 34px rgba(0,0,0,0.24)",
        backdropFilter: "blur(16px)",
        overflow: "visible",
      }}
    >
      <h3
        style={{
          fontSize: 13,
          color: "#e5e7eb",
          margin: "0 0 12px",
          fontWeight: 900,
          letterSpacing: 0.15,
        }}
      >
        {title}
      </h3>
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
        background:
          "linear-gradient(145deg, rgba(15,23,42,0.90), rgba(30,41,59,0.60))",
        border: `1px solid ${badge.color}`,
        borderRadius: 22,
        padding: 18,
        boxShadow: `0 0 0 1px rgba(255,255,255,0.02), 0 22px 60px rgba(0,0,0,0.34)`,
        backdropFilter: "blur(18px)",
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
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
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
        border: `1px solid ${strong ? color : "rgba(148, 163, 184, 0.14)"}`,
        borderRadius: 16,
        padding: 12,
        boxShadow: strong ? `0 0 22px ${bg}` : "none",
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

function IndexCell({ value, prevValue }: { value: number; prevValue?: number }) {
  const info = getIndexChangeInfo(value, prevValue);
  const hasPrev = Number(prevValue ?? 0) > 0;

  return (
    <td style={td}>
      <div style={{ fontWeight: 900, color: "#f8fafc" }}>
        {Number(value ?? 0).toLocaleString()}
      </div>
      {hasPrev && (
        <div
          style={{
            marginTop: 3,
            fontSize: 10.5,
            fontWeight: 900,
            color: info.color,
            lineHeight: 1.15,
            textShadow: `0 0 10px ${info.color}33`,
          }}
        >
          {info.icon} {Math.abs(info.diff).toFixed(2)} ({info.pct >= 0 ? "+" : "-"}
          {Math.abs(info.pct).toFixed(2)}%)
        </div>
      )}
    </td>
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
        background:
          "linear-gradient(145deg, rgba(15,23,42,0.88), rgba(30,41,59,0.58))",
        border: "1px solid rgba(148, 163, 184, 0.16)",
        borderRadius: 18,
        padding: 14,
        boxShadow: "0 14px 34px rgba(0,0,0,0.24)",
        backdropFilter: "blur(16px)",
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
  const filteredSignals = useMemo(
    () => signals.filter(isRecentStrongSignal).slice(0, 10),
    [signals]
  );

  return (
    <div
      style={{
        background:
          "linear-gradient(145deg, rgba(15,23,42,0.88), rgba(30,41,59,0.58))",
        border: "1px solid rgba(148, 163, 184, 0.16)",
        borderRadius: 18,
        padding: 14,
        boxShadow: "0 14px 34px rgba(0,0,0,0.24)",
        backdropFilter: "blur(16px)",
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

const th: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 20,
  padding: "13px 12px",
  borderBottom: "1px solid rgba(56, 189, 248, 0.22)",
  background: "rgba(15, 23, 42, 0.96)",
  backdropFilter: "blur(12px)",
  color: "#e5e7eb",
  textAlign: "center",
  whiteSpace: "nowrap",
  boxShadow: "0 1px 0 rgba(51,65,85,0.9), 0 12px 24px rgba(2,6,23,0.70)",
};

const td: CSSProperties = {
  padding: "11px 10px",
  borderBottom: "1px solid rgba(30, 41, 59, 0.92)",
  textAlign: "center",
  whiteSpace: "nowrap",
};