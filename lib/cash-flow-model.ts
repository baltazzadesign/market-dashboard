// Amounts are KRW. Missing values stay null; annual CFS/OFS are never mixed.
export type Basis = 'CFS' | 'OFS';
export type DartAccount = { sj_div?: string; account_id?: string; account_nm?: string; thstrm_amount?: string; currency?: string; rcept_no?: string; bsns_year?: string; reprt_code?: string };
export type Evidence = { label: string; account: string; id: string; value: number | null; method: 'id' | 'name' };
export type FinancingItem = { kind: 'CB' | 'BW' | '유상증자' | '차입'; account: string; value: number };
export type CashFlowYear = {
  year: number; basis: Basis; receipt: string | null; status: 'ok' | 'missing' | 'error';
  operating: number | null; investing: number | null; financing: number | null;
  netIncome: number | null; capex: number | null; fcf: number | null; conversion: number | null;
  fundingShare: number | null; regime: string; evidence: Evidence[]; fundingItems: FinancingItem[]; warnings: string[];
};
export type ScorePart = { label: string; points: number; max: number; detail: string };
export type CashFlowAnalysis = { score: number | null; scoreReason: string; parts: ScorePart[]; change: string; summary: string[]; risks: string[] };
export type CashFlowResponse = {
  ok: true; code: string; name: string; corpCode: string; basis: Basis; endYear: number; fetchedAt: string;
  industry: string; financial: boolean | null; fiscalMonth: string; years: CashFlowYear[];
  analysis: CashFlowAnalysis; warnings: string[];
};
export function amount(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  let raw = String(value).trim().replaceAll(',', '').replaceAll('−', '-');
  if (/^\(\d+(?:\.\d+)?\)$/.test(raw)) raw = '-' + raw.slice(1, -1);
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(raw)) return null;
  const result = Number(raw); return Number.isFinite(result) ? result : null;
}
const clean = (s: string) => s.replace(/[\s()（）\[\]·,]/g, '');
export function classify(operating: number | null, investing: number | null, financing: number | null): string {
  if ([operating, investing, financing].some(v => v === null)) return '판정 보류';
  if ([operating, investing, financing].some(v => v === 0)) return '중립·혼합형';
  const key = [operating, investing, financing].map(v => v! > 0 ? '+' : '-').join('');
  return ({'+--':'자체 현금 창출형', '+-+':'투자 확대·조달형', '++-':'투자 회수·상환형', '+++':'현금 유입 집중형', '--+':'영업 부족·투자 조달형', '---':'현금 소진형', '-+-':'투자 회수·상환 부담형', '-++':'고위험 조달형'} as Record<string,string>)[key];
}
const specs = {
  operating: { label:'영업현금흐름', id:'CashFlowsFromUsedInOperatingActivities', names:['영업활동현금흐름','영업활동으로인한현금흐름','영업활동으로부터의현금흐름','영업활동순현금흐름','영업활동으로인한순현금흐름'] },
  investing: { label:'투자현금흐름', id:'CashFlowsFromUsedInInvestingActivities', names:['투자활동현금흐름','투자활동으로인한현금흐름','투자활동으로부터의현금흐름','투자활동순현금흐름','투자활동으로인한순현금흐름'] },
  financing: { label:'재무현금흐름', id:'CashFlowsFromUsedInFinancingActivities', names:['재무활동현금흐름','재무활동으로인한현금흐름','재무활동으로부터의현금흐름','재무활동순현금흐름','재무활동으로인한순현금흐름'] },
  netIncome: { label:'순이익', id:'ProfitLoss', names:['당기순이익','당기순이익손실','당기순손익','당기순손실'] },
  ppe: { label:'유형자산 취득', id:'PaymentsToAcquirePropertyPlantAndEquipment', names:['유형자산의취득','유형자산취득','유형자산취득으로인한현금유출'] },
  intangible: { label:'무형자산 취득', id:'PaymentsToAcquireIntangibleAssets', names:['무형자산의취득','무형자산취득','무형자산취득으로인한현금유출'] },
};
export function emptyYear(year: number, basis: Basis, status: 'missing' | 'error' = 'missing'): CashFlowYear {
  return { year,basis,receipt:null,status,operating:null,investing:null,financing:null,netIncome:null,capex:null,fcf:null,conversion:null,fundingShare:null,regime:'판정 보류',evidence:[],fundingItems:[],warnings:[status === 'missing' ? '해당 연도 사업보고서 데이터가 없습니다.' : '해당 연도 조회에 실패했습니다.'] };
}
export function parseYear(input: DartAccount[], year: number, basis: Basis): CashFlowYear {
  const result = emptyYear(year, basis); result.status = 'ok'; result.warnings = [];
  const rows = input.filter(r => (!r.bsns_year || r.bsns_year === String(year)) && (!r.reprt_code || r.reprt_code === '11011'));
  result.receipt = rows.map(r => r.rcept_no ?? '').find(r => /^\d{14}$/.test(r)) ?? null;
  function pick(key: keyof typeof specs): number | null {
    const spec = specs[key], sections = key === 'netIncome' ? ['IS','CIS'] : ['CF'];
    for (const section of sections) {
      const candidates = rows.filter(r => r.sj_div === section);
      let found = candidates.filter(r => r.account_id === 'ifrs-full_' + spec.id || r.account_id === 'ifrs_' + spec.id);
      const method = found.length ? 'id' : 'name';
      if (!found.length) found = candidates.filter(r => spec.names.includes(clean(r.account_nm ?? '')));
      if (!found.length) continue;
      // Ambiguous duplicate totals must not be summed or silently selected.
      if (new Set(found.map(r => [r.currency, r.thstrm_amount].join(':'))).size > 1) {
        result.warnings.push(spec.label + ': 중복 계정의 값이 달라 제외했습니다.'); return null;
      }
      const row = found[0];
      const value = row.currency?.trim().toUpperCase() === 'KRW' ? amount(row.thstrm_amount) : null;
      if (row.currency?.trim().toUpperCase() !== 'KRW') result.warnings.push(spec.label + ': 원화 단위를 확인할 수 없어 제외했습니다.');
      result.evidence.push({label:spec.label,account:row.account_nm ?? '',id:row.account_id ?? '',value,method});
      return value;
    }
    return null;
  }
  result.operating = pick('operating'); result.investing = pick('investing'); result.financing = pick('financing'); result.netIncome = pick('netIncome');
  const ppe = pick('ppe'), intangible = pick('intangible');
  result.capex = ppe === null || intangible === null ? null : Math.abs(ppe) + Math.abs(intangible);
  result.fcf = result.operating === null || result.capex === null ? null : result.operating - result.capex;
  result.conversion = result.operating !== null && result.netIncome !== null && result.netIncome > 0 ? result.operating / result.netIncome * 100 : null;
  if (result.capex === null) result.warnings.push('유형·무형자산 취득액을 모두 확인하지 못해 잉여현금흐름은 계산하지 않았습니다.');
  if ([result.operating,result.investing,result.financing].every(v => v !== null)) {
    const denominator = Math.max(0,result.operating!) + Math.max(0,result.investing!) + Math.max(0,result.financing!);
    result.fundingShare = denominator > 0 ? Math.max(0,result.financing!) / denominator * 100 : null;
  }
  result.regime = classify(result.operating,result.investing,result.financing);
  const seen = new Set<string>();
  for (const row of rows.filter(r => r.sj_div === 'CF' && r.currency?.trim().toUpperCase() === 'KRW')) {
    const name = clean(row.account_nm ?? ''), value = amount(row.thstrm_amount);
    if (value === null || value <= 0 || /상환|감소|취득|전환권행사|신주인수권행사/.test(name)) continue;
    if (!/발행|증자|차입|증가|조달/.test(name)) continue;
    const kind: FinancingItem['kind'] | null = /전환사채/.test(name) ? 'CB' : /신주인수권부사채/.test(name) ? 'BW' : /유상증자|주식의발행|주식발행/.test(name) ? '유상증자' : /차입금/.test(name) ? '차입' : null;
    const id = name + ':' + value;
    if (kind && !seen.has(id)) { seen.add(id); result.fundingItems.push({kind,account:row.account_nm ?? name,value}); }
  }
  return result;
}
function scoreYear(current: CashFlowYear, history: CashFlowYear[]): ScorePart[] | null {
  const recent = history.filter(r => r.year <= current.year && r.year >= current.year - 2).sort((a,b) => a.year-b.year);
  if (recent.length !== 3 || recent.some((r,i) => r.year !== current.year - 2 + i || r.basis !== current.basis || r.status !== 'ok' || r.operating === null || r.fcf === null) || current.netIncome === null || current.investing === null || current.financing === null || current.fundingShare === null) return null;
  const positive = recent.filter(r => r.operating! > 0).length, fcfPositive = recent.filter(r => r.fcf! > 0).length;
  const conversion = current.conversion ?? 0;
  return [
    {label:'영업현금 지속성',points:positive * 10,max:30,detail:`최근 3년 영업현금 양수 ${positive}회`},
    {label:'잉여현금 지속성',points:fcfPositive * 10,max:30,detail:`최근 3년 잉여현금 양수 ${fcfPositive}회`},
    {label:'이익의 현금 전환',points:current.netIncome > 0 ? Math.round(Math.max(0,Math.min(1,conversion / 100)) * 20) : 0,max:20,detail:current.netIncome > 0 ? `당기 현금전환율 ${conversion.toFixed(1)}%` : '순이익 0 이하: 현금전환 항목 0점'},
    {label:'순재무 유입 비중',points:Math.round((1-current.fundingShare / 100) * 20),max:20,detail:`당기 순재무 유입 비중 ${current.fundingShare.toFixed(1)}%`},
  ];
}
export function analyze(years: CashFlowYear[], financial: boolean | null): CashFlowAnalysis {
  const sorted = [...years].sort((a,b) => a.year-b.year), latest = sorted.at(-1);
  const result: CashFlowAnalysis = {score:null,scoreReason:'최근 3년의 비교 가능한 필수 계정이 필요합니다.',parts:[],change:'비교 보류',summary:[],risks:[]};
  if (!latest) return result;
  if (financial !== false) result.scoreReason = financial ? '금융업은 일반기업 점수를 적용하지 않습니다.' : '업종을 확인하지 못해 점수를 보류합니다.';
  else {
    const parts = scoreYear(latest, sorted);
    if (parts) { result.parts = parts; result.score = parts.reduce((s,p) => s+p.points,0); result.scoreReason = '자체 규칙 기반 점수 · 수익률 예측이나 신용등급이 아닙니다.'; }
  }
  const previous = sorted.find(r => r.year === latest.year - 1);
  if (result.score !== null && previous) {
    const before = scoreYear(previous, sorted);
    if (before) { const delta = result.score - before.reduce((s,p)=>s+p.points,0); result.change = delta >= 10 ? `개선 (+${delta}점)` : delta <= -10 ? `악화 (${delta}점)` : `유지 (${delta > 0 ? '+' : ''}${delta}점)`; }
  }
  if (latest.operating !== null) result.summary.push(latest.operating > 0 ? '영업활동에서 현금이 유입됐습니다.' : latest.operating < 0 ? '영업활동에서 현금이 유출됐습니다.' : '영업현금흐름이 0입니다.');
  if (latest.fcf !== null) result.summary.push(latest.fcf > 0 ? '유형·무형자산 취득 지출을 차감한 뒤에도 현금이 남았습니다.' : latest.fcf < 0 ? '유형·무형자산 취득 지출이 영업현금흐름을 초과했습니다.' : '영업현금흐름과 유형·무형자산 취득 지출이 같습니다.');
  if (latest.operating !== null && latest.operating < 0) result.risks.push('영업현금 적자: 보유 현금과 향후 자금 조달 여력을 확인하세요.');
  if (latest.netIncome !== null && latest.netIncome > 0 && latest.conversion !== null && latest.conversion < 70) result.risks.push('흑자 대비 현금 유입이 약합니다. 매출채권·재고 증가를 확인하세요.');
  if (latest.fundingShare !== null && latest.fundingShare >= 50) result.risks.push('양수인 활동별 순현금 유입 중 재무활동 비중이 50% 이상입니다.');
  if (latest.investing !== null && latest.investing > 0) result.risks.push('투자현금 유입은 자산 매각·금융상품 회수 등 원인을 구분해야 합니다.');
  if (latest.fundingItems.length) result.risks.push('조달 관련 현금흐름 계정이 확인됐습니다. 아래 원문에서 조건과 만기를 확인하세요.');
  result.risks.push('CB·BW 계정 미검출은 미발행을 뜻하지 않습니다. 공시 결정·미상환 잔액·전환가·담보·만기는 이 화면의 점검 범위 밖입니다.');
  return result;
}
