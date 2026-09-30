// Server-only module: never import into client components.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const PRESENCE_COOKIE = "balta_presence_v1";
export const PRESENCE_WINDOW_SECONDS = 90;
export const PRESENCE_INTERVAL_SECONDS = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function signature(id: string, key: string) {
  return createHmac("sha256", key).update("baltatool-presence-v1:" + id).digest("base64url");
}
export function presenceVisitor(cookie: string, key: string) {
  const token = cookie.split(";").map(v => v.trim()).find(v => v.startsWith(PRESENCE_COOKIE + "="))?.slice(PRESENCE_COOKIE.length + 1) ?? "";
  const [id, signed, extra] = token.split(".");
  if (id && UUID.test(id) && signed && /^[A-Za-z0-9_-]{43}$/.test(signed) && extra === undefined) {
    const expected = signature(id, key);
    if (timingSafeEqual(Buffer.from(signed), Buffer.from(expected))) return { id, token };
  }
  const fresh = randomUUID();
  return { id: fresh, token: fresh + "." + signature(fresh, key) };
}
export class PresenceError extends Error {
  constructor(public code: "PRESENCE_NOT_CONFIGURED" | "PRESENCE_SETUP_REQUIRED" | "PRESENCE_UNAVAILABLE") { super(code); }
}
export function presenceConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "").replace(/\/rest\/v1$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new PresenceError("PRESENCE_NOT_CONFIGURED");
  return { url, key };
}
export async function heartbeatPresence(id: string, config: { url: string; key: string }, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(6000);
  let response: Response;
  try {
    response = await fetch(config.url + "/rest/v1/rpc/baltatool_presence_heartbeat", {
      method: "POST", cache: "no-store",
      headers: { "content-type": "application/json", apikey: config.key, authorization: "Bearer " + config.key },
      body: JSON.stringify({ p_visitor: id }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch { throw new PresenceError("PRESENCE_UNAVAILABLE"); }
  if (!response.ok) throw new PresenceError(response.status === 404 ? "PRESENCE_SETUP_REQUIRED" : "PRESENCE_UNAVAILABLE");
  const body: unknown = await response.json().catch(() => null);
  const row = Array.isArray(body) && body.length === 1 ? body[0] : null;
  if (!row || !["number", "string"].includes(typeof row.online_count) || String(row.online_count).trim() === "") throw new PresenceError("PRESENCE_UNAVAILABLE");
  const count = Number(row.online_count), asOf = row.as_of;
  if (!Number.isSafeInteger(count) || count < 0 || typeof asOf !== "string" || !Number.isFinite(Date.parse(asOf))) throw new PresenceError("PRESENCE_UNAVAILABLE");
  return { count, asOf };
}
