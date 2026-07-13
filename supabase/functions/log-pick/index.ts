// 今日飯 人気レシピ集計ログ（Supabase Edge Function / Deno）
// クライアントは EXPO_PUBLIC_DECIDE_URL の末尾 /decide を /log-pick に置換して呼ぶ。
//
//   supabase secrets set SUPABASE_URL=https://<project>.supabase.co
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
//   supabase functions deploy log-pick
//   （テーブルは supabase/migrations/0001_recipe_picks.sql を適用）
//
// 受け取るのは匿名の選択イベントのみ。健康情報（アレルギー/妊娠/家族構成/氏名）は受け取らない。
// service role で insert（RLSはバイパス）。anon からの直接読み取りは不可。

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
};

interface PickBody {
  recipeId?: string;
  recipeTitle?: string;
  source?: string;
  fatigue?: string;
  categories?: string[];
  anonId?: string;
}

// @ts-ignore Deno はEdge Functionランタイムで提供される
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  // @ts-ignore
  const url = Deno.env.get('SUPABASE_URL');
  // @ts-ignore
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ error: 'no supabase config' }, 500);

  let b: PickBody;
  try {
    b = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  if (!b.recipeTitle) return json({ error: 'no recipeTitle' }, 400);

  try {
    const res = await fetch(`${url}/rest/v1/recipe_picks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: key,
        authorization: `Bearer ${key}`,
        prefer: 'return=minimal',
      },
      body: JSON.stringify({
        recipe_id: b.recipeId ?? null,
        recipe_title: b.recipeTitle,
        source: b.source ?? null,
        fatigue: b.fatigue ?? null,
        categories: Array.isArray(b.categories) ? b.categories : [],
        anon_id: b.anonId ?? null,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return json({ error: 'insert', status: res.status, detail }, 502);
    }
    return new Response(null, { status: 204, headers: CORS });
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
