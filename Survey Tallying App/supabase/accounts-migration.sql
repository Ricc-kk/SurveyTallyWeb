-- Tallyform — accounts, roles and feedback
-- Run this AFTER supabase/auth-migration.sql, in Supabase Dashboard → SQL Editor.
-- Safe to re-run: every statement is guarded or drops before it creates.
--
-- What this adds:
--   public.profiles  one row per login, carrying the role and the verified flag
--   public.feedback  improvement notes sent from the sidebar
--   admin RPCs       verify / approve-everyone / edit / disable / delete an account
--   is_approved()    Row Level Security gate: an unverified account holds no
--                    surveys or responses at all, so waiting for an
--                    administrator is enforced by the database and not only by
--                    the waiting-room screen in the app
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
--
-- The stored username is the one the person typed, carried in user metadata,
-- not the slugged email local part. "John Smith" is listed as John Smith and
-- still signs in as john-smith.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  typed text := nullif(btrim(new.raw_user_meta_data ->> 'username'), '');
begin
  insert into public.profiles (id, username, role, verified)
  values (
    new.id,
    coalesce(typed, nullif(split_part(new.email, '@', 1), ''), 'user'),
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

-- Whether the caller has been let in.
--
-- SECURITY DEFINER for the same reason as is_admin(): the policies below call
-- this, and a policy cannot be evaluated by a query that the function itself
-- depends on. An administrator passes even if their own verified flag was
-- cleared, which is what stops an admin from locking themselves out.
create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.profiles
    where id = auth.uid() and verified and not disabled
  );
$$;

-- Approve everyone waiting, in one call. Returns how many rows changed.
create or replace function public.admin_verify_all()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can verify accounts';
  end if;

  -- The caller is left alone, matching every other admin action here: an admin
  -- changing their own verification is how an account gets stranded.
  update public.profiles
  set verified = true
  where not verified
    and not disabled
    and id <> auth.uid();

  get diagnostics changed = row_count;
  return changed;
end;
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
--
-- The slug below MUST stay identical to usernameToSlug() in src/auth.ts, and the
-- fallback to the one in the same file. If the two ever disagree, renaming an
-- account here would rewrite its email to an address the app no longer signs in
-- with, locking that account out of its own surveys. Plain lowercase-and-replace
-- with no Unicode normalisation, for exactly that reason.
create or replace function public.admin_rename(target uuid, new_username text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  label  text := btrim(new_username);
  slug   text := trim(both '-' from regexp_replace(lower(btrim(new_username)), '[^a-z0-9]+', '-', 'g'));
  -- Same fallback the app uses for a name with no ASCII in it: the UTF-8 bytes
  -- hex encoded, which encode()/hex matches exactly. Truncated at 60 there and
  -- here, so the two cannot drift apart.
  fallback text := 'u' || left(encode(convert_to(lower(btrim(new_username)), 'UTF8'), 'hex'), 60);
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can rename accounts';
  end if;
  if coalesce(slug, fallback, '') = '' then
    raise exception 'That name is too long - keep it shorter';
  end if;
  if length(coalesce(nullif(slug, ''), fallback)) > 64 then
    raise exception 'That name is too long - keep it shorter';
  end if;
  if exists (select 1 from public.profiles where username = label and id <> target) then
    raise exception 'That username is taken';
  end if;

  update public.profiles set username = label where id = target;
  if not found then
    raise exception 'No such account';
  end if;

  update auth.users
  set email = coalesce(nullif(slug, ''), fallback) || '@tallyform.local'
  where id = target;
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
-- Surveys and responses stay owner-scoped — every account sees only its own
-- data — and now additionally require is_approved(). The waiting-room screen in
-- the app is a courtesy; this is the part that actually holds. Without it an
-- unverified account can skip the UI entirely and read or write its own surveys
-- straight from the REST API with the public anon key, because the policies in
-- auth-migration.sql only ever asked "is this row mine?".
--
-- Nothing here grants an admin read access to another account's surveys — the
-- admin powers are limited to approving, editing and removing accounts, and to
-- the feedback inbox.

drop policy if exists "owners manage their surveys" on public.surveys;
create policy "owners manage their surveys"
  on public.surveys
  for all
  to authenticated
  using ((select auth.uid()) = user_id and (select public.is_approved()))
  with check ((select auth.uid()) = user_id and (select public.is_approved()));

drop policy if exists "owners manage their responses" on public.responses;
create policy "owners manage their responses"
  on public.responses
  for all
  to authenticated
  using ((select auth.uid()) = user_id and (select public.is_approved()))
  with check ((select auth.uid()) = user_id and (select public.is_approved()));

alter table public.profiles enable row level security;

-- Own row only. There is deliberately no update policy: a client that could
-- update its own row could also set role = 'admin'. Every change goes through an
-- admin RPC instead.
--
-- An unverified account can still read this row, and that is required rather
-- than an oversight: it is how the app learns that the account exists and is
-- waiting, and therefore how the waiting-room screen knows to say so. Hiding it
-- would leave the app unable to tell "unverified" from "no profile at all".
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

-- Deliberately NOT gated on is_approved(). A note left for the administrator is
-- not app content, and leaving this one write open keeps a channel for someone
-- who registered themselves into a waiting room they cannot otherwise escape.
-- The sidebar button is unreachable from there anyway, since the waiting-room
-- screen covers the whole app.
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