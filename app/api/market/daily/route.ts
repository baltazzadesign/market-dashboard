import { readMarketDay, requestedDate, marketError } from "@/lib/balta-data";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const date = requestedDate(request);
    const rows = await readMarketDay(date, request.signal);
    return Response.json({ ok: true, rows, count: rows.length, latest: rows.at(-1) ?? null, selectedDate: date, session: "09:00~15:30", flowUnit: "억원" });
  } catch (error) { return marketError(error); }
}
