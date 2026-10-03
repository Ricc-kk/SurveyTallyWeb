-- Tallyform — folders
-- Run this AFTER supabase/auth-migration.sql, in Supabase Dashboard → SQL Editor.
-- Safe to re-run: every statement is guarded or drops before it creates.
--
-- A folder is a flat grouping of surveys. Surveys are attached by id, and
-- surveys with a null folder_id are the "Unfiled" group in the app.
--
-- Deleting a folder sets its surveys back to unfiled rather than taking them
-- with it — the destructive "delete the folder and everything inside it" path
-- is driven from the app, which deletes the surveys first and then the folder,
-- so the on delete set null here is only the safety net.

-- ---------------------------------------------------------------------------
-- Folders
-- ---------------------------------------------------------------------------

create table if not exists public.folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        references auth.users (id) on delete cascade,
  name       text        not null check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists folders_user_id_idx on public.folders (user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists folders_touch_updated_at on public.folders;
create trigger folders_touch_updated_at
  before update on public.folders
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Attach surveys to folders
-- ---------------------------------------------------------------------------
-- on delete set null, so a folder removed by any path that does not go through
-- the app leaves its surveys visible as unfiled instead of vanishing with it.

alter table public.surveys
  add column if not exists folder_id uuid references public.folders (id) on delete set null;

create index if not exists surveys_folder_id_idx on public.surveys (folder_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Identical to the surveys policies: an account sees only its own folders, and
-- a row cannot be written claiming an owner other than the signed-in user.
-- Nothing here changes how surveys are read, so this migration cannot widen
-- access to anyone's data.

alter table public.folders enable row level security;

drop policy if exists "folders are publicly readable"   on public.folders;
drop policy if exists "folders are publicly insertable" on public.folders;
drop policy if exists "folders are publicly updatable"  on public.folders;
drop policy if exists "folders are publicly deletable"  on public.folders;

drop policy if exists "owners manage their folders" on public.folders;
create policy "owners manage their folders"
  on public.folders
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Existing surveys all get a null folder_id and therefore start out Unfiled.