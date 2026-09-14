// KST calendar dates: never use the host machine's timezone to determine weekdays.
// 2026 public/substitute holidays + exchange holidays. Additional closures come
// from MARKET_HOLIDAYS on the server and are returned to the calendar UI.
export const MARKET_HOLIDAYS_2026: Readonly<Record<string,string>> = {
  "2026-01-01":"신정", "2026-02-16":"설 연휴", "2026-02-17":"설날", "2026-02-18":"설 연휴",
  "2026-03-01":"삼일절", "2026-03-02":"삼일절 대체공휴일",
  "2026-05-01":"노동절", "2026-05-05":"어린이날", "2026-05-24":"부처님오신날", "2026-05-25":"부처님오신날 대체공휴일",
  "2026-06-03":"지방선거일", "2026-06-06":"현충일", "2026-07-17":"제헌절",
  "2026-08-15":"광복절", "2026-08-17":"광복절 대체공휴일",
  "2026-09-24":"추석 연휴", "2026-09-25":"추석", "2026-09-26":"추석 연휴",
  "2026-10-03":"개천절", "2026-10-05":"개천절 대체공휴일", "2026-10-09":"한글날",
  "2026-12-25":"성탄절", "2026-12-31":"연말 증시 휴장",
};
function validDate(date:string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date+"T00:00:00Z")) && new Date(date+"T00:00:00Z").toISOString().slice(0,10)===date;
}
export function marketClosedReason(date:string,additional:readonly string[]=[]):string|null {
  if(!validDate(date))return "날짜 확인 필요";
  const day=new Date(date+"T00:00:00Z").getUTCDay();
  if(day===0||day===6)return "주말";
  if(additional.includes(date))return "추가 지정 휴장일";
  if(MARKET_HOLIDAYS_2026[date])return MARKET_HOLIDAYS_2026[date];
  // Fixed holidays apply outside the maintained annual calendar, too. Lunar,
  // substitute, election and extraordinary closures require the annual list.
  const fixed:Record<string,string>={"01-01":"신정","03-01":"삼일절","05-01":"노동절","05-05":"어린이날","06-06":"현충일","08-15":"광복절","10-03":"개천절","10-09":"한글날","12-25":"성탄절"};
  if(fixed[date.slice(5)])return fixed[date.slice(5)];
  const last=new Date(date.slice(0,4)+"-12-31T00:00:00Z");
  while([0,6].includes(last.getUTCDay()))last.setUTCDate(last.getUTCDate()-1);
  if(last.toISOString().slice(0,10)===date)return "연말 증시 휴장";
  return null;
}
export function parseAdditionalHolidays(value:string|undefined):string[] {
  return (value??"").split(",").map(d=>d.trim()).filter(validDate);
}
export function monthWeekdaySlots(month:string):Array<string|null> {
  if(!validDate(month+"-01"))return [];
  const first=new Date(month+"-01T00:00:00Z"),last=new Date(first);
  last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);
  const offset=(first.getUTCDay()+6)%7;
  const slots:Array<string|null>=[];
  const total=Math.ceil((offset+last.getUTCDate())/7)*7;
  for(let i=0;i<total;i++){
    if(i%7>=5)continue;
    const number=i-offset+1;
    slots.push(number<1||number>last.getUTCDate()?null:month+"-"+String(number).padStart(2,"0"));
  }
  // A month beginning or ending on a weekend must not create an empty week.
  while(slots.length&&slots.slice(0,5).every(d=>d===null))slots.splice(0,5);
  while(slots.length&&slots.slice(-5).every(d=>d===null))slots.splice(-5);
  return slots;
}
export function monthClosedDates(month:string,additional:readonly string[]=[]):Record<string,string> {
  const result:Record<string,string>={};
  for(const date of monthWeekdaySlots(month)){
    if(!date)continue;const reason=marketClosedReason(date,additional);if(reason)result[date]=reason;
  }
  return result;
}

// KRX session regime only. NXT/SOR schedules must be handled independently.
export const KRX_AFTER_MARKET_EFFECTIVE_DATE = "2026-09-14";
export type KrxSession = "REGULAR" | "AFTER_HOURS_CLOSE" | "OLD_AFTER_HOURS_SINGLE_PRICE" | "KRX_AFTER_MARKET" | "CLOSED";
export const KRX_SESSION_LABELS: Record<KrxSession, string> = {
  REGULAR: "정규장", AFTER_HOURS_CLOSE: "장후종가",
  OLD_AFTER_HOURS_SINGLE_PRICE: "시간외단일가", KRX_AFTER_MARKET: "애프터마켓", CLOSED: "장마감",
};
export function krxRegime(date: string) {
  return date < KRX_AFTER_MARKET_EFFECTIVE_DATE ? "PRE_20260914" as const : "FROM_20260914" as const;
}
export function getKrxSession(date: string, time: string, additional: readonly string[] = []): KrxSession {
  if (marketClosedReason(date, additional) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return "CLOSED";
  if (time >= "09:00" && time < "15:30") return "REGULAR";
  if (time >= "15:30" && time < "16:00") return "AFTER_HOURS_CLOSE";
  if (date < KRX_AFTER_MARKET_EFFECTIVE_DATE && time >= "16:00" && time < "18:00") return "OLD_AFTER_HOURS_SINGLE_PRICE";
  if (date >= KRX_AFTER_MARKET_EFFECTIVE_DATE && time >= "16:00" && time < "20:00") return "KRX_AFTER_MARKET";
  return "CLOSED";
}
// Keep the existing collector's 15:30 observation. This is NOT a claim that
// a response fetched at 15:30 contains exchange-certified closing prices.
export function isRegularObservation(date: string, time: string, additional: readonly string[] = []) {
  return !marketClosedReason(date, additional) && /^(?:09|1[0-4]):[0-5]\d$|^15:(?:[0-2]\d|30)$/.test(time);
}
export function getKrxMarketStatus(now: Date = new Date(), additional: readonly string[] = []) {
  if (!Number.isFinite(now.getTime())) throw new RangeError("Invalid market timestamp");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (key: string) => parts.find(p => p.type === key)!.value;
  const tradeDate = `${part("year")}-${part("month")}-${part("day")}`;
  const time = `${part("hour")}:${part("minute")}`;
  const session = getKrxSession(tradeDate, time, additional);
  return {
    exchange: "KRX" as const, timeZone: "Asia/Seoul" as const, tradeDate, time,
    asOf: now.toISOString(), session, label: KRX_SESSION_LABELS[session],
    regime: krxRegime(tradeDate), closedReason: marketClosedReason(tradeDate, additional),
    regularObservationAllowed: isRegularObservation(tradeDate, time, additional),
    officialCloseTime: "15:30", regularCloseVerified: false,
    // TODO: verify KIS field semantics, timestamps, venue and session counters
    // before adding an adapter. Never substitute an index or an old auction quote.
    afterMarket: { availability: "NOT_CONNECTED" as const, collectionEnabled: false,
      realtimeSessionSupport: "DOCUMENTED" as const,
      marketAggregateSupport: "NOT_VERIFIED" as const,
      price: null, changeFromRegularClosePct: null, volume: null, turnover: null },
  };
}
