import type { Materials, MaterialItem } from '../types';

// 必要な材料を選んだ人数に合わせて出す。
//  - 食材(food): 人数比で素直にスケール（2人分→3人なら1.5倍）。
//  - 調味料(seasoning): そのまま1.5倍だと濃すぎるので「控えめ係数」で薄まり防止。
//    f_season = 1 + (f_food - 1) * 0.6（例: 食材1.5倍→調味料1.3倍）。
const SEASON_DAMP = 0.6;

export interface ScaledLine {
  name: string;
  amount: string; // 表示用（例 "豚こま 225g" の "225g" 部分）
  fromFridge?: boolean;
}
export interface ScaledMaterials {
  servings: number;
  food: ScaledLine[];
  seasoning: ScaledLine[];
}

// 分数で見せたい単位（個・本など）。g/ml/大さじ等は数値そのまま。
const FRACTION_UNITS = new Set(['個', '本', '枚', '缶', '丁', '玉', '束', 'パック', '尾', '片', '株', '袋', '房', '節']);
const SPOON_UNITS = new Set(['大さじ', '小さじ']);
const WEIGHT_UNITS = new Set(['g', 'ml', 'cc', 'ｇ', 'ｍｌ']);

function fracStr(x: number): string {
  const whole = Math.floor(x + 1e-9);
  const frac = x - whole;
  let f = '';
  if (frac >= 0.875) return String(whole + 1);
  if (frac >= 0.625) f = '3/4';
  else if (frac >= 0.375) f = '1/2';
  else if (frac >= 0.125) f = '1/4';
  if (!f) return String(whole);
  return whole > 0 ? `${whole}と${f}` : f;
}

function roundTo(x: number, step: number): number {
  return Math.round(x / step) * step;
}

function fmt(item: MaterialItem, factor: number): string {
  // 数値化できない物（少々/適量）はそのまま
  if (item.qty == null) return item.unit ?? '適量';
  const unit = item.unit ?? '';
  let v = item.qty * factor;

  if (WEIGHT_UNITS.has(unit)) {
    v = v < 30 ? roundTo(v, 5) : roundTo(v, 10);
    return `${Math.max(v, 5)}${unit}`;
  }
  if (SPOON_UNITS.has(unit)) {
    v = roundTo(v, 0.5);
    if (v < 0.5) v = 0.5;
    const txt = Number.isInteger(v) ? String(v) : String(v); // 0.5→"0.5", 1.5→"1.5"
    return `${unit}${txt}`;
  }
  if (FRACTION_UNITS.has(unit)) {
    v = v < 1 ? roundTo(v, 0.25) : roundTo(v, 0.5);
    if (v <= 0) v = unit === '個' || unit === '本' ? 0.25 : 0.5;
    return `${fracStr(v)}${unit}`;
  }
  // その他の単位：小数1桁まで
  const r = Math.round(v * 10) / 10;
  return `${Number.isInteger(r) ? r : r}${unit}`;
}

export function scaleMaterials(materials: Materials, headcount: number): ScaledMaterials {
  const base = materials.servings || 2;
  const fFood = Math.max(headcount, 1) / base;
  const fSeason = 1 + (fFood - 1) * SEASON_DAMP;
  return {
    servings: Math.max(headcount, 1),
    food: materials.food.map((i) => ({ name: i.name, amount: fmt(i, fFood), fromFridge: i.fromFridge })),
    seasoning: materials.seasoning.map((i) => ({ name: i.name, amount: fmt(i, fSeason) })),
  };
}
