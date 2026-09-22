// Read-only API contracts. Fixtures are isolated from the application and use no real credentials.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function loader(overrides = {}) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (Object.hasOwn(overrides, relative)) return overrides[relative];
    if (cache.has(filename)) return cache.get(filename);
    const module = { exports: {} }; cache.set(filename, module.exports);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const localRequire = name => {
      if (!name.startsWith('@/') && !name.startsWith('.')) return require(name);
      let rel = name.startsWith('@/') ? name.slice(2) : path.relative(root, path.resolve(path.dirname(filename), name));
      if (!rel.endsWith('.ts')) rel += '.ts';
      return load(rel);
    };
    new Function('require', 'module', 'exports', source)(localRequire, module, module.exports);
    cache.set(filename, module.exports); return module.exports;
  }
  return load;
}
const access = { hasDashboardAccess: () => true };
const outputRows = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []);
const model = loader()('lib/terminal-model.ts');
test('missing numbers never become zero; KIS decrease flags remain negative', () => {
  for (const value of ['', ' ', null, undefined, true, 'bad']) assert.equal(model.finite(value), null);
  assert.equal(model.finite('0'), 0); assert.equal(model.finite('1,230.5'), 1230.5);
  assert.equal(model.signedChange('3.1', '5'), -3.1); assert.equal(model.signedChange('0', '3'), 0);
});
test('observed candles retain actual extrema and do not fabricate volume', () => {
  const candles = model.sampleCandles([{ time: '09:00', minute: 540, value: 100 }, { time: '09:01', minute: 541, value: 98 }, { time: '09:02', minute: 542, value: 103 }, { time: '09:04', minute: 544, value: 101 }, { time: '09:05', minute: 545, value: null }]);
  assert.deepEqual(candles, [{ time: '09:00', open: 100, high: 103, low: 98, close: 101, volume: null }]);
});
test('new endpoints reject unauthenticated requests before contacting KIS', async () => {
  let calls = 0;
  const load = loader({ 'lib/balta-access.ts': { hasDashboardAccess: () => false }, 'lib/kis-terminal.ts': { kisTerminal: () => { calls++; throw Error('should not call'); }, outputRows }, 'lib/kis-directory.ts': { stockDirectory: async () => { calls++; return []; }, commodityCode: async () => null } });
  for (const name of ['terminal', 'ranking', 'index-candles', 'stocks']) assert.equal((await load('app/api/market/' + name + '/route.ts').GET(new Request('https://test.invalid/api/market/' + name))).status, 401);
  assert.equal(calls, 0);
});
test('macro sources use their documented response containers; partial errors stay explicit', async () => {
  const calls = [];
  const load = loader({ 'lib/balta-access.ts': access, 'lib/kis-directory.ts': { commodityCode: async product => ({ code: product + 'TEST' }) }, 'lib/kis-terminal.ts': { outputRows, kisTerminal: async (url, tr, params) => {
    calls.push({ url, tr, params });
    if (url.endsWith('inquire-index-price')) { if (params.FID_INPUT_ISCD === '1001') throw Error('simulated source failure'); return { output: { bstp_nmix_prpr: '3100', bstp_nmix_prdy_vrss: '10', bstp_nmix_prdy_ctrt: '.32', prdy_vrss_sign: '5' } }; }
    if (url.endsWith('display-board-futures')) return { output: [{ futs_shrn_iscd: 'NEAR', hts_kor_isnm: '테스트 선물', hts_rmnn_dynu: '8', futs_prpr: '421.8' }, { futs_shrn_iscd: 'EXPIRED', hts_rmnn_dynu: '-1', futs_prpr: '422' }] };
    if (url.endsWith('comp-interest')) return { output1: [{ hts_kor_isnm: '국고채 3년', bond_mnrt_prpr: '2.987', bond_mnrt_prdy_vrss: '.018', prdy_vrss_sign: '5' }] };
    if (url.endsWith('inquire-daily-chartprice')) return { output1: { ovrs_nmix_prpr: '1337.2', ovrs_nmix_prdy_vrss: '2.4', prdy_ctrt: '.18', prdy_vrss_sign: '2' } };
    if (url.endsWith('inquire-price')) return { output1: { last_price: params.SRS_CD.startsWith('CL') ? '68.42' : '3628.10', prev_price: params.SRS_CD.startsWith('CL') ? '69.26' : '3615.70', proc_date: '20260916', proc_time: '150000' } };
    throw Error('Unexpected endpoint');
  } } });
  const body = await (await load('app/api/market/terminal/route.ts').GET(new Request('https://test.invalid/api/market/terminal'))).json();
  assert.equal(body.quotes.find(q => q.code === '0001').change, -10);
  assert(!body.quotes.some(q => q.code === '1001')); assert(body.warnings.includes('KOSDAQ 조회 대기'));
  assert(body.quotes.some(q => q.code === 'NEAR')); assert(!body.quotes.some(q => q.code === 'EXPIRED'));
  assert.equal(body.indicators.find(q => q.code === 'fx').price, 1337.2);
  assert.equal(body.indicators.find(q => q.code === 'wti').price, 68.42); assert(body.indicators.find(q => q.code === 'wti').change < 0);
  assert(body.indicators.find(q => q.code === 'gold').change > 0);
  assert(calls.every(c => !/order|tokenP/.test(c.url)));
});
test('ranking invalid filters send no request; volume and turnover use distinct KIS classifications', async () => {
  const calls = [];
  const load = loader({ 'lib/balta-access.ts': access, 'lib/kis-terminal.ts': { outputRows, kisTerminal: async (...args) => { calls.push(args); return { output: [{ mksc_shrn_iscd: '005930', hts_kor_isnm: '삼성전자', stck_prpr: '', prdy_ctrt: '1.2', prdy_vrss_sign: '5' }] }; } } });
  const { GET } = load('app/api/market/ranking/route.ts');
  assert.equal((await GET(new Request('https://test.invalid?sort=invalid'))).status, 400); assert.equal(calls.length, 0);
  await GET(new Request('https://test.invalid?sort=volume&market=kospi'));
  const body = await (await GET(new Request('https://test.invalid?sort=turnover&market=kosdaq'))).json();
  assert.equal(calls[0][2].FID_BLNG_CLS_CODE, '0'); assert.equal(calls[1][2].FID_BLNG_CLS_CODE, '3'); assert.equal(calls[1][2].FID_INPUT_ISCD, '1001');
  assert.equal(body.rows[0].price, null); assert.equal(body.rows[0].rate, -1.2);
});
test('daily candles exclude incomplete OHLC rather than substituting a close', async () => {
  const load = loader({ 'lib/balta-access.ts': access, 'lib/kis-terminal.ts': { outputRows, kisTerminal: async () => ({ output2: [{ stck_bsop_date: '20260914', bstp_nmix_oprc: '', bstp_nmix_hgpr: '104', bstp_nmix_lwpr: '98', bstp_nmix_prpr: '103' }, { stck_bsop_date: '20260915', bstp_nmix_oprc: '102', bstp_nmix_hgpr: '104', bstp_nmix_lwpr: '99', bstp_nmix_prpr: '103' }] }) } });
  const { GET } = load('app/api/market/index-candles/route.ts');
  const body = await (await GET(new Request('https://test.invalid?date=2026-09-15&range=1W'))).json();
  assert.equal(body.candles.length, 1); assert.equal(body.candles[0].time, '2026-09-15'); assert.equal(body.candles[0].volume, null);
  assert.equal((await GET(new Request('https://test.invalid?date=invalid'))).status, 400);
});
test('full directory search includes stocks absent from ranking and applies market filters', async () => {
  const load = loader({ 'lib/balta-access.ts': access, 'lib/kis-directory.ts': { stockDirectory: async () => [{ code: '005930', name: '삼성전자', market: 'kospi' }, { code: '005935', name: '삼성전자우', market: 'kospi' }, { code: '123456', name: '테스트', market: 'kosdaq' }] } });
  const { GET } = load('app/api/market/stocks/route.ts');
  const body = await (await GET(new Request('https://test.invalid?q=' + encodeURIComponent('삼성전자')))).json();
  assert.equal(body.rows[0].code, '005930'); assert.equal(body.rows.length, 2);
  assert.equal((await (await GET(new Request('https://test.invalid?q=삼성&market=kosdaq'))).json()).rows.length, 0);
});
test('mobile Pulse passes the same normalized sector times and markets to the web model', async () => {
  let seen;
  const snapshot = { time: 'KOSPI 14:59 / KOSDAQ 15:00', market_data: { sectors: [{ code: '1', market: 'kospi' }, { code: '2', market: 'kosdaq' }] } };
  const load = loader({ 'lib/balta-access.ts': access, 'lib/balta-data.ts': { requestedDate: () => '2026-09-15', readMarketDay: async () => [], marketError: () => Response.json({ ok: false }, { status: 500 }) }, 'app/api/market/sectors/route.ts': { GET: async () => Response.json({ ok: true, snapshot }) }, 'lib/market-pulse.ts': { calculateMarketPulse: (_rows, value) => { seen = value; return { score: null }; } } });
  assert.equal((await load('app/api/market/pulse/route.ts').GET(new Request('https://test.invalid'))).status, 200);
  assert.deepEqual(seen, { date: '2026-09-15', time: snapshot.time, sectors: snapshot.market_data.sectors });
});

test('bond request uses I; spaced bond names and commodity fallback stay numeric', async () => {
 const load=loader({'lib/balta-access.ts':access,'lib/kis-directory.ts':{commodityCode:async product=>({code:product+'TEST',exchange:'NYM'})},'lib/kis-terminal.ts':{outputRows,kisTerminal:async(url,tr,p)=>{
  if(url.endsWith('comp-interest')){assert.equal(p.FID_COND_MRKT_DIV_CODE,'I');return {output1:[{hts_kor_isnm:'국고채 (3 년)',bond_mnrt_prpr:'2.987',bond_mnrt_prdy_vrss:'.018',prdy_vrss_sign:'5'}],output2:[{hts_kor_isnm:'국고채권 10년',bond_mnrt_prpr:'3.162'}]};}
  if(url.endsWith('/inquire-price'))throw Error('source unavailable');
  if(url.endsWith('/daily-ccnl')){assert.equal(tr,'HHDFC55020100');assert.equal(p.SRS_CD,'CLTEST');assert.equal(p.EXCH_CD,'NYM');return {output2:[{data_date:p.CLOSE_DATE_TIME,last_price:'68.42'},{data_date:loader()('lib/balta-model.ts').moveDate(p.CLOSE_DATE_TIME.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'), -1).replaceAll('-',''),last_price:'69.26'}]};}
  if(url.endsWith('inquire-daily-chartprice')){assert.notEqual(p.FID_INPUT_ISCD,'WTIF');return {output1:{ovrs_nmix_prpr:p.FID_INPUT_ISCD==='NYGOLD'?'3628.1':'1337.2',ovrs_nmix_prdy_vrss:'1.2',prdy_ctrt:'.5',prdy_vrss_sign:'5'},output2:[{stck_bsop_date:'20260921'}]};}
  return {output:[]};
 }}});
 const b=await(await load('app/api/market/terminal/route.ts').GET(new Request('https://test.invalid'))).json();
 assert.equal(b.indicators.length,5);assert.equal(new Set(b.indicators.map(q=>q.code)).size,5);
 assert.equal(b.indicators.find(q=>q.code==='kr3').change,-.018);assert.equal(b.indicators.find(q=>q.code==='kr10').price,3.162);
 assert.equal(b.indicators.find(q=>q.code==='wti').price,68.42);assert(b.indicators.find(q=>q.code==='wti').change<0);assert.equal(b.indicators.find(q=>q.code==='gold').price,3628.1);
});
test('RSS decoding preserves headlines and rejects duplicate or unrelated URLs',()=>{
 const {parseNewsRss}=loader({'lib/kis-terminal.ts':{outputRows}})('lib/terminal-news.ts');
 const item=url=>`<item><title><![CDATA[시장 &#xAC15;세 &amp; 금리]]></title><link>${url}</link><pubDate>Mon, 21 Sep 2026 06:00:00 GMT</pubDate></item>`;
 const r=parseNewsRss('<rss>'+item('https://www.mk.co.kr/news/stock/123')+item('https://www.mk.co.kr/news/stock/123')+item('https://mk.co.kr.evil.invalid/a')+item('javascript:alert(1)')+'</rss>','매일경제','mk.co.kr');
 assert.equal(r.length,1);assert.equal(r[0].title,'시장 강세 & 금리');assert.equal(r[0].linkKind,'article');assert.equal(r[0].publishedAt,'2026-09-21T06:00:00.000Z');
});
test('KIS headlines use source fields, KST time, and explicitly labelled search URLs',async()=>{
 const {readKisNews}=loader({'lib/kis-terminal.ts':{outputRows,kisTerminal:async(url,tr,p)=>{assert.equal(tr,'FHKST01011800');assert(Object.values(p).every(v=>v===''));return {output:[{hts_pbnt_titl_cntt:'시장 A',data_dt:'20260921',data_tm:'153000',dorg:'테스트 출처'},{hts_pbnt_titl_cntt:'시장 A'},{hts_pbnt_titl_cntt:''}]}}}})('lib/terminal-news.ts');
 const r=await readKisNews();assert.equal(r.length,1);assert.equal(r[0].publishedAt,'2026-09-21T06:30:00.000Z');assert.equal(r[0].linkKind,'search');assert.equal(new URL(r[0].url).searchParams.get('query'),'시장 A');
});
test('blocked RSS uses KIS; cache is labelled during outages and stops after six hours',async()=>{
 let fail=false,calls=0,now=Date.now();const original=Date.now;Date.now=()=>now;
 try{
  const {GET}=loader({'lib/balta-access.ts':access,'lib/terminal-news.ts':{readRssNews:async()=>{throw Error('403')},readKisNews:async()=>{calls++;if(fail)throw Error('outage');return [{title:'fixture',url:'https://example.com',source:'test',publishedAt:''}]}}})('app/api/market/news/route.ts');
  const req=new Request('https://test.invalid');const a=await(await GET(req)).json();assert.equal(a.stale,false);await GET(req);assert.equal(calls,1);
  now+=300001;fail=true;const b=await(await GET(req)).json();assert.equal(b.stale,true);assert.equal(b.asOf,a.asOf);
  now+=6*60*60*1000;assert.equal((await GET(req)).status,503);
 }finally{Date.now=original;}
});
test('news auth rejection makes no external request',async()=>{
 let calls=0;const source=async()=>{calls++;throw Error('unexpected')};const {GET}=loader({'lib/balta-access.ts':{hasDashboardAccess:()=>false},'lib/terminal-news.ts':{readKisNews:source,readRssNews:source}})('app/api/market/news/route.ts');
 assert.equal((await GET(new Request('https://test.invalid'))).status,401);assert.equal(calls,0);
});

test('unavailable commodity sources stay missing rather than inventing prices', async () => {
  const load = loader({ 'lib/balta-access.ts': access, 'lib/kis-directory.ts': { commodityCode: async product => ({ code: product + 'TEST', exchange: 'NYM' }) }, 'lib/kis-terminal.ts': { outputRows, kisTerminal: async (url, tr, p) => {
    if (url.endsWith('/inquire-price')) return { output1: { last_price: '' } };
    if (url.endsWith('/daily-ccnl')) return { output2: [{ data_date: '20000101', last_price: '25' }] };
    if (url.endsWith('inquire-daily-chartprice') && p.FID_INPUT_ISCD === 'FX@KRW') return { output1: { ovrs_nmix_prpr: '1337.2' } };
    return {};
  } } });
  const body = await (await load('app/api/market/terminal/route.ts').GET(new Request('https://test.invalid'))).json();
  assert.equal(body.indicators.find(q => q.code === 'fx').price, 1337.2);
  assert(!body.indicators.some(q => q.code === 'wti' || q.code === 'gold'));
  assert(body.warnings.includes('WTI 조회 대기')); assert(body.warnings.includes('금 조회 대기'));
});
