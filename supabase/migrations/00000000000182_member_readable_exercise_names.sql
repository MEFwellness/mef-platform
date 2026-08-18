-- ============================================================================
-- 182. Member-readable exercise names: the vendor plumbing swept out of the
--      catalog.
-- ============================================================================
-- Migration 176 renamed one exercise ("Split squat (R)" -> "Split Squat") and
-- said in its own header that the "(R)" was vendor plumbing that had leaked
-- into a name a member reads. It was not the only one. 102 client-assignable
-- rows carry a side marker, three of them with the bracket left unclosed
-- ("Standing Palm-In One-Arm Dumbbell Press (L"), and a further 17 carry a
-- vendor artefact of some other kind: a double space, an underscore where an
-- apostrophe belonged, a trailing export code ("- 105", "- 56"), a note the
-- vendor left to itself ("(ISSUE_ back on pick up a bit bend)"), a collision
-- marker ("(1)"), a stray bracket, a typo, or a name that starts lowercase.
--
-- This migration renames 119 rows in exercise_catalog and NOTHING ELSE. No
-- engine, no rule, no program, no member flow, and no other table.
--
-- ---------------------------------------------------------------------------
-- WHY THE SIDE IS STILL SAID, IN WORDS, ON 101 OF THEM
-- ---------------------------------------------------------------------------
-- CLAUDE.md's naming rule bans the "(L)" / "(R)" form outright, and allows a
-- distinguishing word when "dropping the word would leave two exercises
-- sharing a name". For the split squat there was no second row, so the clean
-- name stood alone. For 49 of the pairs here there IS a second row: Your Move
-- ships "Calf stretch (left)" and "Calf stretch (right)" as two catalog
-- entries with two different videos. Renaming both to "Calf Stretch" would
-- put two identically-named rows in the catalog, which is the exact defect
-- tests/exercise-catalog-no-duplicate-names.test.ts exists to prevent (see
-- migration 121 for the one-time cleanup of the vendor's own duplicates).
--
-- So the side stays, but it stops being a vendor code and becomes English:
--
--     Calf stretch (left)   ->  Calf Stretch, Left Side
--
-- The pair also stays adjacent under a coach's search, which "Left Calf
-- Stretch" would not: a coach typing "calf stretch" still gets both.
--
-- WHETHER THOSE PAIRS SHOULD INSTEAD BE MERGED TO ONE ROW EACH IS NOT DECIDED
-- HERE. It is a catalog decision, not a naming one, it retires vendor rows,
-- and at least one pair is demonstrably NOT a clean mirror: "Dumbbell Side
-- Bend (L)" and "Dumbbell Side Bend (R)" both describe holding the dumbbell
-- in the RIGHT hand, so the vendor's own L/R labels cannot be trusted to mean
-- what they appear to mean. The pairs are listed in the completion report for
-- that decision. Nothing here forecloses it.
--
-- ---------------------------------------------------------------------------
-- WHAT IS DELIBERATELY LEFT ALONE
-- ---------------------------------------------------------------------------
--   * program_blueprint_slots. Migration 176 updated it because the slot it
--     renamed pointed at the renamed row. Not one of the 50 blueprint slots
--     points at any row renamed here, so there is nothing to follow. Asserted
--     in 4d below, over the whole table, rather than assumed.
--
--   * coach_program_template_exercises, coach_assigned_workout_exercises,
--     member_exercise_completions, member_exercise_recent_views. These are
--     records of what was prescribed or done on a day, and they keep the name
--     they froze with, by design, exactly as 176 left them. A checksum of
--     every one of those columns is taken before and after and asserted
--     identical, so "we did not touch them" is proved rather than claimed.
--
--   * exercise_catalog.slug. It is the vendor's own slug, it is never
--     rendered to a member, and 176 left "split-squat-r" in place after
--     renaming that row. Same treatment.
--
--   * Six rows whose vendor artefact is the ONLY thing distinguishing them
--     from a near-duplicate row: "High Knees v1", "Heel touches - v2",
--     "Dumbbell fly - v2", "Dips on bench 2", "Bear plank shoulder taps - 30"
--     and "Foward Lunges Bodyweight". Cleaning any of them collides with an
--     existing row, so each needs a dedupe decision, not a rename. Listed in
--     the report. Only one of the six matches the plumbing patterns in 4c,
--     and it is named there as an explicit, counted exception so it cannot
--     quietly grow into a list.
--
--   * Equipment words. "Dumbbell Goblet Squat" stays, because the catalog
--     already holds a separate "Goblet squat" row and CLAUDE.md's own test
--     ("would dropping the word leave two exercises sharing a name") says the
--     word is doing work. It is also on two blueprint slots.
--
--   * Mid-name casing on rows with no other defect ("Bear plank Shoulder
--     taps", "Kettlebell swing - American style"). 59 rows read that way,
--     most of them perfectly legible, and restyling them is a larger and more
--     opinionated sweep than the one asked for.
--
-- Idempotent throughout: every UPDATE matches on the exact old name, so a
-- second run renames nothing and the assertions still pass.
-- ============================================================================

-- ============================================================================
-- 1) Before: a checksum of every frozen name, so 4e can prove none moved.
-- ============================================================================
create temporary table frozen_name_checksum_before on commit drop as
  select 'template_exercises' as tbl,
         md5(coalesce(string_agg(exercise_name, '|' order by id), '')) as digest
  from coach_program_template_exercises
  union all
  select 'assigned_workout_exercises',
         md5(coalesce(string_agg(exercise_name, '|' order by id), ''))
  from coach_assigned_workout_exercises
  union all
  select 'completions',
         md5(coalesce(string_agg(exercise_name, '|' order by id), ''))
  from member_exercise_completions
  union all
  select 'recent_views',
         md5(coalesce(string_agg(exercise_name, '|' order by id), ''))
  from member_exercise_recent_views
  union all
  select 'blueprint_slots',
         md5(coalesce(string_agg(exercise_name, '|' order by id), ''))
  from program_blueprint_slots;

-- ============================================================================
-- 2) The renames, grouped the way the completion report groups them.
-- ============================================================================
create temporary table catalog_renames (
  old_name text primary key,
  new_name text not null
) on commit drop;

insert into catalog_renames (old_name, new_name) values
  -- pair - both halves of a left/right pair exist, so the side is kept,
  --        in words, because the bare name would collide with its own twin.
  ('Calf stretch (left)', 'Calf Stretch, Left Side'),
  ('Calf stretch (right)', 'Calf Stretch, Right Side'),
  ('Cow face pose (left)', 'Cow Face Pose, Left Side'),
  ('Cow face pose (right)', 'Cow Face Pose, Right Side'),
  ('Crescent lunge (left)', 'Crescent Lunge, Left Side'),
  ('Crescent lunge (right)', 'Crescent Lunge, Right Side'),
  ('Downward facing dog split (left)', 'Downward Facing Dog Split, Left Side'),
  ('Downward facing dog split (right)', 'Downward Facing Dog Split, Right Side'),
  ('Dumbbell One-Arm Shoulder Press (L)', 'Dumbbell One-Arm Shoulder Press, Left Side'),
  ('Dumbbell One-Arm Shoulder Press (R)', 'Dumbbell One-Arm Shoulder Press, Right Side'),
  ('Dumbbell One-Arm Upright Row (L)', 'Dumbbell One-Arm Upright Row, Left Side'),
  ('Dumbbell One-Arm Upright Row (R)', 'Dumbbell One-Arm Upright Row, Right Side'),
  ('Dumbbell Side Bend (L)', 'Dumbbell Side Bend, Left Side'),
  ('Dumbbell Side Bend (R)', 'Dumbbell Side Bend, Right Side'),
  ('Explosive sprinter lunge (left)', 'Explosive Sprinter Lunge, Left Side'),
  ('Explosive sprinter lunge (right)', 'Explosive Sprinter Lunge, Right Side'),
  ('Extended side angle pose (left)', 'Extended Side Angle Pose, Left Side'),
  ('Extended side angle pose (right)', 'Extended Side Angle Pose, Right Side'),
  ('Figure Four Stretch (L)', 'Figure Four Stretch, Left Side'),
  ('Figure Four Stretch (R)', 'Figure Four Stretch, Right Side'),
  ('Fire log pose (left)', 'Fire Log Pose, Left Side'),
  ('Fire log pose (right)', 'Fire Log Pose, Right Side'),
  ('Gate pose (left)', 'Gate Pose, Left Side'),
  ('Gate pose (right)', 'Gate Pose, Right Side'),
  ('Half frog pose (left)', 'Half Frog Pose, Left Side'),
  ('Half frog pose (right)', 'Half Frog Pose, Right Side'),
  ('Half lord of the fishes pose (left)', 'Half Lord of the Fishes Pose, Left Side'),
  ('Half lord of the fishes pose (right)', 'Half Lord of the Fishes Pose, Right Side'),
  ('Half moon (left)', 'Half Moon, Left Side'),
  ('Half moon (right)', 'Half Moon, Right Side'),
  ('Half split (left)', 'Half Split, Left Side'),
  ('Half split (right)', 'Half Split, Right Side'),
  ('Halo with dumbbell (L)', 'Halo with Dumbbell, Left Side'),
  ('Halo with dumbbell (R)', 'Halo with Dumbbell, Right Side'),
  ('Hip stretch (left)', 'Hip Stretch, Left Side'),
  ('Hip stretch (right)', 'Hip Stretch, Right Side'),
  ('Knee to Chest Stretch (L)', 'Knee to Chest Stretch, Left Side'),
  ('Knee to Chest Stretch (R)', 'Knee to Chest Stretch, Right Side'),
  ('Knee tucked Side plank up and downs (Left)', 'Knee Tucked Side Plank Up and Downs, Left Side'),
  ('Knee tucked Side plank up and downs (right', 'Knee Tucked Side Plank Up and Downs, Right Side'),
  ('Lateral neck stretch (left)', 'Lateral Neck Stretch, Left Side'),
  ('Lateral neck stretch (right)', 'Lateral Neck Stretch, Right Side'),
  ('Low lunge (left)', 'Low Lunge, Left Side'),
  ('Low lunge (right)', 'Low Lunge, Right Side'),
  ('Lunges (Left)', 'Lunges, Left Side'),
  ('Lunges (Right)', 'Lunges, Right Side'),
  ('My Side Bend Stretch (L)', 'Side Bend Stretch, Left Side'),
  ('One-Arm Side Laterals (L)', 'One-Arm Side Laterals, Left Side'),
  ('One-Arm Side Laterals (R)', 'One-Arm Side Laterals, Right Side'),
  ('Posterior upper arm (left)', 'Posterior Upper Arm Stretch, Left Side'),
  ('Posterior upper arm stretch (right)', 'Posterior Upper Arm Stretch, Right Side'),
  ('Pyramid pose (left)', 'Pyramid Pose, Left Side'),
  ('Pyramid pose (right)', 'Pyramid Pose, Right Side'),
  ('Reclined pigeon pose (left)', 'Reclined Pigeon Pose, Left Side'),
  ('Reclined pigeon pose (right)', 'Reclined Pigeon Pose, Right Side'),
  ('Reverse warrior (left)', 'Reverse Warrior, Left Side'),
  ('Reverse warrior (right)', 'Reverse Warrior, Right Side'),
  ('Revolved chair pose (left)', 'Revolved Chair Pose, Left Side'),
  ('Revolved chair pose (right)', 'Revolved Chair Pose, Right Side'),
  ('Revolved triangle pose (left)', 'Revolved Triangle Pose, Left Side'),
  ('Revolved triangle pose (right)', 'Revolved Triangle Pose, Right Side'),
  ('Sage marichi I pose (left)', 'Sage Marichi I Pose, Left Side'),
  ('Sage marichi I pose (right)', 'Sage Marichi I Pose, Right Side'),
  ('Seated eagle arm (right)', 'Seated Eagle Arms, Right Side'),
  ('Seated eagle arms (left)', 'Seated Eagle Arms, Left Side'),
  ('Side Bend Stretch (R)', 'Side Bend Stretch, Right Side'),
  ('Side bend (left)', 'Side Bend, Left Side'),
  ('Side bend (right)', 'Side Bend, Right Side'),
  ('Side plank pose (left)', 'Side Plank Pose, Left Side'),
  ('Side plank pose (right)', 'Side Plank Pose, Right Side'),
  ('Side plank up and down (left)', 'Side Plank Up and Down, Left Side'),
  ('Side plank up and down (right)', 'Side Plank Up and Down, Right Side'),
  ('Singel arm push up (L)', 'Single Arm Push Up, Left Side'),
  ('Single arm push up (R)', 'Single Arm Push Up, Right Side'),
  ('Standing Hamstring Stretch (L)', 'Standing Hamstring Stretch, Left Side'),
  ('Standing Hamstring Stretch (R)', 'Standing Hamstring Stretch, Right Side'),
  ('Standing One-Arm DB Triceps ExtensioN (L)', 'Standing One-Arm Triceps Extension, Left Side'),
  ('Standing One-Arm DBl Triceps Extension (R)', 'Standing One-Arm Triceps Extension, Right Side'),
  ('Standing Palm-In One-Arm Dumbbell Press (L', 'Standing Palm-In One-Arm Dumbbell Press, Left Side'),
  ('Standing Palm-In One-Arm Dumbbell Press (R', 'Standing Palm-In One-Arm Dumbbell Press, Right Side'),
  ('Standing Quad Stretch (L)', 'Standing Quad Stretch, Left Side'),
  ('Standing Quad Stretch (R)', 'Standing Quad Stretch, Right Side'),
  ('Tiger pose (left)', 'Tiger Pose, Left Side'),
  ('Tiger pose (right)', 'Tiger Pose, Right Side'),
  ('Tree pose (left)', 'Tree Pose, Left Side'),
  ('Tree pose (right)', 'Tree Pose, Right Side'),
  ('Triangle pose (left)', 'Triangle Pose, Left Side'),
  ('Triangle pose (right)', 'Triangle Pose, Right Side'),
  ('Upper back and shoulder stretch (left)', 'Upper Back and Shoulder Stretch, Left Side'),
  ('Upper back and shoulder stretch (right)', 'Upper Back and Shoulder Stretch, Right Side'),
  ('Warrior I (left)', 'Warrior I, Left Side'),
  ('Warrior I (right)', 'Warrior I, Right Side'),
  ('Warrior II (left)', 'Warrior II, Left Side'),
  ('Warrior II (right)', 'Warrior II, Right Side'),
  ('Warrior III (left)', 'Warrior III, Left Side'),
  ('Warrior III (right)', 'Warrior III, Right Side'),
  ('Wild thing pose (left)', 'Wild Thing Pose, Left Side'),
  ('Wild thing pose (right)', 'Wild Thing Pose, Right Side'),
  -- orphan-clean - only one side exists and the bare name is free: the
  --                Split Squat case, so the side marker simply goes.
  ('Dumbbell get ups (R)', 'Dumbbell Get Ups'),
  -- orphan-collides - only one side exists, but the bare name is already
  --                   taken by a different catalog row, so the side is kept.
  ('Dumbbell Discus (L)', 'Dumbbell Discus, Left Side'),
  ('Dumbbell Side lunge (L)', 'Dumbbell Side Lunge, Left Side'),
  ('Over and under (Left)', 'Over and Under, Left Side'),
  -- junk - no side involved; a vendor artefact of another kind.
  ('Barbell Shoulder Press -  Barbell Overhead Press - Barbell Military Press', 'Barbell Shoulder Press'),
  ('Bent Over Two-Arm Long Bar Row - 105', 'Bent Over Two-Arm Long Bar Row'),
  ('Child_s pose -Lower back', 'Child''s Pose for Lower Back'),
  ('Cuads Belt Squat Machine', 'Quad Belt Squat Machine'),
  ('Declined Push up - 56', 'Declined Push Up'),
  ('Half squat get up )', 'Half Squat Get Up'),
  ('Jumping Ropes  skips', 'Jumping Rope Skips'),
  ('Normal grip pull ups (Full range of motion', 'Normal Grip Pull Ups, Full Range of Motion'),
  ('Power Snatch (ISSUE_ back on pick up a bit bend)', 'Power Snatch'),
  ('Squats to knee(1)', 'Squats to Knee'),
  ('back stretch', 'Back Stretch'),
  ('chair Twists', 'Chair Twists'),
  ('front raises', 'Front Raises'),
  ('hip abduction', 'Hip Abduction'),
  ('inverted row', 'Inverted Row'),
  ('narrow squats chair', 'Narrow Squats with Chair'),
  ('neck stretch', 'Neck Stretch');

-- Which of the 119 this database actually holds, recorded before the update
-- so 3a can check "everything that was there moved" rather than "all 119
-- exist here". Production holds all 119; a developer database seeded from an
-- older catalog snapshot may hold fewer, and that is not a failure.
create temporary table renames_present_before on commit drop as
  select r.old_name, r.new_name, c.external_id
  from catalog_renames r
  join exercise_catalog c on c.name = r.old_name;

update public.exercise_catalog c
set name = r.new_name,
    updated_at = now()
from catalog_renames r
where c.name = r.old_name;

-- ============================================================================
-- 3) Assertions (style: migrations 153, 174, 175, 176).
-- ============================================================================
do $$
declare
  -- The one row that still matches a plumbing pattern on purpose. Cleaning
  -- "Bear plank shoulder taps - 30" means calling it either "Bear Plank
  -- Shoulder Taps" (already a row) or "Plank Shoulder Taps" (also already a
  -- row, and what its own description actually describes: feet hip-width,
  -- straight line head to heels, which is not a bear plank). Either way it
  -- needs a dedupe decision, so it keeps its vendor suffix until it gets one.
  k_deferred constant text[] := array['f2fef2bc-353c-4f3b-b7c3-ee5d63e2a87b'];

  v_expected     int;
  v_present      int;
  v_still_old    int;
  v_missing      int;
  v_ambiguous    int;
  v_moved        int;
  v_dupes        int;
  v_plumbing     int;
  v_deferred     int;
  v_slot_drift   int;
  v_frozen_drift int;
  v_row          record;
begin
  select count(*) into v_expected from catalog_renames;
  if v_expected <> 119 then
    raise exception 'Expected 119 renames in this migration, the table carries %', v_expected;
  end if;

  -- ------------------------------------------------------------------
  -- 3a. Every old name this database held is gone, the row that held it
  --     now holds the new name, and the row itself is the same row: same
  --     external_id, because a rename must never become an insert.
  -- ------------------------------------------------------------------
  select count(*) into v_present from renames_present_before;
  raise notice 'member-readable names: % of % renames apply to this database',
    v_present, v_expected;

  select count(*) into v_still_old
  from exercise_catalog c join catalog_renames r on r.old_name = c.name;
  if v_still_old > 0 then
    raise exception 'exercise_catalog still carries % pre-rename name(s)', v_still_old;
  end if;

  select count(*) into v_moved
  from renames_present_before b
  join exercise_catalog c on c.external_id = b.external_id
  where c.name = b.new_name;
  if v_moved <> v_present then
    for v_row in
      select b.old_name, b.new_name, c.name as actual
      from renames_present_before b
      left join exercise_catalog c on c.external_id = b.external_id
      where c.name is distinct from b.new_name
    loop
      raise notice '  "%" should now read "%", reads "%"',
        v_row.old_name, v_row.new_name, coalesce(v_row.actual, '<row gone>');
    end loop;
    raise exception 'Only % of % rows carry their new name', v_moved, v_present;
  end if;

  select count(*) into v_ambiguous
  from renames_present_before b
  where (select count(*) from exercise_catalog c where c.name = b.new_name) <> 1;
  if v_ambiguous > 0 then
    raise exception '% renamed name(s) are not unique in the catalog', v_ambiguous;
  end if;

  -- Nothing was created or destroyed: v_missing is the count of rename
  -- targets that vanished entirely, which an UPDATE cannot cause and which
  -- a stray trigger could.
  select count(*) into v_missing
  from renames_present_before b
  where not exists (select 1 from exercise_catalog c where c.external_id = b.external_id);
  if v_missing > 0 then
    raise exception '% renamed row(s) no longer exist in the catalog', v_missing;
  end if;

  -- ------------------------------------------------------------------
  -- 3b. No duplicate names anywhere in the catalog, under the SAME
  --     normalization tests/exercise-catalog-no-duplicate-names.test.ts
  --     uses (lib/exercise-library/catalogDedupe.ts): strip a trailing
  --     "(N)" collision marker, lowercase, replace every non-alphanumeric
  --     with a space, collapse runs of space. A rename that merged two
  --     rows into one name is caught here rather than by a red test after
  --     deploy.
  -- ------------------------------------------------------------------
  select count(*) into v_dupes from (
    select 1
    from exercise_catalog
    group by trim(regexp_replace(
               regexp_replace(
                 lower(regexp_replace(name, '\s*\(\s*\d+\s*\)\s*$', '')),
                 '[^a-z0-9\s]', ' ', 'g'),
               '\s+', ' ', 'g'))
    having count(*) > 1
  ) d;
  if v_dupes > 0 then
    for v_row in
      select trim(regexp_replace(
               regexp_replace(
                 lower(regexp_replace(name, '\s*\(\s*\d+\s*\)\s*$', '')),
                 '[^a-z0-9\s]', ' ', 'g'),
               '\s+', ' ', 'g')) as key,
             string_agg(name || ' [' || external_id || ']', ' / ') as members
      from exercise_catalog
      group by 1 having count(*) > 1
    loop
      raise notice '  duplicate group %: %', v_row.key, v_row.members;
    end loop;
    raise exception 'exercise_catalog now has % duplicate-name group(s)', v_dupes;
  end if;

  -- ------------------------------------------------------------------
  -- 3c. No client-assignable name carries vendor plumbing any more,
  --     except the one row named in k_deferred.
  --
  --     \y, not \b: in a Postgres regular expression \b is a backspace,
  --     and \y is the word boundary. Writing \b here would have made the
  --     "DB"/"DBl" clause match nothing and pass vacuously.
  -- ------------------------------------------------------------------
  select count(*) into v_plumbing
  from exercise_catalog
  where is_client_assignable
    and not (external_id = any (k_deferred))
    and (
      name ~ '\((L|R|l|r|left|right|Left|Right)\)?\s*$'  -- side marker, closed or not
      or name ~ '\((L|R|left|right|Left|Right)\)'        -- side marker mid-name
      or name ~ '\s-\s*\d+\s*$'                          -- trailing export code
      or name ~ '  '                                     -- double space
      or name <> btrim(name)                             -- padded
      or name ~ '_'                                      -- underscore
      or name ~* 'issue'                                 -- a note to the vendor
      or name ~ '\(\s*\d+\s*\)\s*$'                      -- collision marker
      or name ~ '^[a-z]'                                 -- lowercase start
      or (name ~ '\)\s*$' and name !~ '\([^()]*\)\s*$')  -- stray closing bracket
      or (name ~ '\(' and name !~ '\)')                  -- unclosed bracket
      or name ~ '\yDBl?\y'                               -- DB / DBl abbreviation
    );
  if v_plumbing > 0 then
    for v_row in
      select name from exercise_catalog
      where is_client_assignable
        and not (external_id = any (k_deferred))
        and (
          name ~ '\((L|R|l|r|left|right|Left|Right)\)?\s*$'
          or name ~ '\((L|R|left|right|Left|Right)\)'
          or name ~ '\s-\s*\d+\s*$'
          or name ~ '  '
          or name <> btrim(name)
          or name ~ '_'
          or name ~* 'issue'
          or name ~ '\(\s*\d+\s*\)\s*$'
          or name ~ '^[a-z]'
          or (name ~ '\)\s*$' and name !~ '\([^()]*\)\s*$')
          or (name ~ '\(' and name !~ '\)')
          or name ~ '\yDBl?\y'
        )
      order by name
    loop
      raise notice '  still carries plumbing: %', v_row.name;
    end loop;
    raise exception '% client-assignable name(s) still carry vendor plumbing', v_plumbing;
  end if;

  -- The exception list is not allowed to be vacuous or to have grown: it
  -- names exactly one row, that row still exists, and it is still the only
  -- deferred one.
  select count(*) into v_deferred
  from exercise_catalog where external_id = any (k_deferred);
  if v_deferred <> 1 then
    raise exception 'The deferred-rename exception should name exactly 1 live row, it names %', v_deferred;
  end if;

  -- ------------------------------------------------------------------
  -- 3d. Migration 176's invariant, re-checked over the whole table: every
  --     blueprint slot's denormalized name still agrees with the catalog
  --     row it points at. This is the one thing a catalog rename silently
  --     breaks, so it is checked for all 50 slots, not only for the ones
  --     this migration expected to touch.
  -- ------------------------------------------------------------------
  select count(*) into v_slot_drift
  from program_blueprint_slots s
  join exercise_catalog c
    on c.provider = s.provider and c.external_id = s.external_id
  where s.exercise_name is distinct from c.name;
  if v_slot_drift > 0 then
    for v_row in
      select s.exercise_name as slot_name, c.name as catalog_name
      from program_blueprint_slots s
      join exercise_catalog c
        on c.provider = s.provider and c.external_id = s.external_id
      where s.exercise_name is distinct from c.name
    loop
      raise notice '  slot "%" vs catalog "%"', v_row.slot_name, v_row.catalog_name;
    end loop;
    raise exception
      '% blueprint slot name(s) no longer agree with their catalog row. A rename landed on a row a blueprint points at; either revert that rename or follow it into program_blueprint_slots the way migration 176 did.',
      v_slot_drift;
  end if;

  -- ------------------------------------------------------------------
  -- 3e. Nothing frozen moved. By checksum, across all five denormalized
  --     name columns.
  -- ------------------------------------------------------------------
  select count(*) into v_frozen_drift
  from frozen_name_checksum_before b
  join (
    select 'template_exercises' as tbl,
           md5(coalesce(string_agg(exercise_name, '|' order by id), '')) as digest
    from coach_program_template_exercises
    union all
    select 'assigned_workout_exercises',
           md5(coalesce(string_agg(exercise_name, '|' order by id), ''))
    from coach_assigned_workout_exercises
    union all
    select 'completions',
           md5(coalesce(string_agg(exercise_name, '|' order by id), ''))
    from member_exercise_completions
    union all
    select 'recent_views',
           md5(coalesce(string_agg(exercise_name, '|' order by id), ''))
    from member_exercise_recent_views
    union all
    select 'blueprint_slots',
           md5(coalesce(string_agg(exercise_name, '|' order by id), ''))
    from program_blueprint_slots
  ) a on a.tbl = b.tbl
  where a.digest is distinct from b.digest;
  if v_frozen_drift > 0 then
    raise exception
      '% frozen-name column(s) changed. This migration renames exercise_catalog and nothing else.',
      v_frozen_drift;
  end if;

  raise notice 'member-readable names: % catalog rows renamed, 0 duplicates, 0 unexpected plumbing matches, frozen history untouched',
    v_expected;
end $$;

-- ============================================================================
-- 4) What a coach still finds when she searches.
--
-- Exercise search is a plain substring match on name (searchExerciseCatalog
-- in lib/your-move/catalog.ts, ilike '%q%'). There is no alias column and no
-- alias mechanism anywhere in the schema, so an old name cannot be kept as a
-- search alias without adding one, which is outside this task's scope.
--
-- In practice nothing a coach would actually type stops working: every
-- rename keeps the movement words in the same order, so "calf stretch",
-- "warrior ii", "power snatch", "side bend stretch", "palm-in" and "triceps
-- extension" all still match. What stops matching is the plumbing itself,
-- which is the point: "(L)", "- 105", and the vendor's three typos ("Cuads",
-- "Singel", "DBl"). A coach who had memorised "Singel arm push up" now finds
-- it by typing it correctly.
-- ============================================================================
