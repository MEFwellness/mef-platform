-- MEF Wellness Intelligence Core (Milestone 9).
--
-- Everything the platform already computes (Personal Wellness Intelligence
-- Engine, Coaching Brain, Member Health Narrative, Coaching Safety, Daily
-- Coaching Feed, and the MEF Intelligence Engine's longitudinal
-- trends/patterns/hypotheses) answers "what is true about this member
-- right now, and why." Nothing before this migration persists a durable,
-- confidence-weighted model of the PERSON — how they respond to coaching,
-- what they abandon and when, what tone works. This migration adds four
-- tables for exactly that, and nothing else:
--
--   wellness_identity_observations   a "wellness identity" — durable,
--                                     confidence-weighted claims about how
--                                     this member responds to coaching
--                                     ("stays engaged when daily goals
--                                     take under 15 minutes"), never a
--                                     symptom/metric claim (that's still
--                                     wellness_insights' job). Same
--                                     supersede-not-mutate audit model as
--                                     wellness_insights (migration 31):
--                                     recalculation supersedes an old row
--                                     rather than overwriting it, and each
--                                     row's own trend_direction records
--                                     whether the underlying pattern is
--                                     strengthening, weakening, or stable
--                                     across recalculations.
--
--   wellness_profile_dimensions      one row per member per named
--                                     coaching-model dimension (Recovery
--                                     Capacity, Motivation Profile, etc.) —
--                                     a qualitative level + score existing
--                                     purely to help a coach compare
--                                     dimensions to each other, recomputed
--                                     in place (unique per member+
--                                     dimension) since a dimension score is
--                                     a current snapshot, not an
--                                     individually-tracked claim the way an
--                                     identity observation is.
--
--   wellness_coaching_style_profile  the member's learned coaching-style
--                                     preference (tone/detail/task-load) —
--                                     one row per member, same "current
--                                     snapshot" posture as profile
--                                     dimensions.
--
--   wellness_recommendation_feedback operational suppression state so the
--                                     engine's recommendations (already
--                                     computed by lib/intelligence-engine/
--                                     recommendations.ts) never repeat a
--                                     recommendation that has already
--                                     failed to land, unless the evidence
--                                     behind it has genuinely changed.
--
-- None of these tables are diagnoses, and none replace or recompute what
-- Milestones 1-8 already own — every derivation reads their already-
-- computed output (see apps/consumer-web-app/lib/intelligence-core/).
--
-- RLS follows the same established pattern as every table since migration
-- 15. wellness_identity_observations is member-visible (like
-- wellness_insights) because a member's own wellness identity is exactly
-- the kind of "here is what we've noticed about you" transparency that
-- table already grants. The other three are coach-internal working models
-- — same "no member SELECT policy ever" trust boundary as
-- intelligence_coach_alerts (migration 34): a member's technical
-- score/level is never queryable directly, only the plain-language,
-- positive-framed subset the app layer chooses to surface (see
-- lib/intelligence-core/memberView.ts).

-- ============================================================
-- wellness_identity_observations
-- ============================================================
create table wellness_identity_observations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  domain text not null check (domain in (
    'motivation_style', 'coaching_preference', 'habit_adherence',
    'task_load_tolerance', 'time_commitment', 'movement_response',
    'pain_correlation', 'sleep_correlation', 'stress_correlation',
    'emotional_language', 'confidence_calibration', 'engagement_rhythm'
  )),

  -- Stable per-member dedup key (e.g. 'habit_adherence_abandon_window',
  -- 'coaching_preference_encouragement') — same role pattern_key plays for
  -- wellness_insights; recalculation finds and supersedes the same claim
  -- rather than duplicating it.
  observation_key text not null,

  -- Correlation-worded, never causal — same voice as
  -- lib/intelligence/copy.ts and lib/intelligence-engine's PatternInsight.
  statement text not null,
  coach_detail text not null,

  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  evidence_count int not null default 1 check (evidence_count >= 1),

  trend_direction text not null default 'stable' check (trend_direction in (
    'strengthening', 'weakening', 'stable'
  )),
  status text not null default 'active' check (status in (
    'active', 'resolved', 'superseded'
  )),

  -- Array of { type, id | range, note? } — same evidence-pointer shape as
  -- wellness_insights.evidence_refs / narrative_items.source_refs.
  evidence_refs jsonb not null default '[]'::jsonb,

  -- False when the source evidence is coach-only (e.g. derived from a
  -- coach-only narrative item or coach notes) — default true because most
  -- wellness-identity language is exactly what "Your Wellness Identity"
  -- (member-facing) is meant to show.
  member_visible boolean not null default true,
  coach_context text,
  coach_reviewed_by uuid references auth.users(id) on delete set null,
  coach_reviewed_at timestamptz,

  supersedes_id uuid references wellness_identity_observations(id) on delete set null,
  superseded_by_id uuid references wellness_identity_observations(id) on delete set null,

  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index wellness_identity_observations_member_active_idx
  on wellness_identity_observations (member_id) where status = 'active';
create index wellness_identity_observations_member_domain_idx
  on wellness_identity_observations (member_id, domain);
create index wellness_identity_observations_key_idx
  on wellness_identity_observations (member_id, observation_key);
create index wellness_identity_observations_supersedes_idx
  on wellness_identity_observations (supersedes_id);

alter table wellness_identity_observations enable row level security;

create policy member_read_own_identity_observations on wellness_identity_observations
  for select
  using (member_id = auth.uid() and member_visible and status = 'active');

create policy coach_read_assigned_identity_observations on wellness_identity_observations
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_insert_own_identity_observations on wellness_identity_observations
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_identity_observations on wellness_identity_observations
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- Mechanical supersede/resolve transition only (same "member can flip
-- status but not author coach_context" trust boundary as
-- wellness_insights' own member_update_own_insights policy) — enforced in
-- application code, not by column-level grants.
create policy member_update_own_identity_observations on wellness_identity_observations
  for update
  using (member_id = auth.uid());

create policy coach_update_assigned_identity_observations on wellness_identity_observations
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_identity_observations on wellness_identity_observations
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- Security-definer dedup lookup, same fix migration 32 already applied to
-- wellness_insights: a member's own recalculation session must be able to
-- see its OWN prior row regardless of member_visible, or a coach-only
-- observation would look inactive and get duplicated every run.
create or replace function find_active_wellness_identity_observation(
  p_member uuid,
  p_observation_key text
)
returns setof wellness_identity_observations
language sql
security definer
set search_path = public
as $$
  select *
  from wellness_identity_observations
  where member_id = p_member
    and observation_key = p_observation_key
    and status = 'active'
  order by created_at desc
  limit 1;
$$;

-- ============================================================
-- wellness_profile_dimensions
-- ============================================================
create table wellness_profile_dimensions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  dimension text not null check (dimension in (
    'recovery_capacity', 'movement_confidence', 'stress_resilience',
    'lifestyle_consistency', 'motivation_profile', 'coaching_style_preference',
    'habit_reliability', 'risk_awareness', 'sleep_stability', 'energy_stability',
    'behavior_change_momentum', 'pain_stability', 'nutrition_consistency',
    'hydration_consistency', 'emotional_stability'
  )),

  -- Qualitative, coach-facing only — never rendered to the member as a
  -- score (see the milestone's "members never see technical scoring").
  level text not null check (level in (
    'very_low', 'low', 'moderate', 'high', 'very_high', 'insufficient_data'
  )),
  score numeric check (score is null or (score >= 0 and score <= 100)),
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  trend_direction text not null default 'insufficient_data' check (trend_direction in (
    'improving', 'declining', 'stable', 'insufficient_data'
  )),
  evidence_count int not null default 0,

  -- Plain-language "why" — the coach dashboard's required per-insight
  -- explanation (section "COACH DASHBOARD").
  rationale text not null,
  contributing_evidence jsonb not null default '[]'::jsonb,

  last_computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (member_id, dimension)
);

create index wellness_profile_dimensions_member_idx on wellness_profile_dimensions (member_id);

alter table wellness_profile_dimensions enable row level security;

create policy coach_read_assigned_profile_dimensions on wellness_profile_dimensions
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_insert_own_profile_dimensions on wellness_profile_dimensions
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_profile_dimensions on wellness_profile_dimensions
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_update_own_profile_dimensions on wellness_profile_dimensions
  for update
  using (member_id = auth.uid());

create policy coach_update_assigned_profile_dimensions on wellness_profile_dimensions
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_profile_dimensions on wellness_profile_dimensions
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================
-- wellness_coaching_style_profile
-- ============================================================
create table wellness_coaching_style_profile (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references auth.users(id) on delete cascade,

  tone_preference text not null default 'unclear' check (tone_preference in (
    'encouragement', 'direct', 'education_first', 'unclear'
  )),
  detail_preference text not null default 'unclear' check (detail_preference in (
    'brief', 'detailed', 'unclear'
  )),
  task_load_preference text not null default 'unclear' check (task_load_preference in (
    'single_focus', 'multi_task_ok', 'unclear'
  )),
  time_commitment_sweet_spot_minutes int,

  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  evidence_count int not null default 0,
  rationale text not null default
    'Not enough interaction history yet to infer a coaching style preference.',

  last_computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table wellness_coaching_style_profile enable row level security;

create policy coach_read_assigned_coaching_style on wellness_coaching_style_profile
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_insert_own_coaching_style on wellness_coaching_style_profile
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_coaching_style on wellness_coaching_style_profile
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_update_own_coaching_style on wellness_coaching_style_profile
  for update
  using (member_id = auth.uid());

create policy coach_update_assigned_coaching_style on wellness_coaching_style_profile
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_coaching_style on wellness_coaching_style_profile
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================
-- wellness_recommendation_feedback
-- ============================================================
create table wellness_recommendation_feedback (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- Stable key for one logical recommendation (e.g.
  -- 'movement_priority_area', 'coach_follow_up') — matches
  -- lib/intelligence-core/recommendationGuard.ts's derivation from a
  -- Recommendation's domain + title.
  recommendation_key text not null,
  domain text not null,

  consecutive_non_actions int not null default 0,
  last_outcome text not null default 'surfaced' check (last_outcome in (
    'surfaced', 'completed', 'dismissed', 'ignored'
  )),
  -- A short hash/summary of the evidence that justified the most recent
  -- surfacing — when a future recalculation would surface the same
  -- recommendation_key on genuinely different evidence, this signature
  -- differs and the suppression resets, per the milestone's "never repeat
  -- recommendations that repeatedly fail unless there is new evidence."
  last_evidence_signature text not null,

  suppressed boolean not null default false,
  suppressed_reason text,

  last_surfaced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (member_id, recommendation_key)
);

create index wellness_recommendation_feedback_member_idx
  on wellness_recommendation_feedback (member_id);

alter table wellness_recommendation_feedback enable row level security;

create policy coach_read_assigned_recommendation_feedback on wellness_recommendation_feedback
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_insert_own_recommendation_feedback on wellness_recommendation_feedback
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_recommendation_feedback on wellness_recommendation_feedback
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_update_own_recommendation_feedback on wellness_recommendation_feedback
  for update
  using (member_id = auth.uid());

create policy coach_update_assigned_recommendation_feedback on wellness_recommendation_feedback
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_recommendation_feedback on wellness_recommendation_feedback
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- Security-definer internal read, same "no general member SELECT policy,
-- but recalculation's own session still needs to see its own prior
-- bookkeeping" need migration 32 first solved for wellness_insights'
-- dedup lookup. Unlike that RPC this one returns every row for the
-- member (not a single dedup match) — lib/intelligence-core/
-- recommendationGuard.ts needs the member's own full suppression state on
-- every recalculation, most of which run under the member's own session
-- (a check-in, a conversation turn), not just a coach's. A member never
-- gets a general SELECT policy on this table (still coach-internal
-- bookkeeping, never a member-facing surface), but their own session can
-- read it back through this narrow, scoped function.
create or replace function list_own_wellness_recommendation_feedback(p_member uuid)
returns setof wellness_recommendation_feedback
language sql
security definer
set search_path = public
as $$
  select *
  from wellness_recommendation_feedback
  where member_id = p_member
    and (
      p_member = auth.uid()
      or (public.has_active_role(auth.uid(), 'coach') and public.is_active_coach_for(auth.uid(), p_member))
      or public.has_active_role(auth.uid(), 'platform_administrator')
    );
$$;

-- ============================================================
-- Atomic upserts for wellness_profile_dimensions /
-- wellness_coaching_style_profile / wellness_recommendation_feedback.
--
-- These three tables are recomputed on nearly every recalculation (a
-- check-in, a conversation turn), often several times back to back for
-- the same member — a real INSERT ... ON CONFLICT DO UPDATE needs to,
-- but PostgREST's two-statement REST surface can't cleanly express
-- "insert, or update if it already exists" without either (a) a real
-- upsert, which 42501s here because there's no member SELECT policy for
-- PostgREST's return=representation to satisfy, or (b) two separate
-- round-trip statements (insert-then-probe, or insert-first-then-update-
-- on-conflict), which reintroduces the exact race a single atomic
-- statement exists to avoid: between the first statement's commit and
-- the second statement's execution, a concurrent recalculation for the
-- same member (a real scenario — a check-in and a conversation turn can
-- both trigger recalculation close together) can interleave and leave
-- the row's own update silently matching zero rows. A single SQL
-- statement inside one security-definer function is genuinely atomic —
-- no gap for another session's write to land in between — and the
-- explicit authorization check inline replaces what RLS would otherwise
-- enforce.
create or replace function upsert_wellness_profile_dimension(
  p_member uuid,
  p_dimension text,
  p_level text,
  p_score numeric,
  p_confidence numeric,
  p_trend_direction text,
  p_evidence_count int,
  p_rationale text,
  p_contributing_evidence jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    p_member = auth.uid()
    or (public.has_active_role(auth.uid(), 'coach') and public.is_active_coach_for(auth.uid(), p_member))
    or public.has_active_role(auth.uid(), 'platform_administrator')
  ) then
    raise exception 'not authorized to write wellness_profile_dimensions for this member';
  end if;

  insert into wellness_profile_dimensions (
    member_id, dimension, level, score, confidence, trend_direction,
    evidence_count, rationale, contributing_evidence, last_computed_at, updated_at
  ) values (
    p_member, p_dimension, p_level, p_score, p_confidence, p_trend_direction,
    p_evidence_count, p_rationale, p_contributing_evidence, now(), now()
  )
  on conflict (member_id, dimension) do update set
    level = excluded.level,
    score = excluded.score,
    confidence = excluded.confidence,
    trend_direction = excluded.trend_direction,
    evidence_count = excluded.evidence_count,
    rationale = excluded.rationale,
    contributing_evidence = excluded.contributing_evidence,
    last_computed_at = excluded.last_computed_at,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function upsert_wellness_coaching_style_profile(
  p_member uuid,
  p_tone_preference text,
  p_detail_preference text,
  p_task_load_preference text,
  p_time_commitment_sweet_spot_minutes int,
  p_confidence numeric,
  p_evidence_count int,
  p_rationale text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    p_member = auth.uid()
    or (public.has_active_role(auth.uid(), 'coach') and public.is_active_coach_for(auth.uid(), p_member))
    or public.has_active_role(auth.uid(), 'platform_administrator')
  ) then
    raise exception 'not authorized to write wellness_coaching_style_profile for this member';
  end if;

  insert into wellness_coaching_style_profile (
    member_id, tone_preference, detail_preference, task_load_preference,
    time_commitment_sweet_spot_minutes, confidence, evidence_count, rationale,
    last_computed_at, updated_at
  ) values (
    p_member, p_tone_preference, p_detail_preference, p_task_load_preference,
    p_time_commitment_sweet_spot_minutes, p_confidence, p_evidence_count, p_rationale,
    now(), now()
  )
  on conflict (member_id) do update set
    tone_preference = excluded.tone_preference,
    detail_preference = excluded.detail_preference,
    task_load_preference = excluded.task_load_preference,
    time_commitment_sweet_spot_minutes = excluded.time_commitment_sweet_spot_minutes,
    confidence = excluded.confidence,
    evidence_count = excluded.evidence_count,
    rationale = excluded.rationale,
    last_computed_at = excluded.last_computed_at,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function upsert_wellness_recommendation_feedback(
  p_member uuid,
  p_recommendation_key text,
  p_domain text,
  p_consecutive_non_actions int,
  p_last_outcome text,
  p_last_evidence_signature text,
  p_suppressed boolean,
  p_suppressed_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    p_member = auth.uid()
    or (public.has_active_role(auth.uid(), 'coach') and public.is_active_coach_for(auth.uid(), p_member))
    or public.has_active_role(auth.uid(), 'platform_administrator')
  ) then
    raise exception 'not authorized to write wellness_recommendation_feedback for this member';
  end if;

  insert into wellness_recommendation_feedback (
    member_id, recommendation_key, domain, consecutive_non_actions, last_outcome,
    last_evidence_signature, suppressed, suppressed_reason, last_surfaced_at, updated_at
  ) values (
    p_member, p_recommendation_key, p_domain, p_consecutive_non_actions, p_last_outcome,
    p_last_evidence_signature, p_suppressed, p_suppressed_reason, now(), now()
  )
  on conflict (member_id, recommendation_key) do update set
    domain = excluded.domain,
    consecutive_non_actions = excluded.consecutive_non_actions,
    last_outcome = excluded.last_outcome,
    last_evidence_signature = excluded.last_evidence_signature,
    suppressed = excluded.suppressed,
    suppressed_reason = excluded.suppressed_reason,
    last_surfaced_at = excluded.last_surfaced_at,
    updated_at = excluded.updated_at;
end;
$$;
