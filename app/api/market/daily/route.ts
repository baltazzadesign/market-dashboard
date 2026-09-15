import { readMarketDay, requestedDate, marketError } from "@/lib/balta-data";

export const dynamic = "force-dynamic";

type DayRows = Awaited<ReturnType<typeof readMarketDay>>;
type CacheEntry = { expiresAt: number; rows: DayRows };

const dayCache = new Map<string, CacheEntry>();
const REGULAR_CLOSE_MINUTE = 15 * 60 + 30;
const REGULAR_SETTLE_MINUTE = REGULAR_CLOSE_MINUTE + 5;

function kstNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minute: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function cacheTtl(date: string) {
  const now = kstNow();
  if (date < now.date) return 5 * 60 * 1000;
  if (date === now.date && now.minute >= REGULAR_SETTLE_MINUTE) return 5 * 60 * 1000;
  return 12 * 1000;
}

function pruneCache() {
  if (dayCache.size <= 8) return;
  const now = Date.now();
  for (const [key, value] of dayCache) {
    if (value.expiresAt <= now) dayCache.delete(key);
  }
  while (dayCache.size > 8) {
    const first = dayCache.keys().next().value as string | undefined;
    if (!first) break;
    dayCache.delete(first);
  }
}

export async function GET(request: Request) {
  try {
    const date = requestedDate(request);
    const now = Date.now();
    const cached = dayCache.get(date);
    let rows: DayRows;

    if (cached && cached.expiresAt > now) {
      rows = cached.rows;
    } else {
      rows = await readMarketDay(date, request.signal);
      dayCache.set(date, { rows, expiresAt: now + cacheTtl(date) });
      pruneCache();
    }

    return Response.json({
      ok: true,
      rows,
      count: rows.length,
      latest: rows.at(-1) ?? null,
      selectedDate: date,
      session: "09:00~15:30",
      flowUnit: "억원",
    });
  } catch (error) {
    return marketError(error);
  }
}
