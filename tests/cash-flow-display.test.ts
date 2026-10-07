import test from 'node:test';
import assert from 'node:assert/strict';
import {cashDisplay,cashDisplayText,cashAxis} from '../lib/cash-flow-display';
test('원 단위 금액을 억원·조원으로 표시하며 부호와 원 금액을 보존',()=>{
  assert.equal(cashDisplayText(1_050_810.9e8),'105.08조원');
  assert.equal(cashDisplayText(902_977.6e8),'90.30조원');
  assert.equal(cashDisplayText(123e8),'123억원');
  assert.equal(cashDisplayText(-1.25e12),'-1.25조원');
  assert.equal(cashDisplayText(1.25e12,true),'+1.25조원');
  assert.equal(cashDisplay(1e12).exact,'1,000,000,000,000원');
  assert.deepEqual(cashAxis([200e8,-2e12]),{unit:'조원',divisor:1e12});
  assert.deepEqual(cashAxis([200e8,0]),{unit:'억원',divisor:1e8});
});
test('결측을 0으로 만들지 않고 소액을 정확한 0으로 반올림하지 않음',()=>{
  assert.equal(cashDisplayText(null),'—');
  assert.equal(cashDisplayText(NaN),'—');
  assert.equal(cashDisplayText(0),'0억원');
  assert.equal(cashDisplayText(1000),'<0.1억원');
  assert.equal(cashDisplayText(-1000),'>-0.1억원');
});
