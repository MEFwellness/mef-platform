-- AI Coaching Engine Foundation.
--
-- This is the infrastructure every future AI agent (Member Engagement,
-- Wellness Analysis, Coach Assistant, Education, Accountability, and
-- whatever comes after) writes to and reads from — not a chatbot, not a
-- conversation log. Nine tables, in the order data flows through them:
--
--   ai_events            durable, append-only record of "something
--                        happened" (a check-in, a reassessment, a coach
--                        note...). processed_at is nullable and doubles as
--                        a queue marker: null = not yet processed. No
--                        background worker exists in this stack yet, so
--                        today the app dispatches events inline right
--                        after emitting them (see lib/ai/events/), but the
--                        schema is ready for an async worker to poll
--                        `where processed_at is null` later without any
--                        migration.
--   ai_agents            registry of which agents exist, their metadata,
--                        and an enabled/disabled + config toggle an future
--                        admin surface can flip without a deploy.
--   ai_rules             the deterministic rules engine's data — condition
--                        trees + what to produce when they match. Runs
--                        BEFORE any LLM is involved; see the milestone's
--                        stated philosophy that the LLM enhances coaching,
--                        it doesn't replace this.
--   ai_insights           an agent's factual observation about a member,
--                        always traceable to the event/rule that produced
--                        it and the real member data behind it
--                        (supporting_data).
--   ai_recommendations    a suggested next step derived from one or more
--                        insights.
--   ai_actions            the concrete, typed, deliverable unit (today's
--                        priority, a coach notification, a risk alert...)
--                        — every row carries the fields the milestone
--                        spec requires: originating agent, reason,
--                        supporting data, confidence, timestamp, status,
--                        and whether it needs coach approval before
--                        delivery.
--   ai_history            the feedback loop: what happened to an action
--                        afterward (member acknowledged it, coach
--                        overrode it, etc.) — read before generating a
--                        new recommendation so agents don't repeat
--                        themselves.
--   ai_logs               operational/diagnostic log for the AI system
--                        itself (errors, rule-evaluation traces) —
--                        distinct from ai_events, which is business data.
--   ai_prompt_templates    schema only. No rows are seeded and content
--                        defaults to '' — per the milestone's explicit
--                        "do not populate prompt templates yet."
--
-- None of these tables are written to by any UI yet. RLS still follows
-- this schema's established shape (member reads their own rows, an
-- assigned coach reads their client's, platform_administrator reads/writes
-- everything) so nothing has to change here the day a UI does start
-- reading them.

-- ============================================================
-- ai_agents
-- ============================================================
create table ai_agents (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null unique,
  name text not null,
  category text not null,
  description text not null,
  responsibilities jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  -- Free-form, agent-specific settings an admin surface can tune later
  -- (coaching tone, thresholds, etc.) without a schema change.
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- ai_events
-- ============================================================
create table ai_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'member_completed_onboarding',
    'member_completed_checkin',
    'member_missed_checkin',
    'reassessment_completed',
    'pain_increased',
    'pain_decreased',
    'stress_increased',
    'stress_decreased',
    'sleep_declined',
    'movement_improved',
    'digestion_worsened',
    'coach_added_notes',
    'coach_completed_session',
    'member_inactive',
    'habit_streak_achieved',
    'wellness_index_changed_significantly'
  )),
  member_id uuid not null references auth.users(id) on delete cascade,
  -- Who/what caused this event to be recorded — not necessarily the
  -- member themselves (e.g. a coach's note about a client).
  source text not null check (source in ('member', 'coach', 'system')),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index ai_events_unprocessed_idx on ai_events (occurred_at) where processed_at is null;
create index ai_events_member_idx on ai_events (member_id, occurred_at desc);

-- ============================================================
-- ai_rules (the deterministic rules engine's data)
-- ============================================================
create table ai_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  agent_key text not null references ai_agents(agent_key),
  name text not null,
  description text not null,
  -- Array of ai_events.event_type values this rule listens for.
  trigger_event_types jsonb not null,
  -- Structured condition tree evaluated against real member data facts —
  -- see lib/ai/rules/engine.ts for the exact grammar this is written in.
  conditions jsonb not null,
  -- What to produce when the condition matches: insight/recommendation/
  -- action type, title/description templates, confidence, whether it
  -- needs coach approval. See lib/ai/rules/types.ts.
  produces jsonb not null,
  priority int not null default 100,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_rules_agent_idx on ai_rules (agent_key) where enabled;

-- ============================================================
-- ai_insights
-- ============================================================
create table ai_insights (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references ai_agents(agent_key),
  member_id uuid not null references auth.users(id) on delete cascade,
  source_event_id uuid references ai_events(id) on delete set null,
  source_rule_key text references ai_rules(rule_key) on delete set null,
  insight_type text not null,
  title text not null,
  description text not null,
  -- The actual member data points that justify this insight — every AI
  -- output in this system must be explainable, per the milestone's
  -- stated philosophy. Never empty.
  supporting_data jsonb not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now()
);

create index ai_insights_member_idx on ai_insights (member_id, created_at desc);

-- ============================================================
-- ai_recommendations
-- ============================================================
create table ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references ai_agents(agent_key),
  member_id uuid not null references auth.users(id) on delete cascade,
  source_insight_id uuid references ai_insights(id) on delete set null,
  recommendation_type text not null,
  title text not null,
  description text not null,
  supporting_data jsonb not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'dismissed', 'completed', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index ai_recommendations_member_idx on ai_recommendations (member_id, created_at desc);

-- ============================================================
-- ai_actions
-- ============================================================
create table ai_actions (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references ai_agents(agent_key),
  member_id uuid not null references auth.users(id) on delete cascade,
  source_recommendation_id uuid references ai_recommendations(id) on delete set null,
  action_type text not null check (action_type in (
    'daily_coaching_insight',
    'todays_priority',
    'todays_action',
    'coach_notification',
    'member_encouragement',
    'reminder_recommendation',
    'educational_recommendation',
    'reassessment_recommendation',
    'progress_milestone',
    'risk_alert',
    'follow_up_recommendation'
  )),
  reason text not null,
  supporting_data jsonb not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  status text not null default 'pending'
    check (status in ('pending', 'delivered', 'approved', 'rejected', 'expired', 'completed')),
  requires_coach_approval boolean not null default false,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index ai_actions_member_idx on ai_actions (member_id, created_at desc);
create index ai_actions_pending_approval_idx on ai_actions (member_id)
  where requires_coach_approval and status = 'pending';

-- ============================================================
-- ai_history (the feedback loop — what happened to an action afterward)
-- ============================================================
create table ai_history (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  agent_key text not null references ai_agents(agent_key),
  source_action_id uuid references ai_actions(id) on delete set null,
  memory_type text not null check (memory_type in (
    'recommendation_given',
    'insight_delivered',
    'education_delivered',
    'member_response',
    'coach_override'
  )),
  actor_type text not null check (actor_type in ('member', 'coach', 'system')),
  actor_id uuid references auth.users(id),
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index ai_history_member_agent_idx on ai_history (member_id, agent_key, created_at desc);

-- ============================================================
-- ai_logs (operational log for the AI system itself — not member-facing)
-- ============================================================
create table ai_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('debug', 'info', 'warn', 'error')),
  agent_key text references ai_agents(agent_key),
  member_id uuid references auth.users(id) on delete set null,
  source_event_id uuid references ai_events(id) on delete set null,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index ai_logs_created_idx on ai_logs (created_at desc);

-- ============================================================
-- ai_prompt_templates — schema only, zero rows seeded, content left
-- empty. Provider-agnostic by default (provider is nullable); a template
-- can be pinned to a specific provider later if it ever needs to be.
-- ============================================================
create table ai_prompt_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  agent_key text not null references ai_agents(agent_key),
  name text not null,
  description text not null,
  provider text,
  version int not null default 1,
  content text not null default '',
  variables jsonb not null default '[]'::jsonb,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- RLS
-- ============================================================
alter table ai_agents enable row level security;
alter table ai_events enable row level security;
alter table ai_rules enable row level security;
alter table ai_insights enable row level security;
alter table ai_recommendations enable row level security;
alter table ai_actions enable row level security;
alter table ai_history enable row level security;
alter table ai_logs enable row level security;
alter table ai_prompt_templates enable row level security;

-- ai_agents: harmless reference metadata (name/description/enabled) — any
-- authenticated user may read it, same pattern as onboarding_questions.
-- Only platform_administrator can change agent config.
create policy authenticated_read_agents on ai_agents
  for select
  using (auth.role() = 'authenticated');

create policy platform_admin_all_agents on ai_agents
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ai_rules: the dispatcher (lib/ai/dispatcher.ts) evaluates active rules
-- using the SAME session-scoped client as the triggering member/coach
-- action (never an admin session) — without a read policy here, that read
-- always returns zero rows under RLS and the deterministic rules engine
-- can never fire for any real event. Same reasoning as ai_agents above:
-- rule definitions are operational config, not member-sensitive data: no
-- UI is meant to expose them to members/coaches even once one exists for
-- ai_agents, but the DB layer must allow the read that already-approved
-- dispatch pattern depends on. Only platform_administrator may change them.
create policy authenticated_read_rules on ai_rules
  for select
  using (auth.role() = 'authenticated');

create policy platform_admin_all_rules on ai_rules
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy platform_admin_all_prompt_templates on ai_prompt_templates
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ai_events: a member reports events about themselves; a coach may report
-- an event about an assigned client (e.g. "coach added notes"). Both may
-- read their own/their clients' event history.
create policy member_insert_own_events on ai_events
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_events on ai_events
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_read_own_events on ai_events
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_events on ai_events
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- The dispatcher (lib/ai/dispatcher.ts) marks its own event processed_at
-- once dispatch finishes, running as the same member/coach session that
-- reported the event in the first place — without these, that update
-- silently matches zero rows under RLS and processed_at would never be set.
create policy member_update_own_events on ai_events
  for update
  using (member_id = auth.uid());

create policy coach_update_assigned_events on ai_events
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_events on ai_events
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ai_insights / ai_recommendations / ai_actions / ai_history: written by
-- the AI dispatch pipeline running as either the member's own session (a
-- check-in triggers analysis about that same member) or an assigned
-- coach's session (a coach action triggers analysis about their client) —
-- same shape as the ai_events policies above. No UI surfaces these tables
-- yet, but the read policies are ready for the day a member/coach view
-- does.
create policy member_insert_own_insights on ai_insights
  for insert
  with check (member_id = auth.uid());
create policy coach_insert_assigned_insights on ai_insights
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );
create policy member_read_own_insights on ai_insights
  for select using (member_id = auth.uid());
create policy coach_read_assigned_insights on ai_insights
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );
create policy platform_admin_all_insights on ai_insights
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy member_insert_own_recommendations on ai_recommendations
  for insert
  with check (member_id = auth.uid());
create policy coach_insert_assigned_recommendations on ai_recommendations
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );
create policy member_read_own_recommendations on ai_recommendations
  for select using (member_id = auth.uid());
create policy coach_read_assigned_recommendations on ai_recommendations
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );
create policy platform_admin_all_recommendations on ai_recommendations
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy member_insert_own_actions on ai_actions
  for insert
  with check (member_id = auth.uid());
create policy coach_insert_assigned_actions on ai_actions
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );
create policy member_read_own_actions on ai_actions
  for select using (member_id = auth.uid());
create policy coach_read_assigned_actions on ai_actions
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );
-- A coach may approve/reject a pending action for their own assigned
-- client (updating status/approved_by/approved_at) — nothing else about
-- the row is meant to change after the AI created it.
create policy coach_update_assigned_actions on ai_actions
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );
create policy platform_admin_all_actions on ai_actions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy member_insert_own_history on ai_history
  for insert
  with check (member_id = auth.uid());
create policy coach_insert_assigned_history on ai_history
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );
create policy member_read_own_history on ai_history
  for select using (member_id = auth.uid());
create policy coach_read_assigned_history on ai_history
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );
create policy platform_admin_all_history on ai_history
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ai_logs: technical/operational, not member- or coach-facing —
-- platform_administrator only, including insert (the dispatcher runs
-- under the triggering user's session, same as everywhere else in this
-- app, so it needs its own insert allowance rather than being restricted
-- to admin-only writes; logs are low-sensitivity operational trace data,
-- not coaching content, so member/coach insert is fine — only reads are
-- restricted).
create policy member_insert_own_logs on ai_logs
  for insert
  with check (member_id = auth.uid());
create policy coach_insert_assigned_logs on ai_logs
  for insert
  with check (
    member_id is null
    or (
      public.has_active_role(auth.uid(), 'coach')
      and public.is_active_coach_for(auth.uid(), member_id)
    )
  );
create policy platform_admin_all_logs on ai_logs
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
