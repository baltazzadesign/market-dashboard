// Server-only helper. Retains the existing access code without placing it in the client bundle.
export function accessCode() { return process.env.BALTATOOL_ACCESS_CODE || "balta260427"; }
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
export function hasDashboardAccess(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const raw = cookie.split(";").map(s => s.trim()).find(s => s.startsWith("access="))?.slice(7);
  try { return Boolean(raw && decodeURIComponent(raw) === accessCode()); } catch { return false; }
}
