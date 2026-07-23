-- Root Coaching Conversation Engine (Prompt 13) — the conversation memory
-- ledger. Every other engine in this series (Longitudinal Intelligence,
-- Recommendation Engine, Investigation Engine/Root Router) already persists
-- its own computed state (member_pattern_states, member_recommendations,
-- investigation_router_decisions); this table is the equivalent one layer
-- up, for the coaching *conversation* layer this prompt adds on top of all
-- of them. One row per coaching message actually shown to a member — its
-- only jobs are (1) letting the engine recognize "I already said this today"
-- and rotate phrasing instead of repeating a message verbatim, and (2)
-- giving the Coach Workspace a real "recent coaching themes" history to
-- read, rather than recomputing what was said from scratch. Nothing here
-- computes a new signal, trend, or recommendation — topic_key traces back
-- to a real LongitudinalSignal.signalKey, lifestyle_experiments.id, or Root
-- Router outcome; message_text is composed entirely from already-approved
-- template copy (lib/root-coaching-engine/templates.ts).
create table member_coaching_messages (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- Stable key this message traces back to, e.g. a LongitudinalSignal's own
  -- signalKey ("checkin_metric::sleep"), "experiment::<uuid>::outcome" /
  -- "::overdue" / "::midpoint", or "router::reassessment::<AssessmentKey>" —
  -- never a random id, so recomputation recognizes "this is the same topic
  -- as last time" instead of accumulating unrelated rows per view.
  topic_key text not null,
  conversation_type text not null check (conversation_type in (
    'first_observation', 'repeated_signal', 'improving_trend', 'worsening_trend',
    'conflicting_information', 'new_assessment_available', 'reassessment',
    'experiment_follow_up', 'experiment_success', 'experiment_unsuccessful'
  )),

  -- The full, member-safe coaching-card text actually shown (Observation ->
  -- Explanation -> Action -> Encouragement, composer.ts's output) — the
  -- source of truth this table exists to remember, so a later run can avoid
  -- showing the identical sentence twice.
  message_text text not null,
  -- Cheap equality check for "was this exact text just shown" without
  -- string-comparing every historical row.
  message_hash text not null,
  -- Coach-facing only, e.g. the SignalState or RootRouterOutcome that
  -- produced this message — never rendered to the member verbatim, same
  -- posture member_pattern_states.evidence_summary already takes.
  source_state text,

  shown_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index member_coaching_messages_member_idx on member_coaching_messages (member_id, shown_at desc);
create index member_coaching_messages_topic_idx on member_coaching_messages (member_id, topic_key, shown_at desc);

alter table member_coaching_messages enable row level security;

create policy member_read_own_member_coaching_messages on member_coaching_messages
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_member_coaching_messages on member_coaching_messages
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- Same dual-writer trust boundary member_pattern_states/member_recommendations
-- already established: the engine runs from either the member's own page
-- load or an assigned coach viewing the Coach Workspace panel.
create policy member_insert_own_member_coaching_messages on member_coaching_messages
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_member_coaching_messages on member_coaching_messages
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- Append-only, same as member_recommendation_events/investigation_router_decisions —
-- a record of what was actually said is never edited after the fact.
create policy platform_admin_all_member_coaching_messages on member_coaching_messages
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
