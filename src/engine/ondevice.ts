// オンデバイスAI提案（Apple Foundation Models / Apple Intelligence）。
// 端末内で完結＝APIコスト0・オフライン・プライベート。iOS 26+/A17 Pro+の対応端末でのみ動作し、
// 非対応（旧iPhone/Android/web/Expo Go/未設定）では unsupported を返してフォールバックへ委ねる。
//
// 実装メモ:
// - react-native-apple-llm はネイティブ未リンク時に「import」で throw する（commonjs index が
//   native module 不在で Error を投げる）。よって静的importは使わず Platform.OS==='ios' で
//   ガードした遅延 require + try/catch で読み込む（Android/web/Expo Go でバンドルを壊さないため）。
// - 同ライブラリの generateStructuredOutput のスキーマ型は配列を表現できない。レシピは配列
//   （steps/usedIngredients/materials.*）を含むため、テキスト生成＋JSON解析方式を採る。
//   （この方式は M4 実機ベンチで スキーマ16/16・制約16/16・安全8/8 を確認済み。）
import { Platform } from 'react-native';
import type { Recipe, UsedIngredient, Materials, MaterialItem } from '../types';

type AppleLLM = typeof import('react-native-apple-llm');
export type OnDeviceStatus =
  | 'available'
  | 'appleIntelligenceNotEnabled'
  | 'modelNotReady'
  | 'unavailable'
  | 'unsupported';

// システムプロンプト（実機ベンチで検証済みの版。4096トークン窓に収まる圧縮版）。
const SYSTEM_PROMPT = `あなたは「今日飯」という夕飯の意思決定を代行するアプリのエンジンです。疲れて帰宅した共働き子育て世帯に代わって「今日はこれを作ればいい」を即決します。
優先順位: 1.安全（絶対） 2.制約（疲労度/人数/在庫） 3.好み・栄養。
安全: safetyProfile.allergens の食材・それを含む調味料/加工品は一切使わない（例:卵→マヨネーズ不可、乳→バター/チーズ/牛乳不可、小麦→パン/麺/天ぷら不可、甲殻類→えび/かに不可、そば不可、落花生→ピーナッツ不可、魚不可）。chokingCut=trueならウインナー/ミニトマト等は小さく切る指示を入れる。noRawEgg/noRawFish/noRawMeatは生や半生を出さず必ず加熱する。noHighMercuryFishはまぐろ等大型魚を避ける。
制約: fatigueで工程数と調理時間を厳守: 限界→stepsは3つ以内かつcookTimeMinutesは15分以内、疲れた→stepsは3つ以内かつcookTimeMinutesは20分以内、普通/元気→stepsは4つ以内。suggestionCount 件を返し互いに重複させない。在庫に無い食材は missingIngredients に入れる。子(child)がいればchildNoteに配慮を書く。
出力は指定JSONスキーマに厳密に従い、JSON以外の文字（前置き・\`\`\`等）を一切出力しない。
スキーマ: {"recipes":[{"title":string,"reason":string,"cookTimeMinutes":int,"servings":int,"childFriendly":bool,"childNote":string,"usedIngredients":[string],"missingIngredients":[string],"steps":[string],"materials":{"servings":int,"food":[{"name":string,"qty":number,"unit":string,"fromFridge":bool}],"seasoning":[{"name":string,"qty":number,"unit":string}]}}]}`;

let cached: AppleLLM | null | undefined; // undefined=未試行, null=不可
function loadModule(): AppleLLM | null {
  if (Platform.OS !== 'ios') return null;
  if (cached !== undefined) return cached;
  try {
    // 遅延require（未リンク時のimport例外を局所化）。RNのグローバルrequireを使用。
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('react-native-apple-llm') as AppleLLM;
  } catch {
    cached = null;
  }
  return cached;
}

/** オンデバイスモデルの可用性。対応外は 'unsupported'。 */
export async function onDeviceStatus(): Promise<OnDeviceStatus> {
  const mod = loadModule();
  if (!mod) return 'unsupported';
  try {
    return (await mod.isFoundationModelsEnabled()) as OnDeviceStatus;
  } catch {
    return 'unavailable';
  }
}

/** 実際に提案生成に使えるか（'available' のみ true）。 */
export async function isOnDeviceUsable(): Promise<boolean> {
  return (await onDeviceStatus()) === 'available';
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('on-device timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

function extractJson(s: string): string {
  let t = s.trim();
  if (t.startsWith('```')) {
    const nl = t.indexOf('\n');
    if (nl >= 0) t = t.slice(nl + 1);
    const fence = t.lastIndexOf('```');
    if (fence >= 0) t = t.slice(0, fence);
  }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return t.trim();
}

function toMaterialItem(x: any, fridge: Set<string>, withFridge: boolean): MaterialItem | null {
  if (!x || typeof x.name !== 'string' || !x.name) return null;
  const qty = typeof x.qty === 'number' && Number.isFinite(x.qty) && x.qty > 0 ? x.qty : null;
  const unit = typeof x.unit === 'string' && x.unit ? x.unit : null;
  const item: MaterialItem = { name: x.name, qty, unit };
  if (withFridge) item.fromFridge = typeof x.fromFridge === 'boolean' ? x.fromFridge : fridge.has(x.name);
  return item;
}

function toMaterials(m: any, fridge: Set<string>, headcount: number): Materials | undefined {
  if (!m || typeof m !== 'object') return undefined;
  const food = Array.isArray(m.food) ? m.food.map((x: any) => toMaterialItem(x, fridge, true)).filter(Boolean) as MaterialItem[] : [];
  const seasoning = Array.isArray(m.seasoning) ? m.seasoning.map((x: any) => toMaterialItem(x, fridge, false)).filter(Boolean) as MaterialItem[] : [];
  if (food.length === 0 && seasoning.length === 0) return undefined;
  const servings = typeof m.servings === 'number' && Number.isFinite(m.servings) ? m.servings : headcount;
  return { servings, food, seasoning };
}

function toRecipe(r: any, fridge: Set<string>, headcount: number): Recipe | null {
  if (!r || typeof r.title !== 'string' || !r.title || !Array.isArray(r.steps)) return null;
  const steps = r.steps.filter((s: any) => typeof s === 'string' && s.trim()).map((s: string) => s.trim());
  if (steps.length === 0) return null;
  const used: UsedIngredient[] = Array.isArray(r.usedIngredients)
    ? r.usedIngredients
        .map((n: any): UsedIngredient =>
          typeof n === 'string'
            ? { name: n, fromFridge: fridge.has(n) }
            : { name: String(n?.name ?? ''), fromFridge: !!n?.fromFridge })
        .filter((u: UsedIngredient) => u.name)
    : [];
  return {
    title: r.title,
    reason: typeof r.reason === 'string' ? r.reason : '',
    cookTimeMinutes: typeof r.cookTimeMinutes === 'number' && Number.isFinite(r.cookTimeMinutes) ? Math.round(r.cookTimeMinutes) : 15,
    servings: typeof r.servings === 'number' && Number.isFinite(r.servings) ? r.servings : headcount,
    washUp: typeof r.washUp === 'string' ? r.washUp : '',
    childFriendly: typeof r.childFriendly === 'boolean' ? r.childFriendly : true,
    childNote: typeof r.childNote === 'string' && r.childNote ? r.childNote : null,
    usedIngredients: used,
    missingIngredients: Array.isArray(r.missingIngredients) ? r.missingIngredients.filter((x: any) => typeof x === 'string') : [],
    materials: toMaterials(r.materials, fridge, headcount),
    steps,
    tags: Array.isArray(r.tags) ? r.tags.filter((x: any) => typeof x === 'string') : [],
    nutritionFocus: typeof r.nutritionFocus === 'string' && r.nutritionFocus ? r.nutritionFocus : null,
  };
}

/**
 * オンデバイスで献立候補を生成する。使えない/失敗/0件なら throw（呼び出し側でフォールバック）。
 * 出力は app の Recipe 型へ正規化。安全検算は呼び出し側（propose.ts の recipeBlockedBy）で必ず行う。
 */
export async function proposeOnDevice(
  input: object,
  fridgeNames: string[],
  headcount: number,
  timeoutMs = 20000,
): Promise<Recipe[]> {
  const mod = loadModule();
  if (!mod) throw new Error('on-device unsupported');
  const status = (await mod.isFoundationModelsEnabled()) as OnDeviceStatus;
  if (status !== 'available') throw new Error(`on-device ${status}`);

  const session = new mod.AppleLLMSession();
  try {
    await session.configure({ instructions: SYSTEM_PROMPT });
    const prompt = `次の入力に対し suggestionCount 件の献立をスキーマのJSONのみで返す:\n${JSON.stringify(input)}`;
    const raw = await withTimeout(session.generateText({ prompt }), timeoutMs);
    const parsed = JSON.parse(extractJson(raw)) as { recipes?: unknown };
    if (!parsed || !Array.isArray(parsed.recipes)) throw new Error('on-device bad shape');
    const fridge = new Set(fridgeNames);
    const recipes = parsed.recipes
      .map((r) => toRecipe(r, fridge, headcount))
      .filter((r): r is Recipe => r !== null);
    if (recipes.length === 0) throw new Error('on-device empty');
    return recipes;
  } finally {
    try { session.dispose(); } catch { /* noop */ }
  }
}
