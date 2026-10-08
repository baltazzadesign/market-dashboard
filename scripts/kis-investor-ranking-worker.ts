// Read-only KIS collector. Run on the existing collector PC, never inside a page request.
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { kstParts } from '../lib/balta-model';
import { marketClosedReason, parseAdditionalHolidays } from '../lib/market-calendar';
import { loadReversalUniverse } from '../lib/reversal-data';
import { loadRankingObservation } from '../lib/investor-ranking-data';
import { buildRankingSnapshot, rankingInvestors, type RankingObservation } from '../lib/investor-ranking';
import { writeRankingSnapshot, readRankingSnapshot } from '../lib/investor-ranking-store';

const directory=path.resolve('.runtime/investor-ranking'),lockPath=path.join(directory,'collector.lock');
const watch=process.argv.includes('--watch'),refresh=process.argv.includes('--refresh');
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
let stopping=false,locked=false;
const log=(message:string)=>console.log('[investor-ranking]',message);
function complete(row:RankingObservation){return rankingInvestors.every(key=>row.values?.[key]?.net!=null);}
async function acquireLock(){
  await mkdir(directory,{recursive:true});
  try{const handle=await open(lockPath,'wx');await handle.writeFile(String(process.pid));await handle.close();locked=true;}
  catch(error){
    if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
    const pid=Number(await readFile(lockPath,'utf8'));let alive=true;
    try{if(!Number.isInteger(pid)||pid<=0)throw Error('invalid lock');process.kill(pid,0);}
    catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH')alive=false;}
    if(alive)throw Error('매매 순위 수집기가 이미 실행 중이거나 잠금 파일 확인이 필요합니다.');
    await unlink(lockPath);await acquireLock();
  }
}
async function collect(){
  const now=kstParts(),closed=marketClosedReason(now.date,parseAdditionalHolidays(process.env.MARKET_HOLIDAYS));
  if(!closed&&now.time<'16:40')throw Error('당일 순위 수집은 한국시간 16:40 이후 실행해 주세요.');
  // Existing universe verifies the latest date against actual index daily rows.
  const universe=await loadReversalUniverse();
  // Fail early if the new table or credentials are missing, before thousands of calls.
  await readRankingSnapshot(universe.date);
  const file=path.join(directory,universe.date+'.json');
  let startedAt=new Date().toISOString();const rows=new Map<string,RankingObservation>();
  if(!refresh){
    try{
      const saved=JSON.parse(await readFile(file,'utf8'));
      if(saved.version===1&&saved.context===universe.context&&Array.isArray(saved.rows)){
        for(const row of saved.rows as RankingObservation[])if(complete(row))rows.set(row.code,row);
        if(typeof saved.startedAt==='string')startedAt=saved.startedAt;
      }
    }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')log('복구 파일을 읽지 못해 처음부터 수집합니다.');}
  }
  async function checkpoint(){
    const temp=file+'.tmp';await writeFile(temp,JSON.stringify({version:1,context:universe.context,startedAt,rows:[...rows.values()]}));await rename(temp,file);
  }
  log(`${universe.date} · 대상 ${universe.rows.length}종목 · 복구 ${rows.size}종목`);
  let consecutiveFailures=0,processed=0;
  for(const stock of universe.rows){
    if(stopping)break;
    if(rows.has(stock.code))continue;
    try{
      let observation:RankingObservation;
      try{observation=await loadRankingObservation(stock,universe.dates);}
      catch{await delay(12000);if(stopping)break;observation=await loadRankingObservation(stock,universe.dates);}
      rows.set(stock.code,observation);consecutiveFailures=0;
    }catch{consecutiveFailures++;log(stock.code+' 조회 실패 · 다음 실행에서 재시도합니다.');}
    processed++;
    if(processed%25===0){await checkpoint();log(`조회 ${rows.size}/${universe.rows.length} · 모든 주체 금액 확인 ${[...rows.values()].filter(complete).length}`);}
    if(consecutiveFailures>=15){log('연속 조회 실패로 중단합니다. 기존 KIS 토큰 수집기와 연결 상태를 확인해 주세요.');break;}
    await delay(500);
  }
  await checkpoint();
  const snapshot=buildRankingSnapshot(universe.rows,[...rows.values()],universe.dates,startedAt,new Date().toISOString());
  if(!Object.values(snapshot.groups).some(group=>group.covered>0))throw Error('기준일에 확인된 수급 금액이 없습니다. 원천 데이터 갱신 후 다시 실행해 주세요.');
  await writeRankingSnapshot(snapshot);
  const saved=await readRankingSnapshot(universe.date);
  if(saved?.collectedAt!==snapshot.collectedAt)log('기존 저장본의 수집 범위가 더 넓어 기존 결과를 유지했습니다.');
  const full=Object.values(snapshot.groups).every(group=>group.covered===group.expected);
  if(full){await unlink(file);log('수집 완료 · 사이트에서 확인할 수 있습니다. 원천 자료는 이후 정정될 수 있습니다.');}
  else log('일부 수집 · 확인된 범위만 표시합니다. 다시 실행하면 누락 종목을 재시도합니다.');
  return full;
}
async function main(){
  if(process.argv.some(arg=>arg==='--help')){console.log('node --env-file=.env.local --import tsx scripts/kis-investor-ranking-worker.ts [--watch] [--refresh]\n기본: 장후 1회, --watch: 영업일 16:40·18:00 이후 실행, --refresh: 중단 복구 대신 전체 재조회');return;}
  for(const key of ['KIS_APPKEY','KIS_APPSECRET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'])if(!process.env[key])throw Error(key+' 설정이 필요합니다.');
  await acquireLock();process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
  if(!watch){if(!await collect())process.exitCode=2;return;}
  log('장후 자동 수집 대기 · KST 16:40 / 18:00 · 종료 Ctrl+C');
  let lastSlot='',retryAfter=0;
  while(!stopping){
    const now=kstParts(),closed=marketClosedReason(now.date,parseAdditionalHolidays(process.env.MARKET_HOLIDAYS));
    const slot=now.date+':'+(now.time>='18:00'?'18:00':'16:40');
    if(!closed&&now.time>='16:40'&&slot!==lastSlot&&Date.now()>=retryAfter){
      try{const full=await collect();if(full)lastSlot=slot;else retryAfter=Date.now()+30*60000;}
      catch(error){console.error('[investor-ranking]',error instanceof Error?error.message:'수집 실패');retryAfter=Date.now()+30*60000;}
    }
    for(let i=0;i<30&&!stopping;i++)await delay(1000);
  }
}
main().catch(error=>{console.error('[investor-ranking]',error instanceof Error?error.message:'수집 실패');process.exitCode=1;})
  .finally(async()=>{if(locked)await unlink(lockPath).catch(()=>{});});
