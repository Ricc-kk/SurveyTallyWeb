-- Tallyform — accounts, roles and feedback
-- Run this AFTER supabase/auth-migration.sql, in Supabase Dashboard → SQL Editor.
-- Safe to re-run: every statement is guarded or drops before it creates.
--
-- What this adds:
--   public.profiles  one row per login, carrying the role and the verified flag
--   public.feedback  improvement notes sent from the sidebar
--   admin RPCs       verify / edit / disable / delete another account
--
-- IMPORTANT — before using the register form, turn OFF email confirmation:
--   Supabase → Authentication → Providers → Email → "Confirm email" off.
-- Tallyform signs in with a username mapped to @tallyform.local, which is not a
-- real mailbox, so a confirmation email can never be delivered or clicked.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
-- `role` decides who may verify accounts and read the feedback inbox.
-- `verified` is the admin's approval switch. An unverified account can sign in
-- but is stopped at the "waiting for verification" screen.
-- `disabled` is a reversible suspension that blocks sign-in without touching data.

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text        not null unique,
  role       text        not null default 'user' check (role in ('user', 'admin')),
  verified   boolean     not null default false,
  disabled   boolean     not null default false,
  created_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);

-- Accounts that existed before this migration have no profile row yet. They are
-- real, working logins, so they are backfilled as verified admins — the sign-up
-- form is the only way in from here on. If you had other logins that should be
-- ordinary users, update their role after running this.
insert into public.profiles (id, username, role, verified)
select
  u.id,
  coalesce(nullif(split_part(u.email, '@', 1), ''), 'user'),
  'admin',
  true
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Feedback
-- ---------------------------------------------------------------------------

create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        references auth.users (id) on delete set null,
  username   text        not null default '',
  message    text        not null,
  status     text        not null default 'new'
               check (status in ('new', 'reviewed', 'done')),
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);

-- ---------------------------------------------------------------------------
-- New sign-ups get an unverified, non-admin profile automatically
-- ---------------------------------------------------------------------------
-- Without this the app would have to create the row from the browser, which any
-- visitor could do with their own id — including choosing role = 'admin'.
-- The role is hard-coded to 'user' here, so nobody can self-promote.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, role, verified)
  values (
    new.id,
    coalesce(nullif(split_part(new.email, '@', 1), ''), 'user'),
    'user',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER lets these read `profiles` without tripping its own Row
-- Level Security policies, which is what would otherwise recurse: a policy that
-- calls is_admin() cannot be evaluated by a query that is_admin() depends on.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and disabled = false
  );
$$;

-- ---------------------------------------------------------------------------
-- Admin actions
-- ---------------------------------------------------------------------------
-- These bypass Row Level Security, so each one re-checks is_admin() itself.
-- Every function raises unless the caller is an active admin, and refuses to act
-- on the caller's own account — that is how an admin locks themselves out.

create or replace function public.admin_set_verified(target uuid, approved boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can verify accounts';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot change your own verification';
  end if;

  update public.profiles set verified = approved where id = target;
  if not found then
    raise exception 'No such account';
  end if;
end;
$$;

create or replace function public.admin_set_role(target uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can change roles';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;
  if new_role not in ('user', 'admin') then
    raise exception 'Unknown role';
  end if;

  update public.profiles set role = new_role where id = target;
  if not found then
    raise exception 'No such account';
  end if;
end;
$$;

-- Revoke or restore access. The login and all of its data are left intact.
create or replace function public.admin_set_disabled(target uuid, off boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can revoke access';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot revoke your own access';
  end if;

  update public.profiles set disabled = off where id = target;
  if not found then
    raise exception 'No such account';
  end if;
end;
$$;

-- Renaming keeps the login working: the username is the email local part, so
-- both the profile and the auth identity move together.
create or replace function public.admin_rename(target uuid, new_username text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  clean text := lower(btrim(new_username));
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can rename accounts';
  end if;
  if clean = '' or clean !~ '^[a-z0-9._-]{3,32}$' then
    raise exception 'Usernames must be 3-32 characters, using letters, numbers, dot, dash or underscore';
  end if;
  if exists (select 1 from public.profiles where username = clean and id <> target) then
    raise exception 'That username is taken';
  end if;

  update public.profiles set username = clean where id = target;
  if not found then
    raise exception 'No such account';
  end if;

  update auth.users set email = clean || '@tallyform.local' where id = target;
end;
$$;

-- A reset password is the only way back into a locked-out account, so it is an
-- admin-only operation. bcrypt here matches what Supabase Auth uses internally.
create or replace function public.admin_reset_password(target uuid, new_password text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can reset passwords';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot reset your own password here';
  end if;
  if new_password is null or length(new_password) < 6 then
    raise exception 'Passwords must be at least 6 characters';
  end if;

  update auth.users
  set password = crypt(new_password, gen_salt('bf'))
  where id = target;

  if not found then
    raise exception 'No such account';
  end if;
end;
$$;

-- purge = false  suspends the account, keeping every survey and response.
-- purge = true  removes the login; auth.users cascades to profiles, and the
--               surveys and responses that referenced it are already tied to it
--               with on delete cascade, so this is permanent.
create or replace function public.admin_delete_account(target uuid, purge boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can delete accounts';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;

  if purge then
    delete from auth.identities where user_id = target;
    delete from auth.users       where id = target;
  else
    update public.profiles set disabled = true where id = target;
    if not found then
      raise exception 'No such account';
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Surveys and responses keep their owner-scoped policies from
-- auth-migration.sql: every account sees only its own data. Nothing here grants
-- an admin read access to another account's surveys — the admin powers are
-- limited to approving, editing and removing accounts, and to the feedback inbox.

alter table public.profiles enable row level security;

-- Own row only. There is deliberately no update policy: a client that could
-- update its own row could also set role = 'admin'. Every change goes through an
-- admin RPC instead.
drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id or (select public.is_admin()));

drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles"
  on public.profiles
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter table public.feedback enable row level security;

drop policy if exists "users send feedback" on public.feedback;
create policy "users send feedback"
  on public.feedback
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- The inbox is admin-only, which is why the sidebar tab is hidden from everyone
-- else rather than just filtered.
drop policy if exists "admins read feedback" on public.feedback;
create policy "admins read feedback"
  on public.feedback
  for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "admins manage feedback" on public.feedback;
create policy "admins manage feedback"
  on public.feedback
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));