"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
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
  score?: number;
  confidence?: number;
  duration?: number;
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
  (_, index) => MARKET_OPEN_MINUTE + index * 30,
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
  const ticks = MARKET_TIME_TICKS.filter(
    (tick) => tick >= domain[0] && tick <= domain[1],
  );
  if (ticks.length >= 2) return ticks;
  return [Math.round(domain[0]), Math.round(domain[1])];
}

function useIsMobile(maxWidth = 760) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth <= maxWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [maxWidth]);

  return isMobile;
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

function getSessionChartRows<
  T extends {
    timeLabel: string;
    up?: number;
    down?: number;
    kospi?: number;
    kosdaq?: number;
  },
>(rows: T[]) {
  const regularRows = rows.filter((row) => {
    const minute = timeToMinute(row.timeLabel);
    return minute >= 8 * 60 + 50 && minute <= 15 * 60 + 40;
  });

  const cleanRegularRows = regularRows.filter((row) => {
    const hasBreadth = Number(row.up ?? 0) > 0 || Number(row.down ?? 0) > 0;
    const hasIndex =
      Number(row.kospi ?? 0) > 1000 || Number(row.kosdaq ?? 0) > 100;
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

function getSignalStrength(
  type?: string,
  accel?: number,
  marketScore?: number,
): "약" | "중" | "강" {
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
    score: signal.score,
    confidence: signal.confidence,
    duration: signal.duration,
    createdAt: signal.createdAt,
  };
}

function marketScore(row?: Row) {
  if (!row) return 0;

  const scoreByDiff = Math.max(-60, Math.min(60, row.diff / 20));
  const scoreByRatio = Math.max(
    -40,
    Math.min(40, (row.upRatio - row.downRatio) * 100),
  );

  return Math.round(scoreByDiff + scoreByRatio);
}

function marketTone(row?: Row, prev?: Row) {
  if (!row) return "중립";

  const diff = Number(row.diff ?? 0);
  const accel = Number(row.accel ?? 0);
  const power = getFlowPower(row);
  const trend = getFlowTrend(row, prev);

  if (diff <= -800 && accel > 80 && power > 0) return "투매 후 수급 방어";
  if (diff <= -800 && trend < 0) return "약세 지속 경고";
  if (diff <= -500 && accel > 80) return "하락 둔화 반등 시도";
  if (diff <= -300 && power > 0) return "외인·기관 방어형 약세";
  if (diff <= -300) return "하락 우세";

  if (diff >= 800 && power < 0) return "지수 상승 수급 불일치";
  if (diff >= 800 && trend >= 0) return "강한 상승 확산";
  if (diff >= 300 && power > 0) return "수급 동반 상승";
  if (diff >= 300) return "상승 우세";

  if (Math.abs(diff) < 100 && Math.abs(accel) >= 180) return "방향 전환 대기";
  if (power > 2500 && diff < 0) return "눌림 매집 관찰";
  if (power < -2500 && diff > 0) return "상승 신뢰도 낮음";

  return "중립 관망";
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
  return String(value ?? "").replace(
    /\|FLOW_(LIVE|FALLBACK|EMPTY|ERROR|FILTERED)$/i,
    "",
  );
}

function getFlowSource(row?: Row | any) {
  const explicit = String(
    row?.flowSource ??
      row?.flowsource ??
      row?.flowStatus ??
      row?.flowstatus ??
      "",
  ).toUpperCase();

  if (explicit) return explicit;

  const state = String(row?.marketState ?? row?.marketstate ?? "");
  const match = state.match(/FLOW_(LIVE|FALLBACK|EMPTY|ERROR|FILTERED)/i);
  return match ? match[1].toUpperCase() : "";
}

function buildRowsWithFlowFallback(rows: Row[]) {
  let lastLiveFlow: {
    foreignFlow: number;
    instFlow: number;
    indivFlow: number;
    flowPower: number;
    flowMomentum: number;
  } | null = null;

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

function toFlowEok(value?: number) {
  // DB 저장값은 KIS 원본 수급값(백만원 기준)을 유지하고,
  // 화면에서는 억원 단위로만 변환해서 표시합니다.
  return Number(value ?? 0);
}

function formatFlowEok(value?: number) {
  const eok = toFlowEok(value);
  const abs = Math.abs(eok);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${eok.toLocaleString(undefined, { maximumFractionDigits: digits })}억`;
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

  if (power > 0 && trend > 0)
    return {
      label: `매수 강화 ${strength}`,
      color: "#ef4444",
      bg: "rgba(239, 68, 68, 0.14)",
    };
  if (power > 0 && trend <= 0)
    return {
      label: `매수 둔화 ${strength}`,
      color: "#f97316",
      bg: "rgba(249, 115, 22, 0.14)",
    };
  if (power < 0 && trend < 0)
    return {
      label: `매도 강화 ${strength}`,
      color: "#60a5fa",
      bg: "rgba(96, 165, 250, 0.14)",
    };
  if (power < 0 && trend >= 0)
    return {
      label: `매도 완화 ${strength}`,
      color: "#38bdf8",
      bg: "rgba(56, 189, 248, 0.14)",
    };
  return {
    label: "수급 중립",
    color: "#94a3b8",
    bg: "rgba(148, 163, 184, 0.10)",
  };
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
  if (power < 0 && trend < 0)
    return "외인·기관 수급 압박이 커지는 하락 경계 구간";

  if (Math.abs(indiv) > Math.abs(power) * 1.5 && Math.abs(indiv) >= 5000) {
    return "개인 수급 영향이 큰 구간이라 방향성 신뢰도는 낮음";
  }

  return "수급 방향성이 뚜렷하지 않은 관망 구간";
}

const SIGNAL_COOLDOWN_MINUTES = 10;
const SIGNAL_CHART_COOLDOWN_MINUTES = 12;
const REBOUND_MARKER_COOLDOWN_MINUTES = 12;
const MIN_SIGNAL_SCORE = 4;

function getTrendDuration(
  rows: Row[],
  index: number,
  direction: "up" | "down",
) {
  let count = 0;

  for (let i = index; i > 0; i -= 1) {
    const current = Number(rows[i]?.diff ?? 0);
    const prev = Number(rows[i - 1]?.diff ?? 0);
    const move = current - prev;

    if (direction === "up" && move >= 0) count += 1;
    else if (direction === "down" && move <= 0) count += 1;
    else break;
  }

  return count;
}

function getSignalConfidence(score: number) {
  return Math.max(0, Math.min(100, Math.round((score / 7) * 100)));
}

function getStrengthByScore(score: number): "약" | "중" | "강" {
  if (score >= 6) return "강";
  if (score >= 4) return "중";
  return "약";
}

function compactSignalList(
  signals: SignalItem[],
  minGapMinutes = SIGNAL_COOLDOWN_MINUTES,
) {
  const picked: SignalItem[] = [];

  signals
    .slice()
    .sort((a, b) => timeToMinute(a.time) - timeToMinute(b.time))
    .forEach((signal) => {
      const minute = timeToMinute(signal.time);
      const hasRecentSameType = picked.some((item) => {
        if (item.type !== signal.type) return false;
        const pickedMinute = timeToMinute(item.time);
        if (minute < 0 || pickedMinute < 0) return false;
        return Math.abs(pickedMinute - minute) < minGapMinutes;
      });

      if (!hasRecentSameType) picked.push(signal);
    });

  return picked.reverse();
}

function buildSignalScore(args: {
  direction: "up" | "down";
  diffMove: number;
  accel: number;
  flowMove: number;
  flowPower: number;
  scoreMove: number;
  indexMove: number;
  downRatio: number;
  prevDownRatio: number;
  trendDuration: number;
}) {
  const {
    direction,
    diffMove,
    accel,
    flowMove,
    flowPower,
    scoreMove,
    indexMove,
    downRatio,
    prevDownRatio,
    trendDuration,
  } = args;

  let signalScore = 0;

  if (direction === "up") {
    if (diffMove >= 60) signalScore += 1;
    if (accel >= 100) signalScore += 1;
    if (flowMove >= 800 || flowPower >= 1800) signalScore += 1;
    if (scoreMove >= 8) signalScore += 1;
    if (downRatio <= prevDownRatio + 0.3) signalScore += 1;
    if (indexMove >= -0.5) signalScore += 1;
    if (trendDuration >= 2) signalScore += 1;
  } else {
    if (diffMove <= -60) signalScore += 1;
    if (accel <= -100) signalScore += 1;
    if (flowMove <= -800 || flowPower <= -1800) signalScore += 1;
    if (scoreMove <= -8) signalScore += 1;
    if (downRatio >= prevDownRatio - 0.3) signalScore += 1;
    if (indexMove <= 0.8) signalScore += 1;
    if (trendDuration >= 2) signalScore += 1;
  }

  return signalScore;
}

function isFakeSignal(args: {
  diffMove: number;
  accel: number;
  flowMove: number;
  downRatio: number;
  prevDownRatio: number;
}) {
  const { diffMove, accel, flowMove, downRatio, prevDownRatio } = args;
  const weakDiff = Math.abs(diffMove) < 35;
  const weakAccel = Math.abs(accel) < 80;
  const weakFlow = Math.abs(flowMove) < 700;
  const ratioFlat = Math.abs(downRatio - prevDownRatio) < 0.15;

  return weakDiff && weakAccel && weakFlow && ratioFlat;
}

function buildSignals(rows: Row[]) {
  const signals: SignalItem[] = [];

  if (rows.length < 4) return signals;

  const recentRows = rows.slice(-70);

  const canPushSignal = (
    type: string,
    minute: number,
    minGapMinutes = SIGNAL_COOLDOWN_MINUTES,
  ) => {
    if (minute < 0) return false;
    return !signals.some((signal) => {
      if (signal.type !== type) return false;
      const signalMinute = timeToMinute(signal.time);
      if (signalMinute < 0) return false;
      return Math.abs(minute - signalMinute) < minGapMinutes;
    });
  };

  const pushSignal = (
    signal: SignalItem,
    minGapMinutes = SIGNAL_COOLDOWN_MINUTES,
  ) => {
    const minute = timeToMinute(signal.time);
    const score = Number(signal.score ?? 0);

    if (score < MIN_SIGNAL_SCORE && signal.strength !== "강") return;
    if (!canPushSignal(signal.type, minute, minGapMinutes)) return;

    signals.push(signal);
  };

  recentRows.forEach((row, index) => {
    if (index === 0) return;

    const prev = recentRows[index - 1];
    const prev2 = index >= 2 ? recentRows[index - 2] : undefined;
    const time = formatTime(row.time);
    const score = marketScore(row);
    const prevScore = marketScore(prev);
    const scoreMove = score - prevScore;
    const kospiMove = Number(row.kospi) - Number(prev.kospi);
    const kosdaqMove = Number(row.kosdaq) - Number(prev.kosdaq);
    const indexMove = kospiMove + kosdaqMove;
    const flowPower = getFlowPower(row);
    const prevFlowPower = getFlowPower(prev);
    const flowMove = flowPower - prevFlowPower;
    const diffMove = Number(row.diff ?? 0) - Number(prev.diff ?? 0);
    const downRatio = Number(row.downRatio ?? 0) * 100;
    const prevDownRatio = Number(prev.downRatio ?? 0) * 100;
    const upTrendDuration = getTrendDuration(recentRows, index, "up");
    const downTrendDuration = getTrendDuration(recentRows, index, "down");

    if (
      isFakeSignal({
        diffMove,
        accel: Number(row.accel ?? 0),
        flowMove,
        downRatio,
        prevDownRatio,
      })
    ) {
      return;
    }

    const upSignalScore = buildSignalScore({
      direction: "up",
      diffMove,
      accel: Number(row.accel ?? 0),
      flowMove,
      flowPower,
      scoreMove,
      indexMove,
      downRatio,
      prevDownRatio,
      trendDuration: upTrendDuration,
    });
    const downSignalScore = buildSignalScore({
      direction: "down",
      diffMove,
      accel: Number(row.accel ?? 0),
      flowMove,
      flowPower,
      scoreMove,
      indexMove,
      downRatio,
      prevDownRatio,
      trendDuration: downTrendDuration,
    });

    if (prev.diff <= 0 && row.diff > 0 && Math.abs(diffMove) >= 70) {
      const signalScore = Math.max(upSignalScore, 4);
      pushSignal(
        {
          time,
          type: "CROSS_UP",
          direction: "상방",
          strength: getStrengthByScore(signalScore),
          message: `Diff 0선 상향 돌파 / 신뢰도 ${getSignalConfidence(signalScore)}% / 현재 ${row.diff}`,
          color: "#22c55e",
          diff: row.diff,
          prevDiff: prev.diff,
          accel: row.accel,
          marketScore: score,
          score: signalScore,
          confidence: getSignalConfidence(signalScore),
          duration: upTrendDuration,
        },
        14,
      );
    }

    if (prev.diff >= 0 && row.diff < 0 && Math.abs(diffMove) >= 70) {
      const signalScore = Math.max(downSignalScore, 4);
      pushSignal(
        {
          time,
          type: "CROSS_DOWN",
          direction: "하방",
          strength: getStrengthByScore(signalScore),
          message: `Diff 0선 하향 이탈 / 신뢰도 ${getSignalConfidence(signalScore)}% / 현재 ${row.diff}`,
          color: "#60a5fa",
          diff: row.diff,
          prevDiff: prev.diff,
          accel: row.accel,
          marketScore: score,
          score: signalScore,
          confidence: getSignalConfidence(signalScore),
          duration: downTrendDuration,
        },
        14,
      );
    }

    if (
      prev.accel <= -40 &&
      row.accel >= 140 &&
      diffMove >= 55 &&
      (!prev2 || Number(prev.diff ?? 0) <= Number(prev2.diff ?? 0))
    ) {
      const signalScore = upSignalScore;
      pushSignal({
        time,
        type: "ACCEL_UP",
        direction: "상방",
        strength: getStrengthByScore(signalScore),
        message: `상승 가속 전환 / 신뢰도 ${getSignalConfidence(signalScore)}% / 가속도 +${row.accel}`,
        color: "#16a34a",
        diff: row.diff,
        prevDiff: prev.diff,
        accel: row.accel,
        marketScore: score,
        score: signalScore,
        confidence: getSignalConfidence(signalScore),
        duration: upTrendDuration,
      });
    }

    if (
      prev.accel >= 40 &&
      row.accel <= -140 &&
      diffMove <= -55 &&
      (!prev2 || Number(prev.diff ?? 0) >= Number(prev2.diff ?? 0))
    ) {
      const signalScore = downSignalScore;
      pushSignal({
        time,
        type: "ACCEL_DOWN",
        direction: "하방",
        strength: getStrengthByScore(signalScore),
        message: `하락 가속 전환 / 신뢰도 ${getSignalConfidence(signalScore)}% / 가속도 ${row.accel}`,
        color: "#38bdf8",
        diff: row.diff,
        prevDiff: prev.diff,
        accel: row.accel,
        marketScore: score,
        score: signalScore,
        confidence: getSignalConfidence(signalScore),
        duration: downTrendDuration,
      });
    }

    if (
      prevScore < 50 &&
      score >= 58 &&
      scoreMove >= 14 &&
      upSignalScore >= 4
    ) {
      const signalScore = Math.max(upSignalScore, score >= 72 ? 6 : 4);
      pushSignal(
        {
          time,
          type: "SCORE_OVERHEAT",
          direction: "상방",
          strength: getStrengthByScore(signalScore),
          message: `시장점수 상승권 진입 / 신뢰도 ${getSignalConfidence(signalScore)}% / ${score}점`,
          color: "#facc15",
          diff: row.diff,
          prevDiff: prev.diff,
          accel: row.accel,
          marketScore: score,
          score: signalScore,
          confidence: getSignalConfidence(signalScore),
          duration: upTrendDuration,
        },
        14,
      );
    }

    if (
      prevScore > -50 &&
      score <= -58 &&
      scoreMove <= -14 &&
      downSignalScore >= 4
    ) {
      const signalScore = Math.max(downSignalScore, score <= -72 ? 6 : 4);
      pushSignal(
        {
          time,
          type: "SCORE_OVERSOLD",
          direction: "하방",
          strength: getStrengthByScore(signalScore),
          message: `시장점수 하락권 진입 / 신뢰도 ${getSignalConfidence(signalScore)}% / ${score}점`,
          color: "#f97316",
          diff: row.diff,
          prevDiff: prev.diff,
          accel: row.accel,
          marketScore: score,
          score: signalScore,
          confidence: getSignalConfidence(signalScore),
          duration: downTrendDuration,
        },
        14,
      );
    }

    const dangerScore =
      (indexMove >= 0.4 ? 1 : 0) +
      (Number(row.diff ?? 0) <= -350 ? 1 : 0) +
      (diffMove <= -45 ? 1 : 0) +
      (flowMove <= -1100 ? 1 : 0) +
      (downRatio >= Math.max(55, prevDownRatio - 0.2) ? 1 : 0) +
      (downTrendDuration >= 2 ? 1 : 0);

    if (dangerScore >= 4) {
      pushSignal(
        {
          time,
          type: "위험 다이버전스",
          direction: "하방",
          strength: getStrengthByScore(dangerScore),
          message: `지수는 버티지만 내부 약세·매도 수급 확대 / 신뢰도 ${getSignalConfidence(dangerScore)}% / Diff ${row.diff}`,
          color: "#ef4444",
          diff: row.diff,
          prevDiff: prev.diff,
          accel: row.accel,
          marketScore: score,
          score: dangerScore,
          confidence: getSignalConfidence(dangerScore),
          duration: downTrendDuration,
        },
        12,
      );
    }

    const accumulationScore =
      (indexMove <= -0.4 ? 1 : 0) +
      (Number(row.diff ?? 0) <= -200 ? 1 : 0) +
      (diffMove >= 45 ? 1 : 0) +
      (flowMove >= 1100 || flowPower >= 1800 ? 1 : 0) +
      (downRatio <= prevDownRatio + 0.4 ? 1 : 0) +
      (upTrendDuration >= 2 ? 1 : 0);

    if (accumulationScore >= 4) {
      pushSignal(
        {
          time,
          type: "매집 다이버전스",
          direction: "상방",
          strength: getStrengthByScore(accumulationScore),
          message: `지수는 약하지만 수급·종목 흐름 개선 / 신뢰도 ${getSignalConfidence(accumulationScore)}% / Diff ${row.diff}`,
          color: "#22c55e",
          diff: row.diff,
          prevDiff: prev.diff,
          accel: row.accel,
          marketScore: score,
          score: accumulationScore,
          confidence: getSignalConfidence(accumulationScore),
          duration: upTrendDuration,
        },
        12,
      );
    }
  });

  return compactSignalList(signals, SIGNAL_COOLDOWN_MINUTES).slice(0, 10);
}

function signalSummary(signals: SignalItem[]) {
  const latest = signals[0];
  const strongCount = signals.filter(
    (signal) => signal.strength === "강",
  ).length;
  const upCount = signals.filter(
    (signal) => signal.direction === "상방",
  ).length;
  const downCount = signals.filter(
    (signal) => signal.direction === "하방",
  ).length;

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

  const highDiffRow = rows.reduce(
    (best, row) =>
      Number(row.diff ?? 0) > Number(best.diff ?? 0) ? row : best,
    rows[0],
  );
  const lowDiffRow = rows.reduce(
    (best, row) =>
      Number(row.diff ?? 0) < Number(best.diff ?? 0) ? row : best,
    rows[0],
  );
  const maxAccelRow = rows.reduce(
    (best, row) =>
      Number(row.accel ?? 0) > Number(best.accel ?? 0) ? row : best,
    rows[0],
  );
  const minAccelRow = rows.reduce(
    (best, row) =>
      Number(row.accel ?? 0) < Number(best.accel ?? 0) ? row : best,
    rows[0],
  );
  const flowPeakRow = rows.reduce(
    (best, row) =>
      Number(row.foreignInstFlowValue ?? 0) >
      Number(best.foreignInstFlowValue ?? 0)
        ? row
        : best,
    rows[0],
  );
  const flowLowRow = rows.reduce(
    (best, row) =>
      Number(row.foreignInstFlowValue ?? 0) <
      Number(best.foreignInstFlowValue ?? 0)
        ? row
        : best,
    rows[0],
  );

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
    accumulationCount: rows.filter(
      (row) => row.divergenceType === "accumulation",
    ).length,
    signalCount: rows.filter((row) => row.signalMarkerColor).length,
    flowPeak: Number(flowPeakRow.foreignInstFlowValue ?? 0),
    flowPeakTime: flowPeakRow.timeLabel ?? "-",
    flowLow: Number(flowLowRow.foreignInstFlowValue ?? 0),
    flowLowTime: flowLowRow.timeLabel ?? "-",
    latestTime: rows[rows.length - 1]?.timeLabel ?? "-",
  };
}

function getActiveLabelFromChartEvent(event: any) {
  const raw = Number(
    event?.activeLabel ?? event?.activePayload?.[0]?.payload?.timeMinuteValue,
  );
  if (!Number.isFinite(raw)) return null;
  return Math.max(
    MARKET_OPEN_MINUTE,
    Math.min(MARKET_CLOSE_MINUTE, Math.round(raw)),
  );
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

function getNowMinute() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function getDataStatusInfo(args: {
  row?: Row & { flowFallback?: boolean; flowDisplaySource?: string };
  selectedDate: string;
}) {
  const { row, selectedDate } = args;
  const nowMinute = getNowMinute();
  const lastMinute = row ? timeToMinute(row.time) : -1;
  const isToday = isTodayDate(selectedDate);
  const isMarketTime = nowMinute >= MARKET_OPEN_MINUTE && nowMinute <= MARKET_CLOSE_MINUTE;
  const isAfterClose = nowMinute > MARKET_CLOSE_MINUTE;
  const delayMinutes = isToday && lastMinute >= 0 ? nowMinute - lastMinute : 0;
  const isDelayed = isToday && isMarketTime && lastMinute >= 0 && delayMinutes >= 3;
  const source = String(row?.flowDisplaySource ?? getFlowSource(row) ?? "LIVE").toUpperCase();
  const isFallback = Boolean(row?.flowFallback) || (source && source !== "LIVE");

  if (!row) {
    return {
      label: "데이터 대기",
      detail: "저장 데이터 없음",
      color: "#94a3b8",
      bg: "rgba(148, 163, 184, 0.12)",
      border: "rgba(148, 163, 184, 0.32)",
      isDelayed: false,
      isFallback: false,
      delayMinutes: 0,
    };
  }

  if (isAfterClose || (!isToday && selectedDate)) {
    return {
      label: "장마감",
      detail: `최종 ${formatTime(row.time)}`,
      color: "#cbd5e1",
      bg: "rgba(148, 163, 184, 0.12)",
      border: "rgba(148, 163, 184, 0.30)",
      isDelayed: false,
      isFallback,
      delayMinutes,
    };
  }

  if (isDelayed) {
    return {
      label: "⚠ 데이터 수집 지연",
      detail: `최근 ${formatTime(row.time)} / 약 ${delayMinutes}분 지연`,
      color: "#facc15",
      bg: "rgba(250, 204, 21, 0.14)",
      border: "rgba(250, 204, 21, 0.42)",
      isDelayed: true,
      isFallback,
      delayMinutes,
    };
  }

  if (isFallback) {
    return {
      label: "수급 보정중",
      detail: `${source || "FALLBACK"} / 직전 정상 수급 표시`,
      color: "#f97316",
      bg: "rgba(249, 115, 22, 0.14)",
      border: "rgba(249, 115, 22, 0.42)",
      isDelayed: false,
      isFallback: true,
      delayMinutes,
    };
  }

  return {
    label: "LIVE 정상",
    detail: `최근 ${formatTime(row.time)} / 수급 LIVE`,
    color: "#22c55e",
    bg: "rgba(34, 197, 94, 0.14)",
    border: "rgba(34, 197, 94, 0.42)",
    isDelayed: false,
    isFallback: false,
    delayMinutes,
  };
}

function getChartDomain(mode: "auto" | "fixed", type: "breadth" | "ratio" | "flow" | "index") {
  if (mode === "auto") return ["auto", "auto"];
  if (type === "breadth") return [-1800, 1800];
  if (type === "ratio") return [0, 80];
  if (type === "flow") return [-1200, 1200];
  return ["auto", "auto"];
}

function downsampleChartRows<
  T extends {
    timeMinuteValue?: number;
    signalMarkerColor?: string;
    divergenceType?: string;
  },
>(data: T[], maxPoints = 520) {
  if (data.length <= maxPoints) return data;

  const keep = new Set<number>();
  const step = Math.ceil(data.length / maxPoints);

  keep.add(0);
  keep.add(data.length - 1);

  data.forEach((row, index) => {
    if (index % step === 0) keep.add(index);
    if (row.signalMarkerColor || row.divergenceType) keep.add(index);
  });

  return Array.from(keep)
    .sort((a, b) => a - b)
    .map((index) => data[index]);
}

function buildEnhancedChartRows(data: any[], signals: SignalItem[]) {
  let lastDangerMinute = -9999;
  let lastAccumulationMinute = -9999;
  let lastSignalMarkerMinute = -9999;

  return data.map((row, index) => {
    const prev = index > 0 ? data[index - 1] : null;
    const prev2 = index > 1 ? data[index - 2] : null;
    const currentMinute = Number(row.timeMinuteValue ?? -1);
    const matchedSignal = signals
      .filter((signal) => {
        const signalMinute = timeToMinute(signal.time);
        if (signalMinute < 0 || currentMinute < 0) return false;
        return Math.abs(signalMinute - currentMinute) <= 1;
      })
      .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))[0];

    const kospiMove = prev
      ? Number(row.kospi ?? 0) - Number(prev.kospi ?? 0)
      : 0;
    const kosdaqMove = prev
      ? Number(row.kosdaq ?? 0) - Number(prev.kosdaq ?? 0)
      : 0;
    const indexMove = kospiMove + kosdaqMove;
    const flowMove = prev
      ? Number(row.foreignInstFlowValue ?? 0) -
        Number(prev.foreignInstFlowValue ?? 0)
      : 0;
    const flowPower = Number(row.foreignInstFlowValue ?? 0);
    const diffMove = prev ? Number(row.diff ?? 0) - Number(prev.diff ?? 0) : 0;
    const prevDiffMove =
      prev && prev2 ? Number(prev.diff ?? 0) - Number(prev2.diff ?? 0) : 0;
    const downRatio = Number(row.downRatioPct ?? 0);
    const prevDownRatio = prev ? Number(prev.downRatioPct ?? 0) : 0;
    const score = Number(row.score ?? 0);
    const prevScore = prev ? Number(prev.score ?? 0) : 0;

    const dangerScore =
      (prev && indexMove >= 0.4 ? 1 : 0) +
      (flowMove <= -1100 ? 1 : 0) +
      (diffMove <= -45 ? 1 : 0) +
      (Number(row.diff ?? 0) <= -350 ? 1 : 0) +
      (downRatio >= Math.max(55, prevDownRatio - 0.2) ? 1 : 0) +
      (score - prevScore <= -8 ? 1 : 0);

    const accumulationScore =
      (prev && indexMove <= -0.4 ? 1 : 0) +
      (flowMove >= 1100 || flowPower >= 1800 ? 1 : 0) +
      (diffMove >= 45 ? 1 : 0) +
      (Number(row.diff ?? 0) <= -200 ? 1 : 0) +
      (prevDiffMove <= 0 || downRatio <= prevDownRatio + 0.4 ? 1 : 0) +
      (score - prevScore >= 8 ? 1 : 0);

    const rawDangerDivergence = Boolean(prev && dangerScore >= 4);
    const rawAccumulationDivergence = Boolean(prev && accumulationScore >= 4);

    const dangerDivergence = Boolean(
      rawDangerDivergence &&
      currentMinute - lastDangerMinute >= SIGNAL_CHART_COOLDOWN_MINUTES,
    );
    const accumulationDivergence = Boolean(
      !dangerDivergence &&
      rawAccumulationDivergence &&
      currentMinute - lastAccumulationMinute >= SIGNAL_CHART_COOLDOWN_MINUTES,
    );

    if (dangerDivergence) lastDangerMinute = currentMinute;
    if (accumulationDivergence) lastAccumulationMinute = currentMinute;

    const canShowSignalMarker = Boolean(
      matchedSignal &&
      currentMinute - lastSignalMarkerMinute >= SIGNAL_CHART_COOLDOWN_MINUTES,
    );

    if (canShowSignalMarker) lastSignalMarkerMinute = currentMinute;

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
      divergenceScore: dangerDivergence
        ? dangerScore
        : accumulationDivergence
          ? accumulationScore
          : 0,
      divergenceLabel: dangerDivergence
        ? `위험 다이버전스 · ${getSignalConfidence(dangerScore)}%`
        : accumulationDivergence
          ? `매집 다이버전스 · ${getSignalConfidence(accumulationScore)}%`
          : "",
      divergenceColor: dangerDivergence
        ? "#ef4444"
        : accumulationDivergence
          ? "#22c55e"
          : "#94a3b8",
      // 차트 SIGNAL 마커는 신호 종류와 관계없이 보라색으로 고정합니다.
      // 위험/매집 마커와 색상이 섞이면 빨간 SIGNAL처럼 보여 혼동됩니다.
      signalMarkerColor: canShowSignalMarker ? "#a78bfa" : "",
      signalMarkerLabel:
        canShowSignalMarker && matchedSignal
          ? getSignalLabel(matchedSignal.type)
          : "",
      signalMarkerDirection: canShowSignalMarker
        ? (matchedSignal?.direction ?? "")
        : "",
      signalMarkerScore: canShowSignalMarker ? (matchedSignal?.score ?? 0) : 0,
      signalMarkerConfidence: canShowSignalMarker
        ? (matchedSignal?.confidence ?? 0)
        : 0,
    };
  });
}

function playSignalBeep() {
  try {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.08,
      audioContext.currentTime + 0.03,
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      audioContext.currentTime + 0.28,
    );

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
  const [showTopDetails, setShowTopDetails] = useState(false);
  const [showRebound, setShowRebound] = useState(true);
  const [showDangerDivergence, setShowDangerDivergence] = useState(true);
  const [showAccumulationDivergence, setShowAccumulationDivergence] =
    useState(true);
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
  const [yAxisMode, setYAxisMode] = useState<"auto" | "fixed">("auto");
  const [showSignalGuide, setShowSignalGuide] = useState(false);
  const [mobileView, setMobileView] = useState<"charts" | "logs">("charts");
  const notifiedSignalRef = useRef<string>("");
  const chartHoverRafRef = useRef<number | null>(null);

  async function loadData(dateValue = selectedDate) {
    const dateQuery = dateValue ? `?date=${dateValue}` : "";

    // Vercel Cron이 /api/market/live를 1분마다 실행해 DB에 저장합니다.
    // 페이지에서는 KIS API를 직접 호출하지 않고 저장된 DB 데이터만 조회합니다.

    const res = await fetch(`/api/market/daily${dateQuery}`, {
      cache: "no-store",
    });
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
        })),
      );
      setSummary(alertJson.summary ?? null);
      setDbSignals(
        (alertJson.signals ?? []).map((signal: any) =>
          normalizeDbSignal(signal),
        ),
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

  useEffect(() => {
    return () => {
      if (chartHoverRafRef.current !== null) {
        cancelAnimationFrame(chartHoverRafRef.current);
      }
    };
  }, []);

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
    const rawRatio =
      rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5;
    const anchorRatio = Math.max(0.05, Math.min(0.95, rawRatio));
    const anchorMinute = start + currentRange * anchorRatio;

    const zoomFactor = event.deltaY < 0 ? 0.82 : 1.22;
    const nextRange = Math.max(
      30,
      Math.min(totalRange, currentRange * zoomFactor),
    );
    const nextStart = anchorMinute - nextRange * anchorRatio;
    const nextEnd = nextStart + nextRange;

    setChartZoomDomain(clampMinuteDomain(nextStart, nextEnd));
  };

  const handleChartMouseMove = (event: any) => {
    const activeMinute = getActiveLabelFromChartEvent(event);

    if (chartHoverRafRef.current !== null) {
      cancelAnimationFrame(chartHoverRafRef.current);
    }

    chartHoverRafRef.current = requestAnimationFrame(() => {
      setHoverMinute((prev) => (prev === activeMinute ? prev : activeMinute));

      if (dragStartMinute !== null && activeMinute !== null) {
        setDragEndMinute((prev) =>
          prev === activeMinute ? prev : activeMinute,
        );
      }
    });
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

  const flowDisplayRows = useMemo(
    () => buildRowsWithFlowFallback(rows),
    [rows],
  );

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
          foreignInstFlowValue:
            Number(r.foreignFlow ?? 0) + Number(r.instFlow ?? 0),
          foreignFlowEokValue: toFlowEok(Number(r.foreignFlow ?? 0)),
          instFlowEokValue: toFlowEok(Number(r.instFlow ?? 0)),
          indivFlowEokValue: toFlowEok(Number(r.indivFlow ?? 0)),
          foreignInstFlowEokValue: toFlowEok(
            Number(r.foreignFlow ?? 0) + Number(r.instFlow ?? 0),
          ),
        };
      }),
    [flowDisplayRows],
  );

  const visibleChartRows = useMemo(
    () =>
      getSessionChartRows(chartRows as any[])
        .filter(
          (row) =>
            row.timeMinuteValue >= MARKET_OPEN_MINUTE &&
            row.timeMinuteValue <= MARKET_CLOSE_MINUTE,
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
          foreignFlowEokValue: clampChartNullable(row.foreignFlowEokValue),
          instFlowEokValue: clampChartNullable(row.instFlowEokValue),
          indivFlowEokValue: clampChartNullable(row.indivFlowEokValue),
          foreignInstFlowEokValue: clampChartNullable(
            row.foreignInstFlowEokValue,
          ),
        })),
    [chartRows],
  );

  const last = flowDisplayRows[flowDisplayRows.length - 1];
  const prevLast =
    flowDisplayRows.length >= 2
      ? flowDisplayRows[flowDisplayRows.length - 2]
      : undefined;
  const latestStatus = useMemo(
    () => getDataStatusInfo({ row: last as any, selectedDate }),
    [last, selectedDate],
  );
  const kospiChange = getIndexChangeInfo(last?.kospi, prevLast?.kospi);
  const kosdaqChange = getIndexChangeInfo(last?.kosdaq, prevLast?.kosdaq);
  const showSessionCloseSummary = Boolean(
    last && (!isTodayDate(selectedDate) || getNowMinute() > MARKET_CLOSE_MINUTE),
  );

  const localAlerts = useMemo(
    () => makeAlerts(flowDisplayRows),
    [flowDisplayRows],
  );
  const sourceAlerts = dbAlerts.length > 0 ? dbAlerts : localAlerts;
  const alerts = useMemo(
    () =>
      alertFilter === "전체"
        ? sourceAlerts.slice(0, 12)
        : sourceAlerts
            .filter((alert) => alert.level === alertFilter)
            .slice(0, 12),
    [alertFilter, sourceAlerts],
  );

  const localSignals = useMemo(
    () => buildSignals(flowDisplayRows),
    [flowDisplayRows],
  );
  const signals = useMemo(
    () =>
      compactSignalList(
        dbSignals.length > 0 ? dbSignals : localSignals,
        SIGNAL_COOLDOWN_MINUTES,
      ).slice(0, 10),
    [dbSignals, localSignals],
  );
  const sigSummary = useMemo(() => signalSummary(signals), [signals]);
  const enhancedChartRowsFull = useMemo(
    () => buildEnhancedChartRows(visibleChartRows, signals),
    [visibleChartRows, signals],
  );
  const enhancedChartRows = useMemo(
    () => downsampleChartRows(enhancedChartRowsFull, 520),
    [enhancedChartRowsFull],
  );
  const latestDivergence = useMemo(
    () =>
      [...enhancedChartRowsFull].reverse().find((row) => row.divergenceType),
    [enhancedChartRowsFull],
  );
  const sessionSummary = useMemo(
    () => buildSessionSummary(enhancedChartRowsFull),
    [enhancedChartRowsFull],
  );
  const latestStrongSignal = useMemo(
    () => signals.find((signal) => signal.strength === "강") ?? signals[0],
    [signals],
  );

  useEffect(() => {
    if (
      !signalNotifyEnabled ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    )
      return;

    const latestDivergenceRow = [...enhancedChartRowsFull]
      .reverse()
      .find((row) => row.divergenceType);
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
            body: `${latestDivergenceRow.timeLabel} / 수급 변화 ${formatFlowEok(latestDivergenceRow.flowMoveValue)}`,
          }
        : null;

    if (!target || notifiedSignalRef.current === target.key) return;
    notifiedSignalRef.current = target.key;
    new Notification(target.title, { body: target.body });
  }, [signalNotifyEnabled, latestStrongSignal, enhancedChartRowsFull]);

  return (
    <div
      className={`daily-page-root ${mobileView === "charts" ? "mobile-charts-active" : "mobile-logs-active"}`}
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
        className="daily-page-header"
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
          <h1 style={{ margin: 0 }}>Baltazza DAILY LOG 1.0ver</h1>
          <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>
            {selectedDate
              ? `${selectedDate} 저장 데이터 조회 중`
              : "오늘 실시간 데이터 조회 중"}
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
          <a
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              border: "1px solid rgba(56, 189, 248, 0.42)",
              background: "rgba(56, 189, 248, 0.08)",
              color: "#bae6fd",
              borderRadius: 999,
              padding: "9px 13px",
              fontSize: 13,
              fontWeight: 900,
              cursor: "pointer",
              textDecoration: "none",
              boxShadow: "0 0 18px rgba(56,189,248,0.12)",
              whiteSpace: "nowrap",
            }}
          >
            <span>📊</span>
            <span>대시보드</span>
          </a>
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

      <div className="daily-mobile-tabbar">
        <button
          onClick={() => setMobileView("charts")}
          className={mobileView === "charts" ? "active" : ""}
        >
          차트보기
        </button>
        <button
          onClick={() => setMobileView("logs")}
          className={mobileView === "logs" ? "active" : ""}
        >
          로그보기
        </button>
      </div>

      {last && (
        <DataStatusStrip status={latestStatus} />
      )}

      {last && (
        <div
          className="daily-summary-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <SummaryCard
            title="시장상태"
            value={marketTone(last)}
            color={last.diff >= 0 ? "#22c55e" : "#60a5fa"}
          />
          <SummaryCard
            title="시장점수"
            value={marketScore(last)}
            color={marketScore(last) >= 0 ? "#22c55e" : "#60a5fa"}
          />
          <SummaryCard
            title="Diff"
            value={last.diff}
            color={last.diff >= 0 ? "#22c55e" : "#60a5fa"}
          />
          <SummaryCard
            title="상승비율"
            value={`${(Number(last.upRatio) * 100).toFixed(2)}%`}
            color="#22c55e"
          />
          <SummaryCard
            title="KOSPI"
            value={`${Number(last.kospi ?? 0).toLocaleString()} ${kospiChange.icon} ${Math.abs(kospiChange.pct).toFixed(2)}%`}
            color={kospiChange.color}
          />
          <SummaryCard
            title="KOSDAQ"
            value={`${Number(last.kosdaq ?? 0).toLocaleString()} ${kosdaqChange.icon} ${Math.abs(kosdaqChange.pct).toFixed(2)}%`}
            color={kosdaqChange.color}
          />
        </div>
      )}

      {last && (
        <div
          className="daily-brief-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 0.85fr)",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              border: "1px solid rgba(56, 189, 248, 0.22)",
              borderRadius: 22,
              padding: 18,
              background:
                "linear-gradient(145deg, rgba(15,23,42,0.88), rgba(2,6,23,0.64))",
              boxShadow: "0 18px 48px rgba(0,0,0,0.28)",
              backdropFilter: "blur(18px)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#93c5fd",
                    fontWeight: 900,
                    marginBottom: 6,
                  }}
                >
                  MARKET BRIEF
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 950,
                    color: sigSummary.color,
                  }}
                >
                  {sigSummary.bias}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 13,
                    color: "#cbd5e1",
                    fontWeight: 800,
                  }}
                >
                  {latestDivergence
                    ? latestDivergence.divergenceLabel
                    : getFlowNarrative(last, prevLast)}
                </div>
              </div>

              <button
                onClick={() => setShowTopDetails((value) => !value)}
                style={{
                  border: "1px solid rgba(56,189,248,0.32)",
                  background: showTopDetails
                    ? "rgba(56,189,248,0.18)"
                    : "rgba(15,23,42,0.72)",
                  color: "#bae6fd",
                  borderRadius: 999,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {showTopDetails ? "상세 접기" : "상세 보기"}
              </button>
            </div>

            <div
              className="daily-flow-metric-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 10,
              }}
            >
              <CompactMetric
                title="외국인"
                value={formatFlowEok(Number(last.foreignFlow ?? 0))}
                color={getFlowColor(Number(last.foreignFlow ?? 0))}
              />
              <CompactMetric
                title="기관"
                value={formatFlowEok(Number(last.instFlow ?? 0))}
                color={getFlowColor(Number(last.instFlow ?? 0))}
              />
              <CompactMetric
                title="개인"
                value={formatFlowEok(Number(last.indivFlow ?? 0))}
                color={getFlowColor(Number(last.indivFlow ?? 0))}
              />
              <CompactMetric
                title="수급합"
                value={formatFlowEok(getFlowPower(last))}
                color={getFlowPower(last) >= 0 ? "#ef4444" : "#60a5fa"}
              />
            </div>
          </div>

          <div
            style={{
              border: "1px solid rgba(148, 163, 184, 0.16)",
              borderRadius: 22,
              padding: 18,
              background:
                "linear-gradient(145deg, rgba(15,23,42,0.88), rgba(30,41,59,0.54))",
              boxShadow: "0 18px 48px rgba(0,0,0,0.28)",
              backdropFilter: "blur(18px)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "#93c5fd",
                fontWeight: 900,
                marginBottom: 12,
              }}
            >
              SIGNAL / FLOW
            </div>
            <div
              className="daily-signal-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 10,
              }}
            >
              <CompactMetric
                title="상방"
                value={sigSummary.upCount}
                color="#22c55e"
              />
              <CompactMetric
                title="하방"
                value={sigSummary.downCount}
                color="#60a5fa"
              />
              <CompactMetric
                title="강함"
                value={sigSummary.strongCount}
                color="#ef4444"
              />
              <CompactMetric
                title="다이버전스"
                value={latestDivergence ? latestDivergence.timeLabel : "-"}
                color={latestDivergence?.divergenceColor ?? "#94a3b8"}
              />
            </div>
          </div>
        </div>
      )}

      {showTopDetails && last && (
        <div
          style={{
            border: "1px solid rgba(148, 163, 184, 0.16)",
            borderRadius: 22,
            padding: 14,
            marginBottom: 20,
            background:
              "linear-gradient(145deg, rgba(15,23,42,0.70), rgba(2,6,23,0.56))",
            boxShadow: "0 14px 34px rgba(0,0,0,0.22)",
            backdropFilter: "blur(16px)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "#94a3b8",
              fontWeight: 900,
              marginBottom: 12,
            }}
          >
            DETAIL METRICS
          </div>
          <div
            className="daily-detail-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <SummaryCard
              title="수급 추세"
              value={formatFlowEok(getFlowTrend(last, prevLast))}
              color={getFlowTrend(last, prevLast) >= 0 ? "#ef4444" : "#60a5fa"}
            />
            <SummaryCard
              title="수급 모멘텀"
              value={formatFlowEok(
                Number(last.flowMomentum ?? getFlowPower(last)),
              )}
              color={
                Number(last.flowMomentum ?? getFlowPower(last)) >= 0
                  ? "#ef4444"
                  : "#60a5fa"
              }
            />
            <SummaryCard
              title="세션 최고 Diff"
              value={`${sessionSummary.highDiff.toLocaleString()} / ${sessionSummary.highDiffTime}`}
              color="#22c55e"
            />
            <SummaryCard
              title="세션 최저 Diff"
              value={`${sessionSummary.lowDiff.toLocaleString()} / ${sessionSummary.lowDiffTime}`}
              color="#60a5fa"
            />
            <SummaryCard
              title="다이버전스"
              value={`위험 ${sessionSummary.dangerCount} / 매집 ${sessionSummary.accumulationCount}`}
              color="#facc15"
            />
            <SummaryCard
              title="수급 범위"
              value={`${formatFlowEok(sessionSummary.flowLow)} ~ ${formatFlowEok(sessionSummary.flowPeak)}`}
              color="#38bdf8"
            />
            <SummaryCard
              title="ALERT"
              value={summary?.total ?? 0}
              color="#facc15"
            />
            <SummaryCard
              title="최근 발생"
              value={latestDivergence?.timeLabel ?? sessionSummary.latestTime}
              color="#e5e7eb"
            />
          </div>
        </div>
      )}

      {showSessionCloseSummary && (
        <SessionCloseSummary
          summary={sessionSummary}
          finalTone={last ? marketTone(last, prevLast) : "-"}
        />
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
          className="daily-log-section daily-table-scroll"
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
          <table
            style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: 0,
            }}
          >
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
              {flowDisplayRows.map((row, index) => {
                const isLatestRow = index === flowDisplayRows.length - 1;
                const isFallbackRow = Boolean((row as any).flowFallback);

                return (
                <tr
                  key={row.id}
                  style={{
                    background: isLatestRow
                      ? "linear-gradient(90deg, rgba(56,189,248,0.22), rgba(15,23,42,0.28))"
                      : index % 2 === 0
                        ? "rgba(15, 23, 42, 0.18)"
                        : "rgba(2, 6, 23, 0.24)",
                    opacity: isFallbackRow ? 0.58 : 1,
                    boxShadow: isLatestRow
                      ? "inset 3px 0 0 #38bdf8, inset 0 1px 0 rgba(56,189,248,0.40), inset 0 -1px 0 rgba(56,189,248,0.24)"
                      : "none",
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
                  <td style={td}>
                    {(Number(row.downRatio) * 100).toFixed(2)}%
                  </td>
                  <IndexCell
                    value={row.kospi}
                    prevValue={flowDisplayRows[index - 1]?.kospi}
                  />
                  <IndexCell
                    value={row.kosdaq}
                    prevValue={flowDisplayRows[index - 1]?.kosdaq}
                  />
                  <td
                    style={{
                      ...td,
                      color:
                        Number(row.foreignFlow ?? 0) >= 0
                          ? "#ef4444"
                          : "#60a5fa",
                    }}
                  >
                    {formatFlowEok(Number(row.foreignFlow ?? 0))}
                  </td>
                  <td
                    style={{
                      ...td,
                      color:
                        Number(row.instFlow ?? 0) >= 0 ? "#ef4444" : "#60a5fa",
                    }}
                  >
                    {formatFlowEok(Number(row.instFlow ?? 0))}
                  </td>
                  <td
                    style={{
                      ...td,
                      color:
                        Number(row.indivFlow ?? 0) >= 0 ? "#ef4444" : "#60a5fa",
                    }}
                  >
                    {formatFlowEok(Number(row.indivFlow ?? 0))}
                  </td>
                  <td
                    style={{
                      ...td,
                      color: getFlowPower(row) >= 0 ? "#ef4444" : "#60a5fa",
                    }}
                  >
                    {formatFlowEok(getFlowPower(row))}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div
          className="daily-chart-section daily-chart-panel"
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
              background:
                "linear-gradient(145deg, rgba(15,23,42,0.82), rgba(2,6,23,0.66))",
              boxShadow: "0 12px 32px rgba(0,0,0,0.30)",
              backdropFilter: "blur(16px)",
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 950, color: "#f8fafc" }}>
                CHART PANEL
              </div>
              <div style={{ marginTop: 3, fontSize: 11, color: "#94a3b8" }}>
                노란점=강한 반등 / 빨강▲=위험 / 초록◆=매집 / 보라◆=SIGNAL / X축
                09:00~15:30
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setShowRebound((v) => !v)}
                style={{
                  border: "1px solid rgba(250,204,21,0.34)",
                  background: showRebound
                    ? "rgba(250,204,21,0.12)"
                    : "rgba(15,23,42,0.88)",
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
                  background: showDangerDivergence
                    ? "rgba(239,68,68,0.12)"
                    : "rgba(15,23,42,0.88)",
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
                  background: showAccumulationDivergence
                    ? "rgba(34,197,94,0.12)"
                    : "rgba(15,23,42,0.88)",
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
                  background: showSignalMarker
                    ? "rgba(168,85,247,0.12)"
                    : "rgba(15,23,42,0.88)",
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
                onClick={() => setYAxisMode((value) => (value === "auto" ? "fixed" : "auto"))}
                style={{
                  border: "1px solid rgba(56,189,248,0.34)",
                  background: yAxisMode === "auto"
                    ? "rgba(56,189,248,0.14)"
                    : "rgba(15,23,42,0.88)",
                  color: yAxisMode === "auto" ? "#bae6fd" : "#94a3b8",
                  borderRadius: 999,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Y축 {yAxisMode === "auto" ? "자동" : "고정"}
              </button>

              <button
                onClick={() => setShowSignalGuide(true)}
                style={{
                  border: "1px solid rgba(168,85,247,0.34)",
                  background: "rgba(168,85,247,0.10)",
                  color: "#e9d5ff",
                  borderRadius: 999,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                기준 보기
              </button>

              <button
                onClick={enableSignalNotification}
                style={{
                  border: "1px solid rgba(250,204,21,0.34)",
                  background: signalNotifyEnabled
                    ? "rgba(250,204,21,0.14)"
                    : "rgba(15,23,42,0.88)",
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
                  background: chartsCollapsed
                    ? "rgba(56,189,248,0.18)"
                    : "rgba(15,23,42,0.88)",
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
                background:
                  "linear-gradient(145deg, rgba(15,23,42,0.82), rgba(2,6,23,0.70))",
                color: "#94a3b8",
                boxShadow: "0 14px 34px rgba(0,0,0,0.24)",
              }}
            >
              차트가 접혀 있습니다. 왼쪽 데이터 확인 시 화면 가림을 줄일 수
              있습니다.
            </div>
          ) : (
            <>
              <MemoMiniChart
                title="1. Net Breadth · 전체 상승-하락 폭"
                data={enhancedChartRows}
                height={220}
                referenceLines={[0]}
                domain={getChartDomain(yAxisMode, "breadth")}
                lines={[{ key: "diff", name: "상승-하락", color: "#facc15" }]}
                showRebound={showRebound}
                showDangerDivergence={showDangerDivergence}
                showAccumulationDivergence={showAccumulationDivergence}
                showSignalMarker={showSignalMarker}
                hoverMinute={hoverMinute}
                onHoverMinuteChange={handleChartMouseMove}
                onHoverLeave={handleChartMouseLeave}
              />

              <MemoMiniChart
                title="2. Breadth Ratio · 상승/하락 비율"
                data={enhancedChartRows}
                height={220}
                referenceLines={[0]}
                domain={getChartDomain(yAxisMode, "ratio")}
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

              <MemoMiniChart
                title="3. Flow · 외국인 / 기관 / 개인 수급"
                data={enhancedChartRows}
                height={240}
                referenceLines={[0]}
                domain={getChartDomain(yAxisMode, "flow")}
                lines={[
                  {
                    key: "foreignFlowEokValue",
                    name: "외국인(억)",
                    color: "#60a5fa",
                  },
                  {
                    key: "instFlowEokValue",
                    name: "기관(억)",
                    color: "#ef4444",
                  },
                  {
                    key: "indivFlowEokValue",
                    name: "개인(억)",
                    color: "#facc15",
                  },
                ]}
                showRebound={showRebound}
                showDangerDivergence={showDangerDivergence}
                showAccumulationDivergence={showAccumulationDivergence}
                showSignalMarker={showSignalMarker}
                hoverMinute={hoverMinute}
                onHoverMinuteChange={handleChartMouseMove}
                onHoverLeave={handleChartMouseLeave}
              />

              <MemoMiniChart
                title="4. KOSPI 지수"
                data={enhancedChartRows}
                height={220}
                referenceLines={[0]}
                domain={getChartDomain(yAxisMode, "index")}
                lines={[{ key: "kospi", name: "KOSPI", color: "#facc15" }]}
                showRebound={showRebound}
                showDangerDivergence={showDangerDivergence}
                showAccumulationDivergence={showAccumulationDivergence}
                showSignalMarker={showSignalMarker}
                hoverMinute={hoverMinute}
                onHoverMinuteChange={handleChartMouseMove}
                onHoverLeave={handleChartMouseLeave}
              />

              <MemoMiniChart
                title="5. KOSDAQ 지수"
                data={enhancedChartRows}
                height={220}
                referenceLines={[0]}
                domain={getChartDomain(yAxisMode, "index")}
                lines={[{ key: "kosdaq", name: "KOSDAQ", color: "#a78bfa" }]}
                showRebound={showRebound}
                showDangerDivergence={showDangerDivergence}
                showAccumulationDivergence={showAccumulationDivergence}
                showSignalMarker={showSignalMarker}
                hoverMinute={hoverMinute}
                onHoverMinuteChange={handleChartMouseMove}
                onHoverLeave={handleChartMouseLeave}
              />

              <AlertBox
                alerts={alerts}
                filter={alertFilter}
                onFilterChange={setAlertFilter}
              />

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
            className="daily-fullscreen-grid"
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
                <div
                  style={{ fontSize: 20, fontWeight: 950, color: "#f8fafc" }}
                >
                  CHART PANEL 전체보기
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: "#94a3b8" }}>
                  반등 {showRebound ? "ON" : "OFF"} / 위험{" "}
                  {showDangerDivergence ? "ON" : "OFF"} / 매집{" "}
                  {showAccumulationDivergence ? "ON" : "OFF"} / SIGNAL{" "}
                  {showSignalMarker ? "ON" : "OFF"}
                  <span style={{ color: "#38bdf8", marginLeft: 10 }}>
                    휠 확대 {minuteToTimeLabel(chartZoomDomain[0])}~
                    {minuteToTimeLabel(chartZoomDomain[1])}
                  </span>
                  <span style={{ color: "#facc15", marginLeft: 10 }}>
                    드래그 확대 가능
                  </span>
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

            <MemoMiniChart
              title="1. Net Breadth · 전체 상승-하락 폭"
              data={enhancedChartRows}
              height={320}
              referenceLines={[0]}
              domain={getChartDomain(yAxisMode, "breadth")}
              lines={[{ key: "diff", name: "상승-하락", color: "#facc15" }]}
              showRebound={showRebound}
              showDangerDivergence={showDangerDivergence}
              showAccumulationDivergence={showAccumulationDivergence}
              showSignalMarker={showSignalMarker}
              xDomain={chartZoomDomain}
              onChartWheel={handleFullscreenChartWheel}
              hoverMinute={hoverMinute}
              onHoverMinuteChange={handleChartMouseMove}
              onHoverLeave={handleChartMouseLeave}
              onChartDragStart={handleChartDragStart}
              onChartDragEnd={handleChartDragEnd}
              dragStartMinute={dragStartMinute}
              dragEndMinute={dragEndMinute}
            />
            <MemoMiniChart
              title="2. Breadth Ratio · 상승/하락 비율"
              data={enhancedChartRows}
              height={320}
              referenceLines={[0]}
              domain={getChartDomain(yAxisMode, "ratio")}
              lines={[
                { key: "upRatioPct", name: "상승비율", color: "#ef4444" },
                { key: "downRatioPct", name: "하락비율", color: "#60a5fa" },
              ]}
              showRebound={showRebound}
              showDangerDivergence={showDangerDivergence}
              showAccumulationDivergence={showAccumulationDivergence}
              showSignalMarker={showSignalMarker}
              xDomain={chartZoomDomain}
              onChartWheel={handleFullscreenChartWheel}
              hoverMinute={hoverMinute}
              onHoverMinuteChange={handleChartMouseMove}
              onHoverLeave={handleChartMouseLeave}
              onChartDragStart={handleChartDragStart}
              onChartDragEnd={handleChartDragEnd}
              dragStartMinute={dragStartMinute}
              dragEndMinute={dragEndMinute}
            />
            <div style={{ gridColumn: "1 / -1" }}>
              <MemoMiniChart
                title="3. Flow · 외국인 / 기관 / 개인 수급"
                data={enhancedChartRows}
                height={340}
                referenceLines={[0]}
                domain={getChartDomain(yAxisMode, "flow")}
                lines={[
                  {
                    key: "foreignFlowEokValue",
                    name: "외국인(억)",
                    color: "#60a5fa",
                  },
                  {
                    key: "instFlowEokValue",
                    name: "기관(억)",
                    color: "#ef4444",
                  },
                  {
                    key: "indivFlowEokValue",
                    name: "개인(억)",
                    color: "#facc15",
                  },
                ]}
                showRebound={showRebound}
                showDangerDivergence={showDangerDivergence}
                showAccumulationDivergence={showAccumulationDivergence}
                showSignalMarker={showSignalMarker}
                xDomain={chartZoomDomain}
                onChartWheel={handleFullscreenChartWheel}
                hoverMinute={hoverMinute}
                onHoverMinuteChange={handleChartMouseMove}
                onHoverLeave={handleChartMouseLeave}
                onChartDragStart={handleChartDragStart}
                onChartDragEnd={handleChartDragEnd}
                dragStartMinute={dragStartMinute}
                dragEndMinute={dragEndMinute}
              />
            </div>
            <MemoMiniChart
              title="4. KOSPI 지수"
              data={enhancedChartRows}
              height={320}
              referenceLines={[0]}
              domain={getChartDomain(yAxisMode, "index")}
              lines={[{ key: "kospi", name: "KOSPI", color: "#22c55e" }]}
              showRebound={showRebound}
              showDangerDivergence={showDangerDivergence}
              showAccumulationDivergence={showAccumulationDivergence}
              showSignalMarker={showSignalMarker}
              xDomain={chartZoomDomain}
              onChartWheel={handleFullscreenChartWheel}
              hoverMinute={hoverMinute}
              onHoverMinuteChange={handleChartMouseMove}
              onHoverLeave={handleChartMouseLeave}
              onChartDragStart={handleChartDragStart}
              onChartDragEnd={handleChartDragEnd}
              dragStartMinute={dragStartMinute}
              dragEndMinute={dragEndMinute}
            />
            <MemoMiniChart
              title="5. KOSDAQ 지수"
              data={enhancedChartRows}
              height={320}
              referenceLines={[0]}
              domain={getChartDomain(yAxisMode, "index")}
              lines={[{ key: "kosdaq", name: "KOSDAQ", color: "#a78bfa" }]}
              showRebound={showRebound}
              showDangerDivergence={showDangerDivergence}
              showAccumulationDivergence={showAccumulationDivergence}
              showSignalMarker={showSignalMarker}
              xDomain={chartZoomDomain}
              onChartWheel={handleFullscreenChartWheel}
              hoverMinute={hoverMinute}
              onHoverMinuteChange={handleChartMouseMove}
              onHoverLeave={handleChartMouseLeave}
              onChartDragStart={handleChartDragStart}
              onChartDragEnd={handleChartDragEnd}
              dragStartMinute={dragStartMinute}
              dragEndMinute={dragEndMinute}
            />
          </div>
        </div>
      )}

      {showSignalGuide && (
        <SignalGuideModal onClose={() => setShowSignalGuide(false)} />
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

        .daily-mobile-tabbar {
          display: none;
        }

        .daily-mobile-tabbar button {
          border: 1px solid rgba(56, 189, 248, 0.28);
          background: rgba(15, 23, 42, 0.72);
          color: #94a3b8;
          border-radius: 999px;
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 950;
          cursor: pointer;
        }

        .daily-mobile-tabbar button.active {
          background: rgba(56, 189, 248, 0.18);
          color: #bae6fd;
          box-shadow: 0 0 18px rgba(56, 189, 248, 0.18);
        }

        @media (max-width: 760px) {
          .daily-summary-card {
            padding: 14px !important;
            border-radius: 16px !important;
            min-height: 104px !important;
            overflow: hidden !important;
          }

          .daily-summary-card > div:first-child {
            font-size: 12px !important;
            margin-bottom: 8px !important;
            word-break: keep-all !important;
          }

          .daily-summary-card > div:last-child {
            font-size: clamp(24px, 8vw, 36px) !important;
            line-height: 1.12 !important;
            word-break: keep-all !important;
            overflow-wrap: anywhere !important;
          }

          .daily-compact-metric {
            padding: 12px !important;
            min-height: 74px !important;
          }

          .daily-compact-metric > div:last-child {
            font-size: clamp(18px, 5.8vw, 24px) !important;
          }
        }

        .chart-box-header {
          position: relative;
        }

        .chart-header-legend button:hover {
          transform: translateY(-1px);
          border-color: rgba(226, 232, 240, 0.34) !important;
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

        @media (max-width: 760px) {
          html,
          body {
            overflow-x: hidden;
          }

          .daily-page-root {
            padding: calc(12px + env(safe-area-inset-top)) 10px 16px !important;
            min-width: 0 !important;
          }

          .daily-page-header {
            display: block !important;
            margin-bottom: 14px !important;
            padding-top: 2px !important;
          }

          .daily-page-header h1 {
            font-size: 21px !important;
            line-height: 1.2 !important;
            max-width: calc(100vw - 24px) !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
          }

          .daily-floating-date {
            position: static !important;
            top: auto !important;
            right: auto !important;
            transform: none !important;
            transform-origin: initial !important;
            width: 100% !important;
            margin-top: 12px !important;
            padding: 5px !important;
            display: grid !important;
            grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr) !important;
            gap: 8px !important;
            border-radius: 22px !important;
            z-index: 30 !important;
          }

          .daily-floating-date a,
          .daily-floating-date button,
          .daily-floating-date label {
            width: 100% !important;
            min-width: 0 !important;
            justify-content: center !important;
            padding: 10px 8px !important;
            font-size: 12px !important;
            box-sizing: border-box !important;
          }

          .daily-floating-date label {
            gap: 5px !important;
          }

          .daily-floating-date label span {
            white-space: normal !important;
            line-height: 1.1 !important;
          }

          .daily-floating-date input {
            width: 92px !important;
            min-width: 92px !important;
            font-size: 12px !important;
          }

          .daily-summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 10px !important;
            margin-bottom: 12px !important;
          }

          .daily-brief-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }

          .daily-flow-metric-grid,
          .daily-signal-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .daily-detail-grid {
            grid-template-columns: 1fr !important;
          }

          .daily-mobile-tabbar {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
            margin: 0 0 12px;
            position: sticky;
            top: 8px;
            z-index: 75;
          }

          .mobile-charts-active .daily-log-section {
            display: none !important;
          }

          .mobile-logs-active .daily-chart-section {
            display: none !important;
          }

          .daily-main-layout {
            grid-template-columns: 1fr !important;
            gap: 14px !important;
          }

          .daily-table-scroll {
            max-height: 65vh !important;
            width: 100% !important;
            border-radius: 18px !important;
            -webkit-overflow-scrolling: touch;
          }

          .daily-table-scroll table {
            width: max-content !important;
            min-width: 1180px !important;
          }

          .daily-table-scroll th {
            padding: 10px 9px !important;
            font-size: 12px !important;
          }

          .daily-table-scroll td {
            padding: 10px 9px !important;
            font-size: 12px !important;
          }

          .daily-chart-panel {
            position: relative !important;
            top: auto !important;
            gap: 12px !important;
          }

          .daily-chart-panel > div:first-child {
            display: block !important;
            padding: 12px !important;
            border-radius: 18px !important;
          }

          .daily-chart-panel > div:first-child > div:last-child {
            justify-content: flex-start !important;
            margin-top: 10px !important;
          }

          .chart-box-header {
            align-items: flex-start !important;
            flex-direction: column !important;
            gap: 9px !important;
          }

          .chart-header-legend {
            max-width: 100% !important;
            justify-content: flex-start !important;
            gap: 7px !important;
          }

          .chart-header-legend button {
            padding: 6px 9px !important;
            font-size: 10.5px !important;
          }

          .recharts-responsive-container {
            min-width: 0 !important;
          }

          .daily-fullscreen-grid {
            grid-template-columns: 1fr !important;
            padding: 0 !important;
          }
        }

        @media (max-width: 420px) {
          .daily-summary-grid {
            grid-template-columns: 1fr 1fr !important;
          }

          .daily-flow-metric-grid {
            grid-template-columns: 1fr 1fr !important;
          }

          .daily-floating-date {
            grid-template-columns: 1fr 1fr !important;
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

function ChartLegend({
  items,
  hiddenLineKeys = [],
  onToggleLine,
}: {
  items: ChartLineConfig[];
  hiddenLineKeys?: string[];
  onToggleLine?: (key: string) => void;
}) {
  if (!items.length) return null;

  return (
    <div
      className="chart-header-legend"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 8,
        flexWrap: "wrap",
        maxWidth: "72%",
        flex: "0 0 auto",
        pointerEvents: "auto",
      }}
    >
      {items.map((item) => {
        const isHidden = hiddenLineKeys.includes(item.key);

        return (
          <button
            key={`${item.key}-${item.name}`}
            type="button"
            onClick={() => onToggleLine?.(item.key)}
            title={`${item.name} ${isHidden ? "다시 표시" : "숨기기"}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              borderRadius: 999,
              border: isHidden
                ? "1px solid rgba(100, 116, 139, 0.24)"
                : "1px solid rgba(148, 163, 184, 0.24)",
              background: isHidden
                ? "linear-gradient(145deg, rgba(15,23,42,0.54), rgba(2,6,23,0.44))"
                : "linear-gradient(145deg, rgba(2,6,23,0.72), rgba(15,23,42,0.54))",
              backdropFilter: "blur(12px)",
              boxShadow: isHidden
                ? "inset 0 1px 0 rgba(255,255,255,0.03)"
                : "0 10px 24px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.06)",
              color: isHidden ? "#64748b" : "#e5e7eb",
              fontSize: 11,
              fontWeight: 950,
              lineHeight: 1,
              whiteSpace: "nowrap",
              cursor: "pointer",
              opacity: isHidden ? 0.52 : 1,
              transition:
                "opacity 0.16s ease, transform 0.16s ease, border-color 0.16s ease, color 0.16s ease",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: isHidden ? "#475569" : item.color,
                boxShadow: isHidden ? "none" : `0 0 12px ${item.color}99`,
                display: "inline-block",
                flex: "0 0 auto",
              }}
            />
            <span>{item.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function ModernTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;

  const displayLabel =
    typeof label === "number" ? minuteToTimeLabel(label) : label;
  const cleanPayload = payload.reduce((acc: any[], item: any) => {
    const dataKey = String(item?.dataKey ?? "");
    const name = String(item?.name ?? "");

    // Area와 Line이 같은 dataKey를 함께 쓰면서 Area 쪽 원본 key가
    // tooltip에 foreignFlowEokValue처럼 노출되는 것을 제거합니다.
    if (!dataKey || !name || name === dataKey) return acc;
    if (acc.some((prev) => String(prev?.dataKey ?? "") === dataKey)) return acc;

    acc.push(item);
    return acc;
  }, []);

  if (cleanPayload.length === 0) return null;

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
      <div
        style={{
          fontSize: 11,
          color: "#94a3b8",
          marginBottom: 7,
          fontWeight: 800,
        }}
      >
        {displayLabel}
      </div>
      {cleanPayload.map((item: any) => (
        <div
          key={`${item.name}-${item.dataKey}`}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            fontSize: 12,
            lineHeight: 1.7,
          }}
        >
          <span style={{ color: item.color, fontWeight: 800 }}>
            {item.name}
          </span>
          <strong style={{ color: "#f8fafc", fontWeight: 900 }}>
            {String(item.dataKey ?? "").includes("Eok")
              ? `${Number(item.value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}억`
              : Number(item.value ?? 0).toLocaleString()}
          </strong>
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
  showSignalMarker: boolean,
) {
  const { cx, cy, payload, index } = props;

  if (cx === undefined || cy === undefined || !payload) return null;

  if (isPrimaryLine && payload.divergenceType) {
    const isDanger = payload.divergenceType === "danger";
    const shouldShowDivergence = isDanger
      ? showDangerDivergence
      : showAccumulationDivergence;

    if (shouldShowDivergence) {
      const color = isDanger ? "#ef4444" : "#22c55e";

      if (isDanger) {
        return (
          <g>
            <circle cx={cx} cy={cy} r={8.5} fill={color} opacity={0.14} />
            <path
              d={`M ${cx} ${cy - 6.2} L ${cx + 6.2} ${cy + 5.2} L ${cx - 6.2} ${cy + 5.2} Z`}
              fill="rgba(2, 6, 23, 0.96)"
              stroke={color}
              strokeWidth={1.8}
            />
            <circle cx={cx} cy={cy + 1.2} r={1.45} fill={color} />
          </g>
        );
      }

      return (
        <g>
          <circle cx={cx} cy={cy} r={8.5} fill={color} opacity={0.14} />
          <path
            d={`M ${cx} ${cy - 6.2} L ${cx + 6.2} ${cy} L ${cx} ${cy + 6.2} L ${cx - 6.2} ${cy} Z`}
            fill="rgba(2, 6, 23, 0.96)"
            stroke={color}
            strokeWidth={1.8}
          />
          <circle cx={cx} cy={cy} r={1.55} fill={color} />
        </g>
      );
    }
  }

  if (isPrimaryLine && showSignalMarker && payload.signalMarkerColor) {
    const color = payload.signalMarkerColor;
    const markerScore = Number(payload.signalMarkerScore ?? 0);
    const outerRadius = markerScore >= 6 ? 7.2 : 6.2;

    return (
      <g>
        <circle
          cx={cx}
          cy={cy}
          r={outerRadius + 3}
          fill={color}
          opacity={0.14}
        />
        <circle
          cx={cx}
          cy={cy}
          r={outerRadius}
          fill="rgba(2, 6, 23, 0.96)"
          stroke={color}
          strokeWidth={2}
        />
        <path
          d={`M ${cx} ${cy - 3.4} L ${cx + 3.4} ${cy} L ${cx} ${cy + 3.4} L ${cx - 3.4} ${cy} Z`}
          fill={color}
        />
      </g>
    );
  }

  // 반등 노란점은 Net Breadth(diff) 기준의 강한 반등만 표시합니다.
  // 비율/수급/지수 차트까지 반등점을 찍으면 노이즈가 커져서, SIGNAL/위험/매집과 분리합니다.
  if (!showRebound || !isPrimaryLine || dataKey !== "diff") return null;

  if (index < 2) return null;

  const prev = Number(data[index - 1]?.[dataKey]);
  const prev2 = Number(data[index - 2]?.[dataKey]);
  const curr = Number(payload[dataKey]);

  if (
    !Number.isFinite(prev) ||
    !Number.isFinite(prev2) ||
    !Number.isFinite(curr)
  ) {
    return null;
  }

  const currentMinute = Number(payload.timeMinuteValue ?? -1);
  const currentDiff = Number(payload.diff ?? curr);
  const currentAccel = Number(payload.accel ?? 0);
  const currentDownRatio = Number(payload.downRatioPct ?? 0);
  const prevDownRatio = Number(
    data[index - 1]?.downRatioPct ?? currentDownRatio,
  );

  const isValidReboundAt = (rowIndex: number) => {
    if (rowIndex < 2) return false;

    const row = data[rowIndex];
    const rowPrev = Number(data[rowIndex - 1]?.[dataKey]);
    const rowPrev2 = Number(data[rowIndex - 2]?.[dataKey]);
    const rowCurr = Number(row?.[dataKey]);

    if (
      !Number.isFinite(rowPrev) ||
      !Number.isFinite(rowPrev2) ||
      !Number.isFinite(rowCurr)
    ) {
      return false;
    }

    const rowDiff = Number(row?.diff ?? rowCurr);
    const rowAccel = Number(row?.accel ?? 0);
    const rowDownRatio = Number(row?.downRatioPct ?? 0);
    const rowPrevDownRatio = Number(
      data[rowIndex - 1]?.downRatioPct ?? rowDownRatio,
    );
    const rowReboundStrength = rowCurr - rowPrev;
    const rowDropStrength = rowPrev2 - rowPrev;
    const rowReboundThreshold = Math.max(80, Math.abs(rowPrev) * 0.025);
    const rowDropThreshold = Math.max(120, Math.abs(rowPrev2) * 0.02);

    return (
      rowDiff <= -400 &&
      rowPrev < rowPrev2 &&
      rowCurr > rowPrev &&
      rowReboundStrength >= rowReboundThreshold &&
      rowDropStrength >= rowDropThreshold &&
      (rowAccel >= 40 || rowReboundStrength >= 130) &&
      rowDownRatio <= rowPrevDownRatio - 0.1
    );
  };

  const previousReboundTooClose = data.some((row, rowIndex) => {
    if (rowIndex >= index) return false;
    const rowMinute = Number(row?.timeMinuteValue ?? -1);
    if (currentMinute < 0 || rowMinute < 0) return false;
    if (currentMinute - rowMinute > REBOUND_MARKER_COOLDOWN_MINUTES)
      return false;

    return isValidReboundAt(rowIndex);
  });

  const reboundStrength = curr - prev;
  const dropStrength = prev2 - prev;
  const reboundThreshold = Math.max(80, Math.abs(prev) * 0.025);
  const dropThreshold = Math.max(120, Math.abs(prev2) * 0.02);

  if (
    !previousReboundTooClose &&
    currentDiff <= -400 &&
    prev < prev2 &&
    curr > prev &&
    reboundStrength >= reboundThreshold &&
    dropStrength >= dropThreshold &&
    (currentAccel >= 40 || reboundStrength >= 130) &&
    currentDownRatio <= prevDownRatio - 0.1
  ) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={7} fill="#facc15" opacity={0.16} />
        <circle
          cx={cx}
          cy={cy}
          r={3.7}
          fill="#facc15"
          stroke="rgba(2, 6, 23, 0.95)"
          strokeWidth={1.15}
        />
      </g>
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
  const isMobile = useIsMobile();
  const activeXDomain: [number, number] = xDomain ?? [
    MARKET_OPEN_MINUTE,
    MARKET_CLOSE_MINUTE,
  ];
  const baseXTicks = getTicksForDomain(activeXDomain);
  const activeXTicks = isMobile
    ? baseXTicks.filter(
        (tick) => tick % 60 === 0 || tick === MARKET_CLOSE_MINUTE,
      )
    : baseXTicks;

  const [hiddenLineKeys, setHiddenLineKeys] = useState<string[]>([]);

  const visibleLines = useMemo(
    () => lines.filter((line) => !hiddenLineKeys.includes(line.key)),
    [lines, hiddenLineKeys],
  );

  const toggleLine = (key: string) => {
    setHiddenLineKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  };

  return (
    <ChartBox
      title={title}
      legend={lines}
      hiddenLineKeys={hiddenLineKeys}
      onToggleLine={toggleLine}
    >
      <div
        onWheel={onChartWheel}
        style={{
          position: "relative",
          cursor: onChartWheel ? "zoom-in" : "default",
          touchAction: onChartWheel ? "none" : "auto",
          transform: "translate3d(0, 0, 0)",
          willChange: "transform",
          backfaceVisibility: "hidden",
          contain: "layout paint style",
        }}
        title={
          onChartWheel
            ? "마우스 휠로 시간축을 확대/축소할 수 있습니다"
            : undefined
        }
      >
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart
            data={data}
            margin={
              isMobile
                ? { top: 12, right: 8, left: 0, bottom: 0 }
                : { top: 12, right: 22, left: 20, bottom: 0 }
            }
            onMouseMove={onHoverMinuteChange}
            onMouseLeave={onHoverLeave}
            onMouseDown={onChartDragStart}
            onMouseUp={onChartDragEnd}
          >
            <defs>
              {visibleLines.map((line) => (
                <linearGradient
                  key={`gradient-${line.key}`}
                  id={`areaGradient-${chartId}-${line.key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor={line.color} stopOpacity={0.3} />
                  <stop offset="55%" stopColor={line.color} stopOpacity={0.1} />
                  <stop
                    offset="100%"
                    stopColor={line.color}
                    stopOpacity={0.02}
                  />
                </linearGradient>
              ))}
              <filter
                id={`chartGlow-${chartId}`}
                x="-30%"
                y="-30%"
                width="160%"
                height="160%"
              >
                <feGaussianBlur stdDeviation="2.3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid
              stroke="rgba(148, 163, 184, 0.11)"
              vertical={false}
              strokeDasharray="3 8"
            />
            <XAxis
              dataKey="timeMinuteValue"
              type="number"
              domain={activeXDomain}
              ticks={activeXTicks}
              tickFormatter={minuteToTimeLabel}
              interval={0}
              allowDataOverflow
              stroke="rgba(203, 213, 225, 0.62)"
              fontSize={isMobile ? 9 : 10}
              tickLine={false}
              axisLine={{ stroke: "rgba(148, 163, 184, 0.18)" }}
            />
            <YAxis
              stroke="rgba(203, 213, 225, 0.62)"
              fontSize={isMobile ? 9 : 10}
              tickLine={false}
              axisLine={false}
              width={isMobile ? 46 : 62}
              domain={domain ?? ["auto", "auto"]}
              tickMargin={8}
            />
            <Tooltip content={<ModernTooltip />} />
            {referenceLines.map((value) => (
              <ReferenceLine
                key={value}
                y={value}
                stroke={
                  value === 0
                    ? "rgba(226, 232, 240, 0.38)"
                    : "rgba(148, 163, 184, 0.22)"
                }
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
            {dragStartMinute !== null &&
              dragEndMinute !== null &&
              Math.abs(Number(dragEndMinute) - Number(dragStartMinute)) > 1 && (
                <ReferenceArea
                  x1={Math.min(Number(dragStartMinute), Number(dragEndMinute))}
                  x2={Math.max(Number(dragStartMinute), Number(dragEndMinute))}
                  strokeOpacity={0.25}
                  fill="rgba(56, 189, 248, 0.18)"
                  ifOverflow="hidden"
                />
              )}
            {visibleLines.map((line) => (
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
            {visibleLines.map((line) => {
              const originalLineIndex = lines.findIndex(
                (item) => item.key === line.key,
              );

              return (
                <Line
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  name={line.name}
                  stroke={line.color}
                  strokeWidth={originalLineIndex === 0 ? 2.2 : 1.85}
                  filter={
                    originalLineIndex === 0
                      ? `url(#chartGlow-${chartId})`
                      : undefined
                  }
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={(props) =>
                    chartMarkerDot(
                      props,
                      data,
                      line.key,
                      originalLineIndex === 0,
                      showRebound,
                      showDangerDivergence,
                      showAccumulationDivergence,
                      showSignalMarker,
                    )
                  }
                  activeDot={{
                    r: 4.6,
                    strokeWidth: 1.6,
                    stroke: "rgba(255,255,255,0.9)",
                    fill: line.color,
                  }}
                  isAnimationActive={false}
                  connectNulls
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartBox>
  );
}

const MemoMiniChart = memo(MiniChart);

function CompactMetric({
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
      className="daily-compact-metric"
      style={{
        minHeight: 64,
        border: "1px solid rgba(148, 163, 184, 0.14)",
        borderRadius: 16,
        padding: "10px 12px",
        background: "rgba(15, 23, 42, 0.46)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#94a3b8",
          marginBottom: 6,
          fontWeight: 800,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 950,
          color,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
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
      className="daily-summary-card"
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
      <div
        style={{
          fontSize: 12,
          color: "#93c5fd",
          marginBottom: 10,
          fontWeight: 800,
          letterSpacing: 0.2,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 950,
          color,
          textShadow: "0 0 18px rgba(255,255,255,0.10)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ChartBox({
  title,
  legend = [],
  hiddenLineKeys = [],
  onToggleLine,
  children,
}: {
  title: string;
  legend?: ChartLineConfig[];
  hiddenLineKeys?: string[];
  onToggleLine?: (key: string) => void;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: "relative",
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
      <div
        className="chart-box-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
          minHeight: 26,
        }}
      >
        <h3
          style={{
            fontSize: 13,
            color: "#e5e7eb",
            margin: 0,
            fontWeight: 900,
            letterSpacing: 0.15,
            minWidth: 0,
            lineHeight: 1.35,
          }}
        >
          {title}
        </h3>
        <ChartLegend
          items={legend}
          hiddenLineKeys={hiddenLineKeys}
          onToggleLine={onToggleLine}
        />
      </div>
      {children}
    </div>
  );
}

function FlowStatusPanel({ row, prev }: { row: Row; prev?: Row }) {
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
          <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 5 }}>
            FLOW STATUS
          </div>
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
        <FlowMiniCard
          title="강도"
          value={getFlowStrength(power)}
          textColor={badge.color}
        />
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
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: strong ? 19 : 16, fontWeight: 900, color }}>
        {isNumber ? formatFlowEok(value) : value}
      </div>
      {isNumber && (
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
          {getFlowDirection(value)}
        </div>
      )}
    </div>
  );
}

function IndexCell({
  value,
  prevValue,
}: {
  value: number;
  prevValue?: number;
}) {
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
          {info.icon} {Math.abs(info.diff).toFixed(2)} (
          {info.pct >= 0 ? "+" : "-"}
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
        <h3 style={{ fontSize: 14, color: "#cbd5e1", margin: 0 }}>ALERT</h3>

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
                <span
                  style={{
                    color: getAlertColor(alert.level, alert.color),
                    fontWeight: 800,
                  }}
                >
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
                  {typeof alert.marketScore === "number"
                    ? `점수 ${alert.marketScore}`
                    : ""}
                  {typeof alert.diff === "number"
                    ? ` / 차이 ${alert.diff}`
                    : ""}
                  {typeof alert.accel === "number"
                    ? ` / 가속 ${alert.accel}`
                    : ""}
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
  const confidence = Number(signal.confidence ?? 0);
  const score = Number(signal.score ?? 0);

  if (signal.strength === "강") return true;
  if (confidence >= 58 || score >= 4) return true;

  if (signal.type === "CROSS_UP" || signal.type === "CROSS_DOWN")
    return score >= 4;

  if (signal.type === "ACCEL_UP" || signal.type === "ACCEL_DOWN") {
    return Math.abs(Number(signal.accel ?? 0)) >= 180 && score >= 4;
  }

  if (signal.type === "SCORE_OVERHEAT" || signal.type === "SCORE_OVERSOLD") {
    return confidence >= 58;
  }

  if (signal.type.includes("다이버전스")) return confidence >= 58;

  return false;
}

function SignalBox({ signals }: { signals: SignalItem[] }) {
  const filteredSignals = useMemo(
    () => signals.filter(isRecentStrongSignal).slice(0, 10),
    [signals],
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
          현재 표시할 강한 SIGNAL 없음
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
                diff {signal.diff ?? "-"} / accel {signal.accel ?? "-"} / market{" "}
                {signal.marketScore ?? "-"}
                {typeof signal.confidence === "number"
                  ? ` / 신뢰도 ${signal.confidence}%`
                  : ""}
                {typeof signal.score === "number"
                  ? ` / score ${signal.score}`
                  : ""}
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


function DataStatusStrip({
  status,
}: {
  status: ReturnType<typeof getDataStatusInfo>;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        marginBottom: 14,
        border: `1px solid ${status.border}`,
        borderRadius: 18,
        padding: "12px 14px",
        background: status.bg,
        boxShadow: "0 14px 34px rgba(0,0,0,0.22)",
        backdropFilter: "blur(16px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: status.color,
            boxShadow: `0 0 16px ${status.color}99`,
            display: "inline-block",
          }}
        />
        <strong style={{ color: status.color, fontSize: 14, fontWeight: 950 }}>
          {status.label}
        </strong>
      </div>
      <div
        style={{
          color: "#cbd5e1",
          fontSize: 12,
          fontWeight: 800,
          textAlign: "right",
        }}
      >
        {status.detail}
      </div>
    </div>
  );
}

function SessionCloseSummary({
  summary,
  finalTone,
}: {
  summary: ReturnType<typeof buildSessionSummary>;
  finalTone: string;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(250, 204, 21, 0.26)",
        borderRadius: 22,
        padding: 16,
        marginBottom: 20,
        background:
          "linear-gradient(145deg, rgba(30,41,59,0.82), rgba(15,23,42,0.66))",
        boxShadow: "0 18px 44px rgba(0,0,0,0.28)",
        backdropFilter: "blur(18px)",
      }}
    >
      <div style={{ fontSize: 13, color: "#fde68a", fontWeight: 950, marginBottom: 12 }}>
        SESSION CLOSE SUMMARY
      </div>
      <div
        className="daily-detail-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        <CompactMetric
          title="오늘 최고 Diff"
          value={`${summary.highDiff.toLocaleString()} / ${summary.highDiffTime}`}
          color="#22c55e"
        />
        <CompactMetric
          title="오늘 최저 Diff"
          value={`${summary.lowDiff.toLocaleString()} / ${summary.lowDiffTime}`}
          color="#60a5fa"
        />
        <CompactMetric
          title="위험/매집 횟수"
          value={`위험 ${summary.dangerCount} / 매집 ${summary.accumulationCount}`}
          color="#facc15"
        />
        <CompactMetric
          title="수급 최고·최저"
          value={`${formatFlowEok(summary.flowLow)} ~ ${formatFlowEok(summary.flowPeak)}`}
          color="#38bdf8"
        />
        <CompactMetric
          title="최종 시장판단"
          value={finalTone}
          color="#e5e7eb"
        />
        <CompactMetric
          title="최대 가속"
          value={`${summary.maxAccel.toLocaleString()} / ${summary.maxAccelTime}`}
          color="#f97316"
        />
        <CompactMetric
          title="최소 가속"
          value={`${summary.minAccel.toLocaleString()} / ${summary.minAccelTime}`}
          color="#a78bfa"
        />
        <CompactMetric
          title="최종 시간"
          value={summary.latestTime}
          color="#cbd5e1"
        />
      </div>
    </div>
  );
}

function SignalGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(2, 6, 23, 0.82)",
        backdropFilter: "blur(16px)",
        padding: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(820px, 100%)",
          maxHeight: "82vh",
          overflow: "auto",
          border: "1px solid rgba(168, 85, 247, 0.32)",
          borderRadius: 24,
          padding: 20,
          background:
            "linear-gradient(145deg, rgba(15,23,42,0.96), rgba(30,41,59,0.84))",
          boxShadow: "0 28px 80px rgba(0,0,0,0.55)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20, color: "#f8fafc" }}>
            SIGNAL / 반등 / 위험 / 매집 기준
          </h2>
          <button
            onClick={onClose}
            style={{
              border: "1px solid rgba(148, 163, 184, 0.28)",
              background: "rgba(2,6,23,0.76)",
              color: "#e5e7eb",
              borderRadius: 999,
              padding: "8px 12px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            닫기
          </button>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <GuideItem
            title="반등표시"
            color="#facc15"
            text="Diff가 -400 이하로 눌린 뒤 직전 하락폭 대비 의미 있게 회복하고, 가속도와 하락비율 둔화가 같이 확인될 때 표시합니다."
          />
          <GuideItem
            title="위험"
            color="#ef4444"
            text="지수는 버티는데 Diff 악화, 하락비율 확대, 외인·기관 수급 악화가 동시에 나타나는 다이버전스 구간입니다."
          />
          <GuideItem
            title="매집"
            color="#22c55e"
            text="지수는 약하지만 Diff와 수급이 개선되고 하락비율이 둔화되는 구간으로, 눌림 매집 가능성을 표시합니다."
          />
          <GuideItem
            title="SIGNAL"
            color="#a78bfa"
            text="0선 돌파/이탈, 상승·하락 가속 전환, 시장점수 과열·침체 진입이 신뢰도 점수 기준을 넘을 때 표시합니다."
          />
          <GuideItem
            title="Y축 자동/고정"
            color="#38bdf8"
            text="자동은 데이터 범위에 맞게 확대하고, 고정은 Breadth·Ratio·Flow를 일정 범위로 고정해 장중 변화를 비교하기 쉽게 합니다."
          />
        </div>
      </div>
    </div>
  );
}

function GuideItem({
  title,
  text,
  color,
}: {
  title: string;
  text: string;
  color: string;
}) {
  return (
    <div
      style={{
        border: `1px solid ${color}55`,
        borderRadius: 16,
        padding: 14,
        background: "rgba(2, 6, 23, 0.42)",
      }}
    >
      <div style={{ color, fontSize: 13, fontWeight: 950, marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.6 }}>
        {text}
      </div>
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
