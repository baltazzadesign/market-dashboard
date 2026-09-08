import type { Metadata } from "next";
import HistoryWorkspace from "@/components/dashboard/HistoryWorkspace";
export const metadata:Metadata={title:"시장 캘린더 · 월간 평가"};
export default function HistoryPage(){return <HistoryWorkspace/>;}
