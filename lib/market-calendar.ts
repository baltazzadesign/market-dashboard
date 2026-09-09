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
