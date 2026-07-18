#!/usr/bin/env node
// 小鉢/汁椀レシピの安全・整合チェック（pnpm run check:recipes）。
//
// なぜ必要か:
// recipeBlockedBy（src/engine/safety.ts）は usedIngredients / missingIngredients の食材名しか見ない。
// 醤油・めんつゆ・ごま油のような「常備品」は工程本文にしか現れないため、それらのアレルゲンは
// select.allergens タグでしか表現されない。タグが漏れると、アレルギーのある利用者に
// そのまま提供されてしまう（実際に既存レシピ20件で漏れが見つかり、2026-07-15に修正した）。
// 人力でもAIでも見落とす種類のミスなので、機械で落とす。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const dict = read('src/data/ingredientDict.json');
const byKey = new Map();
for (const e of dict.ingredients) {
  for (const k of [e.canonical, ...(e.aliases ?? [])]) byKey.set(k, e);
}
const keysByLen = [...byKey.keys()].sort((a, b) => b.length - a.length);

// 工程本文に常備品として現れうる、アレルゲンを持つ調味料等。
// 2文字の魚/果物名（かに・もも・たい・いか）は日常語（「なめらかに」等）に埋没して誤検出するため入れない。
const PANTRY = [
  'オイスターソース', '中華スープの素', '鶏ガラスープの素', '麻婆豆腐の素', '生姜焼きのたれ',
  'とんかつソース', 'ウスターソース', '中濃ソース', 'ドレッシング', 'マヨネーズ', 'カレールウ',
  'めんつゆ', '麺つゆ', 'だしの素', 'ほんだし', '焼肉のたれ', 'コチュジャン', '豆板醤', 'ウェイパー',
  'すりごま', 'いりごま', '練りごま', 'ごま油', '粉チーズ', '生クリーム', '中華だし',
  '食パン', '小麦粉', '薄力粉', 'パン粉', 'はちみつ', 'ポン酢', 'ぽん酢', 'マヨ', 'ソース',
  '醤油', 'しょうゆ', '味噌', 'みそ', 'バター', 'チーズ', '牛乳', '豆乳', 'ごま',
].sort((a, b) => b.length - a.length);

// 長い名前から順に当て、当たった箇所は伏せる（「魚肉ソーセージ」の中の「ソーセージ」等の誤検出を防ぐ）
function scanText(text) {
  const found = new Set();
  let t = text;
  for (const k of PANTRY) {
    if (!t.includes(k)) continue;
    for (const a of byKey.get(k)?.allergens ?? []) found.add(a);
    t = t.split(k).join('〓'.repeat(k.length));
  }
  return found;
}
function lookup(name) {
  for (const k of keysByLen) if (name === k || (k.length >= 2 && name.includes(k))) return byKey.get(k);
  return null;
}

const VALID_FATIGUE = new Set(['限界', '疲れた', '普通', '元気']);
const VALID_CATEGORY = new Set(['肉', '魚', '卵', '大豆', '野菜', '菌類', '主食', '乳', '調味料', 'その他']);
const SPICY_WORDS = ['キムチ', '豆板醤', 'コチュジャン', 'ラー油', '七味', '一味', '唐辛子', 'ピリ辛'];

// materials.unit に使える単位。scaleMaterials.ts の書式ルール（FRACTION_UNITS/SPOON_UNITS/WEIGHT_UNITS）と
// 一致していること。リスト外の単位は「その他」扱いで小数1桁のベタ表示になり、分数や g丸めが効かない。
const VALID_UNITS = new Set([
  'g', 'ml',
  '大さじ', '小さじ',
  '個', '本', '枚', '缶', '丁', '玉', '束', 'パック', '尾', '片', '株', '袋', '房', '節', '杯', '切れ', '箱',
]);

// materials が入っている品の検証。materials 自体は任意（未設定ならチップ表示にフォールバック）なので、
// 「無いこと」はエラーにせず、「有るのに壊れていること」だけを落とす。
function checkMaterials(e, r, at) {
  const m = r.materials;
  if (!m) return;
  if (m.servings !== 2) at(`materials.servings=${m.servings}（2人分基準で書くこと。人数換算はアプリ側でやる）`);
  if (!Array.isArray(m.food) || !Array.isArray(m.seasoning)) { at('materials.food/seasoning が配列でない'); return; }

  for (const [kind, list] of [['food', m.food], ['seasoning', m.seasoning]]) {
    for (const i of list) {
      if (!i.name) { at(`materials.${kind} に name のない要素`); continue; }
      if (i.qty == null) {
        // qty=null は「少々/適量」等の表示テキストを unit に入れる約束（直感に反するので明示的に見る）
        if (!i.unit) at(`「${i.name}」qty=null なのに unit（表示テキスト）が無い`);
      } else {
        if (typeof i.qty !== 'number' || !(i.qty > 0)) at(`「${i.name}」qty が正の数でない（${i.qty}）`);
        if (!i.unit) at(`「${i.name}」unit が無い`);
        else if (!VALID_UNITS.has(i.unit)) at(`「${i.name}」unit「${i.unit}」は表示できない単位`);
      }
      if (kind === 'seasoning' && i.fromFridge !== undefined) at(`調味料「${i.name}」に fromFridge が付いている`);
    }
  }

  // 画面の「（冷蔵庫）」表示は materials.food[].fromFridge を見る。usedIngredients と食い違うと表示が嘘になる。
  const used = new Map(r.usedIngredients.map((i) => [i.name, !!i.fromFridge]));
  for (const f of m.food) {
    if (!used.has(f.name)) continue; // missingIngredients 由来や水などは対象外
    if (!!f.fromFridge !== used.get(f.name)) at(`「${f.name}」の fromFridge が usedIngredients と不一致`);
  }

  // materials は画面に材料を出す新しい経路。ここに載る物のアレルゲンが誰にも見えないと素通りする。
  // recipeBlockedBy（safety.ts:108-112）は used/missing の名前を classify して弾くので、その経路に
  // 名前がある物は判定済み。それ以外の物（工程にしか出ない調味料など）は select.allergens が唯一の砦。
  //
  // 「工程本文に書いてあるか」で見てはいけない。だしの素・鶏ガラスープの素のように工程では
  // 「だしで煮る」としか書かれない物が既存69品に9件あり、それらは誤検出になる（実際に一度そう書いて外した）。
  const names = new Set([...r.usedIngredients.map((i) => i.name), ...(r.missingIngredients ?? [])]);
  const covered = new Set(e.select.allergens ?? []);
  for (const n of names) for (const a of lookup(n)?.allergens ?? []) covered.add(a);
  for (const i of [...m.food, ...m.seasoning]) {
    if (names.has(i.name)) continue;
    for (const a of lookup(i.name)?.allergens ?? []) {
      if (!covered.has(a)) at(`materials の「${i.name}」→ アレルゲン「${a}」が未申告（used/missing にも無く素通りする）`);
    }
  }

  // 材料に出てこない食材が工程に書かれていると、分量を見て作れない。
  const listed = new Set(m.food.map((i) => i.name));
  for (const u of r.usedIngredients) if (!listed.has(u.name)) at(`usedIngredients の「${u.name}」が materials.food に無い`);
}

const errors = [];
for (const [file, label, reqTag, maxMin] of [
  ['src/data/kobachi.json', '小鉢', '副菜', 15],
  ['src/data/soup.json', '汁椀', '汁物', 18],
]) {
  const items = read(file).items;
  const ids = new Set();
  const titles = new Set();
  for (const e of items) {
    const r = e.recipe;
    const at = (m) => errors.push(`[${label}] ${r.title}: ${m}`);

    if (ids.has(e.id)) at(`id重複「${e.id}」`);
    ids.add(e.id);
    if (titles.has(r.title)) at('料理名が重複');
    titles.add(r.title);

    const names = [...r.usedIngredients.map((i) => i.name), ...(r.missingIngredients ?? [])];
    const need = new Set(scanText(r.steps.join(' ')));
    for (const n of names) {
      const hit = lookup(n);
      if (!hit) { at(`辞書に無い食材「${n}」`); continue; }
      if (hit.category === '主食') at(`主食「${n}」は使えない（主菜側で用意する）`);
      for (const a of hit.allergens ?? []) need.add(a);
    }

    // 本命：アレルゲン申告漏れ
    const declared = new Set(e.select.allergens ?? []);
    const missing = [...need].filter((a) => !declared.has(a));
    if (missing.length) at(`アレルゲン申告漏れ: ${missing.join('・')}（申告=${[...declared].join('・') || 'なし'}）`);

    if (r.cookTimeMinutes > maxMin) at(`調理時間 ${r.cookTimeMinutes}分 > ${maxMin}分`);
    if (r.steps.length > 3) at(`工程 ${r.steps.length}つ > 3つ`);
    if (!r.tags.includes(reqTag)) at(`必須タグ「${reqTag}」がない`);
    if (!e.select.fatigueOk?.length) at('fatigueOk が空');
    for (const f of e.select.fatigueOk ?? []) if (!VALID_FATIGUE.has(f)) at(`fatigueOk の値が不正「${f}」`);
    for (const c of e.select.categories ?? []) if (!VALID_CATEGORY.has(c)) at(`categories の値が不正「${c}」`);

    const text = r.title + ' ' + r.steps.join(' ');
    if (SPICY_WORDS.some((w) => text.includes(w)) && !e.select.safety?.spicy) at('辛い食材を使うのに safety.spicy=false');
    if ((text.includes('生卵') || text.includes('半熟')) && !e.select.safety?.rawEgg) at('生/半熟卵なのに safety.rawEgg=false');

    checkMaterials(e, r, at);
  }
  const withMat = items.filter((e) => e.recipe.materials).length;
  console.log(`${label}: ${items.length}品（うち分量あり ${withMat}品）`);
}

if (errors.length) {
  console.error(`\n✗ ${errors.length}件の問題:\n` + errors.map((e) => '  ' + e).join('\n'));
  process.exit(1);
}
console.log('\n✓ レシピ検証OK（アレルゲン申告・食材名・制約すべて整合）');
