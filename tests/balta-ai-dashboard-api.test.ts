import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../app/api/ai-research/route';

test('BALTA research API never exposes private records without dashboard cookie',async()=>{
  const response=await GET(new Request('https://baltatool.com/api/ai-research?days=30'));
  assert.equal(response.status,401);
  assert.equal(response.headers.get('cache-control'),null);
  const body=await response.json();
  assert.equal(body.ok,false);
});

test('invalid or untrusted access cookie never grants DB access',async()=>{
  const request=new Request('https://baltatool.com/api/ai-research?days=90',{
    headers:{cookie:'access=invalid-or-old-code'}
  });
  const response=await GET(request);
  assert.equal(response.status,401);
});
