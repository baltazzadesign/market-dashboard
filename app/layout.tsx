import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "baltatool · 시장 대시보드", template: "%s · baltatool" },
  description: "코스피·코스닥 시장 폭, 투자자 수급, 주요 신호와 일별 기록을 한 화면에서 확인하세요.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
