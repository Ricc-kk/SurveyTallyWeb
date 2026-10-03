import type { Session } from "@supabase/supabase-js"
import { MISSING_ENV_MESSAGE, supabase } from "./lib/supabase"

// Supabase Auth is email-based, but Tallyform signs in with a plain username.
// Usernames are mapped onto a fixed internal domain so "Admin" resolves to a
// real identity without the login form ever showing an email address.
const LOGIN_DOMAIN = "tallyform.local"

/**
 * Folds a username down to a local part an email address can legally carry.
 *
 * The name is never passed through raw: "John Smith" would otherwise become
 * "john smith@tallyform.local" and come back from Supabase as "Invalid email
 * address", which reads as the app being broken rather than as advice about the
 * name. Spaces, dots, symbols and non-Latin letters all become dashes.
 *
 * Deliberately plain lowercase-and-replace, with no Unicode normalisation, so
 * this produces exactly the same string as the Postgres expression in
 * accounts-migration.sql. If those two ever diverge, renaming an account in the
 * admin panel would lock that account out of its own login.
 *
 * Nothing here is an email address the person types or sees. It exists only
 * because Supabase Auth keys on email, and it never leaves this module.
 */
export function usernameToSlug(username: string): string {
  return username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Fallback for a name with no ASCII left in it — one written entirely in
 * another script, which slugging would otherwise erase to nothing.
 *
 * The UTF-8 bytes are hex encoded, which the browser's TextEncoder and
 * Postgres' encode(convert_to(x, 'UTF8'), 'hex') both produce identically, so
 * this stays in step with admin_rename. Truncated at 60 characters because an
 * email local part is not meant to run to hundreds of digits.
 */
function hexFallback(username: string): string {
  const bytes = new TextEncoder().encode(username.trim().toLowerCase())
  let hex = ""
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0")
  }
  return `u${hex.slice(0, 60)}`
}

function localPart(username: string): string {
  return usernameToSlug(username) || hexFallback(username)
}

export function usernameToEmail(username: string): string {
  return `${localPart(username)}@${LOGIN_DOMAIN}`
}

/**
 * Why a username cannot become a login, if it cannot. Returns null for almost
 * everything — spaces, dots, underscores, capitals and other scripts are all
 * fine — so the register form can explain a problem in the user's own language
 * instead of surfacing an error about email addresses.
 */
export function usernameProblem(username: string): string | null {
  if (!username.trim()) return null
  if (localPart(username).length > 64) {
    return "That name is too long — keep it shorter."
  }
  return null
}

let currentSession: Session | null = null
const listeners = new Set<(session: Session | null) => void>()

function emit() {
  for (const listener of listeners) listener(currentSession)
}

export function getSession(): Session | null {
  return currentSession
}

export function isSignedIn(): boolean {
  return currentSession !== null
}

/**
 * The signed-in user's id, read from the cached session rather than the network.
 * Row Level Security compares this against each row's user_id.
 */
export function getUserId(): string | null {
  return currentSession?.user?.id ?? null
}

export function subscribeToSession(
  listener: (session: Session | null) => void,
) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function initAuth(): Promise<Session | null> {
  if (!supabase) return null

  const { data } = await supabase.auth.getSession()
  currentSession = data.session

  supabase.auth.onAuthStateChange((_event, session) => {
    currentSession = session
    // Supabase warns against awaiting other Supabase calls inside this handler,
    // so let React state updates settle before notifying subscribers.
    window.setTimeout(emit, 0)
  })

  return currentSession
}

export async function signIn(username: string, password: string): Promise<void> {
  if (!supabase) throw new Error(MISSING_ENV_MESSAGE)

  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  })

  if (error) throw error
}

/**
 * Creates the login. The database trigger in accounts-migration.sql writes the
 * matching profile row as an unverified, non-admin user, so nobody can self-
 * promote by registering.
 *
 * Returns true when the new account is already signed in, which is the normal
 * case: Tallyform maps usernames onto @tallyform.local, so Supabase's "confirm
 * your email" step has to be switched off for sign-up to be usable at all.
 */
export async function register(
  username: string,
  password: string,
): Promise<boolean> {
  if (!supabase) throw new Error(MISSING_ENV_MESSAGE)

  const problem = usernameProblem(username)
  if (problem) throw new Error(problem)

  const { data, error } = await supabase.auth.signUp({
    email: usernameToEmail(username),
    password,
    // Carried through to the profile row, so the account is listed under the
    // name the person actually typed rather than the slugged address.
    options: { data: { username: username.trim() } },
  })

  if (error) {
    // A username that is already taken surfaces here as a duplicate-email error.
    const message = error.message.toLowerCase()
    if (message.includes("already") || message.includes("registered")) {
      throw new Error("That username is already taken.")
    }
    throw error
  }

  return Boolean(data.session)
}

export async function signOut(): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}