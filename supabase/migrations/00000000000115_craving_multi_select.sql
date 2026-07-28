-- Craving question multi-select (2026-07-28): "Any strong cravings
-- today?" (checkin_probe.cravings_today) only ever allowed one answer,
-- but a real day can have more than one craving (e.g. sugar AND
-- caffeine) — this adds a real 'multi_select' response type to the
-- driver_probe_questions system rather than special-casing this one
-- question.
--
-- 1. Widens the response_type CHECK constraint (migration 106) to
--    include 'multi_select' alongside the existing five values.
-- 2. Converts checkin_probe.cravings_today in place to 'multi_select' —
--    not a "retire and replace" (a new question_key) — because its
--    answers are stored in daily_checkin_probe_answers.value, which is
--    already a generic jsonb column (not a typed scalar column), so no
--    schema change is needed there and a plain single-value-to-array
--    wrap is a clean, lossless migration for existing rows (see step 3).
--    The coach Question Bank's response-type lock (lib/driver-probe-
--    admin/data.ts) only guards edits made through that screen's own
--    action — it does not and should not block a reviewed migration.
-- 3. Existing answers survive: any already-recorded answer for this
--    question whose stored value is a bare jsonb string (e.g. "salty")
--    is wrapped into a single-element array (["salty"]) so every past
--    answer keeps its exact original meaning under the new shape. Guarded
--    by jsonb_typeof so this step is safely re-runnable.

alter table driver_probe_questions
  drop constraint driver_probe_questions_response_type_check;

alter table driver_probe_questions
  add constraint driver_probe_questions_response_type_check
  check (response_type in ('scale', 'single_select', 'multi_select', 'time_pair', 'count', 'boolean'));

update driver_probe_questions
set response_type = 'multi_select'
where question_key = 'checkin_probe.cravings_today';

update daily_checkin_probe_answers
set value = jsonb_build_array(value)
where question_key = 'checkin_probe.cravings_today'
  and jsonb_typeof(value) = 'string';
