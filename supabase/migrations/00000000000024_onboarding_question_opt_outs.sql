-- allows_not_sure / allows_not_applicable / allows_prefer_not_to_answer
-- defaulted to true for every question (migration 8), so every onboarding
-- question — including ones with a clear, always-answerable response like
-- "how many hours do you sleep" or "how would you rate your everyday
-- stress" — offered all three opt-out radios, and a user could satisfy the
-- form's "required" check by picking any of them without giving a real
-- answer. None of Sprint 1's seeded questions (supabase/seed/
-- 01_onboarding_questions.sql) are sensitive personal history, so none of
-- them should offer "prefer not to answer" either. Flip the default to
-- false (opt-in per question going forward, not opt-out by default) and
-- correct the existing rows to match — a genuinely sensitive future
-- question can still set these true explicitly.
alter table onboarding_questions
  alter column allows_not_sure set default false,
  alter column allows_not_applicable set default false,
  alter column allows_prefer_not_to_answer set default false;

update onboarding_questions
set
  allows_not_sure = false,
  allows_not_applicable = false,
  allows_prefer_not_to_answer = false;
