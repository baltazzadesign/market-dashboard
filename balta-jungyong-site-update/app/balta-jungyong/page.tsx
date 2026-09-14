import type { Metadata } from "next";
import localFont from "next/font/local";

const bookFont = localFont({
  src: [
    { path: "./fonts/regular.woff", weight: "400", style: "normal" },
    { path: "./fonts/bold.woff", weight: "700", style: "normal" },
  ],
  variable: "--font-balta-serif",
  display: "swap",
  preload: false,
});
import BaltaJungyongReader from "./BaltaJungyongReader";
import { baltaJungyongChapters } from "./data";

export const metadata: Metadata = {
  title: "발타 중용 | baltatool",
  description: "투자와 삶의 균형을 담은 발타 중용 33장",
};

export default function BaltaJungyongPage() {
  return <div className={bookFont.variable}><BaltaJungyongReader chapters={baltaJungyongChapters} /></div>;
}
