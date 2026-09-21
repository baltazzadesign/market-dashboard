import ResearchWorkspace from '@/components/dashboard/ResearchWorkspace';
export const metadata={title:'시장리서치'};
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === 'string' ? params[key] as string : '';
  return <ResearchWorkspace initialTab={value('tab') || 'sectors'} query={value('q')} requestedDate={value('date')}/>;
}
