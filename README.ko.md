# Mini-App Spec

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | **한국어**

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg) ![Node >= 18](https://img.shields.io/badge/Node-%E2%89%A5%2018-blue.svg) ![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg)

여러 소스에 흩어진 복잡한 요구사항(PRD / BDD / Figma / 코드)을 **자체 완결형 단일 파일 `mini-app-spec.html`** 로 생성·정렬하는 에이전트 스킬입니다. 이 *실행 가능한 명세서*에는 기계가 읽을 수 있는 계약(contract), 조작 가능한 프로토타입, 상태 기계 캔버스, BDD 인수 시나리오, 주석 리뷰 루프, 검증 가능한 실행 증거가 내장됩니다. 구현이 끝나면 같은 산출물로 구현 결과를 **대조(정산)** 합니다.

AI 코딩 에이전트(Claude Code, Codex, Cursor 등)를 위해 설계되었습니다. 에이전트는 잠금된 CLI 파이프라인을 통해 명세서를 생성·유지하며, 밸리데이터가 에이전트의 눈속임을 *구조적으로 어렵게* 만듭니다.

## 설계 원리: 명세서 자체가 미니 앱이다

이 스킬은 Matt Rickard의 에세이 [*The Unreasonable Effectiveness of Mini Apps as Specs*](https://blog.matt-rickard.com/p/the-unreasonable-effectiveness-of-675)의 아이디어를 강화한 구현입니다. 현실과 점점 멀어지는 정적 문서 대신, 이해관계자가 클릭해 보고, 주석을 달고, 구현에 책임을 물을 수 있는 작은 앱으로 명세를 전달합니다.

그 아이디어 위에, 문서로는 불가능한 것들을 더했습니다:

- **기계 계약이 유일한 진실(SSOT)** — 플로우, 상태, 전이, Gherkin 시나리오, 검증 방법이 산문이 아닌 HTML 내 구조화된 JSON으로 존재합니다.
- **파생 상태는 계산만 하고 저장하지 않음** — 사람이든 AI든 `passed`를 손으로 쓸 수 없습니다. 시나리오 상태는 증거로부터 도출되거나 `not-run`입니다.
- **주장이 아닌 증거** — 검증 명령은 게이트에서 동결되고, 도구 자신이 직접 실행(`record-run`)하며, 출력은 해시되어 원장에 기록됩니다.
- **끝까지 닫히는 리뷰 루프** — 핀 방식 주석은 안정적인 ID에 고정되고, 구조화된 변경 티켓으로 내보낼 수 있으며, 판정될 때까지 *인수를 차단*합니다.

## 3계층 아키텍처

```
mini-app-spec.html          ← 산출물: 더블클릭으로 열림, 서버 불필요
├── 렌더링 엔진               (무상태 · 버전 관리 · 비즈니스 비의존)
├── <script id="mini-app-contract">   ← 기계 계약 = SSOT
├── <script id="mini-app-ledger">     ← 실행 / 증거 / 주석 / 인수 원장
├── <script id="mini-app-stamp">      ← 봉인: 블록별 해시 + revision 체인
└── <template id="ui-ST-*">           ← 선언적 · 제로 JS 프로토타입 화면
```

| 계층 | 역할 | 규칙 |
|---|---|---|
| `mini-app-spec.html` | **데이터베이스.** 계약 + 원장 + 템플릿 일체 | 수동 편집 금지 |
| `scripts/spec.mjs` | **유일한 쓰기 경로.** 모든 변경은 검증되는 트랜잭션 | 밸리데이터 불합격 → 아무것도 기록되지 않음 |
| `assets/template.html` | **무상태 렌더링 엔진** | 비즈니스 측 수정 금지; 업그레이드는 `save --retemplate` |

필드 계약, revision 의미론, 상태 대수, 판정기, 템플릿 허용 목록의 공식 정의는 [`references/contract.md`](references/contract.md)를 참조하세요.

## 눈속임 방지 철칙

1. 계약은 `save`를 통해서만 기록됩니다. 대역 외 편집은 봉인 해시와 `validate --against-git`(git gate 커밋을 앵커로 하는 리플레이 감지)에 잡힙니다.
2. **파생 상태는 계산만 하고 저장하지 않습니다.** 손으로 쓴 `passed`는 밸리데이터 오류입니다.
3. 검증은 `record-run`이 **직접 실행**합니다 — 에이전트는 *명령*만 제공하고 *결과*는 절대 제공하지 않습니다. 명령은 검증 게이트에서 동결되고, 행위 의미론은 플로우 정렬 시 핑거프린트되므로 `Then`을 바꾸면 기존 증거는 자동으로 무효화됩니다.
4. 인수(acceptance)는 사용자의 발언을 그대로 인용해야 하며, 6가지 하드 전제 조건(소스 관측 배치의 최신성, 미판정 주석 제로, 그린이 아닌 core 시나리오별 waiver 등)을 통과해야 합니다.

위협 모델: 실수·게으름·환각을 방어합니다 — 악의적 에이전트는 대상이 아닙니다. 최후의 방어선은 언제나 최종 정지점에서 증거를 직접 확인하는 사람입니다.

## 워크플로우: 2개의 하드 스톱 + 플로우 단위 소프트 스톱

```
소스 수집 → 플로우 맵 작성 ─🛑 정지점①: 사용자가 플로우 목록과 리스크 등급 확인
     ↓
플로우 단위 정렬(상태 / 전이 / 시나리오 / 프로토타입)  ⏸ 플로우마다 사용자 리뷰
     ↓
구현(이 스킬 밖에서 진행)
     ↓
검증 명령 동결 → 시나리오별 record-run ─🛑 정지점②: 사용자가 증거 확인 → accept
```

산출물에는 4개의 뷰가 내장됩니다: **플로우 개관**(통합 맵 + SVG 상태 기계, 무한 팬/줌 캔버스), **프로토타입**(살아있는 폰 화면: 상태 칩, 실시간 값, 메모리 vs 영속화 데이터플로우, 이벤트 로그), **시나리오 인수**(필터 가능한 카드에서 프로토타입으로 점프), **실행 증거**. 📌 클릭 즉시 고정되는 주석 레이어가 모든 뷰에서 작동합니다.

## 빠른 시작

요구사항: Node ≥ 18, git(산출물은 git 저장소 안에 있어야 합니다).

```bash
# Claude Code 스킬로 설치 (Codex/Cursor는 .agents/skills/ 에 배치)
git clone https://github.com/wohsj110/mini-app-spec ~/.claude/skills/mini-app-spec

# 셀프 테스트: 픽스처 20건 + 인젝션/공격 32건 모두 그린이어야 함
node ~/.claude/skills/mini-app-spec/scripts/run-fixtures.mjs
node ~/.claude/skills/mini-app-spec/scripts/run-injections.mjs
```

### 명령어 요약

| 명령 | 용도 |
|---|---|
| `new` | 고정 엔진에서 빈 산출물 생성 |
| `extract` / `save [--expect-revision] [--gate 이름] [--retemplate]` | 계약 편집의 유일한 왕복 경로; `--gate`는 git 리플레이 앵커도 생성 |
| `validate [--strict] [--against-git]` | 전체 규칙 검증; 리뷰/인수 전 0 error 필수 |
| `status` | 읽기 전용 재개 브리핑 |
| `confirm-command --scenario --command` | 검증 게이트: 명령 동결 |
| `record-run --scenario` | 동결된 명령을 직접 실행하고 출력을 판정, 해시된 증거 기록 |
| `refresh-sources` | 등록된 모든 소스의 관측 배치 생성(인수 전 필수) |
| `merge-feedback --data` / `annotate --id --status` | 주석 티켓 병합 / 사용자 판정 기록 |
| `accept --verbatim "…"` | 인수 사실 기록(6가지 하드 전제를 밸리데이터가 강제) |
| `recovery --reason` | 최근 신뢰 가능한 git gate 베이스라인에서 재구축 |
| `export-md` | 휴대용 읽기 전용 Markdown 내보내기(정본은 HTML) |

## 컴패니언 스킬과 함께 쓰기(선택)

이 스킬은 단독으로도 작동하지만, 더 큰 요구사항 파이프라인에 넣으면 효과가 커집니다:

1. **먼저 탐색** — 코드베이스 탐색 스킬(`/wayfinder` 류의 내비게이터)로 요구사항이 닿는 영역을 파악.
2. **요구사항 심문** — 심문 스킬(`grill-me` / `grill-with-docs` 등)로 모호한 아이디어를 결정 기록이 남은 요구사항 문서로 단련.
3. **문서 + Figma를 이 스킬에 입력** — 문서와 Figma 프레임(Figma MCP로 취득; node-id를 추측하지 않음)을 `sources`로 등록하고 플로우 단위로 명세 구축.
4. **정렬 중** 고영향 결정이 연속되면 `grill-me`로 승격; 없으면 내장된 경향 제시형 객관식 질문으로 폴백합니다.

## 라이선스

[MIT](LICENSE)
