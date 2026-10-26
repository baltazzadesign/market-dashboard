import { GET as collectMarket } from '../market/live/route';
import {settleStockPredictions} from '@/lib/stock-prediction-service';
import {settlePredictions} from '@/lib/prediction-service';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request){
 if(!process.env.CRON_SECRET||request.headers.get('authorization')!=='Bearer '+process.env.CRON_SECRET)return new Response('Unauthorized',{status:401});
 const [response]=await Promise.all([collectMarket(request),settleStockPredictions().catch(()=>{console.error("Stock prediction settlement deferred");}),settlePredictions().catch(error=>{console.error('Prediction settlement deferred',error instanceof Error?error.message:'unknown');})]);
 return response;
}
