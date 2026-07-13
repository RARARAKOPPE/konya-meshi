// 人気レシピ集計用の「匿名」イベントログ。
// 送るのは：選ばれたレシピ名・id・source(ai/fallback)・疲労度・カテゴリ・端末の匿名ID のみ。
// 健康情報（アレルギー/妊娠/授乳/家族構成/氏名）は一切送らない（設計書 §プライバシー）。
// バックエンド未設定や失敗時は黙って無視し、UXに影響させない。
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DecideResult } from './decide';
import type { Fatigue } from '../theme';

const DECIDE_URL = process.env.EXPO_PUBLIC_DECIDE_URL;
const LOG_PICK_URL = DECIDE_URL ? DECIDE_URL.replace(/\/decide$/, '/log-pick') : undefined;
const ANON_KEY = 'konya.anonId.v1';

let cachedAnon: string | null = null;
// 端末ごとの匿名ID（個人を特定しない。集計の重複・継続把握用）。
async function getAnonId(): Promise<string> {
  if (cachedAnon) return cachedAnon;
  try {
    let id = await AsyncStorage.getItem(ANON_KEY);
    if (!id) {
      id = 'a_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      await AsyncStorage.setItem(ANON_KEY, id);
    }
    cachedAnon = id;
    return id;
  } catch {
    return 'a_unknown';
  }
}

export function analyticsAvailable(): boolean {
  return !!LOG_PICK_URL;
}

export async function logPick(opts: {
  result: DecideResult;
  source: 'ai' | 'fallback';
  fatigue: Fatigue;
  categories?: string[];
}): Promise<void> {
  if (!LOG_PICK_URL) return;
  try {
    const anonId = await getAnonId();
    await fetch(LOG_PICK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recipeId: opts.result.id,
        recipeTitle: opts.result.recipe.title,
        source: opts.source,
        fatigue: opts.fatigue,
        categories: opts.categories ?? [],
        anonId,
      }),
    });
  } catch {
    // 記録失敗は無視（集計は best-effort）
  }
}
