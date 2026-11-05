import type { Sector } from './market-research';

export type MapSector = Sector & { id: string; sources: Sector['market'][]; industry: boolean };
// A conservative name allowlist: derived/leveraged indices remain in the full-index view.
const industryNames = new Set(['음식료담배','음식료품','음식료','섬유의류','섬유의복','종이목재','종이목재제품','화학','제약','의약품','비금속','비금속광물','금속','철강금속','기계장비','기계','전기전자','의료정밀기기','의료정밀','운송장비부품','운수장비','유통','유통업','전기가스','전기가스업','건설','건설업','운송창고','운수창고','통신','통신업','금융','금융업','증권','보험','일반서비스','서비스업','부동산','IT서비스','오락문화','출판매체복제','정보기기','통신장비','반도체','IT부품','소프트웨어','디지털컨텐츠','인터넷','방송서비스','통신서비스','컴퓨터서비스','기타제조']);
export function mapSectors(items: Sector[]): MapSector[] {
  const result = new Map<string, MapSector>();
  for (const item of items) {
    const change = typeof item.change === 'number' && Number.isFinite(item.change) ? item.change : null;
    const id = `${item.code}:${item.name}:${item.price}:${change}`;
    const existing = result.get(id);
    if (existing) { if (!existing.sources.includes(item.market)) existing.sources.push(item.market); continue; }
    result.set(id, { ...item, change, id, sources: [item.market], industry: industryNames.has(item.name.replace(/[\s·ㆍ・&/-]/g, '')) });
  }
  return [...result.values()];
}
export function sectorDistribution(items: MapSector[]) {
  return items.reduce((a, s) => { a[s.change === null ? 'missing' : s.change > 0 ? 'up' : s.change < 0 ? 'down' : 'flat']++; return a; }, { up: 0, down: 0, flat: 0, missing: 0 });
}
export function sectorColor(change: number | null) {
  if (change === null || change === 0) return '#252b2c';
  const strength = Math.min(1, Math.abs(change) / 5);
  return `hsl(${change > 0 ? 350 : 215} ${38 + strength * 24}% ${18 + strength * 20}%)`;
}
