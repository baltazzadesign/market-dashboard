// Read-only API probe. User enters the current code locally; it is never printed.
import readline from 'node:readline';
import { existsSync } from 'node:fs';
// Load only this app's optional environment file, never the parent backend file.
if (existsSync('.env') && process.loadEnvFile) process.loadEnvFile('.env');
const origin = new URL(process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.baltatool.com').origin;
if (!origin.startsWith('https://')) throw new Error('운영 연결 확인은 HTTPS 주소를 사용하세요.');
function secretPrompt() {
  if (!process.stdin.isTTY) throw new Error('터미널에서 npm run check:api를 실행하세요.');
  process.stdout.write('현재 웹 접근 코드 입력 (화면에 표시하지 않음): ');
  readline.emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let code = '';
    const onKey = (text, key) => {
      const stop = () => { process.stdin.off('keypress', onKey); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); };
      if (key?.ctrl && key.name === 'c') { stop(); reject(new Error('취소했습니다.')); }
      else if (key?.name === 'return') { stop(); resolve(code); }
      else if (key?.name === 'backspace') code = code.slice(0, -1);
      else if (text && !key?.ctrl && !/[\r\n]/.test(text)) code += text;
    };
    process.stdin.on('keypress', onKey);
  });
}
async function main() {
  let code = await secretPrompt();
  const login = await fetch(origin + '/api/auth/login', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ code }) });
  if (!login.ok || (await login.json()).ok !== true) throw new Error('로그인 실패: ' + login.status);
  const issued = login.headers.get('set-cookie')?.match(/(?:^|,\s*)access=([^;\r\n]*)/)?.[1];
  const cookie = 'access=' + (issued ?? encodeURIComponent(code)); code = '';
  const date = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  for (const [name, route, field] of [
    ['daily', '/api/market/daily?date=' + date, 'rows'],
    ['history', '/api/market/history?month=' + date.slice(0, 7) + '&months=3', 'days'],
    ['sectors', '/api/market/sectors?date=' + date, 'snapshot'],
  ]) {
    const response = await fetch(origin + route, { redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { Cookie: cookie, Accept: 'application/json' } });
    const raw = await response.json().catch(() => null);
    console.log(`${name}: HTTP ${response.status}, ${field} ${raw && field in raw ? '확인' : '없음'}`);
    if (!response.ok || !raw || !(field in raw)) process.exitCode = 1;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
