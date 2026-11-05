import { kstParts, moveDate } from './balta-model';
import { kisTerminal, outputRows } from './kis-terminal';
import { marketClosedReason } from './market-calendar';
import { monthEnd, type Market } from './market-history-model';
import { stockDate, stockNumber } from './stock-flow-model';
import type { CalendarCloses } from './calendar-presentation';

// Use completed daily bars, with the same 16:00 KST cutoff as index settlement.
export async function readCalendarCloses(month: string, holidays: string[], now = new Date(), query = kisTerminal) {
  const clock = kstParts(now);
  const latest = clock.time >= '16:00' ? clock.date : moveDate(clock.date, -1);
  const end = monthEnd(month) < latest ? monthEnd(month) : latest;
  const start = month + '-01';
  const closes: CalendarCloses = {};
  const missing: Market[] = [];
  if (end < start) return { closes, missing };

  const markets = ['kospi', 'kosdaq'] as const;
  const results = await Promise.allSettled(markets.map(market => query(
    '/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice', 'FHKUP03500100',
    {
      FID_COND_MRKT_DIV_CODE: 'U', FID_INPUT_ISCD: market === 'kospi' ? '0001' : '1001',
      FID_INPUT_DATE_1: moveDate(start, -20).replaceAll('-', ''), FID_INPUT_DATE_2: end.replaceAll('-', ''),
      FID_PERIOD_DIV_CODE: 'D',
    }, end === clock.date ? 60_000 : 3_600_000
  )));
  for (const [i, result] of results.entries()) {
    const market = markets[i];
    if (result.status === 'rejected') { missing.push(market); continue; }
    const dated = new Map<string, number | null>();
    for (const row of outputRows(result.value.output2)) {
      const date = stockDate(row.stck_bsop_date);
      if (!date || date > end || marketClosedReason(date, holidays)) continue;
      const price = stockNumber(row.bstp_nmix_prpr);
      dated.set(date, price !== null && price > 0 ? price : null);
    }
    for (const date of [...dated.keys()].sort()) {
      const price = dated.get(date) ?? null;
      if (date >= start && price !== null) {
        let previousDate = moveDate(date, -1);
        while (marketClosedReason(previousDate, holidays)) previousDate = moveDate(previousDate, -1);
        const previous = dated.get(previousDate);
        (closes[date] ??= {})[market] = {
          price, changePct: previous == null ? null : (price - previous) / previous * 100
        };
      }
    }
  }
  return { closes, missing };
}
