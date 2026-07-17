#!/usr/bin/env node
// run-fixtures.mjs — acceptance-check validateData/validateTemplates against fixtures (contract.md §11)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateData, validateTemplates } from './spec.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

// RFC6902 subset: add/replace/remove
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
    else throw new Error(`unsupported op: ${op.op}`);
  }
  return d;
}

let pass = 0, fail = 0;
const report = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

// good cases: 0 errors
for (const f of ['valid-minimal.json', 'valid-typical.json']) {
  const errs = validateData(load(f)).filter((x) => x.level === 'error');
  report(f, errs.length === 0, errs.map((e) => `${e.code}:${e.message}`).join('; '));
}

// bad cases: expect ⊆ actually reported codes
for (const f of fs.readdirSync(dir).filter((x) => x.startsWith('bad-') && x.endsWith('.json')).sort()) {
  const fx = load(f);
  const mutated = applyPatch(load(fx.base), fx.ops);
  const codes = new Set(validateData(mutated).map((x) => x.code));
  const missing = fx.expect.filter((c) => !codes.has(c));
  report(f, missing.length === 0, missing.length ? `missing ${missing.join(',')}, reported [${[...codes].join(',')}]` : `reported [${[...codes].join(',')}]`);
}

// template bad cases
const readTpl = (f) => { const html = fs.readFileSync(path.join(dir, f), 'utf8'); const m = html.match(/<template id="(ui-[^"]+)">([\s\S]*?)<\/template>/); return { [m[1]]: m[2] }; };
{
  const codes = new Set(validateTemplates(readTpl('bad-tpl01-script.html'), load('valid-minimal.json').contract).map((x) => x.code));
  report('bad-tpl01-script.html', codes.has('TPL-01'), `reported [${[...codes].join(',')}]`);
}
{
  const codes = new Set(validateTemplates(readTpl('bad-tpl02-datago.html'), load('valid-typical.json').contract).map((x) => x.code));
  report('bad-tpl02-datago.html', codes.has('TPL-02'), `reported [${[...codes].join(',')}]`);
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILED'}: ${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
