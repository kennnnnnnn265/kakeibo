-- KAKEIBO（家計簿）用のテーブル
-- 「うちの買い物」と同じ Supabase プロジェクトの SQL Editor に貼り付けて Run してください。
-- 何度実行しても大丈夫です（すでにあるものはそのまま）。
-- どの行も「ログインしている本人」しか読み書きできません。

create table if not exists public.kakeibo_settings (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.kakeibo_months (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month      text not null,               -- 例: 2026-10
  data       jsonb not null,              -- 収入・口座残高・メモ
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

create table if not exists public.kakeibo_expenses (
  id         text primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date       text not null,               -- 例: 2026-10-31
  category   text not null,
  amount     integer not null check (amount >= 0),
  memo       text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists kakeibo_expenses_user_date on public.kakeibo_expenses (user_id, date);

alter table public.kakeibo_settings enable row level security;
alter table public.kakeibo_months   enable row level security;
alter table public.kakeibo_expenses enable row level security;

drop policy if exists "own rows" on public.kakeibo_settings;
drop policy if exists "own rows" on public.kakeibo_months;
drop policy if exists "own rows" on public.kakeibo_expenses;
create policy "own rows" on public.kakeibo_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.kakeibo_months for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.kakeibo_expenses for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.kakeibo_settings, public.kakeibo_months, public.kakeibo_expenses to authenticated;
revoke all on public.kakeibo_settings, public.kakeibo_months, public.kakeibo_expenses from anon;
