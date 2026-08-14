-- Daily Reset "Your body" screen, count/follow-up mismatch (2026-08-14,
-- reported from a real member account on app.mefwellness.com).
--
-- THE BUG, in data terms. `checkin_probe.meals_skipped_today` is a
-- `count` question offering 0/1/2/3. Its follow-up
-- `checkin_probe.skipped_meal_which` ("Which meal(s) did you skip?") was
-- `single_select` over Breakfast / Lunch / Dinner / "More than one".
-- Answer 2 and there is no way to say WHICH two: tapping a second meal
-- deselected the first, and the only option that acknowledged the
-- situation ("More than one") recorded nothing about which meals they
-- were. The prompt itself said "meal(s)". The question was authored as a
-- multi-select and stored as a single-select.
--
-- WHAT THIS MIGRATION DOES.
-- 1. Converts `checkin_probe.skipped_meal_which` to `multi_select` in
--    place, with exactly Breakfast / Lunch / Dinner, and DELETES the
--    "More than one" option. In place, not "retire and replace" (the
--    pattern migration 110 added for shape changes), for the same reason
--    migration 115 converted the craving question in place: answers live
--    in the generic jsonb `daily_checkin_probe_answers.value`, so a
--    single-value-to-array wrap keeps every past answer's exact meaning
--    and the question_key that the app, the screen-routing table
--    (lib/daily-checkin-adaptive/screenGrouping.ts) and the tests all
--    refer to stays stable.
-- 2. Does the same to `checkin_probe.digestive_symptom_type` ("What kind
--    of discomfort?"), the only OTHER row in the bank with this exact
--    shape: a number-type parent (`checkin_probe.digestion_rating`, a
--    1-5 scale) and a single_select follow-up papered over with a "More
--    than one" option. Bloating and gas on the same morning is an
--    ordinary Tuesday; it was not recordable. No count-matching applies
--    here, because a digestion RATING of 2 does not imply two symptoms,
--    so the only fix it needs is being able to hold more than one answer.
-- 3. Retires the two "More than one" values properly rather than
--    orphaning them. Every already-recorded answer is migrated:
--    - a bare jsonb string (e.g. "breakfast") is wrapped into a
--      one-element array, exactly as migration 115 did;
--    - "more_than_one" becomes an empty array, i.e. "which ones was not
--      recorded", because it never held that information in the first
--      place. For the meals question nothing at all is lost: the number
--      of meals skipped is, and always was, stored on the parent
--      question's own answer row. For the symptom question the fact
--      "there was more than one kind" is not recoverable into specific
--      symptoms by any means, and inventing which ones would be worse
--      than recording that they were not captured. Both steps RAISE
--      NOTICE with the exact row counts they touched, so this is
--      visible in the apply log rather than a silent rewrite.
-- 4. Adds three integrity assertions that fail the migration rather than
--    let this bug class back in through a plain data edit (a coach can
--    change any of this from /coach/questions with no deploy):
--    - no active question anywhere still offers a "more than one" style
--      option while being single_select;
--    - no active `count` question has an active `single_select`
--      follow-up (the shape that produced the report);
--    - every active multi_select follow-up of a `count` parent offers at
--      least as many options as the parent's largest selectable count,
--      so "select 3" can never be an instruction the screen makes
--      impossible to obey.
--
-- No schema change. No new table, column or constraint. `multi_select`
-- has been a valid response_type since migration 115.

update driver_probe_questions
set
  response_type = 'multi_select',
  options = '[{"value":"breakfast","label":"Breakfast"},{"value":"lunch","label":"Lunch"},{"value":"dinner","label":"Dinner"}]'::jsonb
where question_key = 'checkin_probe.skipped_meal_which';

update driver_probe_questions
set
  response_type = 'multi_select',
  options = '[{"value":"bloating","label":"Bloating"},{"value":"cramping","label":"Cramping"},{"value":"reflux_or_heartburn","label":"Reflux or heartburn"},{"value":"gas","label":"Gas"},{"value":"nausea","label":"Nausea"}]'::jsonb
where question_key = 'checkin_probe.digestive_symptom_type';

-- Step 3a: the retired "More than one" answers. Runs BEFORE the
-- string-to-array wrap below so it matches on the original bare string,
-- and is safely re-runnable (after the first run there is no bare
-- "more_than_one" string left to match).
do $$
declare
  retired_count integer;
begin
  update daily_checkin_probe_answers
  set value = '[]'::jsonb
  where question_key in ('checkin_probe.skipped_meal_which', 'checkin_probe.digestive_symptom_type')
    and value = '"more_than_one"'::jsonb;
  get diagnostics retired_count = row_count;
  raise notice 'migration 157: retired "more_than_one" answers rewritten to []: % row(s)', retired_count;
end $$;

-- Step 3b: every other already-recorded answer keeps its exact meaning,
-- as a one-element array. Guarded by jsonb_typeof, so re-running is a
-- no-op (the same guard migration 115 used).
do $$
declare
  wrapped_count integer;
begin
  update daily_checkin_probe_answers
  set value = jsonb_build_array(value)
  where question_key in ('checkin_probe.skipped_meal_which', 'checkin_probe.digestive_symptom_type')
    and jsonb_typeof(value) = 'string';
  get diagnostics wrapped_count = row_count;
  raise notice 'migration 157: single answers wrapped into one-element arrays: % row(s)', wrapped_count;
end $$;

-- Assertion 1: no active single_select question still leans on a fake
-- "more than one" option to stand in for an answer it cannot hold.
-- Deliberately scoped to single_select: "More than once" on
-- checkin_probe.crash_timing is a genuine answer to a question about
-- WHEN something happened (its parent is a plain yes/no, so nothing can
-- contradict anything), and this must not silently drag that into scope.
do $$
declare
  offenders text;
begin
  select string_agg(question_key, ', ')
  into offenders
  from driver_probe_questions q
  where q.active
    and q.response_type = 'single_select'
    and exists (
      select 1
      from jsonb_array_elements(q.options) opt
      where opt->>'value' in ('more_than_one', 'more_than_once')
    )
    and q.question_key <> 'checkin_probe.crash_timing';
  if offenders is not null then
    raise exception 'A single_select question still offers a stand-in "more than one" option instead of being multi_select: %', offenders;
  end if;
end $$;

-- Assertion 2: the reported shape itself. A `count` parent asks for a
-- number; a single_select follow-up can only ever record one thing.
do $$
declare
  offenders text;
begin
  select string_agg(child.question_key || ' (parent ' || parent.question_key || ')', ', ')
  into offenders
  from driver_probe_questions child
  join driver_probe_questions parent
    on parent.question_key = child.requires->0->>'question_key'
  where child.active
    and parent.active
    and parent.response_type = 'count'
    and child.response_type = 'single_select';
  if offenders is not null then
    raise exception 'A count question has a single_select follow-up, which cannot record more than one answer: %', offenders;
  end if;
end $$;

-- Assertion 3: a multi_select follow-up of a count parent must be able
-- to satisfy the largest count that parent offers, or the screen would
-- ask for something it does not display.
do $$
declare
  offenders text;
begin
  select string_agg(
    child.question_key || ' offers ' || jsonb_array_length(child.options)
      || ' options but ' || parent.question_key || ' allows up to ' || parent_max.max_count,
    ', '
  )
  into offenders
  from driver_probe_questions child
  join driver_probe_questions parent
    on parent.question_key = child.requires->0->>'question_key'
  cross join lateral (
    select max((opt#>>'{}')::numeric) as max_count
    from jsonb_array_elements(parent.options) opt
  ) parent_max
  where child.active
    and parent.active
    and parent.response_type = 'count'
    and child.response_type = 'multi_select'
    and jsonb_array_length(child.options) < parent_max.max_count;
  if offenders is not null then
    raise exception 'A count parent can ask for more selections than its multi_select follow-up offers: %', offenders;
  end if;
end $$;
