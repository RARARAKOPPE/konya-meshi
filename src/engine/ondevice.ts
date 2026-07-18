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

// システムプロンプト（速度優先の圧縮版）。
// 実機で「別の案」（普通/元気=3件を1回で要求）が約100秒かかる不具合が判明したため、
// (1) 常に1件だけ生成させる（呼び出し側の複数件はpropose.ts側でこの関数をループして集める）
// (2) materials（食材ごとの分量/単位/在庫フラグの内訳）の生成をやめ、出力トークンを大幅に削減。
//     Recipe.materials は元々optionalで、未設定ならusedIngredientsから表示にフォールバックする
//     既存の仕組みがあるため、オンデバイス提案だけ分量内訳なしでも壊れない。
// (3) reasonを短く絞り、生成量をさらに削る。
const SYSTEM_PROMPT = `あなたは「今日飯」という夕飯の意思決定を代行するアプリのエンジンです。疲れて帰宅した共働き子育て世帯に代わって「今日はこれを作ればいい」を即決します。
優先順位: 1.安全（絶対） 2.制約（疲労度/人数/在庫） 3.好み・栄養。
安全: safetyProfile.allergens の食材・それを含む調味料/加工品は一切使わない（例:卵→マヨネーズ不可、乳→バター/チーズ/牛乳不可、小麦→パン/麺/天ぷら不可、甲殻類→えび/かに不可、そば不可、落花生→ピーナッツ不可、魚不可）。chokingCut=trueならウインナー/ミニトマト等は小さく切る指示を入れる。noRawEgg/noRawFish/noRawMeatは生や半生を出さず必ず加熱する。noHighMercuryFishはまぐろ等大型魚を避ける。
制約: fatigueで工程数と調理時間を厳守: 限界→stepsは3つ以内かつcookTimeMinutesは15分以内、疲れた→stepsは3つ以内かつcookTimeMinutesは20分以内、普通/元気→stepsは4つ以内。1件だけ返す。在庫に無い食材は missingIngredients に入れる。子(child)がいればchildNoteに配慮を書く。
出力は指定JSONスキーマに厳密に従い、JSON以外の文字（前置き・\`\`\`等）を一切出力しない。手早く簡潔に。
スキーマ: {"recipes":[{"title":string,"reason":string(20字以内),"cookTimeMinutes":int,"servings":int,"childFriendly":bool,"childNote":string,"usedIngredients":[string],"missingIngredients":[string],"steps":[string]}]}`;

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
// 実機診断用の簡易タイマー。Metro接続時、ターミナルに [ondevice] タグ付きで出力される
// （`pnpm start --dev-client` を実行しているMacの画面にそのまま表示される。Xcode不要）。
// 「別の案」を押してから、この関数の一連のログをコピーして渡してもらえれば、
// 80秒級の遅延がどの段階（configure/generateText/JSON解析）に集中しているか特定できる。
let callSeq = 0;
function timer(label: string) {
  const id = ++callSeq;
  const t0 = Date.now();
  console.log(`[ondevice#${id}] ${label}: start`);
  return {
    end: (extra?: string) => {
      console.log(`[ondevice#${id}] ${label}: done in ${Date.now() - t0}ms${extra ? ` (${extra})` : ''}`);
    },
  };
}

// オンデバイス生成の同時実行を防ぐアプリ全体のミューテックス。
// 実機ログで、generateText の実行中にもう1件重ねて呼ぶと片方が即失敗することを確認したため、
// 既に生成中なら新しい要求はセッションすら作らず即座に throw し、呼び出し側のフォールバックに委ねる。
let generating = false;

// セッション生成〜JSON正規化までの共通コア。
// 失敗時は残り時間内で最大 MAX_ATTEMPTS 回まで同じプロンプトで再試行する。
const MAX_ATTEMPTS = 2;
async function runOnDeviceGeneration(
  label: string,
  systemPrompt: string,
  prompt: string,
  fridgeNames: string[],
  headcount: number,
  timeoutMs: number,
): Promise<Recipe[]> {
  const total = timer(label);
  const mod = loadModule();
  if (!mod) { total.end('unsupported'); throw new Error('on-device unsupported'); }

  const t1 = timer('isFoundationModelsEnabled');
  const status = (await mod.isFoundationModelsEnabled()) as OnDeviceStatus;
  t1.end(status);
  if (status !== 'available') { total.end(`aborted: ${status}`); throw new Error(`on-device ${status}`); }

  if (generating) { total.end('aborted: busy (another generation in flight)'); throw new Error('on-device busy'); }
  generating = true;

  // 失敗は数百msで返るため、残り時間内なら再試行する
  // （無制限リトライは過去に70〜100秒級の遅延を招いた原因そのものなので、必ず残り時間内に収める）。
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 500) break;
      const t2 = timer(`new AppleLLMSession + configure (attempt ${attempt})`);
      const session = new mod.AppleLLMSession();
      try {
        await session.configure({ instructions: systemPrompt });
        t2.end();
        const t3 = timer(`generateText (attempt ${attempt}, timeoutMs=${remaining})`);
        let raw: string;
        try {
          raw = await withTimeout(session.generateText({ prompt }), remaining);
          t3.end(`length=${raw.length}`);
        } catch (e) {
          t3.end(`ERROR: ${String(e)}`);
          throw e;
        }
        const t4 = timer('JSON parse');
        const parsed = JSON.parse(extractJson(raw)) as { recipes?: unknown };
        t4.end();
        if (!parsed || !Array.isArray(parsed.recipes)) throw new Error('on-device bad shape');
        const fridge = new Set(fridgeNames);
        const recipes = parsed.recipes
          .map((r) => toRecipe(r, fridge, headcount))
          .filter((r): r is Recipe => r !== null);
        if (recipes.length === 0) throw new Error('on-device empty');
        total.end(`recipes=${recipes.length} (attempt ${attempt})`);
        return recipes;
      } catch (e) {
        lastErr = e;
      } finally {
        try { session.dispose(); } catch { /* noop */ }
      }
    }
    total.end(`failed after retries: ${String(lastErr)}`);
    throw lastErr instanceof Error ? lastErr : new Error('on-device failed');
  } finally {
    generating = false;
  }
}

export async function proposeOnDevice(
  input: object,
  fridgeNames: string[],
  headcount: number,
  timeoutMs = 20000,
): Promise<Recipe[]> {
  // 呼び出し側が何件指定していても、オンデバイスは常に1件だけ生成する（速度優先）。
  // 複数件必要な場合は propose.ts 側でこの関数をループして集める。
  const singleInput = { ...(input as Record<string, unknown>), suggestionCount: 1 };
  const prompt = `次の入力に対し1件の献立をスキーマのJSONのみで返す:\n${JSON.stringify(singleInput)}`;
  return runOnDeviceGeneration('proposeOnDevice total', SYSTEM_PROMPT, prompt, fridgeNames, headcount, timeoutMs);
}


// ウォームアップ（実機ベンチで初回生成が体感で重いとの指摘を受けての対応）。
// 実際の提案生成より前（疲労度選択画面が出た時点など）に軽いダミー生成を1回投げておき、
// OSにモデルをメモリへ載せさせておく。セッション自体は使い回さず毎回破棄する
// （LanguageModelSessionは会話コンテキストを蓄積するため、使い回すと過去の献立が
//  コンテキストに残り続け、4096トークン窓をすぐ食いつぶす。ウォームアップ専用に使い捨てる）。
// 失敗しても実害はない（本番の呼び出しは毎回新規セッションで独立して行われる）。
let warmed = false;
export async function prewarmOnDevice(): Promise<void> {
  if (warmed || generating) return; // 同時実行禁止（runOnDeviceGenerationと同じミューテックス）
  const mod = loadModule();
  if (!mod) return;
  try {
    const status = (await mod.isFoundationModelsEnabled()) as OnDeviceStatus;
    if (status !== 'available') return;
    generating = true;
    const session = new mod.AppleLLMSession();
    await session.configure({ instructions: SYSTEM_PROMPT });
    await withTimeout(session.generateText({ prompt: '{"warmup":true}' }), 15000).catch(() => { /* ウォームアップ失敗は無視 */ });
    try { session.dispose(); } catch { /* noop */ }
    warmed = true;
  } catch {
    // 可用性判定/生成の失敗はウォームアップ目的では無視して良い
  } finally {
    generating = false;
  }
}
