import { stockInvestors, type StockFlowDay, type StockInvestor } from './stock-flow-model';

export const rankingInvestors = ['pension','foreign','institution','investmentTrust','privateEquity','financialInvestment','individual','insurance','bank','otherFinance','otherCorporation'] as const;
export const rankingMarkets = ['all','kospi','kosdaq'] as const;
export type RankingMarket = typeof rankingMarkets[number];
export const rankingMarketLabels = {all:'코스피 + 코스닥',kospi:'코스피',kosdaq:'코스닥'};
export const investorLabel = (key: StockInvestor) => stockInvestors.find(i => i.key === key)!.label;
export type RankingStock = {code:string;name:string;market:'kospi'|'kosdaq'};
export type RankingValue = {net:number|null;days:number;exact:boolean};
export type RankingObservation = RankingStock & {values:Record<StockInvestor,RankingValue>};
export type RankingEntry = RankingStock & {net:number;days:number;exact:boolean};
export type RankingGroup = {
  investor:StockInvestor;market:RankingMarket;expected:number;covered:number;zero:number;
  buyCount:number;sellCount:number;buyTotal:number;sellTotal:number;
  buy:RankingEntry[];sell:RankingEntry[];
};
export type RankingSnapshot = {
  version:1;date:string;startedAt:string;collectedAt:string;historyDates:string[];
  source:string;scope:string;groups:Record<string,RankingGroup>;
};
export type RankingResponse = {
  ok:true;dates:string[];date:string|null;collectedAt:string|null;startedAt:string|null;
  historyDates:string[];source:string;scope:string;group:RankingGroup|null;
};
export const rankingGroupKey = (investor:StockInvestor,market:RankingMarket) => investor+':'+market;
export const rankingAmount = (value:number) => (value>0?'+':'')+value.toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2});
export const streakLabel = (row:Pick<RankingEntry,'days'|'exact'>) => row.days+'일'+(row.exact?'':' 이상');

// The calendar comes from observed KRX index trading dates, not calendar days.
// A missing observation never bridges a gap. An unknown boundary is a lower bound.
export function rankingObservation(stock:RankingStock,flows:StockFlowDay[],dates:string[]):RankingObservation {
  const calendar=[...new Set(dates)].sort(), byDate=new Map(flows.map(row=>[row.date,row]));
  const end=calendar.at(-1)!;
  const values=Object.fromEntries(rankingInvestors.map(investor=>{
    const net=byDate.get(end)?.money[investor]??null;
    if(net===null||net===0)return [investor,{net,days:0,exact:net===0}];
    let days=0,exact=false;
    for(let i=calendar.length-1;i>=0;i--){
      const value=byDate.get(calendar[i])?.money[investor];
      if(value==null)break;
      if(Math.sign(value)!==Math.sign(net)){exact=true;break;}
      days++;
    }
    return [investor,{net,days,exact}];
  })) as Record<StockInvestor,RankingValue>;
  return {...stock,values};
}

export function buildRankingSnapshot(universe:RankingStock[],observations:RankingObservation[],dates:string[],startedAt:string,collectedAt:string):RankingSnapshot {
  const unique=[...new Map(universe.map(row=>[row.code,row])).values()];
  const observed=new Map(observations.map(row=>[row.code,row]));
  const groups:Record<string,RankingGroup>={};
  for(const market of rankingMarkets)for(const investor of rankingInvestors){
    const stocks=unique.filter(row=>market==='all'||row.market===market);
    const entries=stocks.flatMap(stock=>{
      const value=observed.get(stock.code)?.values[investor];
      return value?.net!=null&&Number.isFinite(value.net)?[{...stock,...value,net:value.net}]:[];
    });
    const buy=entries.filter(row=>row.net>0).sort((a,b)=>b.net-a.net||a.code.localeCompare(b.code));
    const sell=entries.filter(row=>row.net<0).sort((a,b)=>a.net-b.net||a.code.localeCompare(b.code));
    groups[rankingGroupKey(investor,market)]={investor,market,expected:stocks.length,covered:entries.length,zero:entries.filter(row=>row.net===0).length,
      buyCount:buy.length,sellCount:sell.length,buyTotal:buy.reduce((sum,row)=>sum+row.net,0),sellTotal:sell.reduce((sum,row)=>sum+row.net,0),buy:buy.slice(0,30),sell:sell.slice(0,30)};
  }
  return {version:1,date:dates.at(-1)!,startedAt,collectedAt,historyDates:dates,
    source:'한국투자증권 · 종목별 투자자매매동향(일별) · KRX',
    scope:'수집 시점 KOSPI·KOSDAQ의 6자리 숫자코드 주권(ST), 우선주 포함. ETF·ETN·예탁증서·영문 포함 코드는 제외.',groups};
}

export function selectRanking(snapshot:RankingSnapshot|null,dates:string[],investor:StockInvestor,market:RankingMarket):RankingResponse {
  return {ok:true,dates,date:snapshot?.date??null,collectedAt:snapshot?.collectedAt??null,startedAt:snapshot?.startedAt??null,
    historyDates:snapshot?.historyDates??[],source:snapshot?.source??'',scope:snapshot?.scope??'',group:snapshot?.groups[rankingGroupKey(investor,market)]??null};
}

export function rankingNotes(data:RankingResponse):string[] {
  const group=data.group;
  return [data.scope,
    group?`선택 범위 ${group.expected.toLocaleString('ko-KR')}종목 중 ${group.covered.toLocaleString('ko-KR')}종목의 해당일 금액 확인. 누락 ${group.expected-group.covered}종목은 0으로 처리하지 않습니다.`:'',
    '금액은 매수대금 − 매도대금(억원). 양수는 순매수, 음수는 순매도입니다. 상단 합계는 확인된 전체 종목의 방향별 순매수 금액 합계이며 총매수·총매도 거래대금이 아닙니다.',
    `연속일은 기준일을 포함한 같은 방향의 순매수 거래일입니다. 0 또는 반대 방향이면 종료합니다. 최근 ${data.historyDates.length}거래일까지 확인하며, 이전 기록이 없으면 ‘이상’으로 표시합니다.`,
    '장후 조회 자료이며 거래소 확정본 여부는 미검증입니다. 원천 데이터 정정 및 수집 재실행에 따라 값이 바뀔 수 있습니다.',
    '기관 합계에는 연기금·투신 등 하위 주체가 포함되므로 주체별 합계를 서로 더하지 않습니다. 연기금은 KIS의 기금 분류이며 특정 연금의 단독 매매를 뜻하지 않습니다.',data.source
  ].filter(Boolean);
}
