# Survey Tally App — Implementation Plan

## 1. Product goal

Build a polished local-first React application for creating flexible survey questionnaires and rapidly tallying completed paper, interview, or field surveys. The product should make repetitive entry fast enough to use without a mouse, while still supporting open-ended and conditional questions when a survey needs them.

The first version is a single-user browser app. It does not include accounts, a backend, real share links, or multi-user synchronization.

## 2. Success criteria

- A user can create, rename, edit, duplicate, and delete a survey.
- The survey builder supports flexible question formats and option editing without requiring code.
- A user can enter one complete respondent at a time and commit it as an individual response row.
- Choice and rating questions expose visible keyboard shortcuts (for example, `1`–`4`), and pressing a mapped key immediately records the choice and advances when appropriate.
- Users who prefer a mouse or touch can tally through large answer cards, and users doing review/correction can use a compact response grid.
- Live totals, percentages, response counts, averages, and open-text answer lists update from saved responses.
- Accidental entries can be undone and existing response rows can be edited or deleted.
- Surveys and responses survive refreshes through browser local storage.
- Results and raw response rows can be exported in CSV; the complete survey can be backed up/restored as JSON.
- The interface works at desktop and mobile widths and has clear focus, labels, and keyboard instructions.

## 3. Information architecture

Use a responsive application shell with a compact left navigation on desktop and a top/mobile navigation treatment on narrow screens.

Primary destinations:

1. **Surveys** — survey library and starting dashboard.
2. **Builder** — structure and configure the selected survey.
3. **Tally** — enter responses using keyboard, pointer, or compact grid workflows.
4. **Results** — review summaries and response-level data.

A seeded example survey (“Community Feedback”) should make the empty scaffold immediately understandable. Users can delete or edit it, and its presence should be initialized only on first use.

## 4. Visual and interaction direction

- Create a calm, precise operations-tool aesthetic rather than a generic form-builder page.
- Use an ink/slate neutral foundation, warm off-white surfaces, a vivid indigo primary accent, and a mint/teal success accent for completed tallies.
- Use a clear sans-serif typographic hierarchy, generous whitespace, soft bordered cards, restrained shadows, and compact data surfaces.
- Make keyboard mapping part of the visual design: each selectable answer gets a keycap badge, the active question is strongly framed, and the next action is always visible.
- Use small motion only for useful feedback: count increment, saved response confirmation, mode changes, and undo restoration. Respect reduced-motion preferences.
- Since the repository has no design-system package, implement a small set of local reusable UI primitives/styles (button, input, select, card, badge, modal/drawer, icon wrapper) consistently rather than introducing a large third-party component library.

## 5. Survey library

### Survey cards

Each card shows:

- title and optional description;
- status (`Draft` or `Active`);
- question count;
- saved response count;
- last-edited time;
- actions for Open/Tally, Edit, Duplicate, Export backup, and Delete.

### Library actions

- “New survey” creates a blank draft and opens the builder.
- Search filters by survey title.
- A small summary strip shows total surveys, total response rows, and the most recently used survey.
- Destructive delete uses an in-app confirmation dialog and clearly states that its local responses will also be removed.

## 6. Survey builder

### Survey-level fields

- title (required before activation);
- description/instructions;
- draft/active status;
- optional respondent identifier label, such as “Form number” or “Household ID.”

### Supported question types

1. Single choice
2. Multiple choice
3. Yes/No
4. Rating scale (configurable minimum/maximum and endpoint labels)
5. Numeric response (optional min/max/step)
6. Short text
7. Long text
8. Date
9. Section heading/instruction block (display-only)

Every answerable question supports a required toggle and optional helper text. Choice-based questions support add, rename, remove, and reorder options. Single/multiple-choice questions allow keyboard codes to be generated from option order; the UI should explain that direct numeric shortcuts are available for up to nine options, with letter shortcuts as a fallback when necessary.

### Editing interactions

- Add-question menu offers all supported types with short descriptions.
- Question cards can be selected, duplicated, deleted, and reordered with explicit Move up/Move down controls (reliable and accessible; drag-and-drop is not required).
- Inline editing updates the preview immediately.
- Builder has two panes on wide screens: question outline and selected-question editor/preview. On narrow screens these stack.
- Validation prevents activation when the title is blank, an answerable question has no prompt, a choice question has fewer than two valid options, or a conditional rule references invalid values.

### Conditional visibility

Support straightforward show/hide logic at the question level:

- condition source must be an earlier answerable question;
- operators: equals, does not equal, contains (multi-select/text), greater than, less than;
- one condition per question in this version;
- hidden questions are skipped during tallying and stored as `null` for that response;
- if an earlier answer changes, any now-hidden dependent answer is cleared before commit.

This provides useful branching without introducing nested rule groups or a full logic-expression editor.

## 7. Tally workspace

The Tally area should have three entry methods sharing the same draft-response state.

### A. Quick Keys mode (default)

Designed for heads-down data entry of one questionnaire at a time.

- Show one active question prominently, a progress indicator, current respondent number/identifier, and a compact list of already answered questions.
- Choice answers appear as large cards with visible keycap mappings.
- Number/letter keys select mapped options.
- For single choice, yes/no, and rating questions, a shortcut selection auto-advances after brief visual confirmation.
- For multiple choice, shortcuts toggle choices and `Enter` advances.
- Numeric, text, and date questions focus the appropriate field; `Enter` advances (`Shift+Enter` creates a newline for long text).
- `Backspace` on an empty field returns to the prior visible question.
- `Escape` clears the current question’s draft answer.
- `Ctrl/Cmd+Enter` commits the response when all required visible questions are valid.
- On the final answer, show a clear “Save response” state rather than silently committing, unless “auto-save completed response” has been enabled in the tally settings.
- After save, increment the response number, reset the draft, keep focus in the tally surface, and show a reversible confirmation toast.

Keyboard handlers must ignore global shortcuts while the user is typing in text fields, except for explicitly documented combinations.

### B. Tap mode

Designed for tablets and occasional entry.

- Show all visible questions as stacked cards with large touch targets.
- Use the same validation and draft state as Quick Keys mode.
- Keep a sticky footer with progress, validation state, and Save response.

### C. Grid mode

Designed for reviewing, correcting, and entering compact records.

- Show one row per saved respondent and one column per answerable question.
- Provide an “Add row” action that opens a compact editable row/drawer rather than attempting spreadsheet-grade freeform editing.
- Rows can be opened, edited, duplicated, or deleted.
- On small screens, render records as cards rather than forcing an unusable wide table.

### Session utilities

- Live counters by answer option remain visible in a collapsible side panel so each key press feels trustworthy.
- Undo restores the most recently added, edited, or deleted response in the current session.
- “Reset draft” clears only the uncommitted respondent and requires confirmation if it contains answers.
- A tally settings menu controls auto-advance and final-answer auto-save behavior.

## 8. Results and data handling

### Summary view

- Header metrics: total complete responses, today/session count, completion coverage, and last entry time.
- For single choice, yes/no, and rating: horizontal distribution bars with count and percentage.
- For multiple choice: selection count and percentage of respondents per option.
- For rating and numeric: response count, average, minimum, and maximum, plus a simple distribution where practical.
- For short/long text: searchable answer list with blank count.
- For date: sorted recent values and value counts when dates repeat.
- Section/instruction blocks do not produce result cards.
- Empty result cards explain that data will appear after the first saved response.

### Response table

- One row per committed respondent.
- Search by respondent identifier and text values.
- Open a row to edit or delete it.
- Display values in human-readable form while preserving stable question/option IDs internally.

### Export/import

- **Raw CSV:** one row per response; columns for response ID, respondent identifier, created/updated timestamps, and every question. Multi-select values are joined with a documented delimiter.
- **Summary CSV:** one row per summarized answer/category with question, metric, value/count, and percentage where relevant.
- **JSON backup:** survey schema, settings, and all response rows for lossless backup.
- **JSON restore:** validate the backup version and required fields before importing; reject malformed files with a clear message; avoid overwriting an existing survey ID by generating a new ID on import.
- Generate downloads entirely in the browser; no data is uploaded.

## 9. Data model and state flow

Use TypeScript types with stable generated IDs so question labels/options can be renamed without corrupting historical references.

Core entities:

- `Survey`: id, title, description, status, identifierLabel, questions, tallySettings, timestamps, schemaVersion.
- `Question`: id, type, prompt, helpText, required, type-specific configuration, optional visibility condition.
- `Option`: id, label, shortcut.
- `ResponseRecord`: id, surveyId, optional respondentIdentifier, answers keyed by question ID, createdAt, updatedAt.
- `DraftResponse`: same answer shape plus active question index and dirty state; it is session UI state and is not counted until committed.
- `UndoAction`: most recent response mutation and enough prior data to reverse it.

State approach:

- Keep application state in React using a reducer and context local to the app; no additional state library is necessary.
- Persist normalized surveys and response records to versioned local-storage keys after state changes.
- Parse and validate stored data defensively at startup. If data is malformed or from an unsupported version, retain a recoverable backup value where possible and initialize safe defaults rather than crashing.
- Derive all summaries from committed response rows with memoized pure functions; do not maintain independent aggregate counters that can drift from raw rows.
- Evaluate conditional visibility through a shared pure helper used by builder preview, tally modes, validation, and results coverage.

## 10. Component/file structure

Keep the implementation understandable without over-fragmenting:

- `src/App.tsx` — app shell, high-level route/view state, provider composition.
- `src/types.ts` — survey, question, answer, response, and action types.
- `src/data.ts` — seeded example and defaults.
- `src/storage.ts` — versioned local-storage load/save and JSON import validation.
- `src/utils.ts` — IDs, branching evaluation, answer formatting, CSV generation, and aggregate calculations.
- `src/components/ui.tsx` — small reusable local primitives and icons.
- `src/components/SurveyLibrary.tsx` — survey dashboard/library.
- `src/components/SurveyBuilder.tsx` — survey and question configuration.
- `src/components/TallyWorkspace.tsx` — shared draft state and mode switcher.
- `src/components/QuickTally.tsx` — keyboard-first flow.
- `src/components/TapTally.tsx` — all-question pointer/touch flow.
- `src/components/ResponseGrid.tsx` — response review/editing.
- `src/components/ResultsView.tsx` — summaries, response table, exports.
- `src/index.css` — Tailwind import, theme variables, global typography, focus treatment, and limited custom motion.

If implementation reveals that a listed component is very small, keep it colocated with its parent rather than creating a file solely to match this outline.

## 11. Edge cases and safeguards

- Prevent duplicate shortcut mappings within one question.
- Ignore hidden required questions during response validation.
- Clear answers that become hidden after an upstream answer changes.
- Treat `0` as a valid numeric answer rather than as empty.
- Preserve option IDs when labels change; warn before deleting an option that existing responses reference, and display historical deleted-option values as “Removed option” rather than losing them.
- Confirm destructive survey deletion and bulk response clearing.
- Prevent accidental page-level keyboard shortcuts while a modal is open.
- Truncate long labels visually where necessary but expose the full text through accessible names/titles.
- Use semantic labels, visible focus states, sufficient contrast, and live announcements for saved/undone tallies.
- Local storage quota failures should show a persistent warning and offer immediate JSON export rather than implying data was saved.
- CSV cells must be correctly escaped for commas, quotes, and line breaks.

## 12. Implementation sequence

1. Define types, seeded data, reducer/state context, and versioned persistence.
2. Create the visual foundation and reusable primitives, then implement the responsive app shell/navigation.
3. Build the survey library and lifecycle actions.
4. Build the flexible survey editor, validation, reordering, and single-condition branching.
5. Implement shared draft-response validation and visibility helpers.
6. Implement Quick Keys mode and shortcut/focus behavior.
7. Add Tap mode and response grid editing on the same draft/record model.
8. Implement results aggregations, visual summaries, search, and response editing.
9. Add raw/summary CSV export and JSON backup/restore.
10. Polish responsive behavior, empty/error states, motion, accessibility, and storage-failure handling.

## 13. Verification strategy

Because this is a broad UI/data change, run the repository’s production build (`pnpm build`) after implementation and fix all TypeScript/Vite failures. Do not start another development server because the environment already supervises one.

Manually verify through the existing preview:

1. First launch initializes the example once and refresh preserves edits.
2. Create a survey containing every question type, reorder questions/options, and configure a valid conditional question.
3. Confirm invalid builder states cannot be activated and provide actionable errors.
4. Tally several responses using only the keyboard, including back-navigation, multiple choice, text entry, hidden branches, and final commit.
5. Enter another response in Tap mode; edit, duplicate, and delete records in Grid mode.
6. Confirm undo restores add/edit/delete operations correctly.
7. Confirm summaries exactly match the committed rows, including zero values, skipped branches, multi-select percentages, and edited/deleted options.
8. Export raw and summary CSV and inspect escaping and column alignment.
9. Export JSON, import it as a separate survey, and confirm structure/responses are preserved.
10. Test narrow/mobile and desktop layouts, keyboard focus order, visible focus, modal focus behavior, and reduced-motion behavior.
11. Simulate malformed local-storage and invalid import payloads and confirm the app recovers with a clear message rather than crashing.

## 14. Explicitly out of scope

- User accounts, cloud synchronization, teams, permissions, and audit logs.
- Real public survey links or respondent-facing hosted forms.
- Collaborative simultaneous tallying.
- Nested condition groups, calculated fields, skip-to-section rules, or arbitrary scripting.
- File uploads, signatures, geolocation, and media capture.
- Statistical significance testing or advanced cross-tab analysis.
- Spreadsheet-grade inline editing or drag-and-drop question ordering.
