import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCalendarCloses } from '../lib/calendar-closes';
import { compareCloses } from '../lib/calendar-presentation';

const bars = [
  { stck_bsop_date: '20261105', bstp_nmix_prpr: '90' },
  { stck_bsop_date: '20261104', bstp_nmix_prpr: '0' },
  { stck_bsop_date: '20261102', bstp_nmix_prpr: '120' },
  { stck_bsop_date: '20261030', bstp_nmix_prpr: '100' },
];
test('calendar uses dated closes, excludes intraday prices and keeps a market when the other fails', async () => {
  const start = new Date('2026-11-05T15:59:00+09:00');
  const result = await readCalendarCloses('2026-11', [], start, async (_path, _id, params) => {
    assert.equal(params.FID_INPUT_DATE_2, '20261104');
    if (params.FID_INPUT_ISCD === '1001') throw Error('unavailable');
    return { output2: bars };
  });
  assert.deepEqual(result.missing, ['kosdaq']);
  assert.deepEqual(result.closes, { '2026-11-02': { kospi: { price: 120, changePct: 20 } } });
});
test('B minus A and A-based returns include reverse and same-day selections, never fill a missing quote', async () => {
  const result = await readCalendarCloses('2026-11', [], new Date('2026-11-05T16:00:00+09:00'), async () => ({ output2: bars }));
  const a = result.closes['2026-11-02'].kospi, b = result.closes['2026-11-05'].kospi;
  assert.equal(b?.changePct, null);
  assert.deepEqual(compareCloses(a,b), { points:-30, percent:-25 });
  assert.ok(Math.abs(compareCloses(b,a)!.percent - 100/3) < 1e-8);
  assert.deepEqual(compareCloses(a,a), { points:0, percent:0 });
  assert.equal(compareCloses(a,undefined), null);
});
