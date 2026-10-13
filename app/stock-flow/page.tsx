import StockFlowWorkspace from '@/components/dashboard/StockFlowWorkspace';
import { stockInvestors } from '@/lib/stock-flow-model';
export const metadata = { title:'종목 수급 분석' };
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const p = await searchParams;
  const investor=stockInvestors.find(i=>i.key===p.investor)?.key,mode=p.mode==='daily'?'daily':'cumulative';
  return <StockFlowWorkspace key={[String(p.code || p.q || ''),investor,mode].join(':')} initialCode={typeof p.code === 'string' && /^\d{6}$/.test(p.code) ? p.code : ''} initialQuery={typeof p.q === 'string' ? p.q.slice(0,60) : ''} initialInvestor={investor} initialMode={mode}/>;
}
