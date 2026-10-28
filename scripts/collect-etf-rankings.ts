import {mkdir,readFile,writeFile,rename,open,unlink} from 'node:fs/promises';
import path from 'node:path';
import {appendFileSync} from 'node:fs';
import {readKisMaster} from '../lib/kis-directory';
import {kisTerminal,outputRows} from '../lib/kis-terminal';
import {parseEtfMaster,parseEtfObservation,buildEtfSnapshot,type EtfObservation} from '../lib/etf-ranking';
import {readEtfRanking,saveEtfRanking} from '../lib/etf-ranking-store';
import {kstParts} from '../lib/balta-model';
import {rankingCollectionSlot} from '../lib/investor-ranking-schedule';
import {parseAdditionalHolidays} from '../lib/market-calendar';
import {stockDate,stockWeekday,previousStockDate} from '../lib/stock-flow-model';
const dir=path.resolve('.runtime/etf-ranking'),lock=path.join(dir,'collector.lock');
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function load(code:string,date:string){return kisTerminal('/uapi/domestic-stock/v1/quotations/investor-trade-by-stock-daily','FHPTJ04160001',{FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:code,FID_INPUT_DATE_1:date.replaceAll('-',''),FID_ORG_ADJ_PRC:'',FID_ETC_CLS_CODE:'1'},0);}
async function collect(){
  const today=kstParts(),end=today.time<'16:30'?stockWeekday(previousStockDate(today.date)):today.date;
  let anchor;try{anchor=await load('069500',end);}catch{anchor=await load('069500',stockWeekday(previousStockDate(end)));}
  const dates=outputRows(anchor.output2).map(row=>stockDate(row.stck_bsop_date)).filter((d):d is string=>!!d&&(today.time>='16:30'?d<=today.date:d<today.date)).sort();
  const date=dates.at(-1);if(!date)throw Error('확인된 장후 기준일이 없습니다.');
  const universe=parseEtfMaster(await readKisMaster('kospi_code'));if(universe.length<100)throw Error('ETF 전체 목록 확인 실패');
  await readEtfRanking(date);
  const file=path.join(dir,date+'.json'),values=new Map<string,EtfObservation>();
  // Resume interrupted passes only; completed passes remove this checkpoint so
  // the 18:00 run re-reads provider corrections rather than keeping old values.
  try{const saved=JSON.parse(await readFile(file,'utf8'));if(saved.date===date)for(const row of saved.rows)if(Object.values(row.values).every(v=>v!==null))values.set(row.code,row);}catch{}
  const checkpoint=async()=>{await writeFile(file+'.tmp',JSON.stringify({date,rows:[...values.values()]}));await rename(file+'.tmp',file);};
  console.log(`[ETF] ${date} 대상 ${universe.length}개 · 복구 ${values.size}개`);
  let failures=0;
  for(const stock of universe){
    if(values.has(stock.code))continue;
    try{values.set(stock.code,parseEtfObservation(stock,(await load(stock.code,date)).output2,date));failures=0;}catch{failures++;}
    if(values.size%100===0){await checkpoint();console.log(`[ETF] 조회 ${values.size}/${universe.length}`);}
    if(failures>=10)break;
    await delay(250);
  }
  await checkpoint();
  const result=buildEtfSnapshot(universe,[...values.values()],date,new Date().toISOString());
  if(!result.groups.individual.covered)throw Error('해당일 ETF 금액이 없습니다.');
  await saveEtfRanking(result);
  const complete=Object.values(result.groups).every(g=>g.covered===g.expected);
  console.log('[ETF] 저장',JSON.stringify({date,groups:Object.fromEntries(Object.entries(result.groups).map(([k,g])=>[k,{covered:g.covered,expected:g.expected,buy:g.buy[0],sell:g.sell[0]}]))}));
  if(complete)await unlink(file);
  return complete;
}
async function main(){
  await mkdir(dir,{recursive:true});
  for(const level of ['log','error'] as const){const original=console[level].bind(console);console[level]=(...args:unknown[])=>{try{appendFileSync(path.join(dir,'collector.log'),new Date().toISOString()+' '+args.map(v=>typeof v==='string'?v:JSON.stringify(v)).join(' ')+'\n');}catch{}original(...args);};}
  try{const pid=Number(await readFile(lock,'utf8'));if(!Number.isInteger(pid)||pid<=0)throw Error('잠금 파일 확인 필요');try{process.kill(pid,0);throw Error('ETF 수집기가 이미 실행 중입니다.');}catch(e){if((e as NodeJS.ErrnoException).code!=='ESRCH')throw e;}await unlink(lock);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const h=await open(lock,'wx');await h.writeFile(String(process.pid));await h.close();
  try{
    const watch=process.argv.includes('--watch');let complete=false;
    try{complete=await collect();}catch(e){if(!watch)throw e;console.error('[ETF] 초기 수집 실패 · 30분 후 재시도');}
    if(!watch)return;
    console.log('[ETF] 장후 자동 수집 대기 · KST 16:30 / 18:00');
    let last=complete?(rankingCollectionSlot(new Date(),parseAdditionalHolidays(process.env.MARKET_HOLIDAYS))??''):'',retryAt=complete?0:Date.now()+30*60000;
    for(;;){const slot=rankingCollectionSlot(new Date(),parseAdditionalHolidays(process.env.MARKET_HOLIDAYS));if(((slot&&slot!==last)||(!complete&&Date.now()>=retryAt))&&Date.now()>=retryAt){try{if(await collect()){complete=true;last=slot??'';retryAt=0;}else{complete=false;retryAt=Date.now()+30*60000;}}catch{retryAt=Date.now()+30*60000;console.error('[ETF] 수집 실패 · 30분 후 재시도');}}await delay(30000);}
  }finally{await unlink(lock).catch(()=>{});}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
