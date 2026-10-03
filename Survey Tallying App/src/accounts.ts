import { getUserId } from "./auth"
import { MISSING_ENV_MESSAGE, supabase } from "./lib/supabase"

/**
 * Account roles and the feedback inbox.
 *
 * Everything privileged here goes through a Postgres function rather than a
 * table write, because the browser only ever holds the public anon key. The
 * functions in supabase/accounts-migration.sql re-check the caller's role, so
 * hiding a button in the UI is a convenience, never the thing that enforces it.
 */

export type AccountRole = "user" | "admin"
export type FeedbackStatus = "new" | "reviewed" | "done"

export interface Account {
  id: string
  username: string
  role: AccountRole
  verified: boolean
  disabled: boolean
  createdAt: string
}

export interface FeedbackItem {
  id: string
  userId: string | null
  username: string
  message: string
  status: FeedbackStatus
  createdAt: string
}

/** Postgres raise() text, which is how these RPCs report a refused action. */
function reason(error: { message: string } | null, fallback: string) {
  if (!error) return fallback
  // The driver prefixes the server message; the raw sentence reads better.
  const message = error.message.replace(/^.*?:\s*/, "").trim()
  return message || fallback
}

/**
 * True when the accounts tables simply are not there yet.
 *
 * The app is a static deploy that can be refreshed before supabase/
 * accounts-migration.sql has been run, and a missing table must not read as
 * "your account is not verified" — that would lock the existing admin out of
 * their own surveys. 42P01 is Postgres' undefined_table.
 */
export function isProfilesMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const candidate = error as { code?: string; message?: string }
  if (candidate.code === "42P01") return true
  const message = candidate.message ?? ""
  if (!/public\.(profiles|feedback)/i.test(message)) return false
  // PostgREST words it three different ways depending on version: "relation
  // ... does not exist", "Could not find the table ... in the schema cache",
  // and a bare 42P01 code.
  return /does not exist|could not find the table|schema cache/i.test(message)
}

/** Thrown when the accounts tables have not been created yet. */
export class AccountsUnavailableError extends Error {}

type ProfileRow = {
  id: string
  username: string
  role: AccountRole
  verified: boolean
  disabled: boolean
  created_at: string
}

type FeedbackRow = {
  id: string
  user_id: string | null
  username: string
  message: string
  status: FeedbackStatus
  created_at: string
}

function toAccount(row: ProfileRow): Account {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    verified: row.verified,
    disabled: row.disabled,
    createdAt: row.created_at,
  }
}

function toFeedback(row: FeedbackRow): FeedbackItem {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  }
}

/**
 * Whether the accounts tables exist, checked before anyone signs in.
 *
 * Row Level Security hides every row from a signed-out visitor, so a working
 * table answers with an empty list rather than an error. That is what separates
 * "installed" from "not installed yet" without needing any privilege.
 */
export async function probeAccountsSchema(): Promise<boolean> {
  if (!supabase) return false

  const { error } = await supabase.from("profiles").select("id").limit(1)
  return !error
}

// ---------------------------------------------------------------------------
// My own account
// ---------------------------------------------------------------------------

/**
 * The signed-in user's profile, or null if the trigger has not caught up yet.
 *
 * A null profile is treated as "not an admin" rather than "load everything":
 * the UI hides the admin tabs until this resolves to a real row.
 */
export async function fetchMyAccount(): Promise<Account | null> {
  const userId = getUserId()
  if (!supabase || !userId) return null

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle()

  if (error) {
    if (isProfilesMissing(error)) throw new AccountsUnavailableError()
    throw new Error(reason(error, "Could not read your account."))
  }
  if (!data) return null
  return toAccount(data as ProfileRow)
}

// ---------------------------------------------------------------------------
// Admin: the account list
// ---------------------------------------------------------------------------

export async function listAccounts(): Promise<Account[]> {
  if (!supabase) throw new Error(MISSING_ENV_MESSAGE)

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true })

  if (error) throw new Error(reason(error, "Could not load accounts."))
  return ((data ?? []) as ProfileRow[]).map(toAccount)
}

async function callAdmin(
  fn: string,
  args: Record<string, unknown>,
  fallback: string,
) {
  if (!supabase) throw new Error(MISSING_ENV_MESSAGE)

  const { error } = await supabase.rpc(fn, args)
  if (error) throw new Error(reason(error, fallback))
}

/** Approve an account so it can leave the waiting room. */
export function verifyAccount(id: string, approved: boolean) {
  return callAdmin(
    "admin_set_verified",
    { target: id, approved },
    "Could not change verification.",
  )
}

export function setAccountRole(id: string, role: AccountRole) {
  return callAdmin(
    "admin_set_role",
    { target: id, new_role: role },
    "Could not change that role.",
  )
}

/** Revoke or restore access. The account and all of its data are kept. */
export function setAccountDisabled(id: string, off: boolean) {
  return callAdmin(
    "admin_set_disabled",
    { target: id, off },
    "Could not change access.",
  )
}

export function renameAccount(id: string, username: string) {
  return callAdmin(
    "admin_rename",
    { target: id, new_username: username },
    "Could not rename that account.",
  )
}

export function resetAccountPassword(id: string, password: string) {
  return callAdmin(
    "admin_reset_password",
    { target: id, new_password: password },
    "Could not reset that password.",
  )
}

/**
 * purge = false suspends and keeps the data; purge = true removes the login and
 * everything owned by it. The UI confirms the destructive one by typing.
 */
export function deleteAccount(id: string, purge: boolean) {
  return callAdmin(
    "admin_delete_account",
    { target: id, purge },
    "Could not delete that account.",
  )
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

/** Available to every signed-in account, admin or not. */
export async function sendFeedback(message: string): Promise<void> {
  const userId = getUserId()
  if (!supabase || !userId) throw new Error(MISSING_ENV_MESSAGE)

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle()

  const { error } = await supabase.from("feedback").insert({
    user_id: userId,
    username: (profile as { username: string } | null)?.username ?? "",
    message: message.trim(),
  })

  if (error) throw new Error(reason(error, "Could not send your feedback."))
}

/** Admin only — Row Level Security hides the inbox from everyone else. */
export async function listFeedback(): Promise<FeedbackItem[]> {
  if (!supabase) throw new Error(MISSING_ENV_MESSAGE)

  const { data, error } = await supabase
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw new Error(reason(error, "Could not load feedback."))
  return ((data ?? []) as FeedbackRow[]).map(toFeedback)
}

export async function setFeedbackStatus(
  id: string,
  status: FeedbackStatus,
): Promise<void> {
  if (!supabase) throw new Error(MISSING_ENV_MESSAGE)

  const { error } = await supabase
    .from("feedback")
    .update({ status })
    .eq("id", id)

  if (error) throw new Error(reason(error, "Could not update that item."))
}

export async function deleteFeedback(id: string): Promise<void> {
  if (!supabase) throw new Error(MISSING_ENV_MESSAGE)

  const { error } = await supabase.from("feedback").delete().eq("id", id)

  if (error) throw new Error(reason(error, "Could not delete that item."))
}

