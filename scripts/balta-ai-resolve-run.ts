// No market credentials or database access. Freeze a target before starting work.
import {appendFileSync} from 'node:fs';
import {resolveScheduledResearch, validResearchDate, ResearchBoundaryError} from '../lib/balta-ai-run-context';

async function main() {
  let target;
  if (process.env.GITHUB_EVENT_NAME==='schedule') {
    const repo=process.env.GITHUB_REPOSITORY, id=process.env.GITHUB_RUN_ID;
    if (repo!=='baltazzadesign/market-dashboard' || !/^\d+$/.test(id??'')) throw new ResearchBoundaryError('INVALID_RUN_IDENTITY');
    const res=await fetch(`https://api.github.com/repos/${repo}/actions/runs/${id}`,{
      headers:{authorization:'Bearer '+process.env.GH_TOKEN,accept:'application/vnd.github+json'},
      signal:AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new ResearchBoundaryError('RUN_METADATA_HTTP_'+res.status);
    const run=await res.json();
    if (String(run.id)!==id || run.event!=='schedule' || run.repository?.full_name!==repo)
      throw new ResearchBoundaryError('RUN_METADATA_IDENTITY_MISMATCH');
    target=resolveScheduledResearch(process.env.SCHEDULE_EXPR??'',run.created_at);
  } else if (process.env.GITHUB_EVENT_NAME==='workflow_dispatch') {
    const phase=process.env.MANUAL_PHASE,tradeDate=process.env.MANUAL_DATE??'';
    if ((phase!=='close' && phase!=='morning') || !validResearchDate(tradeDate)) throw new ResearchBoundaryError('MANUAL_PHASE_AND_DATE_REQUIRED');
    target={phase,tradeDate,scheduledAt:'',runCreatedAt:'',schedule:'',selection:'explicit_manual_date'};
  } else throw new ResearchBoundaryError('UNSUPPORTED_RUN_EVENT');
  const dryRun=process.env.GITHUB_EVENT_NAME==='workflow_dispatch' && process.env.MANUAL_DRY_RUN!=='false';
  console.log('[balta-ai] Resolved target',JSON.stringify({...target,dryRun,runId:process.env.GITHUB_RUN_ID}));
  if (!process.env.GITHUB_OUTPUT) throw new ResearchBoundaryError('GITHUB_OUTPUT_REQUIRED');
  appendFileSync(process.env.GITHUB_OUTPUT,
    `phase=${target.phase}\ntrade_date=${target.tradeDate}\nscheduled_at=${target.scheduledAt}\nrun_created_at=${target.runCreatedAt}\ndry_run=${dryRun}\n`);
}
main().catch(error=>{
  console.error('[balta-ai] Target resolution failed',error instanceof ResearchBoundaryError?error.code:'RUN_METADATA_UNAVAILABLE');
  process.exitCode=1;
});
