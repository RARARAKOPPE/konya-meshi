// 課金（サブスク=サポーター / 投げ銭=コーヒー）。
// 本番デフォルトでは無効。開発中だけ EXPO_PUBLIC_PURCHASES_MODE=mock でローカルモックを有効にする。
// App Store / Google Play に出す時は RevenueCat 等の実課金に差し替える。

import { loadPurchaseState, savePurchaseState, type PurchaseState } from '../storage/purchases';
import { purchasesEnabled } from '../config';

// ストアに登録する商品ID（App Store Connect / Google Play で同名で作成）
export const PRODUCTS = {
  supporter: 'konya_supporter_monthly', // ¥150/月 自動更新サブスク
  tip150: 'konya_tip_150',
  tip300: 'konya_tip_300',
  tip600: 'konya_tip_600',
} as const;

export type TipTier = 150 | 300 | 600;
export interface Entitlement {
  supporter: boolean;
}

let state: PurchaseState = { supporter: false, tips: 0 };

export function purchasesAvailable(): boolean {
  return purchasesEnabled;
}

export async function initPurchases(): Promise<Entitlement> {
  if (!purchasesEnabled) {
    state = { supporter: false, tips: 0 };
    return { supporter: false };
  }
  const s = await loadPurchaseState();
  if (s) state = s;
  return { supporter: state.supporter };
}

export function getEntitlement(): Entitlement {
  return { supporter: state.supporter };
}

export async function purchaseSupporter(): Promise<Entitlement> {
  if (!purchasesEnabled) throw new Error('Purchases are not configured');
  state = { ...state, supporter: true };
  await savePurchaseState(state);
  return { supporter: true };
  // RevenueCat:
  //   const offerings = await Purchases.getOfferings();
  //   await Purchases.purchasePackage(offerings.current.availablePackages.find(...));
  //   state.supporter = (info.entitlements.active['supporter'] != null);
}

export async function purchaseTip(tier: TipTier): Promise<void> {
  if (!purchasesEnabled) throw new Error('Purchases are not configured');
  state = { ...state, tips: state.tips + tier };
  await savePurchaseState(state);
  return;
  // RevenueCat（消費型）: await Purchases.purchaseProduct(PRODUCTS[`tip${tier}`], null, 'INAPP');
}

export async function restorePurchases(): Promise<Entitlement> {
  if (!purchasesEnabled) return { supporter: false };
  const s = await loadPurchaseState();
  if (s) state = s;
  return { supporter: state.supporter };
  // RevenueCat: const info = await Purchases.restorePurchases();
  //   state.supporter = (info.entitlements.active['supporter'] != null); await savePurchaseState(state);
}

// ── 本番(RevenueCat)への差し替え手順 ─────────────────────────────
// 1. EAS開発ビルドを作る（Expo Goでは不可）
// 2. npx expo install react-native-purchases
// 3. このファイル冒頭で import Purchases from 'react-native-purchases'
// 4. purchasesAvailable/init/purchase/restore を実課金に差し替える
// 5. RevenueCatダッシュボードで entitlement 'supporter' と商品(PRODUCTS)を作成、APIキーを設定
//    （iOS/Androidのストア側にも同じ商品IDで in-app product を登録）
// ───────────────────────────────────────────────
