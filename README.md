# Mini-App Spec

**English** | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg) ![Node >= 18](https://img.shields.io/badge/Node-%E2%89%A5%2018-blue.svg) ![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg)

An agent skill that turns messy, multi-source requirements (PRD / BDD / Figma / code) into a **single self-contained `mini-app-spec.html`** — an *executable specification* that embeds a machine-readable contract, an operable prototype, a state-machine canvas, BDD acceptance scenarios, an annotation/review loop, and verifiable run evidence. After implementation, the same artifact is used to **reconcile** what was built against what was agreed.

It is designed for AI coding agents (Claude Code, Codex, Cursor, …): the agent produces and maintains the spec through a locked-down CLI pipeline, and a validator makes it *mechanically hard* for the agent to cheat.

## Design Principle: the spec **is** a mini app

This skill is a hardened implementation of the idea in Matt Rickard's essay [*The Unreasonable Effectiveness of Mini Apps as Specs*](https://blog.matt-rickard.com/p/the-unreasonable-effectiveness-of-675): instead of a static document that drifts from reality, ship the spec as a tiny interactive app that stakeholders can click through, annotate, and hold the implementation accountable to.

On top of that idea, this skill adds what a document can't have:

- **A machine contract as the single source of truth** — flows, states, transitions, Gherkin scenarios, and verification methods live as structured JSON inside the HTML, not as prose.
- **Derived status is computed, never stored** — nobody (human or AI) can hand-write `passed`. A scenario's status is derived from evidence, or it is `not-run`.
- **Evidence, not claims** — verification commands are frozen at a gate, executed by the tool itself (`record-run`), and their outputs are hashed into a ledger.
- **A review loop that survives** — pin-style annotations anchor to stable IDs, export as structured change tickets, and *block acceptance* until adjudicated.

## Three-Layer Architecture

```
mini-app-spec.html          ← the deliverable: open it by double-click, no server
├── render engine           (stateless, versioned, business-agnostic)
├── <script id="mini-app-contract">   ← machine contract  = SSOT
├── <script id="mini-app-ledger">     ← runs / evidence / annotations / acceptances
├── <script id="mini-app-stamp">      ← envelope: per-block hashes, revision chain
└── <template id="ui-ST-*">           ← declarative, zero-JS prototype screens
```

| Layer | Role | Rule |
|---|---|---|
| `mini-app-spec.html` | **The database.** Contract + ledger + templates in one file | Never hand-edited |
| `scripts/spec.mjs` | **The only write path.** Every mutation is a validated transaction | Validator fails → nothing is written |
| `assets/template.html` | **The stateless render engine** | Business never modifies it; upgrades via `save --retemplate` |

The full field contract, revision semantics, state algebra, judges, and template allowlist are authoritatively defined in [`references/contract.md`](references/contract.md).

## Anti-Fudge Iron Laws

1. The contract can only be written through `save`. Out-of-band edits are caught by the envelope hashes and by `validate --against-git` (replay detection anchored to git gate commits).
2. **Derived status is computed, never stored.** Hand-written `passed` is a validator error.
3. Verification is executed by `record-run` itself — the agent supplies *commands*, never *results*. Commands are frozen at a verification gate; behavior semantics are fingerprinted at flow alignment, so changing a `Then` silently invalidates old evidence.
4. Acceptance must quote the user verbatim and pass six hard preconditions (fresh source-observation batch, zero pending annotations, per-scenario waivers for anything non-green, …).

Threat model: careless mistakes, lazy shortcuts, and hallucination — not a malicious agent. The last line of defense is always a human looking at evidence at the final stop point.

## Workflow: two hard stops, per-flow soft stops

```
collect sources → map flows ─🛑 STOP ①: user confirms flow list & risk tiers
     ↓
align flow-by-flow (states / transitions / scenarios / prototype)  ⏸ user reviews each flow
     ↓
implementation happens outside this skill
     ↓
freeze verification commands → record-run per scenario ─🛑 STOP ②: user inspects evidence → accept
```

The artifact renders four views: **Flow Overview** (merged map + SVG state machine on an infinite pan/zoom canvas), **Prototype** (a living phone screen with real-time state chips, live values, memory-vs-persisted dataflow, and an event log), **Scenario Acceptance** (filterable cards that jump into the prototype), and **Run Evidence**. An annotation layer (📌 click-to-anchor, Figma-pin style) works across all views.

## Quick Start

Requirements: Node ≥ 18, git (artifacts must live inside a git repository).

```bash
# Install as a Claude Code skill (or drop into .agents/skills/ for Codex/Cursor)
git clone https://github.com/wohsj110/mini-app-spec ~/.claude/skills/mini-app-spec

# Self-test: 20 fixture cases + 32 injection/attack cases must all pass
node ~/.claude/skills/mini-app-spec/scripts/run-fixtures.mjs
node ~/.claude/skills/mini-app-spec/scripts/run-injections.mjs
```

Then, inside any project, ask your agent to use the skill — or drive the pipeline directly:

```bash
node <skill>/scripts/spec.mjs new docs/mini-app-spec/my-feature/mini-app-spec.html --id my-feature --title "My Feature"
node <skill>/scripts/spec.mjs extract  docs/mini-app-spec/my-feature/mini-app-spec.html   # contract out as JSON
node <skill>/scripts/spec.mjs save     docs/mini-app-spec/my-feature/mini-app-spec.html --data payload.json
node <skill>/scripts/spec.mjs validate docs/mini-app-spec/my-feature/mini-app-spec.html --strict
node <skill>/scripts/spec.mjs status   docs/mini-app-spec/my-feature/mini-app-spec.html   # resume briefing
```

### Command cheat sheet

| Command | Purpose |
|---|---|
| `new` | Create an empty artifact from the pinned engine |
| `extract` / `save [--expect-revision] [--gate <name>] [--retemplate]` | The only round-trip for editing the contract; `--gate` also creates a git replay anchor |
| `validate [--strict] [--against-git]` | Full rule check; must be 0 errors before review or acceptance |
| `status` | Read-only resume briefing (never collapses the status tuple) |
| `confirm-command --scenario --command` | Verification gate: freeze the command |
| `record-run --scenario` | Execute frozen command, judge output, write hashed evidence |
| `refresh-sources` | Observe all registered sources as a batch (required before acceptance) |
| `merge-feedback --data` / `annotate --id --status` | Merge exported annotation tickets / record user adjudication |
| `accept --verbatim "…"` | Write the acceptance fact (six hard preconditions enforced) |
| `recovery --reason` | Rebuild from the last trusted git gate baseline |
| `export-md` | Portable read-only Markdown export (the HTML stays authoritative) |

### Judges

| kind | What it checks |
|---|---|
| `assert` | Structured test results (JUnit XML), `testCount > 0` and all green |
| `db` | Frozen read-only query + numeric predicate over its output (device context required) |
| `file` | File-tree reconciliation: declared paths/globs all exist |
| `grep` | Pattern **count** predicate over files — counts only, never logs matched values (secret-safe) |

## Using it with companion skills (optional but recommended)

The skill runs fully standalone, but it pairs best with these open-source skills from [mattpocock/skills](https://github.com/mattpocock/skills):

| Stage | Skill | What it adds |
|---|---|---|
| Before — explore | [`wayfinder`](https://github.com/mattpocock/skills) | Map work too big for one session into a shared investigation map before touching the requirement |
| Before — requirements | [`grill-with-docs`](https://github.com/mattpocock/skills) | Interrogate a fuzzy idea into a written requirement doc with every decision on record |
| During alignment | [`grill-me`](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md) | One-question-at-a-time interrogation (with a recommended answer each time) for strings of high-impact decisions |

The recommended pipeline:

```
/wayfinder explore the territory
   → grill-with-docs: interrogate the idea into a requirement doc
      → mini-app-spec: register the doc + Figma frames (via Figma MCP) as sources, build the spec flow by flow
         → escalate high-impact decision strings to grill-me during alignment
```

Without any of them installed, the skill degrades gracefully to built-in leaning multiple-choice questions.

## Repository layout

```
SKILL.md                 # the operating manual an agent loads (kept minimal)
references/contract.md   # authoritative contract: fields, state algebra, validator rules
scripts/spec.mjs         # zero-dependency CLI: the only write path
scripts/run-fixtures.mjs # 20 validator fixture cases
scripts/run-injections.mjs # 32 end-to-end injection/attack cases
scripts/fixtures/        # good & deliberately-broken artifacts
assets/template.html     # the stateless render engine
evals/                   # fresh-agent behavioral evals + input fixtures
agents/openai.yaml       # interface metadata for non-Claude agent runtimes
```

## License

[MIT](LICENSE)
