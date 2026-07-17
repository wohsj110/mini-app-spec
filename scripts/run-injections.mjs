#!/usr/bin/env node
// run-injections.mjs — phase-one fault injection, four groups (design v3.1 §11): integrity / transactions / anti-fake-green / lifecycle
// Runs fully automated inside a temporary git repo; any failure exits 1.
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
fs.writeFileSync('req.md', 'Requirement body v1\n');
git(['add', 'req.md']); git(['commit', '-q', '-m', 'init']);

// ── bootstrap
let r = run(['new', 'spec.html', '--id', 'FEAT-inj', '--title', 'Injection drill']);
ok('new creates', r.status === 0, r.stderr.trim());
r = run(['validate', 'spec.html']);
ok('T1 validate after new: 0 errors', r.status === 0);
r = run(['validate', 'spec.html', '--against-git']);
ok('T2 no anchor → GIT-02 info and 0 errors', r.status === 0 && r.stdout.includes('GIT-02'));

const payload = {
  contract: {
    meta: { id: 'FEAT-inj', title: 'Injection drill' },
    sources: [{ id: 'SRC-req', kind: 'doc', locator: 'req.md', version: '1', role: 'goal' }],
    flows: [
      { id: 'FLOW-core', title: 'Core flow', priority: 'core', risk: 'low', core: true, alignStatus: 'aligned', stateRefs: ['ST-x'] },
      { id: 'FLOW-side', title: 'Side flow (anti-fake-green target)', priority: 'low', risk: 'low', core: false, alignStatus: 'aligned', stateRefs: ['ST-y'] },
    ],
    states: [
      { id: 'ST-x', flowRef: 'FLOW-core', name: 'Core screen', uiTemplateRef: 'ui-ST-x', figmaNote: 'text-only screen', entry: 'default', terminal: true },
      { id: 'ST-y', flowRef: 'FLOW-side', name: 'Side screen', uiTemplateRef: 'ui-ST-y', figmaNote: 'text-only screen', entry: 'default', terminal: true },
    ],
    transitions: [],
    requirements: [{ id: 'REQ-1', text: 'core behavior', kind: 'behavior', sourceRefs: ['SRC-req'], scenarioRefs: ['SCN-1'], waiver: null }],
    scenarios: [
      { id: 'SCN-1', flowRef: 'FLOW-core', given: ['g'], when: 'core action', then: ['t'], examples: [], verification: { kind: 'assert', assertion: { type: 'junit', rule: 'all-passed' }, evidencePolicy: { kind: 'junit-xml', path: 'build/tr/*.xml' }, command: null, commandHash: null, commandConfirmedAt: null } },
      { id: 'SCN-2', flowRef: 'FLOW-side', given: ['g'], when: 'zero-test fake green', then: ['t'], examples: [], verification: { kind: 'assert', assertion: { type: 'junit', rule: 'all-passed' }, evidencePolicy: { kind: 'junit-xml', path: 'build/none/*.xml' }, command: null, commandHash: null, commandConfirmedAt: null } },
      { id: 'SCN-3', flowRef: 'FLOW-side', given: ['g'], when: 'db true value', then: ['t'], examples: [], verification: { kind: 'db', assertion: { query: 'q', predicate: '>=1' }, evidencePolicy: { kind: 'stdout' }, command: null, commandHash: null, commandConfirmedAt: null } },
      { id: 'SCN-4', flowRef: 'FLOW-side', given: ['g'], when: 'db false value', then: ['t'], examples: [], verification: { kind: 'db', assertion: { query: 'q', predicate: '>=1' }, evidencePolicy: { kind: 'stdout' }, command: null, commandHash: null, commandConfirmedAt: null } },
    ],
    issues: [],
  },
  templates: { 'ui-ST-x': '<div class="screen"><p>Core screen</p></div>', 'ui-ST-y': '<div class="screen"><p>Side screen</p></div>' },
};
fs.writeFileSync('payload.json', JSON.stringify(payload));
r = run(['save', 'spec.html', '--data', 'payload.json', '--expect-revision', '1']);
ok('save r1→r2', r.status === 0, r.stderr.trim());
r = run(['save', 'spec.html', '--data', 'payload.json', '--expect-revision', '1']);
ok('T3 CAS conflict rejected', r.status !== 0 && r.stderr.includes('CAS'));

// ── group three: anti-fake-green
run(['confirm-command', 'spec.html', '--scenario', 'SCN-1', '--command', `mkdir -p build/tr && printf '<testsuite tests="2" failures="0" errors="0"></testsuite>' > build/tr/TEST-demo.xml`]);
r = run(['record-run', 'spec.html', '--scenario', 'SCN-1']);
ok('T4 real junit → passed(testCount=2)', r.status === 0 && r.stdout.includes('passed') && r.stdout.includes('tests=2'), r.stdout.trim() || r.stderr.trim());
run(['confirm-command', 'spec.html', '--scenario', 'SCN-2', '--command', 'true']);
r = run(['record-run', 'spec.html', '--scenario', 'SCN-2']);
ok('T5 `true`/zero tests → must not pass', r.status === 0 && !r.stdout.includes('SCN-2 derived status=passed') && r.stdout.includes('failed'), r.stdout.trim());
run(['confirm-command', 'spec.html', '--scenario', 'SCN-3', '--command', 'echo 3']);
r = run(['record-run', 'spec.html', '--scenario', 'SCN-3']);
ok('T6a db without device context → rejected', r.status !== 0 && r.stderr.includes('LED-01'), r.stderr.trim());
r = run(['record-run', 'spec.html', '--scenario', 'SCN-3', '--build-variant', 'devDebug', '--device-package', 'com.x', '--device-serial', 'SER1']);
ok('T6b db echo 3 ≥1 → passed', r.status === 0 && r.stdout.includes('passed'), r.stdout.trim() || r.stderr.trim());
run(['confirm-command', 'spec.html', '--scenario', 'SCN-4', '--command', 'echo 0']);
r = run(['record-run', 'spec.html', '--scenario', 'SCN-4', '--build-variant', 'devDebug', '--device-package', 'com.x', '--device-serial', 'SER1']);
ok('T6c db echo 0 ≥1 → failed', r.status === 0 && r.stdout.includes('failed'), r.stdout.trim());
// file/grep judge-only judges
{
  const cur = JSON.parse(run(['extract', 'spec.html']).stdout);
  cur.contract.scenarios.push(
    { id: 'SCN-5', flowRef: 'FLOW-side', given: ['g'], when: 'file-tree reconciliation', then: ['t'], examples: [], verification: { kind: 'file', assertion: { paths: ['req.md'] }, evidencePolicy: { kind: 'file' }, command: null, commandHash: null, commandConfirmedAt: null } },
    { id: 'SCN-6', flowRef: 'FLOW-side', given: ['g'], when: 'config binding reconciliation', then: ['t'], examples: [], verification: { kind: 'grep', assertion: { path: '*.md', pattern: 'Requirement body', predicate: '>=1' }, evidencePolicy: { kind: 'grep' }, command: null, commandHash: null, commandConfirmedAt: null } },
    { id: 'SCN-7', flowRef: 'FLOW-side', given: ['g'], when: 'missing-file reconciliation', then: ['t'], examples: [], verification: { kind: 'file', assertion: { paths: ['ghost/none.xml'] }, evidencePolicy: { kind: 'file' }, command: null, commandHash: null, commandConfirmedAt: null } }
  );
  fs.writeFileSync('cur6.json', JSON.stringify({ contract: cur.contract, templates: cur.templates }));
  run(['save', 'spec.html', '--data', 'cur6.json']);
}
r = run(['record-run', 'spec.html', '--scenario', 'SCN-5']);
ok('T6d file judge: exists → passed', r.status === 0 && r.stdout.includes('passed'), r.stdout.trim() || r.stderr.trim());
r = run(['record-run', 'spec.html', '--scenario', 'SCN-6']);
ok('T6e grep judge: ≥1 hit → passed (count only, values not stored)', r.status === 0 && r.stdout.includes('passed'), r.stdout.trim() || r.stderr.trim());
r = run(['record-run', 'spec.html', '--scenario', 'SCN-7']);
ok('T6f file judge: missing → failed', r.status === 0 && r.stdout.includes('failed'), r.stdout.trim() || r.stderr.trim());
// forged evidence: tamper with the junit evidence file → --strict must report ALG-04
const xml = 'build/tr/TEST-demo.xml';
const orig = fs.readFileSync(xml, 'utf8');
fs.writeFileSync(xml, orig + '<!-- tampered -->');
r = run(['validate', 'spec.html', '--strict']);
ok('T7 tampered evidence file → --strict reports ALG-04', r.status !== 0 && r.stdout.includes('ALG-04'), (r.stdout.match(/ALG-04[^\n]*/) || [])[0]);
fs.writeFileSync(xml, orig);

// ── edit Then → old run turns historical (extract → change then only, keep the frozen command)
{
  const cur8 = JSON.parse(run(['extract', 'spec.html']).stdout);
  cur8.contract.scenarios.find((s) => s.id === 'SCN-1').then = ['t changed'];
  fs.writeFileSync('payload2.json', JSON.stringify({ contract: cur8.contract, templates: cur8.templates }));
}
run(['save', 'spec.html', '--data', 'payload2.json']);
r = run(['status', 'spec.html']);
ok('T8 after editing Then, SCN-1 old run invalidated → not-run', r.stdout.includes('SCN-1: not-run'), (r.stdout.match(/SCN-1[^\n]*/) || [])[0]);

// ── group one: integrity (gate / replay / out-of-band / recovery)
r = run(['save', 'spec.html', '--data', 'payload2.json', '--gate', 'G1']);
ok('gate G1 committed', r.status === 0 && r.stdout.includes('gate commit'), r.stderr.trim());
run(['save', 'spec.html', '--data', 'payload2.json']);
r = run(['save', 'spec.html', '--data', 'payload2.json', '--gate', 'G2']);
ok('gate G2 committed', r.status === 0);
const g1 = git(['log', '--format=%H %s']).split('\n').find((l) => l.includes('gate G1')).split(' ')[0];
fs.writeFileSync('spec.html', git(['show', `${g1}:spec.html`]));
r = run(['validate', 'spec.html', '--against-git']);
ok('T9 replaying a pre-gate version → GIT-01', r.status !== 0 && r.stdout.includes('GIT-01'), (r.stdout.match(/GIT-01[^\n]*/) || [])[0]);
r = run(['recovery', 'spec.html', '--reason', 'injection drill recovery']);
ok('T10 recovery restores from gate baseline', r.status === 0 && run(['validate', 'spec.html', '--against-git']).status === 0, r.stderr.trim());
execSync(`perl -pi -e 's/Injection drill/tampered/ if /"title"/' spec.html`, { cwd: T });
r = run(['validate', 'spec.html']);
ok('T11 hand-editing the contract bypassing save → ENV-01', r.status !== 0 && r.stdout.includes('ENV-01'));
run(['recovery', 'spec.html', '--reason', 'recovery after hand edit']);

// ── group four: lifecycle (source gate / acceptance / retemplate / resume)
// restore the original SCN-1: extract → change then only → save (keeps the frozen verification.command; a full-payload overwrite would wipe the frozen command, rightly invalidating old runs)
{
  const cur = JSON.parse(run(['extract', 'spec.html']).stdout);
  cur.contract.scenarios.find((s) => s.id === 'SCN-1').then = ['t'];
  fs.writeFileSync('cur.json', JSON.stringify({ contract: cur.contract, templates: cur.templates }));
}
r = run(['save', 'spec.html', '--data', 'cur.json']);
ok('Then edit rolled back (fingerprint restored, frozen command kept)', r.status === 0, r.stderr.trim());
r = run(['status', 'spec.html']);
ok('T12a after fingerprint restore SCN-1 back to passed', r.stdout.includes('SCN-1: passed'), (r.stdout.match(/SCN-1[^\n]*/) || [])[0]);
r = run(['accept', 'spec.html', '--verbatim', 'accepted']);
ok('T12b accept without refresh → rejected', r.status !== 0, r.stderr.trim().split('\n')[0]);
run(['refresh-sources', 'spec.html']);
r = run(['accept', 'spec.html', '--verbatim', 'acceptance passed, accepted']);
ok('T12c accept succeeds after refresh', r.status === 0, r.stderr.trim().split('\n')[0]);
r = run(['status', 'spec.html']);
ok('T12d specAcceptance=accepted', r.stdout.includes('specAcceptance=accepted'), (r.stdout.match(/Five-tuple[^\n]*/) || [])[0]);
// source drift: edit req.md → refresh → changed but not adjudicated → a new accept must be blocked
fs.writeFileSync('req.md', 'Requirement body v2 (changed)\n');
r = run(['refresh-sources', 'spec.html']);
ok('T13a source changed → observation=changed', r.stdout.includes('changed'), r.stdout.trim().split('\n').pop());
r = run(['accept', 'spec.html', '--verbatim', 'accept again']);
ok('T13b changed not adjudicated → accept rejected (ACC-02)', r.status !== 0 && r.stderr.includes('ACC-02'), (r.stderr.match(/ACC-02[^\n]*/) || [])[0]);
// retemplate with zero loss
const before = run(['extract', 'spec.html']).stdout;
r = run(['save', 'spec.html', '--retemplate']);
const after = run(['extract', 'spec.html']).stdout;
const norm = (s) => { const j = JSON.parse(s); return JSON.stringify({ c: j.contract, l: { ...j.ledger, changelog: null } }); };
ok('T14 zero contract/ledger loss after retemplate', r.status === 0 && norm(before) === norm(after));
r = run(['validate', 'spec.html']);
ok('T14b validate 0 errors after retemplate (CSP/engine hash kept in sync)', r.status === 0);
// duplicate data block
const html = fs.readFileSync('spec.html', 'utf8');
const stampBlock = html.match(/<script type="application\/json" id="mini-app-stamp">[\s\S]*?<\/script>/)[0];
fs.writeFileSync('dup.html', html.replace('</body>', stampBlock + '\n</body>'));
r = run(['validate', 'dup.html']);
ok('T15 duplicate data block → parse rejected', r.status !== 0 && (r.stderr + r.stdout).includes('STR-05'));
// live lock rejection + resume
fs.writeFileSync('spec.html.lock', JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
r = run(['save', 'spec.html', '--data', 'payload.json']);
ok('T16 live lock → save rejected', r.status !== 0 && r.stderr.includes('concurrency conflict'));
fs.unlinkSync('spec.html.lock');
const t0 = Date.now();
r = run(['status', 'spec.html']);
ok('T17 resume: one status command yields the recovery brief', r.status === 0 && r.stdout.includes('Five-tuple') && r.stdout.includes('progress'), `${Date.now() - t0}ms`);

// ── group five: review session (zero-rewrite forwarding / submit persists and wakes waiter / merge loop closed)
{
  const mod = await import(pathToFileURL(SPEC).href);
  const s = await mod.startReviewServer(path.join(T, 'spec.html'));
  const base = `http://127.0.0.1:${s.port}`;
  const disk = fs.readFileSync(path.join(T, 'spec.html'));
  const served = Buffer.from(await (await fetch(base + '/artifact')).arrayBuffer());
  ok('T18 review /artifact byte-for-byte, zero rewrites', Buffer.compare(disk, served) === 0);
  const wrapperTxt = await (await fetch(base + '/')).text();
  ok('T19 wrapper binds the specId staging key', wrapperTxt.includes('mas-ann:FEAT-inj'));
  const post = await fetch(base + '/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ end: true, annotations: [{ targetId: 'SCN-1', comment: 'review comment', proposal: 'suggested fix' }, { targetId: '', comment: 'anchorless, should be filtered out' }] }) });
  const sub = await s.waitForSubmission();
  ok('T20 submit filters invalid items, persists the queue and wakes the waiter', post.ok && sub.count === 1 && sub.end === true && !!sub.feedbackPath && fs.existsSync(sub.feedbackPath));
  await s.close();
  const fb = JSON.parse(fs.readFileSync(sub.feedbackPath, 'utf8'));
  ok('T21 queue file carries specId+revision context', fb.specId === 'FEAT-inj' && typeof fb.revision === 'number' && fb.annotations[0].proposal === 'suggested fix');
  r = run(['merge-feedback', 'spec.html', '--data', sub.feedbackPath]);
  ok('T22 review queue → merge-feedback closes the loop as proposed', r.status === 0 && r.stdout.includes('proposed'));
}

// ── progress: untrusted-block writes leave revision/envelope untouched
{
  const revBefore = JSON.parse(run(['extract', 'spec.html', '--out', 'x.json']).status === 0 ? fs.readFileSync('spec.html', 'utf8').match(/"revision":\s*(\d+)/)[0].split(':')[1] : '0');
  r = run(['progress', 'spec.html', '--stage', 'aligned', '--worth-it', 'worth-it test write']);
  const revAfter = Number(fs.readFileSync('spec.html', 'utf8').match(/"revision":\s*(\d+)/)[0].split(':')[1]);
  const st = run(['status', 'spec.html']);
  ok('T23 progress command writes without moving revision', r.status === 0 && Number(revBefore) === revAfter && st.stdout.includes('aligned'));
  r = run(['validate', 'spec.html']);
  ok('T24 envelope check still 0 errors after progress write', r.status === 0);
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILED'}: ${pass} passed / ${fail} failed`);
console.log(`temp dir: ${T}`);
process.exit(fail ? 1 : 0);
