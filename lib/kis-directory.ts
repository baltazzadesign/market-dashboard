import { unzipSync } from 'fflate';
const masterBase = 'https://new.real.download.dws.co.kr/common/master/';
const cache = new Map<string, { expires: number; data: Promise<string> }>();
// Format definitions: KIS official stocks_info/*_code*.py, CP949 fixed widths.
export async function readKisMaster(file: 'kospi_code' | 'kosdaq_code' | 'ffcode') {
  const hit = cache.get(file); if (hit && hit.expires > Date.now()) return hit.data;
  const data = (async () => {
    const response = await fetch(masterBase + file + '.mst.zip', { signal: AbortSignal.timeout(12000), cache: 'no-store' });
    if (!response.ok) throw new Error('종목 목록을 읽지 못했습니다.');
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > 8_000_000) throw new Error('종목 목록 크기를 확인해 주세요.');
    const files = unzipSync(buffer, { filter: entry => entry.name === file + '.mst' && entry.originalSize < 20_000_000 });
    const bytes = files[file + '.mst'];
    if (!bytes) throw new Error('종목 목록 형식을 확인해 주세요.');
    return new TextDecoder('euc-kr').decode(bytes);
  })();
  cache.set(file, { expires: Date.now() + 86_400_000, data });
  try { return await data; } catch (error) { cache.delete(file); throw error; }
}
export async function stockDirectory() {
  const [kospi, kosdaq] = await Promise.all([readKisMaster('kospi_code'), readKisMaster('kosdaq_code')]);
  return ([['kospi', kospi, 228], ['kosdaq', kosdaq, 222]] as const).flatMap(([market, text, suffix]) => text.split(/\r?\n/).flatMap(line => {
    const prefix = (line + '\n').slice(0, -suffix), code = prefix.slice(0, 9).trim(), name = prefix.slice(21).trim();
    return /^\d{6}$/.test(code) && name ? [{ code, name, market }] : [];
  }));
}
export async function commodityCode(product: 'CL' | 'GC') {
  const master = await readKisMaster('ffcode');
  const contracts = master.split(/\r?\n/).map(text => text + '\n').map(line => ({
    code: line.slice(0, 32).trim(), name: line.slice(82, 107).trim(), exchange: line.slice(-92, -82).trim(),
    product: line.slice(-82, -72).trim(), active: line.slice(-7, -6) === '1', near: line.slice(-6, -5) === '1', spread: line.slice(-5, -4),
  })).filter(r => r.product === product && r.code && r.spread !== 'Y' && (r.active || r.near));
  return contracts.sort((a, b) => Number(b.active) - Number(a.active))[0] ?? null;
}
