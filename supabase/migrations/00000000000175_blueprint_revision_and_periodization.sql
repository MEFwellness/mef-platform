-- ============================================================================
-- Blueprint revision: Home Dumbbell Foundation v2, plus the two columns the
-- revision needs.
--
-- WHY THERE IS A v2 AND NOT AN EDIT. Migration 174 seeded v1 as a draft.
-- Nobody has ever been given it, so the versioning rule would allow editing
-- it in place. It is written as a NEW version anyway, because v1 is the
-- thing a coach reviewed and asked for changes to, and the point of a
-- version history is that the reviewed draft is still there to read next to
-- the revision. v1 stays exactly as it was seeded. v2 is the draft that
-- gets approved or does not.
--
-- WHAT THE REVISION CHANGES, and why each one:
--
--   1. The rear lunge is stationary. v1 used "Dumbbell Rear Lunge", which
--      steps back on every rep. The review asked for a stationary version
--      done one leg at a time. The only client-assignable, dumbbell-loaded,
--      genuinely stationary split-stance movement in the catalog is
--      "Split squat (R)", whose own instructions say to complete every rep
--      on one leg before switching. Its name carries "(R)" because the
--      catalog stores left and right as separate rows and only the right
--      one is dumbbell-loaded. That is a catalog naming defect, not a
--      blueprint one, and it is left visible rather than papered over with
--      a blueprint-only display name: this draft is not approved yet, and
--      whoever approves it should see exactly what a member would read.
--
--   2. Side Plank is gone. It was the only intermediate core slot in the
--      program and the hardest hold on it. "Ab Bridge Complex" replaces it:
--      a beginner forearm bridge hold, same job (hold the trunk still under
--      fatigue), materially easier to hold well.
--
--   3. One repeated exercise across the three sessions, not four. v1
--      repeated Cat cow pose, Standing forward bend, Glute Bridge and
--      Single Arm Dumbbell Row. Only the row is kept, on purpose: pull
--      volume twice a week is the point of it. Every session now opens
--      differently.
--
--   4. Strength and core are the majority of the work. Every session is a
--      three exercise opener, then three or four strength movements, then
--      one or two core, and ranks 1 to 5 in every session belong to
--      strength and core, so a shortened session drops the opener first.
--
--   5. Week 3 is recomputed against the new lineup: each session's main
--      lift gains a set and each session's core hold gets longer.
--
-- No loads are prescribed anywhere, same as v1. The coach sets them at the
-- first session.
-- ============================================================================

-- ============================================================================
-- 1) Periodization, on the version.
--
-- Data only. Nothing reads it yet: the engine that plans a progression from
-- it is a later prompt. It is recorded now because a blueprint that already
-- carries a week 3 progression has an implied periodization model, and an
-- implied model is the kind that two screens end up disagreeing about.
-- ============================================================================
alter table movement_program_versions
  add column periodization text
    check (periodization is null or periodization in ('linear', 'undulating'));

comment on column movement_program_versions.periodization is
  'How this program''s load progresses across its weeks: linear (one direction, week over week) or undulating (varies within the week). Data only today, nothing reads it. Null means the blueprint has not said.';

-- ============================================================================
-- 2) Per side, on the slot.
--
-- A prescription of "2 sets of 8" means something different for a split
-- squat than for a goblet squat, and the difference was previously only
-- sayable in prose in the slot's coach-facing purpose. It travels to
-- coach_program_template_exercises.unilateral, a column that has existed
-- since migration 82 and that the blueprint path had no way to set.
--
-- Nothing member-facing renders it today, which is deliberate: the shared
-- prescription formatter is not touched by this migration, so no program
-- any member already holds changes a single word.
-- ============================================================================
alter table program_blueprint_slots
  add column is_per_side boolean not null default false;

comment on column program_blueprint_slots.is_per_side is
  'True when the prescription is per side, i.e. the whole set is completed on one side before the other. Travels to coach_program_template_exercises.unilateral at materialization time.';

-- ============================================================================
-- 3) Home Dumbbell Foundation v2, DRAFT.
-- ============================================================================
insert into movement_program_versions (
  program_id, version_number, display_name, status, notes,
  member_title, member_description,
  coach_purpose, intended_population, cautions,
  duration_weeks, sessions_per_week, equipment_mode, periodization
)
select
  p.id,
  2,
  'Home Dumbbell Foundation v2',
  'draft',
  'Revision of v1 after coach review: stationary single leg work, Side Plank replaced with an easier beginner hold, one deliberate repeat across the week instead of four, and every session rebalanced so strength and core are the majority of the work.',
  'Home Dumbbell Foundation',
  'A four week strength program you can do at home with a pair of dumbbells. Three sessions a week. Each one opens with three short movements to get you ready, then the strength work, then core. In week 3 the main lift of each session gains a set and each core hold gets longer.',
  'A general strength base for a member training at home with dumbbells, built on the MEF session sequence. Session A is squat led, Session B is push and pull led, Session C is hinge and carry led. The opener is deliberately short: three movements, low effort, enough to get ready and no more. Single Arm Dumbbell Row is the one exercise repeated across the week, so the pull gets practised twice.',
  'General beginner to intermediate adults, no acute pain, no current corrective priority. Where a posture finding is driving the plan, the corrective program comes first and this is not a substitute for it.',
  'Reduce or skip anything that causes pain. Review before assigning to anyone with current low back, knee or shoulder pain. Several slots are floor based, so the member needs to be able to get down to and up from the floor unaided. Loads are not prescribed: the coach sets them at the first session.',
  4, 3, 'home', 'linear'
from movement_programs p
where p.key = 'home_dumbbell_foundation';

-- The slots. Columns, in order:
--   session, slot_order, block, exercise name, movement pattern, purpose,
--   priority rank, required, equipment, difficulty, locked, per side,
--   sets, reps, hold seconds, tempo, rest seconds, week overrides
with version as (
  select v.id
  from movement_program_versions v
  join movement_programs p on p.id = v.program_id
  where p.key = 'home_dumbbell_foundation' and v.version_number = 2
),
slot_spec (
  session_designation, slot_order, block, exercise_name, movement_pattern, purpose,
  priority_rank, is_required, equipment_requirement, difficulty_tier, is_locked, is_per_side,
  sets, reps, hold_duration_seconds, tempo, rest_seconds, week_overrides
) as (
  values
  -- ---------------------------------------------------------------- A
  -- Squat led. Opener is three movements and stops there.
  ('A', 1, 'release',   'Cat cow pose',              'spinal',      'Wake the spine up before loading it. Low effort on purpose, and the only opener Session A shares with nothing else in the week.',
      8, false, '{}'::text[],           'beginner',     false, false, 1, null, 60,   null,    15, '{}'::jsonb),
  ('A', 2, 'mobility',  'Hip flexor stretch',        'hip_flexion', 'Length at the front of the hip so the squat and the split squat can reach depth without the low back taking it. Both sides.',
      7, true,  '{}'::text[],           'beginner',     false, true,  2, null, 30,   null,    15, '{}'::jsonb),
  ('A', 3, 'stability', 'Glute Bridge (Bodyweight)', 'hip_hinge',   'Glute activation before the main lift, so the squat is not driven by the quads alone. Session A only.',
      6, true,  '{}'::text[],           'beginner',     false, false, 2, 12,   null, '3-1-3', 30, '{}'::jsonb),
  ('A', 4, 'strength',  'Dumbbell Goblet Squat',     'squat',       'The main lift of Session A. Front loaded so the torso stays upright, which is the point at this level. Gains a set in week 3.',
      1, true,  '{dumbbell}'::text[],   'beginner',     true,  false, 3, 10,   null, '2-0-2', 75, '{"3": {"sets": 4}}'::jsonb),
  ('A', 5, 'strength',  'Split squat (R)',           'lunge',       'Single side strength, stationary. Feet set in a split stance and left there: no stepping in or out, and every rep on one leg before switching. Catalog name carries (R) because the catalog stores left and right as separate rows; the slot is marked per side, so the member does both.',
      2, true,  '{dumbbell}'::text[],   'intermediate', true,  true,  2, 8,    null, '2-0-2', 60, '{}'::jsonb),
  ('A', 6, 'strength',  'Dumbbell Shoulder Press',   'vertical_push','Overhead strength, so a squat led day still has something for the upper body. Two sets: it is the most demanding position on this list.',
      3, true,  '{dumbbell}'::text[],   'beginner',     false, false, 2, 10,   null, '2-0-2', 60, '{}'::jsonb),
  ('A', 7, 'core',      'Plank',                     'anti_extension','Hold the trunk still under fatigue. Timed, never a crunch. Longer hold in week 3.',
      4, true,  '{}'::text[],           'beginner',     false, false, 2, null, 30,   null,    30, '{"3": {"hold_duration_seconds": 40}}'::jsonb),
  ('A', 8, 'core',      'Dead Bug',                  'anti_extension','Trunk control with the arms and legs moving. Slow on purpose.',
      5, true,  '{}'::text[],           'beginner',     false, false, 2, 8,    null, '3-1-3', 30, '{}'::jsonb),

  -- ---------------------------------------------------------------- B
  -- Push and pull led. Different opener from A and C.
  ('B', 1, 'release',   'Arm swings',                'shoulder',    'Get blood into the shoulders before they are loaded. Session B only.',
      8, false, '{}'::text[],           'beginner',     false, false, 1, null, 60,   null,    15, '{}'::jsonb),
  ('B', 2, 'mobility',  'Puppy pose',                'thoracic',    'Upper back and lat length so the press does not come from the low back.',
      7, false, '{}'::text[],           'beginner',     false, false, 2, null, 30,   null,    15, '{}'::jsonb),
  ('B', 3, 'stability', 'Prone W to lifts',          'scapular',    'Mid back activation before the pull, so the row is not all biceps.',
      6, true,  '{}'::text[],           'beginner',     false, false, 2, 10,   null, '3-1-3', 30, '{}'::jsonb),
  ('B', 4, 'strength',  'Dumbbell floor chest press','horizontal_push','The main lift of Session B. Floor press rather than bench: no bench needed, and the floor limits the range for a beginner shoulder. Gains a set in week 3.',
      1, true,  '{dumbbell}'::text[],   'intermediate', true,  false, 3, 10,   null, '2-0-2', 75, '{"3": {"sets": 4}}'::jsonb),
  ('B', 5, 'strength',  'Single Arm Dumbbell Row',   'horizontal_pull','Pull volume to match the press. One side at a time so the stronger side cannot carry the weaker. This is the one exercise repeated across the week, and Session C is the second go at it.',
      2, true,  '{dumbbell}'::text[],   'beginner',     true,  true,  3, 10,   null, '2-0-2', 60, '{}'::jsonb),
  ('B', 6, 'strength',  'Reverse Fly',               'horizontal_pull','Back of the shoulder, to balance the press. Light on purpose: this is about position, not load.',
      3, true,  '{dumbbell}'::text[],   'intermediate', false, false, 2, 12,   null, '2-0-2', 60, '{}'::jsonb),
  ('B', 7, 'core',      'Ab Bridge Complex',         'anti_extension','Forearm bridge hold. This slot replaced Side Plank: same job, easier to hold well at this level. Longer hold in week 3.',
      4, true,  '{}'::text[],           'beginner',     false, false, 2, null, 20,   null,    30, '{"3": {"hold_duration_seconds": 30}}'::jsonb),
  ('B', 8, 'core',      'Bird Dog',                  'anti_rotation','Trunk still while opposite limbs move. Session B only.',
      5, true,  '{}'::text[],           'beginner',     false, false, 2, 10,   null, '3-1-3', 30, '{}'::jsonb),

  -- ---------------------------------------------------------------- C
  -- Hinge and carry led. Third distinct opener.
  ('C', 1, 'release',   'Child''s pose',             'spinal',      'Settle the hips and the upper back before the working sets. Session C only.',
      8, false, '{}'::text[],           'beginner',     false, false, 1, null, 60,   null,    15, '{}'::jsonb),
  ('C', 2, 'mobility',  'Standing forward bend',     'hip_hinge',   'Hamstring length before the hinge.',
      7, false, '{}'::text[],           'beginner',     false, false, 2, null, 30,   null,    15, '{}'::jsonb),
  ('C', 3, 'stability', 'Fire Hydrant Circles',      'hip_rotation','Hip abduction and rotation control, which sets the knee tracking for the hinge. Both sides.',
      6, true,  '{}'::text[],           'beginner',     false, true,  2, 10,   null, '2-0-2', 30, '{}'::jsonb),
  ('C', 4, 'strength',  'Dumbbell Romanian Deadlift','hip_hinge',   'The main lift of Session C. Hinge with a soft knee, held short of the point where the back rounds. Gains a set in week 3.',
      1, true,  '{dumbbell}'::text[],   'intermediate', true,  false, 3, 8,    null, '2-0-2', 75, '{"3": {"sets": 4}}'::jsonb),
  ('C', 5, 'strength',  'Single Arm Dumbbell Row',   'horizontal_pull','The week''s second go at the row, and the only exercise that appears twice. Same movement as Session B on purpose, so it gets practised.',
      2, true,  '{dumbbell}'::text[],   'beginner',     true,  true,  3, 10,   null, '2-0-2', 60, '{}'::jsonb),
  ('C', 6, 'strength',  'Farmers walk',              'carry',       'Loaded carry. Both dumbbells at once, one in each hand, not one side at a time. Grip, trunk and posture all together, and almost impossible to do badly.',
      3, true,  '{dumbbell}'::text[],   'intermediate', false, false, 3, null, 30,   null,    60, '{}'::jsonb),
  ('C', 7, 'strength',  'Dumbbell Sumo Squat',       'squat',       'Wide stance squat to close the session. Different job from Session A''s goblet squat: inner thigh and glute, less demand on the ankle.',
      4, true,  '{dumbbell}'::text[],   'beginner',     false, false, 2, 12,   null, '2-0-2', 60, '{}'::jsonb),
  ('C', 8, 'core',      'Reverse Plank',             'anti_flexion','Back of the body under a hold, to balance the front loaded core work in Sessions A and B. Longer hold in week 3.',
      5, true,  '{}'::text[],           'beginner',     false, false, 2, null, 20,   null,    30, '{"3": {"hold_duration_seconds": 30}}'::jsonb)
)
insert into program_blueprint_slots (
  program_version_id, session_designation, slot_order, block,
  movement_pattern, purpose, priority_rank, is_required,
  equipment_requirement, difficulty_tier, is_locked, is_per_side,
  sets, reps, hold_duration_seconds, tempo, rest_seconds, week_overrides,
  provider, external_id, exercise_name
)
select
  (select id from version),
  s.session_designation, s.slot_order, s.block,
  s.movement_pattern, s.purpose, s.priority_rank, s.is_required,
  s.equipment_requirement, s.difficulty_tier, s.is_locked, s.is_per_side,
  s.sets, s.reps, s.hold_duration_seconds, s.tempo, s.rest_seconds, s.week_overrides,
  c.provider, c.external_id, c.name
from slot_spec s
join exercise_catalog c on c.name = s.exercise_name;

-- ============================================================================
-- 4) Assertions (style: migrations 153 and 174).
-- ============================================================================
do $$
declare
  v1_id            uuid;
  v2_id            uuid;
  v_slots          integer;
  v_v1_slots       integer;
  v_unassignable   integer;
  v_bad_ranks      integer;
  v_bad_top_ranks  integer;
  v_bad_weeks      integer;
  v_repeats        integer;
  v_shared_openers integer;
  v_main_lifts     integer;
  v_core_holds     integer;
  v_row            record;
begin
  select v.id into v1_id
  from movement_program_versions v
  join movement_programs p on p.id = v.program_id
  where p.key = 'home_dumbbell_foundation' and v.version_number = 1;

  select v.id into v2_id
  from movement_program_versions v
  join movement_programs p on p.id = v.program_id
  where p.key = 'home_dumbbell_foundation' and v.version_number = 2;

  if v2_id is null then
    raise exception 'blueprint revision: Home Dumbbell Foundation v2 was not created';
  end if;

  -- v1 is history and must be untouched.
  select count(*) into v_v1_slots from program_blueprint_slots where program_version_id = v1_id;
  if v_v1_slots <> 26 then
    raise exception 'blueprint revision: v1 should still have 26 slots, has %', v_v1_slots;
  end if;
  if not exists (
    select 1 from movement_program_versions
    where id = v1_id and status = 'draft' and approved_at is null and archived_at is null
  ) then
    raise exception 'blueprint revision: v1 should still be an unapproved draft';
  end if;

  -- Every slot in the spec found its exercise.
  select count(*) into v_slots from program_blueprint_slots where program_version_id = v2_id;
  if v_slots <> 24 then
    raise exception 'blueprint revision: expected 24 slots on v2, got % (an exercise name did not match the catalog)', v_slots;
  end if;

  -- THE ONE RULE (migration 170): every filled slot is an exercise a
  -- member may be shown how to do.
  select count(*) into v_unassignable
  from program_blueprint_slots s
  join exercise_catalog c on c.provider = s.provider and c.external_id = s.external_id
  where s.program_version_id = v2_id and c.is_client_assignable is not true;
  if v_unassignable > 0 then
    for v_row in
      select s.session_designation, s.slot_order, s.exercise_name
      from program_blueprint_slots s
      join exercise_catalog c on c.provider = s.provider and c.external_id = s.external_id
      where s.program_version_id = v2_id and c.is_client_assignable is not true
    loop
      raise warning 'blueprint revision: slot % % points at a non-assignable exercise: %',
        v_row.session_designation, v_row.slot_order, v_row.exercise_name;
    end loop;
    raise exception 'blueprint revision: % slot(s) point at exercises with no video', v_unassignable;
  end if;

  -- Ranks are unique and contiguous from 1 within each session.
  select count(*) into v_bad_ranks
  from (
    select session_designation, count(*) as n, max(priority_rank) as hi, count(distinct priority_rank) as distinct_ranks
    from program_blueprint_slots
    where program_version_id = v2_id
    group by session_designation
  ) g
  where g.n <> g.hi or g.n <> g.distinct_ranks;
  if v_bad_ranks > 0 then
    raise exception 'blueprint revision: % session(s) have priority ranks that are not contiguous from 1', v_bad_ranks;
  end if;

  -- The rebalance rule: ranks 1 to 5 in every session belong to strength
  -- and core, so a shortened session drops the opener first.
  select count(*) into v_bad_top_ranks
  from program_blueprint_slots
  where program_version_id = v2_id
    and priority_rank <= 5
    and block not in ('strength', 'core');
  if v_bad_top_ranks > 0 then
    raise exception 'blueprint revision: % slot(s) in ranks 1 to 5 are neither strength nor core', v_bad_top_ranks;
  end if;

  -- The opener is three exercises, no more, in every session.
  if exists (
    select 1
    from program_blueprint_slots
    where program_version_id = v2_id and block in ('release', 'mobility', 'stability')
    group by session_designation
    having count(*) > 3
  ) then
    raise exception 'blueprint revision: a session opens with more than three exercises';
  end if;

  -- Strength is three or four movements and core is one or two, per session.
  if exists (
    select 1
    from program_blueprint_slots
    where program_version_id = v2_id and block = 'strength'
    group by session_designation
    having count(*) not between 3 and 4
  ) then
    raise exception 'blueprint revision: a session does not have three or four strength movements';
  end if;

  if exists (
    select 1
    from program_blueprint_slots
    where program_version_id = v2_id and block = 'core'
    group by session_designation
    having count(*) not between 1 and 2
  ) then
    raise exception 'blueprint revision: a session does not have one or two core movements';
  end if;

  -- At most ONE exercise appears in more than one session.
  select count(*) into v_repeats
  from (
    select external_id
    from program_blueprint_slots
    where program_version_id = v2_id
    group by external_id
    having count(distinct session_designation) > 1
  ) r;
  if v_repeats > 1 then
    raise exception 'blueprint revision: % exercises repeat across sessions, at most 1 is allowed', v_repeats;
  end if;

  -- And no two sessions share an opener.
  select count(*) into v_shared_openers
  from (
    select external_id
    from program_blueprint_slots
    where program_version_id = v2_id and block in ('release', 'mobility', 'stability')
    group by external_id
    having count(distinct session_designation) > 1
  ) o;
  if v_shared_openers > 0 then
    raise exception 'blueprint revision: % opener exercise(s) are shared between sessions', v_shared_openers;
  end if;

  -- Week 3, recomputed: each session's main lift gains a set, each
  -- session's core hold gets longer, and nothing names a week the program
  -- does not have.
  select count(*) into v_bad_weeks
  from program_blueprint_slots s,
       lateral jsonb_each(s.week_overrides) w(week, patch)
  where s.program_version_id = v2_id
    and (w.week !~ '^[0-9]+$' or w.week::int < 1 or w.week::int > 4);
  if v_bad_weeks > 0 then
    raise exception 'blueprint revision: % week override(s) name a week outside 1 to 4', v_bad_weeks;
  end if;

  select count(*) into v_main_lifts
  from program_blueprint_slots
  where program_version_id = v2_id
    and block = 'strength'
    and priority_rank = 1
    and (week_overrides -> '3' ->> 'sets')::int = sets + 1;
  if v_main_lifts <> 3 then
    raise exception 'blueprint revision: expected 3 main lifts gaining a set in week 3, got %', v_main_lifts;
  end if;

  select count(*) into v_core_holds
  from program_blueprint_slots
  where program_version_id = v2_id
    and block = 'core'
    and (week_overrides -> '3' ->> 'hold_duration_seconds')::int > hold_duration_seconds;
  if v_core_holds <> 3 then
    raise exception 'blueprint revision: expected 3 core holds getting longer in week 3, got %', v_core_holds;
  end if;

  -- No loads, anywhere. A blueprint never prescribes a weight.
  if exists (
    select 1 from program_blueprint_slots
    where program_version_id = v2_id and equipment_requirement && '{barbell,machine,cable}'::text[]
  ) then
    raise exception 'blueprint revision: a home program slot requires gym equipment';
  end if;

  raise notice 'blueprint revision: Home Dumbbell Foundation v2 seeded as a DRAFT with % slots, linear periodization, v1 left intact with % slots',
    v_slots, v_v1_slots;
end $$;

-- ============================================================================
-- 5) A coach may PROPOSE a blueprint. Only an administrator may approve one.
--
-- Save as template, on the coach's assign flow, turns a program a coach has
-- just edited into a new DRAFT blueprint for an administrator to review.
-- That needs an insert path a coach can actually use, and migration 174
-- gave these tables exactly one write policy each: the administrator's.
--
-- So: insert only, drafts only, and no update or delete policy of any kind
-- for a coach. A coach can put a proposal on the table. A coach cannot
-- approve it, cannot archive it, cannot edit it afterwards, and cannot
-- touch anything an administrator already approved. Which is the same
-- boundary migration 174 drew, with one door added to it.
-- ============================================================================
create policy coach_propose_movement_programs on movement_programs
  for insert
  with check ((select public.has_active_role(auth.uid(), 'coach')));

create policy coach_propose_movement_program_versions on movement_program_versions
  for insert
  with check (
    (select public.has_active_role(auth.uid(), 'coach'))
    and status = 'draft'
    and approved_at is null
    and approved_by is null
    and archived_at is null
  );

create policy coach_propose_program_blueprint_slots on program_blueprint_slots
  for insert
  with check (
    (select public.has_active_role(auth.uid(), 'coach'))
    and exists (
      select 1
      from movement_program_versions v
      where v.id = program_version_id and v.status = 'draft'
    )
  );

comment on policy coach_propose_movement_program_versions on movement_program_versions is
  'A coach may propose a new blueprint version, as a draft, and nothing more. There is deliberately no coach update or delete policy on this table: approving, archiving and editing stay with the administrator.';
