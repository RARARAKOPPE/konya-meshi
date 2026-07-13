import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MealHistory } from '../types';

const KEY = 'konya.history.v1';
const MAX = 90; // 直近のみ保持（肥大化防止）

export async function loadHistory(): Promise<MealHistory[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as MealHistory[];
  } catch {
    return null;
  }
}

export async function saveHistory(history: MealHistory[]): Promise<void> {
  try {
    const trimmed = history.slice(-MAX);
    await AsyncStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* noop */
  }
}
