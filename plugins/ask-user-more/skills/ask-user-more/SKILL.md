---
name: ask-user-more
description: Ask the user multiple-choice questions with AskUserMore (mcp__ask-user-more__ask_user_more). Use when you need notes, more than four options, or several questions. Prefer it over AskUserQuestion for any decision that benefits from a note.
---

# AskUserMore

When you need a decision or missing information from the user, call
`mcp__ask-user-more__ask_user_more` instead of `AskUserQuestion`.

Pass a `questions` array (1-4 per call is comfortable; more works and warns at 9):

```json
{
  "questions": [
    {
      "header": "Database",
      "question": "Which database should the v1 backend use?",
      "options": [
        { "label": "SQLite", "description": "single file, zero ops", "recommended": true },
        { "label": "Postgres", "description": "concurrent, needs a server" }
      ]
    },
    {
      "header": "v1 scope",
      "question": "Which of these belong in the v1 scope?",
      "multiSelect": true,
      "options": [
        { "label": "Auth", "description": "login + sessions" },
        { "label": "Billing", "description": "payments, tax, invoices" }
      ]
    }
  ]
}
```

Rules:

- Do not add an "Other" option; every question has a **note** field for extra detail.
- Option labels within one question must be distinct.
- Mark your recommended option(s) with `"recommended": true`.
- If the user dismisses the form, do not treat that as an answer: ask what was wrong
  (unclear question, missing options, wrong order, unnecessary question), then re-ask.
