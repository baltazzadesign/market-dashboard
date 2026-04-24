import db from "@/lib/db";

function toNumber(value: any) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function normalizeRow(row: any) {
  const foreign = toNumber(row.foreign ?? row.foreignFlow ?? 0);
  const inst = toNumber(row.inst ?? row.instFlow ?? 0);
  const indiv = toNumber(row.indiv ?? row.indivFlow ?? 0);
  const flowPower = toNumber(row.flowPower ?? foreign + inst);

  return {
    id: row.id,
    time: row.time ?? "",
    up: toNumber(row.up),
    down: toNumber(row.down),
    flat: toNumber(row.flat),
    diff: toNumber(row.diff),
    accel: toNumber(row.accel),
    upRatio: toNumber(row.upRatio),
    downRatio: toNumber(row.downRatio),
    kospi: toNumber(row.kospi),
    kosdaq: toNumber(row.kosdaq),
    foreign,
    inst,
    indiv,
    foreignFlow: foreign,
    instFlow: inst,
    indivFlow: indiv,
    flowPower,
    flowTrend: toNumber(row.flowTrend ?? 0),
    flowMomentum: toNumber(row.flowMomentum ?? flowPower),
    alert: row.alert ?? "",
    marketTone: row.marketTone ?? "",
    marketScore: toNumber(row.marketScore),
    marketState: row.marketState ?? "",
    createdAt: row.createdAt ?? "",
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");

    let rows: any[] = [];

    if (date) {
      rows = db
        .prepare(`
          SELECT *
          FROM logs
          WHERE DATE(createdAt) = ?
          ORDER BY id ASC
        `)
        .all(date) as any[];
    } else {
      rows = (
        db
          .prepare(`
            SELECT *
            FROM logs
            ORDER BY id DESC
            LIMIT 420
          `)
          .all() as any[]
      ).reverse();
    }

    const data = rows.map(normalizeRow);

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