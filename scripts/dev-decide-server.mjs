// 仮のAI提案＋画像抽出サーバ（ローカル開発用）。
// このPCで起動 → 同じWi-FiのiPhone(Expo Go)から本物のClaude提案/画像認識を受け取る。
// 本番は supabase/functions を使う。これはあくまで動作確認用。
//
// 使い方（PowerShell）:
//   $env:ANTHROPIC_API_KEY = "sk-ant-..."
//   node scripts/dev-decide-server.mjs
//
// エンドポイント:
//   POST /decide   … 献立提案（テキスト）
//   POST /extract  … 写真/レシートから食材抽出（Claude Vision）

import http from 'node:http';

const PORT = 8787;
const API_KEY = process.env.ANTHROPIC_API_KEY;

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

const MAT_ITEM = (withFridge) => ({
  type: 'object', additionalProperties: false,
  required: withFridge ? ['name', 'qty', 'unit', 'fromFridge'] : ['name', 'qty', 'unit'],
  properties: {
    name: { type: 'string' }, qty: { type: ['number', 'null'] }, unit: { type: ['string', 'null'] },
    ...(withFridge ? { fromFridge: { type: 'boolean' } } : {}),
  },
});
const MATERIALS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['servings', 'food', 'seasoning'],
  properties: {
    servings: { type: 'integer' },
    food: { type: 'array', items: MAT_ITEM(true) },
    seasoning: { type: 'array', items: MAT_ITEM(false) },
  },
};
const RECIPE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'reason', 'cookTimeMinutes', 'servings', 'washUp', 'childFriendly', 'childNote', 'usedIngredients', 'missingIngredients', 'materials', 'steps', 'tags', 'nutritionFocus'],
  properties: {
    title: { type: 'string' }, reason: { type: 'string' }, cookTimeMinutes: { type: 'integer' }, servings: { type: 'integer' },
    washUp: { type: 'string' }, childFriendly: { type: 'boolean' }, childNote: { type: ['string', 'null'] },
    usedIngredients: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'fromFridge'], properties: { name: { type: 'string' }, fromFridge: { type: 'boolean' } } } },
    missingIngredients: { type: 'array', items: { type: 'string' } },
    materials: MATERIALS_SCHEMA,
    steps: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } }, nutritionFocus: { type: ['string', 'null'] },
  },
};
const DECIDE_SCHEMA = { type: 'object', additionalProperties: false, required: ['recipes'], properties: { recipes: { type: 'array', items: RECIPE_SCHEMA } } };

const EXTRACT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'category', 'amount'], properties: { name: { type: 'string' }, category: { type: 'string' }, amount: { type: ['string', 'null'] } } } } },
};

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

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' };

async function callAnthropic(reqBody) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(reqBody),
  });
  return r;
}

function parseFirstJson(data) {
  const textBlock = (data.content ?? []).find((b) => b.type === 'text');
  try {
    return textBlock?.text ? JSON.parse(textBlock.text) : null;
  } catch {
    console.log('[parse] JSON failed. stop_reason=', data.stop_reason);
    return null;
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
  if (req.method !== 'POST') { res.writeHead(405, CORS); res.end('method'); return; }

  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    if (!API_KEY) { res.writeHead(500, { 'content-type': 'application/json', ...CORS }); res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' })); return; }
    const isExtract = (req.url ?? '').includes('extract');
    try {
      let input = {};
      try { input = JSON.parse(body || '{}'); } catch { /* keep {} */ }

      let reqBody;
      if (isExtract) {
        const prompt = input.mode === 'receipt' ? EXTRACT_PROMPT_RECEIPT : EXTRACT_PROMPT_FRIDGE;
        reqBody = {
          model: 'claude-haiku-4-5',
          max_tokens: 1500,
          output_config: { format: { type: 'json_schema', schema: EXTRACT_SCHEMA } },
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: input.mediaType || 'image/jpeg', data: input.image || '' } },
            { type: 'text', text: prompt },
          ] }],
        };
      } else {
        reqBody = {
          model: 'claude-haiku-4-5',
          max_tokens: 3000,
          system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          output_config: { format: { type: 'json_schema', schema: DECIDE_SCHEMA } },
          messages: [{ role: 'user', content: body || '{}' }],
        };
      }

      const r = await callAnthropic(reqBody);
      if (!r.ok) { const detail = await r.text(); res.writeHead(502, { 'content-type': 'application/json', ...CORS }); res.end(JSON.stringify({ error: 'anthropic', status: r.status, detail })); return; }
      const data = await r.json();
      const parsed = parseFirstJson(data) ?? (isExtract ? { items: [] } : { recipes: [] });
      console.log(`[${isExtract ? 'extract' : 'decide'}] ${data.model} stop=${data.stop_reason}`, data.usage);
      res.writeHead(200, { 'content-type': 'application/json', ...CORS });
      res.end(JSON.stringify(isExtract ? { items: parsed.items ?? [] } : { recipes: parsed.recipes ?? [] }));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json', ...CORS });
      res.end(JSON.stringify({ error: String(e) }));
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`dev server on http://0.0.0.0:${PORT}  /decide /extract  (API key ${API_KEY ? 'set' : 'NOT set'})`);
  // 初回の/decideが接続コールドスタートで遅い（実測~17s）。起動時に軽いGETでanthropicへの
  // TLS接続を温めておく（undiciの接続プールを再利用させる）。本番Edge Functionは別途コールド対策が要る。
  if (API_KEY) {
    fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' } })
      .then(() => console.log('[warmup] anthropic接続を温めました'))
      .catch(() => {});
  }
});
