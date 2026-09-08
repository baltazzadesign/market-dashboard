import type { Metadata } from "next";
import Workspace from "@/components/dashboard/Workspace";
export const metadata: Metadata = { title: "일별 분석" };
export default function DailyPage() { return <Workspace mode="daily"/>; }
