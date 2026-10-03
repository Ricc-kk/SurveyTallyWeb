import { useState, type FormEvent } from "react"
import { signIn } from "./auth"
import { THEME_OPTIONS, loadTheme, saveTheme, type Theme } from "./theme"

export default function LoginScreen() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [theme, setTheme] = useState<Theme>(loadTheme)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return

    setError("")
    setBusy(true)

    try {
      await signIn(username, password)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not sign in.",
      )
      setBusy(false)
    }
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
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="login-foot">
          Administrator access only. There is no public sign-up.
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