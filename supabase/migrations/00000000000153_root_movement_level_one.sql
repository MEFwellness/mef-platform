-- Root Movement, Level 1 — six ready-made sessions, available to every
-- member, with no assessment behind them and no coach approval in front
-- of them.
--
-- The sessions are DATA, not code. A template row plus its ordered slot
-- rows is the whole definition of a session; swapping an exercise, a
-- prescription or a rest interval is an UPDATE, never a deploy. That is
-- the point of this shape: the owner reviews the six lineups seeded here
-- and edits rows.
--
-- Every slot points at an exercise that already exists in the catalog
-- this product already has:
--
--   exercise_catalog          migration 119, the sole Your Move catalog
--   mef_exercise_metadata     migrations 80/127/128, the corrective-role,
--                             strain and spinal-flexion tagging
--
-- Nothing here duplicates that catalog. A slot carries the same
-- (provider, external_id) natural key every other exercise-referencing
-- table in this schema already uses, so a slot resolves to a real catalog
-- row with a real Your Move video, and the existing tap-to-play path
-- (lib/your-move/videoPlayback.ts) serves it unchanged.
--
-- NOT IN THIS MIGRATION, deliberately:
--   - The decision engine's 'movement' action type stays BLOCKED
--     (lib/coaching-direction/types.ts). These sessions exist, but Root
--     does not recommend them yet. That flip is a later, separate build
--     after the owner has reviewed the lineups.
--   - No streaks, no badges, no goals, no scoring. Nothing in this
--     migration counts consecutive days, because nothing here is allowed
--     to reward or scold.
--   - No relationship to movement_sessions / movement_session_exercises
--     (migration 58). Those are the auto-generated daily Movement
--     Intelligence session, a different concept with a different
--     lifecycle. These are fixed, global, member-chosen templates. The
--     names are deliberately distinct so neither is mistaken for the
--     other.
--
-- PRIVACY, the same rule as the engine builds: the member-owned table
-- below stores KEYS, IDS, TIMESTAMPS AND COUNTS ONLY. Not a note, not a
-- rating, not a pain location, not a reason for skipping. "She skipped
-- this exercise" is a behavioral fact. "Why" would be health content and
-- there is deliberately no column it could travel in.

-- ---------------------------------------------------------------------
-- 1) movement_session_templates — the six sessions, as rows.
-- ---------------------------------------------------------------------
-- session_key is the stable identity: it appears in URLs, in analytics
-- payloads and on every completion record, so it must never change once
-- a session has shipped. The name and description are member-facing and
-- may be edited freely.
--
-- Target duration is stored as a RANGE, not a single number, because
-- that is what the member is told ("10 to 12 min") and because it is the
-- thing a template-integrity test can actually check the seeded slots
-- against. A template whose slots add up outside its own stated range is
-- a broken template, and the test says so.
create table movement_session_templates (
  id uuid primary key default gen_random_uuid(),

  session_key text not null unique,
  name text not null,

  -- One honest sentence, in Root's voice. Never a promise, never hype.
  description text not null,

  target_duration_min_minutes integer not null check (target_duration_min_minutes > 0),
  target_duration_max_minutes integer not null check (target_duration_max_minutes > 0),

  -- The order the six appear in on the member's screen.
  sort_order integer not null,

  -- A retired session stops being offered without deleting the rows that
  -- reference it. Completion history stays readable forever.
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint movement_session_templates_duration_range_check
    check (target_duration_max_minutes >= target_duration_min_minutes)
);

create index movement_session_templates_active_order_idx
  on movement_session_templates (is_active, sort_order);

-- ---------------------------------------------------------------------
-- 2) movement_session_template_slots — the ordered exercises.
-- ---------------------------------------------------------------------
-- One row per exercise in a session, in the order the member walks them.
--
-- A prescription is EITHER a hold/duration OR a rep count, never both,
-- enforced below. Both shapes exist because the library genuinely
-- contains both kinds of movement: a hip flexor stretch is a hold, a
-- glute bridge is reps.
create table movement_session_template_slots (
  id uuid primary key default gen_random_uuid(),

  template_id uuid not null references movement_session_templates(id) on delete cascade,

  -- 1-based, contiguous, unique within a template. The assembly rules
  -- (mobility before stability, stability before strength, core work
  -- last) live in this ordering, which is why it is explicit data rather
  -- than an implicit insert order.
  slot_order integer not null check (slot_order > 0),

  -- The same natural key exercise_catalog itself uses. Not a foreign key,
  -- for the same reason migration 119 gives: every exercise-referencing
  -- table in this schema keys on (provider, external_id) rather than the
  -- catalog's surrogate id, so a catalog refresh never orphans anything.
  provider text not null default 'your_move' check (provider = 'your_move'),
  external_id text not null,

  prescription_type text not null check (prescription_type in ('time', 'reps')),
  prescription_seconds integer check (prescription_seconds > 0),
  prescription_reps integer check (prescription_reps > 0),

  rest_seconds integer not null default 0 check (rest_seconds >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (template_id, slot_order),

  constraint movement_session_template_slots_prescription_check check (
    (prescription_type = 'time' and prescription_seconds is not null and prescription_reps is null)
    or
    (prescription_type = 'reps' and prescription_reps is not null and prescription_seconds is null)
  )
);

create index movement_session_template_slots_template_idx
  on movement_session_template_slots (template_id, slot_order);

create index movement_session_template_slots_exercise_idx
  on movement_session_template_slots (provider, external_id);

-- ---------------------------------------------------------------------
-- 3) member_movement_session_runs — completion records.
-- ---------------------------------------------------------------------
-- ONE table, as the build called for: who, which session, when she
-- started, when (or whether) she finished, and which exercises she
-- skipped.
--
-- A row with completed_at still null is a session she left part way
-- through. That is a perfectly ordinary state and nothing in this product
-- treats it as a failure: there is no abandonment flag, no streak to
-- break, and no column recording that she stopped. She may start the same
-- session again the same day as many times as she likes; each start is
-- its own row, which is why there is no unique constraint on
-- (member_id, session_key, date).
--
-- skipped_exercise_ids holds EXERCISE IDS ONLY. Not names, not reasons,
-- not a note. Every id in it must be a Your Move external id, which is
-- what makes the "keys, ids, timestamps and counts only" rule mechanical
-- here rather than a matter of discipline at the call site.
create table member_movement_session_runs (
  id uuid primary key default gen_random_uuid(),

  member_id uuid not null references auth.users(id) on delete cascade,

  -- Not a foreign key to the template's surrogate id: history must
  -- survive a template being rewritten or retired, and the key is the
  -- stable identity. Referencing session_key keeps it readable while
  -- still being validated.
  session_key text not null references movement_session_templates(session_key) on update cascade,

  started_at timestamptz not null default now(),
  completed_at timestamptz,

  skipped_exercise_ids text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint member_movement_session_runs_completed_after_started_check
    check (completed_at is null or completed_at >= started_at)
);

create index member_movement_session_runs_member_started_idx
  on member_movement_session_runs (member_id, started_at desc);

create index member_movement_session_runs_session_key_idx
  on member_movement_session_runs (session_key);

-- ---------------------------------------------------------------------
-- 4) RLS.
-- ---------------------------------------------------------------------
-- Templates and slots are shared reference data: every signed-in member
-- reads the same six sessions, and only a platform administrator writes
-- them. That is what "global, editable by changing rows" means here.
alter table movement_session_templates enable row level security;
alter table movement_session_template_slots enable row level security;
alter table member_movement_session_runs enable row level security;

create policy authenticated_read_movement_session_templates on movement_session_templates
  for select using (auth.role() = 'authenticated');

create policy platform_admin_all_movement_session_templates on movement_session_templates
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy authenticated_read_movement_session_template_slots on movement_session_template_slots
  for select using (auth.role() = 'authenticated');

create policy platform_admin_all_movement_session_template_slots on movement_session_template_slots
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- The run table is member-owned, same shape as every other member-owned
-- table in this schema. A member reads, writes and updates only her own
-- rows. There is deliberately no member delete policy: a completion is
-- history, and this product does not delete history.
create policy member_read_own_movement_session_runs on member_movement_session_runs
  for select using (member_id = auth.uid());

create policy member_insert_own_movement_session_runs on member_movement_session_runs
  for insert with check (member_id = auth.uid());

create policy member_update_own_movement_session_runs on member_movement_session_runs
  for update using (member_id = auth.uid());

create policy coach_read_assigned_movement_session_runs on member_movement_session_runs
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_movement_session_runs on member_movement_session_runs
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 5) Four additive analytics event types.
-- ---------------------------------------------------------------------
-- Same rule migrations 63, 146, 147, 150, 151 and 152 all followed: a new
-- event source WIDENS this constraint, it never adds a second events
-- table and never a second pipeline.
--
-- All four are behavioral only:
--   movement_session_viewed     she opened a session's screen. Carries the
--                               session key and how many exercises are in
--                               it.
--   movement_session_started    she pressed begin.
--   movement_session_completed  she reached the end. Carries the session
--                               key and a COUNT of skips, never which.
--   movement_exercise_skipped   she skipped one exercise. Carries the
--                               session key and the EXERCISE ID, which is
--                               a catalog identifier and not a statement
--                               about her body.
--
-- There is deliberately no event and no payload field for WHY she skipped
-- something, or for leaving a session part way through. The first would
-- be health content. The second would be a fact this product has decided
-- not to make her answer for.
alter table member_wellness_events drop constraint member_wellness_events_event_type_check;

alter table member_wellness_events add constraint member_wellness_events_event_type_check
  check (event_type in (
    -- Wellness types (migration 63) — real health content, NOT analytics.
    'morning_readiness_recorded',
    'hydration_logged',
    'movement_logged',
    'concern_flagged',
    'evening_reflection_recorded',

    -- Product analytics types (migration 146), behavioral only.
    'signup_completed',
    'session_started',
    'onboarding_started',
    'onboarding_completed',
    'surface_viewed',
    'daily_reset_started',
    'daily_reset_completed',
    'food_scan_performed',
    'food_entry_logged',
    'feature_engaged',
    'paywall_viewed',
    'membership_tier_changed',
    'purchase_completed',

    -- Priority Card (migration 147), behavioral only.
    'priority_shown',
    'priority_action',
    're_entry_shown',

    -- Adaptive Coaching Direction Part 1 (migration 150), behavioral only.
    'coaching_action_delivered',
    'coaching_action_acted',
    'coaching_action_dismissed',

    -- The Weekly Root Review, Part 2 (migration 151), behavioral only.
    'weekly_review_delivered',
    'weekly_review_viewed',
    'weekly_review_completed',
    'weekly_review_question_answered',

    -- Adaptive Coaching Direction Part 3 (migration 152), behavioral only.
    'coaching_thread_escalated',
    'coaching_escalation_resolved',
    'coaching_grades_computed',

    -- Root Movement Level 1 (this migration), behavioral only.
    'movement_session_viewed',
    'movement_session_started',
    'movement_session_completed',
    'movement_exercise_skipped'
  ));

-- The one place "which types are analytics" is defined in the database.
-- Recreated with the four new types so the product_analytics_events view
-- (which calls this function in its WHERE clause) picks them up without
-- the view itself having to change.
create or replace function public.is_product_analytics_event_type(p_event_type text)
returns boolean
language sql
immutable
as $$
  select p_event_type in (
    'signup_completed',
    'session_started',
    'onboarding_started',
    'onboarding_completed',
    'surface_viewed',
    'daily_reset_started',
    'daily_reset_completed',
    'food_scan_performed',
    'food_entry_logged',
    'feature_engaged',
    'paywall_viewed',
    'membership_tier_changed',
    'purchase_completed',
    'priority_shown',
    'priority_action',
    're_entry_shown',
    'coaching_action_delivered',
    'coaching_action_acted',
    'coaching_action_dismissed',
    'weekly_review_delivered',
    'weekly_review_viewed',
    'weekly_review_completed',
    'weekly_review_question_answered',
    'coaching_thread_escalated',
    'coaching_escalation_resolved',
    'coaching_grades_computed',
    'movement_session_viewed',
    'movement_session_started',
    'movement_session_completed',
    'movement_exercise_skipped'
  );
$$;

-- ---------------------------------------------------------------------
-- 6) The six seeded sessions.
-- ---------------------------------------------------------------------
-- Assembled from the existing catalog under the owner's established
-- methodology, which is stated here rather than left implicit because
-- these rows are what he will review and edit:
--
--   1. Mobility before stability, stability before strength.
--   2. Core work last in a session, when a session has core work at all.
--   3. No crunches and no loaded spinal flexion. Every exercise below is
--      tagged spinal_flexion_core = false, and the sessions reach the
--      trunk through anti-extension and anti-rotation holds (dead bug,
--      bird dog, plank, side plank) instead.
--   4. Conservative and everyday-appropriate. These members have not been
--      assessed by anyone. Nothing here needs supervision: no release or
--      SMR tier work, no power tier, no external load, no advanced
--      progressions, and nothing above 'moderate' strain.
--   5. Every exercise has a working Your Move video.
--   6. A compact shared vocabulary. 39 distinct exercises across all six
--      sessions, so the video quota stays comfortable and a member sees
--      the same movements recur and get familiar rather than meeting a
--      new one every screen.
--
-- Bilateral movements are seeded as two slots (left, then right) because
-- that is how the catalog stores them and because a member walking a
-- session needs to be told to do the second side.

insert into movement_session_templates
  (session_key, name, description, target_duration_min_minutes, target_duration_max_minutes, sort_order)
values
  ('morning_mobility', 'Morning Mobility',
   'A slow head to toe loosening for the start of the day.', 10, 12, 1),
  ('desk_reset', 'Desk Reset',
   'A chair and wall reset for a body that has been sitting for hours.', 10, 12, 2),
  ('hip_back_reset', 'Hip and Back Reset',
   'For hips and a lower back that feel tight, opened first and then steadied.', 12, 15, 3),
  ('shoulder_neck_reset', 'Shoulder and Neck Reset',
   'For shoulders and a neck that have been holding the day.', 10, 12, 4),
  ('core_foundation', 'Core Foundation',
   'Deep core work with no crunches and nothing that rounds your spine under load.', 12, 15, 5),
  ('recovery_day', 'Recovery Day',
   'A slow, low effort session for a day when your body needs less, not more.', 15, 20, 6);

-- Slots are inserted from a values list keyed by session_key so the
-- lineups read top to bottom in the order a member walks them.
insert into movement_session_template_slots
  (template_id, slot_order, external_id, prescription_type, prescription_seconds, prescription_reps, rest_seconds)
select t.id, s.slot_order, s.external_id, s.prescription_type, s.prescription_seconds, s.prescription_reps, s.rest_seconds
from (values
  -- =================================================================
  -- Morning Mobility, 10 to 12 min.
  -- Mobility only, opened at the spine and worked outward, closing on
  -- one slow anti-extension core hold.
  -- =================================================================
  ('morning_mobility',  1, '675fab33-9f21-4386-8a43-a319d0684841', 'time', 75, null, 10),  -- Cat cow pose
  ('morning_mobility',  2, 'a61479a9-fc68-4b4b-9e4d-2f65cd41defa', 'time', 60, null, 10),  -- Child's pose
  ('morning_mobility',  3, 'c490cf34-6f30-421c-9dbb-d30b5f796efd', 'time', 60, null, 10),  -- Sphinx pose
  ('morning_mobility',  4, 'c8b7a380-562e-4ad2-8dfc-7a29b5c56418', 'time', 35, null,  5),  -- Knee to Chest Stretch (L)
  ('morning_mobility',  5, 'dd76f6bd-dddd-4f97-bf96-29048ec2547e', 'time', 35, null, 10),  -- Knee to Chest Stretch (R)
  ('morning_mobility',  6, 'abfd0396-b9b3-41b3-b8ec-88ce2faf0462', 'time', 75, null, 10),  -- Hip flexor stretch
  ('morning_mobility',  7, 'e3c47861-bcfa-41cf-a191-3524d8679a1c', 'time', 60, null, 10),  -- Downward dog
  ('morning_mobility',  8, '8b749c78-6f8d-46d7-ab75-bb42ed161ae1', 'time', 35, null,  5),  -- Standing Hamstring Stretch (L)
  ('morning_mobility',  9, '75593cee-6a28-4842-8222-150647b2157b', 'time', 35, null, 10),  -- Standing Hamstring Stretch (R)
  ('morning_mobility', 10, '5ba69aaa-7f7a-4564-940e-c6fb7da55c26', 'time', 60, null, 10),  -- Arm swings
  ('morning_mobility', 11, 'ea1016da-2d73-4ff8-ad2a-9b36150d2f85', 'time', 60, null,  0),  -- Dead Bug

  -- =================================================================
  -- Desk Reset, 10 to 12 min.
  -- Done in and beside a chair, nothing on the floor, so it is
  -- genuinely doable in the place the stiffness came from. Neck first,
  -- then the front of the chest and the hip flexors that a chair
  -- shortens, closing on the one strength hold.
  -- =================================================================
  ('desk_reset',  1, '8f35f8d8-b982-44af-8b71-4254b5be2532', 'time', 60, null, 10),  -- Head Turns Neck stretches
  ('desk_reset',  2, '50f6c403-a7eb-4c43-9723-c9c4ee7defc7', 'time', 40, null,  5),  -- Lateral neck stretch (left)
  ('desk_reset',  3, 'dfbfc890-af85-4be4-a8c6-782f666f538d', 'time', 40, null, 10),  -- Lateral neck stretch (right)
  ('desk_reset',  4, '52fb4e42-549e-4af2-a83d-f0c6c76f38ae', 'time', 60, null, 10),  -- Armpit Opener
  ('desk_reset',  5, '00c1f017-3a36-4a42-8866-fda39f906f5d', 'time', 60, null, 10),  -- Seated Side Bends
  ('desk_reset',  6, 'af0e7c20-cd4a-4c26-ac10-1ef6bdaaf35e', 'time', 60, null, 10),  -- chair Twists
  -- Psoas stretch before Sitting Pelvic tilts, not after: the pelvic
  -- tilt is tagged mobility AND strength, so it belongs on the loaded
  -- side of the session, and putting a pure stretch behind it would run
  -- the ordering rule backwards.
  ('desk_reset',  7, 'd0fe829c-d734-4429-bcc1-7ac15f2e92e4', 'time', 60, null, 10),  -- Psoas stretch
  ('desk_reset',  8, 'c1b55b30-7913-4590-87e1-6aac94b23df6', 'time', 50, null, 10),  -- Sitting Pelvic tilts
  ('desk_reset',  9, 'ddfa0774-6077-4c9c-a590-1547fa987640', 'reps', null,  12, 10),  -- Goal Post Squeeze
  ('desk_reset', 10, 'ba260d30-e576-4f0b-8d9b-c14df6d419ee', 'time', 60, null,  0),  -- Wall Sit

  -- =================================================================
  -- Hip and Back Reset, 12 to 15 min.
  -- The longest mobility block of the six, because tight hips do not
  -- open in thirty seconds, followed by the glute work that is usually
  -- the actual reason they tightened, closing on two core holds.
  -- =================================================================
  ('hip_back_reset',  1, '675fab33-9f21-4386-8a43-a319d0684841', 'time', 75, null, 10),  -- Cat cow pose
  ('hip_back_reset',  2, 'c8b7a380-562e-4ad2-8dfc-7a29b5c56418', 'time', 40, null,  5),  -- Knee to Chest Stretch (L)
  ('hip_back_reset',  3, 'dd76f6bd-dddd-4f97-bf96-29048ec2547e', 'time', 40, null, 10),  -- Knee to Chest Stretch (R)
  ('hip_back_reset',  4, '1f636f46-0bc3-417d-a3ac-93108ecc26ec', 'time', 60, null, 10),  -- Reclined windshield wipers
  ('hip_back_reset',  5, 'f3d25890-dcd5-42b3-8246-a5f596029cc0', 'time', 45, null,  5),  -- Figure Four Stretch (L)
  ('hip_back_reset',  6, '005ba868-d8b1-499f-9a88-b2cf722e6bdf', 'time', 45, null, 10),  -- Figure Four Stretch (R)
  ('hip_back_reset',  7, 'abfd0396-b9b3-41b3-b8ec-88ce2faf0462', 'time', 75, null, 10),  -- Hip flexor stretch
  ('hip_back_reset',  8, 'f96ea3ee-fb2f-4a0f-bc3b-7e63959450c5', 'time', 60, null, 10),  -- Butterfly Stretch
  ('hip_back_reset',  9, '8b749c78-6f8d-46d7-ab75-bb42ed161ae1', 'time', 40, null,  5),  -- Standing Hamstring Stretch (L)
  ('hip_back_reset', 10, '75593cee-6a28-4842-8222-150647b2157b', 'time', 40, null, 10),  -- Standing Hamstring Stretch (R)
  ('hip_back_reset', 11, 'a62f7e6f-99b3-49cf-a02e-c5146db97da3', 'reps', null,  12, 15),  -- Glute Bridge (Bodyweight)
  ('hip_back_reset', 12, 'd48bc33d-8daa-456a-9f07-32b42a3798e5', 'reps', null,  12, 15),  -- Clams side lying with knee lifts
  ('hip_back_reset', 13, 'b771f714-b1dc-49f8-8df5-9f8ae35bbbae', 'reps', null,  10, 15),  -- Bird Dog
  ('hip_back_reset', 14, 'ea1016da-2d73-4ff8-ad2a-9b36150d2f85', 'time', 60, null,  0),  -- Dead Bug

  -- =================================================================
  -- Shoulder and Neck Reset, 10 to 12 min.
  -- Neck first because it is the loudest, then the shoulder girdle
  -- opened before anything asks it to work, closing on the two upper
  -- back strength pieces and one core hold that puts the shoulder in a
  -- supporting role.
  -- =================================================================
  ('shoulder_neck_reset',  1, '8f35f8d8-b982-44af-8b71-4254b5be2532', 'time', 60, null, 10),  -- Head Turns Neck stretches
  ('shoulder_neck_reset',  2, '50f6c403-a7eb-4c43-9723-c9c4ee7defc7', 'time', 40, null,  5),  -- Lateral neck stretch (left)
  ('shoulder_neck_reset',  3, 'dfbfc890-af85-4be4-a8c6-782f666f538d', 'time', 40, null, 10),  -- Lateral neck stretch (right)
  ('shoulder_neck_reset',  4, '5ba69aaa-7f7a-4564-940e-c6fb7da55c26', 'time', 60, null, 10),  -- Arm swings
  ('shoulder_neck_reset',  5, '52fb4e42-549e-4af2-a83d-f0c6c76f38ae', 'time', 60, null, 10),  -- Armpit Opener
  ('shoulder_neck_reset',  6, 'ef8b7a4f-a209-425b-90dd-d20c402c5b0d', 'time', 45, null,  5),  -- Seated eagle arms (left)
  ('shoulder_neck_reset',  7, '1f96bb5c-a360-4ab0-83c6-23bdb92dd10c', 'time', 45, null, 10),  -- Seated eagle arm (right)
  ('shoulder_neck_reset',  8, '874ef2ee-909f-44db-bd03-25ffd1e24a0d', 'time', 60, null, 10),  -- Puppy pose
  ('shoulder_neck_reset',  9, 'ddfa0774-6077-4c9c-a590-1547fa987640', 'reps', null,  12, 15),  -- Goal Post Squeeze
  ('shoulder_neck_reset', 10, 'ceaa0c34-9db0-4642-ad6a-c0125ad88c32', 'reps', null,  10, 15),  -- Wall Push Ups
  ('shoulder_neck_reset', 11, 'b771f714-b1dc-49f8-8df5-9f8ae35bbbae', 'reps', null,  10,  0),  -- Bird Dog

  -- =================================================================
  -- Core Foundation, 12 to 15 min.
  -- The clearest statement of the methodology of the six: mobility,
  -- then a balance drill, then bodyweight strength, then every piece of
  -- core work at the end, and not one repetition of spinal flexion
  -- anywhere in it.
  -- =================================================================
  ('core_foundation',  1, '675fab33-9f21-4386-8a43-a319d0684841', 'time', 60, null, 10),  -- Cat cow pose
  ('core_foundation',  2, 'abfd0396-b9b3-41b3-b8ec-88ce2faf0462', 'time', 60, null, 10),  -- Hip flexor stretch
  ('core_foundation',  3, 'c490cf34-6f30-421c-9dbb-d30b5f796efd', 'time', 45, null, 10),  -- Sphinx pose
  ('core_foundation',  4, '649d45cb-6e06-4b5b-890a-9ea4043ed7d9', 'time', 60, null, 15),  -- Heel to toe walk
  ('core_foundation',  5, 'a62f7e6f-99b3-49cf-a02e-c5146db97da3', 'reps', null,  12, 15),  -- Glute Bridge (Bodyweight)
  ('core_foundation',  6, '42ee935a-8052-4d1b-bde6-d64bb2389e57', 'reps', null,  12, 15),  -- Bodyweight Squat
  ('core_foundation',  7, 'ba260d30-e576-4f0b-8d9b-c14df6d419ee', 'time', 45, null, 20),  -- Wall Sit
  ('core_foundation',  8, 'ea1016da-2d73-4ff8-ad2a-9b36150d2f85', 'time', 60, null, 20),  -- Dead Bug
  ('core_foundation',  9, 'b771f714-b1dc-49f8-8df5-9f8ae35bbbae', 'reps', null,  12, 20),  -- Bird Dog
  ('core_foundation', 10, '49739b94-19b6-4ec3-aa93-53e7c4824918', 'time', 30, null, 20),  -- Plank on elbows
  ('core_foundation', 11, 'd0b4d724-b764-434e-a595-98c0d1ff76fb', 'time', 25, null, 15),  -- Side plank pose (left)
  ('core_foundation', 12, '84497aca-5092-4038-bf3c-3e9beeae9f8b', 'time', 25, null,  0),  -- Side plank pose (right)

  -- =================================================================
  -- Recovery Day, 15 to 20 min.
  -- No strength and no core work at all, by design: this is the session
  -- for a day the body needs less. Long holds, everything low strain,
  -- ending flat on the floor doing nothing.
  -- =================================================================
  ('recovery_day',  1, '675fab33-9f21-4386-8a43-a319d0684841', 'time',  75, null, 10),  -- Cat cow pose
  ('recovery_day',  2, 'a61479a9-fc68-4b4b-9e4d-2f65cd41defa', 'time',  75, null, 10),  -- Child's pose
  ('recovery_day',  3, 'c490cf34-6f30-421c-9dbb-d30b5f796efd', 'time',  60, null, 10),  -- Sphinx pose
  ('recovery_day',  4, '874ef2ee-909f-44db-bd03-25ffd1e24a0d', 'time',  60, null, 10),  -- Puppy pose
  ('recovery_day',  5, 'c8b7a380-562e-4ad2-8dfc-7a29b5c56418', 'time',  45, null,  5),  -- Knee to Chest Stretch (L)
  ('recovery_day',  6, 'dd76f6bd-dddd-4f97-bf96-29048ec2547e', 'time',  45, null, 10),  -- Knee to Chest Stretch (R)
  ('recovery_day',  7, 'f3d25890-dcd5-42b3-8246-a5f596029cc0', 'time',  50, null,  5),  -- Figure Four Stretch (L)
  ('recovery_day',  8, '005ba868-d8b1-499f-9a88-b2cf722e6bdf', 'time',  50, null, 10),  -- Figure Four Stretch (R)
  ('recovery_day',  9, '1f636f46-0bc3-417d-a3ac-93108ecc26ec', 'time',  60, null, 10),  -- Reclined windshield wipers
  ('recovery_day', 10, 'f96ea3ee-fb2f-4a0f-bc3b-7e63959450c5', 'time',  75, null, 10),  -- Butterfly Stretch
  ('recovery_day', 11, 'aefc423a-3e4b-4ca0-89c8-62484e13f3c0', 'time',  60, null, 10),  -- Happy baby pose
  ('recovery_day', 12, '8b749c78-6f8d-46d7-ab75-bb42ed161ae1', 'time',  45, null,  5),  -- Standing Hamstring Stretch (L)
  ('recovery_day', 13, '75593cee-6a28-4842-8222-150647b2157b', 'time',  45, null, 10),  -- Standing Hamstring Stretch (R)
  ('recovery_day', 14, '50f6c403-a7eb-4c43-9723-c9c4ee7defc7', 'time',  40, null,  5),  -- Lateral neck stretch (left)
  ('recovery_day', 15, 'dfbfc890-af85-4be4-a8c6-782f666f538d', 'time',  40, null, 10),  -- Lateral neck stretch (right)
  ('recovery_day', 16, '658fa4e6-8b1d-48f4-b97d-7c576783ad73', 'time', 120, null,  0)   -- Corpse pose
) as s(session_key, slot_order, external_id, prescription_type, prescription_seconds, prescription_reps, rest_seconds)
join movement_session_templates t on t.session_key = s.session_key;

-- ---------------------------------------------------------------------
-- 7) Seed integrity, asserted at migration time.
-- ---------------------------------------------------------------------
-- The application-level test suite proves these properties too, but a
-- template whose slots point at exercises with no video, or at a crunch,
-- is a data defect that must never reach a member. Checking it here means
-- a bad edit fails the migration rather than shipping quietly.
--
-- These read exercise_catalog and mef_exercise_metadata, which are
-- populated by migrations 120 and 128 and therefore already present at
-- this point in the chain.
do $$
declare
  v_bad integer;
  v_distinct integer;
begin
  select count(*) into v_bad
  from movement_session_template_slots s
  left join exercise_catalog c
    on c.provider = s.provider and c.external_id = s.external_id
  where c.id is null or c.has_video = false;
  if v_bad > 0 then
    raise exception 'Root Movement seed: % slot(s) resolve to a missing exercise or one with no video', v_bad;
  end if;

  select count(*) into v_bad
  from movement_session_template_slots s
  join mef_exercise_metadata m
    on m.provider = s.provider and m.external_id = s.external_id
  where m.spinal_flexion_core
     or m.corrective_roles && array['release', 'power']::text[]
     or m.strain_level = 'high';
  if v_bad > 0 then
    raise exception 'Root Movement seed: % slot(s) use a spinal-flexion, release-tier, power-tier or high-strain exercise', v_bad;
  end if;

  select count(distinct s.external_id) into v_distinct
  from movement_session_template_slots s;
  if v_distinct >= 40 then
    raise exception 'Root Movement seed: % distinct exercises, the vocabulary is meant to stay under 40', v_distinct;
  end if;
end
$$;
