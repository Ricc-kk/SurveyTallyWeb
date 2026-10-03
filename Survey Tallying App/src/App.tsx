import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
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
  describeStorageError,
  downloadFile,
  loadSurveys,
  syncSurveys,
} from "./storage"
import type {
  Answer,
  Question,
  QuestionType,
  ResponseRecord,
  Survey,
} from "./types"

type View = "surveys" | "builder" | "tally" | "results"
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

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="input" {...props} />
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="input textarea" {...props} />
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

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`
}

// Debounced so rapid edits in the builder coalesce into a single round trip
// instead of firing a request per keystroke.
const SYNC_DEBOUNCE_MS = 700

function App() {
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [selectedId, setSelectedId] = useState<string>("")
  const [view, setView] = useState<View>("surveys")
  const [notice, setNotice] = useState("")
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const syncedRef = useRef<Survey[]>([])
  const survey = surveys.find((item) => item.id === selectedId) ?? surveys[0]

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

    if (!session) {
      syncedRef.current = []
      setSurveys([])
      setSelectedId("")
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    loadSurveys()
      .then((loaded) => {
        if (cancelled) return
        syncedRef.current = loaded
        setSurveys(loaded)
        setSelectedId(loaded[0]?.id ?? "")
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
  }, [session, authReady])

  useEffect(() => {
    if (loading || !session) return
    const previous = syncedRef.current
    const timer = window.setTimeout(() => {
      syncSurveys(surveys, previous)
        .then(() => {
          syncedRef.current = surveys
        })
        .catch((error: unknown) => {
          setNotice(describeStorageError(error))
        })
    }, SYNC_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [surveys, loading, session])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(""), 3600)
    return () => window.clearTimeout(timer)
  }, [notice])

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

  if (!authReady) {
    return (
      <div className="empty-state">
        <h3>Loading…</h3>
      </div>
    )
  }

  if (!session) return <LoginScreen />

  if (loading) {
    return (
      <div className="empty-state">
        <h3>Loading your surveys…</h3>
      </div>
    )
  }

  if (!survey && view !== "surveys") setView("surveys")

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => setView("surveys")}
          aria-label="Tallyform home"
        >
          <span className="brand-mark">
            <Icon name="check" size={19} />
          </span>
          <span>Tallyform</span>
        </button>
        <nav className="nav" aria-label="Primary navigation">
          <NavItem
            active={view === "surveys"}
            icon="surveys"
            label="Surveys"
            onClick={() => setView("surveys")}
          />
          <NavItem
            active={view === "builder"}
            disabled={!survey}
            icon="builder"
            label="Builder"
            onClick={() => setView("builder")}
          />
          <NavItem
            active={view === "tally"}
            disabled={!survey}
            icon="tally"
            label="Tally"
            onClick={() => setView("tally")}
          />
          <NavItem
            active={view === "results"}
            disabled={!survey}
            icon="results"
            label="Results"
            onClick={() => setView("results")}
          />
        </nav>
        <div className="sidebar-foot">
          <div className="privacy-dot" />
          <div>
            <strong>Signed in</strong>
            <span>Private to your account</span>
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
        {view === "surveys" && (
          <SurveyLibrary
            surveys={surveys}
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
        )}
        {survey && view === "builder" && (
          <SurveyBuilder
            survey={survey}
            onChange={(next) => updateSurvey(survey.id, () => next)}
            onTally={() => setView("tally")}
            onBack={() => setView("surveys")}
          />
        )}
        {survey && view === "tally" && (
          <TallyWorkspace
            survey={survey}
            onChange={(next) => updateSurvey(survey.id, () => next)}
            onResults={() => setView("results")}
          />
        )}
        {survey && view === "results" && (
          <ResultsView
            survey={survey}
            onChange={(next) => updateSurvey(survey.id, () => next)}
            onTally={() => setView("tally")}
          />
        )}
      </main>
      {notice && (
        <div className="toast" role="status">
          <Icon name="check" />
          {notice}
        </div>
      )}
    </div>
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

function SurveyLibrary({
  surveys,
  onCreate,
  onOpen,
  onDuplicate,
  onDelete,
  onImport,
}: {
  surveys: Survey[]
  onCreate: () => void
  onOpen: (id: string, view: View) => void
  onDuplicate: (survey: Survey) => void
  onDelete: (id: string) => void
  onImport: (survey: Survey) => void
}) {
  const [search, setSearch] = useState("")
  const importRef = useRef<HTMLInputElement>(null)
  const filtered = surveys.filter((survey) =>
    survey.title.toLowerCase().includes(search.toLowerCase()),
  )
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
      <section className="survey-grid">
        {filtered.map((item) => (
          <article className="survey-card" key={item.id}>
            <div className="survey-card-top">
              <span className={`status status-${item.status}`}>
                {item.status}
              </span>
              <Button
                variant="ghost"
                aria-label={`More actions for ${item.title}`}
              >
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
              <Button
                variant="primary"
                onClick={() => onOpen(item.id, "tally")}
              >
                Start tallying <Icon name="arrow" />
              </Button>
              <Button
                aria-label="Edit survey"
                onClick={() => onOpen(item.id, "builder")}
              >
                <Icon name="builder" />
              </Button>
              <Button
                aria-label="Duplicate survey"
                onClick={() => onDuplicate(item)}
              >
                <Icon name="copy" />
              </Button>
              <Button
                variant="ghost"
                aria-label="Delete survey"
                onClick={() => onDelete(item.id)}
              >
                <Icon name="trash" />
              </Button>
            </div>
          </article>
        ))}
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
  onTally,
  onBack,
}: {
  survey: Survey
  onChange: (survey: Survey) => void
  onTally: () => void
  onBack: () => void
}) {
  const [selected, setSelected] = useState(survey.questions[0]?.id ?? "")
  const [addCount, setAddCount] = useState("1")
  const [insertPosition, setInsertPosition] = useState("end")
  const [pendingQuestions, setPendingQuestions] = useState<Question[]>([])
  const update = (patch: Partial<Survey>) => onChange({ ...survey, ...patch })
  const updateQuestion = (id: string, patch: Partial<Question>) =>
    update({
      questions: survey.questions.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    })
  const addQuestion = (type: QuestionType) => {
    const parsedCount = Number(addCount)
    if (!Number.isFinite(parsedCount) || parsedCount < 1) return
    const safeCount = Math.min(100, Math.floor(parsedCount))
    const questions = Array.from({ length: safeCount }, () =>
      makeQuestion(type),
    )
    setPendingQuestions(questions)
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
            onClick={() => {
              update({ status: "active" })
              onTally()
            }}
          >
            Save & tally <Icon name="arrow" />
          </Button>
        </div>
      </header>
      <div className="builder-layout">
        <aside className="builder-outline">
          <div className="add-menu">
            <p>Add questions</p>
            <div className="add-controls">
              <Field label="How many">
                <TextInput
                  type="number"
                  min={1}
                  max={100}
                  inputMode="numeric"
                  value={addCount}
                  onChange={(event) => {
                    const value = event.target.value
                    const numericValue = Number(value)
                    setAddCount(
                      value === "" || !Number.isFinite(numericValue)
                        ? ""
                        : String(Math.min(100, numericValue)),
                    )
                  }}
                />
              </Field>
              <Field label="Add position">
                <SelectInput
                  value={insertPosition}
                  onChange={(event) => setInsertPosition(event.target.value)}
                >
                  <option value="end">At the end</option>
                  <option value="start">At the beginning</option>
                  {survey.questions.map((question, index) => (
                    <option value={question.id} key={question.id}>
                      After {index + 1}. {question.prompt}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <span className="add-helper">
              {Number(addCount) > 0
                ? `Choose a type below to prepare ${addCount} ${
                    Number(addCount) === 1 ? "question" : "questions"
                  }.`
                : "Enter how many questions you want to prepare."}
            </span>
            {Object.entries(TYPE_LABELS).map(([type, label]) => (
              <button
                key={type}
                disabled={!addCount || Number(addCount) < 1}
                onClick={() => addQuestion(type as QuestionType)}
              >
                <Icon name="plus" size={15} />
                {label}
              </button>
            ))}
          </div>
          <div className="panel-title">
            <span>Questions</span>
            <span>{survey.questions.length}</span>
          </div>
          <div className="question-list">
            {survey.questions.map((question, index) => (
              <button
                key={question.id}
                draggable
                className={`question-list-item ${
                  selected === question.id ? "active" : ""
                }`}
                onDragStart={(event) =>
                  event.dataTransfer.setData("text/plain", question.id)
                }
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
                <span className="question-number">{index + 1}</span>
                <span>
                  <strong>{question.prompt || "Untitled"}</strong>
                  <small>{TYPE_LABELS[question.type]}</small>
                </span>
              </button>
            ))}
          </div>
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
                      : "Question prompt"
                  }
                >
                  <TextInput
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
                  <TextInput
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
          position={
            insertPosition === "start"
              ? "at the beginning"
              : insertPosition === "end"
                ? "at the end"
                : `after question ${
                    survey.questions.findIndex(
                      (question) => question.id === insertPosition,
                    ) + 1
                  }`
          }
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
  position,
  onChange,
  onCancel,
  onAdd,
}: {
  questions: Question[]
  position: string
  onChange: (questions: Question[]) => void
  onCancel: () => void
  onAdd: () => void
}) {
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
              These questions will be added {position}. Nothing is saved until
              you select Add all.
            </span>
          </div>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </header>
        <div className="batch-list">
          {questions.map((question, index) => (
            <article className="batch-question" key={question.id}>
              <span className="question-number">{index + 1}</span>
              <div className="batch-question-content">
                <div className="batch-question-fields">
                  <Field
                    label={
                      question.type === "section"
                        ? "Section heading"
                        : "Question prompt"
                    }
                  >
                    <TextInput
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
                    <TextInput
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

function TallyWorkspace({
  survey,
  onChange,
  onResults,
}: {
  survey: Survey
  onChange: (survey: Survey) => void
  onResults: () => void
}) {
  const [mode, setMode] = useState<TallyMode>("quick")
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [identifier, setIdentifier] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const [lastDeleted, setLastDeleted] = useState<ResponseRecord | null>(null)
  const [validationMessage, setValidationMessage] = useState("")
  const [lastSelection, setLastSelection] = useState<{
    question: string
    answer: string
  } | null>(null)
  const advancingQuestionRef = useRef<string | null>(null)
  const ratingAdvanceTimerRef = useRef<number | null>(null)
  const visibleItems = visibleQuestions(survey, answers)
  const questions = visibleItems.filter(
    (q) => q.type !== "section",
  )
  const active = questions[activeIndex]
  const valid = questions.every((q) => !q.required || isAnswered(answers[q.id]))
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
  const save = () => {
    if (questions.length === 0) {
      setValidationMessage("This survey has no answerable questions.")
      return
    }
    if (!valid) {
      const missingIndex = questions.findIndex(
        (question) => question.required && !isAnswered(answers[question.id]),
      )
      const missing = questions[missingIndex]
      setValidationMessage(
        missing
          ? `Please answer the required question: “${missing.prompt}”.`
          : "Please complete all required questions.",
      )
      if (missingIndex >= 0) {
        setActiveIndex(missingIndex)
        window.setTimeout(
          () =>
            document
              .getElementById(`tally-question-${missing.id}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" }),
          0,
        )
      }
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
    setAnswers({})
    setIdentifier("")
    setActiveIndex(0)
    setLastSelection(null)
  }
  const deleteRecord = (record: ResponseRecord) => {
    setLastDeleted(record)
    onChange({
      ...survey,
      responses: survey.responses.filter((r) => r.id !== record.id),
    })
  }

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
        <ResponseGrid survey={survey} onDelete={deleteRecord} />
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
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
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
    <section className="quick-card">
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
}: {
  survey: Survey
  onDelete: (record: ResponseRecord) => void
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
                  <td>
                    <Button
                      variant="ghost"
                      aria-label="Delete response"
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

function ResultsView({
  survey,
  onChange,
  onTally,
}: {
  survey: Survey
  onChange: (survey: Survey) => void
  onTally: () => void
}) {
  const [tab, setTab] = useState<"summary" | "responses">("summary")
  const questions = survey.questions.filter((q) => q.type !== "section")
  const exportRaw = () => {
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
      `${survey.title}-responses.csv`,
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
          onDelete={(record) =>
            onChange({
              ...survey,
              responses: survey.responses.filter((r) => r.id !== record.id),
            })
          }
        />
      ) : (
        <div className="results-grid">
          {questions.map((question, index) => (
            <ResultCard
              question={question}
              questionNumber={index + 1}
              responses={survey.responses}
              key={question.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ResultCard({
  question,
  questionNumber,
  responses,
}: {
  question: Question
  questionNumber: number
  responses: ResponseRecord[]
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
      <article className="result-card">
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
      <article className="result-card numeric-result">
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
    <article className="result-card text-result">
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
