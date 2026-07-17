#!/usr/bin/env node
// run-injections.mjs — 第一阶段故障注入四组（设计 v3.1 §11）：完整性 / 事务 / 防假绿 / 生命周期
// 在临时 git 仓库中全自动执行；任何一项失败 exit 1。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SPEC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'spec.mjs');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'mas-inject-'));
process.chdir(T);
const run = (args, opts = {}) => spawnSync('node', [SPEC, ...args], { encoding: 'utf8', cwd: T, ...opts });
const git = (args) => execFileSync('git', args, { cwd: T, encoding: 'utf8' });

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

git(['init', '-q', '.']); git(['config', 'user.email', 't@t']); git(['config', 'user.name', 't']);
fs.writeFileSync('req.md', '需求正文 v1\n');
git(['add', 'req.md']); git(['commit', '-q', '-m', 'init']);

// ── 建档
let r = run(['new', 'spec.html', '--id', 'FEAT-inj', '--title', '注入演练']);
ok('new 创建', r.status === 0, r.stderr.trim());
r = run(['validate', 'spec.html']);
ok('T1 new 后 validate 0 error', r.status === 0);
r = run(['validate', 'spec.html', '--against-git']);
ok('T2 无锚 → GIT-02 info 且 0 error', r.status === 0 && r.stdout.includes('GIT-02'));

const payload = {
  contract: {
    meta: { id: 'FEAT-inj', title: '注入演练' },
    sources: [{ id: 'SRC-req', kind: 'doc', locator: 'req.md', version: '1', role: '目标' }],
    flows: [
      { id: 'FLOW-core', title: '核心流', priority: 'core', risk: 'low', core: true, alignStatus: 'aligned', stateRefs: ['ST-x'] },
      { id: 'FLOW-side', title: '旁流(反假绿靶)', priority: 'low', risk: 'low', core: false, alignStatus: 'aligned', stateRefs: ['ST-y'] },
    ],
    states: [
      { id: 'ST-x', flowRef: 'FLOW-core', name: '核心屏', uiTemplateRef: 'ui-ST-x', figmaNote: '文字屏', entry: 'default', terminal: true },
      { id: 'ST-y', flowRef: 'FLOW-side', name: '旁屏', uiTemplateRef: 'ui-ST-y', figmaNote: '文字屏', entry: 'default', terminal: true },
    ],
    transitions: [],
    requirements: [{ id: 'REQ-1', text: '核心行为', kind: 'behavior', sourceRefs: ['SRC-req'], scenarioRefs: ['SCN-1'], waiver: null }],
    scenarios: [
      { id: 'SCN-1', flowRef: 'FLOW-core', given: ['g'], when: '核心动作', then: ['t'], examples: [], verification: { kind: 'assert', assertion: { type: 'junit', rule: 'all-passed' }, evidencePolicy: { kind: 'junit-xml', path: 'build/tr/*.xml' }, command: null, commandHash: null, commandConfirmedAt: null } },
      { id: 'SCN-2', flowRef: 'FLOW-side', given: ['g'], when: '零测试假绿', then: ['t'], examples: [], verification: { kind: 'assert', assertion: { type: 'junit', rule: 'all-passed' }, evidencePolicy: { kind: 'junit-xml', path: 'build/none/*.xml' }, command: null, commandHash: null, commandConfirmedAt: null } },
      { id: 'SCN-3', flowRef: 'FLOW-side', given: ['g'], when: 'db 真值', then: ['t'], examples: [], verification: { kind: 'db', assertion: { query: 'q', predicate: '>=1' }, evidencePolicy: { kind: 'stdout' }, command: null, commandHash: null, commandConfirmedAt: null } },
      { id: 'SCN-4', flowRef: 'FLOW-side', given: ['g'], when: 'db 假值', then: ['t'], examples: [], verification: { kind: 'db', assertion: { query: 'q', predicate: '>=1' }, evidencePolicy: { kind: 'stdout' }, command: null, commandHash: null, commandConfirmedAt: null } },
    ],
    issues: [],
  },
  templates: { 'ui-ST-x': '<div class="screen"><p>核心屏</p></div>', 'ui-ST-y': '<div class="screen"><p>旁屏</p></div>' },
};
fs.writeFileSync('payload.json', JSON.stringify(payload));
r = run(['save', 'spec.html', '--data', 'payload.json', '--expect-revision', '1']);
ok('save r1→r2', r.status === 0, r.stderr.trim());
r = run(['save', 'spec.html', '--data', 'payload.json', '--expect-revision', '1']);
ok('T3 CAS 冲突拒绝', r.status !== 0 && r.stderr.includes('CAS'));

// ── 组三：防假绿
run(['confirm-command', 'spec.html', '--scenario', 'SCN-1', '--command', `mkdir -p build/tr && printf '<testsuite tests="2" failures="0" errors="0"></testsuite>' > build/tr/TEST-demo.xml`]);
r = run(['record-run', 'spec.html', '--scenario', 'SCN-1']);
ok('T4 真 junit → passed(testCount=2)', r.status === 0 && r.stdout.includes('passed') && r.stdout.includes('tests=2'), r.stdout.trim() || r.stderr.trim());
run(['confirm-command', 'spec.html', '--scenario', 'SCN-2', '--command', 'true']);
r = run(['record-run', 'spec.html', '--scenario', 'SCN-2']);
ok('T5 `true`/零测试 → 不得 passed', r.status === 0 && !r.stdout.includes('SCN-2 推导状态=passed') && r.stdout.includes('failed'), r.stdout.trim());
run(['confirm-command', 'spec.html', '--scenario', 'SCN-3', '--command', 'echo 3']);
r = run(['record-run', 'spec.html', '--scenario', 'SCN-3']);
ok('T6a db 缺设备上下文 → 拒绝', r.status !== 0 && r.stderr.includes('LED-01'), r.stderr.trim());
r = run(['record-run', 'spec.html', '--scenario', 'SCN-3', '--build-variant', 'devDebug', '--device-package', 'com.x', '--device-serial', 'SER1']);
ok('T6b db echo 3 ≥1 → passed', r.status === 0 && r.stdout.includes('passed'), r.stdout.trim() || r.stderr.trim());
run(['confirm-command', 'spec.html', '--scenario', 'SCN-4', '--command', 'echo 0']);
r = run(['record-run', 'spec.html', '--scenario', 'SCN-4', '--build-variant', 'devDebug', '--device-package', 'com.x', '--device-serial', 'SER1']);
ok('T6c db echo 0 ≥1 → failed', r.status === 0 && r.stdout.includes('failed'), r.stdout.trim());
// file/grep judge-only 判定器
{
  const cur = JSON.parse(run(['extract', 'spec.html']).stdout);
  cur.contract.scenarios.push(
    { id: 'SCN-5', flowRef: 'FLOW-side', given: ['g'], when: '文件树对账', then: ['t'], examples: [], verification: { kind: 'file', assertion: { paths: ['req.md'] }, evidencePolicy: { kind: 'file' }, command: null, commandHash: null, commandConfirmedAt: null } },
    { id: 'SCN-6', flowRef: 'FLOW-side', given: ['g'], when: '配置绑定对账', then: ['t'], examples: [], verification: { kind: 'grep', assertion: { path: '*.md', pattern: '需求正文', predicate: '>=1' }, evidencePolicy: { kind: 'grep' }, command: null, commandHash: null, commandConfirmedAt: null } },
    { id: 'SCN-7', flowRef: 'FLOW-side', given: ['g'], when: '缺失文件对账', then: ['t'], examples: [], verification: { kind: 'file', assertion: { paths: ['ghost/none.xml'] }, evidencePolicy: { kind: 'file' }, command: null, commandHash: null, commandConfirmedAt: null } }
  );
  fs.writeFileSync('cur6.json', JSON.stringify({ contract: cur.contract, templates: cur.templates }));
  run(['save', 'spec.html', '--data', 'cur6.json']);
}
r = run(['record-run', 'spec.html', '--scenario', 'SCN-5']);
ok('T6d file 判定器：存在 → passed', r.status === 0 && r.stdout.includes('passed'), r.stdout.trim() || r.stderr.trim());
r = run(['record-run', 'spec.html', '--scenario', 'SCN-6']);
ok('T6e grep 判定器：命中 ≥1 → passed（只计数不落值）', r.status === 0 && r.stdout.includes('passed'), r.stdout.trim() || r.stderr.trim());
r = run(['record-run', 'spec.html', '--scenario', 'SCN-7']);
ok('T6f file 判定器：缺失 → failed', r.status === 0 && r.stdout.includes('failed'), r.stdout.trim() || r.stderr.trim());
// 伪造证据：篡改 junit 证据文件 → --strict 必报 ALG-04
const xml = 'build/tr/TEST-demo.xml';
const orig = fs.readFileSync(xml, 'utf8');
fs.writeFileSync(xml, orig + '<!-- tampered -->');
r = run(['validate', 'spec.html', '--strict']);
ok('T7 篡改证据文件 → --strict 报 ALG-04', r.status !== 0 && r.stdout.includes('ALG-04'), (r.stdout.match(/ALG-04[^\n]*/) || [])[0]);
fs.writeFileSync(xml, orig);

// ── 改 Then → 旧 run historical（extract→只改 then，保留冻结命令）
{
  const cur8 = JSON.parse(run(['extract', 'spec.html']).stdout);
  cur8.contract.scenarios.find((s) => s.id === 'SCN-1').then = ['t 改了'];
  fs.writeFileSync('payload2.json', JSON.stringify({ contract: cur8.contract, templates: cur8.templates }));
}
run(['save', 'spec.html', '--data', 'payload2.json']);
r = run(['status', 'spec.html']);
ok('T8 改 Then 后 SCN-1 旧 run 失效 → not-run', r.stdout.includes('SCN-1: not-run'), (r.stdout.match(/SCN-1[^\n]*/) || [])[0]);

// ── 组一：完整性（gate / 回放 / 带外 / recovery）
r = run(['save', 'spec.html', '--data', 'payload2.json', '--gate', 'G1']);
ok('gate G1 提交', r.status === 0 && r.stdout.includes('gate commit'), r.stderr.trim());
run(['save', 'spec.html', '--data', 'payload2.json']);
r = run(['save', 'spec.html', '--data', 'payload2.json', '--gate', 'G2']);
ok('gate G2 提交', r.status === 0);
const g1 = git(['log', '--format=%H %s']).split('\n').find((l) => l.includes('gate G1')).split(' ')[0];
fs.writeFileSync('spec.html', git(['show', `${g1}:spec.html`]));
r = run(['validate', 'spec.html', '--against-git']);
ok('T9 回放低于 gate 的版本 → GIT-01', r.status !== 0 && r.stdout.includes('GIT-01'), (r.stdout.match(/GIT-01[^\n]*/) || [])[0]);
r = run(['recovery', 'spec.html', '--reason', '注入演练恢复']);
ok('T10 recovery 从 gate 基线恢复', r.status === 0 && run(['validate', 'spec.html', '--against-git']).status === 0, r.stderr.trim());
execSync(`perl -pi -e 's/注入演练/被篡改/ if /"title"/' spec.html`, { cwd: T });
r = run(['validate', 'spec.html']);
ok('T11 绕过 save 手改合同 → ENV-01', r.status !== 0 && r.stdout.includes('ENV-01'));
run(['recovery', 'spec.html', '--reason', '手改后恢复']);

// ── 组四：生命周期（来源门 / acceptance / retemplate / resume）
// 恢复原 SCN-1：extract→只改 then→save（保住已冻结的 verification.command；整包覆盖会清掉冻结命令，旧 run 理应失效）
{
  const cur = JSON.parse(run(['extract', 'spec.html']).stdout);
  cur.contract.scenarios.find((s) => s.id === 'SCN-1').then = ['t'];
  fs.writeFileSync('cur.json', JSON.stringify({ contract: cur.contract, templates: cur.templates }));
}
r = run(['save', 'spec.html', '--data', 'cur.json']);
ok('回滚 Then 修改（fingerprint 复原、冻结命令保留）', r.status === 0, r.stderr.trim());
r = run(['status', 'spec.html']);
ok('T12a fingerprint 复原后 SCN-1 恢复 passed', r.stdout.includes('SCN-1: passed'), (r.stdout.match(/SCN-1[^\n]*/) || [])[0]);
r = run(['accept', 'spec.html', '--verbatim', '接受']);
ok('T12b 未 refresh 即 accept → 拒绝', r.status !== 0, r.stderr.trim().split('\n')[0]);
run(['refresh-sources', 'spec.html']);
r = run(['accept', 'spec.html', '--verbatim', '验收通过，接受']);
ok('T12c refresh 后 accept 成功', r.status === 0, r.stderr.trim().split('\n')[0]);
r = run(['status', 'spec.html']);
ok('T12d specAcceptance=accepted', r.stdout.includes('specAcceptance=accepted'), (r.stdout.match(/五元组[^\n]*/) || [])[0]);
// 来源漂移：改 req.md → refresh → changed 未裁决 → 新 accept 必须被挡
fs.writeFileSync('req.md', '需求正文 v2（改了）\n');
r = run(['refresh-sources', 'spec.html']);
ok('T13a 来源变更 → observation=changed', r.stdout.includes('changed'), r.stdout.trim().split('\n').pop());
r = run(['accept', 'spec.html', '--verbatim', '再接受']);
ok('T13b changed 未裁决 → accept 拒绝(ACC-02)', r.status !== 0 && r.stderr.includes('ACC-02'), (r.stderr.match(/ACC-02[^\n]*/) || [])[0]);
// retemplate 零丢失
const before = run(['extract', 'spec.html']).stdout;
r = run(['save', 'spec.html', '--retemplate']);
const after = run(['extract', 'spec.html']).stdout;
const norm = (s) => { const j = JSON.parse(s); return JSON.stringify({ c: j.contract, l: { ...j.ledger, changelog: null } }); };
ok('T14 retemplate 后合同/ledger 零丢失', r.status === 0 && norm(before) === norm(after));
r = run(['validate', 'spec.html']);
ok('T14b retemplate 后 validate 0 error（CSP/engine hash 联动）', r.status === 0);
// 重复数据块
const html = fs.readFileSync('spec.html', 'utf8');
const stampBlock = html.match(/<script type="application\/json" id="mini-app-stamp">[\s\S]*?<\/script>/)[0];
fs.writeFileSync('dup.html', html.replace('</body>', stampBlock + '\n</body>'));
r = run(['validate', 'dup.html']);
ok('T15 重复数据块 → 拒绝解析', r.status !== 0 && (r.stderr + r.stdout).includes('STR-05'));
// 活锁拒绝 + resume
fs.writeFileSync('spec.html.lock', JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
r = run(['save', 'spec.html', '--data', 'payload.json']);
ok('T16 活锁 → save 拒绝', r.status !== 0 && r.stderr.includes('并发冲突'));
fs.unlinkSync('spec.html.lock');
const t0 = Date.now();
r = run(['status', 'spec.html']);
ok('T17 resume：status 一条命令出恢复简报', r.status === 0 && r.stdout.includes('五元组') && r.stdout.includes('progress'), `${Date.now() - t0}ms`);

// ── 第五组：review 评审会话（零改写转发 / 提交落盘唤醒 / merge 闭环）
{
  const mod = await import(pathToFileURL(SPEC).href);
  const s = await mod.startReviewServer(path.join(T, 'spec.html'));
  const base = `http://127.0.0.1:${s.port}`;
  const disk = fs.readFileSync(path.join(T, 'spec.html'));
  const served = Buffer.from(await (await fetch(base + '/artifact')).arrayBuffer());
  ok('T18 review /artifact 逐字节零改写', Buffer.compare(disk, served) === 0);
  const wrapperTxt = await (await fetch(base + '/')).text();
  ok('T19 wrapper 绑定 specId 暂存键', wrapperTxt.includes('mas-ann:FEAT-inj'));
  const post = await fetch(base + '/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ end: true, annotations: [{ targetId: 'SCN-1', comment: '评审意见', proposal: '建议改法' }, { targetId: '', comment: '无锚应被滤掉' }] }) });
  const sub = await s.waitForSubmission();
  ok('T20 submit 过滤无效项、落盘队列并唤醒等待者', post.ok && sub.count === 1 && sub.end === true && !!sub.feedbackPath && fs.existsSync(sub.feedbackPath));
  await s.close();
  const fb = JSON.parse(fs.readFileSync(sub.feedbackPath, 'utf8'));
  ok('T21 队列文件含 specId+revision 上下文', fb.specId === 'FEAT-inj' && typeof fb.revision === 'number' && fb.annotations[0].proposal === '建议改法');
  r = run(['merge-feedback', 'spec.html', '--data', sub.feedbackPath]);
  ok('T22 review 队列 → merge-feedback 闭环 proposed', r.status === 0 && r.stdout.includes('proposed'));
}

// ── progress：非可信块写入不动 revision/envelope
{
  const revBefore = JSON.parse(run(['extract', 'spec.html', '--out', 'x.json']).status === 0 ? fs.readFileSync('spec.html', 'utf8').match(/"revision":\s*(\d+)/)[0].split(':')[1] : '0');
  r = run(['progress', 'spec.html', '--stage', 'aligned', '--worth-it', '值·测试写入']);
  const revAfter = Number(fs.readFileSync('spec.html', 'utf8').match(/"revision":\s*(\d+)/)[0].split(':')[1]);
  const st = run(['status', 'spec.html']);
  ok('T23 progress 命令写入且 revision 不动', r.status === 0 && Number(revBefore) === revAfter && st.stdout.includes('aligned'));
  r = run(['validate', 'spec.html']);
  ok('T24 progress 写入后 envelope 校验仍 0 error', r.status === 0);
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILED'}: ${pass} 通过 / ${fail} 失败`);
console.log(`临时目录：${T}`);
process.exit(fail ? 1 : 0);
