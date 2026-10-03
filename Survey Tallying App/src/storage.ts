import type { Survey } from "./types"

const STORAGE_KEY = "tallyform.surveys.v1"

export function loadSurveys(fallback: Survey[]): Survey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

export function saveSurveys(surveys: Survey[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(surveys))
}

export function downloadFile(name: string, contents: string, type: string) {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}
