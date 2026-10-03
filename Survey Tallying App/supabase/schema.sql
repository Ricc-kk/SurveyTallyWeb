-- Tallyform — Supabase schema
-- Run this once in Supabase Dashboard → SQL Editor.
-- Safe to re-run: every statement is guarded or drops before it creates.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- A survey definition. Questions live in `questions` as JSONB because they are
-- always read and written together with the survey, and change rarely.
create table if not exists public.surveys (
  id               uuid primary key default gen_random_uuid(),
  title            text        not null,
  description      text        not null default '',
  identifier_label text        not null default 'Form number',
  status           text        not null default 'draft'
                     check (status in ('draft', 'active')),
  questions        jsonb       not null default '[]'::jsonb,
  auto_advance     boolean     not null default true,
  auto_save        boolean     not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- One committed respondent. These are real rows rather than a JSONB blob on the
-- survey, because adding a tally is the hot path and should stay a single INSERT
-- no matter how many responses a survey accumulates.
create table if not exists public.responses (
  id         uuid primary key default gen_random_uuid(),
  survey_id  uuid        not null references public.surveys (id) on delete cascade,
  identifier text        not null default '',
  answers    jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists responses_survey_id_idx on public.responses (survey_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists surveys_touch_updated_at on public.surveys;
create trigger surveys_touch_updated_at
  before update on public.surveys
  for each row execute function public.touch_updated_at();

drop trigger if exists responses_touch_updated_at on public.responses;
create trigger responses_touch_updated_at
  before update on public.responses
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- WARNING — read this before putting real survey data in here.
--
-- These policies are deliberately PERMISSIVE because this app has no user
-- accounts. Row Level Security scopes rows by identity, and there is no
-- identity to scope by: the `anon` role is shared by every visitor.
--
-- The practical consequence is that anyone who can load the deployed site can
-- read, edit, and delete every survey and every response. That is fine for a
-- personal tallying tool. It is NOT fine for genuinely sensitive field data.
--
-- To lock this down, add Supabase Auth, give the tables a `user_id uuid` column
-- referencing auth.users, and replace each policy with:
--
--   using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)
--
alter table public.surveys   enable row level security;
alter table public.responses enable row level security;

drop policy if exists "surveys are publicly readable" on public.surveys;
create policy "surveys are publicly readable"
  on public.surveys for select
  to anon, authenticated using (true);

drop policy if exists "surveys are publicly insertable" on public.surveys;
create policy "surveys are publicly insertable"
  on public.surveys for insert
  to anon, authenticated with check (true);

drop policy if exists "surveys are publicly updatable" on public.surveys;
create policy "surveys are publicly updatable"
  on public.surveys for update
  to anon, authenticated using (true) with check (true);

drop policy if exists "surveys are publicly deletable" on public.surveys;
create policy "surveys are publicly deletable"
  on public.surveys for delete
  to anon, authenticated using (true);

drop policy if exists "responses are publicly readable" on public.responses;
create policy "responses are publicly readable"
  on public.responses for select
  to anon, authenticated using (true);

drop policy if exists "responses are publicly insertable" on public.responses;
create policy "responses are publicly insertable"
  on public.responses for insert
  to anon, authenticated with check (true);

drop policy if exists "responses are publicly updatable" on public.responses;
create policy "responses are publicly updatable"
  on public.responses for update
  to anon, authenticated using (true) with check (true);

drop policy if exists "responses are publicly deletable" on public.responses;
create policy "responses are publicly deletable"
  on public.responses for delete
  to anon, authenticated using (true);