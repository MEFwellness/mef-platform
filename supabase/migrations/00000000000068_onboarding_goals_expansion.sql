-- Premium UX polish milestone: replaces the onboarding "goal" question's
-- eight terse options with a fuller, more specific set members can
-- recognize themselves in. Same question identity (question_key,
-- question_version unchanged) since this is a reference-data content
-- update, not a new question, so it stays the single row
-- getOnboardingQuestions() already returns, and every prior answer
-- (a plain string value like 'pain' or 'energy') stays valid and
-- readable against the expanded list. Internal values stay normalized
-- snake_case; OnboardingForm.tsx renders the display label in uppercase.
update onboarding_questions
set allowed_values = '[
  "pain",
  "energy",
  "sleep",
  "stress",
  "weight",
  "digestion",
  "movement",
  "performance",
  "healthy_aging",
  "habits",
  "general_optimization",
  "other"
]'::jsonb
where question_key = 'primary_concern'
  and question_version = 1;
