import { classify } from './classify';
import type { MealHistory } from '../types';

// 偏り判定の対象カテゴリ（主食・乳・調味料・その他は無視。設計書 §8.5）
const TRACK = ['魚', '肉', '卵', '大豆', '野菜'] as const;
const PRIORITY = ['魚', '野菜', '大豆', '肉', '卵'];
const WEEKLY_TARGET: Record<string, number> = { 魚: 2, 野菜: 4, 大豆: 2, 肉: 2, 卵: 2 };
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** usedIngredients の名前 → メニュー単位ユニークのカテゴリ（履歴に保存する値） */
export function mealCategories(usedNames: string[]): string[] {
  const set = new Set<string>();
  for (const n of usedNames) {
    const c = classify(n).category;
    if ((TRACK as readonly string[]).includes(c)) set.add(c);
  }
  return [...set];
}

/** 夕飯の日付（翌朝5時まで同日。設計書 §4.5） */
export function dinnerDate(now: Date = new Date()): string {
  const d = new Date(now);
  if (d.getHours() < 5) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface DeficitResult {
  enough: boolean;
  counts: Record<string, number>;
  needed: Record<string, number>;
  deficits: string[];
  topDeficit: string | null;
}

/** 直近7日の履歴から栄養の偏りを算出（設計書 §8.5） */
export function computeDeficits(history: MealHistory[], now: number = Date.now()): DeficitResult {
  const windowMeals = history.filter((m) => m.cookedAt >= now - WEEK_MS);
  const counts: Record<string, number> = { 魚: 0, 肉: 0, 卵: 0, 大豆: 0, 野菜: 0 };
  for (const m of windowMeals) {
    const cats = new Set(m.categories);
    for (const c of TRACK) if (cats.has(c)) counts[c]++;
  }

  if (windowMeals.length < 3) {
    return { enough: false, counts, needed: {}, deficits: [], topDeficit: null };
  }

  const scale = Math.min(windowMeals.length, 7) / 7;
  const needed: Record<string, number> = {};
  const ranked: { cat: string; sev: number }[] = [];
  for (const c of PRIORITY) {
    const need = Math.ceil(WEEKLY_TARGET[c] * scale);
    needed[c] = need;
    if (counts[c] < need) ranked.push({ cat: c, sev: need - counts[c] });
  }
  ranked.sort((a, b) => b.sev - a.sev);
  const deficits = ranked.slice(0, 2).map((x) => x.cat);
  return { enough: true, counts, needed, deficits, topDeficit: ranked[0]?.cat ?? null };
}

export const TRACK_CATEGORIES = TRACK;
