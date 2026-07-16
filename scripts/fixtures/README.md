# Validator Fixtures

规则编号见 `references/contract.md` §11。fixture 覆盖 contract+ledger 层规则；TPL 规则用 HTML 片段 fixture；GIT-01/02 用临时 git 仓库 + fixture gate commit 在测试装置中构造（contract.md [N-11]）。

## 格式约定

- **好例**：完整 `{specVersion, contract, ledger}` JSON。fingerprint/hash 字段为占位值（`fp1:demo…`），结构校验不验其算值；算值一致性属状态推导，由 D3 的推导测试另测。
- **坏例**：`bad-*.json`，格式 `{description, base, expect, ops}`——`ops` 为 RFC6902 JSON-Patch，应用于 `base` 后送 validator；`expect` = validator **至少必须报告**的规则码（允许伴随其他码，如 FSM-05 常伴 FSM-03）。
- 测试装置流程：读 base → 应用 ops → validate → 断言 expect ⊆ 实际报告码集。

## 清单

| 文件 | base | expect | 说明 |
|---|---|---|---|
| valid-minimal.json | — | 0 error | 最小合法：单流单状态（entry+terminal），manual 场景 |
| valid-typical.json | — | 0 error | 双状态链+守卫回边、assert 场景+examples、passed run、完整 refresh 批次+合法 acceptance |
| bad-str04-duplicate-id.json | minimal | STR-04 | 重复 state id |
| bad-ref01-dangling.json | minimal | REF-01 | stateRefs 引用幽灵状态 |
| bad-fsm01-no-entry.json | minimal | FSM-01 | 全 flow 无 entry 状态 |
| bad-fsm02-unreachable.json | typical | FSM-02 | 不可达孤儿状态 |
| bad-fsm04-double-default.json | typical | FSM-04 | 同状态两条无 guard 出边均 isDefault |
| bad-fsm05-loop-default.json | typical | FSM-05 | default 路径成环且未标 loopAllowed（FSM-03 可伴报） |
| bad-alg01-derived-stored.json | minimal | ALG-01 | scenario 落盘手写 status:"passed" |
| bad-alg02-uncovered.json | minimal | ALG-02 | behavior 需求无场景无 waiver |
| bad-alg03-waiver.json | minimal | ALG-03 | waiver 缺 authority/approvedAt |
| bad-alg04-passed-no-evidence.json | typical | ALG-04 | passed run 证据为空 |
| bad-alg05-testcount.json | typical | ALG-05 | assert run testCount=0 |
| bad-led01-db-context.json | typical | LED-01 | db 场景 run 缺设备上下文 |
| bad-led02-no-fingerprint.json | typical | LED-02 | run 缺 scenarioFingerprint |
| bad-acc01-stale-batch.json | typical | ACC-01 | acceptance 引用旧 refresh 批次 |
| bad-acc02-unavailable.json | typical | ACC-02 | 批次含 unavailable 来源且无 sourceWaiver |
| bad-acc03-open-blocker.json | typical | ACC-03 | 存在 open blocker 仍有 acceptance |
| bad-tpl01-script.html | — | TPL-01 | template 内含 `<script>` |
| bad-tpl02-datago.html | typical | TPL-02 | data-go 指向 from≠所属 state 的 transition |

## 运行

- `node scripts/run-fixtures.mjs` — 本目录 fixtures 验收（validateData/validateTemplates）。
- `node scripts/run-injections.mjs` — 第一阶段故障注入四组（完整性/事务/防假绿/生命周期），在临时 git 仓库全自动执行，覆盖 GIT-01/02、ENV-01、CAS/锁、record-run 判定器、fingerprint 失效/复原、来源门与 acceptance、retemplate 零丢失。
