// Server-side OpenDART adapter. Never import this module from a client component.
import { strFromU8, unzipSync } from 'fflate';
import { analyze, emptyYear, parseYear, type Basis, type CashFlowResponse, type CashFlowYear, type DartAccount } from './cash-flow-model';

export class CashFlowError extends Error {
  constructor(message: string, public readonly code = 'UPSTREAM_ERROR') { super(message); }
}
type Body = { status?: string; list?: DartAccount[]; corp_name?: string; induty_code?: string; acc_mt?: string };
type Corp = { code: string; name: string };
type Fetcher = typeof fetch;
let directory: {until: number; promise: Promise<Map<string,Corp>>} | undefined;
const cache = new Map<string,{until:number;promise:Promise<CashFlowResponse>}>();
const errors: Record<string,string> = {
  '010':'OpenDART 인증키를 확인해 주세요.', '011':'OpenDART 인증키가 중지된 상태입니다.',
  '012':'OpenDART 허용 IP 설정을 확인해 주세요.', '020':'OpenDART 요청 한도를 초과했습니다. 잠시 후 다시 조회해 주세요.',
  '800':'OpenDART 점검 중입니다.', '901':'OpenDART 인증키의 이용 상태를 확인해 주세요.',
};
function upstreamError(status = '') { return new CashFlowError(errors[status] || 'OpenDART 데이터를 받지 못했습니다.', status || 'UPSTREAM_ERROR'); }
function dartKey() {
  const key = process.env.DART_API_KEY?.trim();
  if (!key) throw new CashFlowError('현금흐름 데이터 연결이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.', 'DART_NOT_CONFIGURED');
  return key;
}
async function request(endpoint: string, params: Record<string,string>, deadline: number, fetcher: Fetcher): Promise<Response> {
  const remaining = deadline - Date.now();
  if (remaining < 100) throw new CashFlowError('조회 시간이 초과됐습니다. 다시 조회해 주세요.', 'TIMEOUT');
  const url = new URL('https://opendart.fss.or.kr/api/' + endpoint);
  url.search = new URLSearchParams({...params,crtfc_key:dartKey()}).toString();
  try {
    const response = await fetcher(url,{cache:'no-store',signal:AbortSignal.timeout(Math.min(10000,remaining))});
    if (!response.ok) throw upstreamError();
    return response;
  } catch(e) { if (e instanceof CashFlowError) throw e; throw new CashFlowError('OpenDART 연결에 실패했습니다. 잠시 후 다시 조회해 주세요.'); }
}
async function json(endpoint: string, params: Record<string,string>, deadline: number, fetcher: Fetcher): Promise<Body> {
  const response = await request(endpoint,params,deadline,fetcher);
  let body: Body;
  try { body = await response.json(); } catch { throw upstreamError(); }
  if (body.status !== '000' && body.status !== '013') throw upstreamError(body.status);
  return body;
}
export function parseDirectory(xml: string): Map<string,Corp> {
  const result = new Map<string,Corp>();
  const tag = (s: string, key: string) => s.match(new RegExp('<'+key+'>([\\s\\S]*?)</'+key+'>'))?.[1]?.trim() ?? '';
  for (const match of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
    const stock = tag(match[1],'stock_code'), code = tag(match[1],'corp_code');
    if (/^\d{6}$/.test(stock) && /^\d{8}$/.test(code)) result.set(stock,{code,name:tag(match[1],'corp_name').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&apos;',"'")});
  }
  return result;
}
async function corporation(code: string, deadline: number, fetcher: Fetcher): Promise<Corp> {
  if (!directory || directory.until < Date.now()) {
    const promise = (async()=>{
      const response = await request('corpCode.xml',{},deadline,fetcher);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
        const status = strFromU8(bytes).match(/<status>(.*?)<\/status>/)?.[1]; throw upstreamError(status);
      }
      let files: Record<string,Uint8Array>;
      try { files = unzipSync(bytes,{filter:file => /CORPCODE\.xml$/i.test(file.name) && file.originalSize < 100_000_000}); } catch { throw upstreamError(); }
      const xml = Object.entries(files).find(([name])=>/CORPCODE\.xml$/i.test(name))?.[1];
      const found = xml ? parseDirectory(strFromU8(xml)) : new Map<string,Corp>();
      if (!found.size) throw upstreamError();
      return found;
    })();
    directory = {until:Date.now()+86400000,promise};
    promise.catch(()=>{if(directory?.promise===promise)directory=undefined;});
  }
  const found = (await directory.promise).get(code);
  if (!found) throw new CashFlowError('이 종목코드에 해당하는 DART 공시 회사를 찾지 못했습니다. 보통주 종목코드로 조회해 주세요.', 'CORP_NOT_FOUND');
  return found;
}
async function concurrent<T,R>(values: T[], job:(value:T)=>Promise<R>):Promise<R[]> {
  const output: R[] = new Array(values.length); let next=0;
  await Promise.all(Array.from({length:Math.min(3,values.length)},async()=>{while(next<values.length){const i=next++;output[i]=await job(values[i]);}}));
  return output;
}
export async function loadCashFlow(code: string, endYear: number, fetcher: Fetcher = fetch): Promise<CashFlowResponse> {
  dartKey();
  const deadline = Date.now()+48000, corp = await corporation(code,deadline,fetcher), warnings: string[] = [];
  let basis: Basis = 'CFS';
  const years = Array.from({length:5},(_,i)=>endYear-4+i);
  const companyPromise = json('company.json',{corp_code:corp.code},deadline,fetcher).catch(()=>null);
  const batch = (fs:Basis) => concurrent(years,async(year):Promise<CashFlowYear>=>{
    try {
      const body = await json('fnlttSinglAcntAll.json',{corp_code:corp.code,bsns_year:String(year),reprt_code:'11011',fs_div:fs},deadline,fetcher);
      return body.status === '013' ? emptyYear(year,fs) : Array.isArray(body.list) && body.list.length ? parseYear(body.list,year,fs) : emptyYear(year,fs,'error');
    } catch(e) {
      // Auth, quota, and configuration failures are not "missing statements".
      if(e instanceof CashFlowError && ['010','011','012','020','901','DART_NOT_CONFIGURED'].includes(e.code)) throw e;
      return emptyYear(year,fs,'error');
    }
  });
  let annual = await batch(basis);
  // Switch the WHOLE series only when all CFS requests explicitly report no data.
  if(annual.every(r=>r.status==='missing')){basis='OFS';annual=await batch(basis);warnings.push('조회한 5개 연도에 연결재무제표가 없어 전체 기간을 별도재무제표로 조회했습니다.');}
  const company = await companyPromise;
  const industry = company?.induty_code ?? '', fiscalMonth = company?.acc_mt ?? '';
  const financial = /^\d{2,6}$/.test(industry) ? /^(64|65|66)/.test(industry) : null;
  if(annual.every(r=>r.status==='error'))throw new CashFlowError('재무제표 조회에 실패했습니다. 잠시 후 다시 조회해 주세요.');
  if(annual.some(r=>r.status==='error'))warnings.push('일부 연도의 조회가 실패했습니다. 재조회 전까지 해당 연도의 수치와 점수를 보류합니다.');
  if(annual.at(-1)?.status!=='ok')warnings.push(`${endYear} 사업연도 데이터가 없어 최신 점수를 보류합니다. 과거 수치는 해당 연도 기준으로만 표시합니다.`);
  if(financial===true)warnings.push('금융업은 영업·재무 현금흐름의 성격이 달라 일반기업 점수를 제공하지 않습니다.');
  if(financial===null)warnings.push('업종을 확인하지 못해 일반기업 점수 적용을 보류합니다.');
  if(fiscalMonth && fiscalMonth!=='12')warnings.push(`결산월 ${fiscalMonth}월 기업입니다. 연도는 DART 사업연도이며 달력연도와 다를 수 있습니다.`);
  return {ok:true,code,name:company?.corp_name || corp.name,corpCode:corp.code,basis,endYear,fetchedAt:new Date().toISOString(),industry,financial,fiscalMonth,years:annual,analysis:analyze(annual,financial),warnings};
}
export function cachedCashFlow(code: string, endYear: number):Promise<CashFlowResponse> {
  const key=code+':'+endYear,hit=cache.get(key);
  if(hit && hit.until>Date.now())return hit.promise;
  for(const [k,v] of cache)if(v.until<Date.now())cache.delete(k);
  if(cache.size>=100)cache.delete(cache.keys().next().value!);
  const promise=loadCashFlow(code,endYear);
  cache.set(key,{until:Date.now()+300000,promise});
  promise.then(data=>{const entry=cache.get(key);if(entry?.promise===promise)entry.until=Date.now()+(data.financial===null||data.years.some(r=>r.status==='error')?30000:21600000);},()=>{if(cache.get(key)?.promise===promise)cache.delete(key);});
  return promise;
}

