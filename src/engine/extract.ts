// 写真/レシートから食材を抽出（Claude Vision・バックエンド経由）。
// EXPO_PUBLIC_DECIDE_URL の /decide を /extract に置換して使う。
const DECIDE_URL = process.env.EXPO_PUBLIC_DECIDE_URL;
const EXTRACT_URL = DECIDE_URL ? DECIDE_URL.replace(/\/decide$/, '/extract') : undefined;

export interface ExtractedItem {
  name: string;
  category: string;
  amount?: string | null; // レシート/写真から読めた数量（例: "10個","5kg"）。読めなければ null
}

export function extractAvailable(): boolean {
  return !!EXTRACT_URL;
}

export async function extractFromImage(
  base64: string,
  mediaType: string,
  mode: 'fridge' | 'receipt'
): Promise<ExtractedItem[]> {
  if (!EXTRACT_URL) throw new Error('EXTRACT_URL not set');
  const res = await fetch(EXTRACT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: base64, mediaType, mode }),
  });
  if (!res.ok) throw new Error(`extract http ${res.status}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.items)) throw new Error('bad shape');
  return data.items as ExtractedItem[];
}
