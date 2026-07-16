#!/usr/bin/env node
// run-fixtures.mjs — 用 fixtures 验收 validateData/validateTemplates（contract.md §11）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateData, validateTemplates } from './spec.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

// RFC6902 子集：add/replace/remove
function applyPatch(doc, ops) {
  const d = structuredClone(doc);
  for (const op of ops) {
    const parts = op.path.split('/').slice(1).map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
    let c = d;
    for (let i = 0; i < parts.length - 1; i++) c = Array.isArray(c) ? c[+parts[i]] : c[parts[i]];
    const last = parts[parts.length - 1];
    if (op.op === 'add') { if (Array.isArray(c) && last === '-') c.push(op.value); else if (Array.isArray(c)) c.splice(+last, 0, op.value); else c[last] = op.value; }
    else if (op.op === 'replace') { if (Array.isArray(c)) c[+last] = op.value; else c[last] = op.value; }
    else if (op.op === 'remove') { if (Array.isArray(c)) c.splice(+last, 1); else delete c[last]; }
    else throw new Error(`不支持的 op：${op.op}`);
  }
  return d;
}

let pass = 0, fail = 0;
const report = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

// 好例：0 error
for (const f of ['valid-minimal.json', 'valid-typical.json']) {
  const errs = validateData(load(f)).filter((x) => x.level === 'error');
  report(f, errs.length === 0, errs.map((e) => `${e.code}:${e.message}`).join('; '));
}

// 坏例：expect ⊆ 实际报告码
for (const f of fs.readdirSync(dir).filter((x) => x.startsWith('bad-') && x.endsWith('.json')).sort()) {
  const fx = load(f);
  const mutated = applyPatch(load(fx.base), fx.ops);
  const codes = new Set(validateData(mutated).map((x) => x.code));
  const missing = fx.expect.filter((c) => !codes.has(c));
  report(f, missing.length === 0, missing.length ? `缺 ${missing.join(',')}，实报 [${[...codes].join(',')}]` : `报出 [${[...codes].join(',')}]`);
}

// template 坏例
const readTpl = (f) => { const html = fs.readFileSync(path.join(dir, f), 'utf8'); const m = html.match(/<template id="(ui-[^"]+)">([\s\S]*?)<\/template>/); return { [m[1]]: m[2] }; };
{
  const codes = new Set(validateTemplates(readTpl('bad-tpl01-script.html'), load('valid-minimal.json').contract).map((x) => x.code));
  report('bad-tpl01-script.html', codes.has('TPL-01'), `实报 [${[...codes].join(',')}]`);
}
{
  const codes = new Set(validateTemplates(readTpl('bad-tpl02-datago.html'), load('valid-typical.json').contract).map((x) => x.code));
  report('bad-tpl02-datago.html', codes.has('TPL-02'), `实报 [${[...codes].join(',')}]`);
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILED'}: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
