import { hasDashboardAccess } from '@/lib/balta-access';
import { stockDirectory } from '@/lib/kis-directory';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) return Response.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 60).toLocaleLowerCase();
  const market = new URL(request.url).searchParams.get('market') || 'all';
  if (!q) return Response.json({ ok: true, rows: [] });
  try {
    const rows = (await stockDirectory()).filter(r => (market === 'all' || r.market === market) && (r.name.toLocaleLowerCase().includes(q) || r.code.includes(q))).sort((a, b) => Number(b.code === q || b.name.toLocaleLowerCase() === q) - Number(a.code === q || a.name.toLocaleLowerCase() === q)).slice(0, 30);
    return Response.json({ ok: true, rows, asOf: new Date().toISOString() }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return Response.json({ ok: false, rows: [], error: '종목 검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 503 }); }
}
