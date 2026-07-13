import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Member } from '../types';

// 食べる人（妊娠中・アレルギー等の要配慮情報）は端末内のみに保存（設計書 §7 プライバシー方針）。
const KEY = 'konya.members.v1';

export async function loadMembers(): Promise<Member[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as Member[];
  } catch {
    return null;
  }
}

export async function saveMembers(members: Member[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(members));
  } catch {
    // 保存失敗は致命的でない（次回も既定/メモリで動く）
  }
}
