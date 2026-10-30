import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
for(const scenario of ['success','canonical','close-revised','revised','dry-run','early','lost-write','missing-price','expired']){
  test('isolated worker: '+scenario,()=>{
    const result=spawnSync(process.execPath,['--import','tsx','tests/fixtures/balta-ai-worker-runner.ts',scenario],{encoding:'utf8',timeout:30000});
    assert.equal(result.status,0,result.error?.message??result.stderr+'\n'+result.stdout);
  });
}
