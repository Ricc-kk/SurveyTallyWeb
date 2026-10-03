import type { Question, QuestionType, Survey } from "./types"

export const uid = () => crypto.randomUUID()

export function makeQuestion(type: QuestionType): Question {
  const choices =
    type === "yesno"
      ? ["Yes", "No"]
      : type === "single" || type === "multiple"
        ? ["Option 1", "Option 2", "Option 3", "Option 4"]
        : []
  return {
    id: uid(),
    type,
    prompt: type === "section" ? "New section" : "Untitled question",
    helpText: "",
    required: type !== "section",
    options: choices.map((label) => ({ id: uid(), label })),
    min: type === "rating" ? 1 : 0,
    max: type === "rating" ? 5 : 100,
    minLabel: type === "rating" ? "Not at all" : "",
    maxLabel: type === "rating" ? "Extremely" : "",
    scaleLabels:
      type === "rating"
        ? { "1": "Not at all", "5": "Extremely" }
        : {},
  }
}

export function makeSurvey(title = "Untitled survey"): Survey {
  const now = new Date().toISOString()
  return {
    id: uid(),
    title,
    description: "",
    identifierLabel: "Form number",
    status: "draft",
    questions: [],
    responses: [],
    autoAdvance: true,
    autoSave: false,
    createdAt: now,
    updatedAt: now,
  }
}
