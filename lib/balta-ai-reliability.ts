// Bounded retries for transient BALTA AI data failures (research only).
// No unbounded loops or retries for invalid inputs / authentication errors.
export class RetryableResearchError extends Error {
  constructor(message:string,public readonly kind:'http'|'market_data'='market_data',public readonly status?:number){
    super(message);this.name='RetryableResearchError';
  }
}
export function shouldRetryResearch(error:unknown):boolean{
  return error instanceof RetryableResearchError &&
    (error.kind==='market_data' || error.status===408 || error.status===429 || (error.status!==undefined&&error.status>=500));
}
export async function retryResearch<T>(
  operation:()=>Promise<T>,opts:{
    attempts?:number;
    delayMs?:number;
    sleep?:(ms:number)=>Promise<void>;
    retryable?:(error:unknown)=>boolean;
  }={}
):Promise<T>{
  const attempts=opts.attempts??3,delayMs=opts.delayMs??1500;
  if(!Number.isInteger(attempts)||attempts<1||attempts>4||!Number.isFinite(delayMs)||delayMs<0||delayMs>30000)
    throw new Error('Invalid bounded retry settings');
  const sleep=opts.sleep??(ms=>new Promise<void>(resolve=>setTimeout(resolve,ms)));
  const retryable=opts.retryable??shouldRetryResearch;
  for(let i=0;i<attempts;i++){
    try{return await operation();}
    catch(error){
      if(i===attempts-1||!retryable(error))throw error;
      await sleep(delayMs*Math.min(4,2**i));
    }
  }
  throw new Error('Unreachable retry state');
}
export type ResearchFailure={phase:'morning'|'close';reason:'source_stale'|'source_unavailable'|'write_failed'|'unknown'};
export function failureReason(error:unknown):ResearchFailure['reason']{
  if(error instanceof RetryableResearchError)return error.kind==='market_data'?'source_stale':'source_unavailable';
  const msg=error instanceof Error?error.message:'';
  if(/missing prior session|Source date is too old|Future or invalid observation/.test(msg))return 'source_stale';
  if(/BALTA storage|HTTP/.test(msg))return 'write_failed';
  return 'unknown';
}
