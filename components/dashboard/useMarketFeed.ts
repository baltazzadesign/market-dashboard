"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeRows, normalizeRow, kstParts, OPEN_MINUTE, record, type MarketRow } from "@/lib/balta-model";

type Feed = { date: string; rows: MarketRow[]; loading: boolean; refreshing: boolean; error: string; warning: string; fetchedAt: string };
type DayCache = { date: string; rows: MarketRow[] };

const initial: Feed = { date: "", rows: [], loading: true, refreshing: false, error: "", warning: "", fetchedAt: "" };
const REGULAR_CLOSE_MINUTE = 15 * 60 + 30;
const AFTER_MARKET_CLOSE_MINUTE = 20 * 60;

function mergeRows(regularRows: MarketRow[], extendedRows: MarketRow[], live: MarketRow | null) {
  const merged = new Map<number, MarketRow>();
  for (const row of regularRows) merged.set(row.minute, row);
  for (const row of extendedRows) merged.set(row.minute, row);
  if (live) merged.set(live.minute, live);
  return [...merged.values()].sort((a,b)=>a.minute-b.minute);
}

export function useMarketFeed(date: string, collect: boolean, autoRefresh: boolean) {
  const [feed, setFeed] = useState<Feed>(initial);
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const regularCache = useRef<DayCache | null>(null);

  const refresh = useCallback(async (force = false) => {
    if (!date || (!force && (document.hidden || pending.current))) return;

    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const version = ++generation.current;
    const active = () => !controller.signal.aborted && version === generation.current;

    setFeed(old => {
      const base = old.date === date ? old : { ...initial, date };
      return force
        ? { ...base, refreshing: true, error: "", warning: "" }
        : base.error || base.warning
          ? { ...base, error: "", warning: "" }
          : base;
    });

    let warning = "";
    let live: MarketRow | null = null;

    try {
      const now = kstParts();
      const isToday = date === now.date;
      const isRegularSession = isToday && !now.weekend && now.minute >= OPEN_MINUTE && now.minute < REGULAR_CLOSE_MINUTE;
      const shouldLoadExtended = !isToday || (isToday && now.minute >= REGULAR_CLOSE_MINUTE);

      // /api/market/refresh는 정규장에만 호출합니다. CLOSE_MINUTE가 20:00으로 확장되어도
      // 15:30 이후 무거운 정규장 수집 API가 반복 호출되지 않도록 세션 경계를 분리합니다.
      if (collect && isRegularSession) {
        try {
          const response = await fetch("/api/market/refresh", {
            method: "POST",
            cache: "no-store",
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(65000)]),
          });
          if (response.status === 401) { window.location.assign("/login"); return; }
          const json = record(await response.json());
          if (!response.ok || json.error || json.ok === false) warning = String(json.error ?? "실시간 수집을 확인해 주세요.");
          else if (json.snapshotInvalidReason) warning = "실시간 데이터가 불완전해 저장된 기록을 표시합니다.";
          else if (String(json.date ?? json.createdat ?? "") === date) live = normalizeRow(json, date);
        } catch {
          if (active()) warning = "실시간 수집이 지연되어 저장 기록을 조회합니다.";
        }
      }

      if (!active()) return;

      // 정규장은 장중에 계속 바뀌지만 15:30 이후에는 고정됩니다.
      // 장후 자동 갱신에서는 정규장 전체 기록을 매번 다시 받지 않고 메모리 캐시를 재사용합니다.
      const cachedRegular = regularCache.current?.date === date ? regularCache.current.rows : null;
      const canReuseRegular = !force && !isRegularSession && cachedRegular !== null;

      const dailyPromise = canReuseRegular
        ? Promise.resolve<MarketRow[] | null>(null)
        : (async () => {
            const response = await fetch("/api/market/daily?date=" + encodeURIComponent(date), {
              cache: "no-store",
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
            });
            if (response.status === 401) { window.location.assign("/login"); return null; }
            const json = record(await response.json());
            if (!response.ok || json.ok !== true || !Array.isArray(json.rows)) {
              throw new Error(String(json.error ?? "기록을 불러오지 못했습니다."));
            }
            return normalizeRows(json.rows, date);
          })();

      const extendedPromise = shouldLoadExtended
        ? (async () => {
            try {
              const response = await fetch("/api/market/after-market?date=" + encodeURIComponent(date), {
                cache: "no-store",
                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
              });
              if (response.status === 401) { window.location.assign("/login"); return [] as MarketRow[]; }
              const json = record(await response.json());
              if (response.ok && json.ok === true && Array.isArray(json.rows)) return normalizeRows(json.rows, date);
            } catch {
              if (!warning) warning = "장후 기록 조회가 지연되고 있습니다.";
            }
            return [] as MarketRow[];
          })()
        : Promise.resolve([] as MarketRow[]);

      // 첫 로드/수동 새로고침은 daily + after-market을 병렬 조회합니다.
      const [freshRegular, extendedRows] = await Promise.all([dailyPromise, extendedPromise]);
      if (!active()) return;

      const regularRows = freshRegular ?? cachedRegular ?? [];
      if (freshRegular) regularCache.current = { date, rows: freshRegular };

      const validLive = live && live.session === "REGULAR" && live.up + live.down + live.flat > 0 ? live : null;
      const rows = mergeRows(regularRows, extendedRows, validLive);

      if (active()) {
        setFeed({ date, rows, loading: false, refreshing: false, error: "", warning, fetchedAt: kstParts().clock });
      }
    } catch (error) {
      if (active()) {
        setFeed(old => ({
          ...old,
          date,
          loading: false,
          refreshing: false,
          error: error instanceof Error ? error.message : "기록을 불러오지 못했습니다.",
          warning,
        }));
      }
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }, [date, collect]);

  useEffect(() => {
    regularCache.current = regularCache.current?.date === date ? regularCache.current : null;
    void refresh(true);
    return () => {
      ++generation.current;
      pending.current?.abort();
      pending.current = null;
    };
  }, [date, refresh]);

  useEffect(() => {
    if (!autoRefresh || !date || date !== kstParts().date) return;

    const refreshIfActive = () => {
      const now = kstParts();
      if (document.hidden || now.weekend || now.minute < OPEN_MINUTE || now.minute >= AFTER_MARKET_CLOSE_MINUTE) return;
      void refresh();
    };

    const interval = window.setInterval(refreshIfActive, 60000);
    const visible = () => { if (!document.hidden) refreshIfActive(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [autoRefresh, date, refresh]);

  return { ...(feed.date === date ? feed : { ...initial, date }), refresh };
}
