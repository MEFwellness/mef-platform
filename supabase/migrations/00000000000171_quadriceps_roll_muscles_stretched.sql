-- Approved metadata label fix, candidate 1 of
-- docs/CORRECTIVE_RECLASSIFICATION_CANDIDATES.md.
--
-- WHAT WAS WRONG. Quadriceps Roll is the only client-assignable exercise
-- in the whole catalog carrying the `release` role, and its
-- muscles_stretched array is EMPTY. The Release block selects on "role is
-- release AND it stretches one of this pattern's tight muscles", so an
-- exercise naming no muscle matched no slot, for any pattern, at any
-- severity. That single blank array is why every generated program opened
-- with an empty Release block.
--
-- WHY THIS IS A LABEL FIX AND NOT A CLINICAL JUDGEMENT. The row already
-- carries the `release` role, its equipment is `foam roller`, and its own
-- description is a foam roll of the front of the thighs. Naming the
-- muscles it plainly rolls changes no exercise and asks nothing new of a
-- member. Candidates 3 to 12 in that document are left untouched, pending
-- clinical review.
--
-- WHY muscles_strengthened LOSES TWO ENTRIES. The classifier had written
-- `quads` and `hip flexors` into muscles_strengthened for this row, which
-- is simply wrong: lying on a foam roller does not strengthen the quads.
-- It also cannot stay, because migration 127's
-- mef_exercise_metadata_no_muscle_overlap_check forbids the same muscle
-- appearing in both arrays on one row, and correctly so. The two mistaken
-- entries are removed and `abdominals` and `shoulders` are left exactly as
-- they were, so this migration touches only what candidate 1 covers.
--
-- One consequence worth stating rather than discovering: `hip flexors` is
-- a LONG muscle for Flat Back, so the engine's hard "never stretch a long
-- muscle" backstop will keep excluding this exercise for any member with
-- Flat Back detected. That is the rule working, not a gap this migration
-- introduces.

do $$
declare
  v_updated integer;
  v_stretched text[];
begin
  update mef_exercise_metadata
  set muscles_stretched = array['hip flexors', 'quads']::text[],
      muscles_strengthened = array(
        select unnest(muscles_strengthened)
        except
        select unnest(array['hip flexors', 'quads']::text[])
      ),
      updated_at = now()
  where provider = 'your_move'
    and external_id = 'cc3a2bb8-efcf-440d-9357-887ce0b04346';

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    -- Not an exception: an environment whose catalog predates this row
    -- (or has been rebuilt from a different Your Move snapshot) should
    -- still be able to apply every later migration.
    raise notice 'Quadriceps Roll (cc3a2bb8-efcf-440d-9357-887ce0b04346) is not in mef_exercise_metadata here. Nothing changed.';
    return;
  end if;

  select muscles_stretched into v_stretched
  from mef_exercise_metadata
  where provider = 'your_move'
    and external_id = 'cc3a2bb8-efcf-440d-9357-887ce0b04346';

  if not ('hip flexors' = any(v_stretched)) then
    raise exception 'Quadriceps Roll still does not stretch hip flexors after the update';
  end if;

  raise notice 'Quadriceps Roll now stretches %, so the Release block has a candidate again', v_stretched;
end
$$;
