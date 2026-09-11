import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { rankMarketClsCodeCandidates } from './kis-after-market-lib.mjs';

const dir = path.resolve(process.env.KIS_AFTER_MARKET_CAPTURE_DIR ?? '.runtime/kis-after-market-probe');
const requested = process.argv[2];

async function resolveInput() {
  if (requested) return path.resolve(requested);
  const entries = (await readdir(dir)).filter((x) => /^h0stcnt0-\d{4}-\d{2}-\d{2}\.jsonl$/.test(x)).sort();
  if (!entries.length) throw new Error(`probe 파일이 없습니다: ${dir}`);
  return path.join(dir, entries.at(-1));
}

function pct(value) { return `${(Number(value || 0) * 100).toFixed(1)}%`; }

const file = await resolveInput();
const text = await readFile(file, 'utf8');
const samples = text.split(/\r?\n/).filter(Boolean).map((line, i) => {
  try { return JSON.parse(line); }
  catch { throw new Error(`${file}:${i + 1} JSON 파싱 실패`); }
});

const before = samples.filter((x) => String(x.receivedAtKst ?? '').slice(11, 19) < '16:00:00');
const after = samples.filter((x) => String(x.receivedAtKst ?? '').slice(11, 19) >= '16:00:00');
const fieldCounts = [...new Set(samples.map((x) => x.fieldCount))].sort((a, b) => a - b);
const candidates = rankMarketClsCodeCandidates(samples);

console.log(`[probe-report] file=${file}`);
console.log(`[probe-report] samples=${samples.length} before16=${before.length} after16=${after.length} fieldCounts=${fieldCounts.join(',')}`);

if (!before.length || !after.length) {
  console.log('[probe-report] 16:00 전/후 표본이 모두 있어야 후보를 비교할 수 있습니다.');
  process.exit(0);
}
if (!candidates.length) {
  console.log('[probe-report] MARKET_CLS_CODE 후보를 찾지 못했습니다. 원본 캡처와 KIS 공식 스키마 업데이트를 확인하세요.');
  process.exit(0);
}

console.log('[probe-report] 후보 (진단용; 자동 저장 활성화 금지):');
for (const c of candidates.slice(0, 10)) {
  console.log(`  index=${c.index} score=${c.score} before=${c.before.value}(${pct(c.before.ratio)}) after=${c.after.value}(${pct(c.after.ratio)}) n=${c.beforeSamples}/${c.afterSamples}`);
}
console.log('[probe-report] 이 결과는 후보 탐색만 합니다. KIS 공식 필드 순서 확인 전 KIS_AFTER_MARKET_PERSIST=1로 변경하지 마세요.');
