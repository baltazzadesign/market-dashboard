import MarketBriefing from '@/components/dashboard/MarketBriefing';
export const metadata = { title: '시장 브리핑' };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <MarketBriefing initialDate={typeof params.date === 'string' ? params.date : ''}/>;
}
