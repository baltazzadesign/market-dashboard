import { getKrxMarketStatus, parseAdditionalHolidays } from "@/lib/market-calendar";
export const dynamic = "force-dynamic";
// Public schedule metadata only: no quote, DB or KIS access and no credentials.
export async function GET() {
  return Response.json(getKrxMarketStatus(new Date(), parseAdditionalHolidays(process.env.MARKET_HOLIDAYS)),
    { headers: { "Cache-Control": "no-store" } });
}
