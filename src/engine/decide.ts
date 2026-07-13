import fallbackData from '../data/fallbackRecipes.json';
import type { FallbackEntry, Recipe, Member } from '../types';
import type { Fatigue } from '../theme';
import { resolveSafetyProfile, recipeBlockedBy } from './safety';
import { classify } from './classify';

const ENTRIES = (fallbackData as { recipes: FallbackEntry[] }).recipes;

export interface DecideResult {
  id: string;
  recipe: Recipe;
}

/**
 * 今日の飯を1品決める。
 *
 * MVPではフォールバック献立リストから選ぶ（設計書 §8 の選択ロジック）。
 * 将来ここを Claude API 呼び出しに差し替え、失敗時に本関数へフォールバックする。
 *
 * 安全フィルタ（§7）は前段に適用し、絶対に緩めない。
 * 安全に出せる候補が無い場合は null を返す（呼び出し側で手動選択を促す）。
 */
export function decide(opts: {
  fatigue: Fatigue;
  members: Member[];
  avoidTitles?: string[];
  lastId?: string | null;
  nutritionDeficits?: string[];
  cuttingBoard?: string[];
  headcount?: number;
}): DecideResult | null {
  const profile = resolveSafetyProfile(opts.members);

  // 0. 安全フィルタ（最優先・絶対に緩めない）
  let safe = ENTRIES.filter((e) => !recipeBlockedBy(e, profile).blocked);
  if (safe.length === 0) return null;

  // 家族（2人以上）には「1人前向け（soloOnly）」を出さない
  if ((opts.headcount ?? 1) >= 2) {
    const family = safe.filter((e) => !e.select.soloOnly);
    if (family.length > 0) safe = family;
  }

  const avoid = new Set(opts.avoidTitles ?? []);

  // 1. 安全な中で：疲労度に合う & 既出でない & 直前でない
  let pool = safe.filter(
    (e) => e.select.fatigueOk.includes(opts.fatigue) && !avoid.has(e.recipe.title) && e.id !== opts.lastId
  );
  // 2. 空なら疲労度だけ緩める（安全は緩めない）
  if (pool.length === 0) pool = safe.filter((e) => !avoid.has(e.recipe.title));
  // 3. それでも空なら安全な全件
  if (pool.length === 0) pool = safe;

  // 4. まな板の食材を使う候補を最優先（ユーザーの明示的な意図）
  const board = opts.cuttingBoard ?? [];
  if (board.length > 0) {
    const boardCanon = new Set(
      board.map((n) => classify(n).canonical).filter((c): c is string => !!c)
    );
    if (boardCanon.size > 0) {
      // まな板食材を多く使う候補ほど「近い」。マッチ数でスコア化し、最多スコア群だけ残す
      // （その中から最後にランダムで1品選ぶ＝近いものからランダム）。
      let best = 0;
      const scored = pool.map((e) => {
        const n = e.recipe.usedIngredients.reduce((acc, i) => {
          const c = classify(i.name).canonical;
          return acc + (c != null && boardCanon.has(c) ? 1 : 0);
        }, 0);
        if (n > best) best = n;
        return { e, n };
      });
      if (best > 0) pool = scored.filter((x) => x.n === best).map((x) => x.e);
    }
  }

  // 5. 栄養不足カテゴリに合う候補を優先（§8.5）
  const deficits = opts.nutritionDeficits ?? [];
  if (deficits.length > 0) {
    const preferred = pool.filter((e) => e.select.categories.some((c) => deficits.includes(c)));
    if (preferred.length > 0) pool = preferred;
  }

  const picked = pool[Math.floor(Math.random() * pool.length)];
  return { id: picked.id, recipe: picked.recipe };
}

// 疲労度ごとの「決めて」ボタン文言（設計書 §4②）
export function decideButtonLabel(fatigue: Fatigue): string {
  switch (fatigue) {
    case '元気':
      return '献立を決める';
    case '普通':
      return '今日の飯を決めて';
    case '疲れた':
      return 'もう決めて';
    case '限界':
      return '何でもいいから決めて';
  }
}
