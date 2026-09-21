// Synthetic UI fixtures. Reached only after the user selects "예시 데이터로 둘러보기".
import { kstDate, weekdaySlots, type DailyMarket, type DailyResponse, type HistoryResponse, type SectorResponse } from './model';
export function demoDaily(date: string): DailyResponse {
  return { date, rows: Array.from({ length: 67 }, (_, i) => {
    const minute = 540 + i * 5, wave = Math.sin(i * .19);
    const up = Math.round(1180 + i * 7 + wave * 85), down = 2600 - up, flat = 93;
    const score = Math.min(100, (up - down) / 20 + (up - down) / 2693 * 100);
    return { id: i, date, time: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`, minute, session: 'REGULAR',
      kospi: 2702 + i * .43 + wave * 6, kosdaq: 810 + i * .1 + wave * 1.2, up, down, flat, diff: up - down,
      flows: { foreign: Math.round(-420 + i * 44 + wave * 165), institution: Math.round(220 + i * 15 - wave * 90), individual: Math.round(180 - i * 57 - wave * 130) },
      flowSource: 'LIVE', breadthSource: 'LIVE', marketScore: score, pulse: (score + 100) / 2, createdAt: `${date}T${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00+09:00` };
  }) };
}
export function demoHistory(month: string): HistoryResponse {
  const days: DailyMarket[] = weekdaySlots(month).filter((date): date is string => date !== null && date <= kstDate()).map((date, i) => {
    const change = Math.sin(i * 1.3) * 1.5, flows = { foreign: Math.round(change * 1900), institution: Math.round(change * 870), individual: Math.round(-change * 2780) };
    return { date, time: '15:30', finalized: date < kstDate(), pulse: Math.round(50 + change * 20), up: 1450, down: 1143, flat: 100, flows,
      kospi: { price: 2700 + i * 5, changePct: change, turnover: 75000, flows }, kosdaq: { price: 800 + i * 2, changePct: change * .8, turnover: 45000, flows } };
  });
  return { month, days, closedDates: {} };
}
export function demoSectors(date: string): SectorResponse {
  return { date, time: 'KOSPI 14:30 / KOSDAQ 14:30', capturedAt: null,
    sectors: ['전기·전자', '운송장비', '금융업', '의약품', '화학', '철강·금속', 'IT 서비스', '건설업', '유통업', '통신업', '오락·문화', '기계·장비'].map((name, i) => ({ name, code: `demo-${i}`, market: i > 7 ? 'kosdaq' : 'kospi', price: 1700 + i * 120, change: +(2.82 - i * .47).toFixed(2), turnoverRaw: 200000 - i * 13000 })) };
}
