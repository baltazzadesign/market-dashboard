import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { focusManager, QueryCache, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ApiError, BaltaClient, normalizeOrigin, type Session } from '../data/client';
import { demoDaily, demoHistory, demoSectors } from '../data/demo';
import { kstDate, type Market } from '../data/model';

const DEFAULT_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.baltatool.com';
type Preferences = { baseUrl: string; interval: 0 | 60 | 120; market: Market };
type Context = {
  ready: boolean; mode: 'live' | 'demo'; session: Session | null; prefs: Preferences; date: string;
  setDate: (date: string) => void; message: string; login: (base: string, code: string) => Promise<void>;
  enterDemo: () => void; logout: () => Promise<void>; setPreferences: (p: Partial<Preferences>) => Promise<void>;
  client: BaltaClient; active: boolean;
};
const Context = createContext<Context | null>(null);
async function readStorage(key: string) { return Platform.OS === 'web' ? null : SecureStore.getItemAsync(key); }
async function writeStorage(key: string, value: string | null) {
  if (Platform.OS === 'web') return;
  if (value === null) await SecureStore.deleteItemAsync(key); else await SecureStore.setItemAsync(key, value);
}
export function AppProvider({ children }: React.PropsWithChildren) {
  const [ready, setReady] = useState(false), [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<'live' | 'demo'>('live'), [message, setMessage] = useState('');
  const [prefs, setPrefs] = useState<Preferences>({ baseUrl: DEFAULT_BASE, interval: 60, market: 'kospi' });
  const [date, setDate] = useState(kstDate()), todayRef = useRef(kstDate());
  const [active, setActive] = useState(AppState.currentState === 'active' || Platform.OS === 'web');
  const [queryClient] = useState(() => new QueryClient({
    queryCache: new QueryCache({ onError: error => { if (error instanceof ApiError && error.status === 401) {
      setSession(null); setMessage(error.message); void writeStorage('balta-session', null).catch(() => {});
    } } }),
    defaultOptions: { queries: { staleTime: 45_000, gcTime: 10 * 60_000, retry: (count, error) => !(error instanceof ApiError && [401, 403, 404, 429].includes(error.status)) && count < 1, refetchOnWindowFocus: true } },
  }));
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [p, s] = await Promise.all([readStorage('balta-preferences'), readStorage('balta-session')]);
        let restoredBase = normalizeOrigin(DEFAULT_BASE, __DEV__);
        if (p) { const v = JSON.parse(p) as Partial<Preferences>; restoredBase = normalizeOrigin(v.baseUrl || DEFAULT_BASE, __DEV__);
          if (alive) setPrefs({ baseUrl: restoredBase, interval: v.interval === 0 || v.interval === 120 ? v.interval : 60, market: v.market === 'kosdaq' ? 'kosdaq' : 'kospi' }); }
        if (s) { const v = JSON.parse(s) as Session; if (v.baseUrl === restoredBase && typeof v.cookie === 'string' && /^access=[^;\r\n]+$/.test(v.cookie) && v.expiresAt > Date.now() && alive) setSession(v); }
      } catch { if (alive) setMessage('저장된 설정을 읽지 못했습니다. 서버 주소를 확인한 뒤 로그인해 주세요.'); }
      finally { if (alive) setReady(true); }
    })();
    const sub = AppState.addEventListener('change', state => { const next = state === 'active'; setActive(next); focusManager.setFocused(next); });
    const timer = setInterval(() => { const next = kstDate(); if (next !== todayRef.current) { const prev = todayRef.current; todayRef.current = next; setDate(value => value === prev ? next : value); } }, 30_000);
    return () => { alive = false; sub.remove(); clearInterval(timer); };
  }, []);
  useEffect(() => { if (!session) { void queryClient.cancelQueries(); queryClient.clear(); } }, [session, queryClient]);
  const client = useMemo(() => new BaltaClient(prefs.baseUrl, session), [prefs.baseUrl, session]);
  const value: Context = { ready, mode, session, prefs, date, setDate, message, client, active,
    login: async (base, code) => {
      if (Platform.OS === 'web') throw new Error('실제 서버 로그인은 iOS/Android 앱에서 이용해 주세요. 웹에서는 예시 화면을 볼 수 있습니다.');
      const baseUrl = normalizeOrigin(base, __DEV__);
      const next = await new BaltaClient(baseUrl, null).login(code);
      const nextPrefs = { ...prefs, baseUrl };
      await writeStorage('balta-preferences', JSON.stringify(nextPrefs));
      await writeStorage('balta-session', JSON.stringify(next));
      await queryClient.cancelQueries(); queryClient.clear();
      setPrefs(nextPrefs); setMode('live'); setSession(next); setMessage(''); setDate(kstDate());
    },
    enterDemo: () => { queryClient.clear(); setSession(null); setMode('demo'); setMessage(''); },
    logout: async () => {
      await queryClient.cancelQueries(); queryClient.clear(); setSession(null); setMode('live'); setMessage('');
      try { await writeStorage('balta-session', null); } catch { setMessage('기기에서 로그인 저장값을 지우지 못했습니다. 앱 저장 공간을 초기화해 주세요.'); }
      // Explicit Cookie transport does not share the browser's cookie jar. The local
      // session is cleared immediately even when the server is unreachable.
      if (session) void client.logout().catch(() => {});
    },
    setPreferences: async patch => {
      const next = { ...prefs, ...patch };
      next.baseUrl = normalizeOrigin(next.baseUrl, __DEV__);
      await writeStorage('balta-preferences', JSON.stringify(next));
      if (next.baseUrl !== prefs.baseUrl) { await queryClient.cancelQueries(); queryClient.clear(); await writeStorage('balta-session', null); setSession(null); setMode('live'); }
      setPrefs(next);
    },
  };
  return <QueryClientProvider client={queryClient}><Context.Provider value={value}>{children}</Context.Provider></QueryClientProvider>;
}
export function useApp() { const value = useContext(Context); if (!value) throw new Error('AppProvider missing'); return value; }
export function useDay(selected?: string, enabled = true) {
  const app = useApp(), date = selected ?? app.date;
  return useQuery({ queryKey: [app.mode, app.prefs.baseUrl, 'daily', date],
    queryFn: ({ signal }) => app.mode === 'demo' ? demoDaily(date) : app.client.daily(date, signal),
    enabled: enabled && app.ready && (app.mode === 'demo' || !!app.session),
    refetchInterval: app.mode === 'live' && enabled && app.active && date === kstDate() && app.prefs.interval ? app.prefs.interval * 1000 : false,
    refetchIntervalInBackground: false });
}
export function useHistory(month: string, enabled = true) {
  const app = useApp();
  return useQuery({ queryKey: [app.mode, app.prefs.baseUrl, 'history', month], queryFn: ({ signal }) => app.mode === 'demo' ? demoHistory(month) : app.client.history(month, signal),
    enabled: enabled && app.ready && (app.mode === 'demo' || !!app.session), staleTime: 120_000 });
}
export function useSectors(enabled = true) {
  const app = useApp();
  return useQuery({ queryKey: [app.mode, app.prefs.baseUrl, 'sectors', app.date], queryFn: ({ signal }) => app.mode === 'demo' ? demoSectors(app.date) : app.client.sectors(app.date, signal),
    enabled: enabled && app.ready && (app.mode === 'demo' || !!app.session), staleTime: 60_000,
    refetchInterval: app.mode === 'live' && enabled && app.active && app.date === kstDate() && app.prefs.interval ? Math.max(120, app.prefs.interval) * 1000 : false });
}
export function useTerminal<T>(path: string, enabled = true) {
  const app = useApp();
  return useQuery({ queryKey: [app.mode, app.prefs.baseUrl, 'terminal', path],
    queryFn: ({ signal }) => app.client.terminal<T>(path, signal),
    enabled: enabled && app.ready && app.mode === 'live' && !!app.session,
    staleTime: path.includes('/news') ? 300_000 : 60_000,
    refetchInterval: app.mode === 'live' && enabled && app.active && app.prefs.interval ? Math.max(60, app.prefs.interval) * 1000 : false,
    refetchIntervalInBackground: false });
}
