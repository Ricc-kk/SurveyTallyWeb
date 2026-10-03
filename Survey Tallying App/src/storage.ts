import type {
  Answer,
  Folder,
  Question,
  ResponseRecord,
  Survey,
} from "./types"
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
  folder_id: string | null
  created_at: string
  updated_at: string
}

type FolderRow = {
  id: string
  name: string
  created_at: string
}

/** Folders and surveys always travel together, so one load reads a consistent
    snapshot and one sync writes both, in the order the foreign keys need. */
export interface Workspace {
  surveys: Survey[]
  folders: Folder[]
  /**
   * False when the folders table is not there yet, i.e. supabase/
   * folders-migration.sql has not been run. The app treats every survey as
   * Unfiled rather than showing folder controls that cannot save.
   */
  foldersAvailable: boolean
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
    folder_id: survey.folderId,
    created_at: survey.createdAt,
    updated_at: survey.updatedAt,
  }
}

function toFolderRow(folder: Folder, userId: string) {
  return {
    id: folder.id,
    user_id: userId,
    name: folder.name,
    created_at: folder.createdAt,
  }
}

function toFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
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
    survey.folderId,
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
    folderId: row.folder_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Reads every survey with its responses already hydrated onto it, so the rest of
 * the app keeps working with the same `Survey` shape it always had.
 *
 * An empty database stays empty: the app opens on its own "create a survey"
 * empty state rather than seeding a demo, so a real account never mixes example
 * data with genuine responses.
 */
export async function loadSurveys(): Promise<Workspace> {
  if (!supabase) throw new Error(MISSING_ENV_MESSAGE)

  // RLS already scopes this query to the signed-in user; calling the helper here
  // just fails fast if the session vanished between rendering and loading.
  requireUserId()

  localStorage.removeItem(LEGACY_STORAGE_KEY)

  const [surveysResult, responsesResult, foldersResult] = await Promise.all([
    supabase
      .from("surveys")
      .select("*")
      .order("updated_at", { ascending: false }),
    supabase.from("responses").select("*"),
    // A missing folders table is not fatal: the app keeps working with every
    // survey Unfiled, which is what happened before supabase/
    // folders-migration.sql was run.
    supabase.from("folders").select("*").order("created_at", { ascending: true }),
  ])

  if (surveysResult.error) throw new Error(surveysResult.error.message)
  if (responsesResult.error) throw new Error(responsesResult.error.message)

  const folders =
    foldersResult.error === null
      ? ((foldersResult.data ?? []) as FolderRow[]).map(toFolder)
      : []

  const surveyRows = (surveysResult.data ?? []) as SurveyRow[]

  const responsesBySurvey = new Map<string, ResponseRow[]>()
  for (const row of (responsesResult.data ?? []) as ResponseRow[]) {
    const list = responsesBySurvey.get(row.survey_id)
    if (list) list.push(row)
    else responsesBySurvey.set(row.survey_id, [row])
  }

  return {
    folders,
    foldersAvailable: foldersResult.error === null,
    surveys: surveyRows.map((row) =>
      toSurvey(row, responsesBySurvey.get(row.id) ?? []),
    ),
  }
}

async function performSync(
  current: Workspace,
  previous: Workspace,
): Promise<void> {
  if (!supabase) throw new Error(MISSING_ENV_MESSAGE)

  const userId = requireUserId()

  const previousById = new Map(previous.surveys.map((s) => [s.id, s]))
  const currentIds = new Set(current.surveys.map((s) => s.id))

  const surveysToUpsert: Survey[] = []
  const surveyIdsToDelete: string[] = []

  for (const survey of current.surveys) {
    const before = previousById.get(survey.id)
    if (!before || surveySignature(before) !== surveySignature(survey)) {
      surveysToUpsert.push(survey)
    }
  }

  for (const id of previousById.keys()) {
    if (!currentIds.has(id)) surveyIdsToDelete.push(id)
  }

  const previousFolderIds = new Set(previous.folders.map((f) => f.id))
  const currentFolderIds = new Set(current.folders.map((f) => f.id))
  const foldersToUpsert = current.folders.filter((folder) => {
    const before = previous.folders.find((f) => f.id === folder.id)
    return !before || before.name !== folder.name
  })
  const folderIdsToDelete = [...previousFolderIds].filter(
    (id) => !currentFolderIds.has(id),
  )

  const responsesToUpsert: Array<{ surveyId: string; record: ResponseRecord }> = []
  const responseIdsToDelete: string[] = []

  for (const survey of current.surveys) {
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

  // Deleting a folder sets surveys.folder_id to null; it never removes a survey.
  if (folderIdsToDelete.length > 0) {
    const { error } = await supabase
      .from("folders")
      .delete()
      .in("id", folderIdsToDelete)
    if (error) throw new Error(error.message)
  }

  // Folders first: a survey row carrying a folder_id needs that folder to exist
  // before the foreign key is checked.
  if (foldersToUpsert.length > 0) {
    const { error } = await supabase
      .from("folders")
      .upsert(foldersToUpsert.map((folder) => toFolderRow(folder, userId)))
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

export function syncSurveys(
  current: Workspace,
  previous: Workspace,
): Promise<void> {
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