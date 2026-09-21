import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useApp, useDay, useHistory } from '../state/AppProvider';
import { kstDate, shiftMonth, weekdaySlots, type DailyMarket } from '../data/model';
import { BreadthBar, Card, Empty, FlowSummary, Heading, Loading, Metric, Notice, Page, QueryNotice, Segment, styles } from '../components/ui';
import { Chart } from '../components/Chart';
import { flowPoints, flowSeries, regularRows } from './MarketScreens';
import { colors, directionColor, numberText, signed } from '../theme';

function DayDetail({ day, close }: { day: DailyMarket; close: () => void }) {
  const { mode, prefs } = useApp(), feed = useDay(day.date), rows = regularRows(feed.data?.rows);
  const [kind, setKind] = useState('index');
  return <Modal animationType="slide" onRequestClose={close}><SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page}>
    <View style={[styles.row, { justifyContent: 'space-between' }]}><View><Text style={styles.kicker}>DAY IN REVIEW</Text><Text style={styles.title}>{day.date}</Text></View><Pressable onPress={close} accessibilityRole="button" accessibilityLabel="거래일 상세 닫기" style={styles.iconButton}><Ionicons name="close" color={colors.gold} size={24} /></Pressable></View>
    {mode === 'demo' && <Notice text="미리보기 · 모든 수치는 예시 데이터입니다" />}
    <Text style={styles.caption}>{day.finalized ? '확정 일간 기록' : '장중 잠정 기록'} · {day.time} KST</Text>
    <Card><View style={styles.threeCol}>{(['kospi', 'kosdaq'] as const).map(m => <Metric key={m} label={m.toUpperCase()} value={signed(day[m].changePct, 2) + (day[m].changePct === null ? '' : '%')} color={directionColor(day[m].changePct)} detail={numberText(day[m].price, 2)} />)}</View></Card>
    <Card><FlowSummary flows={day.flows} /></Card><Card><BreadthBar row={day} /><Text style={[styles.caption, { marginTop: 16 }]}>Market Pulse · {numberText(day.pulse)} / 100</Text></Card>
    <Card><Heading title="해당 날짜의 장중 흐름" /><Segment value={kind} onChange={setKind} items={[{ key: 'index', label: '지수' }, { key: 'flow', label: '수급' }, { key: 'breadth', label: '시장폭' }]} /><View style={{ height: 18 }} />
      <QueryNotice error={feed.error} hasData={!!rows.length} retry={() => void feed.refetch()} />{feed.isPending ? <Loading /> : !rows.length ? <Empty title="장중 기록이 없습니다" detail="일간 요약과 장중 기록의 저장 범위는 다를 수 있습니다." /> : kind === 'flow' ? <Chart title="장중 수급" points={flowPoints(rows)} series={flowSeries} unit="억원" /> : <Chart title={kind === 'index' ? prefs.market.toUpperCase() : '상승 − 하락'} points={rows.map(r => ({ minute: r.minute, time: r.time, values: { value: kind === 'index' ? r[prefs.market] : r.diff } }))} series={[{ key: 'value', label: kind === 'index' ? prefs.market.toUpperCase() : '종목 수 차이', color: colors.gold }]} decimals={kind === 'index' ? 2 : 0} />}
    </Card>
  </ScrollView></SafeAreaView></Modal>;
}
export function CalendarScreen() {
  const { prefs, setPreferences } = useApp(), focused = useIsFocused();
  const [month, setMonth] = useState(kstDate().slice(0, 7)), [selected, setSelected] = useState<DailyMarket | null>(null);
  const feed = useHistory(month, focused), days = feed.data?.days.filter(d => d.date.startsWith(month)) ?? [], closed = days.filter(d => d.finalized);
  const map = new Map(days.map(d => [d.date, d])), slots = weekdaySlots(month), market = prefs.market;
  const up = closed.filter(d => (d[market].changePct ?? 0) > 0).length, down = closed.filter(d => (d[market].changePct ?? 0) < 0).length;
  const baseline = feed.data?.days.filter(d => d.finalized && d.date < month + '-01').at(-1)?.[market].price, end = closed.at(-1)?.[market].price;
  const monthReturn = baseline && end ? (end / baseline - 1) * 100 : null;
  return <Page title="시장 캘린더" kicker="MARKET JOURNAL" refresh={() => void feed.refetch()} refreshing={feed.isFetching && !feed.isPending}>
    <Segment value={market} onChange={market => void setPreferences({ market }).catch(() => {})} items={[{ key: 'kospi', label: 'KOSPI' }, { key: 'kosdaq', label: 'KOSDAQ' }]} />
    <Card><View style={[styles.row, { justifyContent: 'space-between', marginBottom: 18 }]}><Pressable onPress={() => setMonth(shiftMonth(month, -1))} disabled={month <= '2000-01'} accessibilityRole="button" accessibilityLabel="이전 달" style={styles.iconButton}><Ionicons name="chevron-back" color={colors.gold} size={20} /></Pressable><Text style={styles.heading}>{Number(month.slice(0, 4))}년 {Number(month.slice(5))}월</Text><Pressable onPress={() => setMonth(shiftMonth(month, 1))} disabled={month >= kstDate().slice(0, 7)} accessibilityRole="button" accessibilityLabel="다음 달" style={[styles.iconButton, month >= kstDate().slice(0, 7) && { opacity: .25 }]}><Ionicons name="chevron-forward" color={colors.gold} size={20} /></Pressable></View>
      <View style={{ flexDirection: 'row', marginBottom: 10 }}>{['월', '화', '수', '목', '금'].map(d => <Text key={d} style={[styles.caption, { flex: 1, textAlign: 'center' }]}>{d}</Text>)}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>{slots.map((date, i) => { const day = date ? map.get(date) : undefined, change = day?.[market].changePct, holiday = date ? feed.data?.closedDates[date] : null;
        return <Pressable key={date || i} disabled={!day} onPress={() => day && setSelected(day)} accessibilityRole="button" accessibilityLabel={date ? `${date} ${holiday || (day ? signed(change, 2) + '퍼센트, 상세 보기' : '기록 없음')}` : '빈 칸'} style={{ width: '18.7%', minHeight: 67, paddingVertical: 9, borderRadius: 8, alignItems: 'center', justifyContent: 'space-between', backgroundColor: day && change != null ? (change > 0 ? '#302024' : change < 0 ? '#17263C' : colors.elevated) : colors.bg, opacity: date ? 1 : 0 }}>
          <Text style={{ color: day ? colors.text : colors.muted, fontSize: 12 }}>{date ? Number(date.slice(8)) : ''}{day && !day.finalized ? '·' : ''}</Text><Text style={{ color: directionColor(change), fontSize: 10, fontWeight: '600' }}>{holiday ? '휴장' : day ? `${signed(change, 1)}${change != null ? '%' : ''}` : date && date > kstDate() ? '—' : '기록 없음'}</Text>
        </Pressable>;
      })}</View><Text style={[styles.small, { marginTop: 15 }]}>주말 제외 · 휴장일은 서버 캘린더 기준 · 점 표시는 잠정 기록</Text>
    </Card>
    <QueryNotice error={feed.error} hasData={days.length > 0} retry={() => void feed.refetch()} />{feed.isPending && <Loading />}
    {!feed.isPending && !feed.error && !days.length && <Card><Empty title="이 달의 저장 기록이 없습니다" detail="다른 달을 선택해 주세요." /></Card>}
    <Card><Heading title="이달의 시장" detail={`${market.toUpperCase()} · 확정 ${closed.length}일 / 잠정 ${days.length - closed.length}일`} /><Metric label="월 수익률 · 확정 기록 기준" value={signed(monthReturn, 2) + (monthReturn === null ? '' : '%')} color={directionColor(monthReturn)} detail={monthReturn === null ? '전월 마지막 확정 종가 또는 이번 달 확정 종가가 필요합니다.' : '전월 마지막 확정 종가 대비'} /><View style={styles.divider} /><View style={styles.threeCol}><Metric label="상승일" value={`${up}일`} color={colors.up} /><Metric label="하락일" value={`${down}일`} color={colors.down} /></View></Card>
    <Text style={styles.caption}>날짜를 누르면 지수, 수급, 시장폭과 장중 그래프를 볼 수 있습니다. 기록이 없는 평일을 임의로 휴장일로 판단하지 않습니다.</Text>
    {selected && <DayDetail day={selected} close={() => setSelected(null)} />}
  </Page>;
}
