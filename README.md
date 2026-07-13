# 今日飯 - 限界レシピ提案

Expo + React Native + TypeScript のiOS/Android向けMVPです。疲労度、今夜食べる人、アレルギー・妊娠/授乳・子どもの年齢、冷蔵庫/まな板の食材から「今日はこれ」を決めます。

## 本番MVPの状態

- ローカルフォールバック献立は69品。
- 提案は3層フォールバック: ①オンデバイスAI（Apple Foundation Models・対応端末・無料/オフライン） → ②バックエンドAI（`EXPO_PUBLIC_DECIDE_URL` 設定時のみ・Claude等） → ③内蔵69献立。①③だけで運用コスト0で成立。各層で安全検算を再適用。
- 安全フィルタはクライアント側で再検算します。安全に出せる候補がない場合は提案しません。
- 食べる人、冷蔵庫、履歴、広告/課金キャッシュはAsyncStorageに保存します。
- 写真/レシート読み取りは `EXPO_PUBLIC_DECIDE_URL` から `/extract` へ接続します。
- 収益機能は本番デフォルトで無効です。未接続のモック課金・広告は表示しません。

## 開発環境

ワークスペース直下でCodex同梱ランタイムを読み込んでから使います。

```bash
cd /Users/wmac/AI-edit-Mac
source ./dev-env.sh
cd konya-meshi
pnpm start
```

確認コマンド:

```bash
pnpm run typecheck
pnpm run check:expo
```

## 環境変数

`.env.example` を参考に `.env` を作ります。APIキーはクライアントへ置かず、Supabase Edge Function側のSecretに入れます。

```bash
EXPO_PUBLIC_DECIDE_URL=https://YOUR-PROJECT.supabase.co/functions/v1/decide
EXPO_PUBLIC_PURCHASES_MODE=disabled
EXPO_PUBLIC_ADS_MODE=disabled
```

開発中だけ旧モックを触る場合:

```bash
EXPO_PUBLIC_PURCHASES_MODE=mock
EXPO_PUBLIC_ADS_MODE=placeholder
```

## Supabase Edge Functions

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy decide
supabase functions deploy extract
supabase functions deploy log-pick
```

`decide` のURLを `.env` の `EXPO_PUBLIC_DECIDE_URL` に設定します。`extract` と `log-pick` はクライアント側で同じベースURLから推定します。

## 開発ビルド（dev client / EAS）

オンデバイスAI（Apple Foundation Models 等のネイティブモジュール）は **Expo Go では動かない**ため、dev client + EASビルドへ移行済み。

設定済み（2026-07-12）:
- `expo-dev-client` 導入（SDK54互換 6.0.21）
- `eas.json` 作成（`development` / `development-simulator` / `preview` / `production` プロファイル）
- New Architecture 有効（`app.json` の `newArchEnabled: true`）＝オンデバイスLLM系パッケージの要件を満たす
- pnpm運用と競合していた stale な `package-lock.json` を削除（`pnpm-lock.yaml` が正）

あなたが実行する残作業（アカウント連携が必要でこちらでは不可）:
```bash
cd /Users/wmac/AI-edit-Mac && source ./dev-env.sh && cd konya-meshi
npx eas-cli login                 # 自分のExpoアカウント
npx eas-cli init                  # プロジェクトIDをapp.jsonに紐付け（初回のみ）
npx eas-cli device:create         # 実機をad-hoc登録（初回のみ）
npx eas-cli build --profile development --platform ios   # クラウドビルド（ローカルXcode不要）
# 生成されたdev buildを実機(iPhone 15 Pro以降=Apple Intelligence対応機)にインストール
pnpm start --dev-client           # dev clientへ接続
```

補足:
- **EASクラウドビルドはローカルXcode不要**（Xcodeは `expo run:ios` のローカルビルド時のみ必要）。
- **オンデバイスAIの動作確認は物理実機（iPhone 15 Pro以降）が必須**。シミュレータはNeural Engineが無くFoundation Modelsが動かない。UIだけの確認は `development-simulator` プロファイルで可。
- Apple Developer Program 登録が別途必要（実機配布・ストア提出用）。

## iOSビルド前の残り作業

- ~~Xcode本体とiOS SimulatorをMacへ入れる。~~ **EASクラウドビルドなら不要**（ローカルビルド/シミュレータ確認をする場合のみ）。
- `app.json` の `ios.bundleIdentifier` / `android.package` をApple Developer/Google Play用の正式IDへ確定する。
- ~~`assets/` の仮アイコンを正式デザインへ差し替える。~~ 完了（2026-07-11）: 緑地に白「飯」のワードマーク。`icon.png`(不透過1024) / `adaptive-icon.png`(白飯透過・背景`#3E7D5A`) / `splash.png` / `favicon.png` を差し替え済み。旧アセットは `assets/_backup_pre_iconC/` に退避。再生成は `scripts/gen-app-icon.mjs`（要 `@resvg/resvg-js` + `pngjs`、ヒラギノ角ゴW7を使用）。
- 課金を出すならRevenueCat等を接続し、`src/engine/purchases.ts` を実課金に差し替える。
- 広告を出すならAdMob等を接続し、`src/engine/ads.ts` と広告UIを実広告に差し替える。
- プライバシーポリシーURL、サポートURL、ストア説明文、スクリーンショットを用意する。

## 主な構成

```text
App.tsx                         画面遷移と主要UI
src/config.ts                   本番/開発用の機能フラグ（onDeviceMode 等）
src/engine/decide.ts            ローカル提案（内蔵69献立・第3層）
src/engine/ondevice.ts          オンデバイスAI提案（Apple Foundation Models・第1層）
src/engine/propose.ts           3層フォールバック統合（オンデバイス→API→ローカル）
src/engine/safety.ts            安全フィルタ
src/engine/classify.ts          食材名の正規化
src/engine/purchases.ts         課金の本番無効/開発モック
src/engine/ads.ts               広告の本番無効/開発プレースホルダー
src/screens/Settings.tsx        食べる人設定
src/screens/Support.tsx         応援/課金画面
src/data/fallbackRecipes.json   フォールバック献立
supabase/functions/             decide / extract / log-pick
```
