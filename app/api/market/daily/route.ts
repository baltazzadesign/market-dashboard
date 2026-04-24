function toNumber(value: any) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 없음");
  }

  return {
    url: url.replace(/\/$/, ""),
    key,
  };
}

async function supabaseRequest(path: string) {
  const { url, key } = getSupabaseConfig();

  const res = await fetch(`${url}${path}`, {
    method: "GET",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase 조회 실패 ${res.status}: ${text}`);
  }

  return res.json();
}

function normalizeRow(row: any) {
  const foreign = toNumber(row.foreign ?? row.foreignFlow ?? row.foreignflow ?? 0);
  const inst = toNumber(row.inst ?? row.instFlow ?? row.instflow ?? 0);
  const indiv = toNumber(row.indiv ?? row.indivFlow ?? row.indivflow ?? 0);
  const flowPower = toNumber(row.flowPower ?? row.flowpower ?? foreign + inst);

  return {
    id: row.id,
    time: row.time ?? "",
    up: toNumber(row.up),
    down: toNumber(row.down),
    flat: toNumber(row.flat),
    diff: toNumber(row.diff),
    accel: toNumber(row.accel),
    upRatio: toNumber(row.upRatio ?? row.upratio),
    downRatio: toNumber(row.downRatio ?? row.downratio),
    kospi: toNumber(row.kospi),
    kosdaq: toNumber(row.kosdaq),
    foreign,
    inst,
    indiv,
    foreignFlow: foreign,
    instFlow: inst,
    indivFlow: indiv,
    flowPower,
    flowTrend: toNumber(row.flowTrend ?? row.flowtrend ?? 0),
    flowMomentum: toNumber(row.flowMomentum ?? row.flowmomentum ?? flowPower),
    alert: row.alert ?? "",
    marketTone: row.marketTone ?? row.markettone ?? "",
    marketScore: toNumber(row.marketScore ?? row.marketscore),
    marketState: row.marketState ?? row.marketstate ?? "",
    signals: row.signals ?? [],
    createdAt: row.createdAt ?? row.createdat ?? row.created_at ?? "",
    created_at: row.created_at ?? "",
  };
}

function getDateRange(date: string) {
  return {
    start: `${date}T00:00:00+09:00`,
    end: `${date}T23:59:59+09:00`,
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");

    let rows: any[] = [];

    if (date) {
      const { start, end } = getDateRange(date);

      rows = await supabaseRequest(
        `/rest/v1/logs?select=*&created_at=gte.${encodeURIComponent(
          start
        )}&created_at=lte.${encodeURIComponent(end)}&order=id.asc&limit=420`
      );
    } else {
      const latestRows = await supabaseRequest(
        "/rest/v1/logs?select=*&order=id.desc&limit=420"
      );

      rows = Array.isArray(latestRows) ? latestRows.reverse() : [];
    }

    const data = Array.isArray(rows) ? rows.map(normalizeRow) : [];

    return Response.json({
      ok: true,
      count: data.length,
      rows: data,
      latest: data[data.length - 1] ?? null,
      selectedDate: date ?? null,
    });
  } catch (error: any) {
    return Response.json(
      {
        ok: false,
        error: "데일리 로그 조회 실패",
        detail: error?.message ?? String(error),
      },
      { status: 500 }
    );
  }
}