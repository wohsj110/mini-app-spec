# mini-app-spec Contract v1（SSOT）

> 本文档是 mini-app-spec 字段合同、revision 语义、状态代数、判定器与安全规则的**唯一权威定义**。
> `spec.mjs` 与 validator 照此实现；SKILL.md 不复述本文内容。本文自足，理解与实现不依赖任何 skill 目录外的文件；设计沿革（仅历史参考，不随 skill 分发）：宿主仓库 `docs/plans/2026-07-16-mini-app-spec-redesign-final.md`（v3.1 GO）。
> 三评「实现期注意事项」12 项已逐条落入本文（各节标注 `[N-x]`）。

## 0. 版本与演进

- `specVersion: 1`。加**可选**字段 = minor（老引擎/validator 忽略未知字段）；新增必填字段或语义变化 = major。
- validator 遇到 major 大于自身支持版本 ⇒ 整体判 `blocked`，不猜测解析。
- 迁移代码只在出现需要迁移的真实存量时编写。

## 1. 威胁模型

防**误操作 / 偷懒 / 幻觉**，不防恶意 Agent（同信任域无密码学防篡改，不建外部签名/CI）。

- 轻封印（envelope）= 事故与偷懒检测，不是防伪。
- 回放/带外覆盖检测的唯一可信锚 = git gate commit（§3.2）；无锚时如实返回 `unavailable`，**unavailable ≠ pass** [N-1]。
- 最终防线 = 停点②用户亲眼看证据。

## 2. Artifact 结构

```
mini-app-spec.html
├─ 引擎段（单个 <script> + 单个 <style>，engineVersion 版本化）
├─ <script type="application/json" id="mini-app-contract">
├─ <script type="application/json" id="mini-app-ledger">
├─ <script type="application/json" id="mini-app-progress">   # 非可信，不进 envelope
├─ <script type="application/json" id="mini-app-stamp">
└─ <template id="ui-ST-*"> × N
```

- 四个数据块 id 与每个 template id 全文唯一；重复 ⇒ `STR-05`。
- JSON 内嵌前 `<` 转义为 `<`。
- stamp：`{artifactVersion, engineVersion, validatorVersion, revision, parentRevision, hashes:{contract, templates, engine, ledger}, lastValidatedAt}`。
  - `templates` hash = 全部 template 块按 id 字典序拼接后的 sha256；`engine` hash = 引擎段（script+style 原文）sha256——**与 CSP hash 是两个不同的值**（§8.2）[N-9]。

## 3. Revision 语义

### 3.1 操作分类（全部事务写一律 `revision++`）[N-5]

| 操作 | 落块 | revision++ | parent | 更新 hash |
|---|---|---|---|---|
| `save`（规格/模板编辑） | contract/templates | ✅ | 当前 | contract, templates |
| `record-run` | ledger | ✅ | 当前 | ledger |
| manual confirmation / 撤回 | ledger（作为 run 事实，§7.4） | ✅ | 当前 | ledger |
| verification gate 确认命令 | contract（verification.command*） | ✅ | 当前 | contract |
| 批注合并/状态更新 | ledger | ✅ | 当前 | ledger |
| `refresh-sources` | ledger | ✅ | 当前 | ledger |
| decidedImpact / acceptance 写入 | ledger | ✅ | 当前 | ledger |
| `save --retemplate` | 引擎段 | ✅ | 当前 | engine（+CSP hash 联动 §8.2） |
| recovery | 全文件重建 | ✅（= 可见最大 revision + 1）[N-2] | **恢复源（最近 gate 基线）revision** | 全量重算 |
| `save --gate` | 无（仅 git commit） | ❌ | — | — |
| `status` / `validate` | 只读 | ❌ | — | — |

- `revision` 为**单调递增正整数**；普通事务写 parent = 写前 revision。
- recovery 记录：`recoveries[] += {at, reason, fromRevision(损坏版), trustedBaseCommit, diffSummary}`；新 revision 取当前可见最大值 +1，避免与损坏分支撞号 [N-2]。
- gate commit message：`spec(<meta.id>): gate <名> r<revision>`，只提交本 HTML 路径。
- 隐式 run（manual confirmation）与显式 run 共用 `runs[]` 结构（§7.4），**不允许第二套隐式台账** [N-5]。

### 3.2 `validate --against-git` 精确算法 [N-1]

1. `git log --follow -- <artifact 路径>` 找最近一条 gate commit（message 匹配 `spec(<meta.id>): gate `）；取该 blob 的 stamp。
2. 找不到（无 git 仓库 / 无 gate commit / 浅克隆截断 / 文件改名致 follow 失败）⇒ 返回 `GIT-02: unavailable`（信息级；`--strict` 下要求锚可用，否则 error）。**绝不把 unavailable 当 pass。**
3. 锚可用时校验：
   a. `current.revision > gate.revision`，或 `==` 且四 hash 全等（gate 后无写入）；否则 ⇒ `GIT-01`（疑似回放/带外覆盖）。
   b. **链连续**：ledger.changelog ∪ recoveries 中，`(gate.revision, current.revision]` 区间每个 revision 恰好出现一次、parent 衔接（recovery 允许 parent 指向 gate 基线的分叉）；断裂/重复 ⇒ `GIT-01`。
4. 边界声明：本检测只发现「当前文件相对最近 gate 的倒退/覆盖」，不防 git 历史本身被篡改。

## 4. contract 块字段合同

ID 格式：`SRC-* / FLOW-* / ST-* / TR-* / REQ-* / SCN-* / EX-* / ISS-* / ANN-* / RUN-* / OBS-* / BATCH-* / ACC-* / REC-*`（`[A-Z]+-[A-Za-z0-9_-]+`，全文唯一，永不复用；删除节点标 `removed` 不删条目）。

| 对象 | 字段（★=必填） | 约束 |
|---|---|---|
| `meta` | ★id, ★title | **无状态字段**（一切状态推导，§6） |
| `sources[]` | ★id, ★kind(`doc/figma/code/api/other`), ★locator, ★version(自由文本：sha/版本号/日期，供人定位), ★role；excerpts:[{id,text}]? | current hash 只存在于 ledger.sourceObservations |
| `flows[]` | ★id, ★title, ★priority(`core/normal/low`… 见下), ★risk(`high/low`), ★core(bool), ★alignStatus(`pending/aligned`), ★stateRefs[] | priority 自由文本亦可；**core 判定只看 core 字段** |
| `states[]` | ★id, ★flowRef, ★name, ★uiTemplateRef, ★figma\|figmaNote（二选一）, ★entry(`default/deeplink/notification/resume/none`), ★terminal(bool) | uiTemplateRef 必须指向存在的 template 块 |
| `transitions[]` | ★id, ★flowRef, ★from, ★to, ★trigger, ★result, ★isDefault(bool)；guard?, scenarioRefs[]?, loopAllowed(bool)? | from/to 须属同一 flow（`FSM-06`） |
| `requirements[]` | ★id, ★text, ★kind(`behavior/constraint/non-functional`), ★sourceRefs[]；excerptRef?, scenarioRefs[]?, waiver? | behavior 型须 scenarioRefs 非空或有效 waiver（`ALG-02`） |
| `scenarios[]` | ★id, ★flowRef, ★given[], ★when, ★then[], ★examples:[{★id,★values}], ★verification；stateRefs[]?, demoPath[]?(转移 id 序列——场景卡一键自动演示走查路径；不参与 fingerprint) | examples 可为 `[]`（视作单一隐式 example，id=`<SCN>-implicit`） |
| `issues[]` | ★id, ★type(`blocker/question/tradeoff`), ★question, ★options[], ★impact, ★status(`open/decided`), ★decision(null 直至用户裁决), affectedRefs[]? | decision 唯一合法来源 = 用户回话 |

- `verification`：`{★kind(assert/db/file/grep/mock/manual), ★assertion, ★evidencePolicy, command(null|string), commandHash(null|string), commandConfirmedAt(null|string)}`。`file/grep` 为 judge-only（无命令执行，直接核对仓库现状），command 可为 null，run 的 cmdHash 取 assertion 的 canonical hash。
- `waiver`：`{★reason, ★authority(用户原话或已确认来源定位), ★approvedAt}`；缺任一 ⇒ `ALG-03`。
- **派生状态字段禁止落盘**：contract 任何对象出现 `status`/`result`/`passed` 等推导语义字段（上表列出的枚举字段除外）⇒ `ALG-01`。

### 4.1 FSM 可判定规则（validator 机械执行）

- `FSM-01`：每 flow ≥1 个 `entry ≠ none` 的 state。
- `FSM-02`：flow 内每个 state 从任一 entry 可达。
- `FSM-03`：从每个 entry 沿 default 路径（isDefault 出边；单出边视作 default）可达某个 `terminal=true` 的 state。
- `FSM-04`：同一 state 的多条无 guard 出边中必须恰有一条 `isDefault=true`。
- `FSM-05`：default 路径上的环必须每条环内边 `loopAllowed=true`。
- `FSM-06`：transition 的 from/to/flowRef 三者一致。
- guard 为自由文本（不参与可满足性判定；只参与 default 路径选择的排除）。

## 5. ledger 块字段合同

| 对象 | 字段（★=必填） |
|---|---|
| `runs[]` | ★id, ★scenarioRef, ★scenarioFingerprint, ★verificationHash, ★exampleResults:[{★exampleRef,★result}], ★at, ★revision(写入时的 artifact revision), ★gitHead, ★dirty(bool), dirtyDiffHash(dirty=true 时★), ★cmd, ★cmdHash, ★exitCode, signal?, ★timeoutMs, testCount(assert 类★), ★outputExcerpt(落盘前脱敏), ★redacted(bool), ★outputSha256, ★evidence:[{★path,★sha256,★type,★size,★redacted}], ★result；db/device 场景另★：buildVariant, devicePackage, deviceSerial（`LED-01`） |
| `acceptances[]` | ★id, ★at, ★verbatim, ★revision, ★sourceBatchId, ★sourceWaivers:[{★sourceRef,★verbatim,★at}], ★deviationsAcknowledged:[{★ref,★waiver}] |
| `sourceObservations[]` | ★id, ★batchId, ★sourceRef, ★observedHash(null 允许), unavailableReason?, ★observedAt, ★outcome(`unchanged/changed/unavailable`), decidedImpact?:{★affectedRefs,★decidedAt,★verbatim,★authority} [N-8] |
| `annotations[]` | ★id, ★targetId, ★comment, proposal?（批注携带的修改建议）, ★status(`proposed/resolved/rejected/outdated`)。**proposal 永不自动采纳**：只在用户明确同意后由 agent 经 save 落进合同、批注置 resolved；未采纳保持 proposal 原文 |
| `recoveries[]` | ★at, ★reason, ★fromRevision, ★trustedBaseCommit, ★diffSummary |
| `changelog[]` | ★rev, ★at, ★type(`spec/run/annotation/source/engine/acceptance/recovery`), ★changed:[{ref,fields}] |

- **顺序语义** [N-7]：「最新」= `revision` 最大者；同 revision 内取数组序靠后者。**永不使用墙钟 `at` 排序**（时钟回拨/同刻并列均不影响判定）。
- **observation 基线** [N-8]：每来源首条 observation 即 baseline；后续 `outcome` 相对「acceptance 引用批次中该来源的 observation，否则最近一条已裁决（decidedImpact 存在）的 observation，否则 baseline」比较得出。
- evidence 路径必须位于 repo 内且非符号链接；`outputExcerpt` 落盘前按密钥/令牌模式扫描脱敏并置 `redacted`。

## 6. 派生状态代数（总函数，[N-3] 真值表）

**一切推导状态只算不存。** 输入 = contract + ledger；输出在 `status`/render 时计算。

### 6.1 run 层

- `run.result ∈ {passed, failed, blocked}`。判定器解析失败、evidence 校验失败（缺失/hash 不符/越界路径）、timeout、signal 终止 ⇒ `blocked`（failed 仅表示断言不成立）。
- **适用性**：run 适用 ⇔ `run.scenarioFingerprint == 当前场景 fingerprint` 且 `run.verificationHash == 当前 verificationHash`；否则 historical（保留展示、不参与推导）。
- dirty run 适用，但结果携带 dirty 标记（视图可见）。gitHead 落后不单独失效（重验由对账阶段整体触发）。

### 6.2 example / scenario 层

- example 状态 = 覆盖它的最新适用 run 的 `exampleResults[exampleRef]`；无 ⇒ `not-run`。
- scenario 三轴：
  - `coverage`：examples 全有适用 run ⇒ `full`；部分 ⇒ `partial`；全无 ⇒ `not-run`。
  - `result`（最差聚合，序 `failed > blocked > not-run > passed`）。
  - `evidenceLevel`：kind=mock ⇒ `weak`；assert/db/manual ⇒ `strong`。
- manual：存在未撤回 confirmation（§7.4）⇒ 该确认即适用 run（全 example passed/strong）；无 ⇒ not-run。

### 6.3 scenario → 单值（真值表）

按序判定，首个命中即返回：

| # | 条件 | scenarioValue |
|---|---|---|
| 1 | result 含 failed | `failed` |
| 2 | 否则 result 含 blocked | `blocked` |
| 3 | 否则 coverage = not-run | `not-run` |
| 4 | 否则 coverage = partial | `partial-coverage` |
| 5 | 否则 evidenceLevel = weak | `passed-weak` |
| 6 | 否则 | `passed` |

### 6.4 聚合层

- `flow.implementationStatus` = 其 scenarios 的 scenarioValue 取最差（序 `failed > blocked > not-run > partial-coverage > passed-weak > passed`）；**零 scenario ⇒ not-run**（空集不变绿）。
- requirement 覆盖 = 其 scenarioRefs 聚合（同序）；有效 waiver ⇒ `waived`（单列计数，不算绿也不挡交付）。
- `spec.implementationStatus` = core flows 聚合；零 core flow ⇒ `not-run`。
- `sourceStatus(每来源)`：无 observation ⇒ `unknown`；最新 outcome=unavailable ⇒ `unavailable`；changed 且无 decidedImpact ⇒ `changed`；changed 且已裁决 ⇒ `changed-acknowledged`；unchanged ⇒ `fresh`。

### 6.5 specAcceptance

- 存在合法 acceptance 且其 revision 之后 changelog 无行为级变更（state/transition/scenario/verification/fingerprint 成分字段）⇒ `accepted`。
- 有 acceptance 但其后有行为级变更 ⇒ `re-review`。
- 无 acceptance：存在 aligned flow ⇒ `review`；否则 `draft`。

### 6.6 acceptance 合法性（**写入时前置条件**，validator 硬判）

全部满足才允许写入 acceptance 事实：

1. `ACC-06`：全部 core flow `alignStatus=aligned`。
2. `ACC-03`：无 `type=blocker` 且 `status=open` 的 issue。
3. `ACC-04`：无 `proposed` 批注。
4. `ACC-01`：`sourceBatchId` = **acceptance 写入时**的最新 refresh 批次（依 changelog 中 `type=source` 条目的 rev 序还原；无 source 条目时取 observation 数组序末批次），且该批次含**每一个**已登记 source 的 observation；写入时引用历史批次 = 非法。
5. `ACC-02`：该批次内 outcome ∈ {changed(未裁决), unavailable} 或存在从未观测的来源（unknown）⇒ 阻断，除非该来源在 `sourceWaivers` 有用户逐项确认。
6. `ACC-05`：每个 scenarioValue ≠ `passed` 的 core scenario 都在 `deviationsAcknowledged` 中有含完整 waiver 的条目。

**时点语义**：这些是写入时前置，不是永久不变式。acceptance 之后合法追加新批次、新 issue、新批注**不追溯污染**既有 acceptance（否则 acceptance 一旦存在，连 refresh-sources 都无法写入，来源漂移检测死锁）；其影响通过五元组展示轴（sourceStatus/openBlockers/…）与 `specAcceptance=re-review` 呈现。静态校验的实现口径：ACC-01/02 依 changelog 序对每条 acceptance 还原写入时批次；ACC-03/04/05/06 依赖当前态，仅当该 acceptance 是最新写入（`acc.revision ≥ changelog 最大 rev`）时评估——这恰等价于「在 accept 写入的那一刻检查」。

### 6.7 组合状态展示 [N-4]

`status` 输出五元组，**永不折叠**：`{specAcceptance, implementationStatus, sourceStatus 汇总, openBlockers 数, proposedAnnotations 数}`。`(accepted, failed)`、`(accepted, changed)` 必须原样呈现，禁止合成单一绿色。

## 7. Verification 判定器

### 7.1 两段式冻结与规范序列化 [N-6]

- 流对齐冻结 `scenarioFingerprint = "fp1:" + sha256(canonical(given, when, then, examples, verification.assertion, verification.evidencePolicy))`。
- verification gate 确认命令后计算 `verificationHash = "vh1:" + sha256(canonical(kind, command, confirmedAt, judgeVersion))`。
- **canonical 序列化**：UTF-8、NFC 归一、对象键字典序、数组保序、无多余空白、数字最短表示、字符串 CRLF→LF。hash 版本前缀（fp1/vh1）变更即全部旧值 historical。
- 换 command ⇒ 仅重开 verification gate（新确认记录）；fingerprint 成分变化 ⇒ flow 退回待对齐 + 全部旧 run historical。

### 7.2 四类判定器

| kind | 判定规则 | blocked 条件 |
|---|---|---|
| `assert` | evidencePolicy 指向结构化测试结果（JUnit XML 等）；`testCount > 0` 且全通过（`ALG-05`） | 解析失败/testCount=0 视 assertion 语义（0 匹配 ⇒ failed 由 assertion 定义，默认 blocked） |
| `db` | 冻结只读查询 + expected predicate；判定器对查询输出求值 | 查询失败/输出不可解析 |
| `mock` | 通过 ⇒ evidenceLevel=weak；不能作为交付唯一证据（§6.6-6 兜底） | 同 assert |
| `manual` | 只由用户确认事实产生（§7.4），永不自动 passed | — |
| `file` | judge-only 文件树对账：assertion `{paths:[路径/glob…]}` 全部存在 ⇒ passed；证据=命中文件+sha256 | paths 为空 |
| `grep` | judge-only 模板/配置/密钥绑定对账：assertion `{path(glob), pattern(正则), predicate(数值谓词)}` 对匹配**计数**求谓词；**只计数不落匹配值**（secret 安全，证据标 redacted） | pattern/predicate 不可解析 |

- record-run 只执行冻结命令；执行前后校验 artifact 文件与 gitHead 未被命令改动。
- db/device 场景 run 必填设备上下文（`LED-01`）——它们是判定对象的一部分。

### 7.4 manual confirmation 事实

以 run 形态落 ledger：`{id: RUN-*, scenarioRef, scenarioFingerprint, verificationHash, exampleResults(全 passed), at, revision, cmd: "manual-confirmation", confirmation:{verbatim, at}, result:"passed", evidence:[]}`。撤回 = 追加 `{cmd:"manual-revocation", revokesRunRef}`，被撤回 run 不再适用。

## 8. Template 与引擎安全

### 8.1 allowlist（白名单，未列出即 `TPL-01`）

- **允许标签**：`div span p h1-h6 ul ol li button label img input svg path rect circle line g text br strong em small`。
- **input**：type ∈ `text/checkbox/radio/range`。
- **img**：仅 `data:` URI；MIME ∈ `image/png image/jpeg image/webp`；≤64KB [N-9]。
- **允许属性**：`class`、`style`（受限属性集：颜色/背景/渐变/边框/间距/尺寸/字体/文本/flex/grid/圆角/透明度；**style 内禁 url()**）、`data-go`、`data-spec-id`、`data-figma`、**`data-live`/`data-live-text`/`data-note`**（data-note=①②③ 标注点钉；data-formula/data-live-formula=公式实时带入 {v}{inv}{raw}{max}；data-hold-compare/data-compare-hide=长按对比原图；data-snap/data-snap-text=落库快照 mock；data-show-in/data-on-in=**单流单屏协议**（一条流共享一块持久屏：区域按状态显隐/选中态高亮，同模板状态切换不重建、控件值不丢——validator 校验其 token 为存在的 state id）——引擎自动渲染事件日志与「内存态 vs 已落库」数据流面板）（声明式微交互：引擎把 `input[type=range][data-live=N]` 的值归一化映射为 stage 上的 `--live-N` CSS 变量并同步 `[data-live-text=N]` 文本——模板零 JS 表达连续交互，如滑竿驱动图层透明度）、input 的 `type/value/placeholder/checked/disabled/min/max/step`、svg 几何属性。
- **禁止**：`script iframe object embed meta base form link a template(嵌套) style(标签)`；一切 `on*` 属性；`javascript:`/`vbscript:`/外部 URL；`srcdoc`；`formaction`。
- `TPL-02`：`data-go` 的目标 transition 必须存在，且其 `from` ∈ 共享该 template 的状态集（`uiTemplateRef` 指向它的全部 state；无引用者按 `ui-<stateId>` 命名回退）——运行时 go() 仍按当前状态二次校验。

### 8.2 CSP [N-9]

- `script-src 'sha256-<引擎 script 元素文本按 CSP 规范取字节的 hash>'`——**与 stamp.hashes.engine（引擎段整体 sha256）是两个独立值**，各自计算。
- **禁 `'unsafe-inline'` 于 script-src**（任何情况不得退回）；`style-src 'unsafe-inline'` 允许（样式不在威胁模型执行面）；`img-src data:`；`default-src 'none'`。
- `--retemplate` 时 spec.mjs 同步重算：CSP script hash、stamp.engine hash、engineVersion，三者一次事务更新。

## 9. save 事务与故障语义 [N-10]

1. 临时文件写入**同目录**（保证同文件系统 rename 原子性）。
2. **rename 前**：解析回读自检（失败 ⇒ 原文件从未被碰，删临时文件报错）。
3. 备份原文件为 `<名>.bak` → fsync 临时文件 → 原子 rename → **fsync 父目录**。
4. rename 后二次回读：失败 ⇒ 从 `.bak` 自动回滚；成功 ⇒ 删 `.bak`。
5. 启动时发现遗留 `.bak`：主文件可解析 ⇒ 提示并删；不可解析 ⇒ 提示从 .bak 或 git 恢复。
6. lockfile `<名>.lock` 含 `{pid, startedAt}`；持锁进程不存在或超 10 分钟 ⇒ 可安全清除。
7. revision CAS：文件内 revision ≠ 命令预期 ⇒ 拒绝写入报冲突。

## 10. 阈值采样 [N-12]

- save 时自动采样进 progress：文件字节数、save+validate 耗时。
- **merge 冲突计数不自动感知**：由 `merge-feedback` 或用户确认时显式写入 progress。
- 任一命中（>1.5MB / >5s / 冲突≥2 次）⇒ 提示启动 bundler 退出预案。

## 11. Validator 规则目录（fixtures 以此为键）

| 组 | 规则 |
|---|---|
| STR | 01 JSON 可解析且转义安全；02 必填字段；03 ID 格式；04 ID 唯一；05 数据块/template id 唯一；06 高 major 版本 ⇒ blocked |
| REF | 01 一切 *Ref/*Refs 可解析；02 孤儿 template（无 state 引用）error |
| FSM | 01-06 见 §4.1 |
| ALG | 01 派生状态落盘；02 behavior requirement 未覆盖且无 waiver；03 waiver 结构不全；04 result=passed 的 run evidence 为空或文件缺失/hash 不符（文件核验在 `--strict`）；05 assert run 缺 testCount 或 =0 |
| ACC | 01-06 见 §6.6 |
| LED | 01 db/device run 缺设备上下文；02 run 缺 fingerprint/verificationHash |
| TPL | 01 allowlist 违规；02 data-go 非法；03 img data URI 违规 |
| ENV | 01 hash 不匹配（带外编辑）；02 文件内 revision/changelog 链断裂或重复 |
| GIT | 01 相对 gate 锚倒退/覆盖；02 锚不可用（信息级；--strict 下 error） |

fixtures 清单与期望结果见 `scripts/fixtures/README.md`。第一阶段测试须用临时 git 仓库 + fixture gate commit 覆盖 GIT-01/02（含无锚 ⇒ unavailable）[N-11]。
