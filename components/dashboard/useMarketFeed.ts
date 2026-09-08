"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeRows, normalizeRow, kstParts, OPEN_MINUTE, CLOSE_MINUTE, record, type MarketRow } from "@/lib/balta-model";
type Feed = { date: string; rows: MarketRow[]; loading: boolean; refreshing: boolean; error: string; warning: string; fetchedAt: string };
const initial: Feed = { date: "", rows: [], loading: true, refreshing: false, error: "", warning: "", fetchedAt: "" };
export function useMarketFeed(date: string, collect: boolean, autoRefresh: boolean) {
  const [feed, setFeed] = useState<Feed>(initial);
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async (force = false) => {
    if (!date || (!force && (document.hidden || pending.current))) return;
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    const version = ++generation.current;
    const active = () => !controller.signal.aborted && version === generation.current;
    setFeed(old => ({ ...(old.date === date ? old : { ...initial, date }), refreshing: true, error: "", warning: "" }));
    let warning = "";
    let live: MarketRow | null = null;
    try {
      const now = kstParts();
      if (collect && date === now.date && !now.weekend && now.minute >= OPEN_MINUTE && now.minute <= CLOSE_MINUTE) {
        try {
          const response = await fetch("/api/market/refresh", { method: "POST", cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(65000)]) });
          if (response.status === 401) { window.location.assign("/login"); return; }
          const json = record(await response.json());
          if (!response.ok || json.error || json.ok === false) warning = String(json.error ?? "실시간 수집을 확인해 주세요.");
          else if (json.snapshotInvalidReason) warning = "실시간 데이터가 불완전해 저장된 기록을 표시합니다.";
          else if (json.date === date) live = normalizeRow(json, date);
        } catch { if (active()) warning = "실시간 수집이 지연되어 저장 기록을 조회합니다."; }
      }
      if (!active()) return;
      const response = await fetch("/api/market/daily?date=" + encodeURIComponent(date), { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
      if (response.status === 401) { window.location.assign("/login"); return; }
      const json = record(await response.json());
      if (!response.ok || json.ok !== true || !Array.isArray(json.rows)) throw new Error(String(json.error ?? "기록을 불러오지 못했습니다."));
      let rows = normalizeRows(json.rows, date);
      if (live && live.minute >= OPEN_MINUTE && live.minute <= CLOSE_MINUTE && live.up + live.down + live.flat > 0) {
        rows = [...rows.filter(row => row.minute !== live!.minute), live].sort((a,b) => a.minute - b.minute);
      }
      if (active()) setFeed({ date, rows, loading: false, refreshing: false, error: "", warning, fetchedAt: kstParts().clock });
    } catch (error) {
      if (active()) setFeed(old => ({ ...old, date, loading: false, refreshing: false, error: error instanceof Error ? error.message : "기록을 불러오지 못했습니다.", warning }));
    } finally {
      if (pending.current === controller) pending.current = null;
      if (active()) setFeed(old => ({ ...old, refreshing: false, loading: false }));
    }
  }, [date, collect]);
  useEffect(() => {
    void refresh(true);
    return () => { ++generation.current; pending.current?.abort(); pending.current = null; };
  }, [refresh]);
  useEffect(() => {
    if (!autoRefresh || !date || date !== kstParts().date) return;
    const interval = setInterval(() => { void refresh(); }, 60000);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", visible); };
  }, [autoRefresh, date, refresh]);
  return { ...(feed.date === date ? feed : { ...initial, date }), refresh };
}
