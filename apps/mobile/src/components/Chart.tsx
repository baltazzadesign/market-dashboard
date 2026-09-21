import React, { useMemo, useState } from 'react';
import { Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, numberText } from '../theme';
import { Empty, Segment, styles } from './ui';
import { useApp } from '../state/AppProvider';
export type ChartPoint = { minute: number; time: string; values: Record<string, number | null> };
export type Series = { key: string; label: string; color: string };
export function Chart({ title, points, series, height = 180, decimals = 0, unit = '', expandable = true }: { title: string; points: ChartPoint[]; series: Series[]; height?: number; decimals?: number; unit?: string; expandable?: boolean }) {
  const { mode } = useApp();
  const [width, setWidth] = useState(300), [cursor, setCursor] = useState<number | null>(null), [full, setFull] = useState(false), [range, setRange] = useState('all');
  const { height: windowHeight } = useWindowDimensions();
  const filtered = useMemo(() => { const last = points.at(-1)?.minute ?? 0; return range === 'all' ? points : points.filter(p => p.minute >= last - Number(range)); }, [points, range]);
  const left = 45, right = width - 6, top = 14, bottom = height - 26;
  const numbers = filtered.flatMap(p => series.flatMap(s => p.values[s.key] == null ? [] : [p.values[s.key]!]));
  const min = numbers.length ? Math.min(...numbers) : 0, max = numbers.length ? Math.max(...numbers) : 1;
  const margin = Math.max((max - min) * .12, Math.abs(max) * .0002, .1), low = min - margin, high = max + margin;
  const start = filtered[0]?.minute ?? 0, end = filtered.at(-1)?.minute ?? 1;
  const x = (minute: number) => left + (minute - start) / Math.max(end - start, 1) * (right - left);
  const y = (value: number) => bottom - (value - low) / (high - low) * (bottom - top);
  const active = filtered[Math.min(cursor ?? filtered.length - 1, filtered.length - 1)];
  function select(location: number) {
    const minute = start + Math.max(0, Math.min(1, (location - left) / Math.max(1, right - left))) * (end - start);
    let nearest = 0;
    for (let i = 1; i < filtered.length; i++) if (Math.abs(filtered[i]!.minute - minute) < Math.abs(filtered[nearest]!.minute - minute)) nearest = i;
    setCursor(nearest);
  }
  const pathFor = (key: string) => { let path = '', previous = false; for (const p of filtered) { const v = p.values[key]; if (v == null) { previous = false; continue; } path += `${previous ? 'L' : 'M'}${x(p.minute).toFixed(2)},${y(v).toFixed(2)} `; previous = true; } return path; };
  return <View style={{ gap: 12 }}>
    <View style={[styles.row, { justifyContent: 'space-between' }]}><Text style={styles.caption}>{title}{mode === 'demo' ? ' · 예시' : ''}</Text><View style={styles.row}><Text style={styles.small}>{active?.time ?? '—'}{unit ? ` · ${unit}` : ''}</Text>{expandable && <Pressable accessibilityRole="button" accessibilityLabel={`${title} 확대`} onPress={() => setFull(true)} style={{ padding: 7 }}><Ionicons name="expand-outline" size={17} color={colors.muted} /></Pressable>}</View></View>
    <View style={[styles.row, { flexWrap: 'wrap', gap: 14 }]}>{series.map(s => <View key={s.key}><Text style={styles.small}>{s.label}</Text><Text style={{ color: s.color, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{numberText(active?.values[s.key], decimals)}</Text></View>)}</View>
    {!numbers.length ? <Empty title="표시할 값이 없습니다" detail="누락된 값은 그래프에 표시하지 않습니다." /> : <View accessibilityLabel={`${title}. 차트를 터치하면 해당 시점의 값을 볼 수 있습니다.`} onLayout={e => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true} onMoveShouldSetResponder={e => Math.abs(e.nativeEvent.locationX) > 0} onResponderGrant={e => select(e.nativeEvent.locationX)} onResponderMove={e => select(e.nativeEvent.locationX)}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {[0, .5, 1].map(t => { const value = low + (high - low) * t; return <React.Fragment key={t}><Line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke={colors.line} strokeDasharray="3 4" /><SvgText x={left - 7} y={y(value) + 3} textAnchor="end" fontSize="9" fill={colors.muted}>{Math.abs(value) >= 10000 ? (value / 10000).toFixed(1) + '만' : numberText(value, decimals)}</SvgText></React.Fragment>; })}
        {low < 0 && high > 0 && <Line x1={left} x2={right} y1={y(0)} y2={y(0)} stroke="#737782" strokeDasharray="3 3" />}
        {series.map(s => <React.Fragment key={s.key}><Path d={pathFor(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />{filtered.length === 1 && filtered[0]!.values[s.key] != null && <Circle cx={x(filtered[0]!.minute)} cy={y(filtered[0]!.values[s.key]!)} r={3} fill={s.color} />}</React.Fragment>)}
        {cursor !== null && active && <><Line x1={x(active.minute)} x2={x(active.minute)} y1={top} y2={bottom} stroke={colors.muted} strokeDasharray="3 3" />{series.map(s => active.values[s.key] == null ? null : <Circle key={s.key} cx={x(active.minute)} cy={y(active.values[s.key]!)} r={3} fill={s.color} />)}</>}
        {[filtered[0], filtered[Math.floor((filtered.length - 1) / 2)], filtered.at(-1)].map((p, i) => p && <SvgText key={i} x={i === 0 ? left : i === 2 ? right : (left + right) / 2} y={height - 4} fill={colors.muted} fontSize="10" textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>{p.time}</SvgText>)}
      </Svg>
    </View>}
    <Segment value={range} onChange={v => { setRange(v); setCursor(null); }} items={[{ key: 'all', label: '전체' }, { key: '60', label: '최근 1시간' }, { key: '30', label: '최근 30분' }]} />
    {cursor !== null && <Pressable accessibilityRole="button" onPress={() => setCursor(null)}><Text style={styles.gold}>마지막 기록으로 돌아가기</Text></Pressable>}
    {full && <Modal visible animationType="slide" onRequestClose={() => setFull(false)}><SafeAreaView style={[styles.safe, { padding: 20, justifyContent: 'center' }]}><Pressable onPress={() => setFull(false)} accessibilityRole="button" style={{ alignSelf: 'flex-end', padding: 14 }}><Text style={styles.gold}>닫기 ✕</Text></Pressable><Text style={[styles.title, { marginBottom: 24 }]}>{title}</Text><Chart title={title} points={points} series={series} height={Math.min(420, windowHeight * .5)} decimals={decimals} unit={unit} expandable={false} /><Text style={[styles.caption, { marginTop: 20 }]}>좌우로 터치해 시점별 수치를 확인하세요.</Text></SafeAreaView></Modal>}
  </View>;
}
