import type { Answer, Question, ResponseRecord, Survey } from "./types"
import { seedSurvey } from "./data"
import { getUserId } from "./auth"
import { MISSING_ENV_MESSAGE, supabase } from "./lib/supabase"

// The app used to persist to local storage under this key. It is cleared on the
// first Supabase-backed load so no stale data is left behind.
const LEGACY_STORAGE_KEY = "tallyform.surveys.v1"

type SurveyRow = {
  id: string
  title: string
  description: string
  identifier_label: string
  status: "draft" | "active"
  questions: Question[]
  auto_advance: boolean
  auto_save: boolean
  created_at: string
  updated_at: string
}

type ResponseRow = {
  id: string
  survey_id: string
  identifier: string
  answers: Record<string, Answer>
  created_at: string
  updated_at: string
}

/**
 * Row Level Security rejects any write whose user_id is not the signed-in user,
 * so ownership is stamped on every insert and update.
 */
function requireUserId(): string {
  const userId = getUserId()
  if (!userId) throw new Error("You must be signed in to reach your surveys.")
  return userId
}

function toSurveyRow(survey: Survey, userId: string) {
  return {
    id: survey.id,
    user_id: userId,
    title: survey.title,
    description: survey.description,
    identifier_label: survey.identifierLabel,
    status: survey.status,
    questions: survey.questions,
    auto_advance: survey.autoAdvance,
    auto_save: survey.autoSave,
    created_at: survey.createdAt,
    updated_at: survey.updatedAt,
  }
}

function toResponseRow(
  surveyId: string,
  record: ResponseRecord,
  userId: string,
) {
  return {
    id: record.id,
    survey_id: surveyId,
    user_id: userId,
    identifier: record.identifier,
    answers: record.answers,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  }
}

function toResponseRecord(row: ResponseRow): ResponseRecord {
  return {
    id: row.id,
    identifier: row.identifier,
    answers: row.answers ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Survey fields that live in the surveys row, ignoring nested responses. */
function surveySignature(survey: Survey): string {
  return JSON.stringify([
    survey.title,
    survey.description,
    survey.identifierLabel,
    survey.status,
    survey.questions,
    survey.autoAdvance,
    survey.autoSave,
  ])
}

function responseSignature(record: ResponseRecord): string {
  return JSON.stringify([record.identifier, record.answers])
}

function toSurvey(row: SurveyRow, responses: ResponseRow[]): Survey {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    identifierLabel: row.identifier_label,
    status: row.status,
    questions: Array.isArray(row.questions) ? row.questions : [],
    responses: responses
      .map(toResponseRecord)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    autoAdvance: row.auto_advance,
    autoSave: row.auto_save,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Reads every survey with its responses already hydrated onto it, so the rest of
 * the app keeps working with the same `Survey` shape it always had. Creates the
 * seeded example the first time the database is empty.
 */
export async function loadSurveys(): Promise<Survey[]> {
  if (!supabase) throw new Error(MISSING_ENV_MESSAGE)

  const userId = requireUserId()

  localStorage.removeItem(LEGACY_STORAGE_KEY)

  const [surveysResult, responsesResult] = await Promise.all([
    supabase
      .from("surveys")
      .select("*")
      .order("updated_at", { ascending: false }),
    supabase.from("responses").select("*"),
  ])

  if (surveysResult.error) throw new Error(surveysResult.error.message)
  if (responsesResult.error) throw new Error(responsesResult.error.message)

  const surveyRows = (surveysResult.data ?? []) as SurveyRow[]
  if (surveyRows.length === 0) {
    const seed = seedSurvey()
    const { error } = await supabase
      .from("surveys")
      .upsert(toSurveyRow(seed, userId))
    if (error) throw new Error(error.message)
    return [seed]
  }

  const responsesBySurvey = new Map<string, ResponseRow[]>()
  for (const row of (responsesResult.data ?? []) as ResponseRow[]) {
    const list = responsesBySurvey.get(row.survey_id)
    if (list) list.push(row)
    else responsesBySurvey.set(row.survey_id, [row])
  }

  return surveyRows.map((row) => toSurvey(row, responsesBySurvey.get(row.id) ?? []))
}

async function performSync(current: Survey[], previous: Survey[]): Promise<void> {
  if (!supabase) throw new Error(MISSING_ENV_MESSAGE)

  const userId = requireUserId()

  const previousById = new Map(previous.map((survey) => [survey.id, survey]))
  const currentIds = new Set(current.map((survey) => survey.id))

  const surveysToUpsert: Survey[] = []
  const surveyIdsToDelete: string[] = []

  for (const survey of current) {
    const before = previousById.get(survey.id)
    if (!before || surveySignature(before) !== surveySignature(survey)) {
      surveysToUpsert.push(survey)
    }
  }

  for (const id of previousById.keys()) {
    if (!currentIds.has(id)) surveyIdsToDelete.push(id)
  }

  const responsesToUpsert: Array<{ surveyId: string; record: ResponseRecord }> = []
  const responseIdsToDelete: string[] = []

  for (const survey of current) {
    const before = previousById.get(survey.id)
    const previousResponses = new Map(
      (before?.responses ?? []).map((record) => [record.id, record]),
    )
    const keptIds = new Set<string>()

    for (const record of survey.responses) {
      keptIds.add(record.id)
      const existing = previousResponses.get(record.id)
      if (!existing || responseSignature(existing) !== responseSignature(record)) {
        responsesToUpsert.push({ surveyId: survey.id, record })
      }
    }

    for (const id of previousResponses.keys()) {
      if (!keptIds.has(id)) responseIdsToDelete.push(id)
    }
  }

  // Deleting a survey cascades to its responses, so it goes first.
  if (surveyIdsToDelete.length > 0) {
    const { error } = await supabase
      .from("surveys")
      .delete()
      .in("id", surveyIdsToDelete)
    if (error) throw new Error(error.message)
  }

  if (surveysToUpsert.length > 0) {
    const { error } = await supabase
      .from("surveys")
      .upsert(surveysToUpsert.map((survey) => toSurveyRow(survey, userId)))
    if (error) throw new Error(error.message)
  }

  // Responses reference their survey, so the survey row must exist first.
  if (responsesToUpsert.length > 0) {
    const { error } = await supabase
      .from("responses")
      .upsert(
        responsesToUpsert.map(({ surveyId, record }) =>
          toResponseRow(surveyId, record, userId),
        ),
      )
    if (error) throw new Error(error.message)
  }

  if (responseIdsToDelete.length > 0) {
    const { error } = await supabase
      .from("responses")
      .delete()
      .in("id", responseIdsToDelete)
    if (error) throw new Error(error.message)
  }
}

// App state changes on every keystroke, so syncs are both debounced by the caller
// and chained here, guaranteeing an older snapshot can never finish after a newer
// one and overwrite it.
let syncChain: Promise<void> = Promise.resolve()

export function syncSurveys(current: Survey[], previous: Survey[]): Promise<void> {
  const run = syncChain.then(() => performSync(current, previous))
  syncChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export function describeStorageError(error: unknown): string {
  if (error instanceof Error) return `Could not reach Supabase: ${error.message}`
  return "Could not reach Supabase."
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