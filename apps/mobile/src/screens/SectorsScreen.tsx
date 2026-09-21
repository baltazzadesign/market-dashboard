import React, { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useApp, useSectors } from '../state/AppProvider';
import { Card, DateBar, Empty, Heading, Loading, Metric, Notice, Page, QueryNotice, Segment, styles } from '../components/ui';
import { colors, directionColor, numberText, signed } from '../theme';
import type { Sector } from '../data/model';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParams } from '../navigation';

export function SectorsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParams>>(), focused = useIsFocused(), feed = useSectors(focused), { mode } = useApp();
  const [market, setMarket] = useState('all'), [sort, setSort] = useState('up'), [selected, setSelected] = useState<Sector | null>(null);
  const rows = (feed.data?.sectors ?? []).filter(s => market === 'all' || s.market === market).sort((a, b) => {
    if (a.change === null) return 1; if (b.change === null) return -1;
    return sort === 'up' ? b.change - a.change : a.change - b.change;
  });
  return <Page title="시장리서치" kicker="SECTOR MAP" back={() => nav.goBack()} refresh={() => void feed.refetch()} refreshing={feed.isFetching && !feed.isPending}>
    <Pressable onPress={() => nav.navigate("Scanner")} accessibilityRole="button"><Card><Heading title="종목 스캐너" detail="상승·하락·거래대금·거래량 순위" action="열기" onPress={() => nav.navigate("Scanner")}/></Card></Pressable><DateBar /><Segment value={market} onChange={setMarket} items={[{ key: 'all', label: '전체' }, { key: 'kospi', label: 'KOSPI' }, { key: 'kosdaq', label: 'KOSDAQ' }]} />
    <QueryNotice error={feed.error} hasData={!!rows.length} retry={() => void feed.refetch()} />
    {feed.isPending ? <Loading /> : !rows.length ? <Card><Empty title="저장된 업종 데이터가 없습니다" detail="이 날짜의 업종 기록이 수집되면 여기에 표시됩니다." /></Card> : <>
      <View style={[styles.row, { justifyContent: 'space-between' }]}><Text style={styles.caption}>{rows.length}개 업종 · {feed.data?.time || '기준 시각 미제공'}</Text><Pressable accessibilityRole="button" onPress={() => setSort(sort === 'up' ? 'down' : 'up')} style={{ padding: 8 }}><Text style={styles.gold}>{sort === 'up' ? '상승순 ↓' : '하락순 ↑'}</Text></Pressable></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{rows.map(sector => { const n = sector.change, strength = Math.min(1, Math.abs(n ?? 0) / 4); return <Pressable key={sector.market + sector.code} onPress={() => setSelected(sector)} accessibilityRole="button" accessibilityLabel={`${sector.name} ${signed(n, 2)}퍼센트. 상세 보기`} style={{ width: '48.2%', minHeight: 125, padding: 16, borderRadius: 14, justifyContent: 'space-between', borderWidth: 1, borderColor: n == null || n === 0 ? colors.line : n > 0 ? '#674047' : '#314E75', backgroundColor: n == null || n === 0 ? colors.panel : n > 0 ? `rgba(202,77,90,${.1 + strength * .28})` : `rgba(63,116,209,${.1 + strength * .28})` }}>
        <Text style={styles.small}>{sector.market.toUpperCase()}</Text><Text style={[styles.heading, { fontSize: 15 }]} numberOfLines={2}>{sector.name}</Text><Text style={[styles.metric, { fontSize: 24, color: directionColor(n) }]}>{signed(n, 2)}{n !== null ? '%' : ''}</Text>
      </Pressable>; })}</View>
      <Card><Heading title="주도 업종" detail="현재 표시한 업종 중 등락률 순위" />{[...rows].filter(s => s.change !== null).sort((a, b) => b.change! - a.change!).slice(0, 5).map((s, i) => <View key={s.code + s.market} style={[styles.row, { paddingVertical: 12, borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: colors.line }]}><Text style={[styles.gold, { width: 21 }]}>{String(i + 1).padStart(2, '0')}</Text><Text style={[styles.body, { flex: 1 }]}>{s.name}</Text><Text style={{ color: directionColor(s.change) }}>{signed(s.change, 2)}%</Text></View>)}</Card>
    </>}
    <Text style={styles.caption}>색상은 업종 등락률을 나타냅니다. 타일 면적은 동일하며 거래대금 비중을 뜻하지 않습니다.</Text>
    {selected && <Modal transparent animationType="fade" onRequestClose={() => setSelected(null)}><SafeAreaView style={{ flex: 1, backgroundColor: '#000B', justifyContent: 'center', padding: 22 }}><Card>
      <Heading title={selected.name} detail={selected.market.toUpperCase()} action="닫기" onPress={() => setSelected(null)} />{mode === 'demo' && <Notice text="예시 데이터입니다" />}<View style={{ marginVertical: 20 }}><Metric label="등락률" value={signed(selected.change, 2) + (selected.change === null ? '' : '%')} color={directionColor(selected.change)} /></View><Metric label="업종 지수" value={numberText(selected.price, 2)} /><Text style={[styles.caption, { marginTop: 20 }]}>{feed.data?.time || '기준 시각 미제공'} · {feed.data?.date}</Text>
    </Card></SafeAreaView></Modal>}
  </Page>;
}
