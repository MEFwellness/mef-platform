-- ============================================================================
-- 188. C9 and L2: the em dashes left in stored content.
-- ============================================================================
-- CLAUDE.md's copy rule bans the em dash from anything a member or a coach
-- reads, and tests/no-em-dash-guard.test.ts enforces it across the source.
-- It cannot see stored content. The 2026-08-27 sweep found 31 rows of
-- exercise_catalog carrying one in `description` or `exercise_tips`, 8 of
-- them on `is_client_assignable` rows a member can actually be handed
-- ("8 Count Body Builder", "Ab Bridge Complex", "Bridge march", "Cable Fly
-- Low to High", "Hip hinge", "Push up Circles", "Sciatic nerve flossing
-- nerve glide with a chair", "Side Bend with Dumbbells"). The other 23 are
-- MEF-authored corrective rows a coach reads in the Exercise Library.
--
-- ALL 31 ARE FIXED, not just the 8. Reachability is a property of today's
-- catalog flags, not of the text, and the coach reads the other 23.
--
-- WHAT REPLACES THE DASH, AND WHY IT IS WRITTEN OUT BY HAND
-- ---------------------------------------------------------------------------
-- Every one of the 34 occurrences is the same rhetorical move ("do X, and
-- then the correction"), but "replace the dash with a comma" would leave 30
-- comma splices, and "replace it with a period" would leave three sentence
-- fragments. So each replacement is written out: a PERIOD and a capital
-- where the second half is a whole sentence, a COLON where it renames what
-- came before it, and a COMMA on the single occurrence where it does not
-- end a clause at all ("jump up, completing the eight-count sequence").
--
-- Each pair is a short, unique substring, applied with replace(), so this
-- edits the dash and its two neighbouring words and NOTHING else in the
-- row. Nothing is retyped, so no vendor instruction can be silently
-- reworded by this migration.
--
-- IDEMPOTENT. The loop only visits rows that still contain an em dash, and
-- replace() of a string that is no longer there is a no-op, so a second run
-- selects nothing and changes nothing. It is also safe to run against a
-- catalog where somebody has since edited one of these rows: only the exact
-- fragments below are touched.
--
-- NOT FIXED HERE, AND NAMED SO IT IS NOT MISTAKEN FOR FIXED: the vendor
-- import path can put an em dash back the next time the catalog is
-- refreshed. This migration cleans what is stored today. A guard on the
-- import is a separate piece of work.
-- ============================================================================

do $$
declare
  r record;
  i int;
  new_description text;
  new_tips text[];
  pairs text[][] := array[
    -- The one occurrence that does not end a clause.
    array['jump up—completing', 'jump up, completing'],
    -- Vendor rows: no spaces around the dash, always before "avoid" or a new sentence.
    array['in the plank—avoid sagging hips.', 'in the plank. Avoid sagging hips.'],
    array['one straight line—avoid sagging hips', 'one straight line. Avoid sagging hips'],
    array['level throughout—avoid tilting', 'level throughout. Avoid tilting'],
    array['in the elbows—avoid turning', 'in the elbows. Avoid turning'],
    array['neutral spine throughout—avoid rounding', 'neutral spine throughout. Avoid rounding'],
    array['from head to heels—avoid sagging hips.', 'from head to heels. Avoid sagging hips.'],
    array['Bend laterally only—avoid leaning forward', 'Bend laterally only. Avoid leaning forward'],
    array['slowly and rhythmically—this is a gliding motion', 'slowly and rhythmically. This is a gliding motion'],
    -- MEF-authored corrective rows: spaced dash, "Common mistake: X — Y".
    array['instead of side-bending — keep your chest open.', 'instead of side-bending. Keep your chest open.'],
    array['all the way to the floor — stop where you feel', 'all the way to the floor. Stop where you feel'],
    array['hike up toward the ear — keep it pulled gently down.', 'hike up toward the ear. Keep it pulled gently down.'],
    array['front of the shoulder — back the angle down', 'front of the shoulder. Back the angle down'],
    array['low back to get lower — let the stretch come', 'low back to get lower. Let the stretch come'],
    array['stretch with the hand — let your own head weight', 'stretch with the hand. Let your own head weight'],
    array['side of the neck itself — stay on the muscle', 'side of the neck itself. Stay on the muscle'],
    array['hard and holding still — small slow movement', 'hard and holding still. Small slow movement'],
    array['yank the chin down — the motion should feel', 'yank the chin down. The motion should feel'],
    array['over the shoulder joint — stay on the muscle', 'over the shoulder joint. Stay on the muscle'],
    array['down into the low back — stay above the bottom', 'down into the low back. Stay above the bottom'],
    array['collarbone or armpit — stay on the fleshy muscle', 'collarbone or armpit. Stay on the fleshy muscle'],
    array['directly on the spine itself — the balls should sit', 'directly on the spine itself. The balls should sit'],
    array['front of the hip bone — stay on muscle, not joint.', 'front of the hip bone. Stay on muscle, not joint.'],
    array['on the hip bone itself — shift slightly down', 'on the hip bone itself. Shift slightly down'],
    array['across the back of the knee — stop just above the joint.', 'across the back of the knee. Stop just above the joint.'],
    array['as the head lifts — if that happens', 'as the head lifts. If that happens'],
    array['to jerk the arms up — keep the movement slow', 'to jerk the arms up. Keep the movement slow'],
    array['force a bigger range — a smaller range with full contact', 'force a bigger range. A smaller range with full contact'],
    array['by lifting the hips — keep them grounded throughout.', 'by lifting the hips. Keep them grounded throughout.'],
    array['to fake the draw-in — the spine should stay still', 'to fake the draw-in. The spine should stay still'],
    array['hard like a crunch — this should feel like a slow', 'hard like a crunch. This should feel like a slow'],
    -- The three where the second half renames the first, so a colon, not a period.
    array['base of the skull — a gentle chin glide', 'base of the skull: a gentle chin glide'],
    array['lying down — the entry-level chin tuck.', 'lying down: the entry-level chin tuck.'],
    array['the two chin tucks — a small head lift', 'the two chin tucks: a small head lift']
  ];
  remaining int;
begin
  for r in
    select id, description, exercise_tips
    from exercise_catalog
    where description like '%—%'
       or array_to_string(coalesce(exercise_tips, array[]::text[]), '|') like '%—%'
  loop
    new_description := r.description;
    new_tips := r.exercise_tips;

    for i in 1 .. array_length(pairs, 1) loop
      if new_description is not null then
        new_description := replace(new_description, pairs[i][1], pairs[i][2]);
      end if;
      if new_tips is not null then
        new_tips := array(select replace(x, pairs[i][1], pairs[i][2]) from unnest(new_tips) x);
      end if;
    end loop;

    update exercise_catalog
       set description = new_description,
           exercise_tips = new_tips
     where id = r.id;
  end loop;

  -- Fails the migration rather than reporting success over copy that is
  -- still wrong. If a row the sweep did not see has an em dash in a shape
  -- none of the pairs above matches, this says so instead of leaving it.
  select count(*) into remaining
  from exercise_catalog
  where description like '%—%'
     or array_to_string(coalesce(exercise_tips, array[]::text[]), '|') like '%—%';

  if remaining > 0 then
    raise exception 'C9: % exercise_catalog rows still carry an em dash after this migration', remaining;
  end if;
end $$;

-- ============================================================================
-- L2: the four registry_entries labels that carry an em dash.
-- ============================================================================
-- "Discomfort — hips" and "Discomfort — lower back", four rows across three
-- members, all `status = 'superseded'`.
--
-- Nothing renders them today for two independent reasons, and the sweep only
-- recorded the first: they are superseded, AND `findingDisplayName`
-- (lib/naming/findingNames.ts) maps `movement::pain_hips` and
-- `movement::pain_lower_back` to names of its own and never reaches the
-- stored label for either code. This closes the third: the stored text now
-- agrees with what the display layer would say, so a future reader that
-- prints the column raw cannot print an em dash from these rows.
--
-- Guarded on the em dash, so re-running does nothing.
-- ============================================================================

update registry_entries
   set label = 'Hip discomfort you reported'
 where label = 'Discomfort — hips';

update registry_entries
   set label = 'Lower back discomfort you reported'
 where label = 'Discomfort — lower back';

do $$
declare
  remaining int;
begin
  select count(*) into remaining from registry_entries where label like '%—%';
  if remaining > 0 then
    raise exception 'L2: % registry_entries labels still carry an em dash', remaining;
  end if;
end $$;
