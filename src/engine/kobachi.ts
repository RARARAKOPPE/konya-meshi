import kobachiData from '../data/kobachi.json';
import type { FallbackEntry, Member } from '../types';
import { resolveSafetyProfile, recipeBlockedBy } from './safety';
import type { DecideResult } from './decide';

const ITEMS = (kobachiData as { items: FallbackEntry[] }).items;

// ＋1小鉢：メインに足すもう一品（副菜・彩り）を1つ返す。
// 安全フィルタはメイン献立と同じ recipeBlockedBy を再利用（アレルギー/妊娠等を必ず除外）。
// avoidTitles には「直前に出した物」＋「直近に選んだ物（storage/addonHistory）」を渡す。
// 24品しかないため直前1件だけを避ける方式では体感的にすぐ重複するので、直近履歴ごと外す。
// 全部避けると候補が空になる場合は、避けずに全体から選ぶ（提案できない事態を避けるため）。
export function pickKobachi(members: Member[], avoidTitles: string[] = []): DecideResult | null {
  const profile = resolveSafetyProfile(members);
  const safe = ITEMS.filter((e) => !recipeBlockedBy(e, profile).blocked);
  if (safe.length === 0) return null;
  const avoid = new Set(avoidTitles);
  let pool = safe.filter((e) => !avoid.has(e.recipe.title));
  if (pool.length === 0) pool = safe; // 安全な候補が履歴で尽きた場合は重複を許容して返す
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return { id: picked.id, recipe: picked.recipe };
}
