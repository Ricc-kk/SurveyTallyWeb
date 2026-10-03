import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type HTMLAttributes,
  type ReactNode,
} from "react"
import type { Session } from "@supabase/supabase-js"
import { makeQuestion, makeSurvey, uid } from "./data"
import {
  initAuth,
  signOut as signOutOfSupabase,
  subscribeToSession,
} from "./auth"
import LoginScreen from "./LoginScreen"
import {
  AccountsUnavailableError,
  deleteAccount,
  deleteFeedback,
  fetchMyAccount,
  listAccounts,
  listFeedback,
  renameAccount,
  resetAccountPassword,
  sendFeedback,
  setAccountDisabled,
  setAccountRole,
  setFeedbackStatus,
  verifyAccount,
  type Account,
  type FeedbackItem,
  type FeedbackStatus,
} from "./accounts"
import { THEME_OPTIONS, loadTheme, saveTheme, type Theme } from "./theme"
import {
  describeStorageError,
  downloadFile,
  loadSurveys,
  syncSurveys,
  type Workspace,
} from "./storage"
import type {
  Answer,
  Folder,
  Question,
  QuestionType,
  ResponseRecord,
  Survey,
} from "./types"

type View = "surveys" | "builder" | "tally" | "results" | "accounts" | "feedback"
type TallyMode = "quick" | "tap" | "grid"

const TYPE_LABELS: Record<QuestionType, string> = {
  single: "Single choice",
  multiple: "Multiple choice",
  yesno: "Yes / No",
  rating: "Rating scale",
  number: "Number",
  short: "Short text",
  long: "Long text",
  date: "Date",
  section: "Section",
}

const Icon = ({ name, size = 18 }: { name: string; size?: number }) => {
  const paths: Record<string, ReactNode> = {
    surveys: (
      <>
        <path d="M5 4h14v16H5z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
    builder: (
      <>
        <path d="M4 7h16M7 4v6M4 17h16M16 14v6" />
      </>
    ),
    tally: (
      <>
        <path d="M5 5h14v14H5z" />
        <path d="m8 12 2.4 2.4L16 9" />
      </>
    ),
    results: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    dock: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M15 4v16" />
      </>
    ),
    float: (
      <>
        <rect x="3" y="3" width="17" height="13" rx="2" />
        <rect x="8" y="9" width="13" height="12" rx="2" />
      </>
    ),
    close: <path d="M6 6l12 12M18 6 6 18" />,
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    arrow: <path d="m9 18 6-6-6-6" />,
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
        <path d="M4 20h16" />
      </>
    ),
    back: <path d="m15 18-6-6 6-6" />,
    up: <path d="m18 15-6-6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    undo: (
      <>
        <path d="m9 7-5 5 5 5" />
        <path d="M4 12h9a6 6 0 0 1 6 6" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
    grip: (
      <>
        <circle cx="8" cy="7" r="1" />
        <circle cx="16" cy="7" r="1" />
        <circle cx="8" cy="12" r="1" />
        <circle cx="16" cy="12" r="1" />
        <circle cx="8" cy="17" r="1" />
        <circle cx="16" cy="17" r="1" />
      </>
    ),
    users: (
      <>
        <path d="M15.5 20v-1.4a3.6 3.6 0 0 0-3.6-3.6H6.6A3.6 3.6 0 0 0 3 18.6V20" />
        <circle cx="9.2" cy="7.6" r="3.4" />
        <path d="M21 20v-1.4a3.6 3.6 0 0 0-2.7-3.5M15.6 4.6a3.4 3.4 0 0 1 0 6" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3l7.5 3v5.4c0 4.4-3 8.1-7.5 9.9-4.5-1.8-7.5-5.5-7.5-9.9V6z" />
        <path d="m9 12 2.2 2.2L15.5 10" />
      </>
    ),
    feedback: (
      <>
        <path d="M20.5 11.7a7.8 7.8 0 0 1-11.2 7L4 20l1.3-5.3a7.8 7.8 0 1 1 15.2-3z" />
      </>
    ),
    edit: <path d="M4 20h4L19 9l-4-4L4 16zM14.5 5.5l4 4" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
      </>
    ),
  }
  return (
    <svg
      aria-hidden="true"
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

function Button({
  children,
  variant = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger"
}) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...props}>
      {children}
    </button>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />
}

// How close to an edge the pointer has to get before a drag starts scrolling,
// and how fast it goes once there.
const EDGE_SCROLL_ZONE = 76
const EDGE_SCROLL_MAX = 18

function edgeSpeed(distance: number) {
  return Math.round((distance / EDGE_SCROLL_ZONE) * EDGE_SCROLL_MAX)
}

/**
 * Scrolls the page while a drag hovers near the top or bottom of the viewport,
 * and the given container while the pointer is near its own edges — so a
 * question can be dragged past the end of a long list, or a panel past the
 * bottom of the page, instead of having nowhere left to drop it.
 *
 * Driven by a timer rather than pointer events, which stop firing the moment
 * the pointer is held still at the edge — exactly when the scrolling should
 * continue. Not requestAnimationFrame either: rAF is suspended whenever the
 * page is not painting, which would freeze the drag in an embedded webview or
 * a background tab. The loop only runs for the duration of a drag.
 */
function useEdgeAutoScroll(inner?: { current: HTMLElement | null }) {
  const pointerY = useRef<number | null>(null)
  const timer = useRef<number | null>(null)

  const stop = () => {
    pointerY.current = null
    if (timer.current !== null) window.clearInterval(timer.current)
    timer.current = null
  }

  const tick = () => {
    const y = pointerY.current
    if (y === null) return
    const fromTop = EDGE_SCROLL_ZONE - y
    const fromBottom = y - (window.innerHeight - EDGE_SCROLL_ZONE)
    if (fromTop > 0) window.scrollBy(0, -edgeSpeed(fromTop))
    else if (fromBottom > 0) window.scrollBy(0, edgeSpeed(fromBottom))

    const el = inner?.current
    if (el) {
      const box = el.getBoundingClientRect()
      if (y > box.top && y < box.bottom) {
        const belowTop = y - box.top
        const aboveBottom = box.bottom - y
        if (belowTop < EDGE_SCROLL_ZONE)
          el.scrollTop -= edgeSpeed(EDGE_SCROLL_ZONE - belowTop)
        else if (aboveBottom < EDGE_SCROLL_ZONE)
          el.scrollTop += edgeSpeed(EDGE_SCROLL_ZONE - aboveBottom)
      }
    }
  }

  const track = (y: number) => {
    pointerY.current = y
    if (timer.current === null) timer.current = window.setInterval(tick, 16)
  }

  useEffect(() => stop, [])

  return { track, stop }
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="input" {...props} />
}

function TextArea({
  value,
  onChange,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Grow to fit the content instead of scrolling inside a fixed box. Height is
  // reset to auto first so the browser can report the true content height.
  const fit = () => {
    const element = ref.current
    if (!element) return
    element.style.height = "auto"
    element.style.height = `${element.scrollHeight}px`
  }

  useLayoutEffect(fit, [value])

  return (
    <textarea
      ref={ref}
      className="input textarea"
      value={value}
      onChange={(event) => {
        onChange?.(event)
        fit()
      }}
      {...props}
    />
  )
}

function isAnswered(answer: Answer | undefined) {
  return (
    answer !== undefined &&
    answer !== null &&
    answer !== "" &&
    (!Array.isArray(answer) || answer.length > 0)
  )
}

function visibleQuestions(survey: Survey, answers: Record<string, Answer>) {
  return survey.questions.filter((question) => {
    if (!question.condition) return true
    const actual = answers[question.condition.questionId]
    const target = question.condition.value
    if (question.condition.operator === "equals")
      return String(actual) === target
    if (question.condition.operator === "not-equals")
      return String(actual) !== target
    if (question.condition.operator === "contains")
      return Array.isArray(actual)
        ? actual.includes(target)
        : String(actual ?? "").includes(target)
    if (question.condition.operator === "greater")
      return Number(actual) > Number(target)
    return Number(actual) < Number(target)
  })
}

function answerLabel(question: Question, answer: Answer | undefined) {
  if (!isAnswered(answer)) return "—"
  if (
    question.type === "single" ||
    question.type === "yesno" ||
    question.type === "multiple"
  ) {
    const ids = Array.isArray(answer) ? answer : [answer]
    return ids
      .map(
        (id) =>
          question.options.find((option) => option.id === id)?.label ??
          "Removed option",
      )
      .join("; ")
  }
  return String(answer)
}

function sectionCoverage(survey: Survey, sectionId: string) {
  const sectionIndex = survey.questions.findIndex(
    (question) => question.id === sectionId,
  )
  if (sectionIndex < 0) return "No questions"
  const firstNumber =
    survey.questions
      .slice(0, sectionIndex)
      .filter((question) => question.type !== "section").length + 1
  const sectionQuestions = survey.questions
    .slice(sectionIndex + 1)
    .filter(
      (question, index, remaining) =>
        question.type !== "section" &&
        !remaining
          .slice(0, index)
          .some((previous) => previous.type === "section"),
    )
  if (!sectionQuestions.length) return "No questions in this section"
  const lastNumber = firstNumber + sectionQuestions.length - 1
  return firstNumber === lastNumber
    ? `Question ${firstNumber}`
    : `Questions ${firstNumber}–${lastNumber}`
}

function ratingValues(question: Question) {
  const length = Math.max(0, Math.floor(question.max - question.min + 1))
  return Array.from({ length }, (_, index) => question.min + index)
}

function ratingLabel(question: Question, value: number) {
  return (
    question.scaleLabels?.[String(value)] ??
    (value === question.min
      ? question.minLabel
      : value === question.max
        ? question.maxLabel
        : "") ??
    ""
  )
}

function sectionForQuestion(survey: Survey, questionId: string) {
  let current: {
    id: string
    title: string
    description: string
    number: number
    coverage: string
  } | null = null
  let sectionNumber = 0
  for (const question of survey.questions) {
    if (question.type === "section") {
      sectionNumber += 1
      current = {
        id: question.id,
        title: question.prompt,
        description: question.helpText,
        number: sectionNumber,
        coverage: sectionCoverage(survey, question.id),
      }
    }
    if (question.id === questionId) return current
  }
  return current
}

/**
 * Section blocks are display-only dividers: they carry no number and do not
 * advance the count, so a survey with 3 questions and 2 sections is numbered
 * 1, 2, 3 with the sections left blank.
 */
function questionNumbers(questions: Question[]): Array<number | null> {
  let count = 0
  return questions.map((question) => {
    if (question.type === "section") return null
    count += 1
    return count
  })
}

type PanelPref = {
  side: "left" | "right"
  collapsed: boolean
  floating: boolean
  width: number
}

const OUTLINE_KEY = "tallyform.outline"
const OUTLINE_MIN = 210
const OUTLINE_MAX = 460
const RESULTS_PANEL_KEY = "tallyform.resultsPanel"

// A custom order for the survey picker in the Results panel. The list arrives
// sorted by "recently updated", which is the right default but not always the
// one you want to read in. Same trade-off as the result cards: a display
// preference only, and a reset is always one click away.
const SURVEY_ORDER_KEY = "tallyform.surveyOrder"

function loadSurveyOrder(): string[] {
  try {
    const raw = window.localStorage.getItem(SURVEY_ORDER_KEY)
    if (!raw) return []
    const order = JSON.parse(raw) as unknown
    if (!Array.isArray(order)) return []
    return order.filter((id): id is string => typeof id === "string")
  } catch {
    return []
  }
}

function saveSurveyOrder(ids: string[]) {
  try {
    if (ids.length === 0) window.localStorage.removeItem(SURVEY_ORDER_KEY)
    else window.localStorage.setItem(SURVEY_ORDER_KEY, JSON.stringify(ids))
  } catch {
    // List order is best-effort.
  }
}

const FOLDER_ORDER_KEY = "tallyform.folderOrder"

function loadFolderOrder(): string[] {
  try {
    const raw = window.localStorage.getItem(FOLDER_ORDER_KEY)
    if (!raw) return []
    const order = JSON.parse(raw) as unknown
    if (!Array.isArray(order)) return []
    return order.filter((id): id is string => typeof id === "string")
  } catch {
    return []
  }
}

function saveFolderOrder(ids: string[]) {
  try {
    if (ids.length === 0) window.localStorage.removeItem(FOLDER_ORDER_KEY)
    else window.localStorage.setItem(FOLDER_ORDER_KEY, JSON.stringify(ids))
  } catch {
    // Folder order is best-effort.
  }
}

const UNFILED = ""

export interface FolderSection {
  folder: Folder | null
  surveys: Survey[]
}

/**
 * Folders in their saved order, then any folder created since, then an Unfiled
 * group at the bottom.
 *
 * A survey pointing at a folder that no longer exists is treated as Unfiled
 * rather than dropped: the row would otherwise disappear from every group.
 */
function folderSections(
  folders: Folder[],
  surveys: Survey[],
  order: string[],
): FolderSection[] {
  const known = new Set(folders.map((folder) => folder.id))
  const byFolder = new Map<string, Survey[]>()
  for (const item of surveys) {
    const key = item.folderId && known.has(item.folderId) ? item.folderId : UNFILED
    const list = byFolder.get(key)
    if (list) list.push(item)
    else byFolder.set(key, [item])
  }
  const ranked = new Map(order.map((id, index) => [id, index]))
  const ordered = [...folders].sort(
    (a, b) =>
      (ranked.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (ranked.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  )
  return [
    ...ordered.map((folder) => ({
      folder,
      surveys: byFolder.get(folder.id) ?? [],
    })),
    { folder: null, surveys: byFolder.get(UNFILED) ?? [] },
  ]
}

// ---------------------------------------------------------------------------
// Result card order
// ---------------------------------------------------------------------------
// Reordering the cards is a reading preference and never touches the survey, so
// the builder, the tally flow and the CSV exports keep the question order they
// already had. Held as one map keyed by survey id rather than a key per survey,
// so a deleted survey does not leave an entry behind forever.

const RESULT_ORDER_KEY = "tallyform.resultOrder"

function loadResultOrder(surveyId: string): string[] {
  try {
    const raw = window.localStorage.getItem(RESULT_ORDER_KEY)
    if (!raw) return []
    const order = (JSON.parse(raw) as Record<string, unknown>)[surveyId]
    if (!Array.isArray(order)) return []
    return order.filter((id): id is string => typeof id === "string")
  } catch {
    return []
  }
}

function saveResultOrder(surveyId: string, order: string[]) {
  try {
    const raw = window.localStorage.getItem(RESULT_ORDER_KEY)
    const all = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>
    if (order.length === 0) delete all[surveyId]
    else all[surveyId] = order
    window.localStorage.setItem(RESULT_ORDER_KEY, JSON.stringify(all))
  } catch {
    // Card order is best-effort.
  }
}
const RESULTS_PANEL_MIN = 210
const RESULTS_PANEL_MAX = 420

function loadPanelPref(
  key: string,
  min: number,
  max: number,
  width: number,
): PanelPref {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PanelPref>
      if (parsed.side === "left" || parsed.side === "right") {
        return {
          side: parsed.side,
          collapsed: Boolean(parsed.collapsed),
          floating: Boolean(parsed.floating),
          width: Math.min(max, Math.max(min, Number(parsed.width) || width)),
        }
      }
    }
  } catch {
    // Fall through to defaults if storage is unavailable.
  }
  return { side: "right", collapsed: false, floating: false, width }
}

/**
 * A docked side panel: resizable by dragging its inner edge, mountable on either
 * side by dragging the header, collapsible to a rail, and floating instead of
 * docked if you prefer. Shared by the builder's question list and the results
 * view's survey list so the two are impossible to tell apart.
 */
/** Width of the minimised rail. Applied inline because the inline
    `--outline-w` would otherwise beat the `.outline-collapsed` rule. */
const OUTLINE_RAIL_W = 64

function outlineWidth(pref: PanelPref) {
  return pref.collapsed ? `${OUTLINE_RAIL_W}px` : `${pref.width}px`
}

function useDockablePanel(
  key: string,
  min: number,
  max: number,
  width: number,
  inner?: { current: HTMLElement | null },
) {
  const [pref, setPref] = useState<PanelPref>(() =>
    loadPanelPref(key, min, max, width),
  )
  const edgeScroll = useEdgeAutoScroll(inner)

  const update = (patch: Partial<PanelPref>) =>
    setPref((current) => {
      const next = { ...current, ...patch }
      try {
        window.localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Layout preference is best-effort.
      }
      return next
    })

  /** Drag the inner edge to resize; the panel grows away from the content. */
  const startResize = (event: React.PointerEvent) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = pref.width
    const side = pref.side
    edgeScroll.track(event.clientY)
    const onMove = (move: PointerEvent) => {
      edgeScroll.track(move.clientY)
      const delta = side === "right" ? startX - move.clientX : move.clientX - startX
      update({
        width: Math.min(max, Math.max(min, Math.round(startWidth + delta))),
      })
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      edgeScroll.stop()
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  /** Drag the header left or right to swap which side the panel sits on. */
  const startMove = (event: React.PointerEvent) => {
    event.preventDefault()
    const startX = event.clientX
    edgeScroll.track(event.clientY)
    const onMove = (move: PointerEvent) => edgeScroll.track(move.clientY)
    const onUp = (up: PointerEvent) => {
      const delta = up.clientX - startX
      if (Math.abs(delta) > 60) update({ side: delta > 0 ? "right" : "left" })
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      edgeScroll.stop()
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  return {
    pref,
    update,
    startResize,
    startMove,
    trackEdgeScroll: edgeScroll.track,
    stopEdgeScroll: edgeScroll.stop,
  }
}

type NavPref = {
  side: "left" | "right"
  width: number
}

const NAV_KEY = "tallyform.nav"
const NAV_MIN = 204
const NAV_MAX = 420

function loadNavPref(): NavPref {
  try {
    const raw = window.localStorage.getItem(NAV_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NavPref>
      if (parsed.side === "left" || parsed.side === "right") {
        return {
          side: parsed.side,
          width: Math.min(
            NAV_MAX,
            Math.max(NAV_MIN, Number(parsed.width) || 232),
          ),
        }
      }
    }
  } catch {
    // Fall through to defaults if storage is unavailable.
  }
  return { side: "left", width: 232 }
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`
}

// Debounced so rapid edits in the builder coalesce into a single round trip
// instead of firing a request per keystroke.
const SYNC_DEBOUNCE_MS = 700

/** How long the back-to-top button lingers after the last scroll event. */
const TO_TOP_HIDE_MS = 3000

function App() {
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [foldersOff, setFoldersOff] = useState(false)
  const [selectedId, setSelectedId] = useState<string>("")
  const [view, setView] = useState<View>("surveys")
  const [notice, setNotice] = useState("")
  const [loading, setLoading] = useState(true)
  // Distinguishes the first load from a background refresh. Only the first one
  // is allowed to replace the whole UI; later refreshes keep what is on screen
  // so a re-fetch never reads as a page reload.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [account, setAccount] = useState<Account | null>(null)
  const [accountChecked, setAccountChecked] = useState(false)
  // Set when supabase/accounts-migration.sql has not been run yet. The app then
  // behaves as it did before accounts existed rather than locking everyone out
  // behind a verification screen that no admin can clear.
  const [accountsOff, setAccountsOff] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [showToTop, setShowToTop] = useState(false)
  const toTopTimerRef = useRef(0)
  const [nav, setNav] = useState<NavPref>(loadNavPref)
  const edgeScroll = useEdgeAutoScroll()
  // Dragging the brand ends with a click the browser fires on the button, which
  // would also trigger "go home". A deadline rather than a flag, so a drag that
  // ends off the button and never produces a click can't swallow the next one.
  const brandClickBlockedUntilRef = useRef(0)
  const syncedRef = useRef<Workspace>({ surveys: [], folders: [], foldersAvailable: true })
  const survey = surveys.find((item) => item.id === selectedId) ?? surveys[0]

  // Deliberately the user id rather than the session object: Supabase hands out
  // a fresh session object on token refresh and on INITIAL_SESSION, and depending
  // on its identity re-runs the load effect, which flips `loading` back to true
  // and re-fetches everything — the app visibly reloads. The id is stable.
  const userId = session?.user?.id ?? null

  // Derived rather than corrected with a render-phase setView, which forced React
  // into an extra render pass on every tab change.
  const adminView =
    !accountsOff && (view === "accounts" || view === "feedback")
  const activeView: View = survey || adminView ? view : "surveys"

  // An account is only useful once an administrator has approved it. Everything
  // below this point assumes `canAccess`, and the gate itself is rendered
  // before the app shell.
  const canAccess = accountsOff || Boolean(account?.verified && !account.disabled)
  const isAdmin =
    canAccess && (accountsOff || account?.role === "admin")

  const checkAccount = useCallback(() => {
    fetchMyAccount()
      .then((found) => {
        setAccount(found)
        setAccountChecked(true)
      })
      .catch((error: unknown) => {
        if (error instanceof AccountsUnavailableError) {
          setAccountsOff(true)
          setAccountChecked(true)
          return
        }
        setNotice(describeStorageError(error))
        // Mark it settled either way: a failed read must not strand the user on
        // the "Checking your account…" screen for good.
        setAccountChecked(true)
      })
  }, [])

  // Runs on sign-in. A null profile means the sign-up trigger has not written the
  // row yet, which is treated as "no access" rather than "everything".
  useEffect(() => {
    if (!authReady) return
    if (!userId) {
      setAccount(null)
      setAccountChecked(true)
      return
    }
    setAccountChecked(false)
    checkAccount()
  }, [authReady, userId, checkAccount])

  // The waiting room polls, so approving an account in another tab lets the
  // waiting user straight in without signing in again.
  const needsApproval = Boolean(account && !canAccess)
  useEffect(() => {
    if (!userId || !needsApproval) return
    const timer = window.setInterval(checkAccount, 15000)
    return () => window.clearInterval(timer)
  }, [userId, needsApproval, checkAccount])

  useEffect(() => {
    let cancelled = false
    initAuth()
      .then((active) => {
        if (!cancelled) setSession(active)
      })
      .catch((error: unknown) => {
        if (!cancelled) setNotice(describeStorageError(error))
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true)
      })
    const unsubscribe = subscribeToSession(setSession)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  // Runs on sign-in and clears the workspace on sign-out, so one account's
  // surveys can never linger on screen after switching.
  useEffect(() => {
    if (!authReady) return

    if (!userId) {
      syncedRef.current = { surveys: [], folders: [], foldersAvailable: true }
      setSurveys([])
      setFolders([])
      setSelectedId("")
      setLoading(false)
      return
    }

    // Nothing to load until an administrator has approved the account, so the
    // unverified user never issues a query they are not allowed to see anyway.
    // `canAccess` is a dependency because it flips to true the moment the
    // account is approved, and that is when the load should start.
    if (!canAccess) return

    let cancelled = false
    setLoading(true)
    loadSurveys()
      .then((loaded) => {
        if (cancelled) return
        syncedRef.current = loaded
        setSurveys(loaded.surveys)
        setFolders(loaded.folders)
        setFoldersOff(!loaded.foldersAvailable)
        setSelectedId(loaded.surveys[0]?.id ?? "")
        setHasLoadedOnce(true)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setNotice(describeStorageError(error))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId, authReady, canAccess])

  useEffect(() => {
    if (loading || !userId) return
    const previous = syncedRef.current
    const timer = window.setTimeout(() => {
      syncSurveys({ surveys, folders, foldersAvailable: true }, previous)
        .then(() => {
          syncedRef.current = { surveys, folders, foldersAvailable: true }
        })
        .catch((error: unknown) => {
          setNotice(describeStorageError(error))
        })
    }, SYNC_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [surveys, folders, loading, userId])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(""), 3600)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY <= 400) {
        setShowToTop(false)
        return
      }
      setShowToTop(true)
      // It lives while you are scrolling and steps aside once you stop, instead
      // of sitting on the page for the rest of the session.
      window.clearTimeout(toTopTimerRef.current)
      toTopTimerRef.current = window.setTimeout(
        () => setShowToTop(false),
        TO_TOP_HIDE_MS,
      )
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.clearTimeout(toTopTimerRef.current)
    }
  }, [])

  // Each view remembers where you scrolled to, so moving between tabs puts you
  // back where you left instead of snapping to the top. useLayoutEffect runs
  // before paint, which avoids a visible jump to the top and back.
  const scrollPositionsRef = useRef<Partial<Record<View, number>>>({})
  const previousViewRef = useRef<View>(activeView)
  useLayoutEffect(() => {
    if (previousViewRef.current === activeView) return
    scrollPositionsRef.current[previousViewRef.current] = window.scrollY
    previousViewRef.current = activeView
    window.scrollTo(0, scrollPositionsRef.current[activeView] ?? 0)
  }, [activeView])

  const chooseTheme = (next: Theme) => {
    setTheme(next)
    saveTheme(next)
  }

  const updateSurvey = (id: string, updater: (current: Survey) => Survey) => {
    setSurveys((current) =>
      current.map((item) =>
        item.id === id
          ? { ...updater(item), updatedAt: new Date().toISOString() }
          : item,
      ),
    )
  }

  const openSurvey = (id: string, destination: View) => {
    setSelectedId(id)
    setView(destination)
  }

  const createSurvey = () => {
    const created = makeSurvey()
    setSurveys((current) => [created, ...current])
    openSurvey(created.id, "builder")
  }

  // -------------------------------------------------------------------------
  // Folders
  // -------------------------------------------------------------------------
  // Folders live in Supabase alongside the surveys, so an organisation set up
  // here follows the account to another device. The saved display orders are the
  // one exception: those are per browser.

  const createFolder = (rawName: string) => {
    const name = rawName.trim().slice(0, 80)
    if (!name) return
    setFolders((current) => [
      ...current,
      { id: uid(), name, createdAt: new Date().toISOString() },
    ])
    setNotice(`Folder “${name}” created`)
  }

  const renameFolder = (id: string, rawName: string) => {
    const name = rawName.trim().slice(0, 80)
    if (!name) return
    setFolders((current) =>
      current.map((folder) => (folder.id === id ? { ...folder, name } : folder)),
    )
  }

  /**
   * Removing a folder removes the surveys inside it too. The surveys leave the
   * state, so the existing sync diff deletes their rows, which cascades to their
   * responses. The saved display orders are trimmed as well, otherwise they keep
   * naming surveys and folders that no longer exist.
   */
  const deleteFolder = (id: string) => {
    const folder = folders.find((f) => f.id === id)
    const doomed = new Set(
      surveys.filter((item) => item.folderId === id).map((item) => item.id),
    )
    const surveyOrder = loadSurveyOrder().filter((surveyId) => !doomed.has(surveyId))
    saveSurveyOrder(surveyOrder)
    saveFolderOrder(loadFolderOrder().filter((folderId) => folderId !== id))
    setFolders((current) => current.filter((f) => f.id !== id))
    setSurveys((current) => current.filter((item) => !doomed.has(item.id)))
    setNotice(
      `Deleted “${folder?.name ?? "folder"}”${
        doomed.size ? ` and ${doomed.size} ${doomed.size === 1 ? "survey" : "surveys"}` : ""
      }`,
    )
  }

  const moveSurveyToFolder = (surveyId: string, folderId: string | null) => {
    setSurveys((current) =>
      current.map((item) =>
        item.id === surveyId
          ? { ...item, folderId: folderId || null }
          : item,
      ),
    )
  }

  if (!authReady) {
    return (
      <div className="empty-state">
        <h3>Loading…</h3>
      </div>
    )
  }

  if (!session) return <LoginScreen />

  if (loading && !hasLoadedOnce) {
    return (
      <div className="empty-state">
        <h3>Loading your surveys…</h3>
      </div>
    )
  }

  const setNavPref = (patch: Partial<NavPref>) =>
    setNav((current) => {
      const next = { ...current, ...patch }
      try {
        window.localStorage.setItem(NAV_KEY, JSON.stringify(next))
      } catch {
        // Layout preference is best-effort.
      }
      return next
    })

  /** Drag the inner edge to resize; the sidebar grows away from the content. */
  const startNavResize = (event: React.PointerEvent) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = nav.width
    edgeScroll.track(event.clientY)
    const onMove = (move: PointerEvent) => {
      edgeScroll.track(move.clientY)
      const delta =
        nav.side === "left" ? move.clientX - startX : startX - move.clientX
      setNavPref({
        width: Math.min(
          NAV_MAX,
          Math.max(NAV_MIN, Math.round(startWidth + delta)),
        ),
      })
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      edgeScroll.stop()
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  /** Drag the brand left or right to swap which side the sidebar sits on. */
  const startNavMove = (event: React.PointerEvent) => {
    event.preventDefault()
    const startX = event.clientX
    edgeScroll.track(event.clientY)
    const onMove = (move: PointerEvent) => edgeScroll.track(move.clientY)
    const onUp = (up: PointerEvent) => {
      const delta = up.clientX - startX
      if (Math.abs(delta) > 60) {
        brandClickBlockedUntilRef.current = Date.now() + 250
        setNavPref({ side: delta > 0 ? "right" : "left" })
      }
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      edgeScroll.stop()
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  if (userId && !accountChecked && !accountsOff) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-brand">
            <span className="brand-mark">
              <Icon name="check" size={19} />
            </span>
            <span>Tallyform</span>
          </div>
          <p className="login-foot">Checking your account…</p>
        </div>
      </div>
    )
  }

  if (userId && !canAccess) {
    return (
      <WaitingRoom
        account={account}
        onSignOut={() => {
          void signOutOfSupabase().catch((error: unknown) => {
            setNotice(describeStorageError(error))
          })
        }}
      />
    )
  }

  return (
    <>
    <div
      className={`app-shell nav-${nav.side}`}
      style={{ "--nav-w": `${nav.width}px` } as React.CSSProperties}
    >
      <aside className="sidebar">
        <span
          className="sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={startNavResize}
        />
        <button
          className="brand"
          onPointerDown={startNavMove}
          title="Drag to move the sidebar to the other side"
          onClick={() => {
            if (Date.now() < brandClickBlockedUntilRef.current) return
            setView("surveys")
          }}
          aria-label="Tallyform home"
        >
          <Icon name="grip" size={14} />
          <span className="brand-mark">
            <Icon name="check" size={19} />
          </span>
          <span>Tallyform</span>
        </button>
        <nav className="nav" aria-label="Primary navigation">
          <NavItem
            active={activeView === "surveys"}
            icon="surveys"
            label="Surveys"
            onClick={() => setView("surveys")}
          />
          <NavItem
            active={activeView === "builder"}
            disabled={!survey}
            icon="builder"
            label="Builder"
            onClick={() => setView("builder")}
          />
          <NavItem
            active={activeView === "tally"}
            disabled={!survey}
            icon="tally"
            label="Tally"
            onClick={() => setView("tally")}
          />
          <NavItem
            active={activeView === "results"}
            disabled={!survey}
            icon="results"
            label="Results"
            onClick={() => setView("results")}
          />
          {isAdmin && !accountsOff && (
            <>
              <NavItem
                active={activeView === "accounts"}
                icon="users"
                label="Accounts"
                onClick={() => setView("accounts")}
              />
              <NavItem
                active={activeView === "feedback"}
                icon="feedback"
                label="Feedback"
                onClick={() => setView("feedback")}
              />
            </>
          )}
        </nav>
        {!accountsOff && (
          <button
            className="feedback-button"
            type="button"
            onClick={() => setFeedbackOpen(true)}
          >
          <Icon name="feedback" />
            Send feedback
          </button>
        )}
        {loading && hasLoadedOnce && (
          <p className="sync-note" role="status">
            Refreshing…
          </p>
        )}
        <div className="theme-switch" role="group" aria-label="Colour theme">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={theme === option.value ? "active" : ""}
              aria-pressed={theme === option.value}
              onClick={() => chooseTheme(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="sidebar-foot">
          <div className="privacy-dot" />
          <div>
            <strong>{account?.username ?? "Signed in"}</strong>
            <span>
              {isAdmin ? "Administrator" : "Private to your account"}
            </span>
          </div>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              void signOutOfSupabase().catch((error: unknown) => {
                setNotice(describeStorageError(error))
              })
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="view-pane" hidden={activeView !== "surveys"}>
          <SurveyLibrary
            surveys={surveys}
            folders={folders}
            foldersAvailable={!foldersOff}
            onCreateFolder={createFolder}
            onRenameFolder={renameFolder}
            onDeleteFolder={deleteFolder}
            onCreate={createSurvey}
            onOpen={openSurvey}
            onDuplicate={(item) => {
              const copy = {
                ...item,
                id: uid(),
                title: `${item.title} copy`,
                responses: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
              setSurveys((current) => [copy, ...current])
              setNotice("Survey duplicated")
            }}
            onDelete={(id) => {
              if (
                window.confirm(
                  "Delete this survey and all of its response data?",
                )
              ) {
                setSurveys((current) =>
                  current.filter((item) => item.id !== id),
                )
                setNotice("Survey deleted")
              }
            }}
            onImport={(imported) => {
              setSurveys((current) => [
                {
                  ...imported,
                  id: uid(),
                  title: `${imported.title} (imported)`,
                },
                ...current,
              ])
              setNotice("Backup imported")
            }}
            />
        </div>
        <div className="view-pane" hidden={activeView !== "builder"}>
          {survey && (
            <SurveyBuilder
              key={survey.id}
              survey={survey}
              onChange={(next) => updateSurvey(survey.id, () => next)}
              onBack={() => setView("surveys")}
            />
          )}
        </div>
        <div className="view-pane" hidden={activeView !== "tally"}>
          {survey && (
            <TallyWorkspace
              key={survey.id}
              survey={survey}
              onChange={(next) => updateSurvey(survey.id, () => next)}
              onResults={() => setView("results")}
            />
          )}
        </div>
        <div className="view-pane" hidden={activeView !== "results"}>
          {survey && (
            <ResultsView
              survey={survey}
              surveys={surveys}
              folders={folders}
              foldersAvailable={!foldersOff}
              onCreateFolder={createFolder}
              onRenameFolder={renameFolder}
              onDeleteFolder={deleteFolder}
              onMoveSurvey={moveSurveyToFolder}
              onChange={(next) => updateSurvey(survey.id, () => next)}
              onSelect={setSelectedId}
              onBackToSurveys={() => setView("surveys")}
              onTally={() => setView("tally")}
            />
          )}
        </div>
        <div className="view-pane" hidden={activeView !== "accounts"}>
          {isAdmin && !accountsOff && userId && (
            <AccountsView selfId={userId} onNotice={setNotice} />
          )}
        </div>
        <div className="view-pane" hidden={activeView !== "feedback"}>
          {isAdmin && !accountsOff && <FeedbackView onNotice={setNotice} />}
        </div>
      </main>
      {notice && (
        <div className="toast" role="status">
          <Icon name="check" />
          {notice}
        </div>
      )}
      {showToTop && (
        <button
          className="to-top"
          type="button"
          aria-label="Back to top"
          onClick={() =>
            window.scrollTo({
              top: 0,
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                .matches
                ? "auto"
                : "smooth",
            })
          }
        >
          <Icon name="up" size={19} />
        </button>
      )}
    </div>
    {feedbackOpen && (
      <FeedbackDialog
        onClose={() => setFeedbackOpen(false)}
        onSent={setNotice}
      />
    )}
    </>
  )
}

function NavItem({
  active,
  icon,
  label,
  disabled,
  onClick,
}: {
  active: boolean
  icon: string
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      className={`nav-item ${active ? "active" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  )
}

function SurveyCard({
  item,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  item: Survey
  onOpen: (id: string, view: View) => void
  onDuplicate: (survey: Survey) => void
  onDelete: (id: string) => void
}) {
  return (
    <article className="survey-card">
      <div className="survey-card-top">
        <span className={`status status-${item.status}`}>{item.status}</span>
        <Button variant="ghost" aria-label={`More actions for ${item.title}`}>
          <Icon name="more" />
        </Button>
      </div>
      <div className="survey-card-copy">
        <h2>{item.title}</h2>
        <p>{item.description || "No description yet."}</p>
      </div>
      <div className="card-stats">
        <span>
          <strong>
            {item.questions.filter((q) => q.type !== "section").length}
          </strong>{" "}
          questions
        </span>
        <span>
          <strong>{item.responses.length}</strong> responses
        </span>
      </div>
      <div className="card-actions">
        <Button variant="primary" onClick={() => onOpen(item.id, "tally")}>
          Start tallying <Icon name="arrow" />
        </Button>
        <Button aria-label="Edit survey" onClick={() => onOpen(item.id, "builder")}>
          <Icon name="builder" />
        </Button>
        <Button aria-label="Duplicate survey" onClick={() => onDuplicate(item)}>
          <Icon name="copy" />
        </Button>
        <Button variant="ghost" aria-label="Delete survey" onClick={() => onDelete(item.id)}>
          <Icon name="trash" />
        </Button>
      </div>
    </article>
  )
}

/**
 * The "New folder" control. A button until it is pressed, then a name field,
 * so an empty folder row never sits in the list waiting to be filled in.
 */
function FolderCreate({
  onCreate,
}: {
  onCreate: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")

  if (!open) {
    return (
      <button
        className="add-question"
        type="button"
        onClick={() => {
          setOpen(true)
          setName("")
        }}
      >
        <Icon name="plus" size={15} />
        New folder
      </button>
    )
  }

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed)
    setName("")
    setOpen(false)
  }

  return (
    <div className="folder-create">
      <input
        className="input"
        value={name}
        autoFocus
        maxLength={80}
        placeholder="Folder name"
        aria-label="Folder name"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit()
          if (event.key === "Escape") setOpen(false)
        }}
      />
      <Button variant="primary" onClick={submit} disabled={!name.trim()}>
        <Icon name="check" size={14} />
        Add
      </Button>
      <Button onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  )
}

/**
 * Rename and delete for one folder.
 *
 * Deleting a folder takes its surveys and their responses with it, so the count
 * is spelled out before the button rather than discovered afterwards. The
 * confirmation lives here instead of in a window.confirm, which cannot say what
 * would be lost.
 */
function FolderEdit({
  folder,
  surveyCount,
  onRename,
  onDelete,
  onClose,
}: {
  folder: Folder
  surveyCount: number
  onRename: (name: string) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(folder.name)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="folder-edit">
      <input
        className="input"
        value={name}
        autoFocus
        maxLength={80}
        aria-label="Folder name"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && name.trim()) onRename(name.trim())
          if (event.key === "Escape") onClose()
        }}
      />
      <div className="folder-edit-actions">
        <Button
          variant="primary"
          disabled={!name.trim() || name.trim() === folder.name}
          onClick={() => onRename(name.trim())}
        >
          <Icon name="check" size={14} />
          Save name
        </Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={() => setConfirming(true)}>
          <Icon name="trash" size={14} />
          Delete folder
        </Button>
      </div>

      {confirming && (
        <div className="folder-confirm">
          <p>
            <strong>{folder.name}</strong> holds {surveyCount}{" "}
            {surveyCount === 1 ? "survey" : "surveys"}. Deleting it deletes{" "}
            {surveyCount === 1 ? "that survey" : "those surveys"} and every
            response tallied in {surveyCount === 1 ? "it" : "them"}. This cannot
            be undone.
          </p>
          <div className="folder-edit-actions">
            <Button
              variant="danger"
              onClick={() => {
                onDelete()
                onClose()
              }}
            >
              <Icon name="trash" size={14} />
              Delete folder and {surveyCount}{" "}
              {surveyCount === 1 ? "survey" : "surveys"}
            </Button>
            <Button onClick={() => setConfirming(false)}>Keep it</Button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * A folder's heading. Collapses its group, opens the rename/delete panel, and
 * is both a drop target for surveys and a drag source for reordering folders.
 */
function FolderHead({
  folder,
  count,
  expanded,
  editing,
  onToggle,
  onEdit,
  dragProps,
  dropProps,
  dragOver,
  dragging,
}: {
  folder: Folder | null
  count: number
  expanded: boolean
  editing: boolean
  onToggle: () => void
  onEdit: () => void
  dragProps?: HTMLAttributes<HTMLElement>
  dropProps?: HTMLAttributes<HTMLElement>
  dragOver?: boolean
  dragging?: boolean
}) {
  const label = folder ? folder.name : "Unfiled"
  return (
    <div
      className={`folder-head ${folder ? "" : "unfiled"} ${
        dragOver ? "drop-target" : ""
      } ${dragging ? "dragging" : ""}`}
      {...dragProps}
      {...dropProps}
    >
      <button
        className="folder-toggle"
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
      >
        <Icon name={expanded ? "up" : "arrow"} size={13} />
      </button>
      <span className="folder-name">{label}</span>
      <span className="folder-count">{count}</span>
      {folder && (
        <button
          className="folder-menu"
          type="button"
          aria-label={`Rename or delete ${label}`}
          title="Rename or delete"
          onClick={onEdit}
        >
          <Icon name="more" size={14} />
        </button>
      )}
      {editing && folder && <span className="folder-editing-dot" aria-hidden="true" />}
    </div>
  )
}

function SurveyLibrary({
  surveys,
  folders,
  foldersAvailable,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onCreate,
  onOpen,
  onDuplicate,
  onDelete,
  onImport,
}: {
  surveys: Survey[]
  folders: Folder[]
  foldersAvailable: boolean
  onCreateFolder: (name: string) => void
  onRenameFolder: (id: string, name: string) => void
  onDeleteFolder: (id: string) => void
  onCreate: () => void
  onOpen: (id: string, view: View) => void
  onDuplicate: (survey: Survey) => void
  onDelete: (id: string) => void
  onImport: (survey: Survey) => void
}) {
  const [search, setSearch] = useState("")
  const [editingId, setEditingId] = useState("")
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [name, setName] = useState("")
  const importRef = useRef<HTMLInputElement>(null)
  const filtered = surveys.filter((survey) =>
    survey.title.toLowerCase().includes(search.toLowerCase()),
  )
  const sections = foldersAvailable
    ? folderSections(folders, filtered, [])
    : [{ folder: null, surveys: filtered }]
  const totalResponses = surveys.reduce(
    (sum, item) => sum + item.responses.length,
    0,
  )

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      if (
        !parsed.title ||
        !Array.isArray(parsed.questions) ||
        !Array.isArray(parsed.responses)
      )
        throw new Error()
      onImport(parsed)
    } catch {
      window.alert("That file is not a valid Tallyform backup.")
    }
    event.target.value = ""
  }

  return (
    <div className="page page-library">
      <header className="page-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Surveys</h1>
          <p>Build a format once. Tally every response in seconds.</p>
        </div>
        <div className="header-actions">
          <input
            ref={importRef}
            className="sr-only"
            type="file"
            accept=".json,application/json"
            onChange={importJson}
          />
          <Button onClick={() => importRef.current?.click()}>
            <Icon name="download" />
            Import
          </Button>
          <Button variant="primary" onClick={onCreate}>
            <Icon name="plus" />
            New survey
          </Button>
        </div>
      </header>
      <section className="metrics-strip">
        <Metric value={surveys.length} label="Surveys" />
        <Metric value={totalResponses} label="Responses tallied" />
        <Metric
          value={surveys.filter((item) => item.status === "active").length}
          label="Active formats"
        />
      </section>
      <div className="library-toolbar">
        <div className="search">
          <Icon name="search" />
          <TextInput
            aria-label="Search surveys"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search surveys..."
          />
        </div>
        <span>
          {filtered.length} {filtered.length === 1 ? "survey" : "surveys"}
        </span>
      </div>
      {foldersAvailable && (
        <div className="library-folders">
          <FolderCreate onCreate={onCreateFolder} />
        </div>
      )}

      {sections.map((section) => {
        const key = section.folder?.id ?? UNFILED
        const expanded = collapsed[key] === undefined ? true : !collapsed[key]
        // With no folders to show and nothing filed, the Unfiled heading is just
        // a label above the grid, so it is left out.
        const showHead = foldersAvailable && (section.folder !== null || sections.length > 1)
        if (!showHead && section.surveys.length === 0) return null
        return (
          <div className="folder-section" key={key}>
            {showHead && (
              <FolderHead
                folder={section.folder}
                count={section.surveys.length}
                expanded={expanded}
                editing={editingId === key}
                onToggle={() => setCollapsed((c) => ({ ...c, [key]: expanded }))}
                onEdit={() => {
                  setEditingId(editingId === key ? "" : key)
                  setName("")
                }}
              />
            )}
            {editingId === key && section.folder && (
              <FolderEdit
                folder={section.folder}
                surveyCount={section.surveys.length}
                onRename={(name) => {
                  onRenameFolder(section.folder!.id, name)
                  setEditingId("")
                }}
                onDelete={() => onDeleteFolder(section.folder!.id)}
                onClose={() => setEditingId("")}
              />
            )}
            {expanded && section.surveys.length > 0 && (
              <section className="survey-grid">
                {section.surveys.map((item) => (
                  <SurveyCard
                    key={item.id}
                    item={item}
                    onOpen={onOpen}
                    onDuplicate={onDuplicate}
                    onDelete={onDelete}
                  />
                ))}
              </section>
            )}
          </div>
        )
      })}

      <section className="survey-grid">
        <button className="new-card" onClick={onCreate}>
          <span>
            <Icon name="plus" />
          </span>
          <strong>Create a survey</strong>
          <small>Start from a blank format</small>
        </button>
      </section>
    </div>
  )
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function SurveyBuilder({
  survey,
  onChange,
  onBack,
}: {
  survey: Survey
  onChange: (survey: Survey) => void
  onBack: () => void
}) {
  const [selected, setSelected] = useState(survey.questions[0]?.id ?? "")
  const [savedNotice, setSavedNotice] = useState(false)
  const [addCount, setAddCount] = useState("1")
  const [insertPosition, setInsertPosition] = useState("end")
  const [pendingType, setPendingType] = useState<QuestionType>("single")
  const [pendingQuestions, setPendingQuestions] = useState<Question[]>([])
  const outlineListRef = useRef<HTMLDivElement>(null)
  const {
    pref: outline,
    update: setOutlinePref,
    startResize,
    startMove,
    trackEdgeScroll: trackOutlineScroll,
    stopEdgeScroll: stopOutlineScroll,
  } = useDockablePanel(
    OUTLINE_KEY,
    OUTLINE_MIN,
    OUTLINE_MAX,
    260,
    outlineListRef,
  )
  const update = (patch: Partial<Survey>) => onChange({ ...survey, ...patch })

  const saveForm = () => {
    update({ status: "active" })
    setSavedNotice(true)
  }

  useEffect(() => {
    if (!savedNotice) return
    const timer = window.setTimeout(() => setSavedNotice(false), 2600)
    return () => window.clearTimeout(timer)
  }, [savedNotice])
  const updateQuestion = (id: string, patch: Partial<Question>) =>
    update({
      questions: survey.questions.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    })
  const addQuestion = (type: QuestionType) => {
    setPendingType(type)
    setAddCount("1")
    setPendingQuestions([makeQuestion(type)])
  }

  /**
   * Growing the batch keeps whatever the operator has already typed, and only
   * appends fresh blanks of the same type. Shrinking trims from the end.
   */
  const setPendingCount = (value: string) => {
    const parsed = Number(value)
    if (value === "" || !Number.isFinite(parsed) || parsed < 1) {
      setAddCount("")
      return
    }
    const safeCount = Math.min(100, Math.floor(parsed))
    setAddCount(String(safeCount))
    setPendingQuestions((current) => {
      if (current.length === safeCount) return current
      if (current.length > safeCount) return current.slice(0, safeCount)
      const extra = Array.from({ length: safeCount - current.length }, () =>
        makeQuestion(pendingType),
      )
      return [...current, ...extra]
    })
  }
  const commitPendingQuestions = () => {
    if (!pendingQuestions.length) return
    const next = [...survey.questions]
    const insertionIndex =
      insertPosition === "start"
        ? 0
        : insertPosition === "end"
          ? next.length
          : Math.max(
              0,
              next.findIndex((question) => question.id === insertPosition) + 1,
            )
    next.splice(insertionIndex, 0, ...pendingQuestions)
    update({ questions: next })
    setSelected(pendingQuestions[0].id)
    setPendingQuestions([])
    setAddCount("1")
  }
  const move = (id: string, direction: number) => {
    const from = survey.questions.findIndex((item) => item.id === id)
    const to = from + direction
    if (to < 0 || to >= survey.questions.length) return
    const next = [...survey.questions]
    ;[next[from], next[to]] = [next[to], next[from]]
    update({ questions: next })
  }
  const reorder = (sourceId: string, targetId: string) => {
    if (!sourceId || sourceId === targetId) return
    const next = [...survey.questions]
    const sourceIndex = next.findIndex((question) => question.id === sourceId)
    const targetIndex = next.findIndex((question) => question.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0) return
    const [moved] = next.splice(sourceIndex, 1)
    next.splice(targetIndex, 0, moved)
    update({ questions: next })
  }
  const valid =
    survey.title.trim() &&
    survey.questions.some((q) => q.type !== "section") &&
    survey.questions.every(
      (q) =>
        q.prompt.trim() &&
        (!["single", "multiple", "yesno"].includes(q.type) ||
          q.options.filter((o) => o.label.trim()).length >= 2),
    )

  const outlineNumbers = questionNumbers(survey.questions)

  const positionLabel =
    insertPosition === "start"
      ? "at the beginning"
      : insertPosition === "end"
        ? "at the end"
        : `after question ${
            survey.questions.findIndex(
              (question) => question.id === insertPosition,
            ) + 1
          }`

  return (
    <div className="page builder-page">
      <header className="compact-header">
        <div>
          <button className="back-link" onClick={onBack}>
            <Icon name="back" />
            Builder
          </button>
          <h1>{survey.title || "Untitled survey"}</h1>
        </div>
        <div className="header-actions">
          <span className={`status status-${survey.status}`}>
            {survey.status}
          </span>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={saveForm}
          >
            Save form
          </Button>
          {savedNotice && (
            <span className="saved-note" role="status">
              Form saved
            </span>
          )}
        </div>
      </header>
      <div
          className={`builder-layout outline-${outline.side}${
            outline.collapsed ? " outline-collapsed" : ""
          }${outline.floating ? " outline-floating" : ""}`}
          style={{ "--outline-w": outlineWidth(outline) } as React.CSSProperties}
        >
          <aside className="builder-outline">
            <span
              className="outline-resizer"
              onPointerDown={startResize}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize question panel"
            />
            <div
              className="outline-head"
              onPointerDown={startMove}
              title="Drag to move the panel to the other side"
            >
              <Icon name="grip" size={14} />
              <span className="outline-title">Questions</span>
              <span className="outline-count">
                {survey.questions.filter((q) => q.type !== "section").length}
              </span>
              <button
                className="outline-float"
                type="button"
                aria-label={
                  outline.floating
                    ? "Dock the question panel"
                    : "Float the question panel"
                }
                aria-pressed={outline.floating}
                title={
                  outline.floating
                    ? "Dock the question panel"
                    : "Float the question panel"
                }
                onClick={() =>
                  setOutlinePref({ floating: !outline.floating })
                }
              >
                <Icon name={outline.floating ? "dock" : "float"} size={14} />
              </button>
              <button
                className="outline-collapse"
                type="button"
                aria-label={
                  outline.collapsed
                    ? "Expand question panel"
                    : "Minimise question panel"
                }
                aria-expanded={!outline.collapsed}
                onClick={() =>
                  setOutlinePref({ collapsed: !outline.collapsed })
                }
              >
                <Icon name={outline.collapsed ? "back" : "up"} size={14} />
              </button>
            </div>
            {outline.collapsed ? null : (
              <>
                <div className="add-menu">
            <button
              className="add-question"
              type="button"
              title="Add a question, then choose its type"
              onClick={() => addQuestion(pendingType)}
            >
              <Icon name="plus" size={15} />
              Add question
            </button>
          </div>
          <div
            className="question-list"
            ref={outlineListRef}
            onDragOver={(event) => {
              event.preventDefault()
              trackOutlineScroll(event.clientY)
            }}
            onDrop={stopOutlineScroll}
            onDragLeave={stopOutlineScroll}
          >
            {survey.questions.map((question, index) => (
              <button
                key={question.id}
                draggable
                className={`question-list-item ${
                  selected === question.id ? "active" : ""
                }`}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", question.id)
                  trackOutlineScroll(event.clientY)
                }}
                onDragEnd={stopOutlineScroll}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  reorder(
                    event.dataTransfer.getData("text/plain"),
                    question.id,
                  )
                }}
                onClick={() => {
                  setSelected(question.id)
                  document
                    .getElementById(`question-${question.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "center" })
                }}
              >
                <Icon name="grip" size={14} />
                <span
                  className={`question-number${
                    outlineNumbers[index] === null ? " empty" : ""
                  }`}
                >
                  {outlineNumbers[index] ?? ""}
                </span>
                <span>
                  <strong>{question.prompt || "Untitled"}</strong>
                  <small>{TYPE_LABELS[question.type]}</small>
                </span>
              </button>
            ))}
            </div>
              </>
            )}
          </aside>
        <section className="builder-editor">
          <div className="survey-settings card">
            <div className="section-title">
              <div>
                <p className="eyebrow">Survey details</p>
                <h2>Set the context</h2>
              </div>
            </div>
            <div className="form-grid">
              <Field label="Survey title">
                <TextInput
                  value={survey.title}
                  onChange={(e) => update({ title: e.target.value })}
                />
              </Field>
              <Field label="Respondent identifier">
                <TextInput
                  value={survey.identifierLabel}
                  onChange={(e) => update({ identifierLabel: e.target.value })}
                />
              </Field>
              <Field label="Instructions">
                <TextArea
                  rows={2}
                  value={survey.description}
                  placeholder="Optional note for tally operators"
                  onChange={(e) => update({ description: e.target.value })}
                />
              </Field>
            </div>
          </div>
          {survey.questions.length ? (
            <div className="all-question-editors">
              {survey.questions.map((selectedQuestion, questionIndex) => (
            <div
              className={`question-editor card ${
                selectedQuestion.type === "section" ? "section-card" : ""
              }`}
              id={`question-${selectedQuestion.id}`}
              key={selectedQuestion.id}
              draggable
              onFocus={() => setSelected(selectedQuestion.id)}
              onDragStart={(event) =>
                event.dataTransfer.setData(
                  "text/plain",
                  selectedQuestion.id,
                )
              }
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                reorder(
                  event.dataTransfer.getData("text/plain"),
                  selectedQuestion.id,
                )
              }}
            >
              <div className="section-title">
                <div>
                  <p className="eyebrow">
                    {selectedQuestion.type === "section"
                      ? `Section ${
                          survey.questions
                            .slice(0, questionIndex + 1)
                            .filter((question) => question.type === "section")
                            .length
                        } · ${sectionCoverage(survey, selectedQuestion.id)}`
                      : `${TYPE_LABELS[selectedQuestion.type]} · Question ${
                          survey.questions
                            .slice(0, questionIndex + 1)
                            .filter((question) => question.type !== "section")
                            .length
                        }`}
                  </p>
                  <h2>
                    {selectedQuestion.type === "section"
                      ? "Edit section"
                      : "Edit question"}
                  </h2>
                </div>
                <div className="icon-actions">
                  <Button
                    variant="ghost"
                    onClick={() => move(selectedQuestion.id, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => move(selectedQuestion.id, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label="Duplicate question"
                    onClick={() => {
                      const clone = {
                        ...selectedQuestion,
                        id: uid(),
                        options: selectedQuestion.options.map((o) => ({
                          ...o,
                          id: uid(),
                        })),
                      }
                      update({ questions: [...survey.questions, clone] })
                      setSelected(clone.id)
                    }}
                  >
                    <Icon name="copy" />
                  </Button>
                  <Button
                    variant="danger"
                    aria-label="Delete question"
                    onClick={() => {
                      const deletedIndex = survey.questions.findIndex(
                        (question) => question.id === selectedQuestion.id,
                      )
                      const remaining = survey.questions.filter(
                        (question) => question.id !== selectedQuestion.id,
                      )
                      update({ questions: remaining })
                      setSelected(
                        remaining[deletedIndex]?.id ??
                          remaining[deletedIndex - 1]?.id ??
                          "",
                      )
                    }}
                  >
                    <Icon name="trash" />
                  </Button>
                </div>
              </div>
              <div className="form-grid">
                <Field
                  label={
                    selectedQuestion.type === "section"
                      ? "Section heading"
                      : "Question"
                  }
                >
                  <TextArea
                    value={selectedQuestion.prompt}
                    onChange={(e) =>
                      updateQuestion(selectedQuestion.id, {
                        prompt: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Question type">
                  <SelectInput
                    value={selectedQuestion.type}
                    onChange={(e) =>
                      updateQuestion(selectedQuestion.id, {
                        ...makeQuestion(e.target.value as QuestionType),
                        id: selectedQuestion.id,
                        prompt: selectedQuestion.prompt,
                      })
                    }
                  >
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Helper text">
                  <TextArea
                    value={selectedQuestion.helpText}
                    placeholder="Optional guidance"
                    onChange={(e) =>
                      updateQuestion(selectedQuestion.id, {
                        helpText: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>
              {["single", "multiple", "yesno"].includes(
                selectedQuestion.type,
              ) && (
                <div className="options-editor">
                  <div className="field-label">Answer options</div>
                  {selectedQuestion.options.map((option, index) => (
                    <div className="option-row" key={option.id}>
                      <kbd>{index + 1}</kbd>
                      <TextInput
                        value={option.label}
                        onChange={(e) =>
                          updateQuestion(selectedQuestion.id, {
                            options: selectedQuestion.options.map((o) =>
                              o.id === option.id
                                ? { ...o, label: e.target.value }
                                : o,
                            ),
                          })
                        }
                      />
                      <Button
                        variant="ghost"
                        onClick={() =>
                          updateQuestion(selectedQuestion.id, {
                            options: selectedQuestion.options.filter(
                              (o) => o.id !== option.id,
                            ),
                          })
                        }
                      >
                        <Icon name="trash" />
                      </Button>
                    </div>
                  ))}
                  {selectedQuestion.type !== "yesno" && (
                    <Button
                      onClick={() =>
                        updateQuestion(selectedQuestion.id, {
                          options: [
                            ...selectedQuestion.options,
                            {
                              id: uid(),
                              label: `Option ${selectedQuestion.options.length + 1}`,
                            },
                          ],
                        })
                      }
                    >
                      <Icon name="plus" />
                      Add option
                    </Button>
                  )}
                </div>
              )}
              {["rating", "number"].includes(selectedQuestion.type) && (
                <>
                  <div className="range-row">
                    <Field label="Minimum">
                      <TextInput
                        type="number"
                        value={selectedQuestion.min}
                        onChange={(e) =>
                          updateQuestion(selectedQuestion.id, {
                            min: Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                    <Field label="Maximum">
                      <TextInput
                        type="number"
                        value={selectedQuestion.max}
                        onChange={(e) =>
                          updateQuestion(selectedQuestion.id, {
                            max: Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                  </div>
                  {selectedQuestion.type === "rating" && (
                    <div className="scale-label-editor">
                      <div>
                        <span className="field-label">
                          What each number means
                        </span>
                        <small>
                          Add a label for every point respondents can choose.
                        </small>
                      </div>
                      {ratingValues(selectedQuestion).map((value) => (
                        <Field key={value} label={`Rating ${value}`}>
                        <TextInput
                            value={ratingLabel(selectedQuestion, value)}
                            placeholder={`Meaning of ${value}`}
                          onChange={(e) =>
                            updateQuestion(selectedQuestion.id, {
                                scaleLabels: {
                                  ...(selectedQuestion.scaleLabels ?? {}),
                                  [String(value)]: e.target.value,
                                },
                            })
                          }
                        />
                      </Field>
                      ))}
                    </div>
                  )}
                </>
              )}
              {selectedQuestion.type !== "section" && (
                <div className="rules-row">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={selectedQuestion.required}
                      onChange={(e) =>
                        updateQuestion(selectedQuestion.id, {
                          required: e.target.checked,
                        })
                      }
                    />
                    <span />
                    Required answer
                  </label>
                  <Field label="Show only when">
                    <SelectInput
                      value={selectedQuestion.condition?.questionId ?? ""}
                      onChange={(e) =>
                        updateQuestion(selectedQuestion.id, {
                          condition: e.target.value
                            ? {
                                questionId: e.target.value,
                                operator: "equals",
                                value: "",
                              }
                            : undefined,
                        })
                      }
                    >
                      <option value="">Always visible</option>
                      {survey.questions
                        .filter(
                          (q) =>
                            survey.questions.indexOf(q) <
                              survey.questions.indexOf(selectedQuestion) &&
                            q.type !== "section",
                        )
                        .map((q) => (
                          <option value={q.id} key={q.id}>
                            {q.prompt}
                          </option>
                        ))}
                    </SelectInput>
                  </Field>
                  {selectedQuestion.condition && (
                    <TextInput
                      aria-label="Condition value"
                      placeholder="Answer value or option ID"
                      value={selectedQuestion.condition.value}
                      onChange={(e) =>
                        updateQuestion(selectedQuestion.id, {
                          condition: {
                            ...selectedQuestion.condition!,
                            value: e.target.value,
                          },
                        })
                      }
                    />
                  )}
                </div>
              )}
            </div>
              ))}
            </div>
          ) : (
            <div className="empty-editor">
              <span>
                <Icon name="plus" />
              </span>
              <h2>Add your first question</h2>
              <p>Choose a format from the left to begin building.</p>
            </div>
          )}
        </section>
      </div>
      {pendingQuestions.length > 0 && (
        <BatchQuestionEditor
          questions={pendingQuestions}
          count={addCount}
          position={insertPosition}
          positionLabel={positionLabel}
          positionOptions={survey.questions}
          onCountChange={setPendingCount}
          onPositionChange={setInsertPosition}
          onChange={setPendingQuestions}
          onCancel={() => setPendingQuestions([])}
          onAdd={commitPendingQuestions}
        />
      )}
    </div>
  )
}

function BatchQuestionEditor({
  questions,
  count,
  position,
  positionLabel,
  positionOptions,
  onCountChange,
  onPositionChange,
  onChange,
  onCancel,
  onAdd,
}: {
  questions: Question[]
  count: string
  position: string
  positionLabel: string
  positionOptions: Question[]
  onCountChange: (value: string) => void
  onPositionChange: (value: string) => void
  onChange: (questions: Question[]) => void
  onCancel: () => void
  onAdd: () => void
}) {
  const draftNumbers = questionNumbers(questions)

  const updateDraft = (id: string, patch: Partial<Question>) =>
    onChange(
      questions.map((question) =>
        question.id === id ? { ...question, ...patch } : question,
      ),
    )
  const copySettingsToAll = (source: Question) =>
    onChange(
      questions.map((question) =>
        question.id === source.id
          ? question
          : {
              ...question,
              type: source.type,
              helpText: source.helpText,
              required: source.type === "section" ? false : source.required,
              options: source.options.map((option) => ({
                ...option,
                id: uid(),
              })),
              min: source.min,
              max: source.max,
              minLabel: source.minLabel,
              maxLabel: source.maxLabel,
              scaleLabels: { ...(source.scaleLabels ?? {}) },
              condition: undefined,
            },
      ),
    )
  const valid = questions.every(
    (question) =>
      question.prompt.trim() &&
      (!["single", "multiple", "yesno"].includes(question.type) ||
        (question.options.length >= 2 &&
          question.options.every((option) => option.label.trim()))) &&
      (!["rating", "number"].includes(question.type) ||
        question.max >= question.min),
  )

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="batch-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-editor-title"
      >
        <header className="batch-header">
          <div>
            <p className="eyebrow">Review before adding</p>
            <h2 id="batch-editor-title">
              Edit {questions.length}{" "}
              {questions.length === 1 ? "question" : "questions"}
            </h2>
            <span>
              These questions will be added {positionLabel}. Nothing is saved
              until you select Add all.
            </span>
            <div className="batch-controls">
              <Field label="How many">
                <TextInput
                  type="number"
                  min={1}
                  max={100}
                  inputMode="numeric"
                  value={count}
                  onChange={(event) => onCountChange(event.target.value)}
                />
              </Field>
              <Field label="Add position">
                <SelectInput
                  value={position}
                  onChange={(event) => onPositionChange(event.target.value)}
                >
                  <option value="end">At the end</option>
                  <option value="start">At the beginning</option>
                  {positionOptions.map((question, index) => (
                    <option value={question.id} key={question.id}>
                      After {index + 1}. {question.prompt}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
          </div>
          <button
            className="modal-close"
            type="button"
            aria-label="Close"
            title="Close"
            onClick={onCancel}
          >
            <Icon name="close" size={17} />
          </button>
        </header>
        <div className="batch-list">
          {questions.map((question, index) => (
            <article className="batch-question" key={question.id}>
              <span
                className={`question-number${
                  draftNumbers[index] === null ? " empty" : ""
                }`}
              >
                {draftNumbers[index] ?? ""}
              </span>
              <div className="batch-question-content">
                <div className="batch-question-fields">
                  <Field
                    label={
                      question.type === "section"
                        ? "Section heading"
                        : "Question"
                    }
                  >
                    <TextArea
                      autoFocus={index === 0}
                      value={question.prompt}
                      onChange={(event) =>
                        updateDraft(question.id, {
                          prompt: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Type">
                    <SelectInput
                      value={question.type}
                      onChange={(event) => {
                        const template = makeQuestion(
                          event.target.value as QuestionType,
                        )
                        updateDraft(question.id, {
                          ...template,
                          id: question.id,
                          prompt: question.prompt,
                          helpText: question.helpText,
                        })
                      }}
                    >
                      {Object.entries(TYPE_LABELS).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                  {question.type !== "section" && (
                    <label className="toggle batch-required">
                      <input
                        type="checkbox"
                        checked={question.required}
                        onChange={(event) =>
                          updateDraft(question.id, {
                            required: event.target.checked,
                          })
                        }
                      />
                      <span />
                      Required
                    </label>
                  )}
                </div>
                <div className="batch-question-settings">
                  <Field label="Helper text">
                    <TextArea
                      value={question.helpText}
                      placeholder="Optional instructions"
                      onChange={(event) =>
                        updateDraft(question.id, {
                          helpText: event.target.value,
                        })
                      }
                    />
                  </Field>
                  {["rating", "number"].includes(question.type) && (
                    <div className="batch-range">
                      <Field label="Minimum">
                        <TextInput
                          type="number"
                          value={question.min}
                          onChange={(event) =>
                            updateDraft(question.id, {
                              min: Number(event.target.value),
                            })
                          }
                        />
                      </Field>
                      <Field label="Maximum">
                        <TextInput
                          type="number"
                          value={question.max}
                          onChange={(event) =>
                            updateDraft(question.id, {
                              max: Number(event.target.value),
                            })
                          }
                        />
                      </Field>
                      {question.type === "rating" && (
                        <>
                          {ratingValues(question).map((value) => (
                            <Field key={value} label={`Rating ${value}`}>
                              <TextInput
                                value={ratingLabel(question, value)}
                                placeholder={`Meaning of ${value}`}
                                onChange={(event) =>
                                  updateDraft(question.id, {
                                    scaleLabels: {
                                      ...(question.scaleLabels ?? {}),
                                      [String(value)]: event.target.value,
                                    },
                                  })
                                }
                              />
                            </Field>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                  {["single", "multiple", "yesno"].includes(question.type) && (
                    <div className="batch-options">
                      <span className="field-label">Answer options</span>
                      <div>
                        {question.options.map((option, optionIndex) => (
                          <div className="batch-option" key={option.id}>
                            <kbd>{optionIndex + 1}</kbd>
                            <TextInput
                              aria-label={`Option ${optionIndex + 1}`}
                              value={option.label}
                              onChange={(event) =>
                                updateDraft(question.id, {
                                  options: question.options.map((item) =>
                                    item.id === option.id
                                      ? { ...item, label: event.target.value }
                                      : item,
                                  ),
                                })
                              }
                            />
                            <Button
                              variant="ghost"
                              aria-label={`Remove option ${optionIndex + 1}`}
                              onClick={() =>
                                updateDraft(question.id, {
                                  options: question.options.filter(
                                    (item) => item.id !== option.id,
                                  ),
                                })
                              }
                            >
                              <Icon name="trash" size={15} />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Button
                        onClick={() =>
                          updateDraft(question.id, {
                            options: [
                              ...question.options,
                              {
                                id: uid(),
                                label: `Option ${question.options.length + 1}`,
                              },
                            ],
                          })
                        }
                      >
                        <Icon name="plus" size={15} />
                        Add option
                      </Button>
                    </div>
                  )}
                  {questions.length > 1 && (
                    <Button
                      className="copy-settings"
                      onClick={() => copySettingsToAll(question)}
                    >
                      <Icon name="copy" />
                      Apply these settings to all questions
                    </Button>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                aria-label={`Remove draft question ${index + 1}`}
                onClick={() =>
                  onChange(
                    questions.filter((item) => item.id !== question.id),
                  )
                }
              >
                <Icon name="trash" />
              </Button>
            </article>
          ))}
        </div>
        <footer className="batch-footer">
          <Button
            onClick={() =>
              onChange([...questions, makeQuestion("single")])
            }
          >
            <Icon name="plus" />
            Add another
          </Button>
          <div>
            <span>
              {questions.length}{" "}
              {questions.length === 1 ? "question" : "questions"} ready
            </span>
            <Button variant="primary" disabled={!valid} onClick={onAdd}>
              <Icon name="check" />
              Add all questions
            </Button>
          </div>
        </footer>
      </section>
    </div>
  )
}

/**
 * An in-progress response, kept on this device so a closed tab or a reload
 * mid-tally can be picked up on the same respondent. Keyed by survey, which is
 * safe to share between accounts: survey ids are unique, and row-level security
 * means only the owner ever loads a given one.
 */
type TallyDraft = {
  identifier: string
  answers: Record<string, Answer>
  activeIndex: number
  mode: TallyMode
  savedAt: string
}

function draftKey(surveyId: string) {
  return `tallyform.draft.${surveyId}`
}

function loadTallyDraft(surveyId: string): TallyDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(surveyId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<TallyDraft>
    if (!parsed.answers || typeof parsed.answers !== "object") return null
    return {
      identifier: typeof parsed.identifier === "string" ? parsed.identifier : "",
      answers: parsed.answers,
      activeIndex: Math.max(0, Number(parsed.activeIndex) || 0),
      mode: parsed.mode === "tap" || parsed.mode === "grid" ? parsed.mode : "quick",
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    }
  } catch {
    return null
  }
}

function clearTallyDraft(surveyId: string) {
  try {
    window.localStorage.removeItem(draftKey(surveyId))
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

function TallyWorkspace({
  survey,
  onChange,
  onResults,
}: {
  survey: Survey
  onChange: (survey: Survey) => void
  onResults: () => void
}) {
  const [restored] = useState(() => loadTallyDraft(survey.id))
  const [draftRestored, setDraftRestored] = useState(() =>
    Boolean(restored && Object.keys(restored.answers).length > 0),
  )
  const [mode, setMode] = useState<TallyMode>(restored?.mode ?? "quick")
  const [answers, setAnswers] = useState<Record<string, Answer>>(
    restored?.answers ?? {},
  )
  const [identifier, setIdentifier] = useState(restored?.identifier ?? "")
  const [activeIndex, setActiveIndex] = useState(restored?.activeIndex ?? 0)
  const [lastDeleted, setLastDeleted] = useState<ResponseRecord | null>(null)
  const [validationMessage, setValidationMessage] = useState("")
  const [lastSelection, setLastSelection] = useState<{
    question: string
    answer: string
  } | null>(null)
  const [savePromptOpen, setSavePromptOpen] = useState(false)
  const advancingQuestionRef = useRef<string | null>(null)
  const ratingAdvanceTimerRef = useRef<number | null>(null)
  const visibleItems = visibleQuestions(survey, answers)
  const questions = visibleItems.filter(
    (q) => q.type !== "section",
  )
  const active = questions[activeIndex]
  const valid = questions.every((q) => !q.required || isAnswered(answers[q.id]))
  const missingIndex = questions.findIndex(
    (question) => question.required && !isAnswered(answers[question.id]),
  )
  // Every required question has an answer. Optional ones may still be blank,
  // which is what the save check has always allowed.
  const complete = questions.length > 0 && missingIndex === -1
  const answeredCount = Object.values(answers).filter(isAnswered).length

  // Persist the response as it is being given, so an interruption — a closed
  // tab, a reload, a crash — costs nothing. Written on every change, plus once
  // more when the page goes away, which covers the last keystroke before a
  // reload lands.
  const writeDraft = useCallback(() => {
    if (answeredCount === 0 && !identifier.trim()) return
    const draft: TallyDraft = {
      identifier,
      answers,
      activeIndex,
      mode,
      savedAt: new Date().toISOString(),
    }
    try {
      window.localStorage.setItem(draftKey(survey.id), JSON.stringify(draft))
    } catch {
      // A full or unavailable store should never interrupt tallying.
    }
  }, [survey.id, identifier, answers, activeIndex, mode, answeredCount])

  useEffect(() => {
    writeDraft()
  }, [writeDraft])

  useEffect(() => {
    const flush = () => writeDraft()
    window.addEventListener("pagehide", flush)
    // Deliberately no flush on cleanup: the effect above already persisted the
    // latest state, and flushing here would re-write the draft moments after a
    // save cleared it.
    return () => window.removeEventListener("pagehide", flush)
  }, [writeDraft])

  const discardDraft = () => {
    clearTallyDraft(survey.id)
    setAnswers({})
    setIdentifier("")
    setActiveIndex(0)
    setDraftRestored(false)
  }

  // Switching between Quick keys, Tap form and Response grid changes the page
  // height, so each mode keeps its own scroll position instead of inheriting
  // whatever offset the previous mode happened to leave behind.
  const modeScrollRef = useRef<Partial<Record<TallyMode, number>>>({})
  const previousModeRef = useRef<TallyMode>(mode)
  useLayoutEffect(() => {
    if (previousModeRef.current === mode) return
    modeScrollRef.current[previousModeRef.current] = window.scrollY
    previousModeRef.current = mode
    window.scrollTo(0, modeScrollRef.current[mode] ?? 0)
  }, [mode])
  useEffect(() => {
    advancingQuestionRef.current = null
  }, [active?.id])
  useEffect(
    () => () => {
      if (ratingAdvanceTimerRef.current !== null)
        window.clearTimeout(ratingAdvanceTimerRef.current)
    },
    [],
  )
  const setAnswer = (question: Question, answer: Answer, advance = false) => {
    if (
      advance &&
      advancingQuestionRef.current === question.id
    )
      return
    setAnswers((current) => ({ ...current, [question.id]: answer }))
    setLastSelection({
      question: question.prompt,
      answer: answerLabel(question, answer),
    })
    setValidationMessage("")
    if (
      advance &&
      survey.autoAdvance &&
      activeIndex < questions.length - 1 &&
      advancingQuestionRef.current !== question.id
    ) {
      advancingQuestionRef.current = question.id
      if (question.type === "rating") {
        const nextIndex = Math.min(activeIndex + 1, questions.length - 1)
        ratingAdvanceTimerRef.current = window.setTimeout(() => {
          setActiveIndex(nextIndex)
          ratingAdvanceTimerRef.current = null
        }, 90)
      } else {
        setActiveIndex((current) =>
          Math.min(current + 1, questions.length - 1),
        )
      }
    }
  }
  const explainMissing = (index: number) => {
    const missing = questions[index]
    setValidationMessage(
      missing
        ? `Please answer the required question: “${missing.prompt}”.`
        : "Please complete all required questions.",
    )
    if (index >= 0) {
      setActiveIndex(index)
      window.setTimeout(
        () =>
          document
            .getElementById(`tally-question-${missing.id}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" }),
        0,
      )
    }
  }
  const save = () => {
    if (questions.length === 0) {
      setValidationMessage("This survey has no answerable questions.")
      return
    }
    if (!complete) {
      explainMissing(missingIndex)
      return
    }
    const now = new Date().toISOString()
    const record: ResponseRecord = {
      id: uid(),
      identifier: identifier || `#${survey.responses.length + 1}`,
      answers,
      createdAt: now,
      updatedAt: now,
    }
    onChange({ ...survey, responses: [...survey.responses, record] })
    clearTallyDraft(survey.id)
    setAnswers({})
    setIdentifier("")
    setActiveIndex(0)
    setDraftRestored(false)
    setLastSelection(null)
  }
  const deleteRecord = (record: ResponseRecord) => {
    setLastDeleted(record)
    onChange({
      ...survey,
      responses: survey.responses.filter((r) => r.id !== record.id),
    })
  }
  const [editing, setEditing] = useState<ResponseRecord | null>(null)
  const requestSave = () => {
    if (questions.length === 0) {
      setValidationMessage("This survey has no answerable questions.")
      return
    }
    if (!complete) {
      explainMissing(missingIndex)
      return
    }
    setSavePromptOpen(true)
  }
  const confirmSave = () => {
    setSavePromptOpen(false)
    save()
  }

  // Once every required question has an answer there is nothing left to do but
  // save, so ask. Guarded on answeredCount so a survey with no required
  // questions doesn't prompt the moment the tally screen opens.
  useEffect(() => {
    if (complete && answeredCount > 0) setSavePromptOpen(true)
  }, [complete, answeredCount])

  // Enter walks forward through the tally, and on the last question it asks to
  // save; Enter again confirms. Textareas keep their newlines, and the key is
  // left alone while some other dialog owns the screen.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (savePromptOpen) {
        if (event.key === "Enter" && !event.repeat) {
          event.preventDefault()
          confirmSave()
        } else if (event.key === "Escape") {
          event.preventDefault()
          setSavePromptOpen(false)
        }
        return
      }
      if (event.key !== "Enter" || event.repeat || mode === "grid") return
      if (document.querySelector(".modal-backdrop")) return
      const target = event.target as HTMLElement | null
      if (target?.tagName === "TEXTAREA") return
      event.preventDefault()
      if (activeIndex >= questions.length - 1) {
        requestSave()
        return
      }
      setActiveIndex((current) => Math.min(current + 1, questions.length - 1))
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [mode, savePromptOpen, activeIndex, questions.length, save, requestSave, confirmSave])

  return (
    <div className="page tally-page">
      <header className="compact-header">
        <div>
          <p className="eyebrow">Tally workspace</p>
          <h1>{survey.title}</h1>
        </div>
        <div className="header-actions">
          <span className="response-pill">
            <span />
            {survey.responses.length} saved
          </span>
          {lastDeleted && (
            <Button
              onClick={() => {
                onChange({
                  ...survey,
                  responses: [...survey.responses, lastDeleted],
                })
                setLastDeleted(null)
              }}
            >
              <Icon name="undo" />
              Undo delete
            </Button>
          )}
          <Button onClick={onResults}>
            View results <Icon name="arrow" />
          </Button>
        </div>
      </header>
      <div className="mode-bar">
        <div className="segmented">
          {(["quick", "tap", "grid"] as TallyMode[]).map((item) => (
            <button
              className={mode === item ? "active" : ""}
              onClick={() => setMode(item)}
              key={item}
            >
              {item === "quick"
                ? "Quick keys"
                : item === "tap"
                  ? "Tap form"
                  : "Response grid"}
            </button>
          ))}
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={survey.autoAdvance}
            onChange={(e) =>
              onChange({ ...survey, autoAdvance: e.target.checked })
            }
          />
          <span />
          Auto-advance
        </label>
      </div>
      {draftRestored && (
        <div className="draft-note" role="status">
          <span>
            <Icon name="undo" size={15} />
            Draft picked up where you left off — {answeredCount} of{" "}
            {questions.length} answered
            {restored?.savedAt
              ? `, last saved ${new Date(restored.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : ""}
            {identifier.trim() ? ` for ${identifier.trim()}` : ""}.
          </span>
          <Button onClick={discardDraft}>Discard draft</Button>
        </div>
      )}
      {mode !== "grid" && (
        <div className="respondent-bar">
          <Field label={survey.identifierLabel}>
            <TextInput
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={`Response ${survey.responses.length + 1}`}
            />
          </Field>
          <div>
            <span>Current response</span>
            <strong>
              {Object.values(answers).filter(isAnswered).length} of{" "}
              {questions.length}
            </strong>
          </div>
        </div>
      )}
      {mode === "quick" && validationMessage && (
        <div className="validation-banner" role="alert">
          {validationMessage}
        </div>
      )}
      {mode === "quick" && lastSelection && (
        <div className="selection-receipt" role="status" aria-live="polite">
          <span>
            <Icon name="check" size={15} />
            Recorded
          </span>
          <strong>{lastSelection.question}</strong>
          <b>{lastSelection.answer}</b>
        </div>
      )}
      {mode === "quick" && active && (
        <QuickTally
          question={active}
          index={activeIndex}
          total={questions.length}
          section={sectionForQuestion(survey, active.id)}
          answer={answers[active.id]}
          setAnswer={setAnswer}
          onBack={() => setActiveIndex((i) => Math.max(0, i - 1))}
          onNext={() =>
            setActiveIndex((i) => Math.min(questions.length - 1, i + 1))
          }
          onSave={save}
        />
      )}
      {mode === "tap" && (
        <div className="tap-form card">
          {visibleItems.map((question) =>
            question.type === "section" ? (
              <section className="tap-section-divider" key={question.id}>
                <span>
                  Section{" "}
                  {visibleItems
                    .slice(0, visibleItems.indexOf(question) + 1)
                    .filter((item) => item.type === "section").length}
                  {" · "}
                  {sectionCoverage(survey, question.id)}
                </span>
                <h2>{question.prompt}</h2>
                {question.helpText && <p>{question.helpText}</p>}
              </section>
            ) : (
            <section
              className="tap-question"
              id={`tally-question-${question.id}`}
              key={question.id}
            >
              <div>
                <span className="type-chip">
                  {questions.indexOf(question) + 1}.{" "}
                  {TYPE_LABELS[question.type]}
                </span>
                <h3>
                  {question.prompt}
                  {question.required && <sup>*</sup>}
                </h3>
                {question.helpText && <p>{question.helpText}</p>}
              </div>
              <AnswerField
                question={question}
                answer={answers[question.id]}
                onChange={(answer) => setAnswer(question, answer)}
                index={questions.indexOf(question)}
              />
            </section>
            ),
          )}
          <div className="save-bar">
            <span className={validationMessage ? "validation-copy" : ""}>
              {validationMessage || (valid
                ? "Ready to save"
                : "Select Save to find the missing required answer")}
            </span>
            <Button
              variant="primary"
              disabled={questions.length === 0}
              onClick={save}
            >
              <Icon name="check" />
              Save response
            </Button>
          </div>
        </div>
      )}
      {mode === "grid" && (
        <ResponseGrid
          survey={survey}
          onDelete={deleteRecord}
          onEdit={setEditing}
        />
      )}
      {editing && (
        <ResponseEditor
          survey={survey}
          record={editing}
          onClose={() => setEditing(null)}
          onSave={(answers, identifier) => {
            onChange({
              ...survey,
              responses: survey.responses.map((record) =>
                record.id === editing.id
                  ? {
                      ...record,
                      answers,
                      identifier,
                      updatedAt: new Date().toISOString(),
                    }
                  : record,
              ),
            })
            setEditing(null)
          }}
        />
      )}
      {mode !== "grid" && (
        <aside className="live-totals">
          <div>
            <p className="eyebrow">Live check</p>
            <h3>Running totals</h3>
          </div>
          {survey.questions
            .filter((q) => ["single", "yesno"].includes(q.type))
            .slice(0, 2)
            .map((q) => (
              <div className="mini-total" key={q.id}>
                <strong>{q.prompt}</strong>
                {q.options.map((o) => (
                  <span key={o.id}>
                    {o.label}
                    <b>
                      {
                        survey.responses.filter((r) => r.answers[q.id] === o.id)
                          .length
                      }
                    </b>
                  </span>
                ))}
              </div>
            ))}
        </aside>
      )}
      {savePromptOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="save-prompt"
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-prompt-title"
          >
            <header>
              <div>
                <p className="eyebrow">All questions answered</p>
                <h2 id="save-prompt-title">Save this response?</h2>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label="Close"
                title="Close"
                onClick={() => setSavePromptOpen(false)}
              >
                <Icon name="close" size={17} />
              </button>
            </header>
            <p className="save-prompt-body">
              {answeredCount} of {questions.length} answered. Press{" "}
              <kbd>Enter</kbd> to save it against this survey, or close the dialog
              to keep editing.
            </p>
            <footer>
              <Button onClick={() => setSavePromptOpen(false)}>Keep editing</Button>
              <Button variant="primary" onClick={confirmSave}>
                <Icon name="check" />
                Save response
              </Button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}

function QuickTally({
  question,
  index,
  total,
  section,
  answer,
  setAnswer,
  onBack,
  onNext,
  onSave,
}: {
  question: Question
  index: number
  total: number
  section: {
    id: string
    title: string
    description: string
    number: number
    coverage: string
  } | null
  answer: Answer | undefined
  setAnswer: (question: Question, answer: Answer, advance?: boolean) => void
  onBack: () => void
  onNext: () => void
  onSave: () => void
}) {
  const cardRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Views stay mounted but hidden so their state survives a tab switch, so
      // ignore shortcuts unless this card is the one actually on screen.
      if (!cardRef.current?.offsetParent) return
      const target = event.target as HTMLElement
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return
      if (event.repeat) return
      const optionIndex = Number(event.key) - 1
      if (
        optionIndex >= 0 &&
        optionIndex < question.options.length &&
        ["single", "multiple", "yesno"].includes(question.type)
      ) {
        event.preventDefault()
        const option = question.options[optionIndex]
        if (question.type === "multiple") {
          const current = Array.isArray(answer) ? answer : []
          setAnswer(
            question,
            current.includes(option.id)
              ? current.filter((id) => id !== option.id)
              : [...current, option.id],
          )
        } else setAnswer(question, option.id, true)
      }
      if (
        question.type === "rating" &&
        optionIndex + 1 >= question.min &&
        optionIndex + 1 <= question.max
      )
        setAnswer(question, optionIndex + 1, true)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [question, answer, setAnswer])
  return (
    <section className="quick-card" ref={cardRef}>
      <div className="progress-head">
        <span>
          Question {index + 1} of {total}
        </span>
        <div className="progress">
          <i style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
        <span>{Math.round(((index + 1) / total) * 100)}%</span>
      </div>
      <div className="quick-copy">
        {section && (
          <div className="current-section">
            <span>
              Section {section.number} · {section.coverage}
            </span>
            <strong>{section.title}</strong>
            {section.description && <small>{section.description}</small>}
          </div>
        )}
        <span className="type-chip">{TYPE_LABELS[question.type]}</span>
        <h2>
          {question.prompt}
          {question.required && <sup>*</sup>}
        </h2>
        {question.helpText && <p>{question.helpText}</p>}
      </div>
      <AnswerField
        question={question}
        answer={answer}
        onChange={(value, advance) => setAnswer(question, value, advance)}
        large
        index={index}
      />
      <div className="quick-footer">
        <div>
          <Button onClick={onBack} disabled={index === 0}>
            <Icon name="back" />
            Previous
          </Button>
          <Button onClick={onNext} disabled={index === total - 1}>
            Next
            <Icon name="arrow" />
          </Button>
        </div>
        {index === total - 1 && (
          <Button variant="primary" onClick={onSave}>
            <Icon name="check" />
            Save response
          </Button>
        )}
        <span className="shortcut-note">
          <kbd>1–9</kbd> choose <kbd>Enter</kbd> continue
        </span>
      </div>
    </section>
  )
}

function AnswerField({
  question,
  answer,
  onChange,
  large = false,
  index,
}: {
  question: Question
  answer: Answer | undefined
  onChange: (answer: Answer, advance?: boolean) => void
  large?: boolean
  index: number
}) {
  if (["single", "yesno", "multiple"].includes(question.type)) {
    const selected = Array.isArray(answer) ? answer : [answer]
    return (
      <div className={`answer-options ${large ? "large" : ""}`}>
        {question.options.map((option, optionIndex) => (
          <button
            key={option.id}
            className={selected.includes(option.id) ? "selected" : ""}
            onClick={() => {
              if (question.type === "multiple") {
                const current = Array.isArray(answer) ? answer : []
                onChange(
                  current.includes(option.id)
                    ? current.filter((id) => id !== option.id)
                    : [...current, option.id],
                )
              } else onChange(option.id, true)
            }}
          >
            <kbd>{optionIndex + 1}</kbd>
            <span>{option.label}</span>
            {selected.includes(option.id) && <Icon name="check" />}
          </button>
        ))}
      </div>
    )
  }
  if (question.type === "rating") {
    const values = ratingValues(question)
    return (
      <div className="rating-options">
        {values.map((value) => (
          <button
            className={answer === value ? "selected" : ""}
            key={value}
            onClick={() => onChange(value, true)}
          >
            <kbd>{value}</kbd>
                <span>
                  {ratingLabel(question, value)}
                </span>
          </button>
        ))}
      </div>
    )
  }
  if (question.type === "number")
    return (
      <TextInput
        aria-label={question.prompt}
        type="number"
        min={question.min}
        max={question.max}
        value={answer ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
        placeholder={`${question.min}–${question.max}`}
      />
    )
  if (question.type === "long")
    return (
      <TextArea
        aria-label={question.prompt}
        rows={large ? 5 : 3}
        value={String(answer ?? "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type response..."
      />
    )
  return (
    <TextInput
      aria-label={question.prompt}
      type={question.type === "date" ? "date" : "text"}
      value={String(answer ?? "")}
      onChange={(e) => onChange(e.target.value)}
      placeholder={question.type === "short" ? "Type response..." : undefined}
    />
  )
}

function ResponseGrid({
  survey,
  onDelete,
  onEdit,
}: {
  survey: Survey
  onDelete: (record: ResponseRecord) => void
  onEdit: (record: ResponseRecord) => void
}) {
  const questions = survey.questions.filter((q) => q.type !== "section")
  return (
    <div className="table-card">
      <div className="table-title">
        <div>
          <p className="eyebrow">Saved data</p>
          <h2>Response grid</h2>
        </div>
        <span>{survey.responses.length} rows</span>
      </div>
      {survey.responses.length === 0 ? (
        <div className="empty-state">
          <h3>No responses yet</h3>
          <p>Switch to Quick keys or Tap form to add the first one.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{survey.identifierLabel}</th>
                {questions.map((q) => (
                  <th key={q.id}>{q.prompt}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {survey.responses.map((record) => (
                <tr key={record.id}>
                  <td>
                    <strong>{record.identifier}</strong>
                  </td>
                  {questions.map((q) => (
                    <td key={q.id}>{answerLabel(q, record.answers[q.id])}</td>
                  ))}
                  <td className="row-actions">
                    <Button
                      variant="ghost"
                      aria-label={`Edit response ${record.identifier || record.id}`}
                      title="Edit answers"
                      onClick={() => onEdit(record)}
                    >
                      <Icon name="edit" />
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label={`Delete response ${record.identifier || record.id}`}
                      title="Delete response"
                      onClick={() => onDelete(record)}
                    >
                      <Icon name="trash" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Accounts, roles and feedback
// ---------------------------------------------------------------------------

function errorText(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

function formatWhen(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * The screen an account sits on until an administrator approves it, and the one
 * it sits on if access is revoked later. It polls for the change, so approving an
 * account in another tab lets the waiting user straight in.
 */
function WaitingRoom({
  account,
  onSignOut,
}: {
  account: Account | null
  onSignOut: () => void
}) {
  const revoked = Boolean(account?.disabled)
  return (
    <div className="waiting-backdrop">
      <section
        className="waiting-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="waiting-title"
      >
        <span className={`waiting-badge ${revoked ? "bad" : ""}`}>
          <Icon name={revoked ? "lock" : "shield"} size={24} />
        </span>
        <h1 id="waiting-title">
          {revoked ? "Access revoked" : "Waiting for verification"}
        </h1>
        <p>
          {revoked
            ? `An administrator has revoked access to “${account?.username ?? ""}”. Your surveys and responses are untouched — ask an administrator to restore the account.`
            : `“${account?.username ?? ""}” still has to be verified by an administrator before Tallyform will open. This page updates by itself as soon as you are approved.`}
        </p>
        <Button onClick={onSignOut}>
          <Icon name="back" />
          Sign out
        </Button>
      </section>
    </div>
  )
}

function FeedbackDialog({
  onClose,
  onSent,
}: {
  onClose: () => void
  onSent: (message: string) => void
}) {
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy || !message.trim()) return
    setBusy(true)
    setError("")
    try {
      await sendFeedback(message)
      onSent("Thanks — your note is in the admin inbox.")
      onClose()
    } catch (cause) {
      setError(errorText(cause, "Could not send that."))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="feedback-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
      >
        <header>
          <div>
            <p className="eyebrow">Improvements</p>
            <h2 id="feedback-title">Send feedback</h2>
          </div>
          <button
            className="modal-close"
            type="button"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            <Icon name="close" size={17} />
          </button>
        </header>
        <TextArea
          aria-label="Your feedback"
          rows={6}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="What would make Tallyform better for you?"
        />
        <p className="feedback-hint">
          Goes straight to the administrator inbox. Nothing you type here changes
          your surveys.
        </p>
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={busy || !message.trim()}
          >
            <Icon name="feedback" />
            {busy ? "Sending…" : "Send feedback"}
          </Button>
        </footer>
      </section>
    </div>
  )
}

/**
 * Admin-only account management: approve a new account, promote or demote it,
 * revoke or restore access, rename it, reset its password, or remove it.
 *
 * Nothing here is enforced by hiding a button — each action calls a Postgres
 * function that re-checks the caller's role server-side.
 */
function AccountsView({
  selfId,
  onNotice,
}: {
  selfId: string
  onNotice: (message: string) => void
}) {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [error, setError] = useState("")
  const [busyId, setBusyId] = useState("")
  const [editingId, setEditingId] = useState("")
  const [rename, setRename] = useState("")
  const [password, setPassword] = useState("")
  const [confirmText, setConfirmText] = useState("")
  const [confirmingId, setConfirmingId] = useState("")

  const reload = useCallback(() => {
    listAccounts()
      .then(setAccounts)
      .catch((cause: unknown) =>
        setError(errorText(cause, "Could not load accounts.")),
      )
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const run = async (id: string, label: string, action: () => Promise<unknown>) => {
    setBusyId(id)
    setError("")
    try {
      await action()
      onNotice(`${label}.`)
      reload()
    } catch (cause) {
      setError(errorText(cause, `${label} failed.`))
    } finally {
      setBusyId("")
    }
  }

  const closeEditor = () => {
    setEditingId("")
    setRename("")
    setPassword("")
    setConfirmingId("")
    setConfirmText("")
  }

  const pending = accounts?.filter((account) => !account.verified).length ?? 0

  return (
    <div className="page accounts-page">
      <header className="compact-header">
        <div>
          <p className="eyebrow">Administrator</p>
          <h1>Accounts</h1>
        </div>
        <div className="header-actions">
          <Button onClick={reload}>
            <Icon name="undo" />
            Refresh
          </Button>
        </div>
      </header>

      <section className="metrics-strip">
        <Metric value={accounts?.length ?? 0} label="Accounts" />
        <Metric value={pending} label="Waiting for verification" />
        <Metric
          value={accounts?.filter((account) => account.role === "admin").length ?? 0}
          label="Administrators"
        />
      </section>

      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}

      {accounts === null ? (
        <div className="empty-state">
          <h3>Loading accounts…</h3>
        </div>
      ) : accounts.length === 0 ? (
        <div className="empty-state">
          <h3>No accounts yet</h3>
          <p>New registrations will appear here for verification.</p>
        </div>
      ) : (
        <div className="account-list">
          {accounts.map((account) => {
            const isSelf = account.id === selfId
            const busy = busyId === account.id
            const expanded = editingId === account.id
            return (
              <article
                className={`account-card ${account.verified ? "" : "pending"}`}
                key={account.id}
              >
                <div className="account-main">
                  <span className="account-avatar" aria-hidden="true">
                    {account.username.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="account-id">
                    <strong>
                      {account.username}
                      {isSelf && <span className="account-you">you</span>}
                    </strong>
                    <small>Joined {formatWhen(account.createdAt)}</small>
                    <div className="account-badges">
                      <span
                        className={`pill ${account.role === "admin" ? "pill-admin" : ""}`}
                      >
                        {account.role === "admin" ? "Administrator" : "User"}
                      </span>
                      {account.verified ? (
                        <span className="pill pill-ok">Verified</span>
                      ) : (
                        <span className="pill pill-warn">Waiting for verification</span>
                      )}
                      {account.disabled && (
                        <span className="pill pill-bad">Access revoked</span>
                      )}
                    </div>
                  </div>
                  <div className="account-actions">
                    <Button
                      variant={account.verified ? "ghost" : "primary"}
                      disabled={isSelf || busy}
                      onClick={() =>
                        run(
                          account.id,
                          account.verified
                            ? `Un-verified ${account.username}`
                            : `Verified ${account.username}`,
                          () => verifyAccount(account.id, !account.verified),
                        )
                      }
                    >
                      <Icon name="shield" />
                      {account.verified ? "Un-verify" : "Verify"}
                    </Button>
                    <Button
                      variant={account.disabled ? "ghost" : "ghost"}
                      disabled={isSelf || busy}
                      onClick={() =>
                        run(
                          account.id,
                          account.disabled
                            ? `Restored ${account.username}`
                            : `Revoked access for ${account.username}`,
                          () => setAccountDisabled(account.id, !account.disabled),
                        )
                      }
                    >
                      <Icon name={account.disabled ? "undo" : "lock"} />
                      {account.disabled ? "Restore" : "Revoke"}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        if (expanded) closeEditor()
                        else {
                          setEditingId(account.id)
                          setRename(account.username)
                          setPassword("")
                          setConfirmingId("")
                          setConfirmText("")
                        }
                      }}
                    >
                      <Icon name="more" />
                      More
                    </Button>
                  </div>
                </div>

                {expanded && (
                  <div className="account-detail">
                    <div className="field">
                      <span className="field-label">Role</span>
                      <div className="segmented">
                        <button
                          className={account.role === "user" ? "active" : ""}
                          disabled={isSelf || busy}
                          onClick={() =>
                            run(account.id, `Made ${account.username} a user`, () =>
                              setAccountRole(account.id, "user"),
                            )
                          }
                        >
                          User
                        </button>
                        <button
                          className={account.role === "admin" ? "active" : ""}
                          disabled={isSelf || busy}
                          onClick={() =>
                            run(
                              account.id,
                              `Made ${account.username} an administrator`,
                              () => setAccountRole(account.id, "admin"),
                            )
                          }
                        >
                          Administrator
                        </button>
                      </div>
                    </div>

                    <label className="field">
                      <span className="field-label">Username</span>
                      <input
                        className="input"
                        value={rename}
                        onChange={(event) => setRename(event.target.value)}
                        autoCapitalize="none"
                        spellCheck={false}
                      />
                    </label>
                    <Button
                      disabled={busy || !rename.trim() || rename === account.username}
                      onClick={() =>
                        run(
                          account.id,
                          `Renamed to ${rename.trim()}`,
                          async () => {
                            await renameAccount(account.id, rename)
                            closeEditor()
                          },
                        )
                      }
                    >
                      <Icon name="edit" />
                      Save username
                    </Button>

                    <label className="field">
                      <span className="field-label">New password</span>
                      <input
                        className="input"
                        type="text"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="off"
                        placeholder="At least 6 characters"
                      />
                    </label>
                    <Button
                      disabled={busy || password.length < 6}
                      onClick={() =>
                        run(
                          account.id,
                          `Reset the password for ${account.username}`,
                          async () => {
                            await resetAccountPassword(account.id, password)
                            setPassword("")
                          },
                        )
                      }
                    >
                      <Icon name="lock" />
                      Reset password
                    </Button>

                    <div className="account-danger">
                      <p className="field-label">Delete account</p>
                      <p className="account-danger-note">
                        Revoking keeps every survey and response. Deleting removes
                        the login and everything it owns, permanently.
                      </p>
                      {confirmingId === account.id ? (
                        <div className="account-confirm">
                          <input
                            className="input"
                            value={confirmText}
                            onChange={(event) => setConfirmText(event.target.value)}
                            placeholder={`Type ${account.username} to confirm`}
                            autoCapitalize="none"
                            spellCheck={false}
                          />
                          <Button
                            variant="danger"
                            disabled={
                              busy || confirmText.trim() !== account.username
                            }
                            onClick={() =>
                              run(
                                account.id,
                                `Deleted ${account.username}`,
                                async () => {
                                  await deleteAccount(account.id, true)
                                  closeEditor()
                                },
                              )
                            }
                          >
                            <Icon name="trash" />
                            Delete everything
                          </Button>
                          <Button onClick={() => setConfirmingId("")}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="account-confirm">
                          <Button
                            variant="danger"
                            disabled={isSelf || busy}
                            onClick={() =>
                              run(
                                account.id,
                                `Revoked access for ${account.username}`,
                                () => deleteAccount(account.id, false),
                              )
                            }
                          >
                            <Icon name="lock" />
                            Revoke only
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={isSelf || busy}
                            onClick={() => {
                              setConfirmingId(account.id)
                              setConfirmText("")
                            }}
                          >
                            <Icon name="trash" />
                            Delete permanently…
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

const FEEDBACK_STATUSES: Array<{ value: FeedbackStatus; label: string }> = [
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
  { value: "done", label: "Done" },
]

/** Admin-only inbox. Row Level Security keeps this list out of everyone else. */
function FeedbackView({ onNotice }: { onNotice: (message: string) => void }) {
  const [items, setItems] = useState<FeedbackItem[] | null>(null)
  const [error, setError] = useState("")
  const [busyId, setBusyId] = useState("")
  const [filter, setFilter] = useState<FeedbackStatus | "all">("all")

  const reload = useCallback(() => {
    listFeedback()
      .then(setItems)
      .catch((cause: unknown) =>
        setError(errorText(cause, "Could not load feedback.")),
      )
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const run = async (id: string, label: string, action: () => Promise<unknown>) => {
    setBusyId(id)
    setError("")
    try {
      await action()
      onNotice(`${label}.`)
      reload()
    } catch (cause) {
      setError(errorText(cause, `${label} failed.`))
    } finally {
      setBusyId("")
    }
  }

  const shown =
    items?.filter((item) => filter === "all" || item.status === filter) ?? []
  const unread = items?.filter((item) => item.status === "new").length ?? 0

  return (
    <div className="page feedback-page">
      <header className="compact-header">
        <div>
          <p className="eyebrow">Administrator</p>
          <h1>Feedback</h1>
        </div>
        <div className="header-actions">
          <Button onClick={reload}>
            <Icon name="undo" />
            Refresh
          </Button>
        </div>
      </header>

      <section className="metrics-strip">
        <Metric value={items?.length ?? 0} label="Notes received" />
        <Metric value={unread} label="Not reviewed" />
        <Metric
          value={items?.filter((item) => item.status === "done").length ?? 0}
          label="Acted on"
        />
      </section>

      <div className="results-toolbar">
        <div className="segmented">
          <button
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          {FEEDBACK_STATUSES.map((option) => (
            <button
              key={option.value}
              className={filter === option.value ? "active" : ""}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}

      {items === null ? (
        <div className="empty-state">
          <h3>Loading feedback…</h3>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty-state">
          <h3>Nothing here yet</h3>
          <p>Notes sent from the sidebar land in this inbox.</p>
        </div>
      ) : (
        <div className="feedback-list">
          {shown.map((item) => (
            <article className="feedback-card" key={item.id}>
              <header>
                <div>
                  <strong>{item.username || "Unknown"}</strong>
                  <small>{formatWhen(item.createdAt)}</small>
                </div>
                <div className="feedback-actions">
                  <div className="segmented">
                    {FEEDBACK_STATUSES.map((option) => (
                      <button
                        key={option.value}
                        className={item.status === option.value ? "active" : ""}
                        disabled={busyId === item.id}
                        onClick={() =>
                          run(
                            item.id,
                            `Marked as ${option.label.toLowerCase()}`,
                            () => setFeedbackStatus(item.id, option.value),
                          )
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    aria-label="Delete feedback"
                    disabled={busyId === item.id}
                    onClick={() =>
                      run(item.id, "Deleted that note", () =>
                        deleteFeedback(item.id),
                      )
                    }
                  >
                    <Icon name="trash" />
                  </Button>
                </div>
              </header>
              <p className="feedback-body">{item.message}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Edits one saved response. This is the answer to "a question was added after
 * we tallied": every question is listed, ones with no answer yet are called out,
 * and saving writes the whole answer map back.
 */
function ResponseEditor({
  survey,
  record,
  onSave,
  onClose,
}: {
  survey: Survey
  record: ResponseRecord
  onSave: (answers: Record<string, Answer>, identifier: string) => void
  onClose: () => void
}) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({
    ...record.answers,
  })
  const [identifier, setIdentifier] = useState(record.identifier)
  const questions = survey.questions.filter((q) => q.type !== "section")
  const blank = questions.filter((question) => !isAnswered(answers[question.id]))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="response-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="response-editor-title"
      >
        <header>
          <div>
            <p className="eyebrow">
              Saved {formatWhen(record.createdAt)}
            </p>
            <h2 id="response-editor-title">Edit response</h2>
          </div>
          <button
            className="modal-close"
            type="button"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            <Icon name="close" size={17} />
          </button>
        </header>

        <div className="response-editor-scroll">
          {blank.length > 0 && (
            <p className="draft-note">
              {blank.length} question{blank.length === 1 ? "" : "s"} never
              answered{blank.length === 1 ? "" : "s"} — these were probably added
              after this response was tallied.
            </p>
          )}

          <label className="field">
            <span className="field-label">{survey.identifierLabel}</span>
            <input
              className="input"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
            />
          </label>

          {questions.map((question, index) => (
            <fieldset className="edit-question" key={question.id}>
              <legend>
                <span className="question-number">{index + 1}</span>
                <span className="edit-question-prompt">{question.prompt}</span>
                {!isAnswered(answers[question.id]) && (
                  <span className="pill pill-warn">Not answered</span>
                )}
              </legend>
              <AnswerField
                question={question}
                answer={answers[question.id]}
                onChange={(answer) =>
                  setAnswers((current) => ({
                    ...current,
                    [question.id]: answer,
                  }))
                }
                index={index}
              />
            </fieldset>
          ))}
        </div>

        <footer>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave(answers, identifier)}>
            <Icon name="check" />
            Save changes
          </Button>
        </footer>
      </section>
    </div>
  )
}

function ResultsView({
  survey,
  surveys,
  folders,
  foldersAvailable,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveSurvey,
  onChange,
  onSelect,
  onBackToSurveys,
  onTally,
}: {
  survey: Survey
  surveys: Survey[]
  folders: Folder[]
  foldersAvailable: boolean
  onCreateFolder: (name: string) => void
  onRenameFolder: (id: string, name: string) => void
  onDeleteFolder: (id: string) => void
  onMoveSurvey: (surveyId: string, folderId: string | null) => void
  onChange: (survey: Survey) => void
  onSelect: (id: string) => void
  onBackToSurveys: () => void
  onTally: () => void
}) {
  const [tab, setTab] = useState<"summary" | "responses">("summary")
  const [editing, setEditing] = useState<ResponseRecord | null>(null)
  const [order, setOrder] = useState<string[]>([])
  const [surveyOrder, setSurveyOrder] = useState<string[]>([])
  const [folderOrder, setFolderOrder] = useState<string[]>([])
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({})
  const [editingFolderId, setEditingFolderId] = useState("")
  const [draggingSurveyId, setDraggingSurveyId] = useState("")
  const [dropSurveyId, setDropSurveyId] = useState("")
  const [dropFolderId, setDropFolderId] = useState("")
  const [draggingFolderId, setDraggingFolderId] = useState("")
  // A finished drag can still be followed by a click on the row it landed on.
  // A deadline rather than a flag, matching the sidebar brand, so a drag that
  // never produces a click cannot swallow the next real one.
  const surveyClickBlockedUntilRef = useRef(0)

  useEffect(() => {
    setSurveyOrder(loadSurveyOrder())
    setFolderOrder(loadFolderOrder())
  }, [])
  const [draggingId, setDraggingId] = useState("")
  const [dropTargetId, setDropTargetId] = useState("")

  // Results stays mounted while the survey picker swaps surveys underneath it,
  // so the saved order has to be re-read whenever the survey changes.
  useEffect(() => {
    setOrder(loadResultOrder(survey.id))
    setDraggingId("")
    setDropTargetId("")
  }, [survey.id])
  const panelListRef = useRef<HTMLDivElement>(null)
  const {
    pref: panel,
    update: setPanelPref,
    startResize,
    startMove,
    trackEdgeScroll,
    stopEdgeScroll,
  } = useDockablePanel(
    RESULTS_PANEL_KEY,
    RESULTS_PANEL_MIN,
    RESULTS_PANEL_MAX,
    260,
    panelListRef,
  )
  const questions = useMemo(
    () => survey.questions.filter((q) => q.type !== "section"),
    [survey.questions],
  )

  // Saved order first, then whatever it has never heard of. A question added
  // since the last drag lands at the end rather than disappearing, and one that
  // was deleted simply drops out.
  const orderedQuestions = useMemo(() => {
    if (order.length === 0) return questions
    const byId = new Map(questions.map((question) => [question.id, question]))
    const placed = new Set<string>()
    const result: Question[] = []
    for (const id of order) {
      const question = byId.get(id)
      if (question && !placed.has(id)) {
        result.push(question)
        placed.add(id)
      }
    }
    for (const question of questions) {
      if (!placed.has(question.id)) result.push(question)
    }
    return result
  }, [questions, order])

  const reorderCards = (sourceId: string, targetId: string) => {
    if (!sourceId || sourceId === targetId) return
    const next = [...orderedQuestions]
    const from = next.findIndex((question) => question.id === sourceId)
    const to = next.findIndex((question) => question.id === targetId)
    if (from < 0 || to < 0) return
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    const ids = next.map((question) => question.id)
    setOrder(ids)
    saveResultOrder(survey.id, ids)
  }

  const resetOrder = () => {
    setOrder([])
    saveResultOrder(survey.id, [])
  }

  const orderedSurveys = useMemo(() => {
    if (surveyOrder.length === 0) return surveys
    const byId = new Map(surveys.map((item) => [item.id, item]))
    const placed = new Set<string>()
    const result: Survey[] = []
    for (const id of surveyOrder) {
      const item = byId.get(id)
      if (item && !placed.has(id)) {
        result.push(item)
        placed.add(id)
      }
    }
    // Surveys the saved order has never seen keep the order they arrived in, so
    // a brand new one lands at the bottom instead of disappearing.
    for (const item of surveys) {
      if (!placed.has(item.id)) result.push(item)
    }
    return result
  }, [surveys, surveyOrder])

  const sections = foldersAvailable
    ? folderSections(folders, orderedSurveys, folderOrder)
    : [{ folder: null, surveys: orderedSurveys }]

  const reorderSurveys = (sourceId: string, targetId: string) => {
    if (!sourceId || sourceId === targetId) return
    const next = [...orderedSurveys]
    const from = next.findIndex((item) => item.id === sourceId)
    const to = next.findIndex((item) => item.id === targetId)
    if (from < 0 || to < 0) return
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    const ids = next.map((item) => item.id)
    setSurveyOrder(ids)
    saveSurveyOrder(ids)
  }

  const resetSurveyOrder = () => {
    setSurveyOrder([])
    saveSurveyOrder([])
  }

  const surveyDrag = (id: string): HTMLAttributes<HTMLElement> => ({
    draggable: true,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      event.dataTransfer.setData("text/plain", `survey:${id}`)
      setDraggingSurveyId(id)
      trackEdgeScroll(event.clientY)
    },
    onDragEnd: () => {
      setDraggingSurveyId("")
      setDropSurveyId("")
      stopEdgeScroll()
      surveyClickBlockedUntilRef.current = Date.now() + 250
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      event.preventDefault()
      trackEdgeScroll(event.clientY)
      if (dropSurveyId !== id) setDropSurveyId(id)
    },
    onDragLeave: () => setDropSurveyId(""),
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault()
      stopEdgeScroll()
      reorderSurveys(event.dataTransfer.getData("text/plain"), id)
      setDraggingSurveyId("")
      setDropSurveyId("")
    },
  })

  /**
   * Folder headings take two kinds of drop: a survey, which joins the folder,
   * or another folder, which swaps places with it. The payload is prefixed so
   * one handler can tell them apart.
   */
  const folderDrag = (id: string): HTMLAttributes<HTMLElement> => ({
    draggable: true,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      event.dataTransfer.setData("text/plain", `folder:${id}`)
      event.dataTransfer.effectAllowed = "move"
      setDraggingFolderId(id)
    },
    onDragEnd: () => {
      setDraggingFolderId("")
      setDropFolderId("")
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      event.preventDefault()
      trackEdgeScroll(event.clientY)
      if (dropFolderId !== id) setDropFolderId(id)
    },
    onDragLeave: () => setDropFolderId(""),
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault()
      stopEdgeScroll()
      const payload = event.dataTransfer.getData("text/plain")
      if (payload.startsWith("survey:")) {
        onMoveSurvey(payload.slice("survey:".length), id || null)
      } else if (payload.startsWith("folder:")) {
        reorderFolders(payload.slice("folder:".length), id)
      }
      setDropFolderId("")
      setDropSurveyId("")
    },
  })

  const reorderFolders = (sourceId: string, targetId: string) => {
    if (!sourceId || sourceId === targetId) return
    const next = [...sections]
      .map((section) => section.folder)
      .filter((folder): folder is Folder => folder !== null)
    const from = next.findIndex((folder) => folder.id === sourceId)
    const to = next.findIndex((folder) => folder.id === targetId)
    if (from < 0 || to < 0) return
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    const ids = next.map((folder) => folder.id)
    setFolderOrder(ids)
    saveFolderOrder(ids)
  }

  const cardDrag = (questionId: string): HTMLAttributes<HTMLElement> => ({
    draggable: true,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      event.dataTransfer.setData("text/plain", questionId)
      setDraggingId(questionId)
    },
    onDragEnd: () => {
      setDraggingId("")
      setDropTargetId("")
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      event.preventDefault()
      if (dropTargetId !== questionId) setDropTargetId(questionId)
    },
    onDragLeave: () => setDropTargetId(""),
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault()
      reorderCards(event.dataTransfer.getData("text/plain"), questionId)
      setDraggingId("")
      setDropTargetId("")
    },
  })
  // One row per question per response, so the first two columns are always the
  // question and its answer — that is the shape people read in Excel. The wide
  // one-row-per-response pivot stays available for pivoting and charting.
  const exportRaw = () => {
    const headers = [
      "Question",
      "Answer",
      "Type",
      survey.identifierLabel,
      "Created",
    ]
    const rows = survey.responses.flatMap((r) =>
      questions.map((q) => [
        q.prompt,
        answerLabel(q, r.answers[q.id]),
        TYPE_LABELS[q.type],
        r.identifier,
        r.createdAt,
      ]),
    )
    downloadFile(
      `${survey.title}-responses.csv`,
      [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n"),
      "text/csv",
    )
  }
  const exportWide = () => {
    const headers = [
      "Response ID",
      survey.identifierLabel,
      "Created",
      ...questions.map((q) => q.prompt),
    ]
    const rows = survey.responses.map((r) => [
      r.id,
      r.identifier,
      r.createdAt,
      ...questions.map((q) => answerLabel(q, r.answers[q.id])),
    ])
    downloadFile(
      `${survey.title}-responses-wide.csv`,
      [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n"),
      "text/csv",
    )
  }
  const exportJson = () =>
    downloadFile(
      `${survey.title}-backup.json`,
      JSON.stringify(survey, null, 2),
      "application/json",
    )
  const answered = survey.responses.reduce(
    (sum, r) => sum + Object.values(r.answers).filter(isAnswered).length,
    0,
  )
  const possible = Math.max(1, survey.responses.length * questions.length)
  return (
    <div className="page results-page">
      <div
        className={`builder-layout results-layout outline-${panel.side}${
          panel.collapsed ? " outline-collapsed" : ""
        }${panel.floating ? " outline-floating" : ""}`}
        style={{ "--outline-w": outlineWidth(panel) } as React.CSSProperties}
      >
        <aside className="builder-outline results-outline">
          <span
            className="outline-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize survey panel"
            onPointerDown={startResize}
          />
          <div
            className="outline-head"
            onPointerDown={startMove}
            title="Drag to move the panel to the other side"
          >
            <Icon name="grip" size={14} />
            <span className="outline-title">Surveys</span>
            <span className="outline-count">{surveys.length}</span>
            <button
              className="outline-float"
              type="button"
              aria-label={
                panel.floating
                  ? "Dock the survey panel"
                  : "Float the survey panel"
              }
              aria-pressed={panel.floating}
              title={
                panel.floating
                  ? "Dock the survey panel"
                  : "Float the survey panel"
              }
              onClick={() => setPanelPref({ floating: !panel.floating })}
            >
              <Icon name={panel.floating ? "dock" : "float"} size={14} />
            </button>
            <button
              className="outline-collapse"
              type="button"
              aria-label={
                panel.collapsed
                  ? "Expand survey panel"
                  : "Minimise survey panel"
              }
              aria-expanded={!panel.collapsed}
              onClick={() => setPanelPref({ collapsed: !panel.collapsed })}
            >
              <Icon name={panel.collapsed ? "back" : "up"} size={14} />
            </button>
          </div>
          {panel.collapsed ? null : (
            <>
              <div
                className={`add-menu ${surveyOrder.length ? "two-up" : ""}`}
              >
                {foldersAvailable && <FolderCreate onCreate={onCreateFolder} />}
                <div className="add-menu-row">
                  <button
                    className="add-question"
                    type="button"
                    onClick={onBackToSurveys}
                  >
                    <Icon name="back" size={15} />
                    All surveys
                  </button>
                  {surveyOrder.length > 0 && (
                    <button
                      className="add-question"
                      type="button"
                      title="Back to the most recently updated order"
                      onClick={resetSurveyOrder}
                    >
                      <Icon name="undo" size={15} />
                      Reset order
                    </button>
                  )}
                </div>
              </div>
              <div
                className="question-list"
                ref={panelListRef}
                onDragOver={(event: DragEvent<HTMLDivElement>) => {
                  event.preventDefault()
                  trackEdgeScroll(event.clientY)
                }}
                onDragLeave={stopEdgeScroll}
              >
                {sections.map((section) => {
                  const key = section.folder?.id ?? UNFILED
                  const expanded =
                    collapsedFolders[key] === undefined
                      ? true
                      : !collapsedFolders[key]
                  return (
                    <div className="folder-group" key={key}>
                      {foldersAvailable && (
                        <FolderHead
                          folder={section.folder}
                          count={section.surveys.length}
                          expanded={expanded}
                          editing={editingFolderId === key}
                          dragOver={dropFolderId === key}
                          dragging={draggingFolderId === section.folder?.id}
                          dragProps={
                            section.folder
                              ? folderDrag(section.folder.id)
                              : undefined
                          }
                          onToggle={() =>
                            setCollapsedFolders((current) => ({
                              ...current,
                              [key]: expanded,
                            }))
                          }
                          onEdit={() =>
                            setEditingFolderId(
                              editingFolderId === key ? "" : key,
                            )
                          }
                        />
                      )}
                      {editingFolderId === key && section.folder && (
                        <FolderEdit
                          folder={section.folder}
                          surveyCount={section.surveys.length}
                          onRename={(name) => {
                            onRenameFolder(section.folder!.id, name)
                            setEditingFolderId("")
                          }}
                          onDelete={() => onDeleteFolder(section.folder!.id)}
                          onClose={() => setEditingFolderId("")}
                        />
                      )}
                      {expanded && (
                        <div className="folder-items">
                          {section.surveys.length === 0 ? (
                            <p className="folder-empty">
                              Drag a survey here to file it
                            </p>
                          ) : (
                            section.surveys.map((item) => (
                              <button
                                key={item.id}
                                className={`question-list-item ${
                                  item.id === survey.id ? "active" : ""
                                } ${
                                  draggingSurveyId === item.id ? "dragging" : ""
                                } ${dropSurveyId === item.id ? "drop-target" : ""}`}
                                onClick={() => {
                                  if (
                                    Date.now() <
                                    surveyClickBlockedUntilRef.current
                                  )
                                    return
                                  onSelect(item.id)
                                }}
                                {...surveyDrag(item.id)}
                              >
                                <span
                                  className={`question-number${
                                    item.responses.length ? "" : " empty"
                                  }`}
                                >
                                  {item.responses.length || ""}
                                </span>
                                <span>
                                  <strong>{item.title || "Untitled"}</strong>
                                  <small>
                                    {item.questions.filter(
                                      (q) => q.type !== "section",
                                    ).length}{" "}
                                    questions · {item.responses.length} responses
                                  </small>
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </aside>
        <div className="results-body">
      <header className="compact-header">
        <div>
          <p className="eyebrow">Results</p>
          <h1>{survey.title}</h1>
        </div>
        <div className="header-actions">
          <Button onClick={exportJson}>
            <Icon name="download" />
            Backup JSON
          </Button>
          <Button onClick={exportWide}>
            <Icon name="download" />
            Export wide CSV
          </Button>
          <Button onClick={exportRaw}>
            <Icon name="download" />
            Export CSV
          </Button>
          <Button variant="primary" onClick={onTally}>
            <Icon name="plus" />
            Tally more
          </Button>
        </div>
      </header>
      <section className="metrics-strip results-metrics">
        <Metric value={survey.responses.length} label="Total responses" />
        <Metric
          value={Math.round((answered / possible) * 100)}
          label="Answer coverage %"
        />
        <Metric value={questions.length} label="Questions analyzed" />
      </section>
      <div className="results-toolbar">
        <div className="segmented">
          <button
            className={tab === "summary" ? "active" : ""}
            onClick={() => setTab("summary")}
          >
            Summary
          </button>
          <button
            className={tab === "responses" ? "active" : ""}
            onClick={() => setTab("responses")}
          >
            Individual responses
          </button>
        </div>
        {order.length > 0 && (
          <Button onClick={resetOrder}>
            <Icon name="undo" />
            Reset order
          </Button>
        )}
        {survey.responses.length > 0 && (
          <Button
            variant="danger"
            onClick={() =>
              window.confirm("Clear all saved responses?") &&
              onChange({ ...survey, responses: [] })
            }
          >
            Clear responses
          </Button>
        )}
      </div>
      {tab === "responses" ? (
        <ResponseGrid
          survey={survey}
          onEdit={setEditing}
          onDelete={(record) =>
            onChange({
              ...survey,
              responses: survey.responses.filter((r) => r.id !== record.id),
            })
          }
        />
      ) : (
        <div className="results-grid">
          {orderedQuestions.map((question, index) => (
            <ResultCard
              question={question}
              questionNumber={index + 1}
              responses={survey.responses}
              key={question.id}
              cardDrag={cardDrag(question.id)}
              dragging={draggingId === question.id}
              dropTarget={dropTargetId === question.id}
            />
          ))}
        </div>
      )}
        </div>
      </div>
      {editing ? (
        <ResponseEditor
          survey={survey}
          record={editing}
          onClose={() => setEditing(null)}
          onSave={(answers, identifier) => {
            onChange({
              ...survey,
              responses: survey.responses.map((record) =>
                record.id === editing.id
                  ? {
                      ...record,
                      answers,
                      identifier,
                      updatedAt: new Date().toISOString(),
                    }
                  : record,
              ),
            })
            setEditing(null)
          }}
        />
      ) : null}
    </div>
  )
}

function ResultCard({
  question,
  questionNumber,
  responses,
  cardDrag,
  dragging,
  dropTarget,
}: {
  question: Question
  questionNumber: number
  responses: ResponseRecord[]
  // Dragging is a display preference, so the handlers are passed in rather than
  // owned here: every card type renders a different <article> but behaves the
  // same way.
  cardDrag: HTMLAttributes<HTMLElement>
  dragging?: boolean
  dropTarget?: boolean
}) {
  const values = responses
    .map((r) => r.answers[question.id])
    .filter(isAnswered) as Answer[]
  if (["single", "yesno", "multiple"].includes(question.type)) {
    const counts = question.options.map((option) => ({
      option,
      count: values.filter((value) =>
        Array.isArray(value) ? value.includes(option.id) : value === option.id,
      ).length,
    }))
    return (
      <article
        className={`result-card ${dragging ? "dragging" : ""} ${dropTarget ? "drop-target" : ""}`}
        {...cardDrag}
      >
        <div className="result-head">
          <div>
            <span>
              Question {questionNumber} · {TYPE_LABELS[question.type]}
            </span>
            <h3>{question.prompt}</h3>
          </div>
          <strong>{values.length}</strong>
        </div>
        <div className="bars">
          {counts.map(({ option, count }) => {
            const percent = values.length
              ? Math.round((count / values.length) * 100)
              : 0
            return (
              <div className="bar-row" key={option.id}>
                <div>
                  <span>{option.label}</span>
                  <b>
                    {count} · {percent}%
                  </b>
                </div>
                <div className="bar">
                  <i style={{ width: `${percent}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </article>
    )
  }
  if (question.type === "rating" || question.type === "number") {
    const numbers = values.map(Number)
    const average = numbers.length
      ? numbers.reduce((a, b) => a + b, 0) / numbers.length
      : 0
    return (
      <article
        className={`result-card numeric-result ${dragging ? "dragging" : ""} ${dropTarget ? "drop-target" : ""}`}
        {...cardDrag}
      >
        <div className="result-head">
          <div>
            <span>
              Question {questionNumber} · {TYPE_LABELS[question.type]}
            </span>
            <h3>{question.prompt}</h3>
          </div>
          <strong>{values.length}</strong>
        </div>
        <div className="number-summary">
          <div>
            <strong>{average.toFixed(1)}</strong>
            <span>Average</span>
          </div>
          <div>
            <strong>{numbers.length ? Math.min(...numbers) : "—"}</strong>
            <span>Minimum</span>
          </div>
          <div>
            <strong>{numbers.length ? Math.max(...numbers) : "—"}</strong>
            <span>Maximum</span>
          </div>
        </div>
        {question.type === "rating" && (
          <div className="rating-distribution">
            <div className="distribution-title">
              <strong>Response totals</strong>
              <span>
                {numbers.length}{" "}
                {numbers.length === 1 ? "respondent" : "respondents"}
              </span>
            </div>
            <div className="bars">
              {ratingValues(question).map((rating) => {
                const count = numbers.filter((value) => value === rating).length
                const percent = numbers.length
                  ? Math.round((count / numbers.length) * 100)
                  : 0
                const label = ratingLabel(question, rating)
                return (
                  <div className="bar-row" key={rating}>
                    <div>
                      <span>
                        <strong>{rating}</strong>
                        {label && ` — ${label}`}
                      </span>
                      <b>
                        {count} {count === 1 ? "respondent" : "respondents"} ·{" "}
                        {percent}%
                      </b>
                    </div>
                    <div className="bar">
                      <i style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </article>
    )
  }
  return (
    <article
      className={`result-card text-result ${dragging ? "dragging" : ""} ${dropTarget ? "drop-target" : ""}`}
      {...cardDrag}
    >
      <div className="result-head">
        <div>
          <span>
            Question {questionNumber} · {TYPE_LABELS[question.type]}
          </span>
          <h3>{question.prompt}</h3>
        </div>
        <strong>{values.length}</strong>
      </div>
      {values.length ? (
        <div className="quotes">
          {values
            .slice(-4)
            .reverse()
            .map((value, index) => (
              <p key={index}>{String(value)}</p>
            ))}
        </div>
      ) : (
        <div className="empty-mini">Answers will appear here.</div>
      )}
    </article>
  )
}

export default App
