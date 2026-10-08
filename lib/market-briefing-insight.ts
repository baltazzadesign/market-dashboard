import { formatNumber as fmt, minuteLabel } from './balta-model';
import type { BriefingPoint } from './market-briefing';

export type BriefingInsight = {
  headline: string;
  explanation: { title: string; text: string }[];
  recent: { label: string; value: string; note: string }[];
  window: string;
  outlook: {
    state: 'up' | 'down' | 'mixed' | 'wait'; label: string; text: string; horizon: string;
    scenarios: { title: string; text: string }[];
  };
  limitations: string[];
};
export const BRIEFING_RULES = [
  '최근 최대 30분 중 20분 이상·6개 이상 기록을 비교합니다. 기록 간 공백은 10분 이하여야 합니다.',
  '상방: 두 지수 모두 구간 +0.10% 이상, 상승 비율 55% 이상·구간 +1%p 이상, 외국인·기관 합산 누적 수급 변화 +100억원 이상.',
  '하방: 두 지수 모두 구간 −0.10% 이하, 상승 비율 45% 이하·구간 −1%p 이하, 외국인·기관 합산 누적 수급 변화 −100억원 이하.',
  '세 조건이 모두 일치할 때만 방향 우세를 표시합니다. 조건이 엇갈리면 혼조입니다. 시장폭 집계 종목 수가 구간 내 5% 넘게 변하면 판단을 보류합니다.',
  '정상 출처의 지수·수급·시장폭이 부족하거나 장중 기록이 5분 이상 지연되면 방향 판단을 보류합니다. 종가 이후와 과거 날짜는 해당 시점의 기록 해석입니다.',
  '초기 규칙에 따른 조건부 해석입니다. 검증된 상승·하락 확률이나 다음 거래일 예측은 아닙니다.',
];
const known = (v: number | null): v is number => v !== null && Number.isFinite(v);
const net = (p: BriefingPoint) => known(p.foreign) && known(p.institution) ? p.foreign + p.institution : null;
const flow = (v: number) => v === 0 ? '순매수·순매도 균형' : `${fmt(Math.abs(v))}억원 순${v > 0 ? '매수' : '매도'}`;
const priceChange = (a: number | null, b: number | null) => known(a) && known(b) && a > 0 && b > 0 ? (b / a - 1) * 100 : null;

/** Interpret only the supplied, already source-checked points up to their last timestamp. */
export function interpretBriefing(points: BriefingPoint[], options: { blocked?: string; historical?: boolean } = {}): BriefingInsight | null {
  const unique = new Map(points.map(p => [p.minute, p]));
  const sorted = [...unique.values()].sort((a, b) => a.minute - b.minute), last = sorted.at(-1);
  if (!last) return null;
  const recent = sorted.filter(p => p.minute >= last.minute - 30), first = recent[0];
  const span = last.minute - first.minute, b = last.breadth, combined = net(last);
  const kp = last.kospi.change, kd = last.kosdaq.change;
  const bothDown = known(kp) && known(kd) && kp < 0 && kd < 0;
  const bothUp = known(kp) && known(kd) && kp > 0 && kd > 0;
  const explanation: BriefingInsight['explanation'] = [];
  if (known(kp) && known(kd)) {
    explanation.push({ title: '지수의 의미', text: `전일 대비 코스피 ${fmt(kp, 2, true)}%, 코스닥 ${fmt(kd, 2, true)}%입니다. ${bothDown ? '두 시장이 함께 하락하고 있어, 반등 판단에는 최근 구간의 회복 여부를 추가로 확인해야 합니다.' : bothUp ? '두 시장이 함께 상승하고 있습니다. 이 상승이 여러 종목으로 확산되는지 시장폭을 함께 봅니다.' : '두 시장의 방향이 뚜렷하게 일치하지 않습니다. 한 지수의 움직임을 시장 전체의 방향으로 확대하지 않습니다.'}` });
  } else {
    explanation.push({ title: '지수의 의미', text: '확인된 지수 수준과 구간 변화를 사용합니다. 전일 대비 등락률이 없는 자료에서 당일 상승·하락을 추정하지 않습니다.' });
  }
  if (b) {
    const interpretation = b.down > b.up
      ? bothUp ? '지수는 오르지만 하락 종목이 더 많아, 상승의 확산이 제한된 모습입니다.' : '조회된 종목에서는 하락이 우세합니다. 일부 강한 종목만으로 시장 전반의 회복을 판단하기 어렵습니다.'
      : b.up > b.down ? bothDown ? '지수는 약하지만 상승 종목이 더 많아, 지수와 종목들의 체감 흐름이 엇갈립니다.' : '상승 종목이 더 많아, 조회된 종목 전반의 참여가 상승 쪽에 기울어 있습니다.'
      : '상승·하락 종목 수가 같아 시장폭만으로는 우세 방향을 가르기 어렵습니다.';
    explanation.push({ title: '상승·하락의 확산', text: `상승 ${fmt(b.up)}개, 하락 ${fmt(b.down)}개이며 상승 비율은 ${fmt(b.share, 1)}%입니다. ${interpretation}` });
  } else explanation.push({ title: '상승·하락의 확산', text: '최신 시장폭의 정상 출처가 확인되지 않아 상승·하락의 확산을 설명할 수 없습니다.' });
  if (combined !== null) {
    const sameSell = last.foreign! < 0 && last.institution! < 0, sameBuy = last.foreign! > 0 && last.institution! > 0;
    const individual = known(last.individual) && last.individual > 0 && combined < 0 ? ' 개인은 순매수하고 있지만, 이것만으로 반등의 지속성을 확인하기는 어렵습니다.' : '';
    explanation.push({ title: '누가 받치고 있나', text: `당일 누적 외국인 ${flow(last.foreign!)}, 기관 ${flow(last.institution!)}입니다. ${sameSell ? '두 주체 모두 매도 우위여서 수급상 부담이 함께 나타납니다.' : sameBuy ? '두 주체 모두 매수 우위로, 지수를 뒷받침하는 수급인지 최근 흐름을 확인합니다.' : '두 주체의 합계와 개별 방향을 구분해야 합니다. 합산 순매수가 두 주체의 동반 매수를 뜻하지는 않습니다.'}${individual}` });
  } else explanation.push({ title: '누가 받치고 있나', text: '외국인·기관의 정상 수급이 모두 확인되지 않아 두 주체의 합산 수급 판단을 보류합니다.' });

  const issues: string[] = [];
  if (span < 20 || recent.length < 6) issues.push('최근 20분 이상·6개 이상의 비교 기록이 필요합니다.');
  if (recent.some((p, i) => i > 0 && p.minute - recent[i - 1].minute > 10)) issues.push('비교 구간에 10분이 넘는 기록 공백이 있습니다.');
  const indexComplete = recent.every(p => p.kospi.verified === true && p.kosdaq.verified === true && known(p.kospi.price) && p.kospi.price > 0 && known(p.kosdaq.price) && p.kosdaq.price > 0);
  const flowComplete = recent.every(p => net(p) !== null);
  const breadthComplete = recent.every(p => p.breadth !== null && p.breadth.total > 0);
  const comparable = breadthComplete && recent.every(p => Math.abs(p.breadth!.total / first.breadth!.total - 1) <= .05 + 1e-9);
  if (!indexComplete || !flowComplete || !breadthComplete) issues.push('비교 구간의 지수·외국인/기관 수급·시장폭 중 정상 값이 부족합니다.');
  if (breadthComplete && !comparable) issues.push('시장폭 집계 종목 수가 5% 넘게 달라져 상승 비율을 직접 비교하지 않습니다.');
  if (options.blocked) issues.push(options.blocked);
  if (last.minute >= 930) issues.push('정규장 마감 기록입니다. 장중 방향 전망은 종료하며 다음 거래일로 연장하지 않습니다.');

  const cpi = indexComplete && span > 0 ? priceChange(first.kospi.price, last.kospi.price) : null;
  const cdaq = indexComplete && span > 0 ? priceChange(first.kosdaq.price, last.kosdaq.price) : null;
  const cash = flowComplete && span > 0 ? combined! - net(first)! : null;
  const breadthDelta = comparable && span > 0 ? b!.share - first.breadth!.share : null;
  const window = `${first.time}–${last.time} · ${span}분 · ${recent.length}개 기록`;
  const changes: BriefingInsight['recent'] = [
    { label: '코스피 구간 변화', value: cpi === null ? '—' : `${fmt(cpi, 2, true)}%`, note: '구간 첫 기록 대비' },
    { label: '코스닥 구간 변화', value: cdaq === null ? '—' : `${fmt(cdaq, 2, true)}%`, note: '구간 첫 기록 대비' },
    { label: '상승 비율 변화', value: breadthDelta === null ? '—' : `${fmt(breadthDelta, 1, true)}%p`, note: comparable ? '동일 범위 집계 여부 점검' : '집계 범위·정상 값 확인 필요' },
    { label: '외국인·기관 구간 수급', value: cash === null ? '—' : `${fmt(cash, 0, true)}억원`, note: '누적 수급의 끝 값 − 시작 값' },
  ];
  if (cash !== null && span > 0) {
    let text = `${first.time}부터 ${last.time}까지 외국인·기관 합산 누적 수급 변화는 ${flow(cash)}입니다.`;
    if (cash > 0 && combined! < 0) text += ' 당일 누적은 아직 순매도지만, 이 구간에서는 순매수해 누적 매도분을 줄였습니다. 당일 약세와 최근 회복을 구분해 볼 필요가 있습니다.';
    else if (cash < 0 && combined! > 0) text += ' 당일 누적은 순매수지만, 최근 구간에서는 순매도로 바뀌어 앞선 매수분을 줄였습니다.';
    else if (cash < 0) text += ' 최근 구간에서도 매도분이 추가됐습니다. 단순히 누적 순매도라는 사실보다 최근에도 매도가 이어지는지가 중요합니다.';
    else if (cash > 0) text += ' 최근 구간에서도 매수분이 추가됐습니다. 지수와 상승 종목 비율이 함께 개선되는지 확인합니다.';
    else text += ' 합산 수급의 추가 변화는 확인되지 않습니다.';
    explanation.push({ title: '최근 달라진 점', text });
  }
  const up = !issues.length && cpi! >= .1 - 1e-9 && cdaq! >= .1 - 1e-9 && b!.share >= 55 && breadthDelta! >= 1 - 1e-9 && cash! >= 100;
  const down = !issues.length && cpi! <= -.1 + 1e-9 && cdaq! <= -.1 + 1e-9 && b!.share <= 45 && breadthDelta! <= -1 + 1e-9 && cash! <= -100;
  const state = issues.length ? 'wait' : up ? 'up' : down ? 'down' : 'mixed';
  const label = state === 'wait' ? '판단 보류' : state === 'up' ? '상방 우세' : state === 'down' ? '하방 우세' : '혼조 · 방향 탐색';
  const text = state === 'wait' ? issues.join(' ')
    : up ? '최근 구간의 지수 상승·시장폭 개선·합산 순매수가 함께 확인됐습니다. 세 조건이 유지되는 동안은 상승 흐름의 연장 시나리오에 무게를 둡니다.'
    : down ? '최근 구간의 지수 하락·시장폭 악화·합산 순매도가 함께 확인됐습니다. 세 조건이 유지되는 동안은 하락 압력 지속 시나리오에 무게를 둡니다.'
    : '지수·시장폭·최근 수급이 같은 방향의 기준을 모두 충족하지 않았습니다. 당일 누적 수치만으로 다음 움직임을 단정하기보다 회복·악화 조건을 나눠 확인합니다.';
  const levels = (key: 'kospi' | 'kosdaq', high: boolean) => fmt((high ? Math.max : Math.min)(...recent.map(p => p[key].price!)), 2);
  const scenarios = issues.length ? [] : [
    { title: '회복·상승 확인', text: `두 지수가 구간 관측 고점(코스피 ${levels('kospi', true)}pt · 코스닥 ${levels('kosdaq', true)}pt)을 넘어 유지하고, 상승 비율과 최근 합산 수급도 함께 개선되면 상승 시나리오를 다시 확인합니다. 지수만 오르면 확인이 덜 된 반등입니다.` },
    { title: '약화·하락 확인', text: `두 지수가 구간 관측 저점(코스피 ${levels('kospi', false)}pt · 코스닥 ${levels('kosdaq', false)}pt)을 밑돌고, 상승 비율 하락과 최근 합산 순매도가 함께 이어지면 하락 시나리오를 다시 확인합니다.` },
    { title: '판단을 바꾸는 조건', text: up ? '세 가지 상방 기준 중 하나라도 이탈하면 상방 우세 판단을 보류합니다. 특히 최근 수급의 순매도 전환이나 상승 비율 약화를 확인하며, 고점 돌파 하나로 판단을 유지하지 않습니다.' : down ? '세 가지 하방 기준 중 하나라도 이탈하면 하방 우세 판단을 보류합니다. 특히 최근 수급의 순매수 전환이나 상승 비율 회복을 확인하며, 누적 순매도가 남았다는 이유만으로 약세 판단을 유지하지 않습니다.' : '지수·시장폭·최근 수급의 세 조건이 같은 방향의 기준을 모두 충족하면 혼조 판단을 바꿉니다. 일부 조건만 맞으면 방향 탐색을 유지합니다.' },
  ];
  const headline = bothDown && up ? '당일 지수 약세 속 최근 구간은 회복 신호'
    : bothUp && down ? '당일 지수 강세 속 최근 흐름은 약화'
    : bothDown && b && b.down > b.up && combined !== null && combined < 0 ? '지수·시장폭·누적 수급에 함께 나타난 약세'
    : bothUp && b && b.up > b.down && combined !== null && combined > 0 ? '지수 상승에 종목 확산과 매수 수급이 동행'
    : '지수와 시장 내부를 나눠 읽어야 하는 구간';
  return { headline, explanation, recent: changes, window, outlook: { state, label, text,
    horizon: last.minute >= 930 ? '마감 기록 해석 · 다음 거래일 전망 없음' : `${options.historical ? '해당 시점 기준 · 현재 전망 아님 · ' : ''}${last.time}–${minuteLabel(Math.min(930, last.minute + 30))} 정규장 조건부 전망`, scenarios },
    limitations: ['누적 수급의 차이는 구간 순매수·순매도를 뜻하며, 별도의 매수·매도 거래량이나 속도 가속도를 뜻하지 않습니다.', '관측 고점·저점은 저장된 지수 기록의 최댓값·최솟값으로, 거래소의 실제 구간 고가·저가와 다를 수 있습니다.', BRIEFING_RULES.at(-1)!] };
}
