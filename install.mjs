import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Run from the existing baltatool project root. No dependencies are installed.
const bundle = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || process.cwd());
const candidates = ['components/dashboard/Workspace.tsx', 'src/components/dashboard/Workspace.tsx']
  .map(p => path.join(root, p)).filter(p => fs.existsSync(p));
const fail = message => { console.error(message); process.exit(1); };
if (candidates.length !== 1) fail('Workspace.tsx를 한 곳으로 확인하지 못했습니다. 발타툴 프로젝트 최상위 폴더에서 실행해 주세요. 파일은 변경하지 않았습니다.');
const target = candidates[0];
const before = fs.readFileSync(target, 'utf8');
const marker = '<div className="topbar-meta">';
const signature = 'data-baltagyeong-link="true"';
const existing = before.split(signature).length - 1;
if (existing > 1) fail('발타경 버튼이 중복되어 있습니다. 현재 헤더를 확인해 주세요. 파일은 변경하지 않았습니다.');
if (!existing && before.split(marker).length !== 2) fail('현재 헤더 구조가 확인한 버전과 다릅니다. 최신 Workspace.tsx를 보내주시면 맞춰드릴 수 있습니다. 파일은 변경하지 않았습니다.');
const source = path.join(bundle, 'public', 'baltagyeong.html');
if (!fs.existsSync(source)) fail('동봉된 public/baltagyeong.html이 없습니다. 압축을 모두 풀어 주세요.');
const payload = fs.readFileSync(source);
if (!payload.toString('utf8').includes('id="chapter-30"')) fail('읽기 화면 파일이 완전하지 않습니다. 파일은 변경하지 않았습니다.');
const link = '<a href="/baltagyeong.html" className="button ghost" data-baltagyeong-link="true" title="발타경 읽기" aria-label="발타경 읽기" style={{display:"inline-flex",alignItems:"center",gap:7,color:"#d2b584",whiteSpace:"nowrap",flexShrink:0}}><svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5.5C9 3.8 5.5 3.5 2.5 4.5v15c3-1 6.5-.7 9.5 1 3-1.7 6.5-2 9.5-1v-15c-3-1-6.5-.7-9.5 1Z"/><path d="M12 5.5v15M6 8h2.5M6 11h2.5M15.5 8H18M15.5 11H18"/></svg><span>발타경</span></a>';
const after = existing ? before : before.replace(marker, marker + link);
const destination = path.join(root, 'public', 'baltagyeong.html');
if (after === before && fs.existsSync(destination) && fs.readFileSync(destination).equals(payload)) {
  console.log('이미 같은 버전의 발타경이 적용되어 있습니다.'); process.exit(0);
}
const backup = fs.mkdtempSync(path.join(root, '.baltagyeong-backup-'));
fs.copyFileSync(target, path.join(backup, 'Workspace.tsx'));
if (fs.existsSync(destination)) fs.copyFileSync(destination, path.join(backup, 'baltagyeong.html'));
fs.writeFileSync(path.join(backup, 'restore-info.json'), JSON.stringify({ workspace: path.relative(root, target), reader: 'public/baltagyeong.html', hadReader: fs.existsSync(destination) }, null, 2));
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, payload);
fs.writeFileSync(target, after);
console.log('발타경 책 아이콘과 읽기 화면을 적용했습니다.');
console.log('변경 파일: ' + path.relative(root, target) + ', public/baltagyeong.html');
console.log('백업: ' + path.basename(backup));
console.log('실행 중인 발타툴에서 우측 상단 발타경 버튼을 확인한 후 평소 방식으로 커밋·배포해 주세요.');
