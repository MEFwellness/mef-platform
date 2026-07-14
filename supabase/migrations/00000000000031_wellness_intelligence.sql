-- Personal Wellness Intelligence Engine (Milestone 6).
--
-- Answers "what is changing in this member's overall wellness journey?" —
-- a longitudinal companion to the Coaching Brain (Milestone 5), which only
-- answers "what should we coach today?" One table, wellness_insights,
-- where every row is a single structured claim about a longer-term
-- pattern (a trend, a recurring pattern, a strength, or a priority
-- summary) that always traces back to real evidence (evidence_refs) and
-- carries its own confidence/severity — never a fabricated trend.
--
-- Update model mirrors narrative_items (migration 29) exactly: a row is
-- never edited in place by the engine — recalculation supersedes an old
-- row (supersedes_id / superseded_by_id) rather than mutating it, which
-- is itself the audit trail. A coach's confirm/dismiss/resolve/pin/context
-- actions DO update a row in place (the human-in-the-loop correction
-- surface), same trust boundary as narrative_items' coach-only update
-- policy.
--
-- RLS follows the same established pattern as narrative_items/safety_*:
-- a member reads their own member-visible, non-dismissed rows; an
-- assigned coach reads and manages everything about their client,
-- including coach-only insights never shown to the member.

-- ============================================================
-- safety_classifications: extend source_feature for this engine's
-- coach-review routing (see lib/intelligence/service.ts's
-- routeSeriousPatternToReview) — additive only, every existing value
-- stays valid. Migration 28's own comment on this column anticipated
-- exactly this: "extend this list as new coaching surfaces integrate the
-- safety layer."
-- ============================================================
alter table safety_classifications drop constraint safety_classifications_source_feature_check;
alter table safety_classifications add constraint safety_classifications_source_feature_check
  check (source_feature in (
    'daily_checkin',
    'coach_note',
    'ai_recommendation',
    'daily_feed',
    'dynamic_coaching',
    'wellness_intelligence'
  ));

-- ============================================================
-- wellness_insights
-- ============================================================
create table wellness_insights (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  insight_type text not null check (insight_type in (
    'trend', 'pattern', 'strength', 'priority_summary'
  )),

  -- Null only for priority_summary rows, which describe the member's
  -- overall priority picture rather than one specific area, and for
  -- cross-area patterns (a divergence between two areas, a day-of-week
  -- pattern spanning several categories) where a single area would be
  -- misleading — evidence_refs and the summary/detail text still make the
  -- real scope clear.
  wellness_area text check (wellness_area is null or wellness_area in (
    'sleep', 'stress', 'movement', 'recovery', 'hydration', 'breathing',
    'digestion', 'energy', 'pain', 'consistency', 'mood',
    'completed_actions', 'lesson_engagement', 'reflections',
    'doctor_movement', 'doctor_diet', 'doctor_quiet', 'doctor_happiness'
  )),

  -- Only meaningful for insight_type = 'trend'.
  trend_state text check (trend_state is null or trend_state in (
    'improving', 'declining', 'stable', 'inconsistent', 'insufficient_data',
    'newly_emerging', 'recurring_pattern', 'resolved_or_inactive'
  )),
  -- The trend's own magnitude — distinct from `severity` (how much coach
  -- attention this deserves) and `confidence` (how sure the engine is).
  -- Only meaningful for insight_type = 'trend'.
  trend_strength text check (trend_strength is null or trend_strength in (
    'mild', 'moderate', 'strong'
  )),

  -- A short, stable code identifying which detector produced this row
  -- (e.g. 'day_of_week_completion', 'divergence_sleep_stress',
  -- 'repeated_intervention_success') — lets recalculation find and
  -- supersede the exact same claim rather than duplicating it, the same
  -- role (category, title) plays for narrative_items.
  pattern_key text not null,

  title text not null,
  -- Correlation-worded, never causal — see lib/intelligence/copy.ts.
  member_summary text not null,
  coach_detail text not null,

  -- 0-1. Every insight must clear a minimum-evidence confidence floor
  -- before being persisted at all — see lib/intelligence/confidence.ts.
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  severity text not null default 'info' check (severity in ('info', 'notable', 'important')),

  time_window text not null check (time_window in (
    'last_7_days', 'previous_7_days', 'last_14_days', 'last_30_days',
    'previous_30_days', 'last_90_days', 'since_baseline', 'since_reassessment'
  )),

  -- Array of { type, id | range, note? } — same evidence-pointer shape as
  -- narrative_items.source_refs, e.g. { type: 'daily_checkin_range', id:
  -- '<oldest-id>..<newest-id>' } or { type: 'daily_feed_item', id }.
  evidence_refs jsonb not null default '[]'::jsonb,
  -- Short, auditable codes (e.g. 'DECLINING_30D_VS_PRIOR_30D',
  -- 'WEEKEND_COMPLETION_DROP') — never free-text chain-of-thought.
  reasoning_codes jsonb not null default '[]'::jsonb,

  recommended_coaching_response text,
  recommended_coach_action text,

  -- Mirrors safety_classifications' classification_level exactly — an
  -- insight touching a currently-restricted topic is downgraded to
  -- 'coach_review_required' and never shown to the member, regardless of
  -- what the detector itself would otherwise conclude. See
  -- lib/intelligence/safety.ts.
  safety_classification_level text not null default 'standard_coaching' check (
    safety_classification_level in (
      'standard_coaching', 'coaching_with_caution', 'medical_evaluation_recommended',
      'coach_review_required', 'safety_response_only'
    )
  ),
  -- Set when this insight caused a safety_classifications /
  -- safety_review_queue entry to be opened (a "potentially serious
  -- pattern" per the milestone) — never bypasses that system, only links
  -- to it.
  safety_classification_id uuid references safety_classifications(id) on delete set null,

  status text not null default 'active' check (status in (
    'active', 'confirmed', 'dismissed', 'resolved', 'superseded', 'stale'
  )),
  is_pinned boolean not null default false,
  pinned_by uuid references auth.users(id) on delete set null,
  pinned_at timestamptz,
  -- A coach's own added context/correction — never overwritten by
  -- recalculation once set; the engine treats a coach_context'd insight
  -- as protected from silent superseding, same "coach_protected" spirit
  -- as narrative_items.
  coach_context text,
  coach_reviewed_by uuid references auth.users(id) on delete set null,
  coach_reviewed_at timestamptz,

  -- False for coach-only insights (e.g. one derived from a coach-only
  -- narrative item, or downgraded by the safety gate) — default true
  -- because most intelligence IS meant to safely inform the member's own
  -- "Your Wellness Patterns" section.
  member_visible boolean not null default true,

  supersedes_id uuid references wellness_insights(id) on delete set null,
  superseded_by_id uuid references wellness_insights(id) on delete set null,

  last_confirmed_at timestamptz,
  expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index wellness_insights_member_active_idx on wellness_insights (member_id, insight_type)
  where status in ('active', 'confirmed');
create index wellness_insights_member_area_idx on wellness_insights (member_id, wellness_area);
create index wellness_insights_pattern_key_idx on wellness_insights (member_id, pattern_key);
create index wellness_insights_pinned_idx on wellness_insights (member_id) where is_pinned;
create index wellness_insights_supersedes_idx on wellness_insights (supersedes_id);

alter table wellness_insights enable row level security;

-- A member sees only their own member-visible, non-dismissed rows —
-- 'dismissed' specifically hidden at the RLS layer (not just application
-- code) since a coach dismissing an inaccurate insight must reliably stop
-- it from reaching the member no matter which surface reads this table.
create policy member_read_own_insights on wellness_insights
  for select
  using (member_id = auth.uid() and member_visible and status != 'dismissed');

create policy coach_read_assigned_insights on wellness_insights
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- The intelligence service runs on whichever session triggered
-- recalculation — a member's own session (opening /today or /progress
-- lazily recomputes) or an assigned coach's session (requesting
-- recalculation from the client view).
create policy member_insert_own_insights on wellness_insights
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_insights on wellness_insights
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- The engine needs to flip a superseded row's status on the member's own
-- session too (recalculation triggered by the member simply opening a
-- page) — this does not let a member author or alter the substance of
-- their own insights, only the mechanical supersede/expire transition;
-- confirm/dismiss/resolve/pin/context stay coach-only, enforced in
-- application code (lib/intelligence/), same trust boundary
-- narrative_items already established.
create policy member_update_own_insights on wellness_insights
  for update
  using (member_id = auth.uid());

create policy coach_update_assigned_insights on wellness_insights
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_insights on wellness_insights
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
