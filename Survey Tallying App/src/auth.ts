import type { Session } from "@supabase/supabase-js"
import { MISSING_ENV_MESSAGE, supabase } from "./lib/supabase"

// Supabase Auth is email-based, but Tallyform signs in with a plain username.
// Usernames are mapped onto a fixed internal domain so "Admin" resolves to a
// real identity without the login form ever showing an email address.
const LOGIN_DOMAIN = "tallyform.local"

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${LOGIN_DOMAIN}`
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

  const { data, error } = await supabase.auth.signUp({
    email: usernameToEmail(username),
    password,
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