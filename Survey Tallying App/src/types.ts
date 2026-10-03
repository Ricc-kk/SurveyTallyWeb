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
  createdAt: string
  updatedAt: string
}
