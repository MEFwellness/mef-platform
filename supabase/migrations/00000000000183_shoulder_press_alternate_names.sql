-- ============================================================================
-- 183. One more name migration 182 did not reach.
-- ============================================================================
-- 182 swept 119 names and its guard patterns did not describe this shape: a
-- row whose "name" is three synonyms for the same movement, joined by
-- dashes, exactly as the vendor's own alternate-title field was exported.
--
--     Shoulder press - Overhead press - Military press   ->   Shoulder Press
--
-- A member reading her session sees three names for one thing and cannot
-- tell whether she is being asked to do one exercise or three. The other
-- two are not lost to a coach's search: "Barbell Overhead Press", "Seated
-- Barbell Military Press" and "One-Arm Kettlebell Military Press" are all
-- separate catalog rows and all still match those terms.
--
-- "Shoulder Press" is free: the catalog holds "Barbell Shoulder Press",
-- "Dumbbell Shoulder Press", "Machine Shoulder Press" and "Shoulder Press
-- Machine", and no bare one. Asserted below rather than assumed.
--
-- NOT RENAMED, and the reason it is not: "Seated Dumbbell Curl - One Arm -
-- Alternating" is the only other row joined this way, and its dashes join
-- QUALIFIERS rather than synonyms, which is a legible style the catalog
-- uses elsewhere ("Kettlebell swing - American style"). Rewriting it would
-- mean deciding whether the vendor meant one arm or alternating arms, which
-- is a content question, not a naming one.
--
-- Same discipline as 182: exercise_catalog only, matched on the exact old
-- name so a re-run does nothing, and nothing frozen is touched.
-- ============================================================================

update public.exercise_catalog
set name = 'Shoulder Press',
    updated_at = now()
where name = 'Shoulder press - Overhead press - Military press';

do $$
declare
  v_count int;
  v_dupes int;
  v_drift int;
begin
  if exists (
    select 1 from exercise_catalog
    where name = 'Shoulder press - Overhead press - Military press'
  ) then
    raise exception 'The synonym-stuffed name is still in the catalog';
  end if;

  select count(*) into v_count from exercise_catalog where name = 'Shoulder Press';
  if v_count <> 1 then
    raise exception 'Expected exactly 1 row named "Shoulder Press", found %', v_count;
  end if;

  -- Same normalization as tests/exercise-catalog-no-duplicate-names.test.ts.
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
    raise exception 'exercise_catalog now has % duplicate-name group(s)', v_dupes;
  end if;

  -- Migration 176's invariant, over the whole table.
  select count(*) into v_drift
  from program_blueprint_slots s
  join exercise_catalog c
    on c.provider = s.provider and c.external_id = s.external_id
  where s.exercise_name is distinct from c.name;
  if v_drift > 0 then
    raise exception '% blueprint slot name(s) no longer agree with their catalog row', v_drift;
  end if;
end $$;
