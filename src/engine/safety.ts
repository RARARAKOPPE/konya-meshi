import type { Member, SafetyProfile, FallbackEntry } from '../types';
import { classify, normalize, allergenGroups } from './classify';

const INFANT_MAX_AGE = 0; // 0歳 = 1歳未満
const TODDLER_MAX_AGE = 5; // 1〜5歳 = 幼児
const CHOKING_MAX_AGE = 5; // この歳以下は喉詰まり食材を小さく切る

/** 今夜食べる人の集合 → 安全条件を OR 合成（設計書 §7） */
export function resolveSafetyProfile(members: Member[]): SafetyProfile {
  const p: SafetyProfile = {
    allergens: [],
    groups: [],
    freeCanonicals: [],
    freeTerms: [],
    noRawEgg: false,
    noRawFish: false,
    noRawMeat: false,
    noHoney: false,
    noHighMercuryFish: false,
    noUnpasteurized: false,
    noAlcohol: false,
    chokingCut: false,
    noSpicy: false,
    hasChild: false,
    hasPregnant: false,
    hasInfant: false,
  };

  const items = new Set<string>();
  const groups = new Set<string>();
  const freeCanonicals = new Set<string>();
  const freeTerms = new Set<string>();

  for (const m of members) {
    // アレルギー
    for (const a of m.allergies) {
      if (a.type === 'item') items.add(a.value);
      else if (a.type === 'group') {
        groups.add(a.value);
        (allergenGroups[a.value]?.expandAllergens ?? []).forEach((x) => items.add(x));
      } else {
        const r = classify(a.value);
        if (r.matched && r.canonical) freeCanonicals.add(r.canonical);
        else {
          const t = normalize(a.value);
          if (t.length >= 2) freeTerms.add(t);
        }
      }
    }

    if (m.kind === 'adult') {
      if (m.conditions.includes('妊娠中')) {
        p.hasPregnant = true;
        p.noRawEgg = true;
        p.noRawFish = true;
        p.noRawMeat = true;
        p.noHighMercuryFish = true;
        p.noUnpasteurized = true;
        p.noAlcohol = true;
      }
      if (m.conditions.includes('授乳中')) p.noAlcohol = true;
    }

    if (m.kind === 'child') {
      p.hasChild = true;
      p.noAlcohol = true;
      p.noSpicy = true; // 年齢不問。辛さは切り方で緩和できないためchokingCutと違いハードブロック
      const age = m.childAge ?? 0;
      if (age <= INFANT_MAX_AGE) {
        p.hasInfant = true;
        p.noHoney = true;
        p.noRawEgg = true;
        p.noRawFish = true;
        p.noRawMeat = true;
      } else if (age <= TODDLER_MAX_AGE) {
        p.noRawEgg = true;
        p.noRawFish = true;
      }
      if (age <= CHOKING_MAX_AGE) p.chokingCut = true;
    }
  }

  p.allergens = [...items];
  p.groups = [...groups];
  p.freeCanonicals = [...freeCanonicals];
  p.freeTerms = [...freeTerms];
  return p;
}

export interface BlockResult {
  blocked: boolean;
  needsConfirm: boolean;
}

/** レシピがプロファイルに違反するか（設計書 §4・§7） */
export function recipeBlockedBy(entry: FallbackEntry, p: SafetyProfile): BlockResult {
  const itemSet = new Set(p.allergens);
  const names = [...entry.recipe.usedIngredients.map((i) => i.name), ...entry.recipe.missingIngredients];
  const tagAllergens = entry.select.allergens ?? [];

  // (a) 28品目：レシピタグ
  for (const al of tagAllergens) if (itemSet.has(al)) return { blocked: true, needsConfirm: false };

  let needsConfirm = false;
  const hasAnyAllergy =
    p.allergens.length > 0 || p.groups.length > 0 || p.freeCanonicals.length > 0 || p.freeTerms.length > 0;

  for (const name of names) {
    const r = classify(name);

    // (a) 28品目：食材のallergens
    for (const al of r.allergens) if (itemSet.has(al)) return { blocked: true, needsConfirm: false };

    // (b) グループ
    for (const g of p.groups) {
      const def = allergenGroups[g];
      if (!def) continue;
      const inList = def.matchCanonicals?.includes(r.canonical ?? '') ?? false;
      const inCat =
        (def.matchCategories?.includes(r.category) ?? false) &&
        !(def.excludeCanonicals?.includes(r.canonical ?? '') ?? false);
      if (inList || inCat) return { blocked: true, needsConfirm: false };
    }

    // (c) 自由入力（解決済）
    if (r.canonical && p.freeCanonicals.includes(r.canonical)) return { blocked: true, needsConfirm: false };

    // (d) 自由入力（未解決）：部分一致
    const nName = normalize(name);
    for (const t of p.freeTerms) if (nName.includes(t)) return { blocked: true, needsConfirm: false };

    // (e) 曖昧食材：関係する肉アレルギーがあれば要確認
    if (r.ambiguous) for (const may of r.maybeAllergens) if (itemSet.has(may)) needsConfirm = true;

    // 未知食材はアレルギー世帯では要確認
    if (!r.matched && hasAnyAllergy) needsConfirm = true;
  }

  // 生もの・はちみつ（フォールバックの safety フラグ）
  const s = entry.select.safety;
  if (p.noRawEgg && s.rawEgg) return { blocked: true, needsConfirm: false };
  if (p.noRawFish && s.rawFish) return { blocked: true, needsConfirm: false };
  if (p.noHoney && s.honey) return { blocked: true, needsConfirm: false };
  if (p.noSpicy && s.spicy) return { blocked: true, needsConfirm: false };

  return { blocked: false, needsConfirm };
}

/** 画面表示用：今、何が除外されているか */
export function summarizeExclusions(p: SafetyProfile): string[] {
  const out: string[] = [];
  if (p.hasPregnant) out.push('生もの（妊娠中）');
  else if (p.noRawEgg || p.noRawFish) out.push('生もの');
  for (const g of p.groups) out.push(allergenGroups[g]?.label ?? g);
  for (const a of p.allergens) out.push(a);
  for (const c of p.freeCanonicals) out.push(c);
  for (const t of p.freeTerms) out.push(t);
  // 重複除去
  return [...new Set(out)];
}
