import kobachiData from '../data/kobachi.json';
import type { FallbackEntry, Member } from '../types';
import { resolveSafetyProfile, recipeBlockedBy } from './safety';
import type { DecideResult } from './decide';

const ITEMS = (kobachiData as { items: FallbackEntry[] }).items;

// ＋1小鉢：メインに足すもう一品（副菜・彩り）を1つ返す。
// 安全フィルタはメイン献立と同じ recipeBlockedBy を再利用（アレルギー/妊娠等を必ず除外）。
// avoidTitle を渡すと直前と別の小鉢を出す（「別の小鉢」ボタン用）。
export function pickKobachi(members: Member[], avoidTitle?: string): DecideResult | null {
  const profile = resolveSafetyProfile(members);
  const safe = ITEMS.filter((e) => !recipeBlockedBy(e, profile).blocked);
  if (safe.length === 0) return null;
  let pool = avoidTitle ? safe.filter((e) => e.recipe.title !== avoidTitle) : safe;
  if (pool.length === 0) pool = safe; // 1品しか安全でない場合は同じでも返す
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return { id: picked.id, recipe: picked.recipe };
}
