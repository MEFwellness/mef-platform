-- Root Movement, Level 1 — refining the six lineups so each session is a
-- clearly different solution rather than the same library rearranged six
-- ways.
--
-- NOTHING STRUCTURAL CHANGES HERE. No new table, no new column, no new
-- event type, no new session, no rename, no change to the six session
-- keys, and the decision engine's 'movement' action type stays BLOCKED.
-- This migration only rewrites the ORDERED SLOTS of the six templates
-- seeded by migration 153, plus two member-facing description sentences
-- that a lineup change made inaccurate.
--
-- That is exactly the shape migration 153 promised: "swapping an
-- exercise, a prescription or a rest interval is an UPDATE, never a
-- deploy". This file is that UPDATE, recorded durably so the lineups are
-- reproducible from an empty database.
--
-- The six identities each session now has to earn:
--
--   morning_mobility     wake the body up
--   desk_reset           undo prolonged sitting
--   hip_back_reset       open and stabilize hips and lower back
--   shoulder_neck_reset  release upper-body tension, restore support
--   core_foundation      teach trunk control and stability
--   recovery_day         deliberately downshift and restore
--
-- The standing rules from migration 153 are unchanged and still enforced
-- at the bottom of this file and by tests/movement-session-templates.ts:
-- mobility before stability before strength, core last where a session
-- has core, no crunches or loaded spinal flexion, no release tier, no
-- power tier, nothing above moderate strain, every slot resolves to a
-- catalog exercise with a real Your Move video, and the shared
-- vocabulary stays under forty distinct exercises.
--
-- FOUR EXERCISES ARE NEW to Root Movement, all already present in the
-- production catalog with has_video = true, all beginner, all bodyweight
-- or chair:
--
--   Bridge pose         (stretch, mobility, low)     morning_mobility
--   Lateral leg swing   (mobility, stability, low)   morning_mobility
--   Hip hinge           (mobility, strength, mod)    desk_reset
--   Reclined butterfly  (stretch, low)               recovery_day
--
-- THREE LEAVE the vocabulary entirely: Wall Sit, Bodyweight Squat and
-- Heel to toe walk. Reasons are at each session below. Distinct
-- vocabulary goes 39 -> 39.
--
-- A KNOWN GAP, recorded rather than papered over: Core Foundation should
-- open on a breathing / bracing drill and Recovery Day should open on a
-- breathing downshift. The library does contain two suitable exercises
-- (mef_custom 'Supine TVA Draw-In Breathing' and '4-Point TVA Vacuum'),
-- but BOTH have has_video = false in production, and no other exercise in
-- the catalog is tagged program_section = 'breathing'. Nothing was
-- invented, faked or placeholdered to fill that slot. Core Foundation
-- opens on Cat cow instead (finding a neutral spine before loading it)
-- and Recovery Day opens on Reclined butterfly (supported, supine, "close
-- your eyes and relax"), which are the best programming-appropriate
-- options that have verified video today.

-- ---------------------------------------------------------------------
-- 1) Two descriptions a lineup change made inaccurate.
-- ---------------------------------------------------------------------
-- Root's voice, no em dashes, no hype, no promise. The other four
-- descriptions are still true of their new lineups and are left alone.
update movement_session_templates
set description = 'Gentle movement to wake the body up before the day starts.',
    updated_at = now()
where session_key = 'morning_mobility';

-- Was "A chair and wall reset". The Wall Sit was the only wall exercise
-- in the session and it has been removed, so the sentence would have
-- described equipment the session no longer uses.
update movement_session_templates
set description = 'A chair and standing reset for a body that has been sitting for hours.',
    updated_at = now()
where session_key = 'desk_reset';

-- ---------------------------------------------------------------------
-- 2) The lineups themselves.
-- ---------------------------------------------------------------------
-- Replaced wholesale rather than patched slot by slot: a lineup is one
-- thing, the ordering rules are a property of the whole list, and a
-- delete-then-insert is the only edit that cannot leave a half-applied
-- order behind. member_movement_session_runs references session_key, not
-- slot ids, so no completion history is touched by this.
delete from movement_session_template_slots;

insert into movement_session_template_slots
  (template_id, slot_order, external_id, prescription_type, prescription_seconds, prescription_reps, rest_seconds)
select t.id, s.slot_order, s.external_id, s.prescription_type, s.prescription_seconds, s.prescription_reps, s.rest_seconds
from (values
  -- =================================================================
  -- Morning Mobility, 10 to 12 min. WAKE THE BODY UP.
  --
  -- The old lineup was eleven slots of which nine were static holds:
  -- child's pose, sphinx, knee to chest left and right, standing
  -- hamstring left and right. It was a good stretch routine and it read
  -- as "Morning Stretch", not as movement preparation. This one moves.
  --
  -- Gentle spinal movement, then hip and thoracic mobility, then
  -- standing movement, then one light stability piece and one light core
  -- piece. Still not a workout: nothing is loaded, nothing is timed
  -- against her, and the two closing pieces are ten reps and one minute.
  -- =================================================================
  ('morning_mobility',  1, '675fab33-9f21-4386-8a43-a319d0684841', 'time', 90, null, 10),  -- Cat cow pose: the gentle spinal movement the session opens on, lengthened from 75s because it is now the whole warm-up
  ('morning_mobility',  2, '1f636f46-0bc3-417d-a3ac-93108ecc26ec', 'time', 75, null, 10),  -- Reclined windshield wipers: gentle spinal ROTATION, which the old lineup had none of
  ('morning_mobility',  3, '31f0a2a6-2d44-4c33-bf3a-2d0687b748a4', 'time', 75, null, 10),  -- NEW Bridge pose: hip and spine extension after a night curled up, moving rather than held
  ('morning_mobility',  4, 'abfd0396-b9b3-41b3-b8ec-88ce2faf0462', 'time', 75, null, 10),  -- Hip flexor stretch: the one hip hold worth keeping in the morning
  ('morning_mobility',  5, 'e3c47861-bcfa-41cf-a191-3524d8679a1c', 'time', 60, null, 10),  -- Downward dog: full body opening, and it is what takes her from the floor toward standing
  ('morning_mobility',  6, '5ba69aaa-7f7a-4564-940e-c6fb7da55c26', 'time', 60, null, 10),  -- Arm swings: the standing movement, thoracic and shoulder, dynamic
  ('morning_mobility',  7, 'b2ad9e74-2fdf-4cd2-b748-1449f2622216', 'reps', null,  16, 10),  -- NEW Lateral leg swing: standing hip movement with a chair for balance, the session's stability tier
  ('morning_mobility',  8, 'b771f714-b1dc-49f8-8df5-9f8ae35bbbae', 'reps', null,  10, 15),  -- Bird Dog: light trunk stability, quadruped, ten reps only
  ('morning_mobility',  9, 'ea1016da-2d73-4ff8-ad2a-9b36150d2f85', 'time', 60, null,  0),  -- Dead Bug: the light core close, unchanged in role

  -- =================================================================
  -- Desk Reset, 10 to 12 min. UNDO PROLONGED SITTING.
  --
  -- Still done in and beside a chair, nothing on the floor, because the
  -- point is that it is doable in the place the stiffness came from.
  -- The neck, chest, thoracic, hip-flexor and pelvic work all stay.
  --
  -- THE WALL SIT IS GONE. A one-minute wall sit is a held ninety degrees
  -- of hip and knee flexion, which is the exact shape she has been in
  -- all day; ending the session there ends it back in the problem. The
  -- session now ends in EXTENSION and on the posterior chain: shoulder
  -- blades down and back, then a standing hip hinge driven by the glutes.
  -- Thoracic rotation was added, since a chair takes rotation away
  -- before it takes anything else.
  -- =================================================================
  ('desk_reset',  1, '8f35f8d8-b982-44af-8b71-4254b5be2532', 'time', 60, null, 10),  -- Head Turns Neck stretches
  ('desk_reset',  2, '50f6c403-a7eb-4c43-9723-c9c4ee7defc7', 'time', 40, null,  5),  -- Lateral neck stretch (left)
  ('desk_reset',  3, 'dfbfc890-af85-4be4-a8c6-782f666f538d', 'time', 40, null, 10),  -- Lateral neck stretch (right)
  ('desk_reset',  4, '52fb4e42-549e-4af2-a83d-f0c6c76f38ae', 'time', 60, null, 10),  -- Armpit Opener: the chest and lat the chair closes
  ('desk_reset',  5, '00c1f017-3a36-4a42-8866-fda39f906f5d', 'time', 60, null, 10),  -- Seated Side Bends: lateral trunk
  ('desk_reset',  6, 'af0e7c20-cd4a-4c26-ac10-1ef6bdaaf35e', 'time', 60, null, 10),  -- chair Twists: thoracic rotation
  ('desk_reset',  7, 'd0fe829c-d734-4429-bcc1-7ac15f2e92e4', 'time', 60, null, 10),  -- Psoas stretch: the hip flexor a chair shortens
  ('desk_reset',  8, 'c1b55b30-7913-4590-87e1-6aac94b23df6', 'time', 60, null, 10),  -- Sitting Pelvic tilts: pelvis back under her before she stands up
  ('desk_reset',  9, 'ddfa0774-6077-4c9c-a590-1547fa987640', 'reps', null,  14, 15),  -- Goal Post Squeeze: upper back extension, cued down and together without shrugging
  ('desk_reset', 10, '033964cc-ed58-4fe3-8850-cf78c66a85b9', 'reps', null,  14,  0),  -- NEW Hip hinge: standing hip extension driven by glutes and hamstrings, replaces the Wall Sit

  -- =================================================================
  -- Hip and Back Reset, 12 to 15 min. OPEN AND STABILIZE.
  --
  -- The strongest of the six. Same fourteen exercises, same
  -- prescriptions, same structure: opening, hips, glute activation,
  -- trunk stability. ONE CHANGE, and it is ordering only.
  --
  -- The two standing hamstring stretches used to sit at slots 9 and 10,
  -- between the floor mobility block and the floor glute block, so a
  -- fourteen-minute session made her get off the floor and back down
  -- again in the middle of it. They are now the standing opening, and
  -- everything from slot 3 on happens on the floor without interruption.
  -- =================================================================
  ('hip_back_reset',  1, '8b749c78-6f8d-46d7-ab75-bb42ed161ae1', 'time', 40, null,  5),  -- Standing Hamstring Stretch (L), moved from slot 9
  ('hip_back_reset',  2, '75593cee-6a28-4842-8222-150647b2157b', 'time', 40, null, 10),  -- Standing Hamstring Stretch (R), moved from slot 10
  ('hip_back_reset',  3, '675fab33-9f21-4386-8a43-a319d0684841', 'time', 75, null, 10),  -- Cat cow pose
  ('hip_back_reset',  4, 'c8b7a380-562e-4ad2-8dfc-7a29b5c56418', 'time', 40, null,  5),  -- Knee to Chest Stretch (L)
  ('hip_back_reset',  5, 'dd76f6bd-dddd-4f97-bf96-29048ec2547e', 'time', 40, null, 10),  -- Knee to Chest Stretch (R)
  ('hip_back_reset',  6, '1f636f46-0bc3-417d-a3ac-93108ecc26ec', 'time', 60, null, 10),  -- Reclined windshield wipers
  ('hip_back_reset',  7, 'f3d25890-dcd5-42b3-8246-a5f596029cc0', 'time', 45, null,  5),  -- Figure Four Stretch (L)
  ('hip_back_reset',  8, '005ba868-d8b1-499f-9a88-b2cf722e6bdf', 'time', 45, null, 10),  -- Figure Four Stretch (R)
  ('hip_back_reset',  9, 'abfd0396-b9b3-41b3-b8ec-88ce2faf0462', 'time', 75, null, 10),  -- Hip flexor stretch
  ('hip_back_reset', 10, 'f96ea3ee-fb2f-4a0f-bc3b-7e63959450c5', 'time', 60, null, 10),  -- Butterfly Stretch
  ('hip_back_reset', 11, 'a62f7e6f-99b3-49cf-a02e-c5146db97da3', 'reps', null,  12, 15),  -- Glute Bridge (Bodyweight)
  ('hip_back_reset', 12, 'd48bc33d-8daa-456a-9f07-32b42a3798e5', 'reps', null,  12, 15),  -- Clams side lying with knee lifts
  ('hip_back_reset', 13, 'b771f714-b1dc-49f8-8df5-9f8ae35bbbae', 'reps', null,  10, 15),  -- Bird Dog
  ('hip_back_reset', 14, 'ea1016da-2d73-4ff8-ad2a-9b36150d2f85', 'time', 60, null,  0),  -- Dead Bug

  -- =================================================================
  -- Shoulder and Neck Reset, 10 to 12 min. RELEASE, THEN SUPPORT.
  --
  -- Close to right already. Two changes, both to the mobility half.
  --
  -- (1) THORACIC MOBILITY WAS NOT SUFFICIENT. The session had thoracic
  --     EXTENSION (Puppy pose) and nothing for thoracic ROTATION, which
  --     is the range a desk-bound upper back loses first and the range a
  --     stiff neck borrows from. chair Twists was added.
  -- (2) Arm swings moved from slot 4 to slot 9, so the mobility block
  --     runs neck, chest, shoulder, thoracic in one seated stretch, and
  --     the dynamic arm work sits where it belongs, immediately before
  --     the shoulder girdle is asked to work.
  --
  -- The neck work is deliberately still only the three slots it was;
  -- nothing was added there. The finish is unchanged and stays that way
  -- on purpose: Goal Post Squeeze is cued "down and together, without
  -- shrugging" and is followed by Wall Push Ups, which protract the
  -- scapula and balance the retraction rather than piling more squeeze
  -- on top of it, and then Bird Dog, where the shoulder supports instead
  -- of squeezing.
  -- =================================================================
  ('shoulder_neck_reset',  1, '8f35f8d8-b982-44af-8b71-4254b5be2532', 'time', 60, null, 10),  -- Head Turns Neck stretches
  ('shoulder_neck_reset',  2, '50f6c403-a7eb-4c43-9723-c9c4ee7defc7', 'time', 40, null,  5),  -- Lateral neck stretch (left)
  ('shoulder_neck_reset',  3, 'dfbfc890-af85-4be4-a8c6-782f666f538d', 'time', 40, null, 10),  -- Lateral neck stretch (right)
  ('shoulder_neck_reset',  4, '52fb4e42-549e-4af2-a83d-f0c6c76f38ae', 'time', 60, null, 10),  -- Armpit Opener
  ('shoulder_neck_reset',  5, 'ef8b7a4f-a209-425b-90dd-d20c402c5b0d', 'time', 40, null,  5),  -- Seated eagle arms (left)
  ('shoulder_neck_reset',  6, '1f96bb5c-a360-4ab0-83c6-23bdb92dd10c', 'time', 40, null, 10),  -- Seated eagle arm (right)
  ('shoulder_neck_reset',  7, 'af0e7c20-cd4a-4c26-ac10-1ef6bdaaf35e', 'time', 60, null, 10),  -- NEW to this session, chair Twists: the missing thoracic rotation
  ('shoulder_neck_reset',  8, '874ef2ee-909f-44db-bd03-25ffd1e24a0d', 'time', 60, null, 10),  -- Puppy pose: thoracic extension
  ('shoulder_neck_reset',  9, '5ba69aaa-7f7a-4564-940e-c6fb7da55c26', 'time', 60, null, 10),  -- Arm swings, moved from slot 4: movement preparation for the work that follows
  ('shoulder_neck_reset', 10, 'ddfa0774-6077-4c9c-a590-1547fa987640', 'reps', null,  12, 15),  -- Goal Post Squeeze
  ('shoulder_neck_reset', 11, 'ceaa0c34-9db0-4642-ad6a-c0125ad88c32', 'reps', null,  10, 15),  -- Wall Push Ups: protraction, balancing the retraction above it
  ('shoulder_neck_reset', 12, 'b771f714-b1dc-49f8-8df5-9f8ae35bbbae', 'reps', null,  10,  0),  -- Bird Dog: the shoulder in a supporting role

  -- =================================================================
  -- Core Foundation, 12 to 15 min. TEACH TRUNK CONTROL.
  --
  -- The old lineup spent slots 4 to 7 on a balance walk, a squat and a
  -- wall sit before it reached any trunk work at all. Those were general
  -- bodyweight fitness, not trunk control, and they are gone:
  --
  --   Heel to toe walk  removed. A balance drill is not trunk control,
  --                     and it is the catalog's only 'intermediate' item
  --                     that was in any of these six sessions.
  --   Bodyweight Squat  removed. It was asked to justify itself and
  --                     could not. Nothing in a bodyweight squat teaches
  --                     a beginner where her ribs and pelvis are; it was
  --                     filling time in the middle of the session that
  --                     is supposed to be the most focused of the six.
  --   Wall Sit          removed. An isometric quad hold. Same reasoning.
  --
  -- What replaces them is more time on the four drills that actually
  -- teach the thing: pelvic control, then dead bug, then bird dog, then
  -- anti-extension, then lateral stability. Dead Bug alone nearly
  -- doubles, from 60s to 110s, because that is where the learning is.
  --
  -- Sitting Pelvic tilts is the explicit "find your pelvis" slot. It is
  -- the only pelvic-tilt drill in the catalog with a video, it is on a
  -- chair, and sitting is genuinely the easiest place for a beginner to
  -- feel a posterior and anterior tilt.
  --
  -- The bridge comes BEFORE the dead bug and bird dog rather than after,
  -- which is the one place this session departs from the order a coach
  -- would say out loud. It has to: the assembly rule is strength before
  -- core work and core work last, and Glute Bridge is tagged strength.
  -- =================================================================
  ('core_foundation',  1, '675fab33-9f21-4386-8a43-a319d0684841', 'time',  60, null, 10),  -- Cat cow pose: find a neutral spine before loading one
  ('core_foundation',  2, 'abfd0396-b9b3-41b3-b8ec-88ce2faf0462', 'time',  60, null, 10),  -- Hip flexor stretch: hip flexors take over when the deep core does not fire
  ('core_foundation',  3, '1f636f46-0bc3-417d-a3ac-93108ecc26ec', 'time',  60, null, 10),  -- Reclined windshield wipers: controlled rotation, supine, and the transition to the floor work
  ('core_foundation',  4, 'c1b55b30-7913-4590-87e1-6aac94b23df6', 'time',  60, null, 15),  -- Sitting Pelvic tilts: pelvic control, taught explicitly
  ('core_foundation',  5, 'a62f7e6f-99b3-49cf-a02e-c5146db97da3', 'reps', null,  14, 15),  -- Glute Bridge (Bodyweight): the posterior chain the trunk braces against
  ('core_foundation',  6, 'ea1016da-2d73-4ff8-ad2a-9b36150d2f85', 'time', 110, null, 25),  -- Dead Bug, 60s -> 110s: the centrepiece of the session
  ('core_foundation',  7, 'b771f714-b1dc-49f8-8df5-9f8ae35bbbae', 'reps', null,  14, 25),  -- Bird Dog: the same control, on the other side of the body
  ('core_foundation',  8, '49739b94-19b6-4ec3-aa93-53e7c4824918', 'time',  50, null, 25),  -- Plank on elbows: anti-extension
  ('core_foundation',  9, 'd0b4d724-b764-434e-a595-98c0d1ff76fb', 'time',  35, null, 15),  -- Side plank pose (left): lateral stability
  ('core_foundation', 10, '84497aca-5092-4038-bf3c-3e9beeae9f8b', 'time',  35, null,  0),  -- Side plank pose (right)

  -- =================================================================
  -- Recovery Day, 15 to 20 min. DOWNSHIFT AND RESTORE.
  --
  -- The old lineup was sixteen slots and overlapped almost everything:
  -- knee to chest, figure four, butterfly and windshield wipers from Hip
  -- and Back Reset, standing hamstrings from Morning Mobility, and the
  -- two lateral neck stretches from Desk Reset. It was the other
  -- sessions, done slowly.
  --
  -- This one is a different KIND of session. Nothing standing. Nothing
  -- bilateral to count through. Ten slots instead of sixteen, with holds
  -- of 60 to 180 seconds instead of 40 to 75, so it feels like settling
  -- rather than working through a list. No strengthening work of any
  -- kind, same as before.
  --
  -- Removed outright: knee to chest left and right, figure four left and
  -- right, standing hamstring left and right, lateral neck left and
  -- right. Every one of them belongs to another session's identity.
  -- =================================================================
  ('recovery_day',  1, '843c04e2-6344-48ad-8641-0321a60dbb63', 'time', 120, null, 10),  -- NEW Reclined butterfly: the downshift, supine and supported, the closest thing the library has to a breathing opener
  ('recovery_day',  2, 'a61479a9-fc68-4b4b-9e4d-2f65cd41defa', 'time',  90, null, 10),  -- Child's pose
  ('recovery_day',  3, '675fab33-9f21-4386-8a43-a319d0684841', 'time',  75, null, 10),  -- Cat cow pose: the gentle mobility, slower and longer than anywhere else
  ('recovery_day',  4, 'c490cf34-6f30-421c-9dbb-d30b5f796efd', 'time',  75, null, 10),  -- Sphinx pose
  ('recovery_day',  5, '874ef2ee-909f-44db-bd03-25ffd1e24a0d', 'time',  90, null, 10),  -- Puppy pose
  ('recovery_day',  6, 'e3c47861-bcfa-41cf-a191-3524d8679a1c', 'time',  60, null, 10),  -- Downward dog: the easy full body opening
  ('recovery_day',  7, 'f96ea3ee-fb2f-4a0f-bc3b-7e63959450c5', 'time',  90, null, 10),  -- Butterfly Stretch
  ('recovery_day',  8, '1f636f46-0bc3-417d-a3ac-93108ecc26ec', 'time',  90, null, 10),  -- Reclined windshield wipers: back on the floor, unwinding
  -- Happy baby pose was here and is gone. It is a supine passive hip
  -- opener, which is what Reclined butterfly at slot 1 already is, and
  -- the vocabulary ceiling is a real budget: keeping both would have put
  -- this build at 40 distinct exercises and failed the check below. The
  -- redundant one lost, not the one doing a job no other slot does.
  ('recovery_day',  9, '658fa4e6-8b1d-48f4-b97d-7c576783ad73', 'time', 180, null,  0)   -- Corpse pose: the deliberate finish, three minutes of doing nothing
) as s(session_key, slot_order, external_id, prescription_type, prescription_seconds, prescription_reps, rest_seconds)
join movement_session_templates t on t.session_key = s.session_key;

-- ---------------------------------------------------------------------
-- 3) Seed integrity, asserted at migration time.
-- ---------------------------------------------------------------------
-- Same block migration 153 ran, re-run against the new lineups, plus two
-- checks this refinement makes worth having: that every template still
-- has slots at all (a delete-then-insert that lost a session_key would
-- otherwise ship a session with an empty lineup), and that the real
-- length of each session still lands inside its own stated target range.
--
-- Duration is computed the same way lib/movement-sessions/duration.ts
-- computes it: work plus rest, four seconds per rep.
do $$
declare
  v_bad integer;
  v_distinct integer;
  v_row record;
begin
  select count(*) into v_bad
  from movement_session_template_slots s
  left join exercise_catalog c
    on c.provider = s.provider and c.external_id = s.external_id
  where c.id is null or c.has_video = false;
  if v_bad > 0 then
    raise exception 'Root Movement lineups: % slot(s) resolve to a missing exercise or one with no video', v_bad;
  end if;

  select count(*) into v_bad
  from movement_session_template_slots s
  join mef_exercise_metadata m
    on m.provider = s.provider and m.external_id = s.external_id
  where m.spinal_flexion_core
     or m.corrective_roles && array['release', 'power']::text[]
     or m.strain_level = 'high';
  if v_bad > 0 then
    raise exception 'Root Movement lineups: % slot(s) use a spinal-flexion, release-tier, power-tier or high-strain exercise', v_bad;
  end if;

  select count(*) into v_bad
  from movement_session_template_slots s
  left join mef_exercise_metadata m
    on m.provider = s.provider and m.external_id = s.external_id
  where m.id is null;
  if v_bad > 0 then
    raise exception 'Root Movement lineups: % slot(s) point at an exercise with no corrective metadata', v_bad;
  end if;

  select count(*) into v_bad
  from movement_session_templates t
  where not exists (select 1 from movement_session_template_slots s where s.template_id = t.id);
  if v_bad > 0 then
    raise exception 'Root Movement lineups: % template(s) ended up with no slots at all', v_bad;
  end if;

  for v_row in
    select t.session_key,
           t.target_duration_min_minutes as lo,
           t.target_duration_max_minutes as hi,
           sum(
             case when s.prescription_type = 'time'
                  then s.prescription_seconds
                  else s.prescription_reps * 4
             end + s.rest_seconds
           )::numeric / 60 as minutes
    from movement_session_templates t
    join movement_session_template_slots s on s.template_id = t.id
    group by t.session_key, t.target_duration_min_minutes, t.target_duration_max_minutes
  loop
    if v_row.minutes < v_row.lo or v_row.minutes > v_row.hi then
      raise exception 'Root Movement lineups: % is %.1f min, outside its stated % to % min range',
        v_row.session_key, v_row.minutes, v_row.lo, v_row.hi;
    end if;
  end loop;

  select count(distinct s.external_id) into v_distinct
  from movement_session_template_slots s;
  if v_distinct >= 40 then
    raise exception 'Root Movement lineups: % distinct exercises, the vocabulary is meant to stay under 40', v_distinct;
  end if;
end
$$;
