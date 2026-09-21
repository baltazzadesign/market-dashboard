"use client";
import { useEffect, useState } from 'react';
export function useTerminalData<T>(url: string | null, interval = 60_000) {
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string; loading: boolean }>({ url, data: null, error: '', loading: !!url });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let busy = false;
    setState(old => ({ url, data: old.url === url ? old.data : null, error: '', loading: true }));
    const load = async () => {
      if (busy) return; busy = true;
      try {
        const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
        if (response.status === 401) { window.location.assign('/login'); return; }
        const body = await response.json();
        if (!response.ok || body.ok === false) throw new Error(body.error || '데이터를 불러오지 못했습니다.');
        if (!controller.signal.aborted) setState({ url, data: body as T, error: '', loading: false });
      } catch (error) { if (!controller.signal.aborted) setState(old => ({ url, data: old.url === url ? old.data : null, error: error instanceof Error ? error.message : '조회 오류', loading: false })); }
      finally { busy = false; }
    };
    void load();
    const timer = interval ? window.setInterval(() => { if (!document.hidden) void load(); }, interval) : null;
    return () => { controller.abort(); if (timer) clearInterval(timer); };
  }, [url, interval, nonce]);
  return { data: state.url === url ? state.data : null, error: state.url === url ? state.error : '', loading: !!url && (state.url !== url || state.loading), refresh: () => setNonce(v => v + 1) };
}
