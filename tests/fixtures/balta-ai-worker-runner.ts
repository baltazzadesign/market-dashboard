// Closed in-memory transport. Every unexpected host/path/method fails; no live I/O.
import assert from 'node:assert/strict';
const scenario=process.argv[2];
process.env.SUPABASE_URL='https://paper-test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-secret';
process.env.KIS_APPKEY='fixture-key';process.env.KIS_APPSECRET='fixture-secret';
process.env.KIS_BASE='https://kis-test.invalid';
delete process.env.GITHUB_EVENT_NAME;delete process.env.KIS_TOKEN_READ_ONLY;
// Deliberately heterogeneous mock PostgREST tables, confined to this transport.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row=Record<string,any>;
const tables:Record<string,Row[]>={};
const signalDate=['canonical','revised'].includes(scenario)?'2026-10-27':'2026-10-28';
tables.balta_ai_signals=['FLOW_V1','FLOW_ACCEL_V1'].map(strategy=>({
  trade_date:signalDate,strategy,source_date:'2026-10-26',source_observed_at:'2026-10-26T10:00:00Z',
  generated_at:signalDate+'T08:02:00+09:00',picks:[{code:'005930',name:'fixture',market:'kospi',score:10}],
}));
if(['canonical','revised'].includes(scenario))tables.balta_ai_portfolio_bars=[{trade_date:'2026-10-27',stock_code:'005930',open:100,high:100,low:100,close:100}];
const frozenSignals=JSON.stringify(tables.balta_ai_signals),posts:string[]=[];
const response=(v:unknown)=>new Response(JSON.stringify(v),{status:200});
globalThis.fetch=async(input,options={})=>{
  const url=new URL(String(input)),method=options.method??'GET';
  if(url.hostname==='paper-test.invalid'){
    const table=url.pathname.split('/').at(-1)!;
    if(table==='kis_tokens')return response([{access_token:'fixture-token',expires_at:scenario==='expired'?'2000-01-01T00:00:00Z':'2099-01-01T00:00:00Z'}]);
    assert.ok(table.startsWith('balta_ai_'),'unexpected DB table '+table);
    const rows=tables[table]??=[];
    if(method==='POST'){
      posts.push(table);assert.notEqual(table,'balta_ai_signals','never regenerate candidates');
      const keys=(url.searchParams.get('on_conflict')??'').split(',');
      const payload=JSON.parse(options.body as string);
      if(scenario==='lost-write'&&table==='balta_ai_portfolio_bars')return response(null);
      for(const row of Array.isArray(payload)?payload:[payload]){
        const old=rows.find(r=>keys.every(k=>r[k]===row[k]));
        if(!old)rows.push(structuredClone(row));
        else if(table==='balta_ai_run_log')Object.assign(old,row);
        else assert.match(String((options.headers as Row).Prefer),/ignore-duplicates/);
      }
      tables[table]=rows;return response(null);
    }
    assert.equal(method,'GET');
    const filtered=rows.filter(r=>{
      for(const [key,value] of url.searchParams){
        if(value.startsWith('eq.')&&String(r[key])!==value.slice(3))return false;
        if(value.startsWith('gte.')&&String(r[key])<value.slice(4))return false;
        if(value.startsWith('lte.')&&String(r[key])>value.slice(4))return false;
      }
      const or=url.searchParams.get('or');
      if(or){
        const groups=[...or.matchAll(/and\(([^)]+)\)/g)];
        if(!groups.some(g=>g[1].split(',').every(term=>{const [key,...v]=term.split('.eq.');return String(r[key])===v.join('.eq.');})))return false;
      }
      return true;
    });
    const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??10000);
    return response(filtered.slice(offset,offset+limit));
  }
  assert.equal(url.hostname,'kis-test.invalid');assert.equal(method,'GET','no token refresh or orders');
  if(url.pathname.endsWith('/inquire-index-daily-price'))return response({rt_cd:'0',output2:['20261026','20261027','20261028'].map(date=>({
    stck_bsop_date:date,bstp_nmix_oprc:'100',bstp_nmix_prpr:'101',bstp_nmix_hgpr:'101',bstp_nmix_lwpr:'100',acml_vol:'10',
  }))});
  assert.ok(url.pathname.endsWith('/inquire-daily-itemchartprice'),'unexpected market endpoint');
  return response({rt_cd:'0',output2:scenario==='missing-price'?[]:['20261027','20261028'].map(date=>({
    stck_bsop_date:date,...Object.fromEntries(['stck_oprc','stck_clpr','stck_hgpr','stck_lwpr'].map(k=>[k,scenario==='canonical'&&date==='20261027'?'100':'120'])),acml_vol:'10',
  }))});
};
async function run(){
  if(scenario==='expired'){
    process.env.KIS_TOKEN_READ_ONLY='true';
    const {kisTerminal}=await import('../../lib/kis-terminal');
    await assert.rejects(kisTerminal('/uapi/domestic-stock/v1/quotations/inquire-index-daily-price','fixture',{}),/read-only token expired/);
    assert.equal(posts.length,0);return;
  }
  const {main}=await import('../../scripts/balta-ai-research');
  const args=['--phase=close','--date=2026-10-28',...(scenario==='dry-run'?['--dry-run']:[])];
  const now=new Date(scenario==='early'?'2026-10-28T07:29:00Z':'2026-10-28T15:06:07Z');
  await main(args,now);
  const outcomes=tables.balta_ai_outcomes??[];
  if(['early','lost-write','missing-price','revised'].includes(scenario)){
    assert.equal(process.exitCode,1);
    assert.equal(outcomes.length,0);
    assert.equal(tables.balta_ai_run_log[0].result,'incomplete');
    if(scenario==='early')assert.equal(tables.balta_ai_run_log[0].details.reason,'CLOSE_BEFORE_TARGET_1630_KST');
    if(scenario==='lost-write')assert.equal(tables.balta_ai_run_log[0].details.reason,'IMMUTABLE_STORAGE_VERIFICATION_FAILED');
    if(scenario==='revised'){
      assert.equal(tables.balta_ai_run_log[0].details.priceRevisionConflicts,2);
      assert.equal(tables.balta_ai_portfolio_bars.length,1);
      assert.equal(tables.balta_ai_portfolio_bars[0].open,100);
    }
    process.exitCode=0;
  }else if(scenario==='dry-run'){
    assert.equal(posts.length,0);assert.equal(outcomes.length,0);
  }else{
    assert.equal(tables.balta_ai_run_log[0].trade_date,'2026-10-28');
    assert.equal(tables.balta_ai_run_log[0].result,'complete');
    assert.equal(tables.balta_ai_run_log[0].details.priceStatus,'vendor_daily_unofficial');
    assert.ok(outcomes.length>0);
    if(scenario==='canonical'){
      assert.ok(outcomes.every(r=>r.entry_open===100));
      assert.equal(outcomes.find(r=>r.horizon===1)!.return_pct,20);
      assert.equal(tables.balta_ai_portfolio_bars.find(r=>r.trade_date==='2026-10-27')!.open,100);
    }
    const before=JSON.stringify(outcomes),priceBefore=JSON.stringify(tables.balta_ai_portfolio_bars);
    await main(args,new Date('2026-10-29T02:00:00Z'));
    assert.equal(JSON.stringify(tables.balta_ai_outcomes),before);
    assert.equal(JSON.stringify(tables.balta_ai_portfolio_bars),priceBefore);
    assert.equal(process.exitCode??0,0);
  }
  assert.equal(JSON.stringify(tables.balta_ai_signals),frozenSignals);
}
run().catch(error=>{console.error(error);process.exitCode=1;});
