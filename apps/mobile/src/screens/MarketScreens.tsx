import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useApp, useDay, useTerminal } from '../state/AppProvider';
import { Chart, type ChartPoint, type Series } from '../components/Chart';
import { BreadthBar, Card, DateBar, Empty, FlowSummary, Heading, IndexTile, Loading, Metric, Notice, Page, QueryNotice, RecordStatus, Segment, styles } from '../components/ui';
import { investors, sourceLabel, type MarketRow } from '../data/model';
import { colors, directionColor, numberText, signed } from '../theme';
import type { RootStackParams } from '../navigation';
import type { TerminalSnapshot, PulseData } from '../data/terminal';
import { MobileCandles, MobilePulse, MobileNews } from '../components/TerminalWidgets';
import { kstDate } from '../data/model';

export const flowSeries: Series[] = [{ key: 'foreign', label: '외국인', color: colors.foreign }, { key: 'institution', label: '기관', color: colors.institution }, { key: 'individual', label: '개인', color: colors.individual }];
export const flowPoints = (rows: MarketRow[]): ChartPoint[] => rows.map(r => ({ minute: r.minute, time: r.time, values: r.flows }));
export const breadthPoints = (rows: MarketRow[]): ChartPoint[] => rows.map(r => ({ minute: r.minute, time: r.time, values: { up: r.up, down: r.down, flat: r.flat } }));
const breadthSeries: Series[] = [{ key: 'up', label: '상승', color: colors.up }, { key: 'down', label: '하락', color: colors.down }, { key: 'flat', label: '보합', color: colors.muted }];
export const regularRows = (rows?: MarketRow[]) => (rows ?? []).filter(r => r.session === 'REGULAR');
function useFeed() { const focused = useIsFocused(), feed = useDay(undefined, focused), rows = regularRows(feed.data?.rows); return { feed, rows, last: rows.at(-1) }; }
function FeedFeedback({ feed, count }: { feed: ReturnType<typeof useDay>; count: number }) { return <><QueryNotice error={feed.error} hasData={count > 0} retry={() => void feed.refetch()} />{feed.isPending && <Loading />}{!feed.isPending && !feed.error && !count && <Card><Empty detail="이 날짜의 정규장 기록이 없습니다. 날짜 선택 또는 캘린더에서 저장된 거래일을 확인하세요." /></Card>}</>; }
function pulseText(pulse: number | null | undefined) { return pulse == null ? '산출 대기' : pulse >= 65 ? '상승 종목 우위' : pulse <= 35 ? '하락 종목 우위' : '시장 확산 중립'; }
function PulseMeter({ value, compact = false }: { value: number | null | undefined; compact?: boolean }) {
  return <View style={{ gap: 14 }}><View style={[styles.row, { justifyContent: 'space-between', alignItems: 'flex-end' }]}><View><Text style={[styles.metric, { fontSize: compact ? 41 : 68, color: colors.gold }]}>{numberText(value, 0)}<Text style={{ fontSize: 16, color: colors.muted }}> / 100</Text></Text><Text style={[styles.caption, { marginTop: 4 }]}>{pulseText(value)}</Text></View><Ionicons name="pulse" size={compact ? 36 : 54} color={colors.gold} /></View>
    <View style={{ flexDirection: 'row', gap: 4 }}>{Array.from({ length: 20 }, (_, i) => <View key={i} style={{ flex: 1, height: 8, borderRadius: 2, backgroundColor: value != null && i < value / 5 ? colors.gold : colors.line }} />)}</View><View style={[styles.row, { justifyContent: 'space-between' }]}><Text style={styles.small}>0 약세</Text><Text style={styles.small}>50 중립</Text><Text style={styles.small}>강세 100</Text></View>
  </View>;
}
export function DashboardScreen() {
  const { feed, rows, last } = useFeed(), { prefs, setPreferences, date, mode } = useApp();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParams>>(), focused = useIsFocused();
  const snapshot = useTerminal<TerminalSnapshot>('/api/market/terminal', focused && date === kstDate());
  const pulse = useTerminal<PulseData>('/api/market/pulse?date=' + date, focused);
  const [range, setRange] = useState('1D');
  const period = useTerminal<{ candles: { time: string; open: number; high: number; low: number; close: number }[] }>('/api/market/index-candles?market=' + prefs.market + '&range=' + range + '&date=' + date, focused && range !== '1D');
  const quotes = date === kstDate() ? snapshot.data?.quotes ?? [] : [], current = quotes.find(q => q.code === (prefs.market === 'kospi' ? '0001' : '1001'));
  const tiles = [{ name: 'KOSPI', quote: quotes.find(q => q.code === '0001'), value: last?.kospi }, { name: 'KOSDAQ', quote: quotes.find(q => q.code === '1001'), value: last?.kosdaq }, { name: '최근월 선물', quote: quotes.find(q => !['0001', '1001'].includes(q.code)), value: null }];
  return <Page title="대시보드" refresh={() => { void feed.refetch(); if (mode === 'live') { if (date === kstDate()) void snapshot.refetch(); void pulse.refetch(); } }} refreshing={feed.isFetching && !feed.isPending}>
    <RecordStatus row={last}/><FeedFeedback feed={feed} count={rows.length}/>
    <View style={{ flexDirection: 'row', gap: 7 }}>{tiles.map((item, index) => <View key={item.name} style={{ flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 6, backgroundColor: colors.panel, paddingHorizontal: 9, paddingVertical: 12, minHeight: 100 }}><Text style={{ color: colors.gold, fontSize: 10 }} numberOfLines={1}>{index === 2 ? item.quote?.name || item.name : item.name}</Text><Text style={{ fontSize: 20, fontWeight: '600', color: colors.text, marginTop: 11, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{numberText(item.quote?.price ?? item.value, 2)}</Text><Text style={{ fontSize: 10, color: directionColor(item.quote?.rate), marginTop: 7 }} numberOfLines={1}>{item.quote?.rate == null ? (item.value == null ? '시세 수신 대기' : '저장 기록') : (item.quote.rate >= 0 ? '▲ ' : '▼ ') + signed(item.quote.rate, 2) + '%'}</Text></View>)}</View>
    <Pressable onPress={() => navigation.navigate('Pulse')} accessibilityRole="button" accessibilityLabel="Market Pulse 상세"><Card style={{ padding: 12 }}><MobilePulse data={pulse.data} fallback={mode === 'demo' ? last?.pulse : null}/>{pulse.error && <Text style={styles.small}>Pulse 조회 지연 · 상세에서 재시도</Text>}</Card></Pressable>
    <Card style={{ padding: 11 }}><View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><View style={{ flex: 1.4 }}><Segment value={prefs.market} onChange={market => void setPreferences({ market }).catch(() => {})} items={[{ key: 'kospi', label: 'KOSPI' }, { key: 'kosdaq', label: 'KOSDAQ' }]}/></View><View style={{ flex: 1 }}><Segment value={range} onChange={setRange} items={[{ key: '1D', label: '1D' }, { key: '1W', label: '1W' }, { key: '1M', label: '1M' }]}/></View><Pressable onPress={() => navigation.navigate('Charts')} accessibilityLabel="차트 확대" style={{ padding: 4 }}><Ionicons name="expand-outline" size={17} color={colors.gold}/></Pressable></View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}><Text style={{ color: colors.text, fontWeight: '600', fontSize: 20 }}>{numberText(range === '1D' ? current?.price ?? last?.[prefs.market] : period.data?.candles.at(-1)?.close,2)}</Text>{range === '1D' && current?.rate != null && <Text style={{ color: directionColor(current.rate), fontSize: 12 }}>{signed(current.change,2)} ({signed(current.rate,2)}%)</Text>}</View>
      {range !== '1D' && mode === 'demo' ? <Text style={[styles.caption, { paddingVertical: 50 }]}>기간별 지수는 실제 서버 연결 후 조회할 수 있습니다.</Text> : period.error && range !== '1D' ? <Notice error text={period.error.message} action="재시도" onPress={() => void period.refetch()}/> : <MobileCandles rows={range === '1D' ? rows : []} market={prefs.market} periodCandles={range === '1D' ? undefined : period.data?.candles ?? []}/>}
    </Card>
    <View style={{ flexDirection: 'row', gap: 7 }}>{[{ label: '시장 캘린더', icon: 'calendar-outline', action: () => navigation.navigate('Main', { screen: 'Calendar' }) }, { label: '시장리서치', icon: 'layers-outline', action: () => navigation.navigate('Sectors') }, { label: '내 메모', icon: 'book-outline', action: () => navigation.navigate('Notes') }, { label: '차트 전체보기', icon: 'stats-chart-outline', action: () => navigation.navigate('Charts') }].map(item => <Pressable key={item.label} onPress={item.action} accessibilityRole="button" style={{ flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 7, minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: 11, padding: 4, backgroundColor: colors.panel }}><Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={27} color={colors.gold}/><Text style={{ fontSize: 10, color: colors.text, textAlign: 'center' }}>{item.label}</Text></Pressable>)}</View>
    <MobileNews/>
    <Card><Heading title="투자자별 누적 수급" action="상세" onPress={() => navigation.navigate('Main', { screen: 'Flow' })}/><FlowSummary flows={last?.flows} source={last?.flowSource}/></Card>
    <Card><Heading title="시장폭" action="상세" onPress={() => navigation.navigate('Main', { screen: 'Breadth' })}/><BreadthBar row={last}/></Card>
    <DateBar/>
  </Page>;
}
export function FlowScreen() {
  const { feed, rows, last } = useFeed();
  return <Page title="투자자 수급" kicker="INVESTOR FLOW" refresh={() => void feed.refetch()} refreshing={feed.isFetching && !feed.isPending}><DateBar /><RecordStatus row={last} /><FeedFeedback feed={feed} count={rows.length} />
    <Card><Heading title="누가 시장을 움직이는가" detail="KOSPI + KOSDAQ 합산 · 당일 누적" /><FlowSummary flows={last?.flows} source={last?.flowSource} /></Card>
    {last?.flowSource === 'FALLBACK' && <Notice text="현재 수급 대신 이전 정상 수집값을 표시하고 있습니다." />}
    <Card><Chart title="누적 순매수 추이" points={flowPoints(rows)} series={flowSeries} height={255} unit="억원" /></Card>
    <Card><Heading title="수급 균형" detail="양수는 순매수 · 음수는 순매도" />{investors.map(key => { const value = last?.flows[key], max = Math.max(1, ...investors.map(k => Math.abs(last?.flows[k] ?? 0))); return <View key={key} style={{ marginBottom: 18, gap: 8 }}><View style={[styles.row, { justifyContent: 'space-between' }]}><Text style={styles.body}>{flowSeries.find(s => s.key === key)?.label}</Text><Text style={{ color: colors[key] }}>{signed(value)} 억</Text></View><View style={{ height: 6, backgroundColor: colors.line, borderRadius: 3 }}><View style={{ width: `${Math.abs(value ?? 0) / max * 100}%`, height: 6, borderRadius: 3, backgroundColor: colors[key] }} /></View></View>; })}<Text style={styles.caption}>막대 길이는 순매수·순매도의 절댓값을 비교합니다. 누락된 수급은 0으로 대체하지 않습니다.</Text></Card>
  </Page>;
}
export function BreadthScreen() {
  const { feed, rows, last } = useFeed(), total = last?.up != null && last.down != null && last.flat != null ? last.up + last.down + last.flat : null;
  const ratio = total && last?.up != null ? last.up / total * 100 : null;
  return <Page title="시장폭" kicker="MARKET BREADTH" refresh={() => void feed.refetch()} refreshing={feed.isFetching && !feed.isPending}><DateBar /><RecordStatus row={last} /><FeedFeedback feed={feed} count={rows.length} />
    {last?.up === null && <Notice text="현재 상승·하락 종목 수가 미제공 상태입니다. 지수와 수급 기록은 별도로 확인할 수 있습니다." />}
    {last?.breadthSource === 'FALLBACK' && <Notice text="종목 수는 이전 정상 수집값입니다. 현재 시장폭으로 해석하지 마세요." />}
    <Card><Heading title="시장 전체의 확산도" detail={sourceLabel(last?.breadthSource) + ' · KOSPI + KOSDAQ'} /><BreadthBar row={last} /><View style={styles.divider} /><View style={styles.threeCol}><Metric label="상승 종목 비율" value={ratio === null ? '—' : numberText(ratio, 1) + '%'} /><Metric label="상승 − 하락" value={signed(last?.diff)} color={directionColor(last?.diff)} detail="종목" /></View></Card>
    <Card><Chart title="상승·하락·보합 추이" points={breadthPoints(rows)} series={breadthSeries} unit="종목" height={235} /></Card>
    <Card><Heading title="지수 너머의 시장" /><Text style={styles.caption}>상승 종목 비율은 보합을 포함한 전체 종목 수를 기준으로 계산합니다. 지수가 상승해도 상승 종목 수가 적으면 상승세가 일부 종목에 집중되어 있을 수 있습니다.</Text></Card>
  </Page>;
}
export function PulseScreen() {
  const { feed, rows, last } = useFeed(), nav = useNavigation(), app = useApp(), focused = useIsFocused();
  const pulse = useTerminal<PulseData>('/api/market/pulse?date=' + app.date, focused);
  return <Page title="Market Pulse" kicker="READ THE MARKET" back={() => nav.goBack()} refresh={() => { void feed.refetch(); if (app.mode === 'live') void pulse.refetch(); }} refreshing={feed.isFetching && !feed.isPending}><DateBar/><RecordStatus row={last}/><FeedFeedback feed={feed} count={rows.length}/><QueryNotice error={pulse.error} hasData={!!pulse.data} retry={() => void pulse.refetch()}/><Card><MobilePulse data={pulse.data} fallback={app.mode === 'demo' ? last?.pulse : null}/></Card>
    {pulse.data && <Card><Heading title="종합 판정" detail={'데이터 충족도 ' + pulse.data.pulse.coverage + '%'}/><Text style={styles.body}>{pulse.data.pulse.reasons.join(' ')}</Text>{pulse.data.pulse.factors.map(f => <View key={f.name} style={{ paddingTop: 16 }}><Text style={styles.gold}>{f.name} · 비중 {f.weight}%</Text><Text style={[styles.caption, { marginTop: 5 }]}>{f.detail}</Text></View>)}{pulse.data.sectorStatus ? <Text style={styles.caption}>{pulse.data.sectorStatus}</Text> : null}</Card>}
    <Card><Chart title="장중 시장점수 · 원점수 −100~100" points={rows.map(r => ({ minute: r.minute, time: r.time, values: { score: r.marketScore } }))} series={[{ key: 'score', label: '시장점수', color: colors.gold }]} height={215} unit="점"/></Card>
    <Card><Heading title="점수 읽는 법"/><Text style={styles.caption}>위 종합 점수는 웹과 같은 Market Pulse 2.0 계산 결과입니다. 시장폭, 외인·기관 수급, 지수 방향, 섹터 강도, 가속·변곡을 종합합니다. 아래 장중 그래프는 서버에 저장된 기존 시장점수(−100~100)로, 종합 점수의 과거 이력이 아닙니다. 누락된 항목은 산출에서 제외합니다.</Text></Card>
  </Page>;
}
