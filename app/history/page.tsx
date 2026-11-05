import type { Metadata } from "next";
import HistoryWorkspace from "@/components/dashboard/HistoryWorkspace";
import { kstParts } from "@/lib/balta-model";
export const metadata:Metadata={title:"시장 캘린더 · 월간 평가"};
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <HistoryWorkspace initialDate={kstParts().date} initialTab={tab === 'review' || tab === 'positions' ? tab : 'calendar'}/>;
}
