import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AdState {
  date: string; // dinnerDate（翌朝5時境界）。日が変わったら count をリセット
  count: number;
}

const KEY = 'konya.ads.v1';

export async function loadAdState(): Promise<AdState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.date !== 'string' || typeof parsed?.count !== 'number') return null;
    return parsed as AdState;
  } catch {
    return null;
  }
}

export async function saveAdState(s: AdState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* noop */
  }
}
