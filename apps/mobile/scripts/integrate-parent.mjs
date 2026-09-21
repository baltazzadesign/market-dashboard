import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse, modify, applyEdits } from 'jsonc-parser';

export function excludeMobile(text, relative = 'apps/mobile') {
  const errors = [], config = parse(text, errors, { allowTrailingComma: true });
  if (errors.length || !config || typeof config !== 'object') throw new Error('tsconfig.json 구문을 먼저 확인해 주세요.');
  if (config.exclude !== undefined && !Array.isArray(config.exclude)) throw new Error('기존 exclude 형식을 확인해 주세요.');
  const values = config.exclude ?? ['node_modules', 'bower_components', 'jspm_packages'];
  if (values.includes(relative) || values.includes(relative + '/**')) return text;
  return applyEdits(text, modify(text, ['exclude'], [...values, relative], { formattingOptions: { insertSpaces: true, tabSize: 2, eol: text.includes('\r\n') ? '\r\n' : '\n' } }));
}
async function main() {
  const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const parentRoot = path.resolve(mobileRoot, '../..');
  let pkg;
  try { pkg = JSON.parse(await readFile(path.join(parentRoot, 'package.json'), 'utf8')); }
  catch { console.log('상위 Next.js 프로젝트가 없습니다. 독립 실행이 가능합니다. 기존 프로젝트에 apps/mobile을 넣은 뒤 다시 실행하세요.'); return; }
  if (!pkg.dependencies?.next && !pkg.devDependencies?.next) throw new Error('상위 폴더가 Next.js 프로젝트가 아닙니다. apps/mobile 위치를 확인해 주세요.');
  const configPath = path.join(parentRoot, 'tsconfig.json'), before = await readFile(configPath, 'utf8');
  const after = excludeMobile(before);
  if (before === after) { console.log('기존 웹 TypeScript 검사에서 apps/mobile이 이미 분리되어 있습니다.'); return; }
  const backup = path.join(mobileRoot, '.integration'); await mkdir(backup, { recursive: true });
  await writeFile(path.join(backup, 'tsconfig-before-' + Date.now() + '.txt'), before, { flag: 'wx' });
  await writeFile(configPath, after);
  console.log('tsconfig.json의 기존 exclude에 apps/mobile을 추가했습니다. 웹 코드, package.json, API, DB, cron은 변경하지 않았습니다.');
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main().catch(error => { console.error(error.message); process.exitCode = 1; });
