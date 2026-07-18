# 今日飯 - 限界レシピ提案

Expo + React Native + TypeScript のiOS/Android向けMVPです。疲労度、今夜食べる人、アレルギー・妊娠/授乳・子どもの年齢、冷蔵庫/まな板の食材から「今日はこれ」を決めます。

## 本番MVPの状態

- 収録データ: **メイン69品 / 小鉢50品 / 汁椀40品**、食材辞書202種。イラストは **メイン35点・小鉢/汁椀39点・食材66点**。
- メイン提案は3層フォールバック: ①オンデバイスAI（Apple Foundation Models・対応端末・無料/オフライン） → ②バックエンドAI（`EXPO_PUBLIC_DECIDE_URL` 設定時のみ・Claude等） → ③内蔵69献立。①③だけで運用コスト0で成立。各層で安全検算を再適用。
- 小鉢/汁椀は**ローカル抽選のみ**。オンデバイスAIを試したが、実機で毎回同じ料理（冷奴）しか返さず `avoidTitles` も無視したため撤去した（2026-07-15）。代わりに**直近に選んだ物を抽選から外す**方式にしてある（`src/storage/addonHistory.ts`・小鉢8件/汁椀6件）。
- 安全フィルタはクライアント側で再検算します。安全に出せる候補がない場合は提案しません。
- 食べる人、冷蔵庫、履歴、広告/課金キャッシュはAsyncStorageに保存します。
- 写真/レシート読み取りは `EXPO_PUBLIC_DECIDE_URL` から `/extract` へ接続します。**初回リリースでは見送り**（URL未設定＝`extractAvailable()`がfalse＝UIごと非表示）。
- 課金は本番デフォルトで無効。無効時は設定画面の導線ごと隠れる（買えない商品の価格を見せないため）。
- 広告は `EXPO_PUBLIC_ADS_MODE=live` でAdMob実広告。詳細は「広告」節。

## 安全設計で踏んではいけない地雷

アレルギーは命に関わるため、以下は必ず守ること。

- **`recipeBlockedBy`（src/engine/safety.ts）は `usedIngredients` / `missingIngredients` の食材名しか見ない。工程本文(`steps`)は読まない。**
  醤油・めんつゆ・ごま油などの常備調味料は工程にしか出てこないため、そのアレルゲンは `select.allergens` タグでしか表現できない。
  タグが漏れると、アレルギーのある利用者にそのまま提供される（実際に既存レシピ20件で漏れが見つかり2026-07-15に修正した）。
- レシピを追加・編集したら必ず **`pnpm run check:recipes`** を通すこと。上記の申告漏れ・辞書外の食材名・主食の混入・工程数/時間の逸脱・spicy等のフラグ不整合を機械検出する。
- 呼び出し側は `recipeBlockedBy` の `.blocked` しか見ていない（`needsConfirm` は未使用）。未知の食材は素通りするので、**食材は必ず辞書に登録**してから使う。

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
pnpm run check:recipes   # レシピの安全・整合チェック（アレルゲン申告漏れ等）
```

## 環境変数

`.env.example` を参考に `.env` を作ります。APIキーはクライアントへ置かず、Supabase Edge Function側のSecretに入れます。

```bash
# 未設定なら写真/レシート読み取りとバックエンドAI(第2層)が無効になる（UIごと非表示）
EXPO_PUBLIC_DECIDE_URL=https://YOUR-PROJECT.supabase.co/functions/v1/decide
EXPO_PUBLIC_PURCHASES_MODE=disabled
# disabled=出さない / placeholder=旧モックUI / live=AdMob実広告
EXPO_PUBLIC_ADS_MODE=disabled
# live時のみ使用。未設定ならGoogleのテストID(TestIds)にフォールバックする
EXPO_PUBLIC_ADMOB_NATIVE_UNIT_ID_IOS=ca-app-pub-XXXX/YYYY
EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT_ID_IOS=ca-app-pub-XXXX/ZZZZ
EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID_IOS=ca-app-pub-XXXX/WWWW
```

**`EXPO_PUBLIC_*` はバンドル時に埋め込まれるので、変更したらMetroの再起動（`-c` 推奨）が必要。**

開発中だけ旧モックを触る場合:

```bash
EXPO_PUBLIC_PURCHASES_MODE=mock
EXPO_PUBLIC_ADS_MODE=placeholder
```

## 広告（AdMob）

`react-native-google-mobile-ads` を使用。**3系統あり、出す条件がそれぞれ違う。**

| 種類 | 場所 | 出さない条件 | 実装 |
|---|---|---|---|
| **常設バナー** | 疲労度選択・決めて・履歴 | サポーター／疲労度選択後の限界モード | `LiveBannerAd` |
| **ネイティブ広告** | 「これにする」後の調理画面 | サポーター／限界／1日上限超過（`canShowAd`） | `LiveNativeAdSlot` |
| **全画面広告** | 「ごちそうさま」後の遷移 | **サポーターのみ** | `LiveInterstitialAd` |

設計の芯:
- **意思決定フロー（疲労度→決めて→提案→これにする）の最中に割り込む広告は出さない。** 疲れた人を待たせないのがこのアプリの価値。バナーは静的表示なので可、ただし後述の余白は必須。
- **限界モードには広告を出さない。** ただし「ごちそうさま」後だけは例外（料理が終わった後の遷移であり、意思決定を妨げないため）。
- **全画面広告とネイティブ広告は1日上限を共有しない。** 共有すると普通モード（上限1回）でネイティブが1回を使い切り、全画面広告が永久に出なくなる。

**AdMobのポリシー由来の制約（勝手に詰めないこと）:**
- 広告は**ボタンの近くに置いてはいけない**（誤タップ誘発＝アカウント停止のリスク）。`styles.bannerSpacer` の余白はそのための隔離。
- App ID（`app.json` の `iosAppId`）は**ネイティブに焼き込まれる**ため、変更したら**EAS再ビルドが必須**。広告ユニットID（`.env`）はMetro再起動だけでよい。

**現状の未完了:**
- AdMobアカウントが**未承認**（`no-fill: Account not approved yet`）。管理画面の「お支払い」に住所・氏名を登録しないと審査が始まらない。承認までは実IDでも広告が返らないので、`.env` のユニットIDをコメントアウトしてテストID動作で確認する。
- Androidは未登録。`app.json` の `androidAppId` はGoogleのテスト用App IDで仮置き中。Android配信前に要差し替え。

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

ビルド手順（動作確認済み・2026-07-16）:
```bash
cd /Users/wmac/AI-edit-Mac && source ./dev-env.sh && cd konya-meshi
# 【重要】dev-env.sh が EXPO_HOME を .expo-home に差し替えるが、ログイン情報は ~/.expo にある。
# 上書きしないと「未ログイン」になるため、EAS を叩く時だけ戻す。
export EXPO_HOME="$HOME/.expo"
pnpm dlx eas-cli@latest build --profile development --platform ios --non-interactive
```

補足:
- **`npx` はこの環境に無い。** `pnpm dlx eas-cli@latest` を使う（`eas-cli` はローカル依存にも入っていない）。
- iOSの証明書はExpo側に保存済みなので、**Apple IDの入力は不要**（`✔ Using remote iOS credentials` と出る）。
- **EASクラウドビルドはローカルXcode不要**（Xcodeは `expo run:ios` のローカルビルド時のみ必要）。このMacにXcodeは入っていない。
- **オンデバイスAIの動作確認は物理実機（iPhone 15 Pro以降）が必須**。シミュレータはNeural Engineが無くFoundation Modelsが動かない。
- **再ビルドが必要なのはネイティブが変わった時だけ**（`app.json` のプラグイン設定＝AdMob App ID など、パッケージ追加）。JS・画像・レシピの変更はMetroのリロードで足りる。
- ビルドの中断は `Ctrl+C` では止まらない（待機をやめるだけ）。`pnpm dlx eas-cli@latest build:cancel <buildId>` を使う。

## iOSビルド前の残り作業

- ~~Xcode本体とiOS SimulatorをMacへ入れる。~~ **EASクラウドビルドなら不要**（ローカルビルド/シミュレータ確認をする場合のみ）。
- `app.json` の `ios.bundleIdentifier` / `android.package` をApple Developer/Google Play用の正式IDへ確定する。
- ~~`assets/` の仮アイコンを正式デザインへ差し替える。~~ 完了（2026-07-11）: 緑地に白「飯」のワードマーク。`icon.png`(不透過1024) / `adaptive-icon.png`(白飯透過・背景`#3E7D5A`) / `splash.png` / `favicon.png` を差し替え済み。旧アセットは `assets/_backup_pre_iconC/` に退避。再生成は `scripts/gen-app-icon.mjs`（要 `@resvg/resvg-js` + `pngjs`、ヒラギノ角ゴW7を使用）。
- ~~広告を出すならAdMob等を接続する。~~ 完了（2026-07-15）: 「広告」節を参照。**残: AdMobアカウントの承認（お支払い情報の登録）**。
- ~~プライバシーポリシーURL~~ 完了（2026-07-15）: `https://rararakoppe.hatenablog.com/entry/2026/07/15/005949`（`src/screens/About.tsx` に定数あり）。
- **App Store Connectのプライバシー申告**（AdMob導入により「識別子」「トラッキング」の申告が必要）。
- **ストア説明文・スクリーンショット**を用意する。スクショはApp Store規定サイズ（6.9型 1290×2796 等）が必要で、実機のスクショ（1206×2622）はそのままでは通らない。
- 課金を出すならRevenueCat等を接続し、`src/engine/purchases.ts` を実課金に差し替える。**初回リリースでは見送り**（審査が一段厳しくなるため、広告のみで先に出す方針）。App Store Connect側の商品登録（`konya_tip_150` 等）も必要。

## 既知の負債・注意点

- **`src/engine/mealImage.ts` / `addonImage.ts` の TITLE_RULES は順序が命。** 上から先勝ちなので、具体的な料理を汎用ルールより前に置くこと。過去に「さわらの照り焼き」が鶏の照り焼きに、「豆腐のキムチ和え（小鉢）」が汁椀のスープ画像に化けた。変更したら全レシピに対してシミュレーションして誤爆を確認すること。
- **`categoryFallback`（mealImage.ts）は最後の砦なので緩くしない。** 以前「肉が入っていれば炒め物」に落としていたため、クリーム煮やレンジ蒸しにまで炒め物の絵が付いていた。料理名から分かる物は必ず TITLE_RULES で拾う。
- **イラストが無い食材はSVGアイコンにフォールバックする**（`src/components/FoodIcon.tsx`）。水彩イラストの中でSVGは明らかに浮くので、冷蔵庫に入る定番食材はイラストを用意したい。辞書202種に対しイラストは66種で、**レシピで使われるのに未対応の食材が約40種**残っている。
- **Reactのコンポーネントを描画関数の中で定義しない。** `FridgeVisual.tsx` でやってしまい、レンダーのたびにツリーが再マウントされて全画像が読み込み直され、タップのたびにアイコンが消えていた。
- **選択時に `borderWidth` を足すとレイアウトが動く。** 枠は最初から透明で確保して色だけ変えること（冷蔵庫が膨らむ不具合の原因だった）。
- **開発中は画像もMetroから配信される。** WiFiを切ると画像だけ表示されなくなる（バグではない）。リリースビルドでは同梱されるので起きない。

## 主な構成

```text
App.tsx                         画面遷移と主要UI（疲労度→決めて→提案→これにする→ごちそうさま）
src/config.ts                   機能フラグ（onDeviceMode / adsMode / purchasesMode）

src/engine/decide.ts            ローカル提案（内蔵69献立・第3層）
src/engine/ondevice.ts          オンデバイスAI提案（Apple Foundation Models・第1層）
src/engine/propose.ts           3層フォールバック統合（オンデバイス→API→ローカル）
src/engine/safety.ts            安全フィルタ（recipeBlockedBy）※工程本文は読まない
src/engine/classify.ts          食材名の正規化（表記ゆれ→canonical）
src/engine/kobachi.ts           小鉢の抽選（直近履歴を除外）
src/engine/soup.ts              汁椀の抽選（同上）
src/engine/mealImage.ts         メイン料理のイラスト割り当て（TITLE_RULES は順序が命）
src/engine/addonImage.ts        小鉢/汁椀のイラスト割り当て（tagsで小鉢用/汁椀用を分岐）
src/engine/ingredientImage.ts   食材アイコンの割り当て
src/engine/ads.ts               広告の表示可否（3系統の判定の違いをコメントに明記）
src/engine/adsSdk.ts            AdMob SDK初期化・ATT許諾・広告ユニットID解決（liveのみ）
src/engine/purchases.ts         課金の本番無効/開発モック

src/components/Ads.tsx          AdMob Banner/Native/Interstitial の描画（liveのみ）
src/components/FoodIcon.tsx     食材アイコン（イラスト優先・無ければSVGへフォールバック）

src/screens/About.tsx           このアプリについて（免責・プライバシーポリシー・問い合わせ）
src/screens/FridgeVisual.tsx    冷蔵庫の画（このアプリ最大の見せ場）
src/screens/Settings.tsx        食べる人設定
src/screens/Support.tsx         応援/課金画面（課金無効時は導線ごと非表示）

src/storage/addonHistory.ts     直近に選んだ小鉢/汁椀（重複回避用）
src/data/ingredientDict.json    食材辞書202種（canonical/別名/カテゴリ/アレルゲン）
src/data/fallbackRecipes.json   メイン69品
src/data/kobachi.json           小鉢50品
src/data/soup.json              汁椀40品
scripts/check-recipes.mjs       レシピの安全・整合チェック（pnpm run check:recipes）
supabase/functions/             decide / extract / log-pick（初回リリースでは未使用）
```
