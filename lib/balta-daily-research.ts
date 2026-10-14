import type { RankingSnapshot,RankingGroup,RankingEntry } from './investor-ranking';
import { FLOW_HISTORY_INVESTORS, type StoredFlowHistoryDay } from './investor-flow-history';

export type PriceEvidence={code:string;date:string;close:number;changePct:number|null;volume:number;turnoverEok:number|null;volumeVs20d:number|null;source:'KIS_DAILY_ADJUSTED'};
export type ResearchStock={
 code:string;name:string;market:'kospi'|'kosdaq';foreign:number|null;institution:number|null;
 pension:number|null;individual:number|null;bothNet:number|null;
 institutionStreak:number|null;foreignStreak:number|null;
 foreignFiveDay:number|null;institutionFiveDay:number|null;price:PriceEvidence|null;
};
export type ResearchEvidence={
 tradeDate:string;generatedSourceAt:string;coverage:{expected:number;covered:number;missing:number;ratio:number};
 market:{kospi:number;kosdaq:number;kospiPct:number;kosdaqPct:number;up:number;down:number;flat:number;
  foreign:number|null;institution:number|null;breadthPct:number};
 participants:{key:string;label:string;net:number;buyCount:number;sellCount:number;coverage:number}[];
 stocks:ResearchStock[];source:{ranking:string;market:string;flow:string;prices:string;notes:string[]};
};
export type ResearchNarrative={
 headline:string;lead:string;marketView:string;institutionView:string;
 sectorView:string;risks:string;closingView:string;nextChecks:string[];
 stockNotes:{code:string;thesis:string;risk:string}[];
};
const keys=[
 ['foreign','외국인'],['institution','기관'],['individual','개인'],['otherCorporation','기타법인'],
 ['financialInvestment','금융투자'],['investmentTrust','투신'],['pension','연기금'],
 ['insurance','보험'],['privateEquity','사모'],['otherFinance','기타금융'],['bank','은행']
] as const;
const number=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const calc=(group:RankingGroup):number=>Number((group.buyTotal+group.sellTotal).toFixed(2));
function snapshotRow(group:RankingGroup,code:string):RankingEntry|undefined{
 return [...group.buy,...group.sell].find(r=>r.code===code);
}
function topStocks(snapshot:RankingSnapshot):RankingEntry[]{
 const fg=snapshot.groups['foreign:all'],ig=snapshot.groups['institution:all'];
 const pool=new Map<string,{row:RankingEntry;priority:number}>();
 function add(r:RankingEntry,score:number){
  const p=pool.get(r.code);
  if(!p||p.priority<score)pool.set(r.code,{row:r,priority:score});
 }
 // Use a mix of buying-side and opposing-selling-side leaders, not only dual buyers.
 for(const r of fg.buy.slice(0,13))add(r,Math.abs(r.net)+100);
 for(const r of ig.buy.slice(0,13))add(r,Math.abs(r.net)+100);
 for(const r of fg.sell.slice(0,9))add(r,Math.abs(r.net)*.5);
 for(const r of ig.sell.slice(0,9))add(r,Math.abs(r.net)*.5);
 for(const r of fg.buy){
  const paired=snapshotRow(ig,r.code);
  if(paired&&paired.net>0)add(r,500+Math.min(r.net,paired.net));
 }
 return [...pool.values()].sort((a,b)=>b.priority-a.priority||a.row.code.localeCompare(b.row.code))
  .slice(0,9).map(x=>x.row);
}
const flowNet=(row:StoredFlowHistoryDay|undefined,code:string,idx:number):number|null=>{
 const value=row?.snapshot?.stocks?.[code]?.net?.[idx];
 return number(value)?value:null;
};
function fiveDays(flow:StoredFlowHistoryDay[],code:string,investor:'foreign'|'institution'):number|null{
 const ordered=[...flow].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
 if(ordered.length<5)return null;
 const i=FLOW_HISTORY_INVESTORS.indexOf(investor);
 const amounts=ordered.map(r=>flowNet(r,code,i));
 if(amounts.some(x=>x===null))return null;
 return Number((amounts as number[]).reduce((s,v)=>s+v,0).toFixed(2));
}
export function buildResearchEvidence(
 ranking:RankingSnapshot, marketRow:Record<string,unknown>,
 history:StoredFlowHistoryDay[], prices:PriceEvidence[],asOf:string
):ResearchEvidence{
 const m=marketRow.snapshot as Record<string,unknown>|undefined;
 const md=m?.market_data as Record<string,unknown>|undefined;
 const kp=md?.kospi as Record<string,unknown>|undefined,kq=md?.kosdaq as Record<string,unknown>|undefined;
 if(ranking.version!==1||!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||ranking.date!==asOf||
  marketRow.trade_date!==asOf||m?.time!=='15:30'||md?.tradeDate!==asOf||
  md?.closeBasis!=='REGULAR_SESSION_OBSERVATION'||md?.breadthSource!=='LIVE'||
  kp?.priceSource!=='LIVE'||kq?.priceSource!=='LIVE')
   throw Error('Market/ranking session completeness has not been verified');
 const ref=ranking.groups['foreign:all'], inst=ranking.groups['institution:all'];
 if(!ref||!inst||!number(ref.expected)||ref.expected<1000||
  !number(ref.covered)||ref.covered/ref.expected<.9||
  inst.expected!==ref.expected||inst.covered<ref.covered*.95||
  !ranking.collectedAt||Date.parse(ranking.collectedAt)<Date.parse(asOf+'T16:30:00+09:00')||
  !number(kp.price)||!number(kq.price)||!number(kp.changePct)||!number(kq.changePct)||
  !number(m?.up)||!number(m?.down)||!number(m?.flat)||m.up+m.down<100)
   throw Error('Investor/market coverage or post-close timestamp insufficient');
 const priceMap=new Map(prices.filter(p=>p.date===asOf&&p.close>0&&p.volume>=0).map(p=>[p.code,p]));
 const sortedHistory=[...history].sort((a,b)=>b.date.localeCompare(a.date));
 const stocks=topStocks(ranking).map(row=>{
  const gr=(who:string)=>ranking.groups[who+':all'];
  const amount=(who:string)=> {
   const g=gr(who);return g?snapshotRow(g,row.code)?.net??flowNet(sortedHistory[0],row.code,FLOW_HISTORY_INVESTORS.indexOf(who as typeof FLOW_HISTORY_INVESTORS[number])):null;
  };
  const i=snapshotRow(inst,row.code),f=snapshotRow(ref,row.code);
  const foreign=amount('foreign'),institution=amount('institution');
  return {code:row.code,name:row.name,market:row.market,foreign,institution,
   pension:amount('pension'),individual:amount('individual'),
   bothNet:foreign!==null&&institution!==null?Number((foreign+institution).toFixed(2)):null,
   foreignStreak:f&&f.net>0?f.days:null,institutionStreak:i&&i.net>0?i.days:null,
   foreignFiveDay:fiveDays(history,row.code,'foreign'),
   institutionFiveDay:fiveDays(history,row.code,'institution'),
   price:priceMap.get(row.code)??null
  };
 });
 const participants=keys.flatMap(([key,label])=>{
  const group=ranking.groups[key+':all'];
  return group?[{key,label,net:calc(group),buyCount:group.buyCount,sellCount:group.sellCount,coverage:group.covered}]:[];
 });
 if(participants.length!==11||stocks.length<5)throw Error('Investor groups or stock sample missing');
 return {tradeDate:asOf,generatedSourceAt:ranking.collectedAt,
  coverage:{expected:ref.expected,covered:ref.covered,missing:ref.expected-ref.covered,
   ratio:Number((ref.covered/ref.expected*100).toFixed(2))},
  market:{kospi:kp.price as number,kosdaq:kq.price as number,
   kospiPct:kp.changePct as number,kosdaqPct:kq.changePct as number,
   up:m.up as number,down:m.down as number,flat:m.flat as number,
   foreign:participants.find(x=>x.key==='foreign')?.net??null,
   institution:participants.find(x=>x.key==='institution')?.net??null,
   breadthPct:Number(((m.up as number)/((m.up as number)+(m.down as number))*100).toFixed(1))},
  participants,stocks,
  source:{ranking:'investor_rankings · KIS stock investor net (KRX)',
   market:'market_daily · regular session 15:30 observation',
   flow:'investor_flow_history · five actual sessions; missing remains null',
   prices:'KIS adjusted daily itemchartprice · observed close/volume/turnover',
   notes:['수급 합계는 확인된 종목만 합산, 미확인 종목 0 처리 금지',
    '기관 하위 주체는 기관 전체에 중복 포함됩니다',
    '거래소 잠정 및 원천 정정 가능성; 총 매수/매도 거래대금과 순매수 합계 구분',
    '가격·거래량 일부 결측 시 가격 평가를 보류합니다']}
 };
}
const clean=(x:unknown,limit=190)=>{
 if(typeof x!=='string'||x.length>limit||x.trim().length<6||
  /[0-9０-９]|\d\s*[%억만원주일배]|https?:\/\/|매수(?:가|추천|하라)|목표주가|수익률\s*[+\-]/.test(x))
  throw Error('Unverified numerical, URL or directive in AI prose');
 return x.trim();
};
export function validateResearchNarrative(data:unknown,evidence:ResearchEvidence):ResearchNarrative{
 if(!data||typeof data!=='object')throw Error('Narrative response missing');
 const n=data as Record<string,unknown>;
 const next=Array.isArray(n.nextChecks)?n.nextChecks.map(v=>clean(v,130)):[];
 const notes=Array.isArray(n.stockNotes)?n.stockNotes:[];
 if(next.length<2||next.length>5||notes.length<3||notes.length>9)throw Error('Research content coverage insufficient');
 const allowed=new Set(evidence.stocks.map(s=>s.code)),codes=new Set<string>();
 const stockNotes=notes.map(v=>{
  const r=v as Record<string,unknown>;
  if(typeof r.code!=='string'||!allowed.has(r.code)||codes.has(r.code))throw Error('Invented or duplicate stock');
  codes.add(r.code);
  return {code:r.code,thesis:clean(r.thesis,190),risk:clean(r.risk,160)};
 });
 return {headline:clean(n.headline,90),lead:clean(n.lead,230),
  marketView:clean(n.marketView,300),institutionView:clean(n.institutionView,300),
  sectorView:clean(n.sectorView,300),risks:clean(n.risks,300),closingView:clean(n.closingView,220),
  nextChecks:next,stockNotes};
}
