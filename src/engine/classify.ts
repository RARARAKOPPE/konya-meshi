import dict from '../data/ingredientDict.json';

export type Category = '肉' | '魚' | '卵' | '大豆' | '野菜' | '菌類' | '主食' | '乳' | '調味料' | 'その他';

interface DictEntry {
  canonical: string;
  aliases: string[];
  category: string;
  allergens: string[];
  ambiguous?: boolean;
  maybeAllergens?: string[];
  assumed?: boolean;
}

export interface AllergenGroupDef {
  label: string;
  matchCanonicals?: string[];
  matchCategories?: string[];
  excludeCanonicals?: string[];
  expandAllergens?: string[];
}

const D = dict as unknown as {
  normalizeStrip: string[];
  stripUnitsRegex: string;
  allergenGroups: Record<string, AllergenGroupDef>;
  ingredients: DictEntry[];
};

export const allergenGroups = D.allergenGroups;

const STRIP = D.normalizeStrip ?? [];
let UNIT_RE: RegExp | null = null;
try {
  UNIT_RE = new RegExp(D.stripUnitsRegex, 'g');
} catch {
  UNIT_RE = null;
}

export function normalize(raw: string): string {
  let s = raw ?? '';
  // Hermes は normalize 未対応のことがあるためガード
  if (typeof (s as any).normalize === 'function') {
    try {
      s = s.normalize('NFKC');
    } catch {
      /* noop */
    }
  }
  s = s.replace(/\s/g, '');
  if (UNIT_RE) s = s.replace(UNIT_RE, '');
  for (const t of STRIP) s = s.split(t).join('');
  return s;
}

interface IndexKey {
  key: string;
  entry: DictEntry;
}

const INDEX: IndexKey[] = (() => {
  const keys: IndexKey[] = [];
  for (const e of D.ingredients) {
    for (const k of [e.canonical, ...e.aliases]) keys.push({ key: k, entry: e });
  }
  // 長いキー優先（「豚こま」を「豚」より先に当てる）
  keys.sort((a, b) => b.key.length - a.key.length);
  return keys;
})();

export interface ClassifyResult {
  canonical: string | null;
  category: Category;
  allergens: string[];
  matched: boolean;
  ambiguous: boolean;
  maybeAllergens: string[];
  assumed: boolean;
}

function hit(e: DictEntry): ClassifyResult {
  return {
    canonical: e.canonical,
    category: e.category as Category,
    allergens: e.allergens ?? [],
    matched: true,
    ambiguous: !!e.ambiguous,
    maybeAllergens: e.maybeAllergens ?? [],
    assumed: !!e.assumed,
  };
}

// 部分一致を許す1文字キー（誤爆しない物だけ）。「卵」は彩食卵/温泉卵等で安全。
// 「乳」は豆乳・乳酸菌で誤爆するため入れない。INDEXは長い順なので卵豆腐は先に豆腐へ当たる。
const SUBSTR_SINGLE_OK = new Set(['卵']);

// 鮮度ワード(生/冷凍等)を消さない軽い正規化。NFKC＋空白除去のみ。
// 「生ハム」「生クリーム」を「ハム」「クリーム」に潰さないため、これを先に照合する。
export function normalizeLight(raw: string): string {
  let s = raw ?? '';
  if (typeof (s as any).normalize === 'function') {
    try {
      s = s.normalize('NFKC');
    } catch {
      /* noop */
    }
  }
  return s.replace(/\s/g, '');
}

function matchExact(s: string): DictEntry | null {
  for (const { key, entry } of INDEX) if (s === key) return entry;
  return null;
}
function matchSub(s: string): DictEntry | null {
  for (const { key, entry } of INDEX) {
    if ((key.length >= 2 || SUBSTR_SINGLE_OK.has(key)) && s.includes(key)) return entry;
  }
  return null;
}

export function classify(raw: string): ClassifyResult {
  const light = normalizeLight(raw); // 生ハム等を保持
  const heavy = normalize(raw); // 生鮭→鮭 等の鮮度ワード除去版
  // 素のまま完全一致 → 除去版完全一致 → 素のまま部分一致 → 除去版部分一致 の順。
  // これで「生ハム」は生ハムに、「生鮭」は鮭に正しく寄る。
  const e = matchExact(light) ?? matchExact(heavy) ?? matchSub(light) ?? matchSub(heavy);
  return e
    ? hit(e)
    : { canonical: null, category: 'その他', allergens: [], matched: false, ambiguous: false, maybeAllergens: [], assumed: false };
}
