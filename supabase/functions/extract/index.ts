// 今日飯 画像抽出バックエンド（Supabase Edge Function / Deno）
// 冷蔵庫/レシートの写真から食材を抽出する（Claude Vision）。
// クライアントは EXPO_PUBLIC_DECIDE_URL の末尾 /decide を /extract に置換して呼ぶ。
//   本番URL例: https://<project>.supabase.co/functions/v1/extract
//
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   （decideと共有）
//   supabase functions deploy extract
//
// 入力(JSON): { image: base64文字列, mediaType: "image/jpeg"等, mode: "fridge"|"receipt" }
// 出力(JSON): { items: [{ name, category }] }
// 健康データ（アレルギー/妊娠）は送らない。画像は推論のみで保存しない。

const EXTRACT_PROMPT_FRIDGE = `冷蔵庫の中身の写真です。写っている食材を日本語の一般的な名前で列挙してください。
- 食材以外（容器・調味料ボトル・飲料・ラップ等）は除外。
- 同じ物は1つにまとめる。商品名は一般食材名に（例: 国産豚こま切れ肉→豚こま）。
- 卵パックの個数や米袋のkgが明確に読めれば amount に（例:「10個」「5kg」）。不明なら null。
- category は 肉/魚/卵/大豆/野菜/菌類/主食/乳/調味料/その他 から選ぶ（きのこ類は 菌類、果物・果汁は その他）。
- 確実に判別できる物だけ。曖昧な物は無理に入れない。`;

const EXTRACT_PROMPT_RECEIPT = `スーパーのレシートの写真です。買った「食材」だけを抽出してください。
- 商品名は一般的な食材名に正規化する。ブランド名・店名・産地・キャンペーン語・「朝」等の冠詞・規格(g/個/パック)を全て落とし、素材名だけにする（例:「サンゴールドキウイ」→「キウイ」、「スターセレクトバナナ」→「バナナ」、「国産豚こま切れ肉300g」→「豚こま」、「はもんみなかみ薄切」→「生ハム」）。
- 次は食材でないので必ず除外: 医薬品(のど飴・サプリ等)・菓子・デザート(プリン/ゼリー等)・飲料・酒・レジ袋・日用品・割引/合計/ポイント行。
- 惣菜は中心の食材名にする。判別できない惣菜・略語で素材が特定できない行は、推測ででっち上げず除外する（曖昧なら入れない）。
- 数量や規格が読めれば amount に入れる（例: 米→「5kg」、卵→「10個」）。読めなければ null。卵・米は特に数量を拾う。
- category は 肉/魚/卵/大豆/野菜/菌類/主食/乳/調味料/その他 から選ぶ（きのこ類は 菌類、果物・果汁は その他）。`;

const EXTRACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'category', 'amount'],
        properties: { name: { type: 'string' }, category: { type: 'string' }, amount: { type: ['string', 'null'] } },
      },
    },
  },
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
};

// @ts-ignore Deno はEdge Functionランタイムで提供される
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  // @ts-ignore
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'no api key' }, 500);

  let input: { image?: string; mediaType?: string; mode?: string };
  try {
    input = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  if (!input.image) return json({ error: 'no image' }, 400);

  const prompt = input.mode === 'receipt' ? EXTRACT_PROMPT_RECEIPT : EXTRACT_PROMPT_FRIDGE;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1500,
        output_config: { format: { type: 'json_schema', schema: EXTRACT_SCHEMA } },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: input.mediaType || 'image/jpeg', data: input.image } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return json({ error: 'anthropic', status: res.status, detail }, 502);
    }

    const data = await res.json();
    const textBlock = (data.content ?? []).find((b: { type: string }) => b.type === 'text');
    // パース失敗時は 200 + 空配列。クライアントは手入力にフォールバックできる。
    let parsed: { items?: unknown[] } = {};
    try {
      if (textBlock?.text) parsed = JSON.parse(textBlock.text);
    } catch {
      parsed = {};
    }
    return json({ items: parsed.items ?? [], model: data.model, usage: data.usage });
  } catch (e) {
    return json({ error: 'exception', detail: String(e) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}
