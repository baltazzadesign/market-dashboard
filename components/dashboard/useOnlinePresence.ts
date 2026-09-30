"use client";
import { useEffect, useState } from "react";

const REFRESH_MS = 30_000;
// Leave room for response latency so a 30-second tick does not skip a full cycle.
const SHARED_CACHE_MS = 25_000;
const CACHE_KEY = "baltatool.presence.snapshot.v1";
const LOCK_KEY = "baltatool.presence.heartbeat.v1";
type Snapshot = { count: number; checkedAt: number };
function snapshot(value: unknown): Snapshot | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<Snapshot>, age = Date.now() - (data.checkedAt ?? 0);
  return typeof data.count === "number" && Number.isSafeInteger(data.count) && data.count >= 0 && age >= 0 && age < SHARED_CACHE_MS ? data as Snapshot : null;
}
function cached(): Snapshot | null {
  try { return snapshot(JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null")); } catch { return null; }
}

export function useOnlinePresence() {
  const [state, setState] = useState<{ count: number | null; loading: boolean }>({ count: null, loading: true });
  useEffect(() => {
    let disposed = false, pending = false, unauthorized = false;
    let controller: AbortController | undefined;
    let channel: BroadcastChannel | undefined;
    try { channel = new BroadcastChannel(CACHE_KEY); } catch { /* storage events still synchronize tabs */ }
    const display = (data: Snapshot | null) => { if (!disposed) setState({ count: data?.count ?? null, loading: false }); };
    const share = (data: Snapshot | null) => {
      try { if (data) localStorage.setItem(CACHE_KEY, JSON.stringify(data)); else localStorage.removeItem(CACHE_KEY); } catch { /* cookie deduplication still works without storage */ }
      try { channel?.postMessage(data); } catch { /* channel can be closed during navigation */ }
    };
    const receive = (event: MessageEvent) => display(snapshot(event.data));
    const storage = (event: StorageEvent) => { if (event.key === CACHE_KEY) display(cached()); };
    channel?.addEventListener("message", receive);
    window.addEventListener("storage", storage);

    async function heartbeat() {
      if (disposed || document.visibilityState === "hidden" || unauthorized) return;
      if (!navigator.onLine) { display(null); return; }
      const saved = cached();
      if (saved) { display(saved); return; }
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 8000);
      try {
        const response = await fetch("/api/presence", { method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal });
        if (response.status === 401) unauthorized = true;
        const body = await response.json();
        const result = response.ok && body.ok === true ? snapshot({ count: body.count, checkedAt: Date.now() }) : null;
        if (!result) throw new Error("PRESENCE_UNAVAILABLE");
        if (!disposed) { display(result); share(result); }
      } catch {
        if (!disposed) { display(null); share(null); }
      } finally { window.clearTimeout(timeout); controller = undefined; }
    }
    async function tick() {
      if (pending || disposed || document.visibilityState === "hidden") return;
      pending = true;
      try {
        // Serialize initial cookie creation and reuse one recent request across tabs.
        // The shared HttpOnly cookie also deduplicates browsers without Web Locks.
        if (navigator.locks) await navigator.locks.request(LOCK_KEY, heartbeat);
        else await heartbeat();
      } catch { display(null); }
      finally { pending = false; }
    }
    const wake = () => { void tick(); };
    const offline = () => display(null);
    void tick();
    const timer = window.setInterval(wake, REFRESH_MS);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("offline", offline);
    window.addEventListener("pageshow", wake);
    return () => {
      disposed = true; controller?.abort(); window.clearInterval(timer);
      channel?.close(); window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake); window.removeEventListener("offline", offline); window.removeEventListener("pageshow", wake);
    };
  }, []);
  return state;
}
