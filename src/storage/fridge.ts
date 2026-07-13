import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Ingredient } from '../types';

const KEY = 'konya.fridge.v1';

export async function loadFridge(): Promise<Ingredient[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as Ingredient[];
  } catch {
    return null;
  }
}

export async function saveFridge(items: Ingredient[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* noop */
  }
}
