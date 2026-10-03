export type QuestionType = "single" | "multiple" | "yesno" | "rating" | "number" | "short" | "long" | "date" | "section"

export type Answer = string | string[] | number | null

export interface SurveyOption {
  id: string
  label: string
}

export interface VisibilityRule {
  questionId: string
  operator: "equals" | "not-equals" | "contains" | "greater" | "less"
  value: string
}

export interface Question {
  id: string
  type: QuestionType
  prompt: string
  helpText: string
  required: boolean
  options: SurveyOption[]
  min: number
  max: number
  minLabel: string
  maxLabel: string
  scaleLabels: Record<string, string>
  condition?: VisibilityRule
}

export interface ResponseRecord {
  id: string
  identifier: string
  answers: Record<string, Answer>
  createdAt: string
  updatedAt: string
}

/**
 * A flat grouping of surveys. A survey with a null `folderId` is "Unfiled".
 * Folders never nest — one level is all the app renders.
 */
export interface Folder {
  id: string
  name: string
  createdAt: string
}

export interface Survey {
  id: string
  title: string
  description: string
  identifierLabel: string
  status: "draft" | "active"
  questions: Question[]
  responses: ResponseRecord[]
  autoAdvance: boolean
  autoSave: boolean
  /** null means the survey sits in the Unfiled group. */
  folderId: string | null
  createdAt: string
  updatedAt: string
}
