import { test } from 'node:test';
import assert from 'node:assert/strict';
import { excludeMobile } from '../scripts/integrate-parent.mjs';
test('Next config integration preserves existing options and is idempotent', () => {
  const before = '{\n// keep\n"compilerOptions":{"strict":true},"exclude":["node_modules","custom"],\n}';
  const after: string = excludeMobile(before);
  assert.match(after, /\/\/ keep/); assert.match(after, /"custom"/); assert.match(after, /"apps\/mobile"/); assert.match(after, /"strict":true/);
  assert.equal(excludeMobile(after), after);
});
