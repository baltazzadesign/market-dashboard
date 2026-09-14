import { hasDashboardAccess } from "@/lib/balta-access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KIS_BASE =
  process.env.KIS_BASE ?? "https://openapi.koreainvestment.com:9443";
const CUSTTYPE = process.env.KIS_CUSTTYPE ?? "P";
const FETCH_TIMEOUT_MS = 8000;

type StoredKisToken = {
  access_token?: string;
  expires_at?: string;
};

type AnyRow = Record<string, any>;

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return {
    url: url.replace(/\/$/, "").replace(/\/rest\/v1$/, ""),
    key,
  };
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ?? controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

async function getStoredKisToken() {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error(
      "SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다."
    );
  }

  const res = await fetchWithTimeout(
    `${config.url}/rest/v1/kis_tokens?select=access_token,expires_at&id=eq.default&limit=1`,
    {
      headers: {
        apikey: config.key,
        authorization: `Bearer ${config.key}`,
      },
    }
  );

  const text = await res.text();

  if (!res.ok) {
    throw new Error(
      `Supabase KIS 토큰 조회 실패 ${res.status}: ${text || res.statusText}`
    );
  }

  if (!text.trim()) {
    throw new Error("Supabase KIS 토큰 응답이 비어 있습니다.");
  }

  const rows = JSON.parse(text) as StoredKisToken[];
  const row = rows?.[0];

  if (!row?.access_token) {
    throw new Error(
      "Supabase kis_tokens에 access_token이 없습니다. 기존 live/cron을 한 번 실행한 뒤 다시 테스트해 주세요."
    );
  }

  if (row.expires_at) {
    const expiresAt = new Date(row.expires_at).getTime();

    if (Number.isFinite(expiresAt) && expiresAt <= Date.now() + 60_000) {
      throw new Error(
        "Supabase에 저장된 KIS 토큰이 만료됐습니다. 기존 live/cron을 한 번 실행한 뒤 다시 테스트해 주세요."
      );
    }
  }

  return String(row.access_token);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function num(value: any) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function stockCode(row: AnyRow) {
  return String(
    row?.mksc_shrn_iscd ??
      row?.stck_shrn_iscd ??
      row?.pdno ??
      row?.stck_code ??
      row?.code ??
      ""
  ).trim();
}

function classify(row: AnyRow): "UP" | "DOWN" | "FLAT" | "UNKNOWN" {
  const sign = String(
    row?.prdy_vrss_sign ??
      row?.prdy_vrss_sign_code ??
      row?.sign ??
      ""
  ).trim();

  // KIS 전일대비부호: 1 상한, 2 상승, 3 보합, 4 하한, 5 하락
  if (sign === "1" || sign === "2") return "UP";
  if (sign === "4" || sign === "5") return "DOWN";
  if (sign === "3") return "FLAT";

  const rateCandidates = [
    row?.prdy_ctrt,
    row?.prdy_vrss_rate,
    row?.fluctuation_rate,
    row?.rate,
  ];

  for (const value of rateCandidates) {
    if (value === null || value === undefined || value === "") continue;
    const rate = num(value);
    if (rate > 0) return "UP";
    if (rate < 0) return "DOWN";
    return "FLAT";
  }

  const diffCandidates = [
    row?.prdy_vrss,
    row?.prdy_vrss_amt,
    row?.change,
  ];

  for (const value of diffCandidates) {
    if (value === null || value === undefined || value === "") continue;
    const diff = num(value);
    if (diff > 0) return "UP";
    if (diff < 0) return "DOWN";
    return "FLAT";
  }

  return "UNKNOWN";
}

type PageDebug = {
  page: number;
  requestTrCont: string;
  responseTrCont: string;
  status: number;
  rowCount: number;
  uniqueAdded: number;
  firstCode: string;
  lastCode: string;
  msgCode: string;
  msg: string;
};

async function fetchMarketRanking(
  token: string,
  marketCode: "0001" | "1001",
  maxPages: number,
  requestedCount: number
) {
  const appkey = process.env.KIS_APPKEY;
  const appsecret = process.env.KIS_APPSECRET;

  if (!appkey || !appsecret) {
    throw new Error("KIS_APPKEY 또는 KIS_APPSECRET이 없습니다.");
  }

  const unique = new Map<string, AnyRow>();
  const pages: PageDebug[] = [];
  const fingerprints = new Set<string>();

  let requestTrCont = "";
  let continuationSeen = false;
  let stoppedReason = "max-pages";

  for (let page = 1; page <= maxPages; page += 1) {
    const qs = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J",
      FID_COND_SCR_DIV_CODE: "20170",
      FID_INPUT_ISCD: marketCode,
      FID_RANK_SORT_CLS_CODE: "0000",
      FID_INPUT_CNT_1: String(requestedCount),
      FID_PRC_CLS_CODE: "0",
      FID_INPUT_PRICE_1: "0",
      FID_INPUT_PRICE_2: "1000000",
      FID_VOL_CNT: "0",
      FID_TRGT_CLS_CODE: "0",
      FID_TRGT_EXLS_CLS_CODE: "0",
      FID_DIV_CLS_CODE: "0",
      FID_RSFL_RATE1: "-30",
      FID_RSFL_RATE2: "30",
    });

    const res = await fetchWithTimeout(
      `${KIS_BASE}/uapi/domestic-stock/v1/ranking/fluctuation?${qs.toString()}`,
      {
        method: "GET",
        headers: {
          "content-type": "application/json; charset=utf-8",
          authorization: `Bearer ${token}`,
          appkey,
          appsecret,
          tr_id: "FHPST01700000",
          custtype: CUSTTYPE,
          ...(requestTrCont ? { tr_cont: requestTrCont } : {}),
        },
      }
    );

    const responseTrCont = String(res.headers.get("tr_cont") ?? "").trim();
    const bodyText = await res.text();

    let data: any = null;
    try {
      data = bodyText.trim() ? JSON.parse(bodyText) : {};
    } catch {
      throw new Error(
        `등락률 순위 JSON 파싱 실패 market=${marketCode} page=${page}: ${bodyText.slice(
          0,
          500
        )}`
      );
    }

    const rows = Array.isArray(data?.output) ? data.output : [];

    if (!res.ok || String(data?.rt_cd ?? "") !== "0") {
      pages.push({
        page,
        requestTrCont,
        responseTrCont,
        status: res.status,
        rowCount: rows.length,
        uniqueAdded: 0,
        firstCode: stockCode(rows[0] ?? {}),
        lastCode: stockCode(rows[rows.length - 1] ?? {}),
        msgCode: String(data?.msg_cd ?? ""),
        msg: String(data?.msg1 ?? ""),
      });

      stoppedReason = `api-error:${data?.msg_cd ?? res.status}`;
      break;
    }

    const first = stockCode(rows[0] ?? {});
    const last = stockCode(rows[rows.length - 1] ?? {});
    const fingerprint = `${rows.length}:${first}:${last}`;

    if (fingerprints.has(fingerprint) && page > 1) {
      pages.push({
        page,
        requestTrCont,
        responseTrCont,
        status: res.status,
        rowCount: rows.length,
        uniqueAdded: 0,
        firstCode: first,
        lastCode: last,
        msgCode: String(data?.msg_cd ?? ""),
        msg: "duplicate page detected",
      });

      stoppedReason = "duplicate-page";
      break;
    }

    fingerprints.add(fingerprint);

    let uniqueAdded = 0;

    rows.forEach((row: AnyRow, index: number) => {
      const code = stockCode(row);
      const key =
        code ||
        `${page}:${index}:${String(row?.hts_kor_isnm ?? row?.name ?? "")}`;

      if (!unique.has(key)) uniqueAdded += 1;
      unique.set(key, row);
    });

    pages.push({
      page,
      requestTrCont,
      responseTrCont,
      status: res.status,
      rowCount: rows.length,
      uniqueAdded,
      firstCode: first,
      lastCode: last,
      msgCode: String(data?.msg_cd ?? ""),
      msg: String(data?.msg1 ?? ""),
    });

    if (responseTrCont === "M") {
      continuationSeen = true;
      requestTrCont = "N";

      // KIS 연속 호출 보호
      await sleep(250);
      continue;
    }

    stoppedReason = "no-more-pages";
    break;
  }

  let up = 0;
  let down = 0;
  let flat = 0;
  let unknown = 0;

  for (const row of unique.values()) {
    const kind = classify(row);
    if (kind === "UP") up += 1;
    else if (kind === "DOWN") down += 1;
    else if (kind === "FLAT") flat += 1;
    else unknown += 1;
  }

  const sample = Array.from(unique.values())
    .slice(0, 3)
    .map((row) => ({
      code: stockCode(row),
      name: String(row?.hts_kor_isnm ?? row?.stck_kor_isnm ?? ""),
      sign: String(row?.prdy_vrss_sign ?? ""),
      rate: row?.prdy_ctrt ?? null,
      diff: row?.prdy_vrss ?? null,
      keys: Object.keys(row).slice(0, 20),
    }));

  return {
    market: marketCode === "0001" ? "KOSPI" : "KOSDAQ",
    marketCode,
    requestedCount,
    maxPages,
    pagesFetched: pages.length,
    continuationSeen,
    stoppedReason,
    uniqueRows: unique.size,
    classifiedRows: up + down + flat,
    up,
    down,
    flat,
    unknown,
    pages,
    sample,
  };
}

export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) {
    return Response.json(
      { ok: false, error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  try {
    const url = new URL(request.url);

    const maxPages = Math.min(
      Math.max(Number(url.searchParams.get("pages") ?? 8) || 8, 1),
      20
    );

    const requestedCount = Math.min(
      Math.max(Number(url.searchParams.get("count") ?? 30) || 30, 1),
      100
    );

    const token = await getStoredKisToken();

    const [kospi, kosdaq] = await Promise.all([
      fetchMarketRanking(token, "0001", maxPages, requestedCount),
      fetchMarketRanking(token, "1001", maxPages, requestedCount),
    ]);

    const likelyUsable =
      kospi.classifiedRows > 100 &&
      kosdaq.classifiedRows > 100 &&
      (kospi.continuationSeen || kospi.stoppedReason === "no-more-pages") &&
      (kosdaq.continuationSeen || kosdaq.stoppedReason === "no-more-pages");

    return Response.json(
      {
        ok: true,
        purpose:
          "KIS 등락률 순위(v1_국내주식-088)가 전체 시장 breadth 계산에 쓸 수 있는지 검증",
        trId: "FHPST01700000",
        endpoint: "/uapi/domestic-stock/v1/ranking/fluctuation",
        likelyUsable,
        interpretation: likelyUsable
          ? "여러 종목과 continuation 응답이 확인됐습니다. pages를 늘려 전체 시장까지 이어지는지 추가 검증할 가치가 있습니다."
          : "현재 결과만으로는 전체 시장 breadth 대체 소스로 확정할 수 없습니다. pages/continuation/uniqueRows를 확인하세요.",
        kospi,
        kosdaq,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    console.error("BREADTH_RANKING_TEST_ERROR", error);

    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
