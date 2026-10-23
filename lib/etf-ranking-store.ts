import type {EtfSnapshot,EtfResponse} from './etf-ranking';
// Independent table: never modifies the existing stock-ranking or member data.
async function query<T>(path:string,init:RequestInit={}):Promise<T>{
  const base=process.env.SUPABASE_URL?.replace(/\/$/,'').replace(/\/rest\/v1$/,''),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!key)throw Error('ETF 순위 저장소 설정을 확인해 주세요.');
  const response=await fetch(base+'/rest/v1/etf_rankings'+path,{...init,headers:{apikey:key,authorization:'Bearer '+key,'content-type':'application/json',...init.headers},cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('ETF 순위를 불러오지 못했습니다. 잠시 후 다시 조회해 주세요.');
  const text=await response.text();return (text?JSON.parse(text):null) as T;
}
export async function readEtfRanking(date?:string):Promise<EtfResponse>{
  const params=new URLSearchParams({select:'snapshot',order:'date.desc',limit:'1'});if(date)params.set('date','eq.'+date);
  const [rows,dates]=await Promise.all([query<{snapshot:EtfSnapshot}[]>('?'+params),query<{date:string}[]>('?select=date&order=date.desc&limit=120')]);
  return {ok:true,dates:dates.map(row=>row.date),snapshot:rows[0]?.snapshot??null};
}
export async function saveEtfRanking(snapshot:EtfSnapshot){
  const old=(await readEtfRanking(snapshot.date)).snapshot;
  if(old&&Object.keys(old.groups).some(key=>old.groups[key as keyof typeof old.groups].covered>snapshot.groups[key as keyof typeof old.groups].covered))return false;
  await query('?on_conflict=date',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({date:snapshot.date,snapshot,updated_at:snapshot.collectedAt})});return true;
}
