import assert from 'node:assert/strict';
import test from 'node:test';
import { failureReason, RetryableResearchError, retryResearch, shouldRetryResearch } from '../lib/balta-ai-reliability';

test('retries transient KIS errors with bounded exponential delays',async()=>{
  let calls=0;
  const waits:number[]=[];
  const result=await retryResearch(async()=>{
    calls++;
    if(calls<=2)throw new RetryableResearchError('KIS temporarily delayed');
    return 'ready';
  },{attempts:3,delayMs:1000,sleep:async ms=>{waits.push(ms);}});
  assert.equal(result,'ready');
  assert.equal(calls,3);
  assert.deepEqual(waits,[1000,2000]);
});

test('never retries invalid request or 403 credentials',async()=>{
  let calls=0;
  await assert.rejects(
    retryResearch(async()=>{calls++;throw new Error('Bad request');},
      {attempts:3,delayMs:0,sleep:async()=>{}}),
    /Bad request/
  );
  assert.equal(calls,1);
  assert.equal(shouldRetryResearch(new RetryableResearchError('Forbidden','http',403)),false);
  assert.equal(shouldRetryResearch(new RetryableResearchError('Throttled','http',429)),true);
  assert.equal(shouldRetryResearch(new RetryableResearchError('Timeout','http',408)),true);
  assert.equal(shouldRetryResearch(new RetryableResearchError('Server down','http',503)),true);
});

test('fails after configured bounded number of attempts',async()=>{
  let calls=0;
  await assert.rejects(retryResearch(async()=>{
    calls++;throw new RetryableResearchError('Not ready');
  },{attempts:2,delayMs:0,sleep:async()=>{}}),/Not ready/);
  assert.equal(calls,2);
});

test('retry configuration cannot create an endless backoff',async()=>{
  await assert.rejects(retryResearch(async()=>1,{attempts:100}),/Invalid bounded retry/);
  await assert.rejects(retryResearch(async()=>1,{delayMs:-1}),/Invalid bounded retry/);
});

test('failure categories are safe metadata, never embed credential values',()=>{
  assert.equal(failureReason(new RetryableResearchError('Sensitive KIS response')),'source_stale');
  assert.equal(failureReason(new Error('Investor history missing prior session 2026-10-10')),'source_stale');
  assert.equal(failureReason(new Error('BALTA storage HTTP 401')),'write_failed');
  assert.equal(failureReason(new Error('Unrelated runtime problem')),'unknown');
});
