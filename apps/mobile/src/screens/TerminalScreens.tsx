import React, { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useIsFocused, useNavigation, usePreventRemove } from '@react-navigation/native';
import { useApp, useDay, useTerminal } from '../state/AppProvider';
import { Button, Card, DateBar, Heading, Notice, Page, QueryNotice, Segment, styles } from '../components/ui';
import { Chart } from '../components/Chart';
import { flowPoints, flowSeries, breadthPoints, regularRows } from './MarketScreens';
import { colors, directionColor, numberText, signed } from '../theme';
import type { Note, Ranking, StockDirectory } from '../data/terminal';

export function ScannerScreen() {
  const nav = useNavigation(), app = useApp(), focused = useIsFocused();
  const [sort, setSort] = useState('up'), [market, setMarket] = useState('all'), [search, setSearch] = useState('');
  const feed = useTerminal<Ranking>('/api/market/ranking?sort=' + sort + '&market=' + market, focused);
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const timer = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  const directory = useTerminal<StockDirectory>('/api/market/stocks?q=' + encodeURIComponent(debounced) + '&market=' + market, focused && !!debounced);
  const searching = !!search.trim();
  const rows = feed.data?.rows ?? [];
  const result = searching ? directory : feed;
  return <Page title="종목 스캐너" kicker="MARKET RESEARCH" back={() => nav.goBack()}><Segment value={sort} onChange={setSort} items={[{ key: 'up', label: '상승률' }, { key: 'down', label: '하락률' }, { key: 'turnover', label: '거래대금' }, { key: 'volume', label: '거래량' }]}/><Segment value={market} onChange={setMarket} items={[{ key: 'all', label: '전체' }, { key: 'kospi', label: 'KOSPI' }, { key: 'kosdaq', label: 'KOSDAQ' }]}/><TextInput style={styles.input} accessibilityLabel="종목 검색" value={search} onChangeText={setSearch} placeholder="전체 종목명 또는 코드 검색" maxLength={60} placeholderTextColor={colors.muted}/><QueryNotice error={result.error} hasData={!!result.data} retry={() => void result.refetch()}/><Card><Heading title={searching ? "전체 종목 검색" : "종목 순위"} detail="KIS · KOSPI / KOSDAQ"/>{app.mode === 'demo' ? <Text style={styles.caption}>종목 순위는 실제 서버에 연결하면 조회됩니다.</Text> : searching ? (debounced !== search.trim() || directory.isPending ? <Text style={styles.caption}>종목 검색 중…</Text> : !directory.data?.rows.length ? <Text style={styles.caption}>일치하는 종목이 없습니다.</Text> : directory.data.rows.map(row => <Pressable accessibilityRole="link" key={row.code} onPress={() => { void Linking.openURL('https://finance.naver.com/item/main.naver?code=' + row.code).catch(() => {}); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line }}><View style={{ flex: 1 }}><Text style={styles.body}>{row.name}</Text><Text style={styles.small}>{row.code} · {row.market.toUpperCase()}</Text></View><Text style={styles.gold}>상세 ↗</Text></Pressable>)) : feed.isPending ? <Text style={styles.caption}>종목 조회 중…</Text> : !rows.length ? <Text style={styles.caption}>조회된 순위 내 검색 결과가 없습니다.</Text> : rows.map((row, i) => <Pressable key={row.code} accessibilityRole="link" onPress={() => { void Linking.openURL('https://finance.naver.com/item/main.naver?code=' + encodeURIComponent(row.code)).catch(() => {}); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#2B3326' }}><Text style={[styles.small, { width: 20 }]}>{i + 1}</Text><View style={{ flex: 1 }}><Text style={styles.body} numberOfLines={1}>{row.name}</Text><Text style={styles.small}>{row.code}</Text></View><View style={{ alignItems: 'flex-end' }}><Text style={styles.body}>{numberText(row.price)}</Text><Text style={{ fontSize: 11, color: directionColor(row.rate) }}>{sort === 'turnover' ? numberText(row.turnover == null ? null : row.turnover / 1e8, 1) + '억' : sort === 'volume' ? numberText(row.volume) + '주' : signed(row.rate, 2) + '%'}</Text></View></Pressable>)}</Card><Text style={styles.small}>전체 KOSPI·KOSDAQ 종목명·코드 검색, 최대 30건. 종목을 누르면 네이버 증권에서 상세 정보가 열립니다.</Text></Page>;
}

export function NotesScreen() {
  const app = useApp(), nav = useNavigation();
  const [noteDate, setNoteDate] = useState(app.date), [original, setOriginal] = useState({ body: '', tags: '' });
  const [body, setBody] = useState(''), [tags, setTags] = useState(''), [version, setVersion] = useState(0), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [nonce, setNonce] = useState(0);
  const dirty = body !== original.body || tags !== original.tags;
  usePreventRemove(dirty && app.mode === 'live', ({ data }) => {
    if (Platform.OS === 'web') { if (window.confirm('작성한 메모를 버리고 이동할까요?')) nav.dispatch(data.action); }
    else Alert.alert('저장하지 않은 메모', '변경사항을 버리고 이동할까요?', [{ text: '계속 작성', style: 'cancel' }, { text: '버리고 이동', style: 'destructive', onPress: () => nav.dispatch(data.action) }]);
  });
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setMessage('');
    if (app.mode === 'demo') { setLoading(false); setBody(''); setTags(''); setVersion(0); return; }
    app.client.terminal<{ note: Note | null }>('/api/market/notes?date=' + noteDate, controller.signal).then(data => { if (!controller.signal.aborted) { setBody(data.note?.body ?? ''); setTags(data.note?.tags ?? ''); setVersion(data.note?.version ?? 0); setOriginal({ body: data.note?.body ?? '', tags: data.note?.tags ?? '' }); } }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [app.client, noteDate, app.mode, nonce]);
  async function save() {
    setSaving(true); setMessage('');
    try { const result = await app.client.saveNote(noteDate, { body, tags, version }); setVersion(result.note.version); setOriginal({ body, tags }); setMessage('메모를 저장했습니다.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : '저장하지 못했습니다.'); }
    finally { setSaving(false); }
  }
  return <Page title="내 메모" kicker="MARKET JOURNAL" back={() => nav.goBack()}><DateBar date={noteDate} setDate={setNoteDate} disabled={loading || saving || body !== original.body || tags !== original.tags}/>{app.mode === 'demo' && <Notice text="미리보기에서는 메모가 서버에 저장되지 않습니다."/>}{error && <Notice error text={error} action="재조회" onPress={() => setNonce(v => v + 1)}/>}<Card><Heading title={noteDate + ' 시장 기록'} detail="웹과 같은 날짜별 공유 메모"/><TextInput multiline style={[styles.input, { minHeight: 230, textAlignVertical: 'top', fontSize: 14 }]} accessibilityLabel="메모 내용" value={body} editable={!loading && !saving && !error} maxLength={10000} onChangeText={setBody} placeholder={loading ? '메모 조회 중…' : '오늘 시장에서 눈여겨본 흐름을 기록하세요.'} placeholderTextColor={colors.muted}/><TextInput style={[styles.input, { marginTop: 12 }]} accessibilityLabel="메모 태그" value={tags} editable={!loading && !saving && !error} maxLength={200} onChangeText={setTags} placeholder="태그 (쉼표로 구분)" placeholderTextColor={colors.muted}/><Text style={[styles.small, { marginTop: 10 }]}>날짜를 바꾸기 전에 작성한 메모를 저장하세요.</Text><View style={{ marginTop: 15 }}><Button title="메모 저장" onPress={() => void save()} loading={saving} disabled={loading || !!error || app.mode === 'demo'}/></View>{message && <Text style={[styles.caption, { marginTop: 12 }]}>{message}</Text>}</Card></Page>;
}

export function ChartsScreen() {
  const focused = useIsFocused(), feed = useDay(undefined, focused), rows = regularRows(feed.data?.rows), nav = useNavigation();
  return <Page title="차트 전체보기" kicker="COMMAND CENTER" back={() => nav.goBack()} refresh={() => void feed.refetch()} refreshing={feed.isFetching && !feed.isPending}><DateBar/><QueryNotice error={feed.error} hasData={!!rows.length} retry={() => void feed.refetch()}/>{(['kospi', 'kosdaq'] as const).map(market => <Card key={market}><Chart title={market.toUpperCase()} points={rows.map(r => ({ minute: r.minute, time: r.time, values: { index: r[market] } }))} series={[{ key: 'index', label: market.toUpperCase(), color: colors.gold }]} decimals={2} height={220}/></Card>)}<Card><Chart title="투자주체별 누적 수급" points={flowPoints(rows)} series={flowSeries} height={240} unit="억원"/></Card><Card><Chart title="시장폭" points={breadthPoints(rows)} series={[{ key: 'up', label: '상승', color: colors.up }, { key: 'down', label: '하락', color: colors.down }, { key: 'flat', label: '보합', color: colors.muted }]} height={240} unit="종목"/></Card></Page>;
}
