import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildObservedAt,
  buildProbeSnapshot,
  hasAfterMarketSchema,
  mapAfterMarketQuote,
  parseSymbolConfig,
  rankMarketClsCodeCandidates,
} from '../scripts/kis-after-market-lib.mjs';

test('symbol config validates and deduplicates', () => {
  assert.deepEqual(parseSymbolConfig('005930:KOSPI,035720:KOSDAQ,005930:KOSPI'), [
    { symbol: '005930', market: 'KOSPI' },
    { symbol: '035720', market: 'KOSDAQ' },
  ]);
});

test('observed time is KST event time converted to ISO', () => {
  assert.equal(buildObservedAt('20260914', '160001'), '2026-09-14T07:00:01.000Z');
});

test('persistence refuses schema without MARKET_CLS_CODE', () => {
  assert.equal(hasAfterMarketSchema(['MKSC_SHRN_ISCD']), false);
  assert.equal(mapAfterMarketQuote('005930^160001^70000', ['MKSC_SHRN_ISCD','STCK_CNTG_HOUR','STCK_PRPR'], new Map([['005930','KOSPI']])).reason, 'SCHEMA_NOT_READY');
});

test('only MARKET_CLS_CODE=3 maps to KRX_AFTER_MARKET', () => {
  const columns = ['MKSC_SHRN_ISCD','STCK_CNTG_HOUR','STCK_PRPR','BSOP_DATE','MARKET_CLS_CODE'];
  const markets = new Map([['005930','KOSPI']]);
  assert.equal(mapAfterMarketQuote('005930^160001^70000^20260914^2', columns, markets).reason, 'NOT_AFTER_MARKET');
  const result = mapAfterMarketQuote('005930^160001^70000^20260914^3', columns, markets);
  assert.equal(result.ok, true);
  assert.equal(result.row.session, 'KRX_AFTER_MARKET');
  assert.equal(result.row.price, 70000);
  assert.equal(result.row.volume, null);
  assert.equal(result.row.turnover, null);
});

test('probe snapshot preserves raw indexed values without guessing unknown fields', () => {
  const raw = '0|H0STCNT0|1|005930^155959^70000^2';
  const snap = buildProbeSnapshot(raw, ['MKSC_SHRN_ISCD','STCK_CNTG_HOUR','STCK_PRPR'], new Date('2026-09-14T06:59:59Z'));
  assert.equal(snap.symbol, '005930');
  assert.equal(snap.fieldCount, 4);
  assert.deepEqual(snap.values, ['005930','155959','70000','2']);
  assert.equal(snap.receivedAtKst, '2026-09-14T15:59:59+09:00');
});

test('probe report ranks a transition-to-3 field but never changes schema', () => {
  const samples = [];
  for (let i = 0; i < 5; i += 1) {
    samples.push({ receivedAtKst: `2026-09-14T15:59:5${i}+09:00`, values: ['005930','70000','2','A'] });
    samples.push({ receivedAtKst: `2026-09-14T16:00:0${i}+09:00`, values: ['005930','70100','3','A'] });
  }
  const ranked = rankMarketClsCodeCandidates(samples);
  assert.equal(ranked[0].index, 2);
  assert.equal(ranked[0].before.value, '2');
  assert.equal(ranked[0].after.value, '3');
});
