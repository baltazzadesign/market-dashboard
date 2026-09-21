import React from 'react';
import { ImageBackground, Pressable, Text, View } from 'react-native';
import { DarkTheme, NavigationContainer, useNavigation, type NavigatorScreenParams } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, type NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useApp } from './state/AppProvider';
import { DashboardScreen, FlowScreen, BreadthScreen, PulseScreen } from './screens/MarketScreens';
import { CalendarScreen } from './screens/CalendarScreen';
import { LoginScreen, SettingsScreen } from './screens/SettingsScreen';
import { SectorsScreen } from './screens/SectorsScreen';
import { Card, Loading, Page, styles } from './components/ui';
import { colors } from './theme';
import { ScannerScreen, NotesScreen, ChartsScreen } from './screens/TerminalScreens';
export type TabParams = { Dashboard: undefined; Flow: undefined; Breadth: undefined; Calendar: undefined; More: undefined };
export type RootStackParams = { Main: NavigatorScreenParams<TabParams> | undefined; Pulse: undefined; Sectors: undefined; Settings: undefined; Scanner: undefined; Notes: undefined; Charts: undefined; Login: undefined };
const Tabs = createBottomTabNavigator<TabParams>(), Stack = createNativeStackNavigator<RootStackParams>();
const icons: Record<keyof TabParams, keyof typeof Ionicons.glyphMap> = { Dashboard: 'grid-outline', Flow: 'swap-horizontal-outline', Breadth: 'stats-chart-outline', Calendar: 'calendar-outline', More: 'ellipsis-horizontal' };
function MoreScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const items: { route: 'Pulse' | 'Sectors' | 'Settings' | 'Scanner' | 'Notes' | 'Charts'; title: string; detail: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { route: 'Pulse', title: 'Market Pulse', detail: '시장 전반의 체력과 장중 흐름', icon: 'pulse-outline' },
    { route: 'Sectors', title: '시장리서치', detail: '업종 히트맵과 종목 스캐너', icon: 'layers-outline' },
    { route: 'Scanner', title: '종목 스캐너', detail: '등락률·거래대금·거래량 순위', icon: 'search-outline' },
    { route: 'Notes', title: '내 메모', detail: '웹과 공유하는 날짜별 시장 기록', icon: 'book-outline' },
    { route: 'Charts', title: '차트 전체보기', detail: '지수·수급·시장폭 차트 확대', icon: 'expand-outline' },
    { route: 'Settings', title: '설정', detail: '서버 연결과 조회 설정', icon: 'options-outline' },
  ];
  return <Page title="더보기" kicker="YOUR MARKET TOOLKIT"><ImageBackground source={require('../assets/balta-landscape-v2.webp')} style={{ height: 140, justifyContent: 'center', padding: 20, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', borderRadius: 7 }}><Text style={{ fontSize: 19, color: colors.gold, fontWeight: '700', lineHeight: 30 }}>시장을 읽는{'\n'}발바닥의 감각</Text></ImageBackground>{items.map(item => <Pressable key={item.route} accessibilityRole="button" onPress={() => navigation.navigate(item.route)}><Card><View style={[styles.row, { gap: 16, paddingVertical: 8 }]}><Ionicons name={item.icon} color={colors.gold} size={25} /><View style={{ flex: 1, gap: 4 }}><Text style={styles.heading}>{item.title}</Text><Text style={styles.caption}>{item.detail}</Text></View><Ionicons name="chevron-forward" color={colors.muted} size={18} /></View></Card></Pressable>)}</Page>;
}
function MainTabs() {
  return <Tabs.Navigator screenOptions={({ route }) => ({ headerShown: false, tabBarActiveTintColor: colors.gold, tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line, paddingTop: 8 }, tabBarLabelStyle: { fontSize: 10, paddingBottom: 3 },
    tabBarIcon: ({ color, size }) => <Ionicons name={icons[route.name]} color={color} size={size - 2} /> })}>
    <Tabs.Screen name="Dashboard" component={DashboardScreen} options={{ title: '홈' }} /><Tabs.Screen name="Flow" component={FlowScreen} options={{ title: '수급' }} /><Tabs.Screen name="Breadth" component={BreadthScreen} options={{ title: '시장폭' }} /><Tabs.Screen name="Calendar" component={CalendarScreen} options={{ title: '캘린더' }} /><Tabs.Screen name="More" component={MoreScreen} options={{ title: '더보기' }} />
  </Tabs.Navigator>;
}
export function Navigation() {
  const app = useApp();
  if (!app.ready) return <View style={[styles.safe, { justifyContent: 'center', padding: 28 }]}><Loading /></View>;
  return <NavigationContainer theme={{ ...DarkTheme, colors: { ...DarkTheme.colors, primary: colors.gold, background: colors.bg, card: colors.panel, text: colors.text, border: colors.line } }}>
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      {app.session || app.mode === 'demo' ? <><Stack.Screen name="Main" component={MainTabs} /><Stack.Screen name="Pulse" component={PulseScreen} /><Stack.Screen name="Sectors" component={SectorsScreen} /><Stack.Screen name="Settings" component={SettingsScreen} /><Stack.Screen name="Scanner" component={ScannerScreen} /><Stack.Screen name="Notes" component={NotesScreen} /><Stack.Screen name="Charts" component={ChartsScreen} /></> : <Stack.Screen name="Login" component={LoginScreen} />}
    </Stack.Navigator>
  </NavigationContainer>;
}
