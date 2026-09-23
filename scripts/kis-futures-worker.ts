// Dedicated read-only market-data process, following the existing after-market worker pattern.
// Run ONE instance: npm run futures:worker (Node 20.19+). Never invoked by existing cron.
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FUTURES_KIS, resolveFront, minuteBars, dayQuote } from '../lib/kis-futures';
import { kisTerminal, outputRows } from '../lib/kis-terminal';
import { normalizedDate, type FutureContract, type FutureBar, type FutureQuote } from '../lib/futures-model';
import { configuredCalendar, kstParts, kstInstant, FUTURES_SESSION, sessionAt, latestSession, type FutureCalendar } from '../lib/futures-session';
import { acquireFuturesLease, persistFutures, futuresDb, upsertFutures, storedCalendar } from '../lib/futures-store';
import { MinuteAggregator, parseFuturesFrame } from '../lib/futures-stream';
const owner=randomUUID(),aggregate=new MinuteAggregator();
const base=(process.env.KIS_BASE||'https://openapi.koreainvestment.com:9443').replace(/\/$/,'');
const wsUrl=process.env.KIS_FUTURES_WS_URL||'ws://ops.koreainvestment.com:21000/tryitout';
const spool=path.resolve(process.env.FUTURES_SPOOL_DIR||'.runtime/futures');
const wsEnabled=Boolean(process.env.KIS_FUTURES_WS_APPKEY&&process.env.KIS_FUTURES_WS_APPSECRET);
const flushMs=Math.max(5000,Number(process.env.FUTURES_FLUSH_MS)||10000);
let ws:WebSocket|null=null,connected=false,stopping=false,retryAt=0,attempt=0,lastFrame=0,lastTrade:string|null=null;
let contracts:FutureContract[]=[],subscriptionKey='',calendar:FutureCalendar={},lastCalendarDate='',lastResolve=0,lastRest=0;
let approval:{key:string;until:number}|null=null,lastError:string|null=null;
let pendingBars=new Map<string,FutureBar>(),pendingQuotes=new Map<string,FutureQuote>();
const frontSince=new Map<string,string>();
const barKey=(b:FutureBar)=>[b.product,b.contract_code,b.session,b.timestamp].join('|');
const quoteKey=(q:FutureQuote)=>[q.product,q.contract_code,q.session].join('|');
function report(context:string,error:unknown){lastError=context;console.error('[futures:'+context+']',error instanceof Error?error.message:'failed');}
async function approvalKey(){
  if(approval&&approval.until>Date.now())return approval.key;
  const res=await fetch(base+'/oauth2/Approval',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({grant_type:'client_credentials',appkey:process.env.KIS_FUTURES_WS_APPKEY,secretkey:process.env.KIS_FUTURES_WS_APPSECRET}),signal:AbortSignal.timeout(10000)});
  const body=await res.json();if(!res.ok||typeof body.approval_key!=='string')throw Error('KIS WebSocket 접속키 발급 실패 ('+res.status+')');
  approval={key:body.approval_key,until:Date.now()+20*3600000};return approval.key;
}
function disconnect(){connected=false;aggregate.disconnect();const old=ws;ws=null;if(old)old.terminate();}
async function connect(session:'DAY'|'NIGHT'){
  const key=await approvalKey(),client=new WebSocket(wsUrl,{handshakeTimeout:10000});ws=client;lastFrame=Date.now();
  client.on('open',()=>{
    if(ws!==client)return client.terminate();connected=true;lastFrame=Date.now();
    for(const c of contracts)client.send(JSON.stringify({header:{approval_key:key,custtype:'P',tr_type:'1','content-type':'utf-8'},body:{input:{tr_id:session==='DAY'?FUTURES_KIS.dayTrade:FUTURES_KIS.nightTrade,tr_key:c.contract_code}}}));
    console.log('[futures] subscribed',session,contracts.map(c=>c.contract_code).join(','));
  });
  client.on('message',data=>{
    if(ws!==client)return;lastFrame=Date.now();const raw=data.toString();
    try {
      if(raw.startsWith('{')){
        const message=JSON.parse(raw);
        // Official sample responds with a WebSocket PONG control frame, not a text echo.
        if(message.header?.tr_id==='PINGPONG'){client.pong(raw);return;}
        if(message.body?.rt_cd!=null&&String(message.body.rt_cd)!=='0'){
          approval=null;throw Error('KIS 구독 오류 '+String(message.body?.msg_cd??''));
        }
        return;
      }
      const quotes=parseFuturesFrame(raw,contracts,new Date(),calendar);
      if(!quotes.length&&/^0\|(H0IFCNT0|H0MFCNT0)\|/.test(raw)){lastError='실시간 필드·종목·시간 검증 실패';return;}
      for(const q of quotes){const bar=aggregate.accept(q);if(!bar)continue;pendingBars.set(barKey(bar),bar);pendingQuotes.set(quoteKey(q),q);lastTrade=q.observed_at;lastError=null;attempt=0;}
    }catch(e){report('WebSocket 응답',e);disconnect();retryAt=Date.now()+Math.min(60000,1000*2**Math.min(++attempt,6))+Math.random()*1000;}
  });
  client.on('error',()=>{if(ws===client){lastError='WebSocket 연결 오류';client.terminate();}});
  client.on('close',()=>{if(ws!==client)return;ws=null;connected=false;aggregate.disconnect();retryAt=Date.now()+Math.min(60000,1000*2**Math.min(++attempt,6))+Math.random()*1000;});
}
async function diskCheckpoint(){
  await mkdir(spool,{recursive:true});const temporary=path.join(spool,'pending.tmp');
  await writeFile(temporary,JSON.stringify({bars:[...pendingBars.values()],quotes:[...pendingQuotes.values()]}));await rename(temporary,path.join(spool,'pending.json'));
}
async function flush(){
  // Snapshot + reference check avoids losing ticks arriving during the database request.
  const bars=[...pendingBars.entries()],quotes=[...pendingQuotes.entries()];
  if(bars.length||quotes.length){
    await diskCheckpoint();
    for(let i=0;i<bars.length||i===0;i+=300){
      const batch=bars.slice(i,i+300);await persistFutures(owner,batch.map(([,v])=>v),i===0?quotes.map(([,v])=>v):[]);
      for(const [k,v] of batch)if(pendingBars.get(k)===v)pendingBars.delete(k);
      if(i===0)for(const [k,v] of quotes)if(pendingQuotes.get(k)===v)pendingQuotes.delete(k);
    }
    await diskCheckpoint();
  }
}
async function calendarRefresh(){
  const today=kstParts(new Date()).date;if(lastCalendarDate===today)return;lastCalendarDate=today;
  calendar=configuredCalendar(await storedCalendar().catch(()=>({})));
  try{
    // Official guide asks for approximately one call/day. Only the worker calls this API.
    const b=await kisTerminal('/uapi/domestic-stock/v1/quotations/chk-holiday','CTCA0903R',{BASS_DT:today.replaceAll('-',''),CTX_AREA_FK:'',CTX_AREA_NK:''},86400000);
    const rows=outputRows(b.output).flatMap(r=>{const date=normalizedDate(r.bass_dt);return date&&['Y','N'].includes(String(r.opnd_yn))?[{date,open:r.opnd_yn==='Y',updated_at:new Date().toISOString()}]:[];});
    if(rows.length){await upsertFutures('futures_calendar',rows,'date');calendar=configuredCalendar({...calendar,...Object.fromEntries(rows.map(r=>[r.date,{open:r.open}]))});}
  }catch(e){report('영업일 갱신',e);}
}
async function cycle(){
  if(!await acquireFuturesLease(owner)){disconnect();throw Error('다른 선물 수집기가 실행 중입니다.');}
  await calendarRefresh();
  const now=new Date(),active=sessionAt(now,calendar);
  // Allow closing-auction messages to arrive for one minute after the configured end.
  const previous=sessionAt(new Date(now.getTime()-60000),calendar);
  const state=active.session==='CLOSED'&&previous.session!=='CLOSED'?previous:active;
  const expiryAuctionGrace=contracts.some(c=>{const close=Date.parse(kstInstant(c.expiry,FUTURES_SESSION.expiryClose));return now.getTime()>=close&&now.getTime()<close+60000;});
  if((now.getTime()-lastResolve>300000||!contracts.length)&&active.session!=='CLOSED'&&!expiryAuctionGrace){
    const next:FutureContract[]=[];
    for(const product of ['kospi200','kosdaq150'] as const){
      try {const c=await resolveFront(product,now,true);next.push(c);if(!frontSince.has(c.contract_code))frontSince.set(c.contract_code,now.toISOString());}
      catch(e){report(product+' 최근월물',e);}
    }
    if(next.length){contracts=next;await upsertFutures('futures_contracts',contracts,'product,contract_code');}
    lastResolve=now.getTime();
  }
  const key=state.session+'|'+contracts.map(c=>c.contract_code).join('|');
  if(key!==subscriptionKey){disconnect();subscriptionKey=key;retryAt=0;}
  if(connected&&Date.now()-lastFrame>90000){lastError='실시간 수신 시간 초과';disconnect();retryAt=Date.now()+3000;}
  if(approval&&approval.until<Date.now()){approval=null;disconnect();}
  if(wsEnabled&&state.session!=='CLOSED'&&contracts.length&&!ws&&Date.now()>=retryAt){try{await connect(state.session);}catch(e){report('접속',e);retryAt=Date.now()+60000;}}
  if(active.session==='DAY'&&now.getTime()-lastRest>60000){
    const startup=lastRest===0;lastRest=now.getTime();
    for(const contract of contracts){
      try{
        // Complete DAY bars repair startup/reconnection gaps. Do not fill NIGHT using DAY data.
        const day=latestSession(now,'DAY',calendar),bars=await minuteBars(contract,day.openingDate,calendar,startup?5:1);
        for(const bar of bars){if(Date.parse(bar.timestamp)>=Math.floor(now.getTime()/60000)*60000)continue;bar.is_front=bar.timestamp>=(frontSince.get(contract.contract_code)??now.toISOString());pendingBars.set(barKey(bar),bar);}
        if(!connected||!lastTrade||Date.parse(lastTrade)<now.getTime()-30000){const q=await dayQuote(contract,calendar);if(q)pendingQuotes.set(quoteKey(q),q);}
      }catch(e){report('주간 REST 복구',e);}
    }
  }
  if(!await acquireFuturesLease(owner)){disconnect();throw Error('선물 수집기 소유권을 잃었습니다.');}
  await flush();
  await futuresDb('futures_collector?id=eq.main&owner=eq.'+owner,{method:'PATCH',body:JSON.stringify({connected,last_message_at:lastTrade,last_error:lastError,updated_at:new Date().toISOString()})});
}
async function main(){
  for(const key of ['KIS_APPKEY','KIS_APPSECRET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'])if(!process.env[key])throw Error(key+' 설정이 필요합니다.');
  if(Boolean(process.env.KIS_FUTURES_WS_APPKEY)!==Boolean(process.env.KIS_FUTURES_WS_APPSECRET))throw Error('선물 WS 앱키와 시크릿을 함께 설정하세요.');
  if(!wsEnabled){lastError='선물 전용 WS 키 설정 필요';console.warn('[futures] WS disabled: set KIS_FUTURES_WS_APPKEY / KIS_FUTURES_WS_APPSECRET. Existing WS connections are not touched.');}
  if(!await acquireFuturesLease(owner))throw Error('다른 선물 수집기가 실행 중입니다.');
  try{const saved=JSON.parse(await readFile(path.join(spool,'pending.json'),'utf8'));pendingBars=new Map((saved.bars??[]).map((b:FutureBar)=>[barKey(b),b]));pendingQuotes=new Map((saved.quotes??[]).map((q:FutureQuote)=>[quoteKey(q),q]));}
  catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  process.on('SIGINT',()=>{stopping=true;disconnect();});process.on('SIGTERM',()=>{stopping=true;disconnect();});
  console.log('[futures] read-only collector started; flush interval',flushMs);
  while(!stopping){const start=Date.now();try{await cycle();}catch(e){report('수집 주기',e);try{await diskCheckpoint();}catch(d){report('복구 파일 저장',d);}}
    if(pendingBars.size>20000){disconnect();throw Error('미저장 분봉이 20,000개를 넘었습니다. 저장소 복구 후 재시작하세요.');}
    await new Promise(r=>setTimeout(r,Math.max(1000,flushMs-(Date.now()-start))));
  }
  try{await flush();}catch(e){report('종료 저장',e);await diskCheckpoint();}
  await futuresDb('futures_collector?id=eq.main&owner=eq.'+owner,{method:'PATCH',body:JSON.stringify({connected:false,lease_until:new Date().toISOString(),updated_at:new Date().toISOString()})});
}
main().catch(e=>{report('시작/종료',e);disconnect();process.exitCode=1;});
