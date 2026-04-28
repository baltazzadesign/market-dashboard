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
  source: "LIVE" | "FALLBACK" | "EMPTY" | "ERROR";
  raw?: any;
};

type BreadthSource = "LIVE" | "FALLBACK" | "SKIPPED";

type BreadthData = {
  up: number;
  down: number;
  flat: number;
  price: number;
  raw?: any;
};

const MIN_NORMAL_BREADTH_TOTAL = 1500;
const BREADTH_DROP_FALLBACK_RATIO = 0.75;

type BreadthSource = "LIVE" | "FALLBACK" | "SKIPPED";

const MIN_NORMAL_BREADTH_TOTAL = 1500;
const BREADTH_DROP_FALLBACK_RATIO = 0.75;
const MARKET_OPEN_MINUTE = 9 * 60;
const MARKET_CLOSE_MINUTE = 15 * 60 + 30;

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

function normalizeMinuteValue(time: string) {
  if (!time) return "";
  const m = String(time).match(/(\d{1,2}):(\d{2})/);
  if (!m) return String(time);
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function getMinutesFromHHmm(time: string) {
  const normalized = normalizeMinuteValue(time);
  const m = normalized.match(/^(\d{2}):(\d{2})$/);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

function isRegularMarketTime(time: string) {
  const minutes = getMinutesFromHHmm(time);
  return minutes >= MARKET_OPEN_MINUTE && minutes <= MARKET_CLOSE_MINUTE;
}

function getKstEightAmMs(date = new Date()) {
  const kstDate = getKstDateString(date);
  return new Date(`${kstDate}T08:00:00+09:00`).getTime();
}

function shouldRefreshTokenForToday(tokenRow: StoredKisToken | null, nowMs: number) {
  const todayEightAmMs = getKstEightAmMs(new Date(nowMs));
  if (nowMs < todayEightAmMs) return false;

  const updatedAtMs = tokenRow?.updated_at ? new Date(tokenRow.updated_at).getTime() : 0;
  const safeUpdatedAtMs = Number.isFinite(updatedAtMs) ? updatedAtMs : 0;

  return safeUpdatedAtMs < todayEightAmMs;
}

type SavedLogRow = Partial<SupabaseLogPayload> & {
  id?: number;
  created_at?: string;
};

function normalizeSavedRow(row: any): SavedLogRow | null {
  if (!row || typeof row !== "object") return null;

  return {
    id: toNumber(row.id),
    createdat: row.createdat ?? row.createdAt ?? row.created_at ?? "",
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
      `/rest/v1/logs?select=*&createdat=eq.${encodeURIComponent(createdat)}&time=eq.${encodeURIComponent(time)}&order=id.desc&limit=1`
    );
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return normalizeSavedRow(rows[0]);
  } catch (error) {
    console.warn("Supabase 같은 분 로그 조회 실패:", error);
    return null;
  }
}

function hasSavedFlow(prevRow: SavedLogRow | null) {
  if (!prevRow) return false;
  return (
    toNumber(prevRow.foreignflow) !== 0 ||
    toNumber(prevRow.instflow) !== 0 ||
    toNumber(prevRow.indivflow) !== 0
  );
}

function applyGasStyleFlowFallback(flowData: FlowData, prevRow: SavedLogRow | null): FlowData {
  if (flowData.source === "LIVE") return flowData;

  if (hasSavedFlow(prevRow)) {
    return {
      foreign: toNumber(prevRow?.foreignflow),
      inst: toNumber(prevRow?.instflow),
      indiv: toNumber(prevRow?.indivflow),
      source: "FALLBACK",
      raw: flowData.raw,
    };
  }

  return flowData;
}

function isValidMarketSnapshot(row: SupabaseLogPayload) {
  const total = row.up + row.down + row.flat;
  return total >= MIN_NORMAL_BREADTH_TOTAL && total < 5000 && row.kospi > 1000 && row.kosdaq > 300;
}

function getBreadthTotal(row: Pick<SavedLogRow, "up" | "down" | "flat"> | null | undefined) {
  if (!row) return 0;
  return toNumber(row.up) + toNumber(row.down) + toNumber(row.flat);
}

function isNormalBreadthRow(row: SavedLogRow | null | undefined) {
  if (!row) return false;
  const total = getBreadthTotal(row);
  return (
    total >= MIN_NORMAL_BREADTH_TOTAL &&
    toNumber(row.up) > 0 &&
    toNumber(row.down) > 0 &&
    toNumber(row.kospi) > 1000 &&
    toNumber(row.kosdaq) > 300
  );
}

async function getLatestNormalBreadthRowFromSupabase() {
  try {
    const rows = await supabaseRequest("/rest/v1/logs?select=*&order=id.desc&limit=30");
    if (!Array.isArray(rows) || rows.length === 0) return null;

    for (const row of rows) {
      const normalized = normalizeSavedRow(row);
      if (isNormalBreadthRow(normalized)) return normalized;
    }

    return null;
  } catch (error) {
    console.warn("Supabase 최근 정상 breadth 조회 실패:", error);
    return null;
  }
}

function shouldFallbackBreadth(currentTotal: number, prevNormalTotal: number) {
  if (prevNormalTotal < MIN_NORMAL_BREADTH_TOTAL) return false;
  return currentTotal < Math.round(prevNormalTotal * BREADTH_DROP_FALLBACK_RATIO);
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


const KIS_TOKEN_ROW_ID = "default";
const KIS_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

type StoredKisToken = {
  id: string;
  access_token: string;
  expires_at: string;
  updated_at?: string;
};

function getStoredTokenExpireMs(tokenRow: StoredKisToken | null) {
  if (!tokenRow?.expires_at) return 0;
  const ms = new Date(tokenRow.expires_at).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

async function getStoredKisTokenFromSupabase() {
  try {
    const rows = await supabaseRequest(
      `/rest/v1/kis_tokens?select=*&id=eq.${encodeURIComponent(KIS_TOKEN_ROW_ID)}&limit=1`
    );

    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0] as StoredKisToken;
  } catch (error) {
    console.warn("Supabase KIS 토큰 조회 실패:", error);
    return null;
  }
}

async function saveKisTokenToSupabase(accessToken: string, expiresAtMs: number) {
  try {
    await supabaseRequest("/rest/v1/kis_tokens?on_conflict=id", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify([
        {
          id: KIS_TOKEN_ROW_ID,
          access_token: accessToken,
          expires_at: new Date(expiresAtMs).toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]),
    });
  } catch (error) {
    console.warn("Supabase KIS 토큰 저장 실패:", error);
  }
}

async function getAccessToken() {
  const appkey = process.env.KIS_APPKEY;
  const appsecret = process.env.KIS_APPSECRET;

  if (!appkey || !appsecret) {
    throw new Error("KIS_APPKEY 또는 KIS_APPSECRET 없음");
  }

  const now = Date.now();

  const storedToken = await getStoredKisTokenFromSupabase();
  const storedExpireMs = getStoredTokenExpireMs(storedToken);
  const needsDailyRefresh = shouldRefreshTokenForToday(storedToken, now);

  // 1) 같은 서버리스 인스턴스 안에서는 메모리 캐시 재사용
  // 단, 한국시간 오전 8시 이후 오늘 발급 이력이 없으면 새 토큰을 발급합니다.
  if (!needsDailyRefresh && cachedToken && now < cachedTokenExpireAt - KIS_TOKEN_REFRESH_BUFFER_MS) {
    return cachedToken;
  }

  // 2) Vercel 서버리스 인스턴스가 바뀌어도 Supabase 저장 토큰 재사용
  if (
    !needsDailyRefresh &&
    storedToken?.access_token &&
    storedExpireMs &&
    now < storedExpireMs - KIS_TOKEN_REFRESH_BUFFER_MS
  ) {
    const storedAccessToken = String(storedToken.access_token);
    cachedToken = storedAccessToken;
    cachedTokenExpireAt = storedExpireMs;
    return storedAccessToken;
  }

  // 3) 저장 토큰이 없거나 만료 임박이면 새로 발급
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

  const text = await res.text();
  let json: any = null;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`KIS 토큰 응답 JSON 파싱 실패: ${text}`);
  }

  if (!res.ok || !json.access_token) {
    throw new Error(`KIS 토큰 발급 실패 ${res.status}: ${text}`);
  }

  const expiresInSec = Number(json.expires_in ?? 86400);
  const safeExpiresInSec = Number.isFinite(expiresInSec) && expiresInSec > 0 ? expiresInSec : 86400;
  const expiresAtMs = now + safeExpiresInSec * 1000;

  const accessToken = String(json.access_token);

  cachedToken = accessToken;
  cachedTokenExpireAt = expiresAtMs;

  await saveKisTokenToSupabase(accessToken, expiresAtMs);

  return accessToken;
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

async function fetchBreadth(code: "0001" | "1001"): Promise<BreadthData> {
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

  if (!res.ok || String(data?.rt_cd ?? "0") !== "0") {
    console.warn("066 ERROR", code, JSON.stringify(data).slice(0, 1000));
    return { up: 0, down: 0, flat: 0, price: 0, raw: data };
  }

  const out = pickOutput(data);

  return {
    up: toNumber(out.ascn_issu_cnt ?? out.up_cnt),
    down: toNumber(out.down_issu_cnt ?? out.down_cnt),
    flat: toNumber(out.stnr_issu_cnt ?? out.flat_cnt),
    price: toNumber(out.bstp_nmix_prpr ?? out.stck_prpr ?? out.prpr),
    raw: data,
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
      "frgn_ntby_qty",
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
      "orgn_ntby_qty",
      "inst_ntby_qty",
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
      "prsn_ntby_qty",
      "indv_ntby_qty",
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
      "ntby_qty",
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
    const isMarketTime = isRegularMarketTime(timeStr);

    const [kospiData, kosdaqData, rawFlowData, latestDbRow, latestNormalBreadthRow] = await Promise.all([
      fetchBreadth("0001"),
      fetchBreadth("1001"),
      fetchInvestorFlow(),
      getLatestLogFromSupabase(),
      getLatestNormalBreadthRowFromSupabase(),
    ]);

    const liveUp = kospiData.up + kosdaqData.up;
    const liveDown = kospiData.down + kosdaqData.down;
    const liveFlat = kospiData.flat + kosdaqData.flat;
    const liveTotal = liveUp + liveDown + liveFlat;

    const prevNormalRow = latestNormalBreadthRow ?? (isNormalBreadthRow(latestDbRow) ? latestDbRow : null);
    const prevNormalTotal = getBreadthTotal(prevNormalRow);

    let breadthSource: BreadthSource = "LIVE";
    let breadthFallbackReason = "";

    let up = liveUp;
    let down = liveDown;
    let flat = liveFlat;

    if (shouldFallbackBreadth(liveTotal, prevNormalTotal) && prevNormalRow) {
      breadthSource = "FALLBACK";
      breadthFallbackReason = `066 합산 총합 급감: current=${liveTotal}, prev=${prevNormalTotal}`;
      up = toNumber(prevNormalRow.up);
      down = toNumber(prevNormalRow.down);
      flat = toNumber(prevNormalRow.flat);

      console.warn("⚠️ 066 breadth 급감 감지, 직전 정상값으로 대체:", {
        time: timeStr,
        liveTotal,
        prevNormalTotal,
        live: { up: liveUp, down: liveDown, flat: liveFlat },
        fallback: { up, down, flat },
      });
    }

    const diff = up - down;
    const total = up + down + flat;

    const upRatio = total > 0 ? up / total : 0;
    const downRatio = total > 0 ? down / total : 0;

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

    const prevDiff = toNumber(latestDbRow?.diff ?? memoryPrevDiff);
    const accel = diff - prevDiff;

    const kospi = kospiData.price > 0 ? kospiData.price : toNumber(prevNormalRow?.kospi ?? latestDbRow?.kospi);
    const kosdaq = kosdaqData.price > 0 ? kosdaqData.price : toNumber(prevNormalRow?.kosdaq ?? latestDbRow?.kosdaq);

    // GAS 방식과 동일하게 074 LIVE 실패 시에는 직전 정상 수급값을 대체 표시/저장합니다.
    // 대신 marketstate에 FLOW_FALLBACK 마커를 남겨 page.tsx에서 상태를 구분할 수 있게 합니다.
    const flowData = applyGasStyleFlowFallback(rawFlowData, latestDbRow);

    const foreign = flowData.foreign;
    const inst = flowData.inst;
    const indiv = flowData.indiv;

    const flowPower = foreign + inst;
    const prevFlowPower = toNumber(latestDbRow?.flowpower ?? memoryPrevFlowPower);
    const flowTrend = flowPower - prevFlowPower;
    const flowMomentum = Math.round(prevFlowPower * 0.7 + flowPower * 0.3);

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
      flowData.source,
      prevFlowPower,
      recentRows
    );
    const signals = sortSignals([...baseSignals, ...flowSignals]);
    const signalAlert = buildSignalAlert(signals);
    const alert = signalAlert ?? baseAlert;
    const baseMarketState = buildMarketState(
      diff,
      accel,
      marketScore,
      flowPower,
      flowTrend,
      signals[0] ?? null
    );
    const marketState = `${baseMarketState}|FLOW_${flowData.source}|BREADTH_${breadthSource}`;

    const rowToSave: SupabaseLogPayload = {
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

    let saveResult: { action: string; id: number | null } = {
      action: "skipped",
      id: null,
    };

    if (isMarketTime && isValidMarketSnapshot(rowToSave)) {
      lastSavedMinute = minuteKey;

      memoryRecentRows.push({
        diff,
        foreignFlow: foreign,
        instFlow: inst,
      });
      memoryRecentRows = memoryRecentRows.slice(-10);

      memoryPrevDiff = diff;
      memoryPrevFlowPower = flowPower;

      saveResult = await saveLogToSupabase(rowToSave);

      console.log("✅ LIVE 저장 처리:", timeStr, saveResult.action, "수급:", flowData.source, "breadth:", breadthSource, {
        foreign,
        inst,
        indiv,
      });
    } else {
      console.warn(isMarketTime ? "⚠️ 비정상 데이터라 저장 생략:" : "⏸️ 정규장 시간이 아니라 저장 생략:", {
        time: timeStr,
        marketSession: isMarketTime ? "REGULAR" : "OUT_OF_REGULAR_HOURS",
        up,
        down,
        flat,
        total,
        liveTotal,
        prevNormalTotal,
        kospi,
        kosdaq,
        flowSource: flowData.source,
        breadthSource,
        breadthFallbackReason,
      });
    }

    return Response.json({
      up,
      down,
      flat,
      diff,
      accel,
      upRatio,
      downRatio,
      kospi,
      kosdaq,
      kospiUp: kospiData.up,
      kospiDown: kospiData.down,
      kosdaqUp: kosdaqData.up,
      kosdaqDown: kosdaqData.down,
      marketSession: isMarketTime ? "REGULAR" : "OUT_OF_REGULAR_HOURS",
      liveBreadthTotal: liveTotal,
      savedBreadthTotal: total,
      prevNormalBreadthTotal: prevNormalTotal,
      breadthSource,
      breadthFallbackReason,
      foreign,
      inst,
      indiv,
      foreignFlow: foreign,
      instFlow: inst,
      indivFlow: indiv,
      flowSource: flowData.source,
      rawFlowSource: rawFlowData.source,
      flowPower,
      prevFlowPower,
      flowTrend,
      flowMomentum,
      alert,
      baseAlert,
      topSignal: signals[0] ?? null,
      marketTone,
      marketScore,
      marketState,
      signals,
      saved: saveResult.action !== "skipped",
      saveAction: saveResult.action,
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
