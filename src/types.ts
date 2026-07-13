// 提案結果（AI出力＝フォールバックと同一スキーマ。設計書 §8）
export interface UsedIngredient {
  name: string;
  fromFridge: boolean;
}

// 必要な材料（量つき）。食材(food)と調味料(seasoning)を分けて表示・人数スケールする。
export interface MaterialItem {
  name: string;
  qty: number | null; // 数値。少々/適量など数値化できない物は null
  unit: string | null; // "g" "本" "大さじ" "小さじ" "個" 等。qtyがnullなら表示テキスト("少々")を入れる
  fromFridge?: boolean; // 食材のみ：在庫にある想定か
}
export interface Materials {
  servings: number; // この分量が何人分か（基準。fallbackは2、AIはheadcount）
  food: MaterialItem[];
  seasoning: MaterialItem[];
}

export interface Recipe {
  title: string;
  reason: string;
  cookTimeMinutes: number;
  servings?: number;
  washUp: string;
  childFriendly: boolean;
  childNote?: string | null;
  usedIngredients: UsedIngredient[];
  missingIngredients: string[];
  materials?: Materials; // 量つき材料（食材/調味料別）。未設定時は usedIngredients から表示にフォールバック
  steps: string[];
  tags: string[];
  nutritionFocus?: string | null;
}

export interface SafetyFlags {
  rawEgg: boolean;
  rawFish: boolean;
  honey: boolean;
  choking: boolean;
  spicy: boolean;
}

export interface FallbackSelect {
  fatigueOk: string[];
  categories: string[];
  pantryStaple: boolean;
  soloOnly?: boolean; // 1人前向け＝家族（2人以上）では出さない
  allergens: string[];
  safety: SafetyFlags;
}

export interface FallbackEntry {
  id: string;
  select: FallbackSelect;
  recipe: Recipe;
}

// 冷蔵庫の食材（設計書 §6）
export type Amount = 'enough' | 'low' | 'empty';
// 残量管理つきの食材（卵=個数 / 米=kg）。unitがある食材だけ残量UIを出す。
export type QtyUnit = 'count' | 'kg';
export interface Ingredient {
  id: string;
  name: string;
  amount: Amount;
  expiry?: string | null;
  unit?: QtyUnit; // 残量管理する食材のみ
  qty?: number; // 残り（個数 or kg）
  qtyMax?: number; // 満タン（10個 / 5kg 等）100%判定用
}

// 食べる人（設計書 §7）
export type Condition = '妊娠中' | '授乳中';

export interface AllergyEntry {
  type: 'item' | 'group' | 'free';
  value: string;
}

export interface Member {
  id: string;
  label: string;
  kind: 'adult' | 'child';
  childAge?: number;
  conditions: Condition[];
  allergies: AllergyEntry[];
}

// 食育履歴（設計書 §6・§8.5）
export interface MealHistory {
  id: string;
  title: string;
  dinnerDate: string; // YYYY-MM-DD（翌朝5時境界）
  cookedAt: number; // epoch ms
  categories: string[]; // メニュー単位ユニークのカテゴリ（スナップショット）
  fatigueAtCook?: string;
}

// 合成済みの安全条件（most restrictive wins）
export interface SafetyProfile {
  allergens: string[]; // 28品目（group.expandAllergens も合流）
  groups: string[]; // 甲殻類 / ナッツ / 魚 / 果物
  freeCanonicals: string[]; // 自由入力 → 辞書canonicalに解決できたもの
  freeTerms: string[]; // 解決できなかった生テキスト（部分一致用）
  noRawEgg: boolean;
  noRawFish: boolean;
  noRawMeat: boolean;
  noHoney: boolean;
  noHighMercuryFish: boolean;
  noUnpasteurized: boolean;
  noAlcohol: boolean;
  chokingCut: boolean;
  hasChild: boolean;
  hasPregnant: boolean;
  hasInfant: boolean;
}
