-- MEF Intelligence Engine (Milestone 8).
--
-- The centralized longitudinal intelligence layer every coaching surface
-- (Conversation Coach, Coaching Brain, Coach Dashboard, notifications,
-- reports, future agents) reads instead of independently deriving its own
-- picture of a member. This migration does NOT recompute or replace
-- anything the Personal Wellness Intelligence Engine (migration 31/32),
-- the Coaching Brain, the Member Health Narrative, or the Coaching Safety
-- system already own — it composes their outputs (see
-- apps/consumer-web-app/lib/intelligence-engine/) and adds exactly two new
-- tables for the two things nothing else already persists:
--
--   intelligence_profile_snapshots   an append-only audit trail of each
--                                     full engine computation (longitudinal
--                                     trends, patterns, hypotheses,
--                                     priorities, recommendations, member
--                                     summary) — never updated or deleted,
--                                     "never overwrite history" taken
--                                     literally. Mirrors wellness_insights'
--                                     own "recomputation is cheap, re-run
--                                     rather than cached" posture, but
--                                     unlike wellness_insights (one row per
--                                     claim, superseded in place) a
--                                     snapshot is one row per computation
--                                     run, kept forever as a trajectory
--                                     record.
--
--   intelligence_coach_alerts        stateful, explainable coach alerts
--                                     (needs review, burnout risk, missed
--                                     assessment, no check-in, worsening
--                                     symptoms, rapid improvement, plateau,
--                                     recurring barriers, repeated safety
--                                     flags, medical evaluation
--                                     recommended). Update model and RLS
--                                     mirror safety_review_queue exactly
--                                     (migration 28): coach-internal
--                                     working data, no member SELECT policy
--                                     ever — a member's own transparency
--                                     into their data already comes from
--                                     wellness_insights/narrative_items,
--                                     which remain the member-visible
--                                     surfaces.
--
-- RLS follows the same established pattern as every table since migration
-- 15: member owns/reads their own rows where a member policy exists at
-- all, an assigned coach (is_active_coach_for) reads/writes their
-- client's, platform_administrator reads/writes everything.

-- ============================================================
-- intelligence_profile_snapshots
-- ============================================================
create table intelligence_profile_snapshots (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  local_date text not null,
  engine_version text not null default 'v1',

  -- Each column is a JSON array/object shaped like the corresponding
  -- exported type in lib/intelligence-engine/types.ts (LongitudinalTrend[],
  -- PatternInsight[], RootCauseHypothesis[], CoachingPriorities,
  -- Recommendation[], MemberSummary) — row/type contract only, same
  -- "logic lives in the app, not the database" discipline as every other
  -- table in this schema.
  longitudinal jsonb not null default '[]'::jsonb,
  patterns jsonb not null default '[]'::jsonb,
  hypotheses jsonb not null default '[]'::jsonb,
  priorities jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  member_summary jsonb not null default '{}'::jsonb,
  alert_count int not null default 0,

  created_at timestamptz not null default now()
);

create index intelligence_profile_snapshots_member_idx
  on intelligence_profile_snapshots (member_id, created_at desc);

alter table intelligence_profile_snapshots enable row level security;

-- A member may read their own snapshot history (the same "here is what
-- the engine currently understands about you" transparency
-- wellness_insights already grants) — nothing in a snapshot is more
-- sensitive than what's already in wellness_insights/narrative_items, both
-- of which fed it.
create policy member_read_own_intelligence_snapshots on intelligence_profile_snapshots
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_intelligence_snapshots on intelligence_profile_snapshots
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- The engine runs on whichever session triggered recalculation — a
-- member's own session (opening /today or /conversation) or an assigned
-- coach's session (viewing the client dashboard) — same as
-- wellness_insights' insert policies.
create policy member_insert_own_intelligence_snapshots on intelligence_profile_snapshots
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_intelligence_snapshots on intelligence_profile_snapshots
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_intelligence_snapshots on intelligence_profile_snapshots
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================
-- intelligence_coach_alerts
-- ============================================================
create table intelligence_coach_alerts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  alert_type text not null check (alert_type in (
    'needs_review',
    'burnout_risk',
    'assessment_overdue',
    'no_checkin',
    'symptoms_worsening',
    'rapid_improvement',
    'plateau',
    'recurring_barriers',
    'repeated_safety_flags',
    'medical_evaluation_recommended'
  )),
  severity text not null default 'notable' check (severity in ('info', 'notable', 'important')),

  title text not null,
  -- The required "explain WHY" — a concrete, evidence-referencing
  -- sentence, never a bare label.
  reason text not null,

  -- A short, stable code identifying which rule produced this row (e.g.
  -- 'no_checkin_sleep', 'plateau_stress') — the dedup/reopen key, same
  -- role wellness_insights.pattern_key plays.
  alert_key text not null,

  evidence_refs jsonb not null default '[]'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,

  -- Links to an existing Coach Review Queue entry when this alert also
  -- triggered a safety escalation — never a second, competing escalation
  -- path, only a pointer to the real one (lib/safety).
  safety_classification_id uuid references safety_classifications(id) on delete set null,

  status text not null default 'open' check (status in (
    'open', 'acknowledged', 'resolved', 'dismissed'
  )),

  acknowledged_by uuid references auth.users(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index intelligence_coach_alerts_member_idx
  on intelligence_coach_alerts (member_id, created_at desc);
create index intelligence_coach_alerts_open_idx
  on intelligence_coach_alerts (member_id, alert_key)
  where status in ('open', 'acknowledged');
create index intelligence_coach_alerts_status_idx
  on intelligence_coach_alerts (status);

alter table intelligence_coach_alerts enable row level security;

-- Coach-internal working data — intentionally no member SELECT policy,
-- exact same trust boundary as safety_review_queue (migration 28). A
-- member's own view into their data stays wellness_insights/
-- narrative_items/intelligence_profile_snapshots, all of which already
-- have member-facing read policies.
create policy member_insert_own_intelligence_alerts on intelligence_coach_alerts
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_intelligence_alerts on intelligence_coach_alerts
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_read_assigned_intelligence_alerts on intelligence_coach_alerts
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_update_assigned_intelligence_alerts on intelligence_coach_alerts
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_intelligence_alerts on intelligence_coach_alerts
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
