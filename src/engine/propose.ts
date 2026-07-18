import type { Recipe, Member, FallbackEntry, Ingredient } from '../types';
import type { Fatigue } from '../theme';
import { resolveSafetyProfile, recipeBlockedBy } from './safety';
import { decide, type DecideResult } from './decide';
import { onDeviceEnabled } from '../config';
import { proposeOnDevice, isOnDeviceUsable } from './ondevice';

// バックエンド（Supabase Edge Function 等）のURL。未設定ならAIを使わずフォールバックのみ。
// app の .env に EXPO_PUBLIC_DECIDE_URL=... を置く。APIキーはサーバ側にのみ持つ。
const DECIDE_URL = process.env.EXPO_PUBLIC_DECIDE_URL;

export function suggestionCount(fatigue: Fatigue): number {
  switch (fatigue) {
    case '限界':
    case '疲れた':
      return 1;
    case '普通':
    case '元気':
      return 3;
  }
}

// 疲労度ごとの調理時間上限。限界/疲れた向けにモデルが時間超過の料理を返すことが実機テストで
// 確認されたため、ユーザーに見えるcookTimeMinutesでクライアント側でも担保する（超過分はスキップ→補填）。
function exceedsFatigueLimit(recipe: Recipe, fatigue: Fatigue): boolean {
  if (fatigue === '限界') return recipe.cookTimeMinutes > 15;
  if (fatigue === '疲れた') return recipe.cookTimeMinutes > 20;
  return false;
}

function fridgeNames(opts: SuggestOpts): string[] {
  return (opts.fridge ?? []).map((i) => i.name);
}

function buildDecisionInput(opts: SuggestOpts, profile: ReturnType<typeof resolveSafetyProfile>) {
  const fridge = opts.fridge ?? [];
  return {
    fatigue: opts.fatigue,
    headcount: opts.members.length,
    eatersTonight: opts.members.map((m) => ({
      label: m.label,
      kind: m.kind,
      age: m.childAge,
      conditions: m.conditions,
    })),
    safetyProfile: profile,
    cuttingBoard: opts.cuttingBoard ?? [],
    fridge: fridge.map((i) => ({ name: i.name, amount: i.amount, expiry: i.expiry ?? null })),
    fridgeEmpty: fridge.length === 0,
    directionTags: opts.directionTags ?? [],
    nutritionDeficits: opts.nutritionDeficits ?? [],
    avoidTitles: opts.avoidTitles ?? [],
    suggestionCount: suggestionCount(opts.fatigue),
  };
}

/** バックエンド経由でClaudeに提案させる。失敗・URL未設定なら例外を投げる。 */
async function proposeRecipes(input: object): Promise<Recipe[]> {
  if (!DECIDE_URL) throw new Error('DECIDE_URL not set');
  const res = await fetch(DECIDE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`decide http ${res.status}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.recipes) || data.recipes.length === 0) {
    throw new Error('bad response shape');
  }
  return data.recipes as Recipe[];
}

// AI出力（タグ無し）を安全チェックするための擬似エントリ
function pseudoEntry(recipe: Recipe): FallbackEntry {
  return {
    id: 'ai',
    select: {
      fatigueOk: [],
      categories: [],
      pantryStaple: false,
      allergens: [],
      safety: { rawEgg: false, rawFish: false, honey: false, choking: false, spicy: false },
    },
    recipe,
  };
}

// 生成候補（オンデバイス/API 共通）を安全検算・重複除去・疲労度制約でふるいにかけ、最大count件返す。
// 三重の安全（設計書 §8）：モデルの自己検算 ＋ ここの検算(recipeBlockedBy) ＋ フォールバックの安全フィルタ。
function pickSafe(
  recipes: Recipe[],
  opts: SuggestOpts,
  profile: ReturnType<typeof resolveSafetyProfile>,
  avoid: Set<string>,
  count: number,
  idPrefix: string,
): DecideResult[] {
  const out: DecideResult[] = [];
  for (const recipe of recipes) {
    if (avoid.has(recipe.title)) continue;
    if (exceedsFatigueLimit(recipe, opts.fatigue)) continue;
    if (out.some((x) => x.recipe.title === recipe.title)) continue;
    if (!recipeBlockedBy(pseudoEntry(recipe), profile).blocked) {
      out.push({ id: `${idPrefix}-${recipe.title}`, recipe });
    }
    if (out.length >= count) break;
  }
  return out;
}

// 安全候補が要求数(count)に満たない時、フォールバック献立で距離をとりつつ補填する（設計書 §4③）。
function fillWithLocal(safe: DecideResult[], opts: SuggestOpts, count: number): DecideResult[] {
  const localAvoid = [...(opts.avoidTitles ?? []), ...safe.map((x) => x.recipe.title)];
  let lastId = opts.lastId ?? null;
  while (safe.length < count) {
    const r = decide({
      fatigue: opts.fatigue,
      members: opts.members,
      avoidTitles: localAvoid,
      lastId,
      nutritionDeficits: opts.nutritionDeficits,
      cuttingBoard: opts.cuttingBoard,
      headcount: opts.members.length,
    });
    if (!r) break;
    localAvoid.push(r.recipe.title);
    lastId = r.id;
    if (safe.some((x) => x.recipe.title === r.recipe.title)) continue;
    safe.push(r);
  }
  return safe;
}

export interface SuggestOutput {
  result: DecideResult | null;
  source: 'ai' | 'fallback';
}

export interface SuggestOpts {
  fatigue: Fatigue;
  members: Member[];
  cuttingBoard?: string[];
  fridge?: Ingredient[];
  directionTags?: string[];
  nutritionDeficits?: string[];
  avoidTitles?: string[];
  lastId?: string | null;
}

/**
 * 今日の飯を1品決める統合関数。3層フォールバック（設計書 §8 / AI方針メモ）:
 *   1. オンデバイスAI（Apple Foundation Models・無料・オフライン）
 *   2. バックエンドAI（Claude Haiku 等・EXPO_PUBLIC_DECIDE_URL 設定時のみ）
 *   3. 内蔵69献立＋ルールベース
 *   全層でクライアント安全検算(pickSafe→recipeBlockedBy)を必ず通す。
 */
export async function getSuggestion(opts: SuggestOpts): Promise<SuggestOutput> {
  const profile = resolveSafetyProfile(opts.members);
  const avoid = new Set(opts.avoidTitles ?? []);

  // 1. オンデバイス（対応端末のみ）
  if (onDeviceEnabled) {
    try {
      if (await isOnDeviceUsable()) {
        const recipes = await proposeOnDevice(buildDecisionInput(opts, profile), fridgeNames(opts), opts.members.length);
        const picked = pickSafe(recipes, opts, profile, avoid, 1, 'od');
        if (picked.length > 0) return { result: picked[0], source: 'ai' };
      }
    } catch {
      // 非対応/失敗 → 次層へ
    }
  }

  // 2. バックエンドAI
  try {
    const recipes = await proposeRecipes(buildDecisionInput(opts, profile));
    const picked = pickSafe(recipes, opts, profile, avoid, 1, 'ai');
    if (picked.length > 0) return { result: picked[0], source: 'ai' };
  } catch {
    // ネットワーク/URL未設定/不正形 → フォールバックへ
  }

  // 3. フォールバック
  const fb = decide({
    fatigue: opts.fatigue,
    members: opts.members,
    avoidTitles: opts.avoidTitles,
    lastId: opts.lastId,
    nutritionDeficits: opts.nutritionDeficits,
    cuttingBoard: opts.cuttingBoard,
    headcount: opts.members.length,
  });
  return { result: fb, source: 'fallback' };
}

export interface SuggestManyOutput {
  results: DecideResult[];
  source: 'ai' | 'fallback';
}

// オンデバイス専用の収集。
// 実機検証で「count件をどう分割して生成させても総生成時間はほぼ変わらない」ことが判明した
// （生成量そのものが支配的で、呼び出し回数や1回あたりの内容量では速くならない）。
// そのため、AIに任せるのは常に最大1件のみとし、残りは無料で瞬時な内蔵献立(fillWithLocal)で埋める。
// 例: 普通/元気(count=3)でも AI呼び出しは1回だけ→約1/3の待ち時間に短縮。多様性は少し落ちるが速度優先。
const ON_DEVICE_MAX_ATTEMPTS = 1;

async function collectOnDevice(
  opts: SuggestOpts,
  profile: ReturnType<typeof resolveSafetyProfile>,
  avoid: Set<string>,
  count: number,
): Promise<DecideResult[] | null> {
  if (!(await isOnDeviceUsable())) return null;
  const safe: DecideResult[] = [];
  const tried = new Set(avoid);
  const maxAttempts = Math.min(ON_DEVICE_MAX_ATTEMPTS, count);
  for (let i = 0; i < maxAttempts && safe.length < count; i++) {
    let recipes: Recipe[];
    try {
      const input = { ...buildDecisionInput(opts, profile), avoidTitles: [...tried] };
      recipes = await proposeOnDevice(input, fridgeNames(opts), opts.members.length);
    } catch {
      break; // タイムアウト/失敗 → 以降のオンデバイス試行を諦める
    }
    if (recipes.length === 0) break;
    const picked = pickSafe(recipes, opts, profile, tried, count - safe.length, 'od');
    for (const p of picked) {
      safe.push(p);
      tried.add(p.recipe.title);
    }
  }
  if (safe.length === 0) return null;
  return safe.length < count ? fillWithLocal(safe, opts, count) : safe;
}

// あるAIソースの候補から安全なcount件を作る（不足はローカルで補填）。0件なら null。
async function collectFromSource(
  getRecipes: () => Promise<Recipe[]>,
  opts: SuggestOpts,
  profile: ReturnType<typeof resolveSafetyProfile>,
  avoid: Set<string>,
  count: number,
  idPrefix: string,
): Promise<DecideResult[] | null> {
  try {
    const recipes = await getRecipes();
    const safe = pickSafe(recipes, opts, profile, avoid, count, idPrefix);
    if (safe.length === 0) return null;
    // モデルが件数を守らないことがあるため（実機テストで確認）、不足分はフォールバックで補填。
    return safe.length < count ? fillWithLocal(safe, opts, count) : safe;
  } catch {
    return null;
  }
}

// ローカル献立のみでN件（重複なし）を即座に作る。AI層を一切経由しないため常に高速・無料。
// 実機検証でオンデバイスAIが1件生成でも70〜100秒級と分かったため、
// UIを絶対にブロックしたくない箇所（onAnotherの即時応答）はこちらを直接使う。
export function localSuggestions(opts: SuggestOpts, count: number): DecideResult[] {
  const results: DecideResult[] = [];
  const localAvoid = [...(opts.avoidTitles ?? [])];
  let lastId = opts.lastId ?? null;
  for (let i = 0; i < count; i++) {
    const r = decide({
      fatigue: opts.fatigue,
      members: opts.members,
      avoidTitles: localAvoid,
      nutritionDeficits: opts.nutritionDeficits,
      cuttingBoard: opts.cuttingBoard,
      headcount: opts.members.length,
      lastId,
    });
    if (!r) break;
    results.push(r);
    localAvoid.push(r.recipe.title);
    lastId = r.id;
  }
  return results;
}

/**
 * 疲労度に応じた件数で提案する（限界/疲れた=1, 普通/元気=3。設計書 §4③）。
 * オンデバイス → バックエンドAI → フォールバックの順で、安全に出せる分を集める。
 * 注意: オンデバイス/バックエンドAIは実機で数十秒〜1分超かかることがあるため、
 * UIをブロックしたくない呼び出し元は localSuggestions() を直接使うこと（本関数はAIを待つ）。
 */
export async function getSuggestions(opts: SuggestOpts): Promise<SuggestManyOutput> {
  const count = suggestionCount(opts.fatigue);
  const profile = resolveSafetyProfile(opts.members);
  const avoid = new Set(opts.avoidTitles ?? []);

  // 1. オンデバイス（1件ずつループで集める。理由はcollectOnDeviceのコメント参照）
  if (onDeviceEnabled) {
    const od = await collectOnDevice(opts, profile, avoid, count);
    if (od) return { results: od, source: 'ai' };
  }

  // 2. バックエンドAI
  const api = await collectFromSource(
    () => proposeRecipes(buildDecisionInput(opts, profile)),
    opts, profile, avoid, count, 'ai',
  );
  if (api) return { results: api, source: 'ai' };

  // 3. フォールバック：重複しないN件
  return { results: localSuggestions(opts, count), source: 'fallback' };
}
