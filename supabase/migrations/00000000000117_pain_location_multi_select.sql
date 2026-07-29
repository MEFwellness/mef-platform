-- Discomfort location multi-select (2026-07-29): "Where is the
-- discomfort, mainly?" (checkin_probe.pain_location) only ever allowed
-- one answer, but a real day can hurt in more than one place (e.g.
-- neck AND lower back) — this converts it to a real 'multi_select'
-- response type, the exact same pattern migration 115 already
-- established for checkin_probe.cravings_today, applied here to a
-- second question rather than inventing a new mechanism.
--
-- 1. No CHECK constraint change needed — migration 115 already widened
--    driver_probe_questions_response_type_check to include
--    'multi_select'.
-- 2. Converts checkin_probe.pain_location in place to 'multi_select' —
--    not a "retire and replace" — because its answers are stored in
--    daily_checkin_probe_answers.value, a generic jsonb column, so no
--    schema change is needed and a plain single-value-to-array wrap is
--    a clean, lossless migration for existing rows (see step 3). This
--    row is never read from the database for rendering (CheckinForm.tsx
--    hand-renders this fixed-core-adjacent question via
--    BodySeverityOutline rather than the generic DriverProbeField), so
--    this update only brings its stored metadata in line with its real
--    behavior for the coach Question Bank screen's stats/display.
-- 3. Existing answers survive: any already-recorded answer for this
--    question whose stored value is a bare jsonb string (e.g. "neck")
--    is wrapped into a single-element array (["neck"]) so every past
--    answer keeps its exact original meaning under the new shape.
--    Guarded by jsonb_typeof so this step is safely re-runnable.

update driver_probe_questions
set response_type = 'multi_select'
where question_key = 'checkin_probe.pain_location';

update daily_checkin_probe_answers
set value = jsonb_build_array(value)
where question_key = 'checkin_probe.pain_location'
  and jsonb_typeof(value) = 'string';
