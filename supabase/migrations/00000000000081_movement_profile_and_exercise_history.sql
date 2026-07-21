-- Member Exercise Experience + Movement Profile foundation.
--
-- Prompt 1 (migration 80) built the permanent Exercise Library catalog
-- layer (mef_exercise_metadata, member_exercise_favorites). This migration
-- adds what turns that catalog into a daily member experience and the
-- permanent Movement Profile future Programs, Root recommendations,
-- Progress Tracking, and Coach tools will read from. It does NOT touch
-- movement_sessions / movement_session_exercises (migration 58) — that
-- system already has its own completion tracking for coach/decision-engine
-- -generated sessions and stays exactly as it works today. This migration
-- is scoped to the member-driven Exercise Library experience only.
--
--   member_exercise_completions   Append-only history: one row per time a
--                                  member completes, partially completes,
--                                  or skips an exercise from the Exercise
--                                  Library, plus their optional notes and
--                                  difficulty/comfort/enjoyment feedback for
--                                  that occurrence. Combined into one row
--                                  rather than a separate feedback table —
--                                  notes and feedback are properties of a
--                                  single real-world event ("I did this
--                                  exercise just now and here's how it
--                                  went"), so splitting them would just be
--                                  two tables joined 1:1 on every read, not
--                                  a real normalization win. No update or
--                                  delete policy for anyone but
--                                  platform_administrator — history is never
--                                  overwritten, same posture as
--                                  health_timeline_events and
--                                  body_assessments.
--
--   member_exercise_recent_views  One row per (member, exercise), upserted
--                                  on every view — a recency pointer, not
--                                  history, same shape/purpose as
--                                  member_exercise_favorites (migration 80)
--                                  but mutable since "recently viewed" is
--                                  explicitly a rolling window, not a
--                                  permanent ledger.
--
--   member_movement_profiles      One row per member — the permanent
--                                  Movement Profile. Deliberately does NOT
--                                  duplicate-store "completed exercises",
--                                  "recent tolerance", "recent difficulty",
--                                  or "exercise frequency" as columns, even
--                                  though the spec lists them under
--                                  "Automatic Updates" — that data already
--                                  lives, immutably, in
--                                  member_exercise_completions; a future
--                                  read composes it from there (same
--                                  "compute at read time, don't duplicate"
--                                  discipline as member_health_profiles'
--                                  own header comment). The columns this
--                                  table actually stores are the ones with
--                                  no other home: declared goals/equipment/
--                                  priorities (member-controlled) and
--                                  coach-authored clinical fields
--                                  (coach-controlled). capability_summary is
--                                  structure only — nothing computes or
--                                  writes to it automatically, per the
--                                  prompt's explicit "do not automatically
--                                  score capability yet."
--
--                                  Write-level enforcement follows the
--                                  identical trust-boundary pattern as
--                                  upsert_member_health_profile (migration
--                                  41): no general UPDATE policy at all for
--                                  member or coach (RLS can't distinguish
--                                  "member's own row" from "coach's own
--                                  clinical columns" at column granularity
--                                  since both share the `authenticated` DB
--                                  role) — instead two narrow
--                                  security-definer RPCs, one per trust
--                                  level, each touching only its own column
--                                  set.
--
--   movement_profile_review_items Coach worklist for the "Pending Coach
--                                  Review" write level — new pain reports,
--                                  increased discomfort, repeated inability,
--                                  possible progression/regression,
--                                  capability changes, new limitations, and
--                                  restriction conflicts never write
--                                  member_movement_profiles directly; they
--                                  land here for a coach to review and
--                                  action (through the coach-fields RPC
--                                  above once approved). Coach-only, same
--                                  "members never see this" posture as
--                                  body_assessment_notes (migration 38).
--                                  Detection logic lives in application code
--                                  (lib/movement-profile/reviewDetection.ts)
--                                  reading the member's own just-written
--                                  completion/feedback history — same
--                                  "app-layer rule engine over real rows"
--                                  convention as lib/movement/rules/ and
--                                  lib/ai/rules/, not a database trigger.
--
-- RLS follows the exact established pattern (migration 15 helpers,
-- migrations 27-41/58/80 precedent): member_read_own / member_insert_own,
-- coach_read_assigned / coach_update_assigned via is_active_coach_for,
-- platform_admin_all.

-- ============================================================================
-- health_timeline_events.event_type — widen additively for the Movement
-- Timeline, same convention migration 58 already used on this exact table.
-- ============================================================================
alter table health_timeline_events drop constraint health_timeline_events_event_type_check;
alter table health_timeline_events add constraint health_timeline_events_event_type_check
  check (event_type in (
    'onboarding_completed', 'reassessment_completed', 'checkin_submitted',
    'assessment_published', 'wearable_synced',
    'streak_milestone', 'trend_improving', 'trend_declining', 'wearable_connected',
    'movement_session_completed', 'evening_reflection_submitted',
    'exercise_completed', 'exercise_favorited', 'exercise_unfavorited',
    'exercise_skipped', 'movement_coach_review', 'movement_capability_milestone',
    'movement_program_completed'
  ));

-- ============================================================================
-- member_exercise_completions
-- ============================================================================
create table member_exercise_completions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  provider text not null default 'exercise_api_dev',
  external_id text not null,
  exercise_name text not null,

  status text not null check (status in ('completed', 'partial', 'skipped')),
  duration_seconds int,
  completion_source text not null default 'exercise_library' check (completion_source in (
    'exercise_library', 'movement_session', 'coach_assigned'
  )),

  -- Observations only, never a diagnosis — see this migration's header and
  -- the prompt's own "Never diagnose" instruction. Free text, same as
  -- movement_session_exercises.member_notes.
  member_notes text,

  difficulty_rating text check (difficulty_rating in (
    'very_easy', 'easy', 'appropriate', 'difficult', 'very_difficult'
  )),
  comfort_rating text check (comfort_rating in (
    'comfortable', 'slight_discomfort', 'moderate_discomfort', 'pain'
  )),
  enjoyment_rating text check (enjoyment_rating in ('liked', 'neutral', 'did_not_enjoy')),

  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index member_exercise_completions_member_idx
  on member_exercise_completions (member_id, occurred_at desc);
create index member_exercise_completions_exercise_idx
  on member_exercise_completions (member_id, provider, external_id, occurred_at desc);

alter table member_exercise_completions enable row level security;

create policy member_read_own_exercise_completions on member_exercise_completions
  for select using (member_id = auth.uid());
create policy coach_read_assigned_exercise_completions on member_exercise_completions
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );
create policy member_insert_own_exercise_completions on member_exercise_completions
  for insert with check (member_id = auth.uid());
create policy platform_admin_all_exercise_completions on member_exercise_completions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================================
-- member_exercise_recent_views
-- ============================================================================
create table member_exercise_recent_views (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  provider text not null default 'exercise_api_dev',
  external_id text not null,
  exercise_name text not null,

  viewed_at timestamptz not null default now(),

  unique (member_id, provider, external_id)
);

create index member_exercise_recent_views_member_idx
  on member_exercise_recent_views (member_id, viewed_at desc);

alter table member_exercise_recent_views enable row level security;

create policy member_read_own_exercise_recent_views on member_exercise_recent_views
  for select using (member_id = auth.uid());
create policy member_insert_own_exercise_recent_views on member_exercise_recent_views
  for insert with check (member_id = auth.uid());
create policy member_update_own_exercise_recent_views on member_exercise_recent_views
  for update using (member_id = auth.uid()) with check (member_id = auth.uid());
create policy platform_admin_all_exercise_recent_views on member_exercise_recent_views
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================================
-- member_movement_profiles
-- ============================================================================
create table member_movement_profiles (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references auth.users(id) on delete cascade,

  -- Member-controlled ("Automatic Updates") — written only through
  -- upsert_movement_profile_member_fields below.
  goals text[] not null default '{}',
  equipment_access text[] not null default '{}',
  favorite_movement_types text[] not null default '{}',
  mobility_priorities text[] not null default '{}',
  stability_priorities text[] not null default '{}',
  strength_priorities text[] not null default '{}',
  -- {type, id, note?} pointers, same evidence_refs convention used
  -- throughout this schema (health_timeline_events.evidence_refs etc.).
  assessment_references jsonb not null default '[]'::jsonb,
  program_history_references jsonb not null default '[]'::jsonb,

  -- Coach-controlled — written only through
  -- upsert_movement_profile_coach_fields below. Never touched by a member
  -- write or an automatic process.
  movement_limitations text[] not null default '{}',
  exercise_restrictions text[] not null default '{}',
  contraindications text[] not null default '{}',
  medical_restrictions text[] not null default '{}',
  corrective_priorities text[] not null default '{}',
  -- Structure only — no engine computes or writes this yet, per the
  -- prompt's explicit "do not automatically score capability."
  capability_summary jsonb,
  exercise_clearance text,
  assessment_interpretation text,
  coach_observations text,

  member_fields_updated_at timestamptz,
  coach_fields_updated_at timestamptz,
  coach_fields_updated_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index member_movement_profiles_member_idx on member_movement_profiles (member_id);

alter table member_movement_profiles enable row level security;

create policy member_read_own_movement_profile on member_movement_profiles
  for select using (member_id = auth.uid());
create policy coach_read_assigned_movement_profile on member_movement_profiles
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );
create policy platform_admin_all_movement_profile on member_movement_profiles
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- No insert/update policy — every write goes through exactly one of the
-- two RPCs below, same "no general write surface" boundary as
-- upsert_member_health_profile (migration 41).

create or replace function upsert_movement_profile_member_fields(
  p_member uuid,
  p_goals text[],
  p_equipment_access text[],
  p_favorite_movement_types text[],
  p_mobility_priorities text[],
  p_stability_priorities text[],
  p_strength_priorities text[],
  p_assessment_references jsonb,
  p_program_history_references jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    p_member = auth.uid()
    or public.has_active_role(auth.uid(), 'platform_administrator')
  ) then
    raise exception 'not authorized to write member-controlled movement profile fields for this member';
  end if;

  insert into member_movement_profiles (
    member_id, goals, equipment_access, favorite_movement_types,
    mobility_priorities, stability_priorities, strength_priorities,
    assessment_references, program_history_references,
    member_fields_updated_at, updated_at
  ) values (
    p_member, p_goals, p_equipment_access, p_favorite_movement_types,
    p_mobility_priorities, p_stability_priorities, p_strength_priorities,
    p_assessment_references, p_program_history_references,
    now(), now()
  )
  on conflict (member_id) do update set
    goals = excluded.goals,
    equipment_access = excluded.equipment_access,
    favorite_movement_types = excluded.favorite_movement_types,
    mobility_priorities = excluded.mobility_priorities,
    stability_priorities = excluded.stability_priorities,
    strength_priorities = excluded.strength_priorities,
    assessment_references = excluded.assessment_references,
    program_history_references = excluded.program_history_references,
    member_fields_updated_at = now(),
    updated_at = now();
end;
$$;

revoke all on function upsert_movement_profile_member_fields(
  uuid, text[], text[], text[], text[], text[], text[], jsonb, jsonb
) from public;
grant execute on function upsert_movement_profile_member_fields(
  uuid, text[], text[], text[], text[], text[], text[], jsonb, jsonb
) to authenticated, service_role;

create or replace function upsert_movement_profile_coach_fields(
  p_member uuid,
  p_movement_limitations text[],
  p_exercise_restrictions text[],
  p_contraindications text[],
  p_medical_restrictions text[],
  p_corrective_priorities text[],
  p_capability_summary jsonb,
  p_exercise_clearance text,
  p_assessment_interpretation text,
  p_coach_observations text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    (public.has_active_role(auth.uid(), 'coach') and public.is_active_coach_for(auth.uid(), p_member))
    or public.has_active_role(auth.uid(), 'platform_administrator')
  ) then
    raise exception 'not authorized to write coach-controlled movement profile fields for this member';
  end if;

  insert into member_movement_profiles (
    member_id, movement_limitations, exercise_restrictions, contraindications,
    medical_restrictions, corrective_priorities, capability_summary,
    exercise_clearance, assessment_interpretation, coach_observations,
    coach_fields_updated_at, coach_fields_updated_by, updated_at
  ) values (
    p_member, p_movement_limitations, p_exercise_restrictions, p_contraindications,
    p_medical_restrictions, p_corrective_priorities, p_capability_summary,
    p_exercise_clearance, p_assessment_interpretation, p_coach_observations,
    now(), auth.uid(), now()
  )
  on conflict (member_id) do update set
    movement_limitations = excluded.movement_limitations,
    exercise_restrictions = excluded.exercise_restrictions,
    contraindications = excluded.contraindications,
    medical_restrictions = excluded.medical_restrictions,
    corrective_priorities = excluded.corrective_priorities,
    capability_summary = excluded.capability_summary,
    exercise_clearance = excluded.exercise_clearance,
    assessment_interpretation = excluded.assessment_interpretation,
    coach_observations = excluded.coach_observations,
    coach_fields_updated_at = now(),
    coach_fields_updated_by = auth.uid(),
    updated_at = now();
end;
$$;

revoke all on function upsert_movement_profile_coach_fields(
  uuid, text[], text[], text[], text[], text[], jsonb, text, text, text
) from public;
grant execute on function upsert_movement_profile_coach_fields(
  uuid, text[], text[], text[], text[], text[], jsonb, text, text, text
) to authenticated, service_role;

-- ============================================================================
-- movement_profile_review_items
-- ============================================================================
create table movement_profile_review_items (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  review_type text not null check (review_type in (
    'new_pain_report', 'increased_discomfort', 'repeated_inability',
    'possible_progression', 'possible_regression', 'capability_change',
    'new_movement_limitation', 'restriction_conflict'
  )),

  summary text not null,
  detail text,
  source_feature text not null default 'exercise_library',
  source_record_id uuid,
  evidence_refs jsonb not null default '[]'::jsonb,
  -- Optional structured suggestion for what the coach-controlled profile
  -- fields might change to — a proposal only, never applied automatically.
  proposed_changes jsonb,

  status text not null default 'pending' check (status in (
    'pending', 'acknowledged', 'actioned', 'dismissed'
  )),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolution_notes text,

  created_at timestamptz not null default now()
);

create index movement_profile_review_items_member_idx
  on movement_profile_review_items (member_id, status);

alter table movement_profile_review_items enable row level security;

-- Coach-only, same "members never see this" posture as
-- body_assessment_notes (migration 38) — this is a coaching worklist, not
-- member-facing content.
create policy coach_read_assigned_movement_profile_review_items on movement_profile_review_items
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );
-- The member's own session is what actually runs the review-detection
-- logic (a server action triggered right after their own exercise
-- completion/feedback write) — see
-- lib/movement-profile/reviewDetection.ts. It inserts under member_id =
-- auth.uid(), same trust boundary as member_insert_own_timeline_events.
create policy member_insert_own_movement_profile_review_items on movement_profile_review_items
  for insert with check (member_id = auth.uid());
create policy coach_update_assigned_movement_profile_review_items on movement_profile_review_items
  for update using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );
create policy platform_admin_all_movement_profile_review_items on movement_profile_review_items
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
