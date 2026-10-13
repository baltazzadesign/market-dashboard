import { kisTerminal } from './kis-terminal';
import { parseStockFlows } from './stock-flow-model';
import { rankingObservation, type RankingStock } from './investor-ranking';
import { compactFlowHistory } from './investor-flow-history';

export async function loadRankingBundle(stock:RankingStock,dates:string[],query:typeof kisTerminal=kisTerminal){
  const body=await query('/uapi/domestic-stock/v1/quotations/investor-trade-by-stock-daily','FHPTJ04160001',{
    FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:stock.code,FID_INPUT_DATE_1:dates.at(-1)!.replaceAll('-',''),FID_ORG_ADJ_PRC:'',FID_ETC_CLS_CODE:'1'
  },0);
  // No fallback to a previous day's rank. The target date must be present.
  const flows=parseStockFlows(body.output2);
  return {observation:rankingObservation(stock,flows,dates),history:compactFlowHistory(stock.code,flows,dates)};
}
export async function loadRankingObservation(stock:RankingStock,dates:string[],query:typeof kisTerminal=kisTerminal){return (await loadRankingBundle(stock,dates,query)).observation;}
