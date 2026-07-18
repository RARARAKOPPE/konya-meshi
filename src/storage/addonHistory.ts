import AsyncStorage from '@react-native-async-storage/async-storage';

// 直近に選んだ小鉢/汁椀のタイトル（新しい順）。
// 小鉢24品・汁椀20品しかないため、直前の1件だけを避ける従来方式では体感的にすぐ重複する
// （5回選べば1回以上ダブる確率が4割前後）。ここに記録して抽選から外すことで「同じのばかり出る」を防ぐ。
const KEY = 'konya.addonHistory.v1';

// 保持数。プールの1/3程度に留める（多すぎると候補が枯れて結局同じ物に戻るため）。
export const RECENT_KOBACHI = 8;
export const RECENT_SOUP = 6;

export interface AddonHistory {
  kobachi: string[];
  soup: string[];
}

const EMPTY: AddonHistory = { kobachi: [], soup: [] };

export async function loadAddonHistory(): Promise<AddonHistory> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw);
    return {
      kobachi: Array.isArray(p?.kobachi) ? p.kobachi.filter((x: unknown) => typeof x === 'string') : [],
      soup: Array.isArray(p?.soup) ? p.soup.filter((x: unknown) => typeof x === 'string') : [],
    };
  } catch {
    return EMPTY;
  }
}

export async function saveAddonHistory(h: AddonHistory): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(h));
  } catch {
    /* noop */
  }
}

/** 選ばれたタイトルを先頭に積み、上限で切る（同じ物を選び直した時は重複させない）。 */
export function pushRecent(list: string[], title: string, max: number): string[] {
  return [title, ...list.filter((t) => t !== title)].slice(0, max);
}
