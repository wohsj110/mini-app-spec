---
name: mini-app-spec
description: 将复杂功能的多源需求（PRD/BDD/Figma/代码）生成、校准为单文件 HTML5 可执行规格，并在实现后对账。
disable-model-invocation: true
---

# Mini-App Spec

产出并维护一个自包含的 `mini-app-spec.html`：内嵌机器合同（SSOT）+ 可操作原型 + 状态机画布 + BDD 验收 + 批注评审 + 运行证据。它描述并核对目标实现，不替代实现、不在同一流程里写业务代码。

**三层架构**：HTML 是数据库，`scripts/spec.mjs` 是唯一写入口（validator 挡门，校验不过写不进去），`assets/template.html` 是无状态渲染引擎（业务禁改，升级 = `save --retemplate`）。字段合同、revision 语义、状态代数、判定器、模板协议与 allowlist 的**唯一权威定义**在 `references/contract.md`——实现与争议一律以它为准，本文不复述。

**运行约定**：在仓库根目录执行 `node <本 skill 目录>/scripts/spec.mjs <命令> …`；**产物必须在 git 仓库内**（gate 回放锚 / recovery / 来源观测都依赖它）；业务产物固定放 `docs/mini-app-spec/<需求名>/mini-app-spec.html`（record-run 证据自动落同目录 `evidence/`，RUN 编号按 spec 独立，故每需求一个子目录、不摊平）；合同编辑走 extract→改 JSON→save 往返（payload 放临时目录），**永不手写 HTML 正文**。逐流对齐起每轮就绪后 `open` 给用户（macOS `open`；无头环境报告产物路径代替）；停点①的评审物是流清单与 issues（原型区为空是正常形态），可直接在聊天里呈现。

## 防糊弄铁律（机械执行，不靠自觉）

1. 合同只准经 `save` 写入；绕过者被 envelope（ENV-01）与 `validate --against-git`（回放检测，锚=gate commit）抓住。
2. 派生状态**只算不存**：手写 passed 直接报错，场景状态只能由证据推导。
3. 验证由 record-run **亲跑**（agent 只提供命令不提供结果）；命令在 verification gate 冻结，行为语义（fingerprint）在流对齐时冻结——改了 Then 旧证据自动失效。
4. acceptance 必须引用用户原话，且过六条硬前置（来源批次门、proposed 批注清零、非绿 core 场景逐条 waiver 等）。

## 工作流（两个硬停点 + 逐流软停）

0. **Resume**：`spec.mjs status <html>` 一条命令出恢复简报。完成判据：能向用户复述「上次停在哪、下一步是什么」。
1. **收集+建图 → 🛑停点①**：读需求/BDD/Figma(MCP)/代码，登记 sources → 拆 flows（垂直用户流+风险档+core 标志）。Qualify 是一句口头判断：无多状态/交互/验收对账就报不适用退出；**单点设计疑问（「这个交互什么手感」）让位 throwaway 原型探针**（环境装有 `/prototype` 之类的快速原型 skill 就用它，没有就临时页面探完即弃）——探针答案到手再回本 skill，其结论可登记为 source 或落 issue.decision；逐流期说不清的交互同理先探针定手感、再一次性落模板，不在合同里反复试错。完成判据：**用户回话确认流清单与分档**（流清单以 `alignStatus=pending` 落盘供确认是预期动作；「不拆流」指未确认前不逐流展开 states/scenarios）。确认后 `save --gate gate1` 打回放锚。
2. **逐流对齐（软停）**：高不确定流一次一条，低风险 ≤3 条合批。填 states/transitions/scenarios/templates → `validate` 0 error 才 open 给用户评审。决策疑点做带倾向选择题（内置默认路径）；成串高影响决策可升级为审问式追问——环境装有 `grill-me` 之类的质询 skill 则调用，没有就用连串带倾向选择题退化执行；不接入寻路/导航类 skill。完成判据：该流用户回话通过 → alignStatus=aligned（冻结 fingerprint）并 `--gate` 打锚；**每条 core 流都 aligned** 才算本阶段完成。
3. **实现**（本 skill 外部）。
4. **对账 → 🛑停点②**：verification gate 冻结命令 → record-run 逐场景取证 → 先 `refresh-sources` 再向用户展示证据摘要（全绿只免逐项审阅，不免停点）→ 用户明确接受 → `accept`。完成判据：`accept` 成功写入并 `--gate` 打锚；失败则原样报出 validator 的未决清单，不粉饰。

**变更回灌**：契约级改动走 save（changelog 自动留痕），行为变更把受影响流退回待对齐；小 UI/实现细节不回灌。修改是常态路径（extract→改→save），不是例外。

## 模板质量铁律

> 各协议（`data-live`/`data-note`/`data-show-in`/`data-snap`/`metrics`/`demoPath`/`autoMs`…）的机制与 allowlist 以 contract.md §4/§8 为准；本节只定行为标准。

- **活屏，不是幻灯片**：一条流的多状态用共享模板做成一块持久屏（区域显隐、控件值不丢、云端回调用自动转移模拟）。
- **连续交互必须可操作**：滑竿拖出实时视觉反馈；**禁止按钮文字转述交互**（「模拟拖动」按钮=不合格）。
- **讲解进画面**：关键区域打标注点、计量语义挂 metrics 徽标、核心场景配演示走查——评审者不读文档也能看懂。
- 状态皮肤用引擎 mock 工具类（`.mcv/.layer/.optline/.opt/.gearrow/.gear/.cta/.ghost/.slabel`），暗色主题对齐被评审 App 的气质；模板零 JS、零外链。
- 样式关键屏：Figma 指针（MCP 取数，故障硬停不猜）或 figmaNote 二选一；对账型 spec 可声明「视觉权威=现网实现」但须开 issue 交用户裁决。
- 每个可评审对象有稳定短 ID、页面点击可复制（聊天反馈的坐标系）；批注**点击即锚**（开批注模式→点元素→钉留原地），不逼用户手选 ID。
- **开源库政策**：CSP 禁外链；引擎可 inline vendor MIT/BSD 小库（单库 ≤15KB min，头注释记名称/版本/License），交互复杂度超出手写合理范围时优先 vendor 而非降级体验；禁 CDN 与重型框架。

## 批注回路

📌 批注锚定任意稳定 ID、可携带修改建议 proposal → 导出 JSON 即**结构化修改工单** → `merge-feedback` 合并为 proposed（**阻断 acceptance**）→ 用户逐条裁决：采纳 ⇒ agent 经 save 落合同并 `annotate --status resolved`；不采纳 ⇒ rejected，proposal 原文保留。同步零散意见走聊天说短 ID 即可，批注留给批量/异步/需闭环保证的评审。

## 命令速查（语义详见 contract.md）

| 命令 | 用途 |
|---|---|
| `new <html> --id --title` | 从固定引擎创建空产物 |
| `extract` / `save --data [--expect-revision] [--gate 名] [--retemplate]` | 合同进出的唯一写路径；gate 顺带 git commit（回放锚） |
| `validate [--strict] [--against-git]` | 全规则校验；open/accept 前必须 0 error |
| `status` | 只读恢复简报（五元组永不折叠） |
| `confirm-command --scenario --command` | verification gate：冻结验证命令 |
| `record-run --scenario [db 场景须设备三参]` | 亲跑取证（判定器 assert/db/file/grep） |
| `refresh-sources` | 生成完整来源观测批次（acceptance/对账前强制）；file adapter 先行——远程来源（Figma/Confluence）观测为 unavailable，验收时须逐来源 sourceWaiver |
| `merge-feedback --data` / `annotate --id --status` | 批注工单合并 / 代录用户裁决 |
| `accept --verbatim "用户原话"` | 写 acceptance 事实（硬前置由 validator 挡门） |
| `recovery --reason` | 从最近 gate commit 可信基线重建 |
| `export-md [--out]` | 降级导出便携 Markdown（权威仍是 HTML） |

## 自检与存活

- 改 `spec.mjs`/`template.html` 后必须跑 `node scripts/run-fixtures.mjs` 与 `node scripts/run-injections.mjs`，**双双全绿**才算改完。
- 每次运行结束在 progress 块写一行「本次值不值 + 实际分钟数」（收尾写入，在 gate 之后合法——against-git 只要求链连续）。死刑条款：连续两次真实需求绕开本 skill 或自评为亏 → 砍当次最贵环节；再犯退役本 skill。
