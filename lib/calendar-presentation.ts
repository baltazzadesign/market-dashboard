// Keep the historical API/monthly scoring scale unchanged; convert at presentation.
export function calendarPulse(value:number|null):number|null {
  return value===null||!Number.isFinite(value)?null:Math.round(Math.max(-100,Math.min(100,value*2-100)));
}
export function calendarTone(kospi:number|null,kosdaq:number|null) {
  if(kospi===null||kosdaq===null||!Number.isFinite(kospi)||!Number.isFinite(kosdaq))return 'neutral';
  if(kospi>0&&kosdaq>0)return 'up';
  if(kospi<0&&kosdaq<0)return 'down';
  if(kospi*kosdaq<0)return 'mixed';
  return 'neutral';
}
export const calendarBackground={up:'#30181d',mixed:'#302415',down:'#14263b',neutral:'#162011'};
