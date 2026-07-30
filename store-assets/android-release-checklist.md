# 今日飯 Android版 リリースチェックリスト

iOS版（`release-checklist.md`）と共通する部分は流用可。ここでは **Androidだけの
差分・追加作業** に絞って書く。

---

## 0. 全体像（iOSとの違い）

| | iOS | Android |
|---|---|---|
| 開発者登録 | 済み（$99/年） | **未登録。Google Play Console $25（買い切り）が必要** |
| 審査 | 通常1〜3日 | **新規デベロッパーは「非公開テスト12人×14日間」を経ないと本番公開不可**（Googleの規定） |
| ビルド形式 | .ipa | .aab（Android App Bundle） |
| 署名鍵 | EASが自動管理 | 同じくEASが自動管理（`eas build`時に自動生成・保管） |
| 広告SDK | 実ID設定済み・live | **未設定。テストIDのまま**（下記1参照） |
| ストア掲載 | App Store Connect | Google Play Console（同じ日本語テキストを流用可） |

**一番の落とし穴**: Google Playは新規デベロッパーアカウントに対し、本番公開前に
「非公開テスト」トラックで **12人以上のテスターに14日間以上** 使わせることを義務化
している。これはApp Storeには無い工程で、accountを作ってすぐ本番公開、とはいかない。
今すぐ動くなら、この14日カウントを先に開始しておくのが最短ルート。

---

## 1. 【要対応】広告SDKがAndroidだけテストIDのまま

[src/engine/adsSdk.ts:34-48](../src/engine/adsSdk.ts) を見ると、実装コメントに既にこう書かれている:

> Androidは未登録のためGoogle公式テストIDにフォールバックする
> （app.jsonのandroidAppId自体もGoogle公式テスト用App IDのプレースホルダー）

つまり **今のままAndroidビルドを作っても、広告はGoogleのテスト広告（実際に表示される
見本広告）のまま**。iOSでやった「空広告→承認待ち」とは違い、Androidは実IDを入れない
限りテスト広告がずっと表示され続ける点に注意（Play審査には通るが、収益は発生しない）。

**実IDに差し替える手順**:
1. AdMobダッシュボードで「今日飯」アプリを**Android用に新規追加**（iOS用アプリとは別物。
   プラットフォームごとに分かれる）
2. 発行される `androidAppId`（`ca-app-pub-xxxx~yyyy`形式）を [app.json](../app.json) の
   `react-native-google-mobile-ads` プラグイン設定の `androidAppId` に入れる
3. ネイティブ広告・インタースティシャル・バナーの3ユニットを作成し、`.env` に追加:
   ```
   EXPO_PUBLIC_ADMOB_NATIVE_UNIT_ID_ANDROID=...
   EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT_ID_ANDROID=...
   EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID_ANDROID=...
   ```
4. `src/engine/adsSdk.ts` の3関数（`nativeAdUnitId`/`interstitialAdUnitId`/`bannerAdUnitId`）に
   Android分岐を追加（今は `Platform.OS === 'ios'` のときしか`.env`を見ていない）

急がないなら、**v1はテスト広告のまま出して、AdMob側の準備ができたv1.1で差し替え**でも
Play審査は通る（テスト広告そのものは規約違反ではない。ただしローンチ後ずっとテスト広告
のままだと収益ゼロなので、対応時期は要検討）。

## 2. Google Play Console アカウント作成【ユーザー作業・要$25】

- https://play.google.com/console/ で新規登録（個人 or 組織を選択、本人確認書類が必要な場合あり）
- $25の登録料（買い切り、一度きり）→ **決済はユーザー自身で行うこと**（Claudeは代行不可）
- 本人確認には数日かかることがあるので、公開を急ぐなら最優先で着手

## 3. アプリのビルド

Android用のビルドコマンドはiOSと並行してこのMacで実行可能:
```bash
source /Users/wmac/AI-edit-Mac/dev-env.sh
export EXPO_HOME="$HOME/.expo"
cd /Users/wmac/AI-edit-Mac/konya-meshi
pnpm dlx eas-cli@latest build --platform android --profile production
```
署名鍵はEASが初回に自動生成・管理してくれる（iOSの証明書と同様、対話で聞かれたら
デフォルトで進めてOK）。`scripts/release.sh` はiOS専用に書いたので、Android分は
上記を直接実行するか、スクリプトに `--platform` 引数を足して汎用化してもよい
（希望があれば対応する）。

## 4. Play Console 側の入力（iOSと共通/流用できるもの）

| 項目 | 状態 |
|---|---|
| アプリ名・説明文・キーワード | `store-listing-draft.md` の日本語テキストをほぼそのまま流用可 |
| プライバシーポリシーURL | 同じ: `https://rararakoppe.github.io/konya-meshi/privacy-policy.html` |
| 問い合わせ先 | 同じ: sw.work.dev@gmail.com |
| カテゴリ | フード・ドリンク |

## 5. Play Console 側の入力（Android特有・新規に必要）

- **フィーチャーグラフィック**（1024×500、必須）— iOS用素材には無いバナー画像。新規作成が必要
- **スクリーンショット**（携帯電話用: 最低2枚、推奨16:9か9:16、iOSの1284×2778とは比率制限が別）
  → iOSの5枚をそのまま流用はできない可能性が高い。専用にリサイズ/再生成が必要
- **コンテンツのレーティング**（IARCアンケート）— Apple の4+とは別の質問票。暴力・性的表現
  などApp Storeと似た質問だが、Google独自のIARC基準で再回答が必要
- **データセーフティ**（Play版のプライバシー申告）— App Store版の申告内容
  （デバイスID・トラッキングあり、使用状況データ、健康情報は申告不要）を
  Play Consoleのフォーマットで入力し直す。項目名は違うが判断基準は同じでよい
- **広告の宣言**（「このアプリは広告を含みますか」→ **はい**）
- **対象年齢/ターゲット層**の申告（ファミリー向けポリシーの対象になるか等）

## 6. 非公開テスト（新規アカウント必須プロセス)

- Play Console → テスト → 「非公開テスト」トラックを作成
- テスター12人以上をメールリストで招待し、**実際にインストールして使ってもらう**必要がある
  （招待するだけでなく、参加を承諾しアプリを開いた実績が必要)
- この状態を**14日間継続**すると、本番トラックへの昇格申請が可能になる
- 家族・友人にテスター参加をお願いするのが現実的。人数集めが一番のボトルネックになりやすい

---

## 推奨する着手順

1. **Google Play Consoleのアカウント登録を今すぐ始める**（本人確認で数日かかりうるため、
   一番のボトルネックを先に解消）
2. アカウントが有効になったら、非公開テストトラックを作って**14日カウントを開始**
   （このときはテスト広告のままでOK。中身は変えずに先にテスターを走らせる）
3. 14日間の間にAndroid用のAdMob設定・スクショ・フィーチャーグラフィック・
   データセーフティ申告を並行して仕上げる
4. 14日経過後、テスターの実績を確認して本番トラックへ昇格申請
