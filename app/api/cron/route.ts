import { GET as collectMarket } from "../market/live/route";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
// The collector validates CRON_SECRET itself. No public self-fetch or lost Authorization header.
export async function GET(request: Request) { return collectMarket(request); }
