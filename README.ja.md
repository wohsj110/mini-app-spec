# Mini-App Spec

[English](README.md) | [简体中文](README.zh-CN.md) | **日本語** | [한국어](README.ko.md)

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg) ![Node >= 18](https://img.shields.io/badge/Node-%E2%89%A5%2018-blue.svg) ![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg)

🌐 **サイト：** https://wohsj110.github.io/mini-app-spec/ · **skills.sh：** https://www.skills.sh/wohsj110/mini-app-spec/mini-app-spec

複数ソースにまたがる複雑な要件（PRD / BDD / Figma / コード）を、**自己完結型の単一ファイル `mini-app-spec.html`** に変換・校正するエージェントスキルです。この*実行可能な仕様書*には、機械可読コントラクト、操作可能なプロトタイプ、状態機械キャンバス、BDD 受け入れシナリオ、注釈レビューのループ、検証可能な実行証跡が埋め込まれます。実装完了後は、同じ成果物で実装との**突合（照合）**を行います。

AI コーディングエージェント（Claude Code、Codex、Cursor など）向けに設計されており、エージェントはロックダウンされた CLI パイプラインを通じて仕様書を生成・維持します。バリデータが、エージェントのごまかしを*仕組みとして困難*にします。

## 設計原理：仕様書そのものがミニアプリである

本スキルは、Matt Rickard のエッセイ [*The Unreasonable Effectiveness of Mini Apps as Specs*](https://blog.matt-rickard.com/p/the-unreasonable-effectiveness-of-675) の思想を堅牢化した実装です。現実から乖離していく静的ドキュメントではなく、ステークホルダーがクリックして触り、注釈を付け、実装に責任を問える小さなアプリとして仕様を届けます。

その思想の上に、ドキュメントには不可能なものを追加しています：

- **機械コントラクトを唯一の真実（SSOT）に** — フロー、状態、遷移、Gherkin シナリオ、検証方法は散文ではなく、HTML 内の構造化 JSON として存在します。
- **導出ステータスは計算するのみ、保存しない** — 人間も AI も `passed` を手書きできません。シナリオの状態は証跡から導出されるか、`not-run` かのどちらかです。
- **主張ではなく証跡を** — 検証コマンドはゲートで凍結され、ツール自身が実行（`record-run`）し、出力はハッシュ化されて台帳に記録されます。
- **閉じるレビューループ** — ピン型注釈は安定 ID にアンカーされ、構造化された変更チケットとしてエクスポートでき、裁定されるまで*受け入れをブロック*します。

## 三層アーキテクチャ

```
mini-app-spec.html          ← 成果物：ダブルクリックで開く、サーバー不要
├── レンダリングエンジン      （ステートレス・バージョン管理・ビジネス非依存）
├── <script id="mini-app-contract">   ← 機械コントラクト = SSOT
├── <script id="mini-app-ledger">     ← 実行 / 証跡 / 注釈 / 受け入れ台帳
├── <script id="mini-app-stamp">      ← 封印：ブロック別ハッシュ + revision チェーン
└── <template id="ui-ST-*">           ← 宣言的・ゼロ JS のプロトタイプ画面
```

| 層 | 役割 | ルール |
|---|---|---|
| `mini-app-spec.html` | **データベース。** コントラクト + 台帳 + テンプレートを一体化 | 手書き編集は禁止 |
| `scripts/spec.mjs` | **唯一の書き込み経路。** すべての変更は検証付きトランザクション | バリデータ不合格 → 何も書き込まれない |
| `assets/template.html` | **ステートレスなレンダリングエンジン** | ビジネス側は変更禁止；更新は `save --retemplate` |

フィールドコントラクト、revision セマンティクス、状態代数、ジャッジ、テンプレート許可リストの正式な定義は [`references/contract.md`](references/contract.md) を参照してください。

## ごまかし防止の鉄則

1. コントラクトは `save` 経由でのみ書き込み可能。帯域外編集は封印ハッシュと `validate --against-git`（git gate コミットをアンカーとするリプレイ検出）が捕捉します。
2. **導出ステータスは計算するのみ、保存しない。** 手書きの `passed` はバリデータエラーになります。
3. 検証は `record-run` が**自ら実行**します — エージェントは*コマンド*のみを提供し、*結果*は決して提供しません。コマンドは検証ゲートで凍結され、振る舞いのセマンティクスはフロー整合時にフィンガープリント化されるため、`Then` を変更すると旧証跡は自動的に無効になります。
4. 受け入れにはユーザーの発言の逐語引用が必須で、6 つのハード前提条件（ソース観測バッチの鮮度、未裁定注釈ゼロ、非グリーンな core シナリオごとの waiver など）を通過する必要があります。

脅威モデル：誤操作・手抜き・ハルシネーションを防ぐ — 悪意あるエージェントは対象外。最後の防衛線は常に、最終ストップポイントで証跡を自分の目で確認する人間です。

## ワークフロー：2 つのハードストップ + フロー単位のソフトストップ

```
ソース収集 → フローマップ作成 ─🛑 停止点①：ユーザーがフロー一覧とリスク区分を確認
     ↓
フロー単位の整合（状態 / 遷移 / シナリオ / プロトタイプ）  ⏸ フローごとにユーザーレビュー
     ↓
実装（本スキルの外で実施）
     ↓
検証コマンド凍結 → シナリオごとに record-run ─🛑 停止点②：ユーザーが証跡を確認 → accept
```

成果物は 4 つのビューを内蔵：**フロー概観**（統合マップ + SVG 状態機械、無限パン/ズームキャンバス）、**プロトタイプ**（生きた端末画面：状態チップ、リアルタイム値、メモリ vs 永続化のデータフロー、イベントログ）、**シナリオ受け入れ**（フィルタ可能なカードからプロトタイプへジャンプ）、**実行証跡**。📌 クリックでアンカーする注釈レイヤーは全ビュー横断で機能します。

## クイックスタート

要件：Node ≥ 18、git（成果物は git リポジトリ内に置く必要があります）。

```bash
# skills CLI で 1 行インストール（Claude Code / Codex / Cursor を自動検出；--global でユーザー全体に）
npx skills add wohsj110/mini-app-spec

# もしくは git clone
git clone https://github.com/wohsj110/mini-app-spec ~/.claude/skills/mini-app-spec

# セルフテスト：フィクスチャ 20 件 + インジェクション/攻撃 32 件がすべてグリーンであること
node ~/.claude/skills/mini-app-spec/scripts/run-fixtures.mjs
node ~/.claude/skills/mini-app-spec/scripts/run-injections.mjs
```

### For LLM — 任意のエージェントにこのままコピペでインストール

```text
Install and verify the "mini-app-spec" agent skill:

1. Run: npx skills add wohsj110/mini-app-spec --yes
   (target a specific agent with --agent claude|codex|cursor; add --global for a user-wide install)
2. Verify the install — both self-test suites must print ALL PASS:
     node <install-dir>/scripts/run-fixtures.mjs      # 20 cases
     node <install-dir>/scripts/run-injections.mjs    # 32 cases
3. Read <install-dir>/SKILL.md before first use. Rules that matter:
   - Artifacts live at docs/mini-app-spec/<feature>/mini-app-spec.html, inside a git repository.
   - All writes go through: node <install-dir>/scripts/spec.mjs <command> …
   - Never hand-edit the artifact HTML; edit via extract → modify JSON → save.
```

### コマンド早見表

| コマンド | 用途 |
|---|---|
| `new` | 固定エンジンから空の成果物を作成 |
| `extract` / `save [--expect-revision] [--gate 名] [--retemplate]` | コントラクト編集の唯一の往復経路；`--gate` は git リプレイアンカーも作成 |
| `validate [--strict] [--against-git]` | 全ルール検証；レビュー/受け入れ前に 0 error 必須 |
| `status` | 読み取り専用の再開ブリーフィング |
| `confirm-command --scenario --command` | 検証ゲート：コマンドを凍結 |
| `record-run --scenario` | 凍結コマンドを実行し、出力を判定し、ハッシュ付き証跡を書き込み |
| `refresh-sources` | 登録済み全ソースの観測バッチを生成（受け入れ前に必須） |
| `merge-feedback --data` / `annotate --id --status` | 注釈チケットのマージ / ユーザー裁定の記録 |
| `accept --verbatim "…"` | 受け入れ事実を書き込み（6 つのハード前提をバリデータが強制） |
| `recovery --reason` | 直近の信頼できる git gate ベースラインから再構築 |
| `export-md` | ポータブルな読み取り専用 Markdown をエクスポート（正本は HTML のまま） |

## コンパニオンスキルとの併用（任意・ただし推奨）

本スキルは完全に単体で動作しますが、[mattpocock/skills](https://github.com/mattpocock/skills) の以下のオープンソーススキルと組み合わせると最も効果的です：

| 段階 | スキル | 提供するもの |
|---|---|---|
| 事前 — 探索 | [`wayfinder`](https://github.com/mattpocock/skills) | 1 セッションに収まらない大きな作業を、共有調査マップとして先に把握 |
| 事前 — 要件 | [`grill-with-docs`](https://github.com/mattpocock/skills) | 曖昧なアイデアを、すべての決定が記録された要件ドキュメントに鍛え上げる |
| 整合中 | [`grill-me`](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md) | 一度に一問（毎回推奨回答付き）の尋問形式で、影響の大きい連続的な決定を解決 |

推奨パイプライン：

```
/wayfinder で領域を探索
   → grill-with-docs：アイデアを尋問して要件ドキュメントに
      → mini-app-spec：ドキュメント + Figma フレーム（Figma MCP 経由）を sources に登録し、フロー単位で仕様を構築
         → 整合中の高影響な決定の連続は grill-me にエスカレーション
```

どれもインストールされていなくても問題ありません — スキルは組み込みの傾向付き選択式質問に優雅にフォールバックします。

## ライセンス

[MIT](LICENSE)
