"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

type ApiSignal = {
  type: string;
  message?: string;
  level?: string;
  priority?: number;
  category?: string;
};

type MarketResponse = {
  up: number;
  down: number;
  diff: number;
  accel: number;
  flat: number;
  upRatio: number;
  downRatio: number;
  kospi: number;
  kosdaq: number;
  kospiUp: number;
  kospiDown: number;
  kosdaqUp: number;
  kosdaqDown: number;

  // 기존/신규 API 필드 모두 호환
  foreign?: number;
  inst?: number;
  indiv?: number;
  foreignFlow?: number;
  instFlow?: number;
  indivFlow?: number;

  marketTone?: string;
  marketScore?: number;
  marketState?: string;
  signal?: string;
  alert?: string;
  baseAlert?: string;
  topSignal?: ApiSignal | null;
  signals?: ApiSignal[];
  flowPower?: number;
  prevFlowPower?: number;
  flowTrend?: number;
  flowMomentum?: number;
  flowSource?: string;
  error?: string;
  detail?: string;
};

type Snapshot = {
  time: string;
  up: number;
  down: number;
  diff: number;
  accel: number;
  flat: number;
  upRatio: number;
  downRatio: number;
  kospi: number;
  kosdaq: number;
  foreign: number;
  inst: number;
  indiv: number;
  marketTone: string;
  marketState: string;
  marketScore: number;
  signal: string;
  flowPower: number;
  flowTrend: number;
  flowMomentum: number;
};

type SignalItem = {
  title: string;
  value: string;
  desc: string;
  color: string;
  bg: string;
};

function getFlowValue(res: MarketResponse, key: "foreign" | "inst" | "indiv") {
  if (key === "foreign") return Number(res.foreign ?? res.foreignFlow ?? 0);
  if (key === "inst") return Number(res.inst ?? res.instFlow ?? 0);
  return Number(res.indiv ?? res.indivFlow ?? 0);
}

function formatFlow(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${Number(value ?? 0).toLocaleString()}`;
}

function getFlowText(value: number) {
  if (value > 0) return "순매수";
  if (value < 0) return "순매도";
  return "보합";
}

function getStateText(state?: string) {
  const map: Record<string, string> = {
    STRONG_TREND_UP: "강한 상승 추세",
    STRONG_TREND_DOWN: "강한 하락 추세",
    WEAK_BOUNCE: "약한 반등",
    WEAK_DROP: "약한 하락",
    DISTRIBUTION: "분배 의심",
    ACCUMULATION: "매집 의심",
    REAL_DIVERGENCE: "실전 다이버전스",
    NEUTRAL: "중립",
  };
  return map[state ?? ""] ?? state ?? "중립";
}

function getSignalText(signal?: ApiSignal | null) {
  if (!signal) return "신호 없음";
  return signal.message || signal.type;
}

function getSignalColor(type?: string) {
  if (!type) return "#E5E7EB";
  if (type.includes("BUY") || type.includes("UP") || type.includes("ACCUMULATION")) return "#F43F5E";
  if (type.includes("SELL") || type.includes("DOWN") || type.includes("DISTRIBUTION")) return "#60A5FA";
  if (type.includes("DIVERGENCE") || type.includes("OVERHEAT")) return "#FACC15";
  return "#E5E7EB";
}

function buildMarketSignal(data: MarketResponse) {
  const diff = Number(data.diff ?? 0);
  const accel = Number(data.accel ?? 0);
  const upRatio = Number(data.upRatio ?? 0);
  const downRatio = Number(data.downRatio ?? 0);
  const foreign = Number(data.foreign ?? 0);
  const inst = Number(data.inst ?? 0);
  const indiv = Number(data.indiv ?? 0);

  if (data.signal) return data.signal;
  if (data.topSignal) return getSignalText(data.topSignal);
  if (data.marketState) return getStateText(data.marketState);

  if (diff > 700 && accel > 80 && (foreign + inst) > 0) return "강한 상승 + 수급 동반";
  if (diff > 400 && upRatio >= 0.58) return "상승 우위";
  if (diff < -700 && accel < -80 && (foreign + inst) < 0) return "강한 하락 + 수급 이탈";
  if (diff < -400 && downRatio >= 0.58) return "하락 우위";
  if (accel > 120) return "상승 가속";
  if (accel < -120) return "하락 가속";
  if (foreign > 0 && inst > 0 && indiv < 0) return "외국인·기관 동반 매수";
  if (foreign < 0 && inst < 0 && indiv > 0) return "외국인·기관 동반 매도";
  return data.marketTone ?? "중립";
}

function buildSignals(data: MarketResponse): SignalItem[] {
  const diff = Number(data.diff ?? 0);
  const accel = Number(data.accel ?? 0);
  const upRatio = Number(data.upRatio ?? 0);
  const downRatio = Number(data.downRatio ?? 0);
  const foreign = getFlowValue(data, "foreign");
  const inst = getFlowValue(data, "inst");
  const indiv = getFlowValue(data, "indiv");
  const smartMoney = Number(data.flowPower ?? foreign + inst);
  const flowTrend = Number(data.flowTrend ?? 0);
  const flowMomentum = Number(data.flowMomentum ?? 0);
  const apiTopSignal = data.topSignal ?? data.signals?.[0] ?? null;

  const breadthSignal =
    diff > 700
      ? { value: "강한 상승", desc: "상승 종목 수가 하락 종목 수를 크게 앞섭니다", color: "#F43F5E", bg: "#3f1118" }
      : diff > 250
        ? { value: "상승 우위", desc: "시장 폭이 상승 쪽으로 기울어져 있습니다", color: "#FB7185", bg: "#3f1118" }
        : diff < -700
          ? { value: "강한 하락", desc: "하락 종목 수가 상승 종목 수를 크게 앞섭니다", color: "#60A5FA", bg: "#0f274a" }
          : diff < -250
            ? { value: "하락 우위", desc: "시장 폭이 하락 쪽으로 기울어져 있습니다", color: "#93C5FD", bg: "#0f274a" }
            : { value: "중립", desc: "상승·하락 종목 수 차이가 크지 않습니다", color: "#E5E7EB", bg: "#1f2937" };

  const accelSignal =
    accel > 120
      ? { value: "상승 가속", desc: "직전 대비 시장 폭 개선 속도가 빠릅니다", color: "#FACC15", bg: "#3f3410" }
      : accel > 30
        ? { value: "개선", desc: "직전 대비 상승 쪽으로 조금 개선 중입니다", color: "#FDE68A", bg: "#3f3410" }
        : accel < -120
          ? { value: "하락 가속", desc: "직전 대비 시장 폭 악화 속도가 빠릅니다", color: "#A78BFA", bg: "#2e245f" }
          : accel < -30
            ? { value: "악화", desc: "직전 대비 하락 쪽으로 조금 밀리고 있습니다", color: "#C4B5FD", bg: "#2e245f" }
            : { value: "둔화/보합", desc: "직전 대비 변화가 크지 않습니다", color: "#E5E7EB", bg: "#1f2937" };

  const ratioSignal =
    upRatio >= 0.6
      ? { value: "상승 확산", desc: `상승비율 ${(upRatio * 100).toFixed(1)}%`, color: "#22C55E", bg: "#12351f" }
      : downRatio >= 0.6
        ? { value: "하락 확산", desc: `하락비율 ${(downRatio * 100).toFixed(1)}%`, color: "#60A5FA", bg: "#0f274a" }
        : { value: "혼조", desc: "상승/하락 비율이 한쪽으로 크게 쏠리지 않았습니다", color: "#E5E7EB", bg: "#1f2937" };

  const flowSignal =
    foreign > 0 && inst > 0
      ? { value: "외국인·기관 매수", desc: `합산 ${formatFlow(smartMoney)}`, color: "#F43F5E", bg: "#3f1118" }
      : foreign < 0 && inst < 0
        ? { value: "외국인·기관 매도", desc: `합산 ${formatFlow(smartMoney)}`, color: "#60A5FA", bg: "#0f274a" }
        : smartMoney > 0
          ? { value: "수급 양호", desc: `외국인+기관 ${formatFlow(smartMoney)}`, color: "#FB7185", bg: "#3f1118" }
          : smartMoney < 0
            ? { value: "수급 주의", desc: `외국인+기관 ${formatFlow(smartMoney)}`, color: "#93C5FD", bg: "#0f274a" }
            : { value: "수급 중립", desc: `개인 ${getFlowText(indiv)} ${formatFlow(indiv)}`, color: "#E5E7EB", bg: "#1f2937" };

  const advancedSignal = apiTopSignal
    ? {
        value: apiTopSignal.type,
        desc: `${getSignalText(apiTopSignal)} · ${apiTopSignal.level ?? "-"} · priority ${apiTopSignal.priority ?? "-"}`,
        color: getSignalColor(apiTopSignal.type),
        bg: apiTopSignal.type.includes("SELL") || apiTopSignal.type.includes("DOWN") ? "#0f274a" : "#3f3410",
      }
    : {
        value: data.marketState ? getStateText(data.marketState) : "대기",
        desc: `flowPower ${formatFlow(smartMoney)} · trend ${formatFlow(flowTrend)} · momentum ${formatFlow(flowMomentum)}`,
        color: getSignalColor(data.marketState),
        bg: "#1f2937",
      };

  return [
    { title: "ADVANCED", ...advancedSignal },
    { title: "BREADTH", ...breadthSignal },
    { title: "ACCEL", ...accelSignal },
    { title: "RATIO", ...ratioSignal },
    { title: "FLOW", ...flowSignal },
  ];
}

function MiniLineChart({
  data,
  color = "#22C55E",
  height = 180,
}: {
  data: number[];
  color?: string;
  height?: number;
}) {
  const width = 1000;

  const points = useMemo(() => {
    if (!data.length) return "";

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    return data
      .map((v, i) => {
        const x = data.length === 1 ? 0 : (i / (data.length - 1)) * width;
        const y = height - ((v - min) / range) * (height - 20) - 10;
        return `${x},${y}`;
      })
      .join(" ");
  }, [data, height]);

  const min = data.length ? Math.min(...data) : 0;
  const max = data.length ? Math.max(...data) : 0;
  const last = data.length ? data[data.length - 1] : 0;

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          color: "#94A3B8",
          marginBottom: 8,
        }}
      >
        <span>최저 {min.toLocaleString()}</span>
        <span>현재 {last.toLocaleString()}</span>
        <span>최고 {max.toLocaleString()}</span>
      </div>

      <svg
        viewBox={`0 0 1000 ${height}`}
        style={{
          width: "100%",
          height,
          background: "#0b1220",
          borderRadius: 10,
          display: "block",
        }}
      >
        <line x1="0" y1={height / 2} x2="1000" y2={height / 2} stroke="#1f2937" strokeWidth="1" />
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
      </svg>
    </div>
  );
}

function MiniMultiLineChart({
  series,
  height = 220,
}: {
  series: { name: string; data: number[]; color: string }[];
  height?: number;
}) {
  const width = 1000;
  const allValues = series.flatMap((s) => s.data);
  const min = allValues.length ? Math.min(...allValues) : 0;
  const max = allValues.length ? Math.max(...allValues) : 0;
  const range = max - min || 1;
  const zeroY = max <= 0 ? 10 : min >= 0 ? height - 10 : height - ((0 - min) / range) * (height - 20) - 10;

  const makePoints = (values: number[]) => {
    if (!values.length) return "";
    return values
      .map((v, i) => {
        const x = values.length === 1 ? 0 : (i / (values.length - 1)) * width;
        const y = height - ((v - min) / range) * (height - 20) - 10;
        return `${x},${y}`;
      })
      .join(" ");
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10, fontSize: 13 }}>
        {series.map((s) => {
          const last = s.data.length ? s.data[s.data.length - 1] : 0;
          return (
            <div key={s.name} style={{ color: "#CBD5E1" }}>
              <span style={{ color: s.color, fontWeight: 800 }}>●</span> {s.name} {formatFlow(last)}
            </div>
          );
        })}
      </div>
      <svg
        viewBox={`0 0 1000 ${height}`}
        style={{
          width: "100%",
          height,
          background: "#0b1220",
          borderRadius: 10,
          display: "block",
        }}
      >
        <line x1="0" y1={zeroY} x2="1000" y2={zeroY} stroke="#334155" strokeWidth="1" />
        {series.map((s) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={s.color}
            strokeWidth="4"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={makePoints(s.data)}
          />
        ))}
      </svg>
    </div>
  );
}

function MiniBarChart({
  data,
  positiveColor = "#22C55E",
  negativeColor = "#60A5FA",
  height = 180,
}: {
  data: number[];
  positiveColor?: string;
  negativeColor?: string;
  height?: number;
}) {
  const width = 1000;
  const maxAbs = Math.max(...data.map((v) => Math.abs(v)), 1);
  const barWidth = data.length ? width / data.length : width;
  const zeroY = height / 2;

  return (
    <svg
      viewBox={`0 0 1000 ${height}`}
      style={{
        width: "100%",
        height,
        background: "#0b1220",
        borderRadius: 10,
        display: "block",
      }}
    >
      <line x1="0" y1={zeroY} x2="1000" y2={zeroY} stroke="#334155" strokeWidth="1" />
      {data.map((v, i) => {
        const h = (Math.abs(v) / maxAbs) * (height / 2 - 12);
        const x = i * barWidth + 2;
        const y = v >= 0 ? zeroY - h : zeroY;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={Math.max(barWidth - 4, 2)}
            height={h}
            rx="2"
            fill={v >= 0 ? positiveColor : negativeColor}
          />
        );
      })}
    </svg>
  );
}

export default function Home() {
  const [data, setData] = useState<MarketResponse>({
    up: 0,
    down: 0,
    diff: 0,
    accel: 0,
    flat: 0,
    upRatio: 0,
    downRatio: 0,
    kospi: 0,
    kosdaq: 0,
    kospiUp: 0,
    kospiDown: 0,
    kosdaqUp: 0,
    kosdaqDown: 0,
    foreign: 0,
    inst: 0,
    indiv: 0,
    marketTone: "중립",
    marketScore: 0,
    marketState: "NEUTRAL",
    signal: "중립",
    alert: "",
    baseAlert: "",
    topSignal: null,
    signals: [],
    flowPower: 0,
    prevFlowPower: 0,
    flowTrend: 0,
    flowMomentum: 0,
    flowSource: "",
  });

  const [history, setHistory] = useState<Snapshot[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchData = () => {
      fetch("/api/market/live")
        .then((res) => res.json())
        .then((res: MarketResponse) => {
          if (res.error) {
            setError(`${res.error} / ${res.detail ?? ""}`);
            return;
          }

          const foreign = getFlowValue(res, "foreign");
          const inst = getFlowValue(res, "inst");
          const indiv = getFlowValue(res, "indiv");
          const normalized: MarketResponse = {
            up: Number(res.up ?? 0),
            down: Number(res.down ?? 0),
            diff: Number(res.diff ?? 0),
            accel: Number(res.accel ?? 0),
            flat: Number(res.flat ?? 0),
            upRatio: Number(res.upRatio ?? 0),
            downRatio: Number(res.downRatio ?? 0),
            kospi: Number(res.kospi ?? 0),
            kosdaq: Number(res.kosdaq ?? 0),
            kospiUp: Number(res.kospiUp ?? 0),
            kospiDown: Number(res.kospiDown ?? 0),
            kosdaqUp: Number(res.kosdaqUp ?? 0),
            kosdaqDown: Number(res.kosdaqDown ?? 0),
            foreign,
            inst,
            indiv,
            marketTone: res.marketTone ?? "중립",
            marketScore: Number(res.marketScore ?? 0),
            marketState: res.marketState ?? "NEUTRAL",
            signal: res.signal ?? "",
            alert: res.alert ?? "",
            baseAlert: res.baseAlert ?? "",
            topSignal: res.topSignal ?? res.signals?.[0] ?? null,
            signals: Array.isArray(res.signals) ? res.signals : [],
            flowPower: Number(res.flowPower ?? foreign + inst),
            prevFlowPower: Number(res.prevFlowPower ?? 0),
            flowTrend: Number(res.flowTrend ?? 0),
            flowMomentum: Number(res.flowMomentum ?? 0),
            flowSource: res.flowSource ?? "",
          };
          normalized.signal = buildMarketSignal(normalized);

          setError("");
          setData(normalized);

          const now = new Date();
          const time = now.toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });

          setHistory((prev) => {
            const next = [
              ...prev,
              {
                time,
                up: normalized.up,
                down: normalized.down,
                diff: normalized.diff,
                accel: normalized.accel,
                flat: normalized.flat,
                upRatio: normalized.upRatio,
                downRatio: normalized.downRatio,
                kospi: normalized.kospi,
                kosdaq: normalized.kosdaq,
                foreign,
                inst,
                indiv,
                marketTone: normalized.marketTone ?? "중립",
                marketState: normalized.marketState ?? "NEUTRAL",
                marketScore: Number(normalized.marketScore ?? 0),
                signal: normalized.signal ?? "중립",
                flowPower: Number(normalized.flowPower ?? 0),
                flowTrend: Number(normalized.flowTrend ?? 0),
                flowMomentum: Number(normalized.flowMomentum ?? 0),
              },
            ];
            return next.slice(-120);
          });
        })
        .catch(() => {
          setError("데이터 불러오기 실패");
        });
    };

    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const cardStyle: CSSProperties = {
    background: "#111827",
    padding: "20px",
    borderRadius: "12px",
    textAlign: "center",
  };

  const sectionStyle: CSSProperties = {
    marginTop: "24px",
    background: "#111827",
    padding: "20px",
    borderRadius: "12px",
  };

  const labelStyle: CSSProperties = {
    fontSize: "13px",
    color: "#94A3B8",
    marginBottom: "6px",
  };

  const valueStyle: CSSProperties = {
    fontSize: "22px",
    fontWeight: "bold",
  };

  const flowColor = (value: number) => {
    if (value > 0) return "#F43F5E";
    if (value < 0) return "#60A5FA";
    return "#E5E7EB";
  };

  const signals = buildSignals(data);
  const mainSignal = buildMarketSignal(data);
  const topSignal = data.topSignal ?? data.signals?.[0] ?? null;
  const flowPower = Number(data.flowPower ?? (Number(data.foreign ?? 0) + Number(data.inst ?? 0)));
  const flowTrend = Number(data.flowTrend ?? 0);
  const flowMomentum = Number(data.flowMomentum ?? 0);

  return (
    <div style={{ background: "#020617", minHeight: "100vh", padding: "40px", color: "white" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 30 }}>
        <div>
          <h1 style={{ fontSize: "28px", marginBottom: 8 }}>📊 MARKET DASHBOARD</h1>
          <div style={{ color: "#94A3B8", fontSize: 14 }}>1분마다 자동 갱신 · 최근 120개 기록 기준</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <a
            href="/daily"
            style={{
              background: "#0F172A",
              border: "1px solid #38BDF866",
              borderRadius: 999,
              padding: "10px 16px",
              color: "#38BDF8",
              fontWeight: 900,
              whiteSpace: "nowrap",
              textDecoration: "none",
              boxShadow: "0 0 0 1px rgba(56,189,248,0.08)",
            }}
          >
            📈 데일리 차트 보기
          </a>
          <div
            style={{
              background: "#1E293B",
              border: "1px solid #334155",
              borderRadius: 999,
              padding: "10px 16px",
              color: "#FACC15",
              fontWeight: 800,
              whiteSpace: "nowrap",
            }}
          >
            {getStateText(data.marketState)} · {mainSignal}
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            background: "#7f1d1d",
            padding: "16px",
            borderRadius: "10px",
            marginBottom: "20px",
          }}
        >
          <b>API 오류</b>
          <div>{error}</div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr 1fr 1fr",
          gap: "12px",
          marginBottom: "24px",
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#020617",
          padding: "10px 0",
        }}
      >
        <div
          style={{
            background: "#1E293B",
            border: `1px solid ${getSignalColor(data.marketState)}66`,
            borderRadius: "12px",
            padding: "18px",
          }}
        >
          <div style={labelStyle}>MARKET STATE</div>
          <div style={{ ...valueStyle, color: getSignalColor(data.marketState) }}>{getStateText(data.marketState)}</div>
          <div style={{ marginTop: 8, color: "#CBD5E1", fontSize: 13 }}>{topSignal ? getSignalText(topSignal) : mainSignal}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>FLOW POWER</div>
          <div style={{ ...valueStyle, color: flowColor(flowPower) }}>{formatFlow(flowPower)}</div>
          <div style={{ marginTop: 4, color: "#94A3B8", fontSize: 12 }}>외국인+기관</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>FLOW TREND</div>
          <div style={{ ...valueStyle, color: flowColor(flowTrend) }}>{formatFlow(flowTrend)}</div>
          <div style={{ marginTop: 4, color: "#94A3B8", fontSize: 12 }}>직전 대비</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>FLOW MOMENTUM</div>
          <div style={{ ...valueStyle, color: flowColor(flowMomentum) }}>{formatFlow(flowMomentum)}</div>
          <div style={{ marginTop: 4, color: "#94A3B8", fontSize: 12 }}>EMA 기준</div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        {signals.map((item) => (
          <div
            key={item.title}
            style={{
              background: item.bg,
              border: `1px solid ${item.color}55`,
              padding: "18px",
              borderRadius: "12px",
            }}
          >
            <div style={{ fontSize: 12, color: "#CBD5E1", marginBottom: 8, fontWeight: 800 }}>{item.title}</div>
            <div style={{ fontSize: 22, color: item.color, fontWeight: 900, marginBottom: 6 }}>{item.value}</div>
            <div style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.4 }}>{item.desc}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "12px",
        }}
      >
        <div style={cardStyle}>
          <div style={labelStyle}>상승</div>
          <div style={{ ...valueStyle, color: "#F43F5E" }}>{data.up.toLocaleString()}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>하락</div>
          <div style={{ ...valueStyle, color: "#60A5FA" }}>{data.down.toLocaleString()}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>차이</div>
          <div style={{ ...valueStyle, color: data.diff >= 0 ? "#22C55E" : "#60A5FA" }}>
            {data.diff > 0 ? "+" : ""}
            {data.diff.toLocaleString()}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>가속도</div>
          <div style={{ ...valueStyle, color: data.accel >= 0 ? "#FACC15" : "#A78BFA" }}>
            {data.accel > 0 ? "+" : ""}
            {data.accel.toLocaleString()}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>보합</div>
          <div style={valueStyle}>{data.flat.toLocaleString()}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>상승비율</div>
          <div style={{ ...valueStyle, color: "#22C55E" }}>{(data.upRatio * 100).toFixed(2)}%</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>하락비율</div>
          <div style={{ ...valueStyle, color: "#60A5FA" }}>{(data.downRatio * 100).toFixed(2)}%</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>시장톤</div>
          <div style={{ ...valueStyle, color: "#FACC15" }}>{data.marketTone}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>상태 분류</div>
          <div style={{ ...valueStyle, color: getSignalColor(data.marketState) }}>{getStateText(data.marketState)}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>시장 점수</div>
          <div style={{ ...valueStyle, color: "#FACC15" }}>{Number(data.marketScore ?? 0).toLocaleString()}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>대표 SIGNAL</div>
          <div style={{ ...valueStyle, color: getSignalColor(topSignal?.type), fontSize: 18 }}>{topSignal?.type ?? mainSignal}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>KOSPI</div>
          <div style={valueStyle}>{Number(data.kospi).toLocaleString()}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>KOSDAQ</div>
          <div style={valueStyle}>{Number(data.kosdaq).toLocaleString()}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>외국인 순매수</div>
          <div style={{ ...valueStyle, color: flowColor(Number(data.foreign ?? 0)) }}>{formatFlow(Number(data.foreign ?? 0))}</div>
          <div style={{ marginTop: 4, color: "#94A3B8", fontSize: 12 }}>{getFlowText(Number(data.foreign ?? 0))}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>기관 순매수</div>
          <div style={{ ...valueStyle, color: flowColor(Number(data.inst ?? 0)) }}>{formatFlow(Number(data.inst ?? 0))}</div>
          <div style={{ marginTop: 4, color: "#94A3B8", fontSize: 12 }}>{getFlowText(Number(data.inst ?? 0))}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>개인 순매수</div>
          <div style={{ ...valueStyle, color: flowColor(Number(data.indiv ?? 0)) }}>{formatFlow(Number(data.indiv ?? 0))}</div>
          <div style={{ marginTop: 4, color: "#94A3B8", fontSize: 12 }}>{getFlowText(Number(data.indiv ?? 0))}</div>
        </div>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ marginBottom: "14px" }}>시장별 집계 확인</h3>
        <div>KOSPI 상승: {data.kospiUp}</div>
        <div>KOSPI 하락: {data.kospiDown}</div>
        <div>KOSDAQ 상승: {data.kosdaqUp}</div>
        <div>KOSDAQ 하락: {data.kosdaqDown}</div>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ marginBottom: "14px" }}>상승/하락 추이</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
          }}
        >
          <div>
            <div style={{ color: "#94A3B8", marginBottom: 8 }}>상승 종목 수</div>
            <MiniLineChart data={history.map((x) => x.up)} color="#F43F5E" />
          </div>
          <div>
            <div style={{ color: "#94A3B8", marginBottom: 8 }}>하락 종목 수</div>
            <MiniLineChart data={history.map((x) => x.down)} color="#60A5FA" />
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ marginBottom: "14px" }}>시장 차이 추이</h3>
        <MiniBarChart data={history.map((x) => x.diff)} />
      </div>

      <div style={sectionStyle}>
        <h3 style={{ marginBottom: "14px" }}>가속도 추이</h3>
        <MiniBarChart data={history.map((x) => x.accel)} positiveColor="#FACC15" negativeColor="#A78BFA" />
      </div>

      <div style={sectionStyle}>
        <h3 style={{ marginBottom: "14px" }}>지수 추이</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
          }}
        >
          <div>
            <div style={{ color: "#94A3B8", marginBottom: 8 }}>KOSPI</div>
            <MiniLineChart data={history.map((x) => x.kospi)} color="#FACC15" />
          </div>
          <div>
            <div style={{ color: "#94A3B8", marginBottom: 8 }}>KOSDAQ</div>
            <MiniLineChart data={history.map((x) => x.kosdaq)} color="#A78BFA" />
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ marginBottom: "14px" }}>FLOW POWER / TREND / MOMENTUM</h3>
        <MiniMultiLineChart
          series={[
            { name: "FlowPower", data: history.map((x) => x.flowPower), color: "#F43F5E" },
            { name: "FlowTrend", data: history.map((x) => x.flowTrend), color: "#FACC15" },
            { name: "FlowMomentum", data: history.map((x) => x.flowMomentum), color: "#38BDF8" },
          ]}
        />
      </div>

      <div style={sectionStyle}>
        <h3 style={{ marginBottom: "14px" }}>SIGNAL LOG</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {(data.signals?.length ? data.signals : topSignal ? [topSignal] : []).map((s, idx) => (
            <div
              key={`${s.type}-${idx}`}
              style={{
                display: "grid",
                gridTemplateColumns: "180px 1fr 80px 80px",
                gap: 10,
                alignItems: "center",
                background: "#0b1220",
                border: `1px solid ${getSignalColor(s.type)}55`,
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 13,
              }}
            >
              <b style={{ color: getSignalColor(s.type) }}>{s.type}</b>
              <span style={{ color: "#CBD5E1" }}>{getSignalText(s)}</span>
              <span style={{ color: "#94A3B8" }}>{s.level ?? "-"}</span>
              <span style={{ color: "#94A3B8" }}>{s.priority ?? "-"}</span>
            </div>
          ))}
          {!data.signals?.length && !topSignal && <div style={{ color: "#94A3B8" }}>현재 표시할 고급 SIGNAL이 없습니다</div>}
        </div>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ marginBottom: "14px" }}>수급 통합 추이</h3>
        <MiniMultiLineChart
          series={[
            { name: "외국인", data: history.map((x) => x.foreign), color: "#38BDF8" },
            { name: "기관", data: history.map((x) => x.inst), color: "#F97316" },
            { name: "개인", data: history.map((x) => x.indiv), color: "#10B981" },
          ]}
        />
      </div>

      <div style={sectionStyle}>
        <h3 style={{ marginBottom: "14px" }}>수급 개별 추이</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "16px",
          }}
        >
          <div>
            <div style={{ color: "#94A3B8", marginBottom: 8 }}>외국인</div>
            <MiniLineChart data={history.map((x) => x.foreign)} color="#38BDF8" />
          </div>
          <div>
            <div style={{ color: "#94A3B8", marginBottom: 8 }}>기관</div>
            <MiniLineChart data={history.map((x) => x.inst)} color="#F97316" />
          </div>
          <div>
            <div style={{ color: "#94A3B8", marginBottom: 8 }}>개인</div>
            <MiniLineChart data={history.map((x) => x.indiv)} color="#10B981" />
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ marginBottom: "14px" }}>최근 수집 시각</h3>
        <div style={{ color: "#94A3B8", fontSize: 14 }}>
          {history.length ? history.map((x) => x.time).join(" / ") : "아직 데이터 없음"}
        </div>
        <div style={{ marginTop: 10, color: "#64748B", fontSize: 13 }}>
          1분마다 1개씩 누적되며 최근 120개까지만 표시됩니다
        </div>
      </div>
    </div>
  );
}
