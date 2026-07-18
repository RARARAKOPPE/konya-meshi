import soupData from '../data/soup.json';
import type { FallbackEntry, Member } from '../types';
import { resolveSafetyProfile, recipeBlockedBy } from './safety';
import type { DecideResult } from './decide';

const ITEMS = (soupData as { items: FallbackEntry[] }).items;

// ＋1汁椀：メインに足すもう一品（汁物）を1つ返す。kobachi.ts の pickKobachi と同じ設計。
// 安全フィルタはメイン献立と同じ recipeBlockedBy を再利用（アレルギー/妊娠等を必ず除外）。
// avoidTitles には「直前に出した物」＋「直近に選んだ物（storage/addonHistory）」を渡す。
export function pickSoup(members: Member[], avoidTitles: string[] = []): DecideResult | null {
  const profile = resolveSafetyProfile(members);
  const safe = ITEMS.filter((e) => !recipeBlockedBy(e, profile).blocked);
  if (safe.length === 0) return null;
  const avoid = new Set(avoidTitles);
  let pool = safe.filter((e) => !avoid.has(e.recipe.title));
  if (pool.length === 0) pool = safe; // 安全な候補が履歴で尽きた場合は重複を許容して返す
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return { id: picked.id, recipe: picked.recipe };
}
