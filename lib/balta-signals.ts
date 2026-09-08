// Existing DailyPage signal thresholds extracted into a shared engine.
// Percentages measure rule satisfaction, not a calibrated probability.
import { type MarketRow as Row, type MarketRow, type MarketEvent, formatTime, timeToMinute, verifiedFlow, record, signalLabel, eventDirection, eventLevel, numeric } from "./balta-model";
function marketScore(row?: Row) { return row?.marketScore ?? 0; }
function getFlowPower(row?: Row) { return row?.flowPower ?? 0; }
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

function getSignalConfidence(score: number, total = 7) {
  return Math.max(0, Math.min(100, Math.round((score / total) * 100)));
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

  const recentRows = rows;

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
    if (row.minute - recentRows[index - 1].minute > 5) return;
    if ([row.breadthSource, recentRows[index - 1].breadthSource].some(source => ["FALLBACK", "ERROR", "EMPTY", "SKIPPED"].includes(source))) return;

    const prev = recentRows[index - 1];
    const prev2 = index >= 2 ? recentRows[index - 2] : undefined;
    const time = formatTime(row.time);
    const score = marketScore(row);
    const prevScore = marketScore(prev);
    const scoreMove = score - prevScore;
    const kospiMove = Number(row.kospi) - Number(prev.kospi);
    const kosdaqMove = Number(row.kosdaq) - Number(prev.kosdaq);
    const indexMove = kospiMove + kosdaqMove;
    const flowOk = verifiedFlow(row) && verifiedFlow(prev);
    const flowPower = flowOk ? getFlowPower(row) : 0;
    const prevFlowPower = flowOk ? getFlowPower(prev) : 0;
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
          message: `Diff 0선 상향 돌파 / 조건 충족률 ${getSignalConfidence(signalScore)}% / 현재 ${row.diff}`,
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
          message: `Diff 0선 하향 이탈 / 조건 충족률 ${getSignalConfidence(signalScore)}% / 현재 ${row.diff}`,
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
        message: `상승 가속 전환 / 조건 충족률 ${getSignalConfidence(signalScore)}% / 가속도 +${row.accel}`,
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
        message: `하락 가속 전환 / 조건 충족률 ${getSignalConfidence(signalScore)}% / 가속도 ${row.accel}`,
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
          message: `시장점수 상승권 진입 / 조건 충족률 ${getSignalConfidence(signalScore)}% / ${score}점`,
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
          message: `시장점수 하락권 진입 / 조건 충족률 ${getSignalConfidence(signalScore)}% / ${score}점`,
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

    if (flowOk && dangerScore >= 4) {
      pushSignal(
        {
          time,
          type: "위험 다이버전스",
          direction: "하방",
          strength: getStrengthByScore(dangerScore),
          message: `지수는 버티지만 내부 약세·매도 수급 확대 / 조건 충족률 ${getSignalConfidence(dangerScore, 6)}% / Diff ${row.diff}`,
          color: "#ef4444",
          diff: row.diff,
          prevDiff: prev.diff,
          accel: row.accel,
          marketScore: score,
          score: dangerScore,
          confidence: getSignalConfidence(dangerScore, 6),
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

    if (flowOk && accumulationScore >= 4) {
      pushSignal(
        {
          time,
          type: "매집 다이버전스",
          direction: "상방",
          strength: getStrengthByScore(accumulationScore),
          message: `지수는 약하지만 수급·종목 흐름 개선 / 조건 충족률 ${getSignalConfidence(accumulationScore, 6)}% / Diff ${row.diff}`,
          color: "#22c55e",
          diff: row.diff,
          prevDiff: prev.diff,
          accel: row.accel,
          marketScore: score,
          score: accumulationScore,
          confidence: getSignalConfidence(accumulationScore, 6),
          duration: upTrendDuration,
        },
        12,
      );
    }
  });

  return compactSignalList(signals, SIGNAL_COOLDOWN_MINUTES);
}


export function buildMarketEvents(rows: MarketRow[]): MarketEvent[] {
  const candidates: MarketEvent[] = [];
  for (const row of rows) {
    for (const raw of row.signals) {
      const signal = record(raw), type = String(signal.type ?? "");
      if (!type) continue;
      const score = numeric(signal.score);
      const confidence = numeric(signal.confidence);
      candidates.push({ id: row.date + "-" + row.time + "-" + type, date: row.date, time: row.time, minute: row.minute,
        type, label: signalLabel(type), message: String(signal.message ?? signalLabel(type)).replace(/신뢰도/g, "조건 충족률"),
        direction: eventDirection(type), level: eventLevel(signal.level ?? signal.strength), source: "수집 신호",
        ...(score === null ? {} : { score }), ...(confidence === null ? {} : { conditionRate: Math.max(0, Math.min(100, confidence)) }),
        diff: row.diff, marketScore: row.marketScore });
    }
    if (row.alert && !row.signals.length) {
      candidates.push({ id: row.date + "-" + row.time + "-alert", date: row.date, time: row.time, minute: row.minute,
        type: "MARKET_ALERT", label: "시장 상태 알림", message: row.alert.replace(/신뢰도/g, "조건 충족률"),
        direction: row.diff > 0 ? "up" : row.diff < 0 ? "down" : "neutral", level: Math.abs(row.diff) >= 800 ? "강" : "중",
        source: "시장 알림", diff: row.diff, marketScore: row.marketScore });
    }
  }
  for (const signal of buildSignals(rows)) {
    const row = rows.find(r => r.minute === timeToMinute(signal.time));
    if (!row) continue;
    candidates.push({ id: row.date + "-" + row.time + "-" + signal.type, date: row.date, time: row.time, minute: row.minute,
      type: signal.type, label: signalLabel(signal.type), message: signal.message,
      direction: signal.direction === "상방" ? "up" : signal.direction === "하방" ? "down" : "neutral",
      level: signal.strength, source: "차트 분석", score: signal.score, conditionRate: signal.confidence,
      diff: row.diff, marketScore: row.marketScore });
  }
  // Retain the original chart's rebound conditions as a searchable event.
  let lastRebound = -100;
  for (let i = 2; i < rows.length; i += 1) {
    const row = rows[i], prev = rows[i-1], prev2 = rows[i-2];
    if (row.minute-prev.minute > 5 || prev.minute-prev2.minute > 5 || row.minute-lastRebound < 12) continue;
    if ([row,prev,prev2].some(r => ["FALLBACK","ERROR","EMPTY","SKIPPED"].includes(r.breadthSource))) continue;
    const rebound = row.diff-prev.diff, drop = prev2.diff-prev.diff;
    if (row.diff <= -400 && prev.diff < prev2.diff && row.diff > prev.diff
      && rebound >= Math.max(80,Math.abs(prev.diff)*0.025) && drop >= Math.max(120,Math.abs(prev2.diff)*0.02)
      && (row.accel >= 40 || rebound >= 130) && row.downRatio*100 <= prev.downRatio*100-0.1) {
      lastRebound = row.minute;
      candidates.push({ id: row.date+"-"+row.time+"-BREADTH_REBOUND",date:row.date,time:row.time,minute:row.minute,
        type:"BREADTH_REBOUND",label:"하락 후 반등 조건",message:"시장 폭 회복과 하락 비율 감소가 함께 관찰되었습니다.",
        direction:"up",level:"중",source:"차트 분석",diff:row.diff,marketScore:row.marketScore });
    }
  }
  const deduped = new Map<string, MarketEvent>();
  candidates.forEach(event => { if (!deduped.has(event.id)) deduped.set(event.id, event); });
  const ordered = [...deduped.values()].sort((a, b) => a.minute - b.minute);
  const lastType = new Map<string, number>();
  const kept: MarketEvent[] = [];
  for (const event of ordered) {
    const key = event.type === "MARKET_ALERT" ? event.type + event.message : event.type;
    if (event.minute - (lastType.get(key) ?? -100) < 10) continue;
    lastType.set(key, event.minute); kept.push(event);
  }
  return kept.reverse();
}
