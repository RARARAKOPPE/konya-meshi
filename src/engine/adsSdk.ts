// AdMob実広告（react-native-google-mobile-ads）。ネイティブモジュール追加のため、
// 次のEASビルド（開発ビルド再生成）が反映されるまでは未リンクの可能性がある。
// ondevice.ts と同じ方針（遅延require + try/catch）でガードし、失敗時は
// 呼び出し側（src/components/Ads.tsx）が「広告を出さない」にフォールバックする。
import { AppState, Platform } from 'react-native';
import { adsLive } from '../config';

export type GoogleMobileAdsModule = typeof import('react-native-google-mobile-ads');

let cachedMod: GoogleMobileAdsModule | null | undefined; // undefined=未試行, null=不可
export function loadAdsModule(): GoogleMobileAdsModule | null {
  if (!adsLive) {
    if (cachedMod === undefined) {
      cachedMod = null;
      console.log(`[ads] 無効: adsLive=false (EXPO_PUBLIC_ADS_MODE=${process.env.EXPO_PUBLIC_ADS_MODE ?? '未設定'})`);
    }
    return null;
  }
  if (cachedMod !== undefined) return cachedMod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedMod = require('react-native-google-mobile-ads') as GoogleMobileAdsModule;
    console.log('[ads] SDKモジュール読み込みOK');
  } catch (e) {
    cachedMod = null;
    console.log(`[ads] SDKモジュール読み込み失敗（dev buildにネイティブモジュールが無い？）: ${String(e)}`);
  }
  return cachedMod;
}

// 実際の広告ユニットID。iOSは.envの実ID（AdMobダッシュボードで発行済み）を使用。
// Androidは未登録のためGoogle公式テストIDにフォールバックする
// （app.jsonのandroidAppId自体もGoogle公式テスト用App IDのプレースホルダー。Android配信前に要差し替え）。
export function nativeAdUnitId(mod: GoogleMobileAdsModule): string {
  const fromEnv = process.env.EXPO_PUBLIC_ADMOB_NATIVE_UNIT_ID_IOS;
  if (Platform.OS === 'ios' && fromEnv) return fromEnv;
  return mod.TestIds.NATIVE;
}
export function interstitialAdUnitId(mod: GoogleMobileAdsModule): string {
  const fromEnv = process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT_ID_IOS;
  if (Platform.OS === 'ios' && fromEnv) return fromEnv;
  return mod.TestIds.INTERSTITIAL;
}
export function bannerAdUnitId(mod: GoogleMobileAdsModule): string {
  const fromEnv = process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID_IOS;
  if (Platform.OS === 'ios' && fromEnv) return fromEnv;
  return mod.TestIds.BANNER;
}

// iOSはアプリが完全にactiveになる前にATTを要求するとダイアログが表示されないまま
// 失敗する（起動直後のuseEffectはactive遷移前に走りうる。審査でも再現：Guideline 2.1指摘 2026-07-20）。
// active遷移を待ち、さらに遷移直後の取りこぼし対策で少し置いてから要求する。
function waitUntilActive(): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve) => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        sub.remove();
        resolve();
      }
    });
  });
}

// ---- 同意ゲート ----------------------------------------------------------
// UMP（GDPR同意）の判定が済むまでは広告をリクエストしない。判定前にリクエストすると
// EEA等でGoogleのポリシー違反になるため、既定は「閉」。initAdsSdk() が必ず開閉を確定させる。
// UMPの処理自体が失敗した場合は「開」に倒す（日本のみ配信なら同意は不要で、従来動作を維持したい）。
let gateOpen = false;
let privacyOptionsRequired = false;
const stateListeners = new Set<() => void>();

/** 広告をリクエストしてよいか（UMPの同意判定が済み、かつ同意が得られている）。 */
export function adsGateOpen(): boolean {
  return gateOpen;
}
/** 「プライバシー設定」の再表示メニューを出す義務があるか（EEA等でUMPが要求する）。 */
export function adsPrivacyOptionsRequired(): boolean {
  return privacyOptionsRequired;
}
/** ゲート状態の変化を購読する。戻り値を呼ぶと解除。 */
export function subscribeAdsState(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}
function setAdsState(next: { gateOpen: boolean; privacyOptionsRequired: boolean }): void {
  gateOpen = next.gateOpen;
  privacyOptionsRequired = next.privacyOptionsRequired;
  console.log(`[ads] 同意ゲート: ${gateOpen ? '開（リクエスト可）' : '閉（広告を出さない）'} / プライバシー設定の掲示義務=${privacyOptionsRequired}`);
  // 値が変わっていなくても必ず通知する（同意拒否でゲートが閉のままでも、
  // 「プライバシー設定」ボタンの表示は更新しなければならない）。
  stateListeners.forEach((l) => l());
}

/**
 * UMP（User Messaging Platform）でGDPR同意を取得する。戻り値は「広告をリクエストしてよいか」。
 * - 日本など対象外の地域では canRequestAds=true が即返り、UIは何も出ない
 * - AdMob管理画面に同意メッセージが未設定なら isConsentFormAvailable=false のまま何も出ない（無害）
 * 失敗時は従来動作を維持するため true を返す。
 */
async function gatherUmpConsent(mod: GoogleMobileAdsModule): Promise<boolean> {
  try {
    const info = await mod.AdsConsent.gatherConsent();
    console.log(`[ads] UMP同意: status=${info.status} / canRequestAds=${info.canRequestAds} / フォーム有=${info.isConsentFormAvailable}`);
    // enumを静的importするとモジュール未リンク時に落ちるため文字列で比較する。
    privacyOptionsRequired = String(info.privacyOptionsRequirementStatus) === 'REQUIRED';
    return info.canRequestAds;
  } catch (e) {
    console.log(`[ads] UMP同意の取得に失敗（従来どおり広告は出す）: ${String(e)}`);
    return true;
  }
}

/**
 * 同意内容を後から変更するフォームを表示する（About画面の「広告のプライバシー設定」から呼ぶ）。
 * 表示できたら true。EEA等で同意を撤回/変更された場合はゲートを再評価する。
 */
export async function showAdsPrivacyOptionsForm(): Promise<boolean> {
  const mod = loadAdsModule();
  if (!mod) return false;
  try {
    const info = await mod.AdsConsent.showPrivacyOptionsForm();
    console.log(`[ads] プライバシー設定フォームを閉じた: canRequestAds=${info.canRequestAds}`);
    setAdsState({
      gateOpen: info.canRequestAds,
      privacyOptionsRequired: String(info.privacyOptionsRequirementStatus) === 'REQUIRED',
    });
    return true;
  } catch (e) {
    console.log(`[ads] プライバシー設定フォームの表示に失敗: ${String(e)}`);
    return false;
  }
}

let initialized = false;
/**
 * UMP同意（GDPR）→ ATT許諾（iOS）→ Mobile Ads SDK初期化。アプリ起動時に1回呼ぶ。
 * 失敗しても実害はない（各広告コンポーネントが個別にロード失敗を検知し「出さない」にフォールバックする）。
 */
export async function initAdsSdk(): Promise<void> {
  if (initialized) return;
  if (!adsLive) {
    loadAdsModule(); // ログ出力のためだけに通す（null確定）
    return;
  }
  initialized = true; // 二重初期化防止（失敗時も再試行しない。次回起動時に再試行される）

  // ATTダイアログもUMPの同意フォームも、アプリが完全にactiveになる前に要求すると
  // 表示されないまま失敗する（起動直後のuseEffectはactive遷移前に走りうる。
  // 審査でも再現：Guideline 2.1指摘 2026-07-20）。両方の前で待つ。
  await waitUntilActive();
  await new Promise((r) => setTimeout(r, 600));

  const mod = loadAdsModule();

  // ① UMP → ② ATT → ③ SDK初期化 の順（Google推奨）。UMPの同意フォームとATTダイアログが
  // 同時に出て取りこぼすのを避けるため、UMPを待ってからATTへ進む。
  const canRequestAds = mod ? await gatherUmpConsent(mod) : true;

  // ATTはSDKロードやUMPの成否と独立して必ず要求する（「トラッキングあり」申告に対応する審査必須要件。
  // 万一SDKロードに失敗しても、許諾ダイアログ自体は出るようにしておく）。
  if (Platform.OS === 'ios') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const tt = require('expo-tracking-transparency') as typeof import('expo-tracking-transparency');
      const { status } = await tt.getTrackingPermissionsAsync();
      console.log(`[ads] ATT許諾の状態: ${status}`);
      if (status === 'undetermined') {
        const r = await tt.requestTrackingPermissionsAsync();
        console.log(`[ads] ATTダイアログの結果: ${r.status}`);
      }
    } catch (e) {
      console.log(`[ads] ATT処理をスキップ: ${String(e)}`);
    }
  }

  setAdsState({ gateOpen: canRequestAds, privacyOptionsRequired });
  if (!mod) return;
  if (!canRequestAds) {
    console.log('[ads] 同意が得られていないため、SDK初期化と広告リクエストを行わない');
    return;
  }
  try {
    const adapters = await mod.default().initialize();
    console.log(`[ads] Mobile Ads SDK 初期化OK（アダプタ${adapters?.length ?? 0}件）`);
  } catch (e) {
    console.log(`[ads] Mobile Ads SDK 初期化に失敗: ${String(e)}`);
  }
}
