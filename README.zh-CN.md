# Mini-App Spec

[English](README.md) | **简体中文** | [日本語](README.ja.md) | [한국어](README.ko.md)

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg) ![Node >= 18](https://img.shields.io/badge/Node-%E2%89%A5%2018-blue.svg) ![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg)

一个 Agent Skill：把多来源的复杂需求（PRD / BDD / Figma / 代码）生成并校准为**单个自包含的 `mini-app-spec.html`** —— 一份*可执行的规格*，内嵌机器合同、可操作原型、状态机画布、BDD 验收场景、批注评审回路与可核验的运行证据。实现完成后，还用同一份产物对实现做**对账**。

它为 AI 编码代理（Claude Code、Codex、Cursor 等）设计：agent 通过一条被锁死的 CLI 管线生产和维护规格，validator 让 agent 在机制上*很难糊弄*。

## 设计原理：规格本身就是一个 Mini App

本 skill 是 Matt Rickard 文章 [*The Unreasonable Effectiveness of Mini Apps as Specs*](https://blog.matt-rickard.com/p/the-unreasonable-effectiveness-of-675) 思想的加固实现：与其写一份会和现实渐行渐远的静态文档，不如把规格做成一个可点击、可批注、可用来问责实现的小应用。

在这个思想之上，本 skill 补上了文档做不到的部分：

- **机器合同作为唯一事实来源（SSOT）**——流、状态、转移、Gherkin 场景、验证方式都以结构化 JSON 内嵌在 HTML 里，而不是散文。
- **派生状态只算不存**——任何人（无论人还是 AI）都无法手写 `passed`；场景状态只能由证据推导，否则就是 `not-run`。
- **要证据，不要口供**——验证命令在关卡处冻结，由工具本身亲自执行（`record-run`），输出经哈希落入台账。
- **能闭环的评审回路**——图钉式批注锚定稳定 ID，可导出为结构化修改工单，未裁决的批注会*阻断验收*。

## 三层架构

```
mini-app-spec.html          ← 交付物：双击即开，无需服务器
├── 渲染引擎                 （无状态、版本化、与业务无关）
├── <script id="mini-app-contract">   ← 机器合同 = SSOT
├── <script id="mini-app-ledger">     ← 运行 / 证据 / 批注 / 验收台账
├── <script id="mini-app-stamp">      ← 封印：分块哈希 + revision 链
└── <template id="ui-ST-*">           ← 声明式、零 JS 的原型屏
```

| 层 | 角色 | 规则 |
|---|---|---|
| `mini-app-spec.html` | **数据库。** 合同 + 台账 + 模板合一 | 永不手写编辑 |
| `scripts/spec.mjs` | **唯一写入口。** 每次变更都是带校验的事务 | validator 不过 → 什么都写不进去 |
| `assets/template.html` | **无状态渲染引擎** | 业务禁改；升级走 `save --retemplate` |

字段合同、revision 语义、状态代数、判定器与模板白名单的唯一权威定义见 [`references/contract.md`](references/contract.md)。

## 防糊弄铁律

1. 合同只准经 `save` 写入。带外编辑会被封印哈希与 `validate --against-git`（以 git gate commit 为锚的回放检测）抓住。
2. **派生状态只算不存。** 手写 `passed` 直接报 validator 错误。
3. 验证由 `record-run` **亲跑**——agent 只提供*命令*，永远不提供*结果*。命令在验证关卡冻结；行为语义在流对齐时打指纹，改了 `Then` 旧证据自动失效。
4. 验收必须引用用户原话，并通过六条硬前置（来源观测批次新鲜、无未裁决批注、非绿 core 场景逐条 waiver 等）。

威胁模型：防误操作、防偷懒、防幻觉——不防恶意 Agent。最后一道防线永远是人在最终停点亲眼看证据。

## 工作流：两个硬停点 + 逐流软停

```
收集来源 → 建流图 ─🛑 停点①：用户确认流清单与风险分档
     ↓
逐流对齐（状态 / 转移 / 场景 / 原型）  ⏸ 每流交用户评审
     ↓
实现（在本 skill 之外进行）
     ↓
冻结验证命令 → 逐场景 record-run ─🛑 停点②：用户亲阅证据 → accept
```

产物内置四个视图：**流总览**（合并地图 + SVG 状态机，无限平移缩放画布）、**原型**（活的手机屏：状态徽标、实时数值、内存态 vs 已落库数据流、事件日志）、**场景验收**（可筛选卡片，一键跳入原型）、**运行证据**。📌 点击即锚的批注层横跨所有视图。

## 快速开始

要求：Node ≥ 18、git（产物必须放在 git 仓库内）。

```bash
# 作为 Claude Code skill 安装（Codex/Cursor 放 .agents/skills/ 亦可）
git clone https://github.com/wohsj110/mini-app-spec ~/.claude/skills/mini-app-spec

# 自检：20 条 fixture 用例 + 32 条注入/攻击用例必须全绿
node ~/.claude/skills/mini-app-spec/scripts/run-fixtures.mjs
node ~/.claude/skills/mini-app-spec/scripts/run-injections.mjs
```

然后在任意项目里让 agent 使用本 skill，或直接驱动管线：

```bash
node <skill>/scripts/spec.mjs new docs/mini-app-spec/my-feature/mini-app-spec.html --id my-feature --title "我的功能"
node <skill>/scripts/spec.mjs extract  docs/mini-app-spec/my-feature/mini-app-spec.html   # 合同以 JSON 导出
node <skill>/scripts/spec.mjs save     docs/mini-app-spec/my-feature/mini-app-spec.html --data payload.json
node <skill>/scripts/spec.mjs validate docs/mini-app-spec/my-feature/mini-app-spec.html --strict
node <skill>/scripts/spec.mjs status   docs/mini-app-spec/my-feature/mini-app-spec.html   # 恢复简报
```

### 命令速查

| 命令 | 用途 |
|---|---|
| `new` | 从固定引擎创建空产物 |
| `extract` / `save [--expect-revision] [--gate 名] [--retemplate]` | 编辑合同的唯一往返路径；`--gate` 顺带打 git 回放锚 |
| `validate [--strict] [--against-git]` | 全规则校验；评审/验收前必须 0 error |
| `status` | 只读恢复简报（状态五元组永不折叠） |
| `confirm-command --scenario --command` | 验证关卡：冻结命令 |
| `record-run --scenario` | 亲跑冻结命令、判定输出、写入带哈希的证据 |
| `refresh-sources` | 对全部已登记来源生成观测批次（验收前强制） |
| `merge-feedback --data` / `annotate --id --status` | 合并批注工单 / 代录用户裁决 |
| `accept --verbatim "…"` | 写入验收事实（六条硬前置由 validator 挡门） |
| `recovery --reason` | 从最近可信 git gate 基线重建 |
| `export-md` | 降级导出便携只读 Markdown（权威仍是 HTML） |

### 判定器

| kind | 判什么 |
|---|---|
| `assert` | 结构化测试结果（JUnit XML），`testCount > 0` 且全通过 |
| `db` | 冻结只读查询 + 对输出的数值谓词（须提供设备上下文） |
| `file` | 文件树对账：声明的路径/glob 全部存在 |
| `grep` | 对文件的模式**计数**谓词——只计数、绝不落匹配值（密钥安全） |

## 与同伴 skill 组合使用（可选，但强烈推荐）

本 skill 可完全独立运行，但与 [mattpocock/skills](https://github.com/mattpocock/skills) 里这几个开源 skill 搭配效果最佳：

| 阶段 | Skill | 提供什么 |
|---|---|---|
| 事前——探索 | [`wayfinder`](https://github.com/mattpocock/skills) | 把超出单次会话容量的大块工作先摸成一张共享调查地图 |
| 事前——需求 | [`grill-with-docs`](https://github.com/mattpocock/skills) | 把模糊想法审问成一份决策全部留痕的需求文档 |
| 对齐期间 | [`grill-me`](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md) | 一次一问（每问附推荐答案）的审问式追问，专治成串高影响决策 |

推荐管线：

```
/wayfinder 探索地形
   → grill-with-docs：把想法审问成需求文档
      → mini-app-spec：把文档 + Figma 帧（经 Figma MCP 取数）登记为 sources，逐流构建规格
         → 对齐期间成串高影响决策升级给 grill-me
```

一个都没装也没关系——skill 会优雅退化为内置的带倾向选择题。

## 仓库结构

```
SKILL.md                 # agent 加载的操作手册（保持精简）
references/contract.md   # 权威合同：字段、状态代数、validator 规则
scripts/spec.mjs         # 零依赖 CLI：唯一写入口
scripts/run-fixtures.mjs # 20 条 validator fixture 用例
scripts/run-injections.mjs # 32 条端到端注入/攻击用例
scripts/fixtures/        # 正确的与故意弄坏的产物样本
assets/template.html     # 无状态渲染引擎
evals/                   # 新鲜 agent 行为评测 + 输入素材
agents/openai.yaml       # 非 Claude 运行时的接口元数据
```

## 许可证

[MIT](LICENSE)
