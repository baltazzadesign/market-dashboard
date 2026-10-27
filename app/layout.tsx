import type { Metadata } from "next";
import "./globals.css";
import "./terminal.css";
import {FlowMarketProvider} from '@/components/dashboard/FlowMarketContext';
import TerminalHeader from "@/components/dashboard/TerminalHeader";
export const metadata: Metadata = {
  title: { default: "baltatool · 시장 대시보드", template: "%s · baltatool" },
  description: "코스피·코스닥 시장 폭, 투자자 수급, 주요 신호와 일별 기록을 한 화면에서 확인하세요.",
  icons: { icon: [{ url: '/icon.svg?v=balta-crown-1', type: 'image/svg+xml' }, { url: '/favicon.ico?v=balta-crown-1', sizes: '16x16 32x32 48x48 64x64' }], apple: '/apple-icon.png?v=balta-crown-1' },
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body><FlowMarketProvider><TerminalHeader/>{children}</FlowMarketProvider></body></html>;
}
