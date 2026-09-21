import React from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParams } from '../navigation';
import { useApp } from '../state/AppProvider';
import { colors, directionColor, numberText, signed } from '../theme';
import { investors, investorNames, isOldRow, kstDate, sourceLabel, type Flows, type MarketRow } from '../data/model';

export function Page({ title, kicker, children, refresh, refreshing, back, right }: React.PropsWithChildren<{ title: string; kicker?: string; refresh?: () => void; refreshing?: boolean; back?: () => void; right?: React.ReactNode }>) {
  const { mode, session } = useApp();
  const loggedIn = !!session || mode === "demo";
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}
    refreshControl={refresh ? <RefreshControl refreshing={!!refreshing} onRefresh={refresh} tintColor={colors.gold} colors={[colors.gold]} /> : undefined}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }}><Pressable accessibilityRole="button" accessibilityLabel="대시보드" onPress={() => { if (loggedIn) navigation.navigate('Main', { screen: 'Dashboard' }); }}><Image source={require('../../assets/balta-logo-v2.png')} style={{ width: 136, height: 45 }} resizeMode="contain" accessibilityLabel="발타툴" /></Pressable>{loggedIn && <View style={{ flexDirection: 'row', gap: 4 }}><Pressable accessibilityRole="button" onPress={() => navigation.navigate('Scanner')} accessibilityLabel="종목 검색" style={styles.iconButton}><Ionicons name="search-outline" size={22} color={colors.gold}/></Pressable><Pressable accessibilityRole="button" onPress={() => navigation.navigate('Main', { screen: 'More' })} accessibilityLabel="전체 메뉴" style={styles.iconButton}><Ionicons name="menu-outline" size={25} color={colors.gold}/></Pressable></View>}</View>
    {loggedIn && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 22, borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 8 }}>
      {[{ label: '대시보드', active: title === '대시보드', action: () => navigation.navigate('Main', { screen: 'Dashboard' }) }, { label: '시장 수급', active: title === '투자자 수급', action: () => navigation.navigate('Main', { screen: 'Flow' }) }, { label: '시장폭', active: title === '시장폭', action: () => navigation.navigate('Main', { screen: 'Breadth' }) }, { label: 'Pulse', active: title === 'Market Pulse', action: () => navigation.navigate('Pulse') }, { label: '시장리서치', active: title === '시장리서치', action: () => navigation.navigate('Sectors') }, { label: '캘린더', active: title === '시장 캘린더', action: () => navigation.navigate('Main', { screen: 'Calendar' }) }, { label: '내 메모', active: title === '내 메모', action: () => navigation.navigate('Notes') }].map(item => <Pressable key={item.label} onPress={item.action} accessibilityRole="button" accessibilityState={{ selected: item.active }} style={{ paddingTop: 2, paddingBottom: 6, borderBottomWidth: item.active ? 2 : 0, borderBottomColor: colors.gold }}><Text style={{ color: item.active ? colors.gold : colors.muted, fontSize: 11, fontWeight: item.active ? '700' : '400' }}>{item.label}</Text></Pressable>)}
    </ScrollView>}
    {title !== '대시보드' && <View style={[styles.header, { marginBottom: 0 }]}><View style={{ flex: 1 }}><Text style={styles.kicker}>{kicker || 'BALTA · MARKET TERMINAL'}</Text><View style={styles.row}>{back && <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={back} style={styles.iconButton}><Ionicons name="arrow-back" size={22} color={colors.gold}/></Pressable>}<Text style={styles.title}>{title}</Text></View></View>{right}</View>}
    {mode === 'demo' && <Notice text="미리보기 · 모든 수치는 예시 데이터입니다" />}
    {children}<Text style={styles.footer}>발타툴  /  시장의 흐름을 읽다</Text>
  </ScrollView></SafeAreaView>;
}
export function Card({ children, style }: React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) { return <View style={[styles.card, style]}>{children}</View>; }
export function Heading({ title, detail, action, onPress }: { title: string; detail?: string; action?: string; onPress?: () => void }) {
  return <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 14 }]}><View style={{ flex: 1 }}><Text style={styles.heading}>{title}</Text>{detail ? <Text style={styles.caption}>{detail}</Text> : null}</View>{action ? <Pressable onPress={onPress} accessibilityRole="button" style={{ padding: 8 }}><Text style={styles.gold}>{action} ›</Text></Pressable> : null}</View>;
}
export function Notice({ text, error = false, action, onPress }: { text: string; error?: boolean; action?: string; onPress?: () => void }) {
  return <View style={[styles.notice, error && { borderColor: '#61393D' }]}><Ionicons name={error ? 'alert-circle-outline' : 'information-circle-outline'} size={17} color={error ? colors.up : colors.gold} /><Text style={[styles.noticeText, error && { color: colors.up }]}>{text}</Text>{action ? <Pressable accessibilityRole="button" onPress={onPress} style={{ padding: 5 }}><Text style={styles.gold}>{action}</Text></Pressable> : null}</View>;
}
export function Empty({ title = '저장된 기록이 없습니다', detail = '날짜를 바꾸거나 잠시 후 다시 조회해 주세요.' }: { title?: string; detail?: string }) {
  return <View style={styles.empty}><Ionicons name="analytics-outline" color={colors.muted} size={28} /><Text style={styles.heading}>{title}</Text><Text style={[styles.caption, { textAlign: 'center' }]}>{detail}</Text></View>;
}
export function Loading() { return <View style={{ gap: 10, paddingVertical: 10 }}><ActivityIndicator color={colors.gold} /><View style={styles.skeleton} /><View style={[styles.skeleton, { height: 110 }]} /></View>; }
export function QueryNotice({ error, hasData, retry }: { error: Error | null; hasData: boolean; retry: () => void }) {
  if (!error) return null;
  return <Notice error text={`${error.message}${hasData ? ' 마지막으로 불러온 기록을 표시합니다.' : ''}`} action="재시도" onPress={retry} />;
}
export function Button({ title, onPress, loading, secondary = false, disabled = false }: { title: string; onPress: () => void; loading?: boolean; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || loading }} onPress={onPress} disabled={disabled || loading}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, (pressed || disabled || loading) && { opacity: .6 }]}>
    {loading ? <ActivityIndicator color={secondary ? colors.gold : colors.bg} /> : <Text style={[styles.buttonText, secondary && { color: colors.gold }]}>{title}</Text>}
  </Pressable>;
}
export function Segment<T extends string>({ value, items, onChange }: { value: T; items: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return <View style={styles.segment}>{items.map(item => <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: value === item.key }} onPress={() => onChange(item.key)}
    style={[styles.segmentItem, value === item.key && styles.segmentActive]}><Text style={[styles.segmentText, value === item.key && { color: colors.text }]}>{item.label}</Text></Pressable>)}</View>;
}
export function DateBar({ disabled = false, date: selected, setDate: onChange }: { disabled?: boolean; date?: string; setDate?: (date: string) => void } = {}) {
  const app = useApp(), today = kstDate(), date = selected ?? app.date, setDate = onChange ?? app.setDate;
  const move = (n: number) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); setDate(d.toISOString().slice(0, 10)); };
  return <View style={styles.datebar}><Pressable disabled={disabled} onPress={() => move(-1)} accessibilityRole="button" accessibilityLabel="이전 날짜" style={styles.iconButton}><Ionicons name="chevron-back" size={18} color={colors.muted} /></Pressable>
    <Pressable disabled={disabled} onPress={() => setDate(today)} accessibilityRole="button" accessibilityLabel="오늘 날짜로 이동" style={{ flex: 1, alignItems: 'center', padding: 8 }}><Text style={styles.body}>{date.replace(/-/g, '. ')} <Text style={styles.caption}>{date === today ? '오늘' : '기록'} · KST</Text></Text></Pressable>
    <Pressable disabled={disabled || date >= today} onPress={() => move(1)} accessibilityRole="button" accessibilityState={{ disabled: disabled || date >= today }} accessibilityLabel="다음 날짜" style={[styles.iconButton, date >= today && { opacity: .25 }]}><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable></View>;
}
export function RecordStatus({ row }: { row: MarketRow | undefined }) {
  const { mode } = useApp();
  return <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 4 }]}><View style={styles.row}><View style={[styles.dot, { backgroundColor: mode === 'demo' ? colors.gold : row && !isOldRow(row) ? colors.good : colors.muted }]} /><Text style={styles.caption}>정규장 {mode === 'demo' ? '예시' : '저장 기록'}</Text></View><Text style={styles.caption}>{row ? `${row.time} 기준` : '수집 대기'}</Text></View>;
}
export function FlowSummary({ flows, source }: { flows?: Flows; source?: string }) {
  return <View><View style={styles.threeCol}>{investors.map(key => <View key={key} style={styles.flowCell}><View style={styles.row}><View style={[styles.dot, { backgroundColor: colors[key] }]} /><Text style={styles.caption}>{investorNames[key]}</Text></View>
    <Text style={[styles.flowValue, { color: colors[key] }]} adjustsFontSizeToFit numberOfLines={1}>{signed(flows?.[key])}</Text><Text style={styles.small}>억원</Text></View>)}</View>{source ? <Text style={[styles.caption, { marginTop: 12 }]}>{sourceLabel(source)} · KOSPI + KOSDAQ 합산</Text> : null}</View>;
}
export function BreadthBar({ row }: { row?: Pick<MarketRow, 'up' | 'down' | 'flat'> }) {
  const total = (row?.up ?? 0) + (row?.down ?? 0) + (row?.flat ?? 0);
  return <View style={{ gap: 12 }}><View style={styles.breadthTrack}>{total > 0 ? <><View style={{ flex: row!.up ?? 0, backgroundColor: colors.up }} /><View style={{ flex: row!.flat ?? 0, backgroundColor: '#777E8A' }} /><View style={{ flex: row!.down ?? 0, backgroundColor: colors.down }} /></> : <View style={{ flex: 1, backgroundColor: colors.line }} />}</View>
    <View style={styles.threeCol}>{(['up', 'flat', 'down'] as const).map((key, i) => <View key={key} style={{ flex: 1 }}><Text style={styles.caption}>{['상승', '보합', '하락'][i]}</Text><Text style={[styles.metric, { fontSize: 21, color: key === 'up' ? colors.up : key === 'down' ? colors.down : colors.muted }]}>{numberText(row?.[key])}</Text></View>)}</View></View>;
}
export function Metric({ label, value, detail, color }: { label: string; value: string; detail?: string; color?: string }) {
  return <View style={{ flex: 1, gap: 5 }}><Text style={styles.caption}>{label}</Text><Text style={[styles.metric, { color: color || colors.text }]} adjustsFontSizeToFit numberOfLines={1}>{value}</Text>{detail ? <Text style={styles.small}>{detail}</Text> : null}</View>;
}
export function IndexTile({ name, value, change }: { name: string; value?: number | null; change: number | null }) {
  return <View style={{ flex: 1, paddingVertical: 10 }}><Text style={styles.caption}>{name}</Text><Text style={styles.indexValue} numberOfLines={1} adjustsFontSizeToFit>{numberText(value, 2)}</Text><Text style={{ color: directionColor(change), fontSize: 12 }}>{signed(change, 2)}{change !== null ? '%' : ''} <Text style={styles.small}>첫 기록 대비</Text></Text></View>;
}
export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg }, page: { padding: 12, gap: 10, maxWidth: 780, width: '100%', alignSelf: 'center', paddingBottom: 30 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 6, marginBottom: 4 }, kicker: { color: colors.gold, fontSize: 10, letterSpacing: 2, fontWeight: '700', marginBottom: 8 },
  title: { color: colors.text, fontSize: 29, fontWeight: '700', letterSpacing: -1 }, emblem: { width: 48, height: 48, borderRadius: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, card: { backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, padding: 13, borderRadius: 7 },
  heading: { color: colors.text, fontSize: 16, fontWeight: '600', letterSpacing: -.3 }, body: { color: colors.text, fontSize: 14 }, caption: { color: colors.muted, fontSize: 12, lineHeight: 19 }, small: { color: colors.muted, fontSize: 10, lineHeight: 16 }, gold: { color: colors.gold, fontSize: 12, fontWeight: '600' },
  metric: { color: colors.text, fontSize: 25, fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: -.6 }, indexValue: { color: colors.text, fontSize: 28, letterSpacing: -1, fontWeight: '600', marginVertical: 7, fontVariant: ['tabular-nums'] },
  notice: { borderWidth: 1, borderColor: '#4B3C27', borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#19160F' }, noticeText: { flex: 1, color: colors.gold, fontSize: 12, lineHeight: 19 },
  empty: { minHeight: 154, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 12 }, skeleton: { height: 60, backgroundColor: colors.elevated, borderRadius: 12 },
  button: { backgroundColor: colors.gold, minHeight: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', padding: 12 }, secondary: { backgroundColor: colors.panel, borderColor: '#59482F', borderWidth: 1 }, buttonText: { color: colors.bg, fontSize: 15, fontWeight: '700' },
  segment: { flexDirection: 'row', backgroundColor: colors.bg, padding: 4, borderRadius: 10, gap: 3, borderColor: colors.line, borderWidth: 1 }, segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 36, borderRadius: 7, paddingHorizontal: 5 }, segmentActive: { backgroundColor: colors.elevated }, segmentText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  datebar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.panel, borderRadius: 10 }, iconButton: { minWidth: 40, minHeight: 42, alignItems: 'center', justifyContent: 'center' }, dot: { width: 5, height: 5, borderRadius: 3 },
  threeCol: { flexDirection: 'row', gap: 10 }, flowCell: { flex: 1 }, flowValue: { fontSize: 20, fontWeight: '600', letterSpacing: -.6, marginTop: 9, fontVariant: ['tabular-nums'] }, breadthTrack: { height: 9, borderRadius: 4, flexDirection: 'row', overflow: 'hidden', gap: 3 },
  footer: { color: '#77756F', fontSize: 10, textAlign: 'center', letterSpacing: 1, paddingTop: 14 }, divider: { height: 1, backgroundColor: colors.line, marginVertical: 16 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 14, color: colors.text, backgroundColor: colors.bg, minHeight: 50, fontSize: 15 },
});
