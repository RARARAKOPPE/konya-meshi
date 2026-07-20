# Guideline 2.1（ATTダイアログ不表示）への対応 — 2026-07-20

## 原因と修正内容（記録）

- 原因: ATT許諾要求をアプリ起動直後のuseEffectで即時実行していた。iOSはアプリが
  active状態になる前の `requestTrackingAuthorization` を**ダイアログを出さずに無視**する
  ことがあり、審査環境（iOS 26.5.2）で再現した。
- 修正: `src/engine/adsSdk.ts` — AppStateが'active'になるのを待ち、600ms置いてから
  ATTを要求するよう変更。あわせて広告SDKロードの成否とATT要求を分離し、
  ATT→SDK初期化の順序を構造的に保証した。
- ビルド: 1.0 (4) として再ビルド・再提出。

## ユーザーがやること：実機での画面収録（Appleへの提出物）

ビルド4がTestFlightに反映されたら、iPhoneで:

1. **既存の今日飯アプリを削除**（TestFlight版・dev版とも入っていれば両方）
2. **iPhoneを再起動**（ATTの許諾状態はアプリ削除後もしばらく残ることがあり、
   再起動でダイアログが確実に再表示されるようになる定番の手順）
3. 画面収録を開始（コントロールセンター → 収録ボタン。無ければ 設定 → コントロール
   センター → 「画面収録」を追加）
4. TestFlightから今日飯 1.0 (4) をインストール → **アプリを起動**
5. 起動直後に「トラッキング許可」ダイアログが出るのを収録
   （文言:「この端末での広告表示に使います。オフにしても広告自体は表示されます…」）
6. どちらかを選択 → そのまま疲労度選択 → 「今日の飯を決めて」→ 提案表示まで
   通常フローを30秒ほど収録
7. 収録停止（写真アプリに保存される）

動画をMacに送り（AirDrop等）、App Store Connectで:
- App Reviewからのメッセージに**返信**として下記文面を送り、動画を添付
  （添付できない場合は App Review Information の「添付ファイル」にアップロードして
  返信文でその旨言及）

## 返信文（コピペ用・そのまま使える）

---

Hello,

Thank you for the detailed feedback.

We identified the cause: the App Tracking Transparency request was being made
immediately at launch, before the app reached the active state, so iOS
suppressed the dialog. We have fixed this in version 1.0 (build 4) — the app
now waits until it is active before presenting the ATT request, which is shown
before the Google Mobile Ads SDK is initialized and before any tracking data
could be collected.

As requested, we have attached a screen recording captured on a physical
iPhone showing:
- a fresh install of build 4,
- the ATT permission request appearing right after launch,
- and the normal user flow that follows.

The new build (1.0 (4)) has been submitted for review. Thank you for your help.

Best regards,
Wataru Sato

---

## 補足

- 「トラッキング申告を取り下げる」選択肢もAppleは提示しているが、広告オン方針の
  ままなので申告は維持し、実装修正で対応する（この判断は2026-07-16の広告オン決定に従う）。
- 収録動画は今後の提出用に App Review Information のメモ欄/添付にも残しておくと
  次回以降の審査がスムーズ（Appleのメール内でも推奨されている）。
