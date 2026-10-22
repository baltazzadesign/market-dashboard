import test from 'node:test';
import assert from 'node:assert/strict';
import {kisTerminal} from '../lib/kis-terminal';
import {stockWeekday} from '../lib/stock-flow-model';
import {loadStockFlow} from '../lib/stock-flow-data';
test('Saturday and Sunday resolve to Friday, Monday stays Monday',()=>{
 assert.equal(stockWeekday('2026-10-24'),'2026-10-23');assert.equal(stockWeekday('2026-10-25'),'2026-10-23');assert.equal(stockWeekday('2026-10-26'),'2026-10-26');
});
test('weekend stock queries use Friday including Sunday morning',async()=>{
 const calls:Record<string,string>[]=[];
 const query=async(path:string,_tr:string,p:Record<string,string>)=>{calls.push(p);return {output1:{},output2:[{stck_bsop_date:'20260901',stck_oprc:'10',stck_hgpr:'10',stck_lwpr:'10',stck_clpr:'10',frgn_ntby_qty:'1'}]};};
 const r=await loadStockFlow('005930','1M','2026-10-25',query,new Date('2026-10-25T01:00:00Z'));
 assert.equal(calls[0].FID_INPUT_DATE_2,'20261023');assert.equal(calls[1].FID_INPUT_DATE_1,'20261023');assert.equal(r.end,'2026-10-23');assert(r.warnings.some(w=>w.includes('주말')));
});
test('expired collector token refreshes once for concurrent requests and persists',async()=>{
 const original=globalThis.fetch;let issued=0,saved=0,queried=0;
 Object.assign(process.env,{SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'test',KIS_APPKEY:'test',KIS_APPSECRET:'test'});
 globalThis.fetch=async(input,init)=>{
  const u=String(input);
  if(u.includes('kis_tokens')&&init?.method==='POST'){saved++;return new Response(null,{status:204});}
  if(u.includes('kis_tokens'))return Response.json([{access_token:'expired',expires_at:'2020-01-01T00:00:00Z'}]);
  if(u.endsWith('tokenP')){issued++;return Response.json({access_token:'fresh',expires_in:86400});}
  queried++;assert.equal((init?.headers as Record<string,string>).authorization,'Bearer fresh');return Response.json({rt_cd:'0'});
 };
 try{await Promise.all([kisTerminal('/test/a','test',{}),kisTerminal('/test/b','test',{})]);assert.equal(issued,1);assert.equal(saved,1);assert.equal(queried,2);}finally{globalThis.fetch=original;}
});
