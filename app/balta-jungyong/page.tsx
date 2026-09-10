import type { Metadata } from "next";
import BaltaJungyongReader from "./BaltaJungyongReader";
import { baltaJungyongChapters } from "./data";

export const metadata: Metadata = {
  title: "발타 중용 | baltatool",
  description: "투자와 삶의 균형을 담은 발타 중용 33장",
};

export default function BaltaJungyongPage() {
  return <BaltaJungyongReader chapters={baltaJungyongChapters} />;
}
