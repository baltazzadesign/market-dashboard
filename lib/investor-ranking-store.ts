import { stockDate, type StockInvestor } from './stock-flow-model';
import { selectRanking, type RankingMarket, type RankingSnapshot } from './investor-ranking';

async function rankingDb<T>(path:string,init:RequestInit={}):Promise<T>{
  const base=process.env.SUPABASE_URL?.replace(/\/$/,'').replace(/\/rest\/v1$/,''),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!key)throw Error('매매 순위 저장소 설정이 필요합니다.');
  const response=await fetch(base+'/rest/v1/'+path,{...init,headers:{apikey:key,authorization:'Bearer '+key,'content-type':'application/json',...init.headers},cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('매매 순위 저장소에 연결하지 못했습니다. 순위 테이블 설치와 서버 설정을 확인해 주세요.');
  const text=await response.text();return (text?JSON.parse(text):null) as T;
}
export async function readRankingSnapshot(date?:string):Promise<RankingSnapshot|null>{
  if(date&&stockDate(date)!==date)throw Error('조회 날짜를 확인해 주세요.');
  const params=new URLSearchParams({select:'snapshot',order:'date.desc',limit:'1'});
  if(date)params.set('date','eq.'+date);
  const rows=await rankingDb<{snapshot:RankingSnapshot}[]>('investor_rankings?'+params);
  const result=rows[0]?.snapshot??null;
  if(result&&(result.version!==1||stockDate(result.date)!==result.date||!result.groups||!Array.isArray(result.historyDates)))throw Error('저장된 매매 순위 형식을 확인해 주세요. 수집기를 다시 실행해 주세요.');
  return result;
}
export async function readInvestorRanking(date:string|undefined,investor:StockInvestor,market:RankingMarket){
  const [snapshot,available]=await Promise.all([readRankingSnapshot(date),rankingDb<{date:string}[]>('investor_rankings?select=date&order=date.desc&limit=1000')]);
  return selectRanking(snapshot,available.map(row=>row.date).filter(date=>stockDate(date)===date),investor,market);
}
export async function writeRankingSnapshot(snapshot:RankingSnapshot){
  await rankingDb('investor_rankings?on_conflict=date',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({date:snapshot.date,snapshot,updated_at:snapshot.collectedAt})});
}
