import { useState, type FormEvent } from "react"
import {
  register,
  signIn,
  usernameProblem,
  usernameToEmail,
  usernameToSlug,
} from "./auth"
import { THEME_OPTIONS, loadTheme, saveTheme, type Theme } from "./theme"

type Mode = "signin" | "register"

/**
 * Registration is only offered once the approval system exists.
 *
 * Until supabase/accounts-migration.sql has been run there is no profiles
 * table, so the app cannot tell an administrator from anyone else and treats
 * every signed-in account as one. Leaving the Create account tab open in that
 * state would hand full access to whoever signed up, so it stays hidden until
 * the tables are there.
 */
export default function LoginScreen({ canRegister = true }: { canRegister?: boolean }) {
  const [mode, setMode] = useState<Mode>("signin")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [done, setDone] = useState("")
  const [busy, setBusy] = useState(false)
  const [theme, setTheme] = useState<Theme>(loadTheme)

  const submitting = busy && !done
  // Any username is accepted; this only reports the rare name that cannot
  // become a login, so the form can say why before a request is sent.
  const nameProblem = mode === "register" ? usernameProblem(username) : null
  const slug = username.trim() ? usernameToEmail(username) : ""

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return

    setError("")
    setDone("")
    setBusy(true)

    try {
      if (mode === "register") {
        const alreadyIn = await register(username, password)
        // A session means the app can move straight on to the waiting screen. If
        // Supabase still wants an email confirmation, sign in here instead so the
        // user lands in the same place either way.
        if (!alreadyIn) await signIn(username, password)
        setDone(
          `Account "${username.trim()}" created. An administrator has to verify it before you can use Tallyform.`,
        )
      } else {
        await signIn(username, password)
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not sign in.",
      )
      setBusy(false)
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setError("")
    setDone("")
    setBusy(false)
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark">
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <span>Tallyform</span>
        </div>

        {canRegister && (
          <div className="login-modes" role="group" aria-label="Account">
            <button
              type="button"
              className={mode === "signin" ? "active" : ""}
              aria-pressed={mode === "signin"}
              onClick={() => switchMode("signin")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === "register" ? "active" : ""}
              aria-pressed={mode === "register"}
              onClick={() => switchMode("register")}
            >
              Create account
            </button>
          </div>
        )}

        <form onSubmit={submit}>
          <label className="field">
            <span className="field-label">Username</span>
            <input
              className="input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
            {mode === "register" && slug && slug !== `${username.trim()}@tallyform.local` && (
              <small className="login-hint">
                Signs in as <code>{slug}</code>.{" "}
                {usernameToSlug(username)
                  ? "Spaces and symbols are fine — they become dashes."
                  : "Your login has to be stored in a coded form, but you still sign in with this name."}
              </small>
            )}
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              minLength={6}
              required
            />
          </label>

          {nameProblem && (
            <p className="login-error" role="alert">
              {nameProblem}
            </p>
          )}

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          {done && (
            <p className="login-done" role="status">
              {done}
            </p>
          )}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy || Boolean(nameProblem)}
          >
            {submitting
              ? mode === "register"
                ? "Creating account…"
                : "Signing in…"
              : mode === "register"
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <p className="login-foot">
          {mode === "register"
            ? "Just a username and a password — no email address. An administrator verifies new accounts before they can sign in."
            : "Your username and password, then straight into your surveys."}
        </p>

        <div className="login-theme" role="group" aria-label="Colour theme">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={theme === option.value ? "active" : ""}
              aria-pressed={theme === option.value}
              onClick={() => {
                setTheme(option.value)
                saveTheme(option.value)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}