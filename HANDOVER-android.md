# 引き継ぎメモ：Android版リリース（メイン機で続行するため）

このファイルは、**Mac mini以外のメイン機**でAndroid版の作業を続けるための引き継ぎ。
新しいClaude Codeセッションはまずこれと `store-assets/android-release-checklist.md` を読めば状況を把握できる。

## いまどこまで進んでいるか（2026-07-17時点）

- **iOS版 v1.0.0 (build 3)**: App Store審査に**提出済み・審査待ち**。iPhone専用（`supportsTablet: false`）。
  広告オン（実ID・live）、プライバシー申告「トラッキングあり」で提出。
- **Android版**: 未着手。このプロジェクトは iOS/Android 共通の Expo(SDK 54) アプリなので、
  同じコードベースからAndroidビルドを出せる。

## メイン機で最初にやる環境セットアップ（Mac固有部分は使わない）

このMacの `dev-env.sh` はMac専用のPATHシムなので**メイン機では使わない**。代わりに:

1. Node（18以上）と pnpm をインストール
2. プロジェクト一式をこのマシンに置く（下の「転送」参照）
3. `pnpm install`
4. `pnpm dlx eas-cli@latest login` → **wataru_st / 1ri.alpha@gmail.com** でログイン
   （iOSと同じEASアカウント。Androidの署名鍵もこのアカウントでEASが自動管理する）

## 転送するもの

- **プロジェクトフォルダ全体**（konya-meshi/）。`.env` はgit追跡下にあり中身はAdMobのID等
  （どのみちアプリバイナリに載る半公開情報）なので、フォルダごと移せば設定も一緒に移る。
- Mac固有: `scripts/release.sh`（iOS submit用）と `dev-env.sh` はメイン機では無視してよい。
- 転送前に、このMacで未コミットの作業を1コミットにまとめておくと綺麗なスナップショットになる
  （現状 Initial commit の上に大量の未コミット変更がある）。

## Android版で実際にやる作業（詳細は android-release-checklist.md）

順番の推奨:
1. **Google Play Consoleアカウント登録**（$25買い切り＋本人確認、数日かかりうる）← 最優先
2. アカウント有効化後、**非公開テストトラック作成 → テスター12人招待 → 14日カウント開始**
   （この時点ではテスト広告のままでOK。中身を固める前に時計を回し始めるのが最短）
3. 14日待ちの間に並行して:
   - **コード**: `src/engine/adsSdk.ts` の3関数にAndroid分岐追加（今は`Platform.OS==='ios'`のみ）＋
     `app.json` の `androidAppId` を実IDに差し替え（現状Google公式テストIDのプレースホルダー）
   - **AdMob**: ダッシュボードでAndroid用アプリを新規追加、native/interstitial/bannerの3ユニット発行、
     `.env` に `EXPO_PUBLIC_ADMOB_*_ANDROID` を追加
   - **素材**: Android用スクショ（携帯用・比率制限がiOSと別）＋フィーチャーグラフィック1024×500（新規）
   - **申告**: データセーフティ（=Play版プライバシー申告）、IARCレーティング、広告あり宣言
4. 本番ビルド:
   ```
   pnpm dlx eas-cli@latest build --platform android --profile production
   ```
   → 生成される .aab を Play Console にアップロード（`eas submit --platform android` でも可、
     初回はGoogle Service Accountキーの設定が必要）
5. 14日経過＋テスター実績を満たしたら本番トラックへ昇格申請

## 対応端末（決定済み）

- Android 7.0（API 24）以上 = 現役端末の約98〜99%。Expo SDK 54のデフォルト。狭める予定なし。

## 注意点

- iOSと違いAndroidは実IDを入れないとテスト広告が出続ける（審査は通るが収益ゼロ）。
- Android版のバージョン管理は `app.json` の `android.versionCode`（現在1）。iOSの`buildNumber`とは別物。
- このアプリはオンデバイスAI非対応端末では内蔵90品で動く設計なので低スペック機でも致命傷になりにくい。
  ただしAndroidは機種多様なので、非公開テストで複数メーカー/価格帯の端末に触ってもらえると安心。
