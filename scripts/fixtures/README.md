# Validator Fixtures

Rule codes are defined in `references/contract.md` §11. Fixtures cover contract+ledger-level rules; TPL rules use HTML-snippet fixtures; GIT-01/02 are constructed in the test harness with a temporary git repo + fixture gate commits (contract.md [N-11]).

## Format conventions

- **Good cases**: complete `{specVersion, contract, ledger}` JSON. Fingerprint/hash fields hold placeholder values (`fp1:demo…`); structural validation does not verify their computed values — value consistency belongs to status derivation and is tested separately by the D3 derivation tests.
- **Bad cases**: `bad-*.json`, format `{description, base, expect, ops}` — `ops` is an RFC6902 JSON-Patch applied to `base` before sending to the validator; `expect` = the rule codes the validator **must at least report** (other codes may accompany them, e.g. FSM-05 often comes with FSM-03).
- Harness flow: read base → apply ops → validate → assert expect ⊆ the actually reported code set.

## Catalog

| File | base | expect | Description |
|---|---|---|---|
| valid-minimal.json | — | 0 error | Minimal legal spec: one flow, one state (entry+terminal), manual scenario |
| valid-typical.json | — | 0 error | Two-state chain + guarded back-edge, assert scenario + examples, passed run, complete refresh batch + valid acceptance |
| bad-str04-duplicate-id.json | minimal | STR-04 | Duplicate state id |
| bad-ref01-dangling.json | minimal | REF-01 | stateRefs references a ghost state |
| bad-fsm01-no-entry.json | minimal | FSM-01 | Flow has no entry state |
| bad-fsm02-unreachable.json | typical | FSM-02 | Unreachable orphan state |
| bad-fsm04-double-default.json | typical | FSM-04 | Two guard-less out-edges of one state both isDefault |
| bad-fsm05-loop-default.json | typical | FSM-05 | Default path forms a cycle without loopAllowed (FSM-03 may accompany) |
| bad-alg01-derived-stored.json | minimal | ALG-01 | Scenario persists a hand-written status:"passed" |
| bad-alg02-uncovered.json | minimal | ALG-02 | Behavior requirement with no scenarios and no waiver |
| bad-alg03-waiver.json | minimal | ALG-03 | Waiver missing authority/approvedAt |
| bad-alg04-passed-no-evidence.json | typical | ALG-04 | Passed run with empty evidence |
| bad-alg05-testcount.json | typical | ALG-05 | Assert run with testCount=0 |
| bad-led01-db-context.json | typical | LED-01 | db-scenario run missing device context |
| bad-led02-no-fingerprint.json | typical | LED-02 | Run missing scenarioFingerprint |
| bad-acc01-stale-batch.json | typical | ACC-01 | Acceptance references a stale refresh batch |
| bad-acc02-unavailable.json | typical | ACC-02 | Batch contains an unavailable source with no sourceWaiver |
| bad-acc03-open-blocker.json | typical | ACC-03 | Acceptance exists while an open blocker remains |
| bad-tpl01-script.html | — | TPL-01 | Template contains `<script>` |
| bad-tpl02-datago.html | typical | TPL-02 | data-go points to a transition whose from ∉ the owning states |

## Running

- `node scripts/run-fixtures.mjs` — acceptance of the fixtures in this directory (validateData/validateTemplates).
- `node scripts/run-injections.mjs` — phase-one fault injection, four groups (integrity / transaction / anti-fake-green / lifecycle), fully automated in a temporary git repo; covers GIT-01/02, ENV-01, CAS/locking, the record-run judges, fingerprint invalidation/restoration, the source gate and acceptance, and zero-loss retemplate.
