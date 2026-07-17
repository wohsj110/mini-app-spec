# mini-app-spec Contract v1 (SSOT)

> This document is the **single authoritative definition** of the mini-app-spec field contract, revision semantics, status algebra, judges, and security rules.
> `spec.mjs` and the validator implement exactly this; SKILL.md does not restate it. This document is self-contained — understanding and implementing it depends on no file outside the skill directory. Design history (reference only, not distributed with the skill): host repo `docs/plans/2026-07-16-mini-app-spec-redesign-final.md` (v3.1 GO).
> All 12 items from the three-review "implementation-phase watchpoints" have been folded into this document (marked `[N-x]` in the relevant sections).

## 0. Versioning and evolution

- `specVersion: 1`. Adding an **optional** field = minor (older engines/validators ignore unknown fields); adding a required field or changing semantics = major.
- If the validator encounters a major version above what it supports ⇒ verdict is `blocked` for the whole artifact; never guess-parse.
- Migration code is written only when real existing artifacts actually need migrating.

## 1. Threat model

Defends against **mistakes / laziness / hallucination**, not a malicious agent (same trust domain, no cryptographic tamper-proofing, no external signing/CI).

- The light seal (envelope) = accident and laziness detection, not anti-forgery.
- The only trusted anchor for replay / out-of-band-overwrite detection = the git gate commit (§3.2); with no anchor, honestly return `unavailable` — **unavailable ≠ pass** [N-1].
- The last line of defense = the user seeing the evidence with their own eyes at Hard Stop ②.

## 2. Artifact structure

```
mini-app-spec.html
├─ engine segment (single <script> + single <style>, versioned via engineVersion)
├─ <script type="application/json" id="mini-app-contract">
├─ <script type="application/json" id="mini-app-ledger">
├─ <script type="application/json" id="mini-app-progress">   # untrusted, excluded from the envelope
├─ <script type="application/json" id="mini-app-stamp">
└─ <template id="ui-ST-*"> × N
```

- The four data-block ids and every template id are unique across the document; duplicates ⇒ `STR-05`.
- Before embedding, `<` inside JSON is escaped to `\u003c`.
- stamp: `{artifactVersion, engineVersion, validatorVersion, revision, parentRevision, hashes:{contract, templates, engine, ledger}, lastValidatedAt}`.
  - `templates` hash = sha256 of all template blocks concatenated in lexicographic id order; `engine` hash = sha256 of the engine segment (raw script+style text) — **a different value from the CSP hash** (§8.2) [N-9].

## 3. Revision semantics

### 3.1 Operation classification (every transactional write does `revision++`) [N-5]

| Operation | Blocks written | revision++ | parent | Hashes updated |
|---|---|---|---|---|
| `save` (spec/template edit) | contract/templates | ✅ | current | contract, templates |
| `record-run` | ledger | ✅ | current | ledger |
| manual confirmation / revocation | ledger (as a run fact, §7.4) | ✅ | current | ledger |
| verification gate command confirmation | contract (verification.command*) | ✅ | current | contract |
| annotation merge / status update | ledger | ✅ | current | ledger |
| `refresh-sources` | ledger | ✅ | current | ledger |
| decidedImpact / acceptance write | ledger | ✅ | current | ledger |
| `save --retemplate` | engine segment | ✅ | current | engine (+CSP hash updated in lockstep, §8.2) |
| recovery | full file rebuild | ✅ (= max visible revision + 1) [N-2] | **recovery source (latest gate baseline) revision** | all recomputed |
| `save --gate` | none (git commit only) | ❌ | — | — |
| `status` / `validate` | read-only | ❌ | — | — |

- `revision` is a **monotonically increasing positive integer**; ordinary transactional writes set parent = the pre-write revision.
- Recovery records: `recoveries[] += {at, reason, fromRevision(corrupted), trustedBaseCommit, diffSummary}`; the new revision takes the current maximum visible value +1, avoiding collision with the corrupted branch [N-2].
- Gate commit message: `spec(<meta.id>): gate <name> r<revision>`, committing only this HTML path.
- Implicit runs (manual confirmation) share the `runs[]` structure with explicit runs (§7.4); **a second, implicit ledger is not allowed** [N-5].

### 3.2 `validate --against-git` exact algorithm [N-1]

1. `git log --follow -- <artifact path>`: find the latest gate commit (message matching `spec(<meta.id>): gate `); take the stamp from that blob.
2. Not found (no git repo / no gate commit / shallow-clone truncation / rename breaking follow) ⇒ return `GIT-02: unavailable` (informational; under `--strict` the anchor is required, otherwise error). **Never treat unavailable as pass.**
3. With an anchor available, check:
   a. `current.revision > gate.revision`, or `==` with all four hashes equal (no writes since gate); otherwise ⇒ `GIT-01` (suspected replay / out-of-band overwrite).
   b. **Chain continuity**: within ledger.changelog ∪ recoveries, every revision in `(gate.revision, current.revision]` appears exactly once with parents linking up (recovery may parent onto the gate-baseline fork); gaps/duplicates ⇒ `GIT-01`.
4. Boundary statement: this detection only finds "regression/overwrite of the current file relative to the latest gate"; it does not defend against tampering with git history itself.

## 4. contract block field contract

ID format: `SRC-* / FLOW-* / ST-* / TR-* / REQ-* / SCN-* / EX-* / ISS-* / ANN-* / RUN-* / OBS-* / BATCH-* / ACC-* / REC-*` (`[A-Z]+-[A-Za-z0-9_-]+`, unique across the document, never reused; deleted nodes are marked `removed`, entries are never removed).

| Object | Fields (★ = required) | Constraints |
|---|---|---|
| `meta` | ★id, ★title | **No status fields** (all status is derived, §6) |
| `sources[]` | ★id, ★kind(`doc/figma/code/api/other`), ★locator, ★version(free text: sha/version/date, for human lookup), ★role; excerpts:[{id,text}]? | The current hash lives only in ledger.sourceObservations |
| `flows[]` | ★id, ★title, ★priority(`core/normal/low`… see below), ★risk(`high/low`), ★core(bool), ★alignStatus(`pending/aligned`), ★stateRefs[] | priority may be free text; **core-ness is judged solely by the core field** |
| `states[]` | ★id, ★flowRef, ★name, ★uiTemplateRef, ★figma\|figmaNote (exactly one), ★entry(`default/deeplink/notification/resume/none`), ★terminal(bool) | uiTemplateRef must point to an existing template block |
| `transitions[]` | ★id, ★flowRef, ★from, ★to, ★trigger, ★result, ★isDefault(bool); guard?, scenarioRefs[]?, loopAllowed(bool)? | from/to must belong to the same flow (`FSM-06`) |
| `requirements[]` | ★id, ★text, ★kind(`behavior/constraint/non-functional`), ★sourceRefs[]; excerptRef?, scenarioRefs[]?, waiver? | behavior kind needs non-empty scenarioRefs or a valid waiver (`ALG-02`) |
| `scenarios[]` | ★id, ★flowRef, ★given[], ★when, ★then[], ★examples:[{★id,★values}], ★verification; stateRefs[]?, demoPath[]? (sequence of transition ids — one-click auto demo walkthrough on the scenario card; excluded from the fingerprint) | examples may be `[]` (treated as a single implicit example, id = `<SCN>-implicit`) |
| `issues[]` | ★id, ★type(`blocker/question/tradeoff`), ★question, ★options[], ★impact, ★status(`open/decided`), ★decision(null until the user adjudicates), affectedRefs[]? | The only legitimate origin of decision = the user's reply |

- `verification`: `{★kind(assert/db/file/grep/mock/manual), ★assertion, ★evidencePolicy, command(null|string), commandHash(null|string), commandConfirmedAt(null|string)}`. `file/grep` are judge-only (no command execution; they check the repo's current state directly), command may be null, and the run's cmdHash is the canonical hash of the assertion.
- `waiver`: `{★reason, ★authority(user's verbatim words or a confirmed source locator), ★approvedAt}`; any field missing ⇒ `ALG-03`.
- **Derived status fields must never be persisted**: any contract object carrying a derived-semantics field such as `status`/`result`/`passed` (other than the enum fields listed above) ⇒ `ALG-01`.

### 4.1 FSM decidability rules (mechanically enforced by the validator)

- `FSM-01`: every flow has ≥1 state with `entry ≠ none`.
- `FSM-02`: every state in a flow is reachable from some entry.
- `FSM-03`: from every entry, following the default path (isDefault out-edges; a single out-edge counts as default) some state with `terminal=true` is reachable.
- `FSM-04`: among multiple guard-less out-edges of one state, exactly one must have `isDefault=true`.
- `FSM-05`: any cycle on the default path must have `loopAllowed=true` on every edge in the cycle.
- `FSM-06`: a transition's from/to/flowRef must be mutually consistent.
- guard is free text (excluded from satisfiability judgment; only used to exclude edges from default-path selection).

## 5. ledger block field contract

| Object | Fields (★ = required) |
|---|---|
| `runs[]` | ★id, ★scenarioRef, ★scenarioFingerprint, ★verificationHash, ★exampleResults:[{★exampleRef,★result}], ★at, ★revision (artifact revision at write time), ★gitHead, ★dirty(bool), dirtyDiffHash (★ when dirty=true), ★cmd, ★cmdHash, ★exitCode, signal?, ★timeoutMs, testCount (★ for assert kind), ★outputExcerpt (redacted before persisting), ★redacted(bool), ★outputSha256, ★evidence:[{★path,★sha256,★type,★size,★redacted}], ★result; db/device scenarios additionally ★: buildVariant, devicePackage, deviceSerial (`LED-01`) |
| `acceptances[]` | ★id, ★at, ★verbatim, ★revision, ★sourceBatchId, ★sourceWaivers:[{★sourceRef,★verbatim,★at}], ★deviationsAcknowledged:[{★ref,★waiver}] |
| `sourceObservations[]` | ★id, ★batchId, ★sourceRef, ★observedHash (null allowed), unavailableReason?, ★observedAt, ★outcome(`unchanged/changed/unavailable`), decidedImpact?:{★affectedRefs,★decidedAt,★verbatim,★authority} [N-8] |
| `annotations[]` | ★id, ★targetId, ★comment, proposal? (the change suggestion the annotation carries), ★status(`proposed/resolved/rejected/outdated`). **A proposal is never auto-adopted**: only after the user's explicit consent does the agent land it in the contract via save and set the annotation resolved; if declined, the proposal text is kept verbatim |
| `recoveries[]` | ★at, ★reason, ★fromRevision, ★trustedBaseCommit, ★diffSummary |
| `changelog[]` | ★rev, ★at, ★type(`spec/run/annotation/source/engine/acceptance/recovery`), ★changed:[{ref,fields}] |

- **Ordering semantics** [N-7]: "latest" = the entry with the greatest `revision`; within the same revision, the later one in array order. **Never sort by wall-clock `at`** (clock rollback or same-instant ties never affect judgment).
- **Observation baseline** [N-8]: the first observation per source is the baseline; subsequent `outcome` is computed relative to "that source's observation in the batch referenced by the acceptance, else its most recent adjudicated observation (decidedImpact present), else the baseline."
- Evidence paths must be inside the repo and not symlinks; `outputExcerpt` is scanned against key/token patterns and redacted before persisting, with `redacted` set.

## 6. Derived-status algebra (total function, [N-3] truth table)

**All derived status is computed, never stored.** Input = contract + ledger; output is computed at `status`/render time.

### 6.1 run level

- `run.result ∈ {passed, failed, blocked}`. Judge parse failure, evidence validation failure (missing / hash mismatch / out-of-bounds path), timeout, or signal termination ⇒ `blocked` (failed strictly means the assertion did not hold).
- **Applicability**: a run is applicable ⇔ `run.scenarioFingerprint == current scenario fingerprint` and `run.verificationHash == current verificationHash`; otherwise it is historical (kept for display, excluded from derivation).
- A dirty run is applicable, but its result carries the dirty marker (visible in views). A stale gitHead alone does not invalidate a run (re-verification is triggered wholesale by the reconciliation phase).

### 6.2 example / scenario level

- Example status = `exampleResults[exampleRef]` of the latest applicable run covering it; none ⇒ `not-run`.
- Scenario three axes:
  - `coverage`: all examples have applicable runs ⇒ `full`; some ⇒ `partial`; none ⇒ `not-run`.
  - `result` (worst-of aggregation, order `failed > blocked > not-run > passed`).
  - `evidenceLevel`: kind=mock ⇒ `weak`; assert/db/manual ⇒ `strong`.
- manual: an unrevoked confirmation exists (§7.4) ⇒ that confirmation is the applicable run (all examples passed/strong); none ⇒ not-run.

### 6.3 scenario → single value (truth table)

Evaluate in order; first match returns:

| # | Condition | scenarioValue |
|---|---|---|
| 1 | result contains failed | `failed` |
| 2 | else result contains blocked | `blocked` |
| 3 | else coverage = not-run | `not-run` |
| 4 | else coverage = partial | `partial-coverage` |
| 5 | else evidenceLevel = weak | `passed-weak` |
| 6 | else | `passed` |

### 6.4 aggregation level

- `flow.implementationStatus` = worst scenarioValue of its scenarios (order `failed > blocked > not-run > partial-coverage > passed-weak > passed`); **zero scenarios ⇒ not-run** (an empty set never turns green).
- Requirement coverage = aggregation over its scenarioRefs (same order); a valid waiver ⇒ `waived` (counted in its own column — not green, but doesn't block delivery).
- `spec.implementationStatus` = aggregation over core flows; zero core flows ⇒ `not-run`.
- `sourceStatus` (per source): no observation ⇒ `unknown`; latest outcome=unavailable ⇒ `unavailable`; changed without decidedImpact ⇒ `changed`; changed and adjudicated ⇒ `changed-acknowledged`; unchanged ⇒ `fresh`.

### 6.5 specAcceptance

- A valid acceptance exists and the changelog has no behavior-level change after its revision (state/transition/scenario/verification/fingerprint-component fields) ⇒ `accepted`.
- An acceptance exists but behavior-level changes follow it ⇒ `re-review`.
- No acceptance: an aligned flow exists ⇒ `review`; otherwise `draft`.

### 6.6 Acceptance validity (**write-time preconditions**, hard-enforced by the validator)

All must hold for an acceptance fact to be written:

1. `ACC-06`: every core flow has `alignStatus=aligned`.
2. `ACC-03`: no issue with `type=blocker` and `status=open`.
3. `ACC-04`: no `proposed` annotations.
4. `ACC-01`: `sourceBatchId` = the latest refresh batch **as of the acceptance write** (reconstructed from the rev order of `type=source` changelog entries; with no source entries, the last batch in observation array order), and that batch contains an observation for **every** registered source; referencing a historical batch at write time = invalid.
5. `ACC-02`: within that batch, any outcome ∈ {changed (unadjudicated), unavailable} or any never-observed source (unknown) ⇒ blocked, unless that source has the user's item-by-item confirmation in `sourceWaivers`.
6. `ACC-05`: every core scenario with scenarioValue ≠ `passed` has an entry with a complete waiver in `deviationsAcknowledged`.

**Point-in-time semantics**: these are write-time preconditions, not permanent invariants. New batches, new issues, and new annotations legitimately appended after an acceptance do **not retroactively pollute** the existing acceptance (otherwise, once an acceptance exists, even refresh-sources could never be written — deadlocking source-drift detection); their impact surfaces through the five-tuple display axes (sourceStatus/openBlockers/…) and `specAcceptance=re-review`. Static-validation implementation baseline: ACC-01/02 reconstruct each acceptance's write-time batch via changelog order; ACC-03/04/05/06 depend on current state and are evaluated only when that acceptance is the latest write (`acc.revision ≥ max changelog rev`) — which is exactly equivalent to "checked at the moment accept was written."

### 6.7 Composite status display [N-4]

`status` outputs a five-tuple, **never collapsed**: `{specAcceptance, implementationStatus, sourceStatus summary, openBlockers count, proposedAnnotations count}`. `(accepted, failed)` and `(accepted, changed)` must be shown as-is; synthesizing a single green is forbidden.

## 7. Verification judges

### 7.1 Two-stage freezing and canonical serialization [N-6]

- Flow alignment freezes `scenarioFingerprint = "fp1:" + sha256(canonical(given, when, then, examples, verification.assertion, verification.evidencePolicy))`.
- After the verification gate confirms the command, compute `verificationHash = "vh1:" + sha256(canonical(kind, command, confirmedAt, judgeVersion))`.
- **Canonical serialization**: UTF-8, NFC normalization, object keys in lexicographic order, arrays keep order, no extra whitespace, shortest number representation, string CRLF→LF. Changing the hash version prefix (fp1/vh1) makes all old values historical.
- Changing the command ⇒ only reopens the verification gate (a new confirmation record); a change to any fingerprint component ⇒ the flow returns to pending alignment + all old runs become historical.

### 7.2 The judge kinds

| kind | Judging rule | blocked condition |
|---|---|---|
| `assert` | evidencePolicy points to structured test results (JUnit XML etc.); `testCount > 0` and all passing (`ALG-05`) | parse failure / testCount=0 follows the assertion's semantics (whether 0 matches ⇒ failed is defined by the assertion; default blocked) |
| `db` | frozen read-only query + expected predicate; the judge evaluates the query output | query failure / unparseable output |
| `mock` | pass ⇒ evidenceLevel=weak; can never be the sole delivery evidence (backstopped by §6.6-6) | same as assert |
| `manual` | produced only by a user confirmation fact (§7.4), never auto-passed | — |
| `file` | judge-only file-tree reconciliation: assertion `{paths:[paths/globs…]}` all exist ⇒ passed; evidence = matched files + sha256 | paths empty |
| `grep` | judge-only template/config/key-binding reconciliation: assertion `{path(glob), pattern(regex), predicate(numeric predicate)}` evaluates the predicate against the match **count**; **counts only, matched values never persisted** (secret-safe; evidence marked redacted) | pattern/predicate unparseable |

- record-run only executes frozen commands; before and after execution it checks that the artifact file and gitHead were not modified by the command.
- db/device scenario runs require device context (`LED-01`) — it is part of what is being judged.

### 7.4 manual confirmation facts

Persisted in the ledger in run form: `{id: RUN-*, scenarioRef, scenarioFingerprint, verificationHash, exampleResults(all passed), at, revision, cmd: "manual-confirmation", confirmation:{verbatim, at}, result:"passed", evidence:[]}`. Revocation = appending `{cmd:"manual-revocation", revokesRunRef}`; a revoked run is no longer applicable.

## 8. Template and engine security

### 8.1 allowlist (anything not listed ⇒ `TPL-01`)

- **Allowed tags**: `div span p h1-h6 ul ol li button label img input svg path rect circle line g text br strong em small`.
- **input**: type ∈ `text/checkbox/radio/range`.
- **img**: `data:` URIs only; MIME ∈ `image/png image/jpeg image/webp`; ≤64KB [N-9].
- **Allowed attributes**: `class`, `style` (restricted property set: color/background/gradient/border/spacing/size/font/text/flex/grid/border-radius/opacity; **url() forbidden inside style**), `data-go`, `data-spec-id`, `data-figma`, **`data-live`/`data-live-text`/`data-note`** (data-note = ①②③ annotation-point pins; data-formula/data-live-formula = live formula interpolation with {v}{inv}{raw}{max}; data-hold-compare/data-compare-hide = press-and-hold to compare with the original; data-snap/data-snap-text = persisted-snapshot mock; data-show-in/data-on-in = the **one-flow-one-screen protocol** (one flow shares a single persistent screen: regions show/hide per state, selected states highlight, state switches within the same template don't rebuild and control values survive — the validator checks its tokens are existing state ids) — the engine auto-renders the event log and the "in-memory vs persisted" data-flow panel) (declarative micro-interactions: the engine maps the normalized value of `input[type=range][data-live=N]` to the `--live-N` CSS variable on the stage and syncs `[data-live-text=N]` text — templates express continuous interaction with zero JS, e.g. a slider driving layer opacity), input's `type/value/placeholder/checked/disabled/min/max/step`, svg geometry attributes.
- **Forbidden**: `script iframe object embed meta base form link a template(nested) style(tag)`; all `on*` attributes; `javascript:`/`vbscript:`/external URLs; `srcdoc`; `formaction`.
- `TPL-02`: the target transition of `data-go` must exist and its `from` ∈ the set of states sharing that template (all states whose `uiTemplateRef` points to it; with no referrers, fall back to the `ui-<stateId>` naming) — at runtime go() re-checks against the current state anyway.

### 8.2 CSP [N-9]

- `script-src 'sha256-<hash of the engine script element text, bytes taken per the CSP spec>'` — **a value independent of stamp.hashes.engine** (sha256 of the whole engine segment); each is computed separately.
- **`'unsafe-inline'` is forbidden in script-src** (no fallback under any circumstances); `style-src 'unsafe-inline'` is allowed (styles are not in the threat model's execution surface); `img-src data:`; `default-src 'none'`.
- On `--retemplate`, spec.mjs recomputes in lockstep: the CSP script hash, stamp.engine hash, and engineVersion — all three updated in one transaction.

## 9. save transaction and failure semantics [N-10]

1. The temp file is written to the **same directory** (guaranteeing same-filesystem rename atomicity).
2. **Before rename**: parse-back self-check (on failure ⇒ the original file was never touched; delete the temp file and report the error).
3. Back up the original as `<name>.bak` → fsync the temp file → atomic rename → **fsync the parent directory**.
4. Second read-back after rename: failure ⇒ auto-rollback from `.bak`; success ⇒ delete `.bak`.
5. A leftover `.bak` found at startup: main file parses ⇒ notify and delete; unparseable ⇒ prompt recovery from .bak or git.
6. Lockfile `<name>.lock` contains `{pid, startedAt}`; if the holding process is gone or older than 10 minutes ⇒ safe to clear.
7. Revision CAS: file revision ≠ the command's expected revision ⇒ refuse the write and report the conflict.

## 10. Threshold sampling [N-12]

- On save, auto-sample into progress: file byte size, save+validate duration.
- **Merge-conflict counts are not auto-sensed**: written into progress explicitly by `merge-feedback` or upon user confirmation.
- Any threshold hit (>1.5MB / >5s / conflicts ≥2) ⇒ prompt the bundler exit plan.

## 11. Validator rule catalog (fixtures are keyed by this)

| Group | Rules |
|---|---|
| STR | 01 JSON parses and is escape-safe; 02 required fields; 03 ID format; 04 ID uniqueness; 05 data-block/template id uniqueness; 06 higher major version ⇒ blocked |
| REF | 01 every *Ref/*Refs resolves; 02 orphan template (no state references it) is an error |
| FSM | 01-06 see §4.1 |
| ALG | 01 derived status persisted; 02 behavior requirement uncovered and unwaived; 03 incomplete waiver structure; 04 run with result=passed has empty evidence or missing/hash-mismatched files (file verification runs under `--strict` and only against **applicable** runs — a historical run's evidence legitimately drifts as the artifact evolves and its hashes are not re-checked); 05 assert run missing testCount or =0 |
| ACC | 01-06 see §6.6 |
| LED | 01 db/device run missing device context; 02 run missing fingerprint/verificationHash |
| TPL | 01 allowlist violation; 02 illegal data-go; 03 img data URI violation |
| ENV | 01 hash mismatch (out-of-band edit); 02 in-file revision/changelog chain broken or duplicated |
| GIT | 01 regression/overwrite relative to the gate anchor; 02 anchor unavailable (informational; error under --strict) |

The fixtures list and expected results live in `scripts/fixtures/README.md`. Phase-one tests must use a temporary git repo + fixture gate commits to cover GIT-01/02 (including no-anchor ⇒ unavailable) [N-11].
