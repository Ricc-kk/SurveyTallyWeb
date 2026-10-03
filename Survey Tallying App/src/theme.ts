export type Theme = "system" | "light" | "dark"

const STORAGE_KEY = "tallyform.theme"

export const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]

export function isTheme(value: unknown): value is Theme {
  return value === "system" || value === "light" || value === "dark"
}

function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isTheme(stored)) return stored
  } catch {
    // Private browsing can make localStorage throw; fall through to system.
  }
  return "system"
}

/** The stored preference without applying it, for seeding React state. */
export function loadTheme(): Theme {
  return readStoredTheme()
}

export function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

/**
 * "system" resolves against the OS preference; the other two are taken at face
 * value so a user who picks a side keeps it regardless of their device setting.
 */
export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") return prefersDark() ? "dark" : "light"
  return theme
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = resolveTheme(theme)
}

export function saveTheme(theme: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Persisting is best-effort; the theme still applies for this session.
  }
  applyTheme(theme)
}

/**
 * The inline script in index.html already set the attribute before first paint.
 * This repeats that work so React starts from the right state, and keeps the
 * page in step with the OS while the preference is "system".
 */
export function initTheme(): Theme {
  const theme = readStoredTheme()
  applyTheme(theme)

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (readStoredTheme() === "system") applyTheme("system")
    })

  return theme
}