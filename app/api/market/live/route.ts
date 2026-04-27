function getKstTime() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

let cachedToken: string | null = null;
let cachedTokenExpireAt = 0;
let lastSavedMinute = "";
let memoryPrevDiff = 0;
let memoryPrevFlowPower = 0;
let memoryRecentRows: Array<{ diff: number; foreignFlow: number; instFlow: number }> = [];

const KIS_BASE = process.env.KIS_BASE ?? "https://openapi.koreainvestment.com:9443";
const CUSTTYPE = process.env.KIS_CUSTTYPE ?? "P";

type FlowData = {
  foreign: number;
  inst: number;
  indiv: number;
  source: "LIVE" | "EMPTY" | "ERROR" | "FILTERED" | "FALLBACK";
  raw?: any;
};

type SignalLevel = "강" | "중" | "약";

type SignalCategory = "FLOW" | "DIVERGENCE" | "ACCEL" | "SCORE" | "CROSS" | "TREND";

type MarketSignal = {
  type: string;
  message: string;
  level: SignalLevel;
  priority: number;
  category: SignalCategory;
};

type SupabaseLogPayload = {
  createdat: string;
  time: string;
  up: number;
  down: number;
  flat: number;
  diff: number;
  accel: number;
  upratio: number;
  downratio: number;
  kospi: number;
  kosdaq: number;
  foreignflow: number;
  instflow: number;
  indivflow: number;
  flowpower: number;
  flowtrend: number;
  flowmomentum: number;
  alert: string;
  markettone: string;
  marketscore: number;
  marketstate: string;
  signals: MarketSignal[];
};

type SavedLogRow = Partial<SupabaseLogPayload> & {
  id?: number;
  created_at?: string;
  createdAt?: string;
};

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

return {
  url: url
    .replace(/\/$/, "")
    .replace(/\/rest\/v1$/, ""),
  key,
};
}

function getKstDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const config = getSupabaseConfig();

  if (!config) {
    console.warn("SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 없음");
    return null;
  }

  const res = await fetch(`${config.url}${path}`, {
    ...init,
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase 요청 실패 ${res.status}: ${text}`);
  }

  if (res.status === 204) return null;

  return res.json();
}

function encodeFilterValue(value: string) {
  return encodeURIComponent(value);
}

function normalizeMinuteValue(time: string) {
  if (!time) return "";
  const m = String(time).match(/(\d{1,2}):(\d{2})/);
  if (!m) return String(time);
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}


function normalizeSavedRow(row: any): SavedLogRow | null {
  if (!row || typeof row !== "object") return null;

  return {
    id: toNumber(row.id),
    createdat: row.createdat ?? row.createdAt ?? row.created_at ?? "",
    created_at: row.created_at ?? "",
    time: normalizeMinuteValue(row.time ?? ""),
    up: toNumber(row.up),
    down: toNumber(row.down),
    flat: toNumber(row.flat),
    diff: toNumber(row.diff),
    accel: toNumber(row.accel),
    upratio: toNumber(row.upratio ?? row.upRatio),
    downratio: toNumber(row.downratio ?? row.downRatio),
    kospi: toNumber(row.kospi),
    kosdaq: toNumber(row.kosdaq),
    foreignflow: toNumber(row.foreignflow ?? row.foreignFlow),
    instflow: toNumber(row.instflow ?? row.instFlow),
    indivflow: toNumber(row.indivflow ?? row.indivFlow),
    flowpower: toNumber(row.flowpower ?? row.flowPower),
    flowtrend: toNumber(row.flowtrend ?? row.flowTrend),
    flowmomentum: toNumber(row.flowmomentum ?? row.flowMomentum),
    alert: row.alert ?? "",
    markettone: row.markettone ?? row.marketTone ?? "",
    marketscore: toNumber(row.marketscore ?? row.marketScore),
    marketstate: row.marketstate ?? row.marketState ?? "",
    signals: Array.isArray(row.signals) ? row.signals : [],
  };
}

async function getLatestLogFromSupabase() {
  try {
    const rows = await supabaseRequest("/rest/v1/logs?select=*&order=id.desc&limit=1");
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return normalizeSavedRow(rows[0]);
  } catch (error) {
    console.warn("Supabase 최근 로그 조회 실패:", error);
    return null;
  }
}

async function getLogByMinuteFromSupabase(createdat: string, time: string) {
  try {
    const rows = await supabaseRequest(
      `/rest/v1/logs?select=*&createdat=eq.${encodeFilterValue(createdat)}&time=eq.${encodeFilterValue(time)}&order=id.desc&limit=1`
    );

    if (!Array.isArray(rows) || rows.length === 0) return null;
    return normalizeSavedRow(rows[0]);
  } catch (error) {
    console.warn("Supabase 같은 분 로그 조회 실패:", error);
    return null;
  }
}

function getBreadthTotal(row: Pick<SupabaseLogPayload, "up" | "down" | "flat"> | SavedLogRow | null) {
  if (!row) return 0;
  return toNumber(row.up) + toNumber(row.down) + toNumber(row.flat);
}

function isValidMarketSnapshot(row: SupabaseLogPayload, prevRow: SavedLogRow | null = null) {
  const total = getBreadthTotal(row);
  const prevTotal = getBreadthTotal(prevRow);

  const hasFullBreadth = total >= 1800 && total <= 3800 && Math.abs(row.diff) <= total;
  const hasBothIndex = row.kospi > 1000 && row.kosdaq > 300;

  const totalChangeRate = prevTotal > 1800 ? Math.abs(total - prevTotal) / prevTotal : 0;
  const hasStableTotal = prevTotal > 1800 ? totalChangeRate <= 0.25 : true;

  const prevUp = toNumber(prevRow?.up);
  const prevDown = toNumber(prevRow?.down);
  const upChangeRate = prevUp > 0 ? Math.abs(row.up - prevUp) / prevUp : 0;
  const downChangeRate = prevDown > 0 ? Math.abs(row.down - prevDown) / prevDown : 0;
  const hasStableBreadth = prevTotal > 1800 ? upChangeRate <= 0.45 && downChangeRate <= 0.45 : true;

  return hasFullBreadth && hasBothIndex && hasStableTotal && hasStableBreadth;
}

function hasSavedFlow(prevRow: SavedLogRow | null) {
  if (!prevRow) return false;

  return (
    toNumber(prevRow.foreignflow) !== 0 ||
    toNumber(prevRow.instflow) !== 0 ||
    toNumber(prevRow.indivflow) !== 0
  );
}

function getPrevFlowSnapshot(prevRow: SavedLogRow | null) {
  return {
    foreign: toNumber(prevRow?.foreignflow),
    inst: toNumber(prevRow?.instflow),
    indiv: toNumber(prevRow?.indivflow),
  };
}

function isSuspiciousFlowJump(current: Omit<FlowData, "source" | "raw">, prevRow: SavedLogRow | null) {
  if (!prevRow || !hasSavedFlow(prevRow)) return false;

  const prev = getPrevFlowSnapshot(prevRow);
  const currentValues = [current.foreign, current.inst, current.indiv];
  const prevValues = [prev.foreign, prev.inst, prev.indiv];

  const currentAbsTotal = currentValues.reduce((sum, value) => sum + Math.abs(value), 0);
  const prevAbsTotal = prevValues.reduce((sum, value) => sum + Math.abs(value), 0);

  // 너무 강한 필터를 걸면 수급이 계속 직전값으로 고정됩니다.
  // 그래서 진짜로 말이 안 되는 값만 FILTERED 처리합니다.
  // 예: 직전 누적 수급은 큰데 이번 값이 사실상 0에 가까움, 또는 한 번에 20만 이상 튐.
  if (prevAbsTotal >= 50_000 && currentAbsTotal <= 1_000) return true;

  return currentValues.some((value, index) => {
    const prevValue = prevValues[index];
    const delta = Math.abs(value - prevValue);

    if (Math.abs(prevValue) >= 30_000 && Math.abs(value) <= 500) return true;
    if (delta >= 200_000) return true;

    return false;
  });
}

function stabilizeFlowData(flowData: FlowData, prevRow: SavedLogRow | null): FlowData {
  const prev = getPrevFlowSnapshot(prevRow);

  // LIVE가 아니면 직전 수급값을 반복 저장하지 않습니다.
  // 반복 저장하면 표/차트에서 수급이 계속 같은 값으로 보입니다.
  if (flowData.source !== "LIVE") {
    return {
      foreign: 0,
      inst: 0,
      indiv: 0,
      source: flowData.source,
      raw: flowData.raw,
    };
  }

  const current = {
    foreign: flowData.foreign,
    inst: flowData.inst,
    indiv: flowData.indiv,
  };

  if (isSuspiciousFlowJump(current, prevRow)) {
    console.warn("⚠️ 수급 튐 감지 → 이번 수급값은 저장하지 않음", {
      current,
      prev,
    });

    return {
      foreign: 0,
      inst: 0,
      indiv: 0,
      source: "FILTERED",
      raw: flowData.raw,
    };
  }

  return flowData;
}

function applyFallbackIfNeeded(row: SupabaseLogPayload, prevRow: SavedLogRow | null) {
  if (!prevRow) return row;

  const next = { ...row };

  if (next.kospi <= 0 && toNumber(prevRow.kospi) > 0) next.kospi = toNumber(prevRow.kospi);
  if (next.kosdaq <= 0 && toNumber(prevRow.kosdaq) > 0) next.kosdaq = toNumber(prevRow.kosdaq);

  // 수급값은 더 이상 직전값으로 fallback하지 않습니다.
  // LIVE가 아닌 수급을 직전값으로 채우면 같은 수급값이 계속 반복 저장됩니다.
  // 수급 차트 보정은 app/daily/page.tsx에서 LIVE/0값 제외 방식으로 처리합니다.

  return next;
}

async function saveLogToSupabase(row: SupabaseLogPayload) {
  try {
    const sameMinuteRow = await getLogByMinuteFromSupabase(row.createdat, row.time);

    if (sameMinuteRow?.id) {
      await supabaseRequest(`/rest/v1/logs?id=eq.${sameMinuteRow.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(row),
      });

      return { action: "updated", id: sameMinuteRow.id };
    }

    await supabaseRequest("/rest/v1/logs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });

    return { action: "inserted", id: null };
  } catch (error) {
    console.warn("Supabase 로그 저장 실패:", error);
    return { action: "failed", id: null };
  }
}


async function getAccessToken() {
  const appkey = process.env.KIS_APPKEY;
  const appsecret = process.env.KIS_APPSECRET;

  if (!appkey || !appsecret) {
    throw new Error("KIS_APPKEY 또는 KIS_APPSECRET 없음");
  }

  const now = Date.now();

  if (cachedToken && now < cachedTokenExpireAt) {
    return cachedToken;
  }

  const res = await fetch(`${KIS_BASE}/oauth2/tokenP`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey,
      appsecret,
    }),
    cache: "no-store",
  });

  const json = await res.json();

  if (!json.access_token) {
    throw new Error(JSON.stringify(json));
  }

  cachedToken = json.access_token;
  cachedTokenExpireAt = now + (Number(json.expires_in ?? 3600) - 60) * 1000;

  return cachedToken;
}

function pickOutput(data: any) {
  const out = data.output1 ?? data.output ?? data.output2 ?? {};
  if (Array.isArray(out)) return out[0] ?? {};
  return out;
}

function toNumber(value: any) {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function pickNumber(obj: any, keys: string[]) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return toNumber(obj[key]);
    }
  }
  return 0;
}

async function fetchBreadth(code: "0001" | "1001") {
  const appkey = process.env.KIS_APPKEY!;
  const appsecret = process.env.KIS_APPSECRET!;
  const token = await getAccessToken();

  const qs = new URLSearchParams({
    fid_cond_mrkt_div_code: "U",
    fid_input_iscd: code,
    fid_cond_scr_div_code: "20214",
    fid_mrkt_cls_code: "K2",
    fid_blng_cls_code: "0",
  });

  const res = await fetch(
    `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-index-category-price?${qs.toString()}`,
    {
      method: "GET",
      headers: {
        "content-type": "application/json; charset=utf-8",
        authorization: `Bearer ${token}`,
        appkey,
        appsecret,
        tr_id: "FHPUP02140000",
        custtype: CUSTTYPE,
      },
      cache: "no-store",
    }
  );

  const data = await res.json();
  const out = pickOutput(data);

  return {
    up: toNumber(out.ascn_issu_cnt ?? out.up_cnt),
    down: toNumber(out.down_issu_cnt ?? out.down_cnt),
    flat: toNumber(out.stnr_issu_cnt ?? out.flat_cnt),
    price: toNumber(out.bstp_nmix_prpr ?? out.stck_prpr ?? out.prpr),
  };
}

function normalizeFlowUnit(value: number) {
  const abs = Math.abs(value);

  if (abs >= 100_000_000) return Math.round(value / 1_000_000);
  if (abs >= 100_000) return Math.round(value / 1_000);

  return value;
}

function flattenObjects(value: any): any[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenObjects(item));
  }

  if (typeof value === "object") {
    const nested = Object.values(value).flatMap((item) => flattenObjects(item));
    return [value, ...nested];
  }

  return [];
}

function getRows(data: any) {
  const candidates = [
    data?.output,
    data?.output1,
    data?.output2,
    data?.output3,
    data?.output4,
  ].filter(Boolean);

  const rows = candidates.flatMap((item) => flattenObjects(item));

  if (rows.length === 0) return flattenObjects(data);

  return rows;
}

function pickNumberByPattern(obj: any, patterns: RegExp[]) {
  if (!obj || typeof obj !== "object") return 0;

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined || value === "") continue;

    if (patterns.some((pattern) => pattern.test(key))) {
      const n = toNumber(value);
      if (n !== 0) return n;
    }
  }

  return 0;
}

function parseFlowFromJson(data: any): Omit<FlowData, "source" | "raw"> {
  const rows = getRows(data);

  const directKeyGroups = {
    foreign: [
      "frgn_ntby_tr_pbmn",
      "frgn_ntby_amt",
      "frgn_ntby_val",
      "frgn_seln_buy_amt",
      "frgn_ntby_tr_pbmn_1",
      "frgn",
      "foreign",
      "foreignFlow",
    ],
    inst: [
      "orgn_ntby_tr_pbmn",
      "inst_ntby_tr_pbmn",
      "orgn_ntby_amt",
      "inst_ntby_amt",
      "orgn_ntby_val",
      "inst_ntby_val",
      "orgn",
      "inst",
      "instFlow",
    ],
    indiv: [
      "prsn_ntby_tr_pbmn",
      "indv_ntby_tr_pbmn",
      "prsn_ntby_amt",
      "indv_ntby_amt",
      "prsn_ntby_val",
      "indv_ntby_val",
      "individual",
      "indiv",
      "indivFlow",
    ],
  };

  const patternGroups = {
    foreign: [/frgn.*ntby/i, /foreign.*net/i, /frgn.*net/i],
    inst: [/orgn.*ntby/i, /inst.*ntby/i, /organ.*net/i, /inst.*net/i],
    indiv: [/prsn.*ntby/i, /indv.*ntby/i, /individual.*net/i, /person.*net/i],
  };

  for (const row of rows) {
    const foreign =
      pickNumber(row, directKeyGroups.foreign) ||
      pickNumberByPattern(row, patternGroups.foreign);

    const inst =
      pickNumber(row, directKeyGroups.inst) ||
      pickNumberByPattern(row, patternGroups.inst);

    const indiv =
      pickNumber(row, directKeyGroups.indiv) ||
      pickNumberByPattern(row, patternGroups.indiv);

    if (foreign !== 0 || inst !== 0 || indiv !== 0) {
      return {
        foreign: normalizeFlowUnit(foreign),
        inst: normalizeFlowUnit(inst),
        indiv: normalizeFlowUnit(indiv),
      };
    }
  }

  let foreign = 0;
  let inst = 0;
  let indiv = 0;

  for (const row of rows) {
    const name = String(
      row?.invt_cls_name ??
        row?.ivst_cls_name ??
        row?.invr_cls_name ??
        row?.invst_cls_name ??
        row?.investor ??
        row?.name ??
        ""
    );

    const amount = pickNumber(row, [
      "ntby_tr_pbmn",
      "ntby_amt",
      "net_buy_amt",
      "smtl_ntby_tr_pbmn",
      "tr_pbmn",
      "amount",
    ]);

    if (!amount) continue;

    if (name.includes("외국") || name.toLowerCase().includes("foreign")) {
      foreign += amount;
    }

    if (
      name.includes("기관") ||
      name.toLowerCase().includes("inst") ||
      name.includes("금융투자") ||
      name.includes("투신") ||
      name.includes("연기금") ||
      name.includes("보험") ||
      name.includes("은행") ||
      name.includes("기타금융")
    ) {
      inst += amount;
    }

    if (name.includes("개인") || name.toLowerCase().includes("individual")) {
      indiv += amount;
    }
  }

  return {
    foreign: normalizeFlowUnit(foreign),
    inst: normalizeFlowUnit(inst),
    indiv: normalizeFlowUnit(indiv),
  };
}

async function fetchInvestorFlowByMarket(market: "KOSPI" | "KOSDAQ"): Promise<FlowData> {
  const appkey = process.env.KIS_APPKEY!;
  const appsecret = process.env.KIS_APPSECRET!;
  const token = await getAccessToken();

  const qs = new URLSearchParams({
    fid_input_iscd: market === "KOSPI" ? "KSP" : "KSQ",
    fid_input_iscd_2: market === "KOSPI" ? "0001" : "1001",
  });

  const res = await fetch(
    `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-investor-time-by-market?${qs.toString()}`,
    {
      method: "GET",
      headers: {
        "content-type": "application/json; charset=utf-8",
        authorization: `Bearer ${token}`,
        appkey,
        appsecret,
        tr_id: "FHPTJ04030000",
        custtype: CUSTTYPE,
      },
      cache: "no-store",
    }
  );

  const data = await res.json();

  if (String(data?.rt_cd ?? "") !== "0") {
    console.log("074 ERROR", market, JSON.stringify(data).slice(0, 3000));

    return {
      foreign: 0,
      inst: 0,
      indiv: 0,
      source: "ERROR",
      raw: data,
    };
  }

  const parsed = parseFlowFromJson(data);
  const hasValue = parsed.foreign !== 0 || parsed.inst !== 0 || parsed.indiv !== 0;

  console.log("074 RESULT", market, {
    source: hasValue ? "LIVE" : "EMPTY",
    foreign: parsed.foreign,
    inst: parsed.inst,
    indiv: parsed.indiv,
  });

  return {
    ...parsed,
    source: hasValue ? "LIVE" : "EMPTY",
    raw: data,
  };
}

async function fetchInvestorFlow(): Promise<FlowData> {
  try {
    const [kospiFlow, kosdaqFlow] = await Promise.all([
      fetchInvestorFlowByMarket("KOSPI"),
      fetchInvestorFlowByMarket("KOSDAQ"),
    ]);

    const foreign = kospiFlow.foreign + kosdaqFlow.foreign;
    const inst = kospiFlow.inst + kosdaqFlow.inst;
    const indiv = kospiFlow.indiv + kosdaqFlow.indiv;

    const hasValue = foreign !== 0 || inst !== 0 || indiv !== 0;

    const source = hasValue
      ? "LIVE"
      : kospiFlow.source === "ERROR" || kosdaqFlow.source === "ERROR"
        ? "ERROR"
        : "EMPTY";

    return {
      foreign,
      inst,
      indiv,
      source,
      raw: {
        kospi: kospiFlow.raw,
        kosdaq: kosdaqFlow.raw,
      },
    };
  } catch (error) {
    console.warn("수급 API 요청 실패:", error);

    return {
      foreign: 0,
      inst: 0,
      indiv: 0,
      source: "ERROR",
    };
  }
}

function buildAlert(diff: number, accel: number, upRatio: number, downRatio: number) {
  if (diff >= 800 && accel >= 50) return "🔥 강한 상승확산 + 가속";
  if (diff >= 500) return "🔥 상승확산 강함";
  if (diff >= 200) return "상승우위";

  if (diff <= -800 && accel <= -50) return "❄️ 강한 하락확산 + 가속";
  if (diff <= -500) return "❄️ 하락확산 강함";
  if (diff <= -200) return "하락우위";

  if (upRatio >= 0.6) return "상승비율 우세";
  if (downRatio >= 0.6) return "하락비율 우세";

  return "중립";
}

function buildAlertLevel(alert: string) {
  if (alert.includes("강한") || alert.includes("강함")) return "강";
  if (alert.includes("우위") || alert.includes("우세")) return "중";
  return "약";
}

function buildTone(diff: number) {
  if (diff >= 800) return "매우 강한 상승";
  if (diff >= 300) return "강한 상승";
  if (diff >= 100) return "상승 우세";

  if (diff <= -800) return "매우 강한 하락";
  if (diff <= -300) return "강한 하락";
  if (diff <= -100) return "하락 우세";

  return "중립";
}

function buildMarketScore(diff: number, upRatio: number, downRatio: number) {
  const scoreByDiff = Math.max(-60, Math.min(60, diff / 20));
  const scoreByRatio = Math.max(-40, Math.min(40, (upRatio - downRatio) * 100));

  return Math.round(scoreByDiff + scoreByRatio);
}

function createSignal(
  type: string,
  message: string,
  level: SignalLevel,
  priority: number,
  category: SignalCategory
): MarketSignal {
  return {
    type,
    message,
    level,
    priority,
    category,
  };
}

function buildSignals(
  diff: number,
  prevDiff: number,
  accel: number,
  marketScore: number
): MarketSignal[] {
  const signals: MarketSignal[] = [];

  if (prevDiff < 0 && diff > 0) {
    signals.push(createSignal("CROSS_UP", "0선 상향 돌파", "중", 50, "CROSS"));
  }

  if (prevDiff > 0 && diff < 0) {
    signals.push(createSignal("CROSS_DOWN", "0선 하향 이탈", "중", 50, "CROSS"));
  }

  if (accel >= 500) {
    signals.push(createSignal("ACCEL_UP_STRONG", "상승 가속 강함", "강", 70, "ACCEL"));
  } else if (accel >= 300) {
    signals.push(createSignal("ACCEL_UP", "상승 가속 강화", "중", 60, "ACCEL"));
  }

  if (accel <= -500) {
    signals.push(createSignal("ACCEL_DOWN_STRONG", "하락 가속 강함", "강", 70, "ACCEL"));
  } else if (accel <= -300) {
    signals.push(createSignal("ACCEL_DOWN", "하락 가속 강화", "중", 60, "ACCEL"));
  }

  if (marketScore >= 80) {
    signals.push(createSignal("SCORE_OVERHEAT_STRONG", "시장점수 강한 과열권", "강", 65, "SCORE"));
  } else if (marketScore >= 70) {
    signals.push(createSignal("SCORE_OVERHEAT", "시장점수 과열권", "중", 55, "SCORE"));
  }

  if (marketScore <= -80) {
    signals.push(createSignal("SCORE_OVERSOLD_STRONG", "시장점수 강한 침체권", "강", 65, "SCORE"));
  } else if (marketScore <= -70) {
    signals.push(createSignal("SCORE_OVERSOLD", "시장점수 침체권", "중", 55, "SCORE"));
  }

  return signals;
}

function buildFlowSignals(
  foreign: number,
  inst: number,
  indiv: number,
  diff: number,
  accel: number,
  flowSource: FlowData["source"],
  prevFlowPower: number,
  recentRows: any[]
): MarketSignal[] {
  const signals: MarketSignal[] = [];

  if (flowSource !== "LIVE") return signals;

  const smartFlow = foreign + inst;
  const flowPower = smartFlow;
  const flowTrend = flowPower - prevFlowPower;
  const absSmartFlow = Math.abs(smartFlow);

  const recentDiffs = recentRows.map((row) => Number(row.diff ?? 0)).reverse();
  const recentFlows = recentRows
    .map((row) => Number(row.foreignFlow ?? 0) + Number(row.instFlow ?? 0))
    .reverse();

  const isDiffRising3 =
    recentDiffs.length >= 3 &&
    recentDiffs[0] < recentDiffs[1] &&
    recentDiffs[1] < recentDiffs[2] &&
    recentDiffs[2] < diff;

  const isDiffFalling3 =
    recentDiffs.length >= 3 &&
    recentDiffs[0] > recentDiffs[1] &&
    recentDiffs[1] > recentDiffs[2] &&
    recentDiffs[2] > diff;

  const isFlowRising3 =
    recentFlows.length >= 3 &&
    recentFlows[0] < recentFlows[1] &&
    recentFlows[1] < recentFlows[2] &&
    recentFlows[2] < flowPower;

  const isFlowFalling3 =
    recentFlows.length >= 3 &&
    recentFlows[0] > recentFlows[1] &&
    recentFlows[1] > recentFlows[2] &&
    recentFlows[2] > flowPower;

  if (foreign > 0 && inst > 0 && absSmartFlow >= 10000) {
    signals.push(
      createSignal(
        "FLOW_STRONG_BUY",
        "외국인+기관 강한 동시 순매수",
        "강",
        100,
        "FLOW"
      )
    );
  } else if (foreign > 0 && inst > 0 && absSmartFlow >= 5000) {
    signals.push(
      createSignal("FLOW_BUY", "외국인+기관 동시 순매수", "중", 90, "FLOW")
    );
  }

  if (foreign < 0 && inst < 0 && absSmartFlow >= 10000) {
    signals.push(
      createSignal(
        "FLOW_STRONG_SELL",
        "외국인+기관 강한 동시 순매도",
        "강",
        100,
        "FLOW"
      )
    );
  } else if (foreign < 0 && inst < 0 && absSmartFlow >= 5000) {
    signals.push(
      createSignal("FLOW_SELL", "외국인+기관 동시 순매도", "중", 90, "FLOW")
    );
  }

  if (diff > 200 && smartFlow <= -5000) {
    signals.push(
      createSignal(
        "FLOW_DIVERGENCE_UP_WITH_SELL",
        "상승종목 우세지만 외국인+기관은 순매도",
        accel < 0 ? "강" : "중",
        accel < 0 ? 98 : 88,
        "DIVERGENCE"
      )
    );
  }

  if (diff < -200 && smartFlow >= 5000) {
    signals.push(
      createSignal(
        "FLOW_DIVERGENCE_DOWN_WITH_BUY",
        "하락종목 우세지만 외국인+기관은 순매수",
        accel > 0 ? "강" : "중",
        accel > 0 ? 98 : 88,
        "DIVERGENCE"
      )
    );
  }

  if (Math.abs(diff) <= 200 && absSmartFlow >= 10000) {
    signals.push(
      createSignal(
        smartFlow > 0 ? "FLOW_ACCUMULATION" : "FLOW_DISTRIBUTION",
        smartFlow > 0
          ? "지수 중립권에서 외국인+기관 매수 누적"
          : "지수 중립권에서 외국인+기관 매도 누적",
        "중",
        85,
        "FLOW"
      )
    );
  }

  if (flowTrend >= 5000 && flowPower >= 5000) {
    signals.push(
      createSignal(
        "FLOW_TREND_BUY",
        "외국인+기관 수급 추세 강화",
        flowTrend >= 10000 ? "강" : "중",
        flowTrend >= 10000 ? 96 : 86,
        "TREND"
      )
    );
  }

  if (flowTrend <= -5000 && flowPower <= -5000) {
    signals.push(
      createSignal(
        "FLOW_TREND_SELL",
        "외국인+기관 수급 이탈 추세 강화",
        flowTrend <= -10000 ? "강" : "중",
        flowTrend <= -10000 ? 96 : 86,
        "TREND"
      )
    );
  }

  if (isDiffRising3 && isFlowFalling3 && diff > 200 && flowPower < 0) {
    signals.push(
      createSignal(
        "REAL_DIVERGENCE_DISTRIBUTION",
        "상승확산 지속 중 외국인+기관 수급 이탈",
        "강",
        110,
        "DIVERGENCE"
      )
    );
  }

  if (isDiffFalling3 && isFlowRising3 && diff < -200 && flowPower > 0) {
    signals.push(
      createSignal(
        "REAL_DIVERGENCE_ACCUMULATION",
        "하락확산 지속 중 외국인+기관 수급 유입",
        "강",
        110,
        "DIVERGENCE"
      )
    );
  }

  return signals;
}

function buildMarketState(
  diff: number,
  accel: number,
  marketScore: number,
  flowPower: number,
  flowTrend: number,
  topSignal?: MarketSignal | null
) {
  if (topSignal?.type === "REAL_DIVERGENCE_DISTRIBUTION") {
    return "DISTRIBUTION";
  }

  if (topSignal?.type === "REAL_DIVERGENCE_ACCUMULATION") {
    return "ACCUMULATION";
  }

  if (diff >= 500 && accel >= 0 && flowPower >= 5000) {
    return flowTrend >= 0 ? "STRONG_TREND_UP" : "UP_BUT_FLOW_WEAKENING";
  }

  if (diff <= -500 && accel <= 0 && flowPower <= -5000) {
    return flowTrend <= 0 ? "STRONG_TREND_DOWN" : "DOWN_BUT_FLOW_IMPROVING";
  }

  if (diff > 0 && flowPower < 0) return "WEAK_BOUNCE";
  if (diff < 0 && flowPower > 0) return "SELLING_PRESSURE_EASING";

  if (marketScore >= 70) return "OVERHEATED";
  if (marketScore <= -70) return "OVERSOLD";

  return "NEUTRAL";
}

function sortSignals(signals: MarketSignal[]) {
  return [...signals].sort((a, b) => b.priority - a.priority);
}

function buildSignalAlert(signals: MarketSignal[]) {
  const topSignal = signals[0];

  if (!topSignal) return null;

  if (topSignal.level === "강") {
    return `🚨 ${topSignal.message}`;
  }

  if (topSignal.category === "DIVERGENCE") {
    return `⚠️ ${topSignal.message}`;
  }

  if (topSignal.category === "FLOW") {
    return `📊 ${topSignal.message}`;
  }

  return null;
}

function buildFinalAlertLevel(alert: string, signals: MarketSignal[]) {
  const topSignal = signals[0];

  if (topSignal?.level === "강") return "강";
  if (topSignal?.level === "중") return "중";

  return buildAlertLevel(alert);
}

export async function GET() {
  try {
    const now = new Date();

    const timeStr = normalizeMinuteValue(
      new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now)
    );

    const createdat = getKstDateString(now);
    const minuteKey = `${createdat} ${timeStr}`;

    const [kospiData, kosdaqData, flowData, latestDbRow] = await Promise.all([
      fetchBreadth("0001"),
      fetchBreadth("1001"),
      fetchInvestorFlow(),
      getLatestLogFromSupabase(),
    ]);

    const up = kospiData.up + kosdaqData.up;
    const down = kospiData.down + kosdaqData.down;
    const flat = kospiData.flat + kosdaqData.flat;

    const diff = up - down;
    const total = up + down + flat;

    const upRatio = total > 0 ? up / total : 0;
    const downRatio = total > 0 ? down / total : 0;

    const prevDiff = toNumber(latestDbRow?.diff ?? memoryPrevDiff);
    const accel = diff - prevDiff;

    const kospi = kospiData.price > 0 ? kospiData.price : toNumber(latestDbRow?.kospi);
    const kosdaq = kosdaqData.price > 0 ? kosdaqData.price : toNumber(latestDbRow?.kosdaq);

    const stableFlowData = stabilizeFlowData(flowData, latestDbRow);

    const foreign = stableFlowData.foreign;
    const inst = stableFlowData.inst;
    const indiv = stableFlowData.indiv;

    const flowPower = foreign + inst;
    const prevFlowPower = toNumber(latestDbRow?.flowpower ?? memoryPrevFlowPower);
    const flowTrend = flowPower - prevFlowPower;
    const flowMomentum = Math.round(prevFlowPower * 0.7 + flowPower * 0.3);

    const recentRowsFromMemory = memoryRecentRows.slice(-3);
    const recentRows = recentRowsFromMemory.length > 0
      ? recentRowsFromMemory
      : latestDbRow
        ? [
            {
              diff: toNumber(latestDbRow.diff),
              foreignFlow: toNumber(latestDbRow.foreignflow),
              instFlow: toNumber(latestDbRow.instflow),
            },
          ]
        : [];

    const baseAlert = buildAlert(diff, accel, upRatio, downRatio);
    const marketTone = buildTone(diff);
    const marketScore = buildMarketScore(diff, upRatio, downRatio);

    const baseSignals = buildSignals(diff, prevDiff, accel, marketScore);
    const flowSignals = buildFlowSignals(
      foreign,
      inst,
      indiv,
      diff,
      accel,
      stableFlowData.source,
      prevFlowPower,
      recentRows
    );
    const signals = sortSignals([...baseSignals, ...flowSignals]);
    const signalAlert = buildSignalAlert(signals);
    const alert = signalAlert ?? baseAlert;
    const marketState = buildMarketState(
      diff,
      accel,
      marketScore,
      flowPower,
      flowTrend,
      signals[0] ?? null
    );

    let rowToSave: SupabaseLogPayload = {
      createdat,
      time: timeStr,
      up,
      down,
      flat,
      diff,
      accel,
      upratio: upRatio,
      downratio: downRatio,
      kospi,
      kosdaq,
      foreignflow: foreign,
      instflow: inst,
      indivflow: indiv,
      flowpower: flowPower,
      flowtrend: flowTrend,
      flowmomentum: flowMomentum,
      alert,
      markettone: marketTone,
      marketscore: marketScore,
      marketstate: marketState,
      signals,
    };

    rowToSave = applyFallbackIfNeeded(rowToSave, latestDbRow);

    const shouldSave = isValidMarketSnapshot(rowToSave, latestDbRow);
    let saveResult: { action: string; id: number | null } = {
      action: "skipped",
      id: null,
    };

    if (shouldSave) {
      if (lastSavedMinute !== minuteKey) {
        lastSavedMinute = minuteKey;
      }

      memoryRecentRows.push({
        diff: rowToSave.diff,
        foreignFlow: rowToSave.foreignflow,
        instFlow: rowToSave.instflow,
      });
      memoryRecentRows = memoryRecentRows.slice(-10);

      memoryPrevDiff = rowToSave.diff;
      memoryPrevFlowPower = rowToSave.flowpower;

      saveResult = await saveLogToSupabase(rowToSave);

      console.log("✅ LIVE 저장 처리:", timeStr, saveResult.action, "수급:", stableFlowData.source, {
        foreign: rowToSave.foreignflow,
        inst: rowToSave.instflow,
        indiv: rowToSave.indivflow,
      });
    } else {
      console.warn("⚠️ 비정상 데이터라 저장 생략:", {
        time: timeStr,
        up,
        down,
        flat,
        kospi,
        kosdaq,
        flowSource: stableFlowData.source,
      });
    }

    return Response.json({
      up: rowToSave.up,
      down: rowToSave.down,
      flat: rowToSave.flat,
      diff: rowToSave.diff,
      accel: rowToSave.accel,
      upRatio: rowToSave.upratio,
      downRatio: rowToSave.downratio,
      kospi: rowToSave.kospi,
      kosdaq: rowToSave.kosdaq,
      kospiUp: kospiData.up,
      kospiDown: kospiData.down,
      kosdaqUp: kosdaqData.up,
      kosdaqDown: kosdaqData.down,
      foreign: rowToSave.foreignflow,
      inst: rowToSave.instflow,
      indiv: rowToSave.indivflow,
      foreignFlow: rowToSave.foreignflow,
      instFlow: rowToSave.instflow,
      indivFlow: rowToSave.indivflow,
      flowSource: stableFlowData.source,
      flowPower: rowToSave.flowpower,
      prevFlowPower,
      flowTrend: rowToSave.flowtrend,
      flowMomentum: rowToSave.flowmomentum,
      alert: rowToSave.alert,
      baseAlert,
      topSignal: rowToSave.signals[0] ?? null,
      marketTone: rowToSave.markettone,
      marketScore: rowToSave.marketscore,
      marketState: rowToSave.marketstate,
      signals: rowToSave.signals,
      saved: shouldSave,
      saveAction: saveResult.action,
      minuteKey,
    });
  } catch (error: any) {
    return Response.json(
      {
        error: "KIS 요청 실패",
        detail: error.message,
      },
      { status: 500 }
    );
  }
}
