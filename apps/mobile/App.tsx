import React from 'react';
import { Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from './src/state/AppProvider';
import { Navigation } from './src/navigation';
import { Button, styles } from './src/components/ui';
class AppErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <View style={[styles.safe, { padding: 28, justifyContent: 'center', gap: 20 }]}><Text style={styles.title}>화면을 다시 열어 주세요</Text><Text style={styles.caption}>화면을 표시하는 중 오류가 발생했습니다.</Text><Button title="다시 열기" onPress={() => this.setState({ failed: false })} /></View> : this.props.children; }
}
export default function App() { return <SafeAreaProvider><StatusBar style="light" /><AppErrorBoundary><AppProvider><Navigation /></AppProvider></AppErrorBoundary></SafeAreaProvider>; }
