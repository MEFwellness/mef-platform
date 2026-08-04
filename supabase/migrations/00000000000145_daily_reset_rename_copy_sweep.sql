-- Member Fixes Batch (2026-08-03), FIX 2 — "Morning Readiness" renamed to
-- "Daily Reset" in member-facing display copy (app code, no schema/column/
-- key changes; see app/checkin/page.tsx, components/checkin/
-- CheckInModeSwitch.tsx, components/checkin/DailyWellnessSection.tsx,
-- app/onboarding/OnboardingCompletionScreen.tsx). The `screen` column
-- value ('morning'/'evening') on driver_probe_questions is unchanged.
--
-- This migration is the one piece of that same fix that lives in data,
-- not code: checkin_probe.morning_soreness's stored question prompt
-- (migration 109) assumed the member was answering right when they woke
-- up ("How sore does your body feel this morning?"), which reads oddly
-- once the same screen is taken in the afternoon or evening. Reworded to
-- be honest at any time of day. The WHERE clause matches the exact
-- original wording so this never overwrites a coach's own edit made since
-- migration 109 via /coach/questions (Coach Question Bank screen) — if a
-- coach already changed this prompt, this update simply matches zero rows.
update driver_probe_questions
set prompt = 'How sore does your body feel right now?'
where question_key = 'checkin_probe.morning_soreness'
  and prompt = 'How sore does your body feel this morning?';
