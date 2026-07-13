-- 今日飯：人気レシピ集計用の匿名イベントログ。
-- 健康情報は保存しない（レシピ名・source・疲労度・カテゴリ・端末匿名IDのみ）。
-- 適用: supabase db push  もしくは SQL Editor で実行。

create table if not exists public.recipe_picks (
  id           bigint generated always as identity primary key,
  recipe_id    text,
  recipe_title text not null,
  source       text check (source in ('ai','fallback')),
  fatigue      text,
  categories   text[] not null default '{}',
  anon_id      text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_recipe_picks_title   on public.recipe_picks (recipe_title);
create index if not exists idx_recipe_picks_created  on public.recipe_picks (created_at);

-- RLS有効化。挿入は log-pick Edge Function が service role で行う（RLSバイパス）。
-- anon/authenticated には一切ポリシーを与えない＝直接の読み書き不可（集計はSQL/service roleで）。
alter table public.recipe_picks enable row level security;

-- 集計ビュー例（人気順）。SQL Editorやダッシュボードから参照。
create or replace view public.recipe_pick_counts as
  select recipe_title,
         count(*)                              as picks,
         count(*) filter (where source = 'ai') as ai_picks,
         count(*) filter (where source = 'fallback') as fallback_picks,
         max(created_at)                        as last_picked
  from public.recipe_picks
  group by recipe_title
  order by picks desc;
