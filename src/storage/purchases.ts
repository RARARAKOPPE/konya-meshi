import AsyncStorage from '@react-native-async-storage/async-storage';

// 課金状態（ローカルキャッシュ）。本番はRevenueCatのentitlementを正とし、これはオフライン用キャッシュ。
export interface PurchaseState {
  supporter: boolean; // サポーター（¥150/月）加入中＝広告オフ＋家族共有
  tips: number; // 投げ銭の累計額（お礼表示用）
}

const KEY = 'konya.purchases.v1';

export async function loadPurchaseState(): Promise<PurchaseState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.supporter !== 'boolean') return null;
    return { supporter: p.supporter, tips: typeof p.tips === 'number' ? p.tips : 0 };
  } catch {
    return null;
  }
}

export async function savePurchaseState(s: PurchaseState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* noop */
  }
}
