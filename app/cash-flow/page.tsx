import CashFlowWorkspace from '@/components/dashboard/CashFlowWorkspace';
export const metadata = { title:'기업 현금흐름' };
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const p=await searchParams;
  const code=typeof p.code==='string' && /^\d{6}$/.test(p.code)?p.code:'';
  return <CashFlowWorkspace key={code+':'+(p.period==='quarter'?'quarter':'annual')} initialCode={code} initialPeriod={p.period==='quarter'?'quarter':'annual'}/>;
}
