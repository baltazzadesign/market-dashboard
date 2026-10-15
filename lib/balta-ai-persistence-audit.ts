// Read-after-write audit for immutable BALTA AI paper-research signals.
// A successful HTTP INSERT (or ignored duplicate) alone is not proof of persistence.
export type FrozenSignalRow = {
  trade_date:string; strategy:string; source_date:string;
  source_observed_at:string; generated_at:string; picks:unknown;
};
export type FrozenSignalAudit = {
  ok:boolean; missing:string[]; invalid:string[];
  stored_per_strategy:Record<string,number>;
};
const dateOnly=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&
  !Number.isNaN(Date.parse(value+'T00:00:00Z'));

export function auditFrozenSignals(
  rows:FrozenSignalRow[],tradeDate:string,requiredStrategies:readonly string[],
  expectedSourceDate?:string
):FrozenSignalAudit{
  const present=new Set<string>(),invalid:string[]=[];
  const stored_per_strategy:Record<string,number>={};
  const cutoff=Date.parse(tradeDate+'T09:00:00+09:00');
  for(const row of rows){
    const name=row.strategy;
    if(present.has(name))invalid.push(name+':duplicate_strategy');
    present.add(name);
    if(!dateOnly(row.trade_date)||row.trade_date!==tradeDate)invalid.push(name+':wrong_signal_day');
    if(!dateOnly(row.source_date)||row.source_date>=tradeDate||
      (expectedSourceDate&&row.source_date!==expectedSourceDate))
      invalid.push(name+':invalid_source_day');
    const observed=Date.parse(row.source_observed_at),generated=Date.parse(row.generated_at);
    if(!Number.isFinite(observed)||!Number.isFinite(generated)||observed>generated||
      generated>=cutoff)invalid.push(name+':lookahead_or_late_record');
    if(!Array.isArray(row.picks)||row.picks.length>10){
      invalid.push(name+':invalid_picks');continue;
    }
    stored_per_strategy[name]=row.picks.length;
    const codes=new Set<string>();
    for(const pick of row.picks){
      const value=pick as Record<string,unknown>|null;
      if(!value||typeof value.code!=='string'||!/^\d{6}$/.test(value.code)||
        typeof value.name!=='string'||!value.name||
        typeof value.score!=='number'||!Number.isFinite(value.score)||
        (value.market!=='kospi'&&value.market!=='kosdaq')||
        codes.has(value.code)){
        invalid.push(name+':invalid_stock_or_duplicate');break;
      }
      codes.add(value.code);
    }
  }
  const missing=requiredStrategies.filter(strategy=>!present.has(strategy));
  return {ok:missing.length===0&&invalid.length===0,missing,invalid,stored_per_strategy};
}
