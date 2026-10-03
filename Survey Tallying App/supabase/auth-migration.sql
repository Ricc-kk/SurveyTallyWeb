-- Tallyform — Supabase Auth migration
-- Run this AFTER creating your admin user in Supabase (Authentication → Users).
-- Replaces the permissive anonymous policies with owner-scoped ones.

-- ---------------------------------------------------------------------------
-- Ownership
-- ---------------------------------------------------------------------------

alter table public.surveys
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table public.responses
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

create index if not exists surveys_user_id_idx on public.surveys (user_id);
create index if not exists responses_user_id_idx on public.responses (user_id);

-- Rows created before this migration have no owner and would be invisible under
-- the new policies. Currently these are only the seeded demo survey and no
-- responses. Delete them so the signed-in admin starts with a clean workspace.
delete from public.responses where user_id is null;
delete from public.surveys   where user_id is null;

-- ---------------------------------------------------------------------------
-- Owner-scoped policies
-- ---------------------------------------------------------------------------
--
-- These replace the "publicly readable/insertable/updatable/deletable" policies.
-- Every statement a signed-in user makes is filtered by auth.uid(), which is
-- taken from their JWT and cannot be forged by the client. The `anon` role is
-- no longer granted anything, so a visitor who is not signed in can read nothing
-- and write nothing.
--
-- `(select auth.uid())` is the form Supabase recommends: it evaluates once per
-- query instead of once per row, so policies stay fast on large tables.
--
drop policy if exists "surveys are publicly readable"   on public.surveys;
drop policy if exists "surveys are publicly insertable" on public.surveys;
drop policy if exists "surveys are publicly updatable"  on public.surveys;
drop policy if exists "surveys are publicly deletable"  on public.surveys;

drop policy if exists "responses are publicly readable"   on public.responses;
drop policy if exists "responses are publicly insertable" on public.responses;
drop policy if exists "responses are publicly updatable"  on public.responses;
drop policy if exists "responses are publicly deletable"  on public.responses;

drop policy if exists "owners manage their surveys" on public.surveys;
create policy "owners manage their surveys"
  on public.surveys
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "owners manage their responses" on public.responses;
create policy "owners manage their responses"
  on public.responses
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);