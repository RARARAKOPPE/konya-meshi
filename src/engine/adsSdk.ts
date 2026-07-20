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

let initialized = false;
/**
 * ATT許諾（iOS）→ Mobile Ads SDK初期化。アプリ起動時に1回呼ぶ。
 * 失敗しても実害はない（各広告コンポーネントが個別にロード失敗を検知し「出さない」にフォールバックする）。
 */
export async function initAdsSdk(): Promise<void> {
  if (initialized) return;
  if (!adsLive) {
    loadAdsModule(); // ログ出力のためだけに通す（null確定）
    return;
  }
  initialized = true; // 二重初期化防止（失敗時も再試行しない。次回起動時に再試行される）
  // ATTはSDKロードの成否と独立して必ず先に要求する（「トラッキングあり」申告に対応する審査必須要件。
  // 万一SDKロードに失敗しても、許諾ダイアログ自体は出るようにしておく）。
  if (Platform.OS === 'ios') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const tt = require('expo-tracking-transparency') as typeof import('expo-tracking-transparency');
      const { status } = await tt.getTrackingPermissionsAsync();
      console.log(`[ads] ATT許諾の状態: ${status}`);
      if (status === 'undetermined') {
        await waitUntilActive();
        await new Promise((r) => setTimeout(r, 600));
        const r = await tt.requestTrackingPermissionsAsync();
        console.log(`[ads] ATTダイアログの結果: ${r.status}`);
      }
    } catch (e) {
      console.log(`[ads] ATT処理をスキップ: ${String(e)}`);
    }
  }
  const mod = loadAdsModule();
  if (!mod) return;
  try {
    const adapters = await mod.default().initialize();
    console.log(`[ads] Mobile Ads SDK 初期化OK（アダプタ${adapters?.length ?? 0}件）`);
  } catch (e) {
    console.log(`[ads] Mobile Ads SDK 初期化に失敗: ${String(e)}`);
  }
}
