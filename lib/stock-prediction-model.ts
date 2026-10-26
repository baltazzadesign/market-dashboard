/** Only a traded, exact-date KRX daily candle can settle a prediction. */
export function stockClosingPair(rows:Record<string,unknown>[],day:string){
 const row=rows.find(r=>r.stck_bsop_date===day.replaceAll('-',''));
 if(!row)return null;
 const opening=Number(row.stck_oprc),closing=Number(row.stck_clpr),volume=Number(row.acml_vol);
 return [opening,closing,volume].every(n=>Number.isFinite(n)&&n>0)?{opening,closing}:null;
}
