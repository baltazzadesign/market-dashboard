import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useApp } from '../state/AppProvider';
import { Button, Card, Heading, Notice, Page, Segment, styles } from '../components/ui';
import { colors } from '../theme';

export function LoginScreen() {
  const app = useApp(), [base, setBase] = useState(app.prefs.baseUrl), [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [editServer, setEditServer] = useState(false);
  async function login() { setError(''); setBusy(true); try { await app.login(base, code); setCode(''); } catch (e) { setError(e instanceof Error ? e.message : '로그인하지 못했습니다.'); } finally { setBusy(false); } }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Page title="발타툴" kicker="THE EDGE IS IN THE FLOW" right={<Ionicons name="lock-closed-outline" size={21} color={colors.gold} />}>
    <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 14, gap: 14 }}><Image source={require('../../assets/icon.png')} style={{ width: 186, height: 186, borderRadius: 34 }} accessibilityLabel="검정·금색 발바닥 타짜 아이콘" /><Text style={{ color: colors.text, fontSize: 25, fontWeight: '600', letterSpacing: -.9 }}>시장의 흐름을 읽다.</Text><Text style={[styles.caption, { textAlign: 'center' }]}>수급부터 시장의 체력까지.{`\n`}발타툴의 인사이트를 손안에서.</Text></View>
    <Card><Heading title="발타툴에 연결" detail="웹에서 사용하는 접근 코드로 로그인하세요." /><Text style={[styles.caption, { marginBottom: 7 }]}>접근 코드</Text><TextInput accessibilityLabel="접근 코드" secureTextEntry autoCapitalize="none" autoCorrect={false} value={code} onChangeText={setCode} style={styles.input} placeholder="접근 코드를 입력하세요" placeholderTextColor={colors.muted} editable={!busy} onSubmitEditing={() => code.trim() && void login()} returnKeyType="go" />
      <View style={{ height: 16 }} /><Button title="연결하고 시작하기" onPress={() => void login()} loading={busy} disabled={!code.trim()} />
      <Pressable accessibilityRole="button" onPress={() => setEditServer(!editServer)} style={{ paddingTop: 16, paddingBottom: 3 }}><Text style={styles.caption}>서버 주소 {editServer ? '접기' : '변경'} <Text style={styles.gold}>⌄</Text></Text></Pressable>
      {editServer && <TextInput accessibilityLabel="서버 주소" value={base} onChangeText={setBase} editable={!busy} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={[styles.input, { marginTop: 12, fontSize: 13 }]} />}
    </Card>
    {error || app.message ? <Notice error text={error || app.message} /> : null}
    {Platform.OS === 'web' && <Notice text="웹에서는 화면 미리보기를 제공합니다. 실제 서버 연결은 iOS/Android 앱에서 이용하세요." />}
    <Button title="예시 데이터로 둘러보기" onPress={app.enterDemo} secondary disabled={busy} /><Text style={[styles.small, { textAlign: 'center' }]}>실제 시장 데이터와 예시 데이터는 구분해서 표시됩니다.</Text>
  </Page></KeyboardAvoidingView>;
}
export function SettingsScreen() {
  const app = useApp(), nav = useNavigation(), [base, setBase] = useState(app.prefs.baseUrl), [feedback, setFeedback] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function save(patch: Parameters<typeof app.setPreferences>[0]) { setBusy(true); setError(''); setFeedback(''); try { await app.setPreferences(patch); setFeedback('설정을 저장했습니다.'); } catch (e) { setError(e instanceof Error ? e.message : '설정을 저장하지 못했습니다.'); } finally { setBusy(false); } }
  return <Page title="설정" kicker="YOUR TERMINAL" back={() => nav.goBack()}>
    <Card><View style={[styles.row, { gap: 14 }]}><Image source={require('../../assets/icon.png')} style={{ width: 60, height: 60, borderRadius: 14 }} /><View><Text style={styles.heading}>발타툴</Text><Text style={styles.caption}>모바일 1.0.2 · {app.mode === 'demo' ? '예시 데이터' : '서버 연결'}</Text></View></View></Card>
    <Card><Heading title="조회 설정" /><Text style={[styles.caption, { marginBottom: 10 }]}>자동 새로고침</Text><Segment value={String(app.prefs.interval)} onChange={v => void save({ interval: Number(v) as 0 | 60 | 120 })} items={[{ key: '60', label: '1분' }, { key: '120', label: '2분' }, { key: '0', label: '수동' }]} /><Text style={[styles.caption, { marginTop: 12 }]}>앱이 활성화된 동안 오늘 기록을 갱신합니다. 화면을 아래로 당겨 직접 새로고침할 수 있습니다.</Text><View style={styles.divider} /><Text style={[styles.caption, { marginBottom: 10 }]}>기본 지수</Text><Segment value={app.prefs.market} onChange={market => void save({ market })} items={[{ key: 'kospi', label: 'KOSPI' }, { key: 'kosdaq', label: 'KOSDAQ' }]} /></Card>
    <Card><Heading title="서버 연결" detail="서버 주소를 바꾸면 다시 로그인합니다." /><TextInput accessibilityLabel="서버 주소" autoCapitalize="none" autoCorrect={false} keyboardType="url" value={base} onChangeText={setBase} editable={!busy} style={styles.input} /><View style={{ height: 14 }} /><Button title="서버 주소 저장" onPress={() => void save({ baseUrl: base })} loading={busy} secondary /></Card>
    {error ? <Notice error text={error} /> : null}{feedback ? <Notice text={feedback} /> : null}
    <Card><Heading title="데이터 표시" /><Text style={styles.caption}>모든 날짜와 시각은 한국 시간(KST)입니다. 지수·수급·시장폭은 정규장 저장 기록을 표시합니다. 수급 색상은 외국인 파랑, 기관 빨강, 개인 노랑입니다.</Text></Card>
    <Button title={app.mode === 'demo' ? '미리보기 종료 · 실제 서버 연결' : '로그아웃'} onPress={() => void app.logout()} secondary />
  </Page>;
}
