// 今日飯 提案バックエンド（Supabase Edge Function / Deno）
// ANTHROPIC_API_KEY はサーバ側シークレットにのみ置く（クライアントに出さない）。
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy decide
//
// モデル: claude-haiku-4-5（この用途に十分・最安）
// 構造化出力（output_config.format）でJSON型を保証 / 思考なし（即決・低レイテンシ）
// プロンプトキャッシュ: system に cache_control。※Haiku 4.5 はプレフィックス約4096トークン
//   以上でのみキャッシュされる。本システムプロンプトは短いので、効かせたい場合は
//   few-shot例や詳細ルールを system に足してプレフィックスを伸ばすこと（設計書 §8/§10）。

const SYSTEM_PROMPT = `あなたは「今日飯」という夕飯の意思決定を代行するアプリのエンジンです。
これはレシピアプリではありません。疲れて帰宅した共働き子育て世帯に代わって
「今日はこれを作ればいい」を即決します。

優先順位: 1.安全（絶対） 2.制約（疲労度/タグ/人数/在庫） 3.好み・栄養

【安全（絶対に違反しない）】
- safetyProfile.allergens の食材・それを含む調味料/加工品は一切使わない。
- safetyProfile.groups（甲殻類/ナッツ/魚/果物）の該当食材も使わない。
- noRawEgg=生卵不可/noRawFish=生魚不可/noRawMeat=生肉不可/noHoney=はちみつ不可。
- noHighMercuryFish=まぐろ等大型魚を避ける（鮭・さば・ツナ缶は可）。noUnpasteurized=非加熱チーズ等不可。
- chokingCut=ウインナー/ミニトマト等は小さく切る指示を入れる。
- 安全に作れない時は買い足し前提の安全な定番を返す（missingIngredientsに不足分）。

【制約】
- fatigueで工程数と調理時間（厳守）: 限界→stepsは3つ以内かつcookTimeMinutesは15分以内、疲れた→stepsは3つ以内かつcookTimeMinutesは20分以内（どちらも包丁/洗い物/火加減を最小化）、普通/元気→stepsは4つ以内できちんと作る。
- 元気/普通は「冷凍食品やレンジで温めるだけ」「市販総菜を出すだけ」の手抜きを避け、きちんと作る料理にする（冷凍・温めるだけ系は限界/疲れた向け）。
- suggestionCount 件を返す。互いに重複させず、先頭を最もおすすめに（限界/疲れたは必ず1件）。
- headcountの人数ぶん作れる、家庭の夕飯として十分な料理にする。
- cuttingBoardの食材があれば最優先で使い切る。fridgeEmptyでも必ず返す。
- 在庫に無い食材は勝手にあると仮定せず missingIngredients に入れる。usedIngredients.fromFridge は在庫(fridge)にある食材だけ true、買い足す物は false。
- 塩・砂糖・こしょう・油・醤油・みりん・酒・酢・だし・小麦粉・片栗粉は常備調味料として常にある前提。missingIngredientsには入れない。
- eatersTonightにchildがいれば取り分け・辛さ・固さに配慮しchildNoteに書く。
- directionTagsの意図を反映。avoidTitlesは提案しない。

【工程と材料（重要）】
- steps には分量を書かない。切り方と大きさ（例:にんじんは5mm厚のいちょう切り）・火加減と時間（例:中火で7分煮る）に専念し、usedIngredientsを全て使い料理が完成するまで一貫して書く。
- 分量は materials に集約する。materials.food（肉/魚/野菜/卵/豆腐/主食等）と materials.seasoning（調味料・油・だし・バター等）を分ける。
- materials.servings は headcount の人数を入れ、その人数分の分量にする。調味料は人数比そのままだと濃くなるので控えめに調整する。
- 各 qty は数値、unit は g/ml/個/本/枚/大さじ/小さじ 等。「少々」「適量」は qty=null・unit にその語を入れる。food の fromFridge は在庫(fridge)にある物だけ true。
- servings（レシピ全体）にも headcount の人数を入れる。

【好み・栄養】nutritionDeficitsがあれば無理のない範囲で優先。

【出力】
- reasonは自然な日本語1文。良い要素まで減らす表現にしない（×「栄養バランスも洗い物も最小限」 ○「栄養バランスがよく、洗い物も最小限です」）。
- 指定JSONスキーマに厳密に従い、前置きを付けない。出力前に「安全」「工程の一貫性」を自己確認する。`;

const matItem = (withFridge: boolean) => ({
  type: 'object',
  additionalProperties: false,
  required: withFridge ? ['name', 'qty', 'unit', 'fromFridge'] : ['name', 'qty', 'unit'],
  properties: {
    name: { type: 'string' },
    qty: { type: ['number', 'null'] },
    unit: { type: ['string', 'null'] },
    ...(withFridge ? { fromFridge: { type: 'boolean' } } : {}),
  },
});
const MATERIALS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['servings', 'food', 'seasoning'],
  properties: {
    servings: { type: 'integer' },
    food: { type: 'array', items: matItem(true) },
    seasoning: { type: 'array', items: matItem(false) },
  },
};
const RECIPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'reason',
    'cookTimeMinutes',
    'servings',
    'washUp',
    'childFriendly',
    'childNote',
    'usedIngredients',
    'missingIngredients',
    'materials',
    'steps',
    'tags',
    'nutritionFocus',
  ],
  properties: {
    title: { type: 'string' },
    reason: { type: 'string' },
    cookTimeMinutes: { type: 'integer' },
    servings: { type: 'integer' },
    washUp: { type: 'string' },
    childFriendly: { type: 'boolean' },
    childNote: { type: ['string', 'null'] },
    usedIngredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'fromFridge'],
        properties: { name: { type: 'string' }, fromFridge: { type: 'boolean' } },
      },
    },
    missingIngredients: { type: 'array', items: { type: 'string' } },
    materials: MATERIALS_SCHEMA,
    steps: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } },
    nutritionFocus: { type: ['string', 'null'] },
  },
};

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['recipes'],
  properties: { recipes: { type: 'array', items: RECIPE_SCHEMA } },
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

  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }

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
        max_tokens: 3000,
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        ],
        output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
        messages: [{ role: 'user', content: JSON.stringify(input) }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return json({ error: 'anthropic', status: res.status, detail }, 502);
    }

    const data = await res.json();
    const textBlock = (data.content ?? []).find((b: { type: string }) => b.type === 'text');
    // パース失敗時は 200 + 空配列。クライアントは内蔵フォールバック献立に切り替える。
    let parsed: { recipes?: unknown[] } = {};
    try {
      if (textBlock?.text) parsed = JSON.parse(textBlock.text);
    } catch {
      parsed = {};
    }
    return json({ recipes: parsed.recipes ?? [], model: data.model, usage: data.usage });
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
