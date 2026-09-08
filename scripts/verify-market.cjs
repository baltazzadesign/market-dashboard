// Focused regression checks. Uses local fixtures only; never calls KIS or a live database.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  return resolve.call(this, request.startsWith("@/") ? path.join(root, request.slice(2)) : request, parent, ...rest);
};
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  module._compile(outputText, filename);
};
const model = require("../lib/balta-model.ts");
const { buildMarketEvents } = require("../lib/balta-signals.ts");
const { readMarketDay } = require("../lib/balta-data.ts");
const { accessCode } = require("../lib/balta-access.ts");
const nativeFetch = global.fetch;
const envBefore = { ...process.env };
const date = "2026-09-07";
const raw = (overrides = {}) => ({ id: 1, time: "09:00", up: 1100, down: 1000, flat: 100, diff: 100, accel: 20,
  upRatio: .5, downRatio: .45, kospi: 3000, kosdaq: 900, foreignflow: 4162, instflow: -100, indivflow: -4062,
  marketstate: "NEUTRAL|FLOW_LIVE|BREADTH_LIVE", ...overrides });
const checks = [];
function test(name, fn) { checks.push({ name, fn }); }

test("KST date rollover and strict calendar validation", () => {
  assert.equal(model.kstParts(new Date("2026-09-07T15:01:00Z")).date, "2026-09-08");
  assert.equal(model.kstParts(new Date("2026-09-07T15:01:00Z")).time, "00:01");
  assert.equal(model.isValidDate("2026-02-30"), false);
  assert.equal(model.isValidDate("2024-02-29"), true);
  assert.equal(model.moveDate("2026-03-01", -1), "2026-02-28");
});
test("Flow units are preserved and unavailable flows stay null", () => {
  const normal = model.normalizeRow(raw(), date);
  assert.equal(normal.foreignFlow, 4162);
  assert.equal(normal.flowPower, 4062);
  const invalid = model.normalizeRow(raw({ marketstate: "FLOW_ERROR", foreignflow: 0, flowpower: 0 }), date);
  assert.equal(invalid.foreignFlow, null);
  assert.equal(invalid.flowPower, null);
  const zero = model.normalizeRow(raw({ foreignflow: 0 }), date);
  assert.equal(zero.foreignFlow, 0);
  assert.equal(model.numeric("   "), null);
  assert.equal(model.numeric("12,345"), 12345);
});
test("Duplicate minutes retain the newest record and session filtering", () => {
  const rows = model.normalizeRows([raw({id:10,time:"09:01",diff:300}),raw({id:2,time:"09:01",diff:100}),raw({id:1,time:"09:00"}),raw({time:"08:59"}),raw({time:"15:31"}),raw({time:"25:00"})],date);
  assert.deepEqual(rows.map(r=>r.time),["09:00","09:01"]);
  assert.equal(rows[1].diff,300);
});
test("Early-session derived signals survive a full session", () => {
  const rows = model.normalizeRows(Array.from({length:150},(_,i)=>raw({id:i+1,time:model.minuteLabel(540+i),diff:i<2?-50:180,accel:i===2?150:0,upRatio:i<2?.45:.55,downRatio:i<2?.55:.45})),date);
  const events=buildMarketEvents(rows);
  assert(events.some(e=>e.type==="CROSS_UP"&&e.time==="09:02"));
  assert(events.every(e=>e.date===date));
  assert(events.every(e=>!e.message.includes("신뢰도")));
});
test("Repeated stored signals are compacted without mixing dates", () => {
  const rows=model.normalizeRows([0,1,12].map((minute,i)=>raw({id:i+1,time:model.minuteLabel(540+minute),signals:[{type:"FLOW_STRONG_BUY",level:"강",message:"외국인·기관 매수 확대"}]})),date);
  const matching=buildMarketEvents(rows).filter(e=>e.type==="FLOW_STRONG_BUY");
  assert.deepEqual(matching.map(e=>e.time),["09:12","09:00"]);
  assert(matching.every(e=>e.id.startsWith(date)));
});
test("History status never claims live and stale data is identified", () => {
  const row=model.normalizeRow(raw({time:"10:00"}),date);
  assert.equal(model.dataStatus(row,date,"",new Date("2026-09-08T01:00:00Z")).label,"과거 기록");
  assert.equal(model.dataStatus(row,date,"",new Date("2026-09-07T01:05:00Z")).label,"데이터 지연");
});
test("CSV protects formula text while preserving numeric negatives", () => {
  assert.equal(model.csvCell("=1+1"),'"\'=1+1"');
  assert.equal(model.csvCell(-12),'"-12"');
  const csv=model.rowsCsv([model.normalizeRow(raw(),date)]);
  assert(csv.startsWith("\uFEFF"));
  assert(csv.includes("외국인(억원)"));
  assert(csv.includes('"4162"'));
});
test("Daily API queries explicit KST date bounds and keeps flow provenance", async () => {
  process.env.SUPABASE_URL="https://fixture.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY="fixture-only";
  let called=false;
  global.fetch=async input=>{
    called=true;const url=new URL(String(input));
    assert.deepEqual(url.searchParams.getAll("created_at"),["gte."+date+"T09:00:00+09:00","lte."+date+"T15:30:59+09:00"]);
    return Response.json([raw()]);
  };
  const rows=await readMarketDay(date);
  assert(called);assert.equal(rows[0].flowSource,"LIVE");assert.equal(rows[0].foreignFlow,4162);
  called=false;await assert.rejects(()=>readMarketDay("2026-02-30"));assert.equal(called,false);
});
test("Alerts API reads the selected date from the same daily records", async () => {
  global.fetch=async input=>{
    assert(new URL(String(input)).searchParams.getAll("created_at").every(v=>v.includes(date)));
    return Response.json([raw({signals:[{type:"CROSS_UP",message:"0선 상향",level:"중"}]})]);
  };
  const route=require("../app/api/market/alerts/route.ts");
  const response=await route.GET(new Request("https://fixture.invalid/api/market/alerts?date="+date));
  const body=await response.json();assert.equal(body.ok,true);assert.equal(body.selectedDate,date);
  assert.equal(body.signals[0].time,"09:00");assert(body.signals[0].createdAt.startsWith(date));
});
test("Login returns an HttpOnly cookie and rejects incorrect codes", async () => {
  const route=require("../app/api/auth/login/route.ts");
  const request=code=>new Request("https://fixture.invalid/api/auth/login",{method:"POST",headers:{"content-type":"application/json",origin:"https://fixture.invalid"},body:JSON.stringify({code})});
  const good=await route.POST(request(accessCode()));
  assert.equal(good.status,200);assert(/httponly/i.test(good.headers.get("set-cookie")??""));
  const bad=await route.POST(request("invalid-fixture"));assert.equal(bad.status,401);
});
test("Refresh requires dashboard access and forwards cron authorization server-side", async () => {
  const collector=require("../app/api/market/live/route.ts");const original=collector.GET;
  let collected=false;
  collector.GET=async request=>{collected=true;assert.equal(request.headers.get("authorization"),"Bearer fixture-cron");return Response.json({...raw(),time:"09:10",createdat:date});};
  process.env.CRON_SECRET="fixture-cron";
  const route=require("../app/api/market/refresh/route.ts");
  const denied=await route.POST(new Request("https://fixture.invalid/api/market/refresh",{method:"POST"}));
  assert.equal(denied.status,401);assert.equal(collected,false);
  const result=await route.POST(new Request("https://fixture.invalid/api/market/refresh",{method:"POST",headers:{cookie:"access="+encodeURIComponent(accessCode()),origin:"https://fixture.invalid"}}));
  const body=await result.json();assert.equal(result.status,200);assert.equal(body.date,date);assert.equal(body.time,"09:10");assert(collected);
  assert(!JSON.stringify(body).includes("fixture-cron"));
  collector.GET=original;
});
test("Cron route retains the collector's authorization gate", async () => {
  process.env.CRON_SECRET="fixture-cron";
  global.fetch=async()=>{throw new Error("Should not call an external service");};
  const route=require("../app/api/cron/route.ts");
  const response=await route.GET(new Request("https://fixture.invalid/api/cron"));
  assert.equal(response.status,401);
});

(async()=>{
  try {
    for(const check of checks){await check.fn();console.log("PASS",check.name);}
    console.log("Verified",checks.length,"regression cases.");
  } finally {
    global.fetch=nativeFetch;
    for(const key of ["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","CRON_SECRET"]){if(envBefore[key]===undefined)delete process.env[key];else process.env[key]=envBefore[key];}
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
