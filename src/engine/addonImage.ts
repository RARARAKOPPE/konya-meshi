import type { Recipe } from '../types';

// 小鉢・汁椀のイラスト38点（透過1024×1024）。全点、実装前に目視確認済み。
// メイン料理と違い「近いけど別料理」の絵を無理に当てはめると誤解を招くため、
// タイトルが明確に一致する物だけ画像を出し、該当なしは undefined（呼び出し側はテキストのみ表示）。
const ADDON_IMAGES = {
  // ── 小鉢 ──
  kb_greens_ohitashi: require('../../assets/addons/kb-greens-ohitashi.png'), // 青菜のおひたし
  kb_hiyayakko: require('../../assets/addons/kb-hiyayakko.png'), // 冷奴
  kb_tamagoyaki: require('../../assets/addons/kb-tamagoyaki-only.png'), // だし巻き卵（元絵からトリミングして分離）
  kb_ninjin_shirishiri: require('../../assets/addons/kb-ninjin-shirishiri-only.png'), // にんじんしりしり（元絵からトリミングして分離）
  kb_root_vegetable: require('../../assets/addons/kb-root-vegetable.png'), // きんぴら・根菜の煮物
  kb_chikuwa_mozuku: require('../../assets/addons/kb-chikuwa-mozuku.png'), // ちくわ／もずく酢
  kb_tomato_salad: require('../../assets/addons/kb-tomato-salad.png'), // トマトサラダ
  kb_salted_cucumber: require('../../assets/addons/kb-salted-cucumber.png'), // きゅうりの塩もみ
  kb_natto: require('../../assets/addons/kb-natto.png'), // 納豆
  kb_potato_salad: require('../../assets/addons/kb-potato-salad.png'), // ポテトサラダ
  kb_corn_butter: require('../../assets/addons/kb-corn-butter.png'), // コーンバター
  kb_fried_egg: require('../../assets/addons/kb-fried-egg.png'), // 目玉焼き
  kb_nasu_nibitashi: require('../../assets/addons/kb-nasu-nibitashi.png'), // なすの煮浸し
  kb_caprese: require('../../assets/addons/kb-caprese.png'), // カプレーゼ
  kb_gomaae: require('../../assets/addons/kb-gomaae.png'), // 青菜のごま和え（オクラ・いんげん）
  kb_namul: require('../../assets/addons/kb-namul.png'), // ナムル（もやし・きゅうり・わかめ）
  kb_mayo_salad: require('../../assets/addons/kb-mayo-salad.png'), // マヨ和えサラダ（汎用）
  kb_greens_stirfry: require('../../assets/addons/kb-greens-stirfry.png'), // 青菜と具の炒め物
  kb_pumpkin_butter: require('../../assets/addons/kb-pumpkin-butter.png'), // かぼちゃの塩バター
  kb_paprika_marinade: require('../../assets/addons/kb-paprika-marinade.png'), // パプリカの甘酢マリネ
  kb_avocado_tomato: require('../../assets/addons/kb-avocado-tomato.png'), // アボカドとトマトのポン酢和え
  kb_atsuage_negi: require('../../assets/addons/kb-atsuage-negi.png'), // 厚揚げのねぎポン酢
  kb_yam_nori: require('../../assets/addons/kb-yam-nori.png'), // やまいもの海苔和え
  kb_satsuma_lemon: require('../../assets/addons/kb-satsuma-lemon.png'), // さつまいものレモン煮
  kb_zucchini_cheese: require('../../assets/addons/kb-zucchini-cheese.png'), // ズッキーニのチーズ焼き
  kb_tomato_egg: require('../../assets/addons/kb-tomato-egg.png'), // トマトの炒り卵
  kb_greenpeas_butter: require('../../assets/addons/kb-greenpeas-butter.png'), // グリーンピースのバター煮
  kb_edamame_cheese: require('../../assets/addons/kb-edamame-cheese.png'), // 枝豆とチーズの和え物
  kb_tofu_kimchi: require('../../assets/addons/kb-tofu-kimchi.png'), // 豆腐のキムチ和え
  // ── 汁椀 ──
  sp_miso: require('../../assets/addons/sp-miso.png'), // 味噌汁
  sp_chinese_egg: require('../../assets/addons/sp-chinese-egg.png'), // 中華卵・春雨スープ
  sp_tonjiru_kenchinjiru: require('../../assets/addons/sp-tonjiru-kenchinjiru.png'), // 豚汁・けんちん汁
  sp_western: require('../../assets/addons/sp-western.png'), // 洋風スープ（コーン・コンソメ）
  sp_spicy: require('../../assets/addons/sp-spicy.png'), // ピリ辛スープ
  sp_pumpkin_potage: require('../../assets/addons/sp-pumpkin-potage.png'), // かぼちゃのポタージュ
  sp_clear: require('../../assets/addons/sp-clear.png'), // すまし汁（黒漆椀・澄んだだし）
  sp_milk: require('../../assets/addons/sp-milk.png'), // ミルク／豆乳スープ
  sp_veg_bacon: require('../../assets/addons/sp-veg-bacon.png'), // 野菜とベーコンの洋風スープ
} as const;

export type AddonImageKey = keyof typeof ADDON_IMAGES;

// 小鉢用と汁椀用でルールを分ける。混在させると「豆腐のキムチ和え」(小鉢)が
// /ピリ辛|キムチ/ に当たって汁椀のスープ画像を表示してしまう（実際に起きたバグ）。
// 判定は tags（小鉢=「副菜」/ 汁椀=「汁物」必須）で行い、check-recipes.mjs がその存在を保証している。
const KOBACHI_RULES: [RegExp, AddonImageKey][] = [
  [/おひたし/, 'kb_greens_ohitashi'],
  [/冷奴/, 'kb_hiyayakko'],
  [/だし巻き/, 'kb_tamagoyaki'],
  [/にんじんしりしり/, 'kb_ninjin_shirishiri'],
  [/きんぴら|ひじきの煮物|れんこんの甘辛炒め|含め煮/, 'kb_root_vegetable'], // 根菜の炒め／煮物は同じ絵で通じる
  [/ちくわ|もずく酢/, 'kb_chikuwa_mozuku'],
  [/トマトサラダ/, 'kb_tomato_salad'],
  [/塩もみ/, 'kb_salted_cucumber'],
  [/納豆/, 'kb_natto'],
  [/ポテトサラダ/, 'kb_potato_salad'],
  [/コーンバター/, 'kb_corn_butter'],
  [/目玉焼き/, 'kb_fried_egg'],
  [/なすの煮浸し/, 'kb_nasu_nibitashi'],
  [/カプレーゼ/, 'kb_caprese'],
  [/豆腐のキムチ和え/, 'kb_tofu_kimchi'], // 汁椀の sp_spicy に流れないよう小鉢側で明示
  [/枝豆とチーズ/, 'kb_edamame_cheese'],
  [/ごま和え/, 'kb_gomaae'],
  [/ナムル/, 'kb_namul'],
  [/マヨ和え|マヨサラダ|ツナサラダ/, 'kb_mayo_salad'],
  [/小松菜としらす|チンゲン菜のオイスター|アスパラのベーコン/, 'kb_greens_stirfry'], // 「炒め」全般に広げると別料理を巻き込むため個別指定
  [/かぼちゃの塩バター/, 'kb_pumpkin_butter'],
  [/パプリカの甘酢マリネ/, 'kb_paprika_marinade'],
  [/アボカドとトマト/, 'kb_avocado_tomato'], // 「ポン酢」で拾うと厚揚げのねぎポン酢と衝突する
  [/厚揚げのねぎポン酢/, 'kb_atsuage_negi'],
  [/やまいもの海苔和え/, 'kb_yam_nori'],
  [/さつまいものレモン煮/, 'kb_satsuma_lemon'],
  [/ズッキーニのチーズ焼き/, 'kb_zucchini_cheese'],
  [/トマトの炒り卵/, 'kb_tomato_egg'],
  [/グリーンピースのバター煮/, 'kb_greenpeas_butter'],
];

const SOUP_RULES: [RegExp, AddonImageKey][] = [
  [/すまし汁/, 'sp_clear'],
  [/かぼちゃのポタージュ/, 'sp_pumpkin_potage'], // 汎用ポタージュ判定より前に固定
  [/ミルクスープ|豆乳スープ/, 'sp_milk'], // ベーコン判定より前（キャベツとベーコンのミルクスープ対策）
  [/ピリ辛|キムチ/, 'sp_spicy'],
  [/豚汁|けんちん汁/, 'sp_tonjiru_kenchinjiru'],
  [/味噌汁|みそ汁/, 'sp_miso'],
  [/中華|春雨スープ/, 'sp_chinese_egg'],
  [/コーンスープ|ポタージュ|コンソメ/, 'sp_western'],
  [/ベーコン|きのこ|ズッキーニとトマト/, 'sp_veg_bacon'],
];

export function addonImageKey(recipe: Recipe): AddonImageKey | null {
  const rules = recipe.tags.includes('汁物') ? SOUP_RULES : KOBACHI_RULES;
  for (const [re, key] of rules) if (re.test(recipe.title)) return key;
  return null;
}

// マッチする絵がない時は undefined（<Image>を出さずテキストのみ表示する想定）。
export function addonImageSource(recipe: Recipe) {
  const key = addonImageKey(recipe);
  return key ? ADDON_IMAGES[key] : undefined;
}
