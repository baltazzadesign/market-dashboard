// Isolated production HTTP check using synthetic Supabase responses only.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const month=date.slice(0,7);
const snapshot={id:1,createdat:date,time:'15:30',up:1600,down:800,flat:100,kospi:3000,kosdaq:1000,foreignflow:100,instflow:200,indivflow:-300,marketscore:40,marketstate:'FLOW_LIVE|BREADTH_LIVE',market_data:{version:1,kospi:{price:3000,changePct:1,turnover:10000,flowSource:'LIVE',priceSource:'LIVE',flows:{foreign:100,institution:200,individual:-300}},kosdaq:{price:1000,changePct:0,turnover:5000,flowSource:'LIVE',priceSource:'LIVE',flows:{foreign:0,institution:0,individual:0}}}};
console.log('Starting isolated HTTP smoke check');
const mock=createServer((req,res)=>{res.setHeader('content-type','application/json');if(req.url.startsWith('/rest/v1/market_daily'))res.end(JSON.stringify([{trade_date:date,snapshot}]));else if(req.url.startsWith('/rest/v1/logs'))res.end(JSON.stringify([snapshot]));else{res.statusCode=404;res.end('{}');}});
mock.listen(0,'127.0.0.1');await once(mock,'listening');console.log('Mock server ready');
const port=3221,base='http://localhost:'+port;
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{env:{...process.env,BALTATOOL_ACCESS_CODE:'smoke-only-access',CRON_SECRET:'smoke-only-cron',SUPABASE_URL:'http://127.0.0.1:'+mock.address().port,SUPABASE_SERVICE_ROLE_KEY:'smoke-only-key'},stdio:['ignore','pipe','pipe']});
const deadline=setTimeout(()=>{console.error('HTTP smoke timed out');child.kill('SIGTERM');mock.close();process.exit(1);},30000);
let logs='';child.stdout.on('data',c=>{logs+=c;process.stdout.write(c);});child.stderr.on('data',c=>{logs+=c;process.stderr.write(c);});child.on('error',e=>console.error(e.message));
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/login',{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}await delay(100);}assert.ok(ready,logs);
 assert.equal((await fetch(base+'/history',{redirect:'manual'})).status,307);
 assert.equal((await fetch(base+'/api/market/history')).status,401);
 assert.equal((await fetch(base+'/api/market/live')).status,401);
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({code:'smoke-only-access'})});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0],headers={cookie};
 for(const path of ['/','/daily?date='+date,'/history']){const res=await fetch(base+path,{headers});assert.equal(res.status,200,path);assert.ok((await res.text()).includes('baltatool'));}
 const history=await fetch(base+'/api/market/history?month='+month,{headers});assert.equal(history.status,200);const body=await history.json();assert.equal(body.days.length,1);assert.equal(body.days[0].kospi.changePct,1);
 const daily=await fetch(base+'/api/market/daily?date='+date,{headers});assert.equal(daily.status,200);assert.equal((await daily.json()).latest.time,'15:30');
 assert.equal((await fetch(base+'/api/market/history?month=2026-13',{headers})).status,400);
 assert.equal((await fetch(base+'/api/market/history?months=25',{headers})).status,400);
 assert.equal((await fetch(base+'/api/market/daily?date=2026-02-30',{headers})).status,400);
 assert.equal((await fetch(base+'/api/market/refresh',{method:'POST',headers:{cookie,origin:'https://invalid.example'}})).status,403);
 console.log('PASS: production pages, login, authentication, history API, daily API, input validation, origin check (synthetic fixtures)');
}catch(e){console.error(logs);throw e;}finally{clearTimeout(deadline);if(child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}mock.close();}
