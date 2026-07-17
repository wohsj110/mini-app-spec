#!/usr/bin/env node
// spec.mjs — mini-app-spec 唯一事务层（实现依据：references/contract.md v1）
// 命令：new / extract / save / status / validate / refresh-sources / recovery
// record-run 与 --retemplate 属 D6-7，本文件预留报错占位。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

// ───────────────────────── utils ─────────────────────────

export const sha256hex = (buf) => 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex');
const sha256b64 = (buf) => crypto.createHash('sha256').update(buf).digest('base64');

// canonical 序列化（contract.md §7.1）：NFC、键字典序、数组保序、CRLF→LF、最短数字
export function canonical(value) {
  const norm = (v) => {
    if (typeof v === 'string') return v.normalize('NFC').replace(/\r\n/g, '\n');
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v).sort()) o[k.normalize('NFC')] = norm(v[k]);
      return o;
    }
    return v;
  };
  return JSON.stringify(norm(value));
}
export const fingerprintOf = (scn) => 'fp1:' + crypto.createHash('sha256').update(canonical({
  given: scn.given, when: scn.when, then: scn.then, examples: scn.examples,
  assertion: scn.verification?.assertion, evidencePolicy: scn.verification?.evidencePolicy,
})).digest('hex');
export const verificationHashOf = (v, judgeVersion = 'judge1') => 'vh1:' + crypto.createHash('sha256').update(canonical({
  kind: v.kind, command: v.command, confirmedAt: v.commandConfirmedAt, judgeVersion,
})).digest('hex');

const embedJson = (obj) => JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');

// ───────────────────────── artifact 结构 ─────────────────────────

const BLOCK_IDS = ['mini-app-contract', 'mini-app-ledger', 'mini-app-progress', 'mini-app-stamp'];

export function parseArtifact(html) {
  const blocks = {};
  for (const id of BLOCK_IDS) {
    const re = new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`, 'g');
    const hits = [...html.matchAll(re)];
    if (hits.length === 0) throw new Error(`缺少数据块 ${id}`);
    if (hits.length > 1) throw new Error(`STR-05: 数据块 ${id} 重复出现 ${hits.length} 次`);
    blocks[id] = JSON.parse(hits[0][1]);
  }
  const templates = {};
  for (const m of html.matchAll(/<template id="(ui-[^"]+)">([\s\S]*?)<\/template>/g)) {
    if (templates[m[1]] !== undefined) throw new Error(`STR-05: template ${m[1]} 重复`);
    templates[m[1]] = m[2];
  }
  const engineScript = (html.match(/<script id="mini-app-engine">([\s\S]*?)<\/script>/) || [])[1] ?? '';
  const engineStyle = (html.match(/<style id="mini-app-engine-style">([\s\S]*?)<\/style>/) || [])[1] ?? '';
  return {
    specVersion: blocks['mini-app-contract'].specVersion ?? 1,
    contract: blocks['mini-app-contract'].contract ?? blocks['mini-app-contract'],
    ledger: blocks['mini-app-ledger'],
    progress: blocks['mini-app-progress'],
    stamp: blocks['mini-app-stamp'],
    templates, engineScript, engineStyle,
  };
}

const STUB_ENGINE_JS = `document.getElementById('app').textContent = 'mini-app-spec：引擎视图将在 D6-7 落地；合同数据见页面源码数据块。';`;
const STUB_ENGINE_CSS = `body{font-family:system-ui;margin:2rem;color:#333}`;

export function loadEngine() {
  const p = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'template.html');
  if (fs.existsSync(p)) {
    const html = fs.readFileSync(p, 'utf8');
    const js = (html.match(/<script id="mini-app-engine"[^>]*>([\s\S]*?)<\/script>/) || [])[1];
    const css = (html.match(/<style id="mini-app-engine-style"[^>]*>([\s\S]*?)<\/style>/) || [])[1];
    const ver = (html.match(/data-engine-version="([^"]+)"/) || [])[1] ?? '0.1.0';
    if (js && css) return { engineScript: js, engineStyle: css, engineVersion: ver };
  }
  return { engineScript: STUB_ENGINE_JS, engineStyle: STUB_ENGINE_CSS, engineVersion: '0.1.0-stub' };
}

export function computeHashes(a) {
  const tplConcat = Object.keys(a.templates).sort().map((k) => `<template id="${k}">${a.templates[k]}</template>`).join('\n');
  return {
    contract: sha256hex(canonical({ specVersion: a.specVersion, contract: a.contract })),
    templates: sha256hex(tplConcat),
    engine: sha256hex(a.engineStyle + '\n' + a.engineScript),
    ledger: sha256hex(canonical(a.ledger)),
  };
}

export function buildArtifact(a) {
  const cspScriptHash = sha256b64(Buffer.from(a.engineScript, 'utf8'));
  const tpls = Object.keys(a.templates).sort().map((k) => `<template id="${k}">${a.templates[k]}</template>`).join('\n');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${cspScriptHash}'; style-src 'unsafe-inline'; img-src data:;">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(a.contract.meta?.title ?? 'mini-app-spec')}</title>
<style id="mini-app-engine-style">${a.engineStyle}</style>
</head>
<body>
<div id="app"></div>
${tpls}
<script type="application/json" id="mini-app-contract">${embedJson({ specVersion: a.specVersion, contract: a.contract })}</script>
<script type="application/json" id="mini-app-ledger">${embedJson(a.ledger)}</script>
<script type="application/json" id="mini-app-progress">${embedJson(a.progress)}</script>
<script type="application/json" id="mini-app-stamp">${embedJson(a.stamp)}</script>
<script id="mini-app-engine">${a.engineScript}</script>
</body>
</html>
`;
}
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ───────────────────────── validator ─────────────────────────

const ID_RE = /^[A-Z]+-[A-Za-z0-9_-]+$/;
const F = (code, ref, message, level = 'error') => ({ code, ref, message, level });

export function validateData(data, opts = {}) {
  const out = [];
  const c = data.contract, l = data.ledger ?? { runs: [], acceptances: [], sourceObservations: [], annotations: [], recoveries: [], changelog: [] };
  if ((data.specVersion ?? 1) > 1) return [F('STR-06', 'specVersion', `specVersion ${data.specVersion} 高于支持版本 ⇒ blocked`)];

  // ── STR-02 必填字段（最小 schema）
  const req = (obj, fields, ref) => { for (const f of fields) if (obj?.[f] === undefined) out.push(F('STR-02', ref, `缺少必填字段 ${f}`)); };
  req(c?.meta, ['id', 'title'], 'meta');
  for (const k of ['sources', 'flows', 'states', 'transitions', 'requirements', 'scenarios', 'issues']) if (!Array.isArray(c?.[k])) out.push(F('STR-02', k, `contract.${k} 必须是数组`));
  if (out.some((f) => f.code === 'STR-02')) return out;
  for (const s of c.sources) req(s, ['id', 'kind', 'locator', 'version', 'role'], s.id ?? 'sources[]');
  for (const f0 of c.flows) req(f0, ['id', 'title', 'priority', 'risk', 'core', 'alignStatus', 'stateRefs'], f0.id ?? 'flows[]');
  for (const s of c.states) {
    req(s, ['id', 'flowRef', 'name', 'uiTemplateRef', 'entry', 'terminal'], s.id ?? 'states[]');
    if (s.figma === undefined && s.figmaNote === undefined) out.push(F('STR-02', s.id, 'figma|figmaNote 二选一必填'));
  }
  for (const t of c.transitions) req(t, ['id', 'flowRef', 'from', 'to', 'trigger', 'result', 'isDefault'], t.id ?? 'transitions[]');
  for (const r of c.requirements) req(r, ['id', 'text', 'kind', 'sourceRefs'], r.id ?? 'requirements[]');
  for (const s of c.scenarios) {
    req(s, ['id', 'flowRef', 'given', 'when', 'then', 'examples', 'verification'], s.id ?? 'scenarios[]');
    if (s.verification) req(s.verification, ['kind', 'assertion', 'evidencePolicy'], `${s.id}.verification`);
  }
  for (const i of c.issues) req(i, ['id', 'type', 'question', 'options', 'impact', 'status'], i.id ?? 'issues[]');
  for (const r of l.runs ?? []) {
    req(r, ['id', 'scenarioRef', 'exampleResults', 'at', 'revision', 'gitHead', 'dirty', 'cmd', 'cmdHash', 'exitCode', 'timeoutMs', 'outputExcerpt', 'redacted', 'outputSha256', 'evidence', 'result'], r.id ?? 'runs[]');
    if (r.scenarioFingerprint === undefined || r.verificationHash === undefined) out.push(F('LED-02', r.id, 'run 缺 scenarioFingerprint/verificationHash'));
    if (r.dirty === true && r.dirtyDiffHash === undefined) out.push(F('LED-01', r.id, 'dirty run 缺 dirtyDiffHash'));
  }
  for (const a of l.acceptances ?? []) req(a, ['id', 'at', 'verbatim', 'revision', 'sourceBatchId', 'sourceWaivers', 'deviationsAcknowledged'], a.id ?? 'acceptances[]');
  for (const o of l.sourceObservations ?? []) req(o, ['id', 'batchId', 'sourceRef', 'observedAt', 'outcome'], o.id ?? 'sourceObservations[]');

  // ── STR-03/04 ID 格式与唯一
  const ids = new Map();
  const collect = (arr, kind) => { for (const x of arr ?? []) { if (x.id !== undefined) { if (!ID_RE.test(x.id)) out.push(F('STR-03', x.id, `ID 格式非法（${kind}）`)); if (ids.has(x.id)) out.push(F('STR-04', x.id, `ID 重复（${kind} 与 ${ids.get(x.id)}）`)); else ids.set(x.id, kind); } } };
  collect(c.sources, 'source'); collect(c.flows, 'flow'); collect(c.states, 'state'); collect(c.transitions, 'transition');
  collect(c.requirements, 'requirement'); collect(c.scenarios, 'scenario'); collect(c.issues, 'issue');
  collect(l.runs, 'run'); collect(l.acceptances, 'acceptance'); collect(l.sourceObservations, 'observation'); collect(l.annotations, 'annotation');
  for (const s of c.scenarios) for (const ex of s.examples ?? []) { if (ids.has(ex.id)) out.push(F('STR-04', ex.id, 'example ID 重复')); else ids.set(ex.id, 'example'); }

  // ── ALG-01 派生状态禁止落盘
  const forbid = (arr, keys, kind) => { for (const x of arr ?? []) for (const k of keys) if (x[k] !== undefined) out.push(F('ALG-01', x.id, `${kind} 禁止落盘派生字段 ${k}`)); };
  forbid(c.scenarios, ['status', 'result', 'passed'], 'scenario');
  forbid(c.flows, ['status', 'implementationStatus'], 'flow');
  forbid(c.states, ['status'], 'state'); forbid(c.transitions, ['status'], 'transition'); forbid(c.requirements, ['status'], 'requirement');
  if (c.meta.status !== undefined || c.meta.acceptedNote !== undefined) out.push(F('ALG-01', 'meta', 'meta 禁止状态字段'));

  // ── REF-01 引用可解析
  const has = (id) => ids.has(id);
  const refCheck = (id, ref, what) => { if (ref != null && !has(ref)) out.push(F('REF-01', id, `${what} 引用不可解析：${ref}`)); };
  for (const f0 of c.flows) for (const r of f0.stateRefs) refCheck(f0.id, r, 'stateRefs');
  for (const s of c.states) refCheck(s.id, s.flowRef, 'flowRef');
  for (const t of c.transitions) { refCheck(t.id, t.flowRef, 'flowRef'); refCheck(t.id, t.from, 'from'); refCheck(t.id, t.to, 'to'); for (const r of t.scenarioRefs ?? []) refCheck(t.id, r, 'scenarioRefs'); }
  for (const r of c.requirements) { for (const x of r.sourceRefs ?? []) refCheck(r.id, x, 'sourceRefs'); for (const x of r.scenarioRefs ?? []) refCheck(r.id, x, 'scenarioRefs'); }
  for (const s of c.scenarios) { refCheck(s.id, s.flowRef, 'flowRef'); for (const x of s.stateRefs ?? []) refCheck(s.id, x, 'stateRefs'); for (const x of s.demoPath ?? []) refCheck(s.id, x, 'demoPath'); }
  for (const i of c.issues) for (const x of i.affectedRefs ?? []) refCheck(i.id, x, 'affectedRefs');
  for (const r of l.runs ?? []) {
    refCheck(r.id, r.scenarioRef, 'scenarioRef');
    for (const er of r.exampleResults ?? []) {
      if (er.exampleRef === undefined) continue;
      if (er.exampleRef === `${r.scenarioRef}-implicit`) continue; // 无 Examples 场景的隐式 example（contract.md §4）
      refCheck(r.id, er.exampleRef, 'exampleRef');
    }
  }
  for (const o of l.sourceObservations ?? []) refCheck(o.id, o.sourceRef, 'sourceRef');
  for (const an of l.annotations ?? []) refCheck(an.id, an.targetId, 'targetId');

  // ── FSM（contract.md §4.1）
  for (const f0 of c.flows) {
    const states = c.states.filter((s) => s.flowRef === f0.id);
    const trans = c.transitions.filter((t) => t.flowRef === f0.id);
    for (const t of trans) {
      const fromS = c.states.find((s) => s.id === t.from), toS = c.states.find((s) => s.id === t.to);
      if (fromS && fromS.flowRef !== t.flowRef) out.push(F('FSM-06', t.id, 'from 状态不属于本 flow'));
      if (toS && toS.flowRef !== t.flowRef) out.push(F('FSM-06', t.id, 'to 状态不属于本 flow'));
    }
    const entries = states.filter((s) => s.entry && s.entry !== 'none');
    if (states.length && entries.length === 0) out.push(F('FSM-01', f0.id, 'flow 无 entry 状态'));
    // FSM-02 可达性（任意边）
    const adj = new Map(states.map((s) => [s.id, []]));
    for (const t of trans) if (adj.has(t.from)) adj.get(t.from).push(t.to);
    const seen = new Set(entries.map((e) => e.id));
    const stack = [...seen];
    while (stack.length) { const cur = stack.pop(); for (const n of adj.get(cur) ?? []) if (!seen.has(n)) { seen.add(n); stack.push(n); } }
    for (const s of states) if (!seen.has(s.id) && entries.length) out.push(F('FSM-02', s.id, '状态不可达'));
    // FSM-04 无 guard 多出边须恰一 default
    for (const s of states) {
      const guardless = trans.filter((t) => t.from === s.id && (t.guard == null));
      if (guardless.length > 1 && guardless.filter((t) => t.isDefault).length !== 1) out.push(F('FSM-04', s.id, `无 guard 出边 ${guardless.length} 条但 default 数 ≠1`));
    }
    // FSM-03/05 default 路径：单出边视作 default
    const defaultNext = (sid) => {
      const outs = trans.filter((t) => t.from === sid && t.guard == null);
      if (outs.length === 1) return outs[0];
      return outs.find((t) => t.isDefault) ?? null;
    };
    for (const e of entries) {
      const visited = new Set(); let cur = e.id; let reached = false; let loopEdge = null;
      while (true) {
        const st = states.find((s) => s.id === cur);
        if (st?.terminal) { reached = true; break; }
        const edge = defaultNext(cur);
        if (!edge) break;
        if (visited.has(cur)) { loopEdge = edge; break; }
        visited.add(cur); cur = edge.to;
      }
      if (loopEdge) { if (!loopEdge.loopAllowed) out.push(F('FSM-05', loopEdge.id, 'default 路径成环且未标 loopAllowed')); if (!reached) out.push(F('FSM-03', e.id, 'default 路径困于环，不达 terminal')); }
      else if (!reached) out.push(F('FSM-03', e.id, 'default 路径不达 terminal'));
    }
  }

  // ── ALG-02/03 需求覆盖与 waiver
  const waiverOk = (w) => w && w.reason && w.authority && w.approvedAt;
  for (const r of c.requirements) {
    if (r.kind !== 'behavior') continue;
    const covered = (r.scenarioRefs ?? []).length > 0;
    if (!covered) {
      if (!r.waiver) out.push(F('ALG-02', r.id, 'behavior 需求无场景且无 waiver'));
      else if (!waiverOk(r.waiver)) out.push(F('ALG-03', r.id, 'waiver 缺 reason/authority/approvedAt'));
    }
  }

  // ── run 层：ALG-04/05、LED-01
  const scnOf = (id) => c.scenarios.find((s) => s.id === id);
  for (const r of l.runs ?? []) {
    const scn = scnOf(r.scenarioRef);
    if (r.result === 'passed' && (!Array.isArray(r.evidence) || r.evidence.length === 0)) out.push(F('ALG-04', r.id, 'passed run 证据为空'));
    // strict 的证据文件核验只针对「适用」run（fingerprint+vh 与当前场景一致）；historical run 仅展示、不参与推导，其证据随产物演进合法漂移
    const rApplicable = scn && r.scenarioFingerprint === fingerprintOf(scn) && r.verificationHash === verificationHashOf(scn.verification ?? {});
    if (opts.strict && r.result === 'passed' && rApplicable) for (const ev of r.evidence ?? []) {
      const p = path.resolve(opts.repoRoot ?? '.', ev.path);
      if (!fs.existsSync(p)) out.push(F('ALG-04', r.id, `证据文件不存在：${ev.path}`));
      else if (ev.sha256 && sha256hex(fs.readFileSync(p)) !== ev.sha256) out.push(F('ALG-04', r.id, `证据 hash 不符：${ev.path}`));
    }
    if (scn?.verification?.kind === 'assert' && r.result === 'passed' && !(r.testCount > 0)) out.push(F('ALG-05', r.id, 'assert run 标 passed 但 testCount 缺失或为 0'));
    if (scn?.verification?.kind === 'db' && (r.buildVariant === undefined || r.devicePackage === undefined || r.deviceSerial === undefined)) out.push(F('LED-01', r.id, 'db/device 场景 run 缺设备上下文'));
  }

  // ── ACC-*：acceptance 的「写入时前置条件」（contract.md §6.6）。
  // ACC-01/02 依 changelog 序还原 acceptance 写入时的批次（对历史 acceptance 也成立）；
  // ACC-03/04/05/06 依赖当前 contract 状态，只对「最新写入即 acceptance」的时点评估——
  // acceptance 之后合法追加（新批次/新 issue/新批注）不追溯污染旧 acceptance，其影响走五元组展示轴。
  const batchesInOrder = [];
  for (const o of l.sourceObservations ?? []) if (!batchesInOrder.includes(o.batchId)) batchesInOrder.push(o.batchId);
  const srcEntries = (l.changelog ?? []).filter((e) => e.type === 'source');
  const maxRev = Math.max(0, ...(l.changelog ?? []).map((e) => e.rev));
  const derived = deriveStatus({ contract: c, ledger: l });
  for (const acc of l.acceptances ?? []) {
    const pre = srcEntries.filter((e) => e.rev <= acc.revision);
    const batchAtAcc = pre.length ? (pre[pre.length - 1].changed?.[0]?.ref ?? null) : (batchesInOrder[batchesInOrder.length - 1] ?? null);
    if (acc.sourceBatchId !== batchAtAcc) out.push(F('ACC-01', acc.id, `acceptance 引用批次 ${acc.sourceBatchId} 非其写入时最新批次 ${batchAtAcc}`));
    const batchObs = (l.sourceObservations ?? []).filter((o) => o.batchId === acc.sourceBatchId);
    const waived = new Set((acc.sourceWaivers ?? []).map((w) => w.sourceRef));
    for (const src of c.sources) {
      const ob = batchObs.filter((o) => o.sourceRef === src.id).pop();
      const bad = !ob ? 'unknown（本批次未观测）' : ob.outcome === 'unavailable' ? 'unavailable' : (ob.outcome === 'changed' && !ob.decidedImpact) ? 'changed 未裁决' : null;
      if (bad && !waived.has(src.id)) out.push(F('ACC-02', acc.id, `来源 ${src.id} ${bad} 且无 sourceWaiver`));
    }
    if (acc.revision >= maxRev) {
      for (const f0 of c.flows) if (f0.core && f0.alignStatus !== 'aligned') out.push(F('ACC-06', acc.id, `core flow ${f0.id} 未对齐`));
      for (const i of c.issues) if (i.type === 'blocker' && i.status === 'open') out.push(F('ACC-03', acc.id, `存在 open blocker：${i.id}`));
      for (const an of l.annotations ?? []) if (an.status === 'proposed') out.push(F('ACC-04', acc.id, `存在 proposed 批注：${an.id}`));
      for (const [scnId, v] of Object.entries(derived.scenarioValue)) {
        const scn = scnOf(scnId); const flow = c.flows.find((f1) => f1.id === scn?.flowRef);
        if (flow?.core && v !== 'passed' && !(acc.deviationsAcknowledged ?? []).some((d) => d.ref === scnId && waiverOk(d.waiver))) out.push(F('ACC-05', acc.id, `core 场景 ${scnId}=${v} 无 deviation waiver`));
      }
    }
  }
  return out;
}

// ───────────────────────── 派生状态（contract.md §6，只算不存） ─────────────────────────

const WORST = ['failed', 'blocked', 'not-run', 'partial-coverage', 'passed-weak', 'passed'];
const worst = (vals) => { for (const w of WORST) if (vals.includes(w)) return w; return 'not-run'; };

export function deriveStatus(data) {
  const c = data.contract, l = data.ledger;
  const scenarioValue = {}, flowStatus = {};
  for (const scn of c.scenarios ?? []) {
    const fp = fingerprintOf(scn), vh = verificationHashOf(scn.verification ?? {});
    const applicable = (l.runs ?? []).filter((r) => r.scenarioRef === scn.id && r.scenarioFingerprint === fp && r.verificationHash === vh);
    // 顺序语义 [N-7]：revision 最大者优先，同 revision 取数组序靠后
    applicable.sort((a, b) => (a.revision - b.revision));
    const examples = (scn.examples ?? []).length ? scn.examples : [{ id: `${scn.id}-implicit` }];
    const exState = {};
    for (const ex of examples) {
      let v = 'not-run';
      for (const r of applicable) { const er = (r.exampleResults ?? []).find((e) => e.exampleRef === ex.id || (r.exampleResults.length === 0 && false)); if (er) v = er.result; else if ((r.exampleResults ?? []).length === 0 && r.result) v = r.result; }
      exState[ex.id] = v;
    }
    const vals = Object.values(exState);
    const coverage = vals.every((v) => v !== 'not-run') ? 'full' : vals.some((v) => v !== 'not-run') ? 'partial' : 'not-run';
    const result = ['failed', 'blocked', 'not-run', 'passed'].find((w) => vals.includes(w)) ?? 'not-run';
    const evidenceLevel = scn.verification?.kind === 'mock' ? 'weak' : 'strong';
    scenarioValue[scn.id] =
      result === 'failed' ? 'failed' :
      result === 'blocked' ? 'blocked' :
      coverage === 'not-run' ? 'not-run' :
      coverage === 'partial' ? 'partial-coverage' :
      evidenceLevel === 'weak' ? 'passed-weak' : 'passed';
  }
  for (const f0 of c.flows ?? []) {
    const vals = (c.scenarios ?? []).filter((s) => s.flowRef === f0.id).map((s) => scenarioValue[s.id]);
    flowStatus[f0.id] = vals.length ? worst(vals) : 'not-run';
  }
  const coreVals = (c.flows ?? []).filter((f0) => f0.core).map((f0) => flowStatus[f0.id]);
  const implementationStatus = coreVals.length ? worst(coreVals) : 'not-run';
  // specAcceptance
  const accs = [...(l.acceptances ?? [])];
  let specAcceptance = 'draft';
  if ((c.flows ?? []).some((f0) => f0.alignStatus === 'aligned')) specAcceptance = 'review';
  if (accs.length) {
    const last = accs[accs.length - 1];
    const behavioral = (l.changelog ?? []).some((e) => e.rev > last.revision && e.type === 'spec' && (e.changed ?? []).some((ch) => /^(ST|TR|SCN)-/.test(ch.ref ?? '')));
    specAcceptance = behavioral ? 're-review' : 'accepted';
  }
  // source 状态
  const sourceStatus = {};
  for (const src of data.contract.sources ?? []) {
    const obs = (l.sourceObservations ?? []).filter((o) => o.sourceRef === src.id);
    const ob = obs[obs.length - 1];
    sourceStatus[src.id] = !ob ? 'unknown' : ob.outcome === 'unavailable' ? 'unavailable' : ob.outcome === 'changed' ? (ob.decidedImpact ? 'changed-acknowledged' : 'changed') : 'fresh';
  }
  const openBlockers = (c.issues ?? []).filter((i) => i.type === 'blocker' && i.status === 'open').length;
  const proposedAnnotations = (l.annotations ?? []).filter((a) => a.status === 'proposed').length;
  return { scenarioValue, flowStatus, implementationStatus, specAcceptance, sourceStatus, openBlockers, proposedAnnotations };
}

// ───────────────────────── template 安全（contract.md §8.1） ─────────────────────────

const TPL_TAGS = new Set(['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'button', 'label', 'img', 'input', 'svg', 'path', 'rect', 'circle', 'line', 'g', 'text', 'br', 'strong', 'em', 'small']);
const TPL_ATTRS = new Set(['class', 'style', 'data-go', 'data-spec-id', 'data-figma', 'data-live', 'data-live-text', 'data-note', 'data-live-formula', 'data-formula', 'data-hold-compare', 'data-compare-hide', 'data-snap', 'data-snap-text', 'data-show-in', 'data-on-in', 'type', 'value', 'placeholder', 'checked', 'disabled', 'min', 'max', 'step', 'src', 'alt', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'viewBox', 'fill', 'stroke', 'stroke-width', 'points', 'transform']);
const INPUT_TYPES = new Set(['text', 'checkbox', 'radio', 'range']);

export function validateTemplates(templates, contract) {
  const out = [];
  for (const [tplId, htmlIn] of Object.entries(templates)) {
    const stateId = tplId.replace(/^ui-/, '');
    for (const m of htmlIn.matchAll(/<\s*\/?\s*([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
      const tag = m[1].toLowerCase();
      if (m[0].startsWith('</')) continue;
      if (!TPL_TAGS.has(tag)) { out.push(F('TPL-01', tplId, `禁用标签 <${tag}>`)); continue; }
      const attrs = [...m[2].matchAll(/([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)].map((a) => [a[1].toLowerCase(), a[3] ?? a[4] ?? '']);
      for (const [name, val] of attrs) {
        if (name.startsWith('on')) { out.push(F('TPL-01', tplId, `禁用事件属性 ${name}`)); continue; }
        if (!TPL_ATTRS.has(name)) { out.push(F('TPL-01', tplId, `禁用属性 ${name}`)); continue; }
        if (name === 'style' && /url\s*\(/i.test(val)) out.push(F('TPL-01', tplId, 'style 内禁 url()'));
        if (/^(javascript|vbscript):/i.test(val.trim())) out.push(F('TPL-01', tplId, `禁用协议：${name}`));
        if (tag === 'input' && name === 'type' && !INPUT_TYPES.has(val)) out.push(F('TPL-01', tplId, `input type=${val} 不在白名单`));
        if (tag === 'img' && name === 'src') {
          const dm = val.match(/^data:(image\/(png|jpeg|webp));base64,(.*)$/);
          if (!dm) out.push(F('TPL-03', tplId, 'img 仅允许 data:image/(png|jpeg|webp)'));
          else if (Buffer.from(dm[3], 'base64').length > 64 * 1024) out.push(F('TPL-03', tplId, 'img data URI 超 64KB'));
        }
        if ((name === 'data-show-in' || name === 'data-on-in') && contract) {
          for (const tok of val.split(/[\s,]+/).filter(Boolean)) if (!(contract.states ?? []).some((st) => st.id === tok)) out.push(F('TPL-02', tplId, `${name} 引用不存在的 state：${tok}`));
        }
        if (name === 'data-go' && contract) {
          const tr = (contract.transitions ?? []).find((t) => t.id === val);
          // 单流单屏：模板归属 = 所有 uiTemplateRef 指向本模板的状态（共享屏）；无引用者回退为 ui-<stateId> 命名
          const owners = (contract.states ?? []).filter((st) => st.uiTemplateRef === tplId).map((st) => st.id);
          if (!owners.length) owners.push(stateId);
          if (!tr) out.push(F('TPL-02', tplId, `data-go 指向不存在的 transition：${val}`));
          else if (!owners.includes(tr.from)) out.push(F('TPL-02', tplId, `data-go=${val} 的 from(${tr.from}) 不属于共享本模板的状态集 [${owners.join(',')}]`));
        }
      }
    }
  }
  return out;
}

// ───────────────────────── envelope / against-git ─────────────────────────

export function validateEnvelope(a) {
  const out = [];
  const h = computeHashes(a);
  for (const k of Object.keys(h)) if (a.stamp?.hashes?.[k] !== h[k]) out.push(F('ENV-01', k, `${k} hash 不匹配（带外编辑或未走 save）`));
  // ENV-02：changelog+recoveries 链
  const revs = [...(a.ledger.changelog ?? []).map((e) => e.rev)];
  const uniq = new Set(revs);
  if (uniq.size !== revs.length) out.push(F('ENV-02', 'changelog', 'changelog revision 重复'));
  if (a.stamp && revs.length && Math.max(...revs) !== a.stamp.revision) out.push(F('ENV-02', 'stamp', `stamp.revision(${a.stamp.revision}) ≠ changelog 最大 rev(${Math.max(...revs)})`));
  return out;
}

export function validateAgainstGit(filePath, a) {
  const out = [];
  try {
    const rel = path.relative(gitRoot(filePath), path.resolve(filePath));
    const log = execFileSync('git', ['log', '--format=%H %s', '--', rel], { cwd: gitRoot(filePath), encoding: 'utf8' });
    const gate = log.split('\n').find((ln) => ln.includes(`spec(${a.contract.meta.id}): gate `));
    if (!gate) { out.push(F('GIT-02', 'anchor', '无 gate commit 锚（unavailable，非 pass）', 'info')); return out; }
    const [hash] = gate.split(' ');
    const blob = execFileSync('git', ['show', `${hash}:${rel}`], { cwd: gitRoot(filePath), encoding: 'utf8' });
    const old = parseArtifact(blob);
    if (a.stamp.revision < old.stamp.revision) out.push(F('GIT-01', 'revision', `当前 r${a.stamp.revision} < gate r${old.stamp.revision}：疑似回放/带外覆盖`));
    else if (a.stamp.revision === old.stamp.revision) {
      const same = canonical(computeHashes(a)) === canonical(old.stamp.hashes);
      if (!same) out.push(F('GIT-01', 'revision', '与 gate 同 revision 但内容不同：带外覆盖'));
    } else {
      const revs = new Set((a.ledger.changelog ?? []).map((e) => e.rev));
      for (let r = old.stamp.revision + 1; r <= a.stamp.revision; r++) if (!revs.has(r)) out.push(F('GIT-01', 'chain', `revision 链断裂：缺 r${r} 的 changelog`));
    }
  } catch (e) { out.push(F('GIT-02', 'anchor', `git 锚不可用：${String(e.message).split('\n')[0]}（unavailable，非 pass）`, 'info')); }
  return out;
}
const gitRoot = (p) => execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: path.dirname(path.resolve(p)), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

// ───────────────────────── 事务写（contract.md §9） ─────────────────────────

export function txWrite(filePath, mutate, { expectRevision } = {}) {
  const lockPath = filePath + '.lock';
  // stale lock 清理
  if (fs.existsSync(lockPath)) {
    try {
      const lk = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      let dead = false; try { process.kill(lk.pid, 0); } catch { dead = true; }
      if (dead || Date.now() - lk.startedAt > 10 * 60 * 1000) fs.unlinkSync(lockPath);
    } catch { fs.unlinkSync(lockPath); }
  }
  let fd;
  try { fd = fs.openSync(lockPath, 'wx'); } catch { throw new Error(`并发冲突：lockfile 已存在（${lockPath}）`); }
  fs.writeSync(fd, JSON.stringify({ pid: process.pid, startedAt: Date.now() })); fs.closeSync(fd);
  const bakPath = filePath + '.bak';
  try {
    const orig = fs.readFileSync(filePath, 'utf8');
    const a = parseArtifact(orig);
    if (expectRevision !== undefined && a.stamp.revision !== expectRevision) throw new Error(`CAS 冲突：文件 revision=${a.stamp.revision}，预期 ${expectRevision}`);
    const next = mutate(a); // mutate 返回新的 artifact 对象（含更新后的 stamp）
    next.stamp.hashes = computeHashes(next);
    next.stamp.lastValidatedAt = new Date().toISOString();
    const errs = [...validateData({ specVersion: next.specVersion, contract: next.contract, ledger: next.ledger }), ...validateTemplates(next.templates, next.contract), ...validateEnvelope(next)].filter((f0) => f0.level !== 'info');
    if (errs.length) throw new Error('validator 拒绝写入：\n' + errs.map((e) => `  [${e.code}] ${e.ref}: ${e.message}`).join('\n'));
    const content = buildArtifact(next);
    parseArtifact(content); // rename 前回读自检
    const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.tmp-${process.pid}`);
    const tfd = fs.openSync(tmpPath, 'w'); fs.writeSync(tfd, content); fs.fsyncSync(tfd); fs.closeSync(tfd);
    fs.copyFileSync(filePath, bakPath);
    fs.renameSync(tmpPath, filePath);
    try { const dfd = fs.openSync(path.dirname(path.resolve(filePath)), 'r'); fs.fsyncSync(dfd); fs.closeSync(dfd); } catch {}
    try { parseArtifact(fs.readFileSync(filePath, 'utf8')); } catch (e) { fs.copyFileSync(bakPath, filePath); throw new Error(`rename 后回读失败，已从 .bak 回滚：${e.message}`); }
    fs.unlinkSync(bakPath);
    return next;
  } finally { try { fs.unlinkSync(lockPath); } catch {} }
}

const bumpRevision = (a, type, changed = []) => {
  const rev = a.stamp.revision + 1;
  a.stamp.parentRevision = a.stamp.revision; a.stamp.revision = rev;
  a.ledger.changelog.push({ rev, at: new Date().toISOString(), type, changed });
  return a;
};

// ───────────────────────── 命令 ─────────────────────────

const VERSIONS = { artifactVersion: 1, engineVersion: '0.1.0-stub', validatorVersion: '1.0.0' };

function cmdNew(filePath, { id, title }) {
  if (fs.existsSync(filePath)) throw new Error(`已存在：${filePath}（new 不覆盖）`);
  if (!id || !title) throw new Error('用法：spec.mjs new <path> --id FEAT-x --title 标题');
  const a = {
    specVersion: 1,
    contract: { meta: { id, title }, sources: [], flows: [], states: [], transitions: [], requirements: [], scenarios: [], issues: [] },
    ledger: { runs: [], acceptances: [], sourceObservations: [], annotations: [], recoveries: [], changelog: [{ rev: 1, at: new Date().toISOString(), type: 'spec', changed: [] }] },
    progress: { stage: 'intake', currentFlow: null, nextAction: '登记来源并建 flow 地图', pendingDecisions: [], worthIt: null, updatedAt: new Date().toISOString() },
    stamp: { ...VERSIONS, revision: 1, parentRevision: 0, hashes: {}, lastValidatedAt: null },
    templates: {}, ...loadEngine(),
  };
  a.stamp.engineVersion = a.engineVersion ?? a.stamp.engineVersion;
  a.stamp.hashes = computeHashes(a);
  fs.writeFileSync(filePath, buildArtifact(a));
  console.log(`已创建 ${filePath}（r1）`);
}

function cmdExtract(filePath, { out }) {
  const a = parseArtifact(fs.readFileSync(filePath, 'utf8'));
  const payload = JSON.stringify({ specVersion: a.specVersion, contract: a.contract, ledger: a.ledger, templates: a.templates }, null, 2);
  if (out) { fs.writeFileSync(out, payload); console.log(`已导出 ${out}`); } else console.log(payload);
}

function shallowDiffRefs(oldC, newC) {
  const changed = [];
  for (const key of ['flows', 'states', 'transitions', 'requirements', 'scenarios', 'issues', 'sources']) {
    const om = new Map((oldC[key] ?? []).map((x) => [x.id, x])), nm = new Map((newC[key] ?? []).map((x) => [x.id, x]));
    for (const [nid, nv] of nm) {
      const ov = om.get(nid);
      if (!ov) { changed.push({ ref: nid, fields: ['*new*'] }); continue; }
      const fields = Object.keys({ ...ov, ...nv }).filter((f0) => canonical(ov[f0] ?? null) !== canonical(nv[f0] ?? null));
      if (fields.length) changed.push({ ref: nid, fields });
    }
    for (const oid of om.keys()) if (!nm.has(oid)) changed.push({ ref: oid, fields: ['*removed*'] });
  }
  return changed;
}

function cmdSave(filePath, { data, expectRevision, gate, retemplate }) {
  if (!data && !retemplate) throw new Error('用法：spec.mjs save <path> [--data <payload.json>] [--retemplate] [--expect-revision N] [--gate 名称]');
  const payload = data ? JSON.parse(fs.readFileSync(data, 'utf8')) : null;
  const next = txWrite(filePath, (a) => {
    if (retemplate) {
      const eng = loadEngine();
      a.engineScript = eng.engineScript; a.engineStyle = eng.engineStyle; a.stamp.engineVersion = eng.engineVersion;
      if (!payload) return bumpRevision(a, 'engine', []);
    }
    const changed = payload?.contract ? shallowDiffRefs(a.contract, payload.contract) : [];
    if (payload?.contract) a.contract = payload.contract;
    if (payload?.templates) a.templates = payload.templates;
    if (payload?.progress) a.progress = { ...payload.progress, updatedAt: new Date().toISOString() };
    return bumpRevision(a, retemplate ? 'engine' : 'spec', changed);
  }, { expectRevision: expectRevision !== undefined ? Number(expectRevision) : undefined });
  console.log(`已保存 ${filePath}（r${next.stamp.revision}）`);
  if (gate) {
    const root = gitRoot(filePath), rel = path.relative(root, path.resolve(filePath));
    execFileSync('git', ['add', '--', rel], { cwd: root });
    // 注意：不用 `--` 分隔 pathspec——环境的 git 包装器会在参数末尾追加 trailer 的 -m，
    // 出现在 `--` 之后会被当成 pathspec 而炸掉（已知坑）。rel 不以 - 开头，直接跟即可。
    execFileSync('git', ['commit', '-m', `spec(${next.contract.meta.id}): gate ${gate} r${next.stamp.revision}`, '--only', rel], { cwd: root });
    console.log(`gate commit 完成：gate ${gate} r${next.stamp.revision}`);
  }
}

function cmdRefreshSources(filePath) {
  const next = txWrite(filePath, (a) => {
    const n = (a.ledger.sourceObservations ?? []).length;
    const batchId = `BATCH-${(new Set(a.ledger.sourceObservations.map((o) => o.batchId))).size + 1}`;
    const root = gitRoot(filePath);
    a.contract.sources.forEach((src, i) => {
      const obs = { id: `OBS-${n + i + 1}`, batchId, sourceRef: src.id, observedAt: new Date().toISOString() };
      const p = path.resolve(root, src.locator);
      if ((src.kind === 'doc' || src.kind === 'code') && fs.existsSync(p) && fs.statSync(p).isFile()) {
        obs.observedHash = sha256hex(fs.readFileSync(p));
        const prev = [...a.ledger.sourceObservations].reverse().find((o) => o.sourceRef === src.id && o.observedHash);
        obs.outcome = !prev || prev.observedHash === obs.observedHash ? 'unchanged' : 'changed';
      } else {
        obs.observedHash = null; obs.outcome = 'unavailable';
        obs.unavailableReason = `file-source adapter 无法取得（kind=${src.kind}，非本地文件或不存在）`;
      }
      a.ledger.sourceObservations.push(obs);
    });
    return bumpRevision(a, 'source', [{ ref: batchId, fields: [] }]);
  });
  console.log(`refresh-sources 完成（r${next.stamp.revision}）`);
  for (const o of next.ledger.sourceObservations.slice(-next.contract.sources.length)) console.log(`  ${o.sourceRef}: ${o.outcome}${o.unavailableReason ? '（' + o.unavailableReason + '）' : ''}`);
}

function cmdStatus(filePath) {
  const a = parseArtifact(fs.readFileSync(filePath, 'utf8'));
  const d = deriveStatus({ contract: a.contract, ledger: a.ledger });
  const lines = [];
  lines.push(`# ${a.contract.meta.title}（${a.contract.meta.id}） r${a.stamp.revision}`);
  lines.push(`五元组: specAcceptance=${d.specAcceptance} | implementation=${d.implementationStatus} | sources={${Object.entries(d.sourceStatus).map(([k, v]) => `${k}:${v}`).join(', ')}} | openBlockers=${d.openBlockers} | proposedAnnotations=${d.proposedAnnotations}`);
  for (const f0 of a.contract.flows) lines.push(`flow ${f0.id} [${f0.core ? 'core' : 'normal'}/${f0.risk}] align=${f0.alignStatus} impl=${d.flowStatus[f0.id]}`);
  for (const [k, v] of Object.entries(d.scenarioValue)) lines.push(`  scenario ${k}: ${v}`);
  lines.push(`progress: stage=${a.progress.stage} currentFlow=${a.progress.currentFlow} next=${a.progress.nextAction}`);
  const recent = (a.ledger.changelog ?? []).slice(-5);
  lines.push(`changelog(最近${recent.length}): ` + recent.map((e) => `r${e.rev}:${e.type}`).join(' '));
  console.log(lines.join('\n'));
}

function cmdValidate(filePath, { strict, againstGit }) {
  const a = parseArtifact(fs.readFileSync(filePath, 'utf8'));
  let root; try { root = gitRoot(filePath); } catch { root = path.dirname(path.resolve(filePath)); }
  let findings = [
    ...validateData({ specVersion: a.specVersion, contract: a.contract, ledger: a.ledger }, { strict, repoRoot: root }),
    ...validateTemplates(a.templates, a.contract),
    ...validateEnvelope(a),
  ];
  if (againstGit) findings.push(...validateAgainstGit(filePath, a));
  if (strict) findings = findings.map((f0) => f0.code === 'GIT-02' ? { ...f0, level: 'error' } : f0);
  for (const f0 of findings) console.log(`[${f0.level}] ${f0.code} ${f0.ref}: ${f0.message}`);
  const errors = findings.filter((f0) => f0.level === 'error');
  console.log(errors.length ? `✗ ${errors.length} error` : '✓ 0 error');
  process.exitCode = errors.length ? 1 : 0;
}

function cmdRecovery(filePath, { reason }) {
  if (!reason) throw new Error('用法：spec.mjs recovery <path> --reason 原因');
  const root = gitRoot(filePath), rel = path.relative(root, path.resolve(filePath));
  const cur = (() => { try { return parseArtifact(fs.readFileSync(filePath, 'utf8')); } catch { return null; } })();
  const metaId = cur?.contract?.meta?.id;
  const log = execFileSync('git', ['log', '--format=%H %s', '--', rel], { cwd: root, encoding: 'utf8' });
  const gate = log.split('\n').find((ln) => metaId ? ln.includes(`spec(${metaId}): gate `) : ln.includes(': gate '));
  if (!gate) throw new Error('recovery 失败：无 gate commit 可信基线');
  const [hash] = gate.split(' ');
  const base = parseArtifact(execFileSync('git', ['show', `${hash}:${rel}`], { cwd: root, encoding: 'utf8' }));
  const baseRev = base.stamp.revision;
  const maxRev = Math.max(baseRev, cur?.stamp?.revision ?? 0, ...(cur?.ledger?.changelog ?? []).map((e) => e.rev));
  const fromRevision = cur?.stamp?.revision ?? null;
  const next = base;
  next.stamp.parentRevision = baseRev;
  next.stamp.revision = maxRev + 1;
  next.ledger.recoveries.push({ at: new Date().toISOString(), reason, fromRevision, trustedBaseCommit: hash, diffSummary: `恢复到 gate r${baseRev}` });
  next.ledger.changelog.push({ rev: next.stamp.revision, at: new Date().toISOString(), type: 'recovery', changed: [] });
  next.stamp.hashes = computeHashes(next);
  fs.writeFileSync(filePath + '.tmp-recovery', buildArtifact(next));
  parseArtifact(fs.readFileSync(filePath + '.tmp-recovery', 'utf8'));
  fs.renameSync(filePath + '.tmp-recovery', filePath);
  console.log(`recovery 完成：基线 gate r${baseRev}（${hash.slice(0, 7)}）→ r${next.stamp.revision}`);
}

// ───────────────────────── verification gate / record-run / accept（contract.md §7） ─────────────────────────

function cmdConfirmCommand(filePath, { scenario, command }) {
  if (!scenario || !command) throw new Error('用法：spec.mjs confirm-command <path> --scenario SCN-x --command "…"');
  const next = txWrite(filePath, (a) => {
    const scn = a.contract.scenarios.find((s) => s.id === scenario);
    if (!scn) throw new Error(`场景不存在：${scenario}`);
    scn.verification.command = command;
    scn.verification.commandHash = sha256hex(command);
    scn.verification.commandConfirmedAt = new Date().toISOString();
    return bumpRevision(a, 'spec', [{ ref: scenario, fields: ['verification.command'] }]);
  });
  console.log(`verification gate：${scenario} 命令已冻结（r${next.stamp.revision}）`);
}

function globFiles(root, pattern) {
  const segs = pattern.split('/');
  let rxs = '^';
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i], last = i === segs.length - 1;
    if (seg === '**') { rxs += last ? '.*' : '(?:.+/)?'; continue; }
    rxs += seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + (last ? '' : '/');
  }
  const rx = new RegExp(rxs + '$');
  const found = [];
  const walk = (d) => { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { if (e.name === '.git' || e.name === 'node_modules') continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (rx.test(path.relative(root, p).split(path.sep).join('/'))) found.push(p); } };
  walk(root);
  return found;
}

function judgeAssert(root, evidencePolicy) {
  const files = globFiles(root, evidencePolicy.path ?? '**/*.xml');
  let tests = 0, bad = 0;
  const evidence = [];
  for (const f0 of files) {
    const xml = fs.readFileSync(f0, 'utf8');
    for (const m of xml.matchAll(/<testsuite\b[^>]*>/g)) {
      tests += Number((m[0].match(/\btests="(\d+)"/) || [])[1] ?? 0);
      bad += Number((m[0].match(/\bfailures="(\d+)"/) || [])[1] ?? 0) + Number((m[0].match(/\berrors="(\d+)"/) || [])[1] ?? 0);
    }
    evidence.push({ path: path.relative(root, f0).split(path.sep).join('/'), sha256: sha256hex(fs.readFileSync(f0)), type: 'junit-xml', size: fs.statSync(f0).size, redacted: false });
  }
  const result = tests > 0 && bad === 0 ? 'passed' : 'failed';
  return { result, testCount: tests, evidence, note: `junit: files=${files.length} tests=${tests} failed=${bad}` };
}

function evalPredicate(predStr, actual) {
  const pm = String(predStr ?? '').trim().match(/^(==|!=|>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/);
  if (!pm) return null;
  const exp = parseFloat(pm[2]);
  return { '==': actual === exp, '!=': actual !== exp, '>=': actual >= exp, '<=': actual <= exp, '>': actual > exp, '<': actual < exp }[pm[1]];
}

function judgeDb(assertion, stdout) {
  const lines = stdout.trim().split('\n').filter(Boolean);
  const actual = parseFloat(lines[lines.length - 1]);
  if (Number.isNaN(actual)) return { result: 'blocked', note: `输出末行不是数值：${lines[lines.length - 1] ?? '(空)'}` };
  const ok = evalPredicate(assertion.predicate, actual);
  if (ok === null) return { result: 'blocked', note: `predicate 不可解析：${assertion.predicate}` };
  return { result: ok ? 'passed' : 'failed', note: `db: actual=${actual} predicate=${assertion.predicate}` };
}

// 文件树/包存在性对账（mini-app specs 原文的 file-tree reconciliation）
function judgeFile(root, assertion) {
  const paths = assertion.paths ?? [];
  if (!paths.length) return { result: 'blocked', note: 'assertion.paths 为空' };
  const missing = [], evidence = [];
  for (const pat of paths) {
    const hits = pat.includes('*') ? globFiles(root, pat) : (fs.existsSync(path.resolve(root, pat)) ? [path.resolve(root, pat)] : []);
    if (!hits.length) { missing.push(pat); continue; }
    for (const f0 of hits.slice(0, 20)) evidence.push({ path: path.relative(root, f0).split(path.sep).join('/'), sha256: sha256hex(fs.readFileSync(f0)), type: 'file', size: fs.statSync(f0).size, redacted: false });
  }
  return { result: missing.length === 0 ? 'passed' : 'failed', evidence, note: `file: ${paths.length - missing.length}/${paths.length} 存在${missing.length ? '，缺失：' + missing.join(', ') : ''}` };
}

// 模板/配置/密钥绑定对账（只验存在与计数，绝不落值——secret 安全）
function judgeGrep(root, assertion) {
  if (!assertion.pattern || !assertion.path) return { result: 'blocked', note: 'assertion 需 {path, pattern, predicate}' };
  let re; try { re = new RegExp(assertion.pattern, 'g'); } catch (e) { return { result: 'blocked', note: `pattern 不可解析：${e.message}` }; }
  const files = globFiles(root, assertion.path);
  let count = 0; const hitFiles = [];
  for (const f0 of files) {
    const n = (fs.readFileSync(f0, 'utf8').match(re) ?? []).length;
    if (n > 0) { count += n; hitFiles.push(path.relative(root, f0).split(path.sep).join('/')); }
  }
  const ok = evalPredicate(assertion.predicate, count);
  if (ok === null) return { result: 'blocked', note: `predicate 不可解析：${assertion.predicate}` };
  return { result: ok ? 'passed' : 'failed', evidence: hitFiles.slice(0, 20).map((f0) => ({ path: f0, sha256: sha256hex(fs.readFileSync(path.resolve(root, f0))), type: 'grep-hit', size: 0, redacted: true })), note: `grep: 命中 ${count}（files=${files.length}）predicate=${assertion.predicate}（仅计数，不落匹配值）` };
}

const redact = (s) => { let hit = false; const r = s.replace(/\b(token|secret|password|passwd|api[-_]?key|authorization)\b(["']?\s*[=:]\s*)\S+/gi, (m0, k, sep) => { hit = true; return k + sep + '[REDACTED]'; }); return { text: r, hit }; };

function cmdRecordRun(filePath, opts) {
  const { scenario } = opts;
  if (!scenario) throw new Error('用法：spec.mjs record-run <path> --scenario SCN-x [--timeout ms] [--build-variant v --device-package p --device-serial s]');
  const pre = parseArtifact(fs.readFileSync(filePath, 'utf8'));
  const scn = pre.contract.scenarios.find((s) => s.id === scenario);
  if (!scn) throw new Error(`场景不存在：${scenario}`);
  const v = scn.verification;
  if (!['assert', 'db', 'file', 'grep'].includes(v.kind)) throw new Error(`判定器 ${v.kind} 尚未实现（当前支持 assert/db/file/grep；mock/manual 走各自路径）`);
  const needsCmd = ['assert', 'db'].includes(v.kind);
  if (needsCmd && (!v.command || !v.commandConfirmedAt)) throw new Error(`命令未经 verification gate 冻结，先执行 confirm-command`);
  if (v.kind === 'db' && !(opts.buildVariant && opts.devicePackage && opts.deviceSerial)) throw new Error('db 场景必须提供 --build-variant/--device-package/--device-serial（LED-01）');
  const root = gitRoot(filePath);
  const timeoutMs = Number(opts.timeout ?? 600000);
  let gitHead; try { gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { gitHead = '(no-git-head)'; }
  const dirtyOut = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
  const dirty = dirtyOut.trim().length > 0;
  const dirtyDiffHash = dirty ? sha256hex(execFileSync('git', ['diff'], { cwd: root, encoding: 'utf8' })) : undefined;
  // 脚本亲自执行冻结命令（agent 只提供命令、不提供结果）；file/grep 为 judge-only，直接核对仓库现状
  const started = new Date().toISOString();
  const sp = needsCmd
    ? spawnSync(v.command, { shell: true, cwd: root, timeout: timeoutMs, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    : { status: 0, stdout: '', stderr: '', signal: null, error: null };
  const rawOut = (sp.stdout ?? '') + (sp.stderr ?? '');
  const { text: safeOut, hit: redacted } = redact(rawOut);
  const timedOut = sp.error?.code === 'ETIMEDOUT' || sp.signal === 'SIGTERM' && sp.error;
  let judge;
  if (sp.error && !timedOut) judge = { result: 'blocked', note: `执行失败：${sp.error.message}` };
  else if (timedOut || sp.signal) judge = { result: 'blocked', note: `timeout/signal：${sp.signal ?? 'ETIMEDOUT'}` };
  else if (v.kind === 'assert') judge = judgeAssert(root, v.evidencePolicy ?? {});
  else if (v.kind === 'file') judge = judgeFile(root, v.assertion ?? {});
  else if (v.kind === 'grep') judge = judgeGrep(root, v.assertion ?? {});
  else judge = judgeDb(v.assertion ?? {}, sp.stdout ?? '');
  // 证据：输出日志落 artifact 旁 evidence/
  const evDir = path.join(path.dirname(path.resolve(filePath)), 'evidence');
  fs.mkdirSync(evDir, { recursive: true });
  const runId = `RUN-${(pre.ledger.runs ?? []).length + 1}`;
  const logPath = path.join(evDir, `${runId}-output.log`);
  fs.writeFileSync(logPath, safeOut);
  const logEv = { path: path.relative(root, logPath).split(path.sep).join('/'), sha256: sha256hex(fs.readFileSync(logPath)), type: 'log', size: fs.statSync(logPath).size, redacted };
  const examples = (scn.examples ?? []).length ? scn.examples : [{ id: `${scn.id}-implicit` }];
  const next = txWrite(filePath, (a) => {
    bumpRevision(a, 'run', [{ ref: runId, fields: [] }]);
    a.ledger.runs.push({
      id: runId, scenarioRef: scenario,
      scenarioFingerprint: fingerprintOf(scn), verificationHash: verificationHashOf(v),
      exampleResults: examples.map((ex) => ({ exampleRef: ex.id, result: judge.result })),
      at: started, revision: a.stamp.revision, gitHead, dirty, ...(dirty ? { dirtyDiffHash } : {}),
      cmd: v.command ?? `(judge-only:${v.kind})`, cmdHash: v.commandHash ?? sha256hex(canonical(v.assertion ?? {})), exitCode: sp.status ?? -1, ...(sp.signal ? { signal: sp.signal } : {}),
      timeoutMs, ...(v.kind === 'assert' ? { testCount: judge.testCount ?? 0 } : {}),
      outputExcerpt: safeOut.slice(0, 2000), redacted, outputSha256: sha256hex(safeOut),
      evidence: [logEv, ...(judge.evidence ?? [])], result: judge.result,
      ...(v.kind === 'db' ? { buildVariant: opts.buildVariant, devicePackage: opts.devicePackage, deviceSerial: opts.deviceSerial } : {}),
    });
    return a;
  }, { expectRevision: pre.stamp.revision });
  const d = deriveStatus({ contract: next.contract, ledger: next.ledger });
  console.log(`${runId}: ${judge.result}（${judge.note ?? ''}）→ ${scenario} 推导状态=${d.scenarioValue[scenario]}（r${next.stamp.revision}）`);
}

function cmdAccept(filePath, { verbatim }) {
  if (!verbatim) throw new Error('用法：spec.mjs accept <path> --verbatim "用户原话"（须先 refresh-sources）');
  const next = txWrite(filePath, (a) => {
    const batches = []; for (const o of a.ledger.sourceObservations) if (!batches.includes(o.batchId)) batches.push(o.batchId);
    const latest = batches[batches.length - 1];
    if (!latest) throw new Error('无任何 refresh 批次：acceptance 前必须 refresh-sources');
    bumpRevision(a, 'acceptance', []);
    a.ledger.acceptances.push({ id: `ACC-${a.ledger.acceptances.length + 1}`, at: new Date().toISOString(), verbatim, revision: a.stamp.revision, sourceBatchId: latest, sourceWaivers: [], deviationsAcknowledged: [] });
    return a;
  });
  console.log(`acceptance 写入（r${next.stamp.revision}）：${verbatim}`);
}

function cmdMergeFeedback(filePath, { data }) {
  if (!data) throw new Error('用法：spec.mjs merge-feedback <path> --data <浏览器导出的 JSON 文件>');
  const payload = JSON.parse(fs.readFileSync(data, 'utf8'));
  if (!Array.isArray(payload.annotations) || !payload.annotations.length) throw new Error('payload 无 annotations');
  const next = txWrite(filePath, (a) => {
    if (payload.specId && payload.specId !== a.contract.meta.id) throw new Error(`payload specId(${payload.specId}) ≠ 合同(${a.contract.meta.id})`);
    if (payload.revision != null && payload.revision < a.stamp.revision) console.warn(`警告：批注导出自 r${payload.revision}，合同现为 r${a.stamp.revision}——锚点若已失效会被 REF-01 挡下，其余请人工核对语境`);
    bumpRevision(a, 'annotation', payload.annotations.map((x) => ({ ref: x.targetId, fields: ['annotation'] })));
    for (const x of payload.annotations) {
      a.ledger.annotations.push({ id: `ANN-${a.ledger.annotations.length + 1}`, targetId: x.targetId, comment: x.comment, ...(x.proposal ? { proposal: x.proposal } : {}), status: 'proposed' });
    }
    return a; // targetId 可解析性由 validator REF-01 挡门
  });
  console.log(`merge-feedback：合并 ${payload.annotations.length} 条为 proposed（r${next.stamp.revision}）；acceptance 前必须逐条裁决（resolved/rejected）`);
}

function cmdExportMd(filePath, { out }) {
  const a = parseArtifact(fs.readFileSync(filePath, 'utf8'));
  const c = a.contract, d = deriveStatus({ contract: c, ledger: a.ledger });
  const L2 = [];
  L2.push(`# ${c.meta.title}（${c.meta.id}） r${a.stamp.revision}`, '');
  L2.push(`> 由 mini-app-spec.html 降级导出（便携只读；权威产物是 HTML+合同）。`, '');
  L2.push(`**状态**：specAcceptance=${d.specAcceptance} · implementation=${d.implementationStatus} · openBlockers=${d.openBlockers} · proposed批注=${d.proposedAnnotations}`, '');
  L2.push('## 来源', '');
  for (const s of c.sources) L2.push(`- \`${s.id}\` ${s.kind} · ${s.locator}（${s.version}）— ${s.role}【${d.sourceStatus[s.id]}】`);
  for (const f0 of c.flows) {
    L2.push('', `## ${f0.title}（\`${f0.id}\`${f0.core ? ' · core' : ''} · ${f0.risk === 'high' ? '高不确定' : '低风险'} · ${f0.alignStatus}）`, '');
    L2.push('状态：' + f0.stateRefs.map((sid) => { const st = c.states.find((x) => x.id === sid); return st ? `\`${st.id}\`${st.name}${st.terminal ? '(终)' : ''}` : sid; }).join(' · '));
    L2.push('', '| 转移 | 从→到 | 触发 | 结果 | default/guard |', '|---|---|---|---|---|');
    for (const t of c.transitions.filter((x) => x.flowRef === f0.id)) L2.push(`| \`${t.id}\` | ${t.from}→${t.to} | ${t.trigger} | ${t.result} | ${t.isDefault ? 'default' : (t.guard ?? '')} |`);
    for (const s of c.scenarios.filter((x) => x.flowRef === f0.id)) {
      L2.push('', `### \`${s.id}\`（verify:${s.verification.kind}，${d.scenarioValue[s.id]}）`, '');
      for (const g of s.given) L2.push(`- 假如 ${g}`);
      L2.push(`- 当 ${s.when}`);
      for (const t of s.then) L2.push(`- 那么 ${t}`);
      for (const ex of s.examples ?? []) L2.push(`- 例 \`${ex.id}\`：${JSON.stringify(ex.values)}`);
    }
  }
  if (c.issues.length) { L2.push('', '## 未决 issues', ''); for (const i of c.issues.filter((x) => x.status === 'open')) L2.push(`- \`${i.id}\`（${i.type}）${i.question}`); }
  if ((a.ledger.runs ?? []).length) { L2.push('', '## 运行记录', ''); for (const r of a.ledger.runs) L2.push(`- \`${r.id}\` → ${r.scenarioRef}：${r.result}（${r.at}，evidence×${(r.evidence ?? []).length}）`); }
  const md = L2.join('\n') + '\n';
  const dest = out ?? filePath.replace(/\.html$/, '.md');
  fs.writeFileSync(dest, md);
  console.log(`export-md：${dest}（${md.length} 字节，只读降级产物，不参与 envelope）`);
}

function cmdAnnotate(filePath, { id, status }) {
  if (!id || !['resolved', 'rejected', 'proposed', 'outdated'].includes(status)) throw new Error('用法：spec.mjs annotate <path> --id ANN-x --status resolved|rejected|proposed|outdated（裁决权在用户，agent 只代录）');
  const next = txWrite(filePath, (a) => {
    const an = a.ledger.annotations.find((x) => x.id === id);
    if (!an) throw new Error(`批注不存在：${id}`);
    an.status = status;
    return bumpRevision(a, 'annotation', [{ ref: an.targetId, fields: ['annotation.status'] }]);
  });
  console.log(`${id} → ${status}（r${next.stamp.revision}）`);
}

// ───────────────────────── main ─────────────────────────

function parseArgs(argv) {
  const pos = [], opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) { opts[k] = argv[++i]; } else opts[k] = true;
    } else pos.push(argv[i]);
  }
  return { pos, opts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, opts } = parseArgs(rest);
  try {
    if (cmd === 'new') cmdNew(pos[0], opts);
    else if (cmd === 'extract') cmdExtract(pos[0], opts);
    else if (cmd === 'save') cmdSave(pos[0], opts);
    else if (cmd === 'status') cmdStatus(pos[0]);
    else if (cmd === 'validate') cmdValidate(pos[0], opts);
    else if (cmd === 'refresh-sources') cmdRefreshSources(pos[0]);
    else if (cmd === 'recovery') cmdRecovery(pos[0], opts);
    else if (cmd === 'confirm-command') cmdConfirmCommand(pos[0], opts);
    else if (cmd === 'record-run') cmdRecordRun(pos[0], opts);
    else if (cmd === 'accept') cmdAccept(pos[0], opts);
    else if (cmd === 'merge-feedback') cmdMergeFeedback(pos[0], opts);
    else if (cmd === 'annotate') cmdAnnotate(pos[0], opts);
    else if (cmd === 'export-md') cmdExportMd(pos[0], opts);
    else { console.log('用法：spec.mjs <new|extract|save|status|validate|refresh-sources|recovery|confirm-command|record-run|accept> <path> [选项]'); process.exitCode = 2; }
  } catch (e) { console.error(`错误：${e.message}`); process.exitCode = 1; }
}
