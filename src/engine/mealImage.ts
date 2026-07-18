import type { Recipe } from '../types';

// 生成イラスト35点（透過1024×1024）。react-native の require は静的解決が必要なため対応表で持つ。
// 画像とキーの対応は全点、実装前に目視確認済み（料理名を取り違えないこと）。
const IMAGES = {
  don: require('../../assets/meals/01-buta-koma-don.png'), // 丼もの
  ramen: require('../../assets/meals/02-shoyu-ramen.png'), // 麺類（ラーメンで代表）
  itame: require('../../assets/meals/03-niku-yasai-itame-teishoku.png'), // 炒め物定食
  yakizakana: require('../../assets/meals/04-yaki-zakana-teishoku.png'), // 焼き魚定食
  nimono: require('../../assets/meals/05-nikujaga-teishoku.png'), // 煮物定食
  curry: require('../../assets/meals/06-curry-rice.png'), // カレー
  nabe: require('../../assets/meals/07-gudakusan-miso-nabe.png'), // 鍋・汁物
  salad: require('../../assets/meals/08-salad-main-teishoku.png'), // サラダ主菜
  tamago: require('../../assets/meals/09-dashimaki-tamago-teishoku.png'), // 卵料理
  mabo: require('../../assets/meals/10-mabo-dofu-teishoku.png'), // 麻婆・豆腐
  agemono: require('../../assets/meals/11-karaage-teishoku.png'), // 揚げ物定食
  gozen: require('../../assets/meals/12-ichiju-sansai-gozen.png'), // 一汁三菜（豪華版・品数拡充時用に予約）
  breakfast: require('../../assets/meals/13-light-breakfast.png'), // 軽い朝食
  rice: require('../../assets/meals/14-white-rice-bowl.png'), // 白ごはん（汎用フォールバック）
  pasta: require('../../assets/meals/15-tomato-pasta.png'), // パスタ（トマトソース皿盛り）
  udon: require('../../assets/meals/16-udon.png'), // うどん（かけうどん・かまぼこ・ねぎ）
  omurice: require('../../assets/meals/17-omurice.png'), // オムライス
  hamburg: require('../../assets/meals/18-hamburg-steak-teishoku.png'), // ハンバーグ定食
  shogayaki: require('../../assets/meals/19-shogayaki-teishoku.png'), // 生姜焼き定食
  teriyaki_chicken: require('../../assets/meals/20-teriyaki-chicken-teishoku.png'), // 照り焼きチキン定食
  hoikoro: require('../../assets/meals/21-hoikoro.png'), // 回鍋肉
  // ── ここから、itame/don/yakizakana に集中していた分の分解用（2026-07-16 追加）──
  renji_mushi: require('../../assets/meals/22-renji-mushi.png'), // レンジ蒸し（肉と野菜・汁気あり）
  cream_ni: require('../../assets/meals/23-cream-ni.png'), // クリーム煮
  kasane_ni: require('../../assets/meals/24-kasane-ni.png'), // 重ね煮・煮込み（土鍋）
  ankake: require('../../assets/meals/25-sweet-sour-ankake.png'), // 中華の甘酢あん
  buta_kimchi: require('../../assets/meals/26-buta-kimchi.png'), // 豚キムチ
  egg_itame: require('../../assets/meals/27-egg-stir-fry.png'), // 卵と具の炒め
  oyakodon: require('../../assets/meals/28-oyakodon.png'), // 親子丼（卵とじ丼）
  soboro_don: require('../../assets/meals/29-soboro-don.png'), // そぼろ丼（二色丼）
  gyudon: require('../../assets/meals/30-gyudon-butadon.png'), // 牛丼・豚丼
  chahan: require('../../assets/meals/31-tuna-egg-chahan.png'), // チャーハン
  nizakana: require('../../assets/meals/32-nizakana.png'), // 煮魚
  fish_teriyaki: require('../../assets/meals/33-fish-teriyaki.png'), // 魚の照り焼き
  foil_yaki: require('../../assets/meals/34-foil-yaki.png'), // ホイル焼き
  meuniere: require('../../assets/meals/35-salmon-meuniere.png'), // ムニエル
} as const;

export type MealKey = keyof typeof IMAGES;

// タイトル語の優先マッチ（上から順・先勝ち）。具体的な料理を先に判定して取り違えを防ぐ。
// 例: 「カツ丼」は 丼 を優先（揚げ物より前）、「唐揚げ定食」は揚げ物。
const TITLE_RULES: [RegExp, MealKey][] = [
  [/カレー/, 'curry'],
  [/オムライス/, 'omurice'],
  [/回鍋肉|ホイコーロー/, 'hoikoro'], // 「鍋」を含むが炒め物なので鍋判定より前に固定。専用イラストあり
  [/生姜焼き|しょうが焼き|ジンジャーポーク/, 'shogayaki'],
  // 「さわらの照り焼き」等の魚照り焼きは下の fish_teriyaki に任せる。鶏/チキンと明記された物だけここで拾う。
  [/(?=.*(鶏|チキン))(?=.*(照り焼き|てりやき))/, 'teriyaki_chicken'],
  [/ハンバーグ/, 'hamburg'],
  // ── 丼の細分化。下の汎用「丼」判定より前に置く ──
  [/親子丼|卵とじ丼/, 'oyakodon'],
  [/そぼろ丼|そぼろごはん/, 'soboro_don'],
  [/牛丼|豚丼/, 'gyudon'],
  [/チャーハン|炒飯|焼き飯/, 'chahan'], // 「炒」を含むので炒め物判定より前
  // ── 魚の細分化。下の汎用 yakizakana（魚名で拾う）より前に置く ──
  [/ホイル焼き|ホイル蒸し/, 'foil_yaki'],
  [/ムニエル/, 'meuniere'],
  [/味噌煮|みそ煮|ぶり大根|煮付け|(?=.*(さば|さけ|鮭|ぶり|たら|いわし))(?=.*煮)/, 'nizakana'],
  [/(?=.*(魚|鮭|さけ|さば|ぶり|さわら|たら|かじき|いわし|あじ))(?=.*(照り焼き|てりやき))/, 'fish_teriyaki'],
  // ── 炒め物の細分化。下の汎用「炒め」判定より前に置く ──
  [/レンジ蒸し|チンして|レンジ加熱|酒蒸し|蒸し/, 'renji_mushi'], // 「あさりの酒蒸し」が焼き魚の絵になっていたので蒸し物全般をここへ
  [/クリーム煮|クリーム/, 'cream_ni'],
  [/ミルフィーユ煮|重ね煮|豚バラ大根/, 'kasane_ni'],
  [/甘酢あん|酢豚|甘酢炒め|あんかけ/, 'ankake'],
  [/豚キムチ|キムチ炒め/, 'buta_kimchi'],
  [/パスタ|スパゲ|ナポリタン|ペペロンチーノ|カルボナーラ|ミートソース|ボロネーゼ|アラビアータ|ジェノベーゼ|ペンネ|グラタン/, 'pasta'], // 皿盛りなのでramen(丼)と別枠
  [/うどん/, 'udon'], // ラーメン(チャーシュー/味玉/メンマ入り)と見た目が違うため別枠
  [/ラーメン|そば|焼きそば|中華麺|中華そば|にゅうめん|ビーフン|フォー|麺/, 'ramen'],
  [/麻婆|マーボー|マーボ/, 'mabo'],
  [/ピラフ|ビビンバ/, 'don'], // 米もの＝丼鉢が近い（チャーハンは上で専用イラストへ）
  [/丼|どんぶり|のっけ/, 'don'],
  [/サラダ/, 'salad'],
  [/唐揚げ|から揚げ|からあげ|竜田|フライ|カツ|コロッケ|天ぷら|天丼|かき揚げ|串揚げ|素揚げ/, 'agemono'], // 厚揚げ/油揚げは除外
  [/焼き魚|塩焼き|干物|西京焼き|鮭|さけ|さば|ぶり|さんま|あじ|たら|かじき|ほっけ|さわら|いわし|かれい|ししゃも/, 'yakizakana'], // ホイル焼き/ムニエル/煮魚/照り焼きは上で専用イラストへ
  [/煮物|肉じゃが|筑前煮|含め煮|煮込み|おでん|すき焼き|角煮|肉豆腐/, 'nimono'],
  [/鍋|なべ|味噌汁|みそ汁|スープ|汁物|チゲ|豚汁|けんちん/, 'nabe'],
  [/卵焼き|だし巻き|オムレツ|茶碗蒸し|スクランブル|目玉焼き/, 'tamago'],
  [/(?=.*卵)(?=.*(炒め|チャンプルー))/, 'egg_itame'], // 卵が主役の炒め物。汎用の炒め判定より前
  [/炒め|ソテー|きんぴら|チンジャオ|チャンプルー|プルコギ/, 'itame'],
  [/トースト|サンド|パン|グラノーラ|シリアル|朝食|オートミール/, 'breakfast'],
];

// タイトルで決まらない時：使う食材/栄養フォーカスからざっくり主菜カテゴリを推定。
// ここは「近い絵」で妥協する場所なので、料理名から確実に分かる物は必ず上の TITLE_RULES で拾うこと。
// 「肉が入っていれば炒め物」に落とすと、煮物や蒸し物にまで炒め物の絵が付いてしまう（実際にそうなっていた）。
// 最後は白ごはんではなく一汁三菜の御膳にする（何の料理か分からない時は、献立らしい絵の方が無難なため）。
function categoryFallback(recipe: Recipe): MealKey {
  const nf = recipe.nutritionFocus ?? '';
  const names = recipe.usedIngredients.map((i) => i.name).join(' ');
  const hay = nf + ' ' + names;
  if (/魚|鮭|さば|ぶり|あじ|たら|ツナ|いわし|さんま|さわら|かじき|ほっけ|かれい/.test(hay)) return 'yakizakana';
  if (/豆腐|厚揚げ|高野豆腐/.test(hay)) return 'mabo';
  if (/サラダ|レタス|トマト|きゅうり|水菜/.test(hay)) return 'salad';
  if (/卵|たまご/.test(hay)) return 'tamago';
  return 'gozen';
}

export function mealImageKey(recipe: Recipe): MealKey {
  for (const [re, key] of TITLE_RULES) if (re.test(recipe.title)) return key;
  return categoryFallback(recipe);
}

// react-native の <Image source={...} /> にそのまま渡せる require の結果を返す。
export function mealImageSource(recipe: Recipe) {
  return IMAGES[mealImageKey(recipe)];
}
