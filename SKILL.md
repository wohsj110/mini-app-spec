---
name: mini-app-spec
description: Generate and calibrate multi-source requirements (PRD/BDD/Figma/code) for complex features into a single-file executable HTML5 spec, then reconcile against it after implementation.
disable-model-invocation: true
---

# Mini-App Spec

Produce and maintain a self-contained `mini-app-spec.html`: an embedded machine contract (SSOT) + operable prototype + state-machine canvas + BDD acceptance + annotation review + run evidence. It describes and verifies the target implementation — it does not replace the implementation and never writes business code in the same workflow.

**Three-layer architecture**: the HTML is the database, `scripts/spec.mjs` is the only write path (the validator guards the gate — nothing that fails validation gets written), and `assets/template.html` is the stateless render engine (never modified for business needs; upgrading = `save --retemplate`). The **single authoritative definition** of the field contract, revision semantics, status algebra, judges, template protocol, and allowlist lives in `references/contract.md` — implementation and disputes always defer to it; this file does not restate it.

**Operating conventions**: run `node <this skill dir>/scripts/spec.mjs <command> …` from the repo root; **the artifact must live inside a git repository** (the gate replay anchor, recovery, and source observation all depend on it); business artifacts always go to `docs/mini-app-spec/<requirement-name>/mini-app-spec.html` (record-run evidence lands in `evidence/` in the same directory automatically; RUN numbering is per-spec, hence one subdirectory per requirement — never flattened); contract edits go through the extract → edit JSON → save round-trip (put payloads in a temp directory), and **never hand-write the HTML body**. During per-flow alignment, `open` the artifact for the user at the end of each round once it is ready (macOS `open`; in headless environments report the artifact path instead); the review deliverable at Hard Stop ① is the flow list plus issues (an empty prototype area is the normal shape at that point) and can be presented directly in chat.

## Anti-cheating iron rules (mechanically enforced, not honor-system)

1. The contract may only be written via `save`; bypasses are caught by the envelope (ENV-01) and `validate --against-git` (replay detection, anchor = gate commit).
2. Derived status is **computed, never stored**: hand-writing `passed` is an immediate error; scenario status can only be derived from evidence.
3. Verification is **executed by record-run itself** (the agent supplies commands, never results); commands are frozen at the verification gate, and behavioral semantics (fingerprint) are frozen at flow alignment — change a Then and old evidence auto-invalidates.
4. Acceptance must quote the user's verbatim words and pass six hard preconditions (source batch gate, zero proposed annotations, per-scenario waivers for every non-green core scenario, etc.).

## Workflow (two hard stops + per-flow soft stops)

0. **Resume**: `spec.mjs status <html>` produces a recovery briefing in one command. Done when: you can tell the user "where we stopped last time and what comes next."
1. **Collect + map → 🛑 Hard Stop ①**: read requirements/BDD/Figma (MCP)/code, register sources → decompose into flows (vertical user flows + risk tier + core flag). Qualification is a one-sentence judgment call: if there are no multiple states, no interactions, and no acceptance reconciliation, declare the skill inapplicable and exit. **Single-point design questions ("how should this interaction feel?") yield to a throwaway prototype probe** (use a rapid-prototyping skill like `/prototype` if one is installed; otherwise a disposable page — probe and discard) — once the probe has an answer, come back to this skill and register the conclusion as a source or an issue.decision. Interactions that resist description during per-flow alignment get the same treatment: probe the feel first, then land the template once — don't trial-and-error inside the contract. Done when: **the user confirms the flow list and tiering in their reply** (persisting the flow list with `alignStatus=pending` for confirmation is the expected move; "don't decompose flows" means no per-flow expansion of states/scenarios before confirmation). After confirmation, `save --gate gate1` stamps the replay anchor.
2. **Per-flow alignment (soft stops)**: high-uncertainty flows one at a time; low-risk flows batched ≤3. Fill in states/transitions/scenarios/templates → only `open` for user review once `validate` reports 0 errors. Decision points become multiple-choice questions with a stated default; a string of high-impact decisions may escalate to interrogation-style questioning — use a grilling skill like `grill-me` if installed, otherwise degrade to a chain of leaning multiple-choice questions; do not pull in wayfinding/navigation-type skills. Done when: the user approves the flow in their reply → `alignStatus=aligned` (freezing the fingerprint) and `--gate` stamps an anchor; this phase completes only when **every core flow is aligned**.
3. **Implementation** (outside this skill).
4. **Reconciliation → 🛑 Hard Stop ②**: verification gate freezes commands → record-run collects evidence per scenario → run `refresh-sources` first, then show the user an evidence summary (all-green only waives item-by-item review, never the stop itself) → user explicitly accepts → `accept`. Done when: `accept` writes successfully and `--gate` stamps an anchor; on failure, report the validator's outstanding-items list verbatim — no sugar-coating.

**Change backfill**: contract-level changes go through save (the changelog keeps the trail automatically); behavioral changes send affected flows back to pending alignment; minor UI/implementation details don't backfill. Modification is the normal path (extract → edit → save), not the exception.

## Template quality iron rules

> The mechanics and allowlist of each protocol (`data-live`/`data-note`/`data-show-in`/`data-snap`/`metrics`/`demoPath`/`autoMs`…) are defined in contract.md §4/§8; this section only sets the behavioral bar.

- **A live screen, not a slide deck**: a flow's multiple states share one persistent screen via a shared template (regions show/hide, control values survive, cloud callbacks are simulated with auto-transitions).
- **Continuous interactions must be operable**: a slider drag produces real-time visual feedback; **buttons that narrate an interaction in text are forbidden** (a "simulate drag" button = failing grade).
- **Put the explanation into the picture**: pin annotation markers on key regions, hang metrics badges on quantitative semantics, give core scenarios a demo walkthrough — a reviewer should understand it without reading any document.
- Skin states with the engine's mock utility classes (`.mcv/.layer/.optline/.opt/.gearrow/.gear/.cta/.ghost/.slabel`); the dark theme should match the temperament of the app under review; templates contain zero JS and zero external links.
- Style-critical screens: a Figma pointer (data via MCP; on failure hard-stop, never guess) or a figmaNote — one of the two is required; a reconciliation-type spec may declare "visual authority = the live implementation," but must open an issue for the user to adjudicate.
- Every reviewable object has a stable short ID, click-to-copy on the page (the coordinate system for chat feedback); annotations are **click-to-anchor** (enter annotation mode → click an element → the pin stays put) — never force the user to pick IDs by hand.
- **Open-source library policy**: CSP forbids external links; the engine may inline small vendored MIT/BSD libraries (≤15KB min each, header comment recording name/version/license). When interaction complexity exceeds what hand-written code can reasonably do, prefer vendoring over degrading the experience; CDNs and heavyweight frameworks are forbidden.

## Annotation loop

📌 An annotation anchors to any stable ID and may carry a change proposal → exporting JSON yields a **structured change ticket** → `merge-feedback` merges them as `proposed` (**which blocks acceptance**) → the user adjudicates one by one: adopted ⇒ the agent lands it in the contract via save and runs `annotate --status resolved`; declined ⇒ `rejected`, the proposal text preserved verbatim. For scattered synchronous feedback, just say the short ID in chat; reserve annotations for batch/async reviews or when a closed loop must be guaranteed.

**Review express lane**: `review` starts a local session (loopback address, zero rewriting of the artifact) — the user annotates in-page and clicks "Submit to agent"; the command returns the queue file path, which feeds straight into `merge-feedback` — no export, no copy-paste. It blocks in the foreground (give the Bash call a generous timeout); if killed or timed out, **just rerun — submitted queues are persisted and never lost**; the user clicking "Send & End" = session over; do not reopen uninvited.

## Command quick reference (semantics in contract.md)

| Command | Purpose |
|---|---|
| `new <html> --id --title` | Create an empty artifact from the fixed engine |
| `extract` / `save --data [--expect-revision] [--gate name] [--retemplate]` | The only write path in/out of the contract; gate also makes a git commit (replay anchor) |
| `validate [--strict] [--against-git]` | Full rule validation; must be 0 errors before open/accept |
| `status` | Read-only recovery briefing (the five-tuple is never collapsed) |
| `confirm-command --scenario --command` | Verification gate: freeze the verification command |
| `record-run --scenario [db scenarios require the three device params]` | Evidence collection executed by the tool itself (judges: assert/db/file/grep) |
| `refresh-sources` | Generate a complete source-observation batch (mandatory before acceptance/reconciliation); file adapter first — remote sources (Figma/Confluence) observe as `unavailable` and need a per-source sourceWaiver at acceptance |
| `review [--timeout ms] [--port n] [--no-open]` | Local review session: in-browser annotations reach the agent in one click (blocks until submit; persists feedback-N.json) |
| `merge-feedback --data` / `annotate --id --status` | Merge annotation tickets / record the user's adjudication |
| `accept --verbatim "user's exact words"` | Write the acceptance fact (hard preconditions enforced by the validator) |
| `progress [--stage] [--next] [--worth-it] [--current-flow]` | Write the progress/self-review block (untrusted block, doesn't bump revision — use it for the closing worthIt, never hand-edit the HTML) |
| `recovery --reason` | Rebuild from the trusted baseline at the latest gate commit |
| `export-md [--out]` | Degraded export to portable Markdown (the HTML stays authoritative) |

## Self-check and survival

- After changing `spec.mjs`/`template.html`, you must run `node scripts/run-fixtures.mjs` and `node scripts/run-injections.mjs`; the change counts as done only when **both are fully green**.
- At the end of every run, write one line via `progress --worth-it`: "was this run worth it + actual minutes" (written at wrap-up, legal after the gate — against-git only requires chain continuity).
- **Snapshot remote sources first**: land remote PRDs (Confluence/Jira, etc.) as local files under `sources/` next to the artifact and register the locator with the snapshot path (put the original URL in role/version) — the file adapter can observe them and evidence stays verifiable; upstream drift is surfaced by re-snapshot + refresh-sources. Death clause: two consecutive real requirements that bypass this skill, or two self-assessed net losses → cut the most expensive step of that run; a repeat offense retires this skill.
