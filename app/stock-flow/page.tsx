import StockFlowWorkspace from '@/components/dashboard/StockFlowWorkspace';
export const metadata = { title:'종목 수급 분석' };
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const p = await searchParams;
  return <StockFlowWorkspace key={String(p.code || p.q || '')} initialCode={typeof p.code === 'string' && /^\d{6}$/.test(p.code) ? p.code : ''} initialQuery={typeof p.q === 'string' ? p.q.slice(0,60) : ''}/>;
}
