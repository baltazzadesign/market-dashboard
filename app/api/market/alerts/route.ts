import db from "@/lib/db";

export async function GET() {
  try {
    // ===== 기존 ALERT 조회 =====
    const alerts = db
      .prepare(`
        SELECT 
          id,
          time,
          level,
          message,
          diff,
          accel,
          marketScore,
          createdAt
        FROM alert_logs
        ORDER BY id DESC
        LIMIT 30
      `)
      .all();

    // ===== 기존 ALERT summary =====
    const summary = db
      .prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN level = '강' THEN 1 ELSE 0 END) AS strong,
          SUM(CASE WHEN level = '중' THEN 1 ELSE 0 END) AS medium,
          SUM(CASE WHEN level = '약' THEN 1 ELSE 0 END) AS weak,
          MAX(createdAt) AS lastCreatedAt
        FROM alert_logs
        WHERE date(createdAt) = date('now', 'localtime')
      `)
      .get();

    // ===== 기존 최근 강한 ALERT =====
    const recentStrong = db
      .prepare(`
        SELECT
          id,
          time,
          level,
          message,
          diff,
          accel,
          marketScore,
          createdAt
        FROM alert_logs
        WHERE level = '강'
        ORDER BY id DESC
        LIMIT 1
      `)
      .get();

    // ===== 🔥 SIGNAL 조회 추가 =====
    const signals = db
      .prepare(`
        SELECT
          id,
          time,
          type,
          message,
          diff,
          prevDiff,
          accel,
          marketScore,
          createdAt
        FROM signal_logs
        ORDER BY id DESC
        LIMIT 30
      `)
      .all();

    // ===== 🔥 SIGNAL summary 추가 =====
    const signalSummary = db
      .prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN type = 'CROSS_UP' THEN 1 ELSE 0 END) AS crossUp,
          SUM(CASE WHEN type = 'CROSS_DOWN' THEN 1 ELSE 0 END) AS crossDown,
          SUM(CASE WHEN type = 'ACCEL_UP' THEN 1 ELSE 0 END) AS accelUp,
          SUM(CASE WHEN type = 'ACCEL_DOWN' THEN 1 ELSE 0 END) AS accelDown,
          SUM(CASE WHEN type = 'SCORE_OVERHEAT' THEN 1 ELSE 0 END) AS overheat,
          SUM(CASE WHEN type = 'SCORE_OVERSOLD' THEN 1 ELSE 0 END) AS oversold,
          MAX(createdAt) AS lastCreatedAt
        FROM signal_logs
        WHERE date(createdAt) = date('now', 'localtime')
      `)
      .get();

    return Response.json({
      ok: true,

      // 기존
      alerts,
      summary,
      recentStrong,

      // 🔥 추가
      signals,
      signalSummary,
    });
  } catch (error: any) {
    return Response.json(
      {
        ok: false,
        error: "ALERT/SIGNAL 조회 실패",
        detail: error.message,
      },
      { status: 500 }
    );
  }
}
