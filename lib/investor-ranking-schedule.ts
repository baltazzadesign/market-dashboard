import { kstParts } from './balta-model';
import { marketClosedReason } from './market-calendar';
export function rankingCollectionSlot(now=new Date(),holidays:string[]=[]){
  const clock=kstParts(now);
  if(marketClosedReason(clock.date,holidays)||clock.time<'16:30')return null;
  return clock.date+':'+(clock.time>='18:00'?'18:00':'16:30');
}
