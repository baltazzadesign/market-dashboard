import test from 'node:test';
import assert from 'node:assert/strict';
import {GET as performance} from '../app/api/market/research/route';
import {GET as notes} from '../app/api/market/notes/search/route';
import {GET as sectors} from '../app/api/market/sectors/route';
const auth={cookie:'access=research-test'};
test('research endpoints enforce auth, validate input, paginate and exclude holidays',async()=>{
 const original=globalThis.fetch,env={...process.env};let calls=0;
 process.env.BALTATOOL_ACCESS_CODE='research-test';process.env.SUPABASE_URL='https://example.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test';
 try{
 globalThis.fetch=async()=>{throw Error('No network expected');};
 for(const handler of [performance,notes,sectors])assert.equal((await handler(new Request('https://example.test/api'))).status,401);
 assert.equal((await performance(new Request('https://example.test/api?start=2026-09-01&end=2026-09-09',{headers:auth}))).status,400);
 const base={createdat:'2026-09-08',time:'09:00',up:100,down:50,kospi:100,signals:[{type:'CROSS_UP'}]};
 globalThis.fetch=async(input)=>{const url=new URL(String(input));calls++;assert.equal(url.searchParams.get('and'),'(createdat.gte.2026-09-05,createdat.lte.2026-09-09)');
 return Response.json(url.searchParams.get('offset')==='0'?Array.from({length:500},(_,i)=>({...base,id:i})): [{...base,id:501,time:'09:30',kospi:110,signals:[]},{...base,id:502,createdat:'2026-09-06'}]);};
 const result=await performance(new Request('https://example.test/api?start=2026-09-05&end=2026-09-09',{headers:auth}));const j=await result.json();assert.equal(result.status,200);assert.equal(calls,2);assert.deepEqual(j.dates,['2026-09-08']);assert.equal(j.stats[0].count,1);assert.equal(j.stats[0].wins,1);
 globalThis.fetch=async(input,init)=>{assert.ok(String(input).endsWith('/rpc/search_market_notes'));const body=JSON.parse(String(init?.body));assert.equal(body.search_text,'a%,x');assert.equal(body.page_offset,20);return Response.json(Array.from({length:21},(_,i)=>({trade_date:String(i)})));};
 const n=await notes(new Request('https://example.test/api?q=a%25%2Cx&page=1',{headers:auth}));const nj=await n.json();assert.equal(nj.rows.length,20);assert.equal(nj.hasMore,true);
 globalThis.fetch=async()=>Response.json({error:'bad'},{status:503});assert.equal((await sectors(new Request('https://example.test/api?date=2026-09-08',{headers:auth}))).status,502);
 }finally{globalThis.fetch=original;for(const key of ['BALTATOOL_ACCESS_CODE','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key];}}
});
