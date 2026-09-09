import ts from 'typescript';
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
// Use the project's TypeScript compiler; no extra test runtime dependency.
const root=mkdtempSync(join(tmpdir(),'market-tests-'));
try{
 for(const file of ['lib/market-comparison.ts','tests/comparison.test.ts','lib/market-diagnostics.ts','tests/diagnostics.test.ts','lib/balta-model.ts','lib/market-calendar.ts','lib/market-history-model.ts','lib/kis-history.ts','lib/balta-data.ts','lib/market-history-data.ts','lib/market.ts','app/api/market/live/route.ts','tests/history.test.ts']){
  const target=join(root,file.replace(/\.ts$/,'.js'));mkdirSync(dirname(target),{recursive:true});
  let source=readFileSync(file,'utf8');
  if(file==='app/api/market/live/route.ts') source=source.replaceAll('@/lib/','../../../../lib/');
  let output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  if(file==='app/api/market/live/route.ts') output+='\nmodule.exports.__test={parseFlowFromJson};';
  writeFileSync(target,output);
 }
 const result=spawnSync(process.execPath,['--test',join(root,'tests/history.test.js'),join(root,'tests/diagnostics.test.js'),join(root,'tests/comparison.test.js')],{stdio:'inherit'});process.exitCode=result.status??1;
}finally{rmSync(root,{recursive:true,force:true});}
