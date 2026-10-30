// Incident price audit: GET-only transport, bounded dates/codes, no secret output.
import {kisTerminal,outputRows} from '../lib/kis-terminal';
import {parseStockBars} from '../lib/stock-flow-model';
process.env.KIS_TOKEN_READ_ONLY='true';
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,init={})=>{
  const url=new URL(String(input));
  const dbRead=url.hostname==='okkwfjqxtvhcxcgbzngl.supabase.co'&&
    ['/rest/v1/kis_tokens','/rest/v1/balta_ai_portfolio_bars'].includes(url.pathname);
  const priceRead=url.hostname==='openapi.koreainvestment.com'&&
    url.pathname==='/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice';
  if((init.method??'GET')!=='GET'||(!dbRead&&!priceRead))throw Error('READ_ONLY_AUDIT_BOUNDARY');
  return nativeFetch(input,init);
};
async function main(){
  const base=process.env.SUPABASE_URL?.replace(/\/$/,'').replace(/\/rest\/v1$/,'');
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!key||!process.env.KIS_APPKEY||!process.env.KIS_APPSECRET)throw Error('REQUIRED_ENV_MISSING');
  for(const code of ['005930','078930','290650','035420','015760','011200']){
    const res=await fetch(base+'/rest/v1/balta_ai_portfolio_bars?select=trade_date,open,high,low,close,observed_at&stock_code=eq.'+code+'&trade_date=gte.2026-10-19&trade_date=lte.2026-10-29&order=trade_date.asc',{
      headers:{apikey:key,authorization:'Bearer '+key},signal:AbortSignal.timeout(15000)});
    if(!res.ok)throw Error('ARCHIVE_HTTP_'+res.status);
    const archive: {trade_date:string;open:number;high:number;low:number;close:number;observed_at:string}[]=await res.json();
    for(const mode of ['0','1']){
      const body=await kisTerminal('/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice','FHKST03010100',{
        FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:code,FID_INPUT_DATE_1:'20261019',FID_INPUT_DATE_2:'20261029',FID_PERIOD_DIV_CODE:'D',FID_ORG_ADJ_PRC:mode
      },0);
      const vendor=parseStockBars(outputRows(body.output2));
      console.log('[BALTA PRICE AUDIT]',JSON.stringify({code,mode,
        comparisons:archive.map(a=>({archive:a,current:vendor.find(v=>v.date===a.trade_date)})),
        adjustments:outputRows(body.output2).map(r=>({date:r.stck_bsop_date,splitRate:r.prtt_rate,splitCode:r.flng_cls_code,revision:r.revl_issu_reas}))
      }));
    }
  }
}
main().catch(()=>{console.error('[BALTA PRICE AUDIT] Read-only audit failed; no values written');process.exitCode=1;});
