// KIS read-only field probe: no tokens or response body are printed.
import { kisTerminal, outputRows } from '../lib/kis-terminal';
import { stockNumber, stockDate } from '../lib/stock-flow-model';
async function main(){
 const chart=await kisTerminal('/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice','FHKST03010100',{
  FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:'005930',
  FID_INPUT_DATE_1:'20260901',FID_INPUT_DATE_2:'20261013',
  FID_PERIOD_DIV_CODE:'D',FID_ORG_ADJ_PRC:'1'
 },0);
 const quote=await kisTerminal('/uapi/domestic-stock/v1/quotations/inquire-price','FHKST01010100',{
  FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:'005930'
 },0);
 const bars=outputRows(chart.output2).filter(x=>stockDate(x.stck_bsop_date)&&stockNumber(x.acml_tr_pbmn)!==null);
 const cap=stockNumber(outputRows(quote.output)[0]?.hts_avls);
 if(bars.length<10||!cap||cap<=0)throw Error('KIS liquidity data missing');
 console.log('[BALTA] KIS turnover and market cap fields present');
}
main().catch(()=>{console.error('::error::KIS liquidity probe failed');process.exitCode=1;});
