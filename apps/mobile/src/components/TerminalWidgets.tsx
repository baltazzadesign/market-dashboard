import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path, Text as SvgText, Line, Rect } from 'react-native-svg';
import type { MarketRow } from '../data/model';
import type { NewsFeed, PulseData } from '../data/terminal';
import { useApp, useTerminal } from '../state/AppProvider';
import { Card, Heading, styles } from './ui';
import { colors, numberText } from '../theme';

export function MobilePulse({ data, fallback }: { data?: PulseData; fallback?: number | null }) {
  const pulse = data?.pulse, score = pulse?.score ?? fallback ?? null;
  const value = score == null ? null : Math.max(0, Math.min(100, score));
  return <View style={{ flexDirection: 'row', gap: 13, alignItems: 'center' }}><View style={{ flex: 1 }}><Text style={[styles.heading, { fontSize: 16, color: colors.gold }]}>Market Pulse</Text><Svg width="100%" height={128} viewBox="0 0 160 115"><Defs><LinearGradient id="native-gold" x1="0" y1="1" x2="1" y2="0"><Stop offset="0" stopColor="#D5A43B"/><Stop offset=".6" stopColor="#EAC469"/><Stop offset="1" stopColor="#FFF0C4"/></LinearGradient></Defs><Path d="M18 86 A62 62 0 1 1 142 86" fill="none" stroke="#242A22" strokeWidth={13} strokeLinecap="round"/>{value != null && <Path d="M18 86 A62 62 0 1 1 142 86" fill="none" stroke="url(#native-gold)" strokeWidth={13} strokeLinecap="round" strokeDasharray={`${Math.PI * 62 * value / 100} 1000`}/>}<SvgText fontFamily="sans-serif" x="80" y="73" textAnchor="middle" fontSize={38} fontWeight="600" fill={colors.text}>{numberText(value)}</SvgText><SvgText fontFamily="sans-serif" x="80" y="99" textAnchor="middle" fontSize={12} fontWeight="600" fill={colors.gold}>{pulse?.regime || (value == null ? '산출 대기' : '예시 시장점수')}</SvgText></Svg></View><View style={{ flex: .95, borderWidth: 1, borderColor: '#30382B', borderRadius: 5, paddingHorizontal: 8, backgroundColor: '#151B12' }}>{pulse?.factors.length ? pulse.factors.map((f, i) => <View key={f.name} style={{ flexDirection: 'row', gap: 8, paddingVertical: 7, borderBottomColor: '#2A3225', borderBottomWidth: i === pulse.factors.length - 1 ? 0 : 1 }}><Text style={{ fontSize: 10, color: colors.muted, flex: 1 }} numberOfLines={1}>{f.name}</Text><Text style={{ fontSize: 12, color: colors.gold }}>{f.value == null ? '—' : numberText(50 + f.value * 50)}</Text></View>) : ['시장폭', '외인·기관', '지수 방향', '섹터 강도', '가속·변곡'].map(label => <View key={label} style={{ flexDirection: 'row', paddingVertical: 7 }}><Text style={{ fontSize: 10, color: colors.muted, flex: 1 }}>{label}</Text><Text style={{ fontSize: 11, color: colors.gold }}>—</Text></View>)}</View></View>;
}
export function MobileCandles({ rows, market, periodCandles }: { rows: MarketRow[]; market: 'kospi' | 'kosdaq'; periodCandles?: { time: string; open: number; high: number; low: number; close: number }[] }) {
  const map = new Map<number, { time: string; open: number; high: number; low: number; close: number }>();
  for (const row of rows) {
    const value = row[market]; if (value == null || !Number.isFinite(value)) continue;
    const key = Math.floor(row.minute / 5), old = map.get(key);
    if (old) { old.high = Math.max(old.high, value); old.low = Math.min(old.low, value); old.close = value; }
    else map.set(key, { time: row.time, open: value, high: value, low: value, close: value });
  }
  const candles = periodCandles ?? [...map.values()], max = Math.max(...candles.map(c => c.high)), min = Math.min(...candles.map(c => c.low));
  if (!candles.length) return <View style={{ height: 185, justifyContent: 'center', alignItems: 'center' }}><Text style={styles.caption}>표시할 지수 기록이 없습니다.</Text></View>;
  const spread = max - min || 1, high = max + spread * .12, low = min - spread * .12;
  const y = (v: number) => 12 + (high - v) / (high - low) * 147, x = (i: number) => 5 + (i + .5) / candles.length * 287;
  const w = Math.max(1.5, Math.min(6, 287 / candles.length * .65));
  return <><Svg width="100%" height={195} viewBox="0 0 340 195" accessibilityLabel="5분 관측 캔들 차트">{[0, .25, .5, .75, 1].map(v => <React.Fragment key={v}><Line x1={5} x2={292} y1={12 + v * 147} y2={12 + v * 147} stroke="#293025"/><SvgText fontFamily="sans-serif" x={299} y={16 + v * 147} fontSize={8} fill={colors.muted}>{numberText(high - v * (high - low), 0)}</SvgText></React.Fragment>)}{candles.map((c, i) => { const color = c.close >= c.open ? colors.up : '#4BD0B8'; return <React.Fragment key={i}><Line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} stroke={color}/><Rect x={x(i) - w / 2} y={Math.min(y(c.open), y(c.close))} width={w} height={Math.max(1.5, Math.abs(y(c.open) - y(c.close)))} fill={color}/></React.Fragment>; })}{[0, .5, 1].map((v, i) => <SvgText fontFamily="sans-serif" key={v} x={i === 0 ? 5 : i === 1 ? 150 : 292} y={184} textAnchor={i === 0 ? 'start' : i === 1 ? 'middle' : 'end'} fontSize={9} fill={colors.muted}>{candles[Math.round(v * (candles.length - 1))]?.time}</SvgText>)}</Svg><Text style={[styles.small, { fontSize: 9 }]}>{periodCandles ? 'KIS 일봉 · 제공된 기록 범위' : '5분 관측 캔들 · 저장된 지수 표본 기준'}</Text></>;
}
export function MobileNews() {
  const { mode } = useApp(), feed = useTerminal<NewsFeed>('/api/market/news');
  return <Card><Heading title="주요 뉴스" action="전체보기" onPress={() => { void Linking.openURL('https://www.hankyung.com/finance').catch(() => {}); }}/>{mode === 'demo' ? <Text style={styles.caption}>실제 서버에 연결하면 최신 증권 뉴스가 표시됩니다.</Text> : feed.error ? <Pressable onPress={() => void feed.refetch()}><Text style={styles.caption}>뉴스를 불러오지 못했습니다. 눌러서 다시 조회</Text></Pressable> : feed.isPending ? <Text style={styles.caption}>뉴스 조회 중…</Text> : feed.data?.items.slice(0,6).map(item => <Pressable key={item.url} accessibilityRole="link" onPress={() => { if (/^https:\/\/([^/]+\.)?hankyung\.com\//.test(item.url)) void Linking.openURL(item.url).catch(() => {}); }} style={{ flexDirection: 'row', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#273021' }}><Text style={[styles.small, { width: 36, fontSize: 9 }]}>{item.publishedAt ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(item.publishedAt)) : '—'}</Text><Text style={{ flex: 1, fontSize: 11, color: colors.text }} numberOfLines={1}>{item.title}</Text></Pressable>)}<Text style={[styles.small, { marginTop: 10, fontSize: 9 }]}>한국경제 · 제목을 누르면 원문으로 이동</Text></Card>;
}
