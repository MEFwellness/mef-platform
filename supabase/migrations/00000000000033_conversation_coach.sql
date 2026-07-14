-- MEF Conversation Coach (Milestone 7).
--
-- A premium, member-facing coaching conversation surface built entirely on
-- top of already-existing systems — the Coaching Brain (migration 27/
-- lib/brain), the Personal Wellness Intelligence Engine (migration 31),
-- the Member Health Narrative (migration 29), the Daily Coaching Feed
-- (migration 30), and the Coaching Safety, Scope, and Human Oversight
-- System (migration 28, whose own header comment named "conversational
-- coaching" as a future caller of evaluateConcern()). This migration adds
-- no new decision logic of its own — it only gives that conversation a
-- durable, auditable home.
--
-- Four tables:
--
--   conversation_sessions   one row per coaching conversation thread. A
--                            member may have several over time (archived
--                            once inactive); at most one 'active' thread
--                            is the one new messages append to.
--   conversation_messages   append-only turn-by-turn transcript. Every
--                            member-authored message is classified through
--                            the existing safety layer before a reply is
--                            generated (safety_classification_id links to
--                            that audit trail) — never a second, parallel
--                            safety system.
--   conversation_memory     extracted, structured continuity facts (a
--                            barrier, a preference, a strategy that
--                            helped, a life event, an unresolved concern, a
--                            requested coach follow-up) — deliberately NOT
--                            a raw copy of every message; see
--                            lib/conversation-coach/memoryExtraction.ts.
--   conversation_handoffs   a member's explicit request for their assigned
--                            coach to review/follow up on a conversation —
--                            distinct from (but may reference) an
--                            existing safety_review_queue entry, since a
--                            handoff can be requested for non-safety
--                            reasons too ("I don't feel comfortable
--                            continuing here").
--
-- RLS follows the exact pattern established by migrations 28/29/30/31:
-- a member reads/writes their own rows, an assigned coach
-- (is_active_coach_for) reads their client's, platform_administrator
-- reads/writes everything.

-- ============================================================
-- safety_classifications: extend source_feature for this milestone,
-- additive only — every existing value stays valid, matching migration
-- 31's own precedent for extending this same constraint.
-- ============================================================
alter table safety_classifications drop constraint safety_classifications_source_feature_check;
alter table safety_classifications add constraint safety_classifications_source_feature_check
  check (source_feature in (
    'daily_checkin',
    'coach_note',
    'ai_recommendation',
    'daily_feed',
    'dynamic_coaching',
    'wellness_intelligence',
    'conversation_coach'
  ));

-- ============================================================
-- conversation_sessions
-- ============================================================
create table conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  -- Which page/action started this thread — drives the contextual opening
  -- message and lets the coach dashboard show why a conversation began.
  entry_point text not null check (entry_point in (
    'nav',
    'today_focus',
    'today_easier_option',
    'today_why',
    'today_completed',
    'progress_pattern',
    'progress_improved',
    'progress_focus',
    'checkin_explain',
    'checkin_feeling'
  )),
  status text not null default 'active' check (status in ('active', 'restricted', 'archived')),
  -- Short, auto-derived label for the member's own conversation list
  -- (e.g. "Talking about today's focus") — never member PII beyond what
  -- they already typed.
  title text,
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversation_sessions_member_idx on conversation_sessions (member_id, last_message_at desc);
create index conversation_sessions_member_active_idx on conversation_sessions (member_id)
  where status = 'active';

-- ============================================================
-- conversation_messages
-- ============================================================
create table conversation_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references conversation_sessions(id) on delete cascade,
  -- Denormalized from the session for the same reason every other
  -- append-only table in this schema (safety_classifications,
  -- safety_audit_log) keys directly by member_id: simple, direct RLS
  -- without a subquery join to conversation_sessions on every row check.
  member_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('member', 'coach_ai', 'system')),
  content text not null check (char_length(trim(content)) > 0),
  -- Which page/action produced this specific message (mirrors the
  -- session's own entry_point for the first turn, but a conversation can
  -- move between pages).
  source_page text,
  -- Which lib/conversation-coach/promptVersion.ts version generated a
  -- coach_ai reply — null for member-authored messages. Auditable, never
  -- the prompt content itself.
  prompt_version text,
  -- Links to the Coaching Safety, Scope, and Human Oversight System's own
  -- audit trail (migration 28) — every member message, and every
  -- non-standard coach_ai reply, is classified through the existing
  -- evaluateConcern(), never a second safety system.
  safety_classification_id uuid references safety_classifications(id) on delete set null,
  -- Snapshot references to the exact Coaching Brain focus / Wellness
  -- Intelligence insight this reply drew on, for coach-dashboard
  -- transparency ("what influenced this reply") — never re-derived after
  -- the fact, since the Brain's decision can change day to day.
  related_brain_focus text,
  related_insight_id uuid references wellness_insights(id) on delete set null,
  -- False for a message that must never reach the member (e.g. an
  -- internal system note) — distinct from a coach-only coach_note, which
  -- lives in its own table entirely.
  member_visible boolean not null default true,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index conversation_messages_session_idx on conversation_messages (session_id, created_at asc);
create index conversation_messages_member_idx on conversation_messages (member_id, created_at desc);

-- ============================================================
-- conversation_memory
-- ============================================================
create table conversation_memory (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references conversation_sessions(id) on delete cascade,
  memory_type text not null check (memory_type in (
    'barrier',
    'preference',
    'life_event',
    'action_chosen',
    'successful_strategy',
    'unresolved_concern',
    'coach_follow_up_request'
  )),
  content text not null check (char_length(trim(content)) > 0),
  source_message_id uuid references conversation_messages(id) on delete set null,
  -- A member correcting themselves later ("actually mornings work better")
  -- supersedes by flipping this rather than deleting — same "never edit
  -- the historical record, just stop treating it as current" discipline
  -- as narrative_items/wellness_insights, kept intentionally simpler here
  -- (a boolean, not a full supersede chain) since this is lightweight
  -- continuity data, not a clinical record.
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversation_memory_member_idx on conversation_memory (member_id, memory_type)
  where is_active;
create index conversation_memory_session_idx on conversation_memory (session_id);

-- ============================================================
-- conversation_handoffs
-- ============================================================
create table conversation_handoffs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references conversation_sessions(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  -- Resolved at creation time from coach_client_assignments, same
  -- nullable-if-unassigned pattern as safety_review_queue.
  assigned_coach_id uuid references auth.users(id) on delete set null,
  member_note text,
  urgency text not null default 'medium' check (urgency in ('low', 'medium', 'high')),
  status text not null default 'pending' check (status in ('pending', 'acknowledged', 'resolved')),
  coach_response_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index conversation_handoffs_member_idx on conversation_handoffs (member_id, created_at desc);
create index conversation_handoffs_coach_idx on conversation_handoffs (assigned_coach_id, status);

-- ============================================================
-- coach_notes: optional link to the conversation that prompted a note —
-- additive, nullable, on delete set null, identical pattern to migration
-- 26's onboarding_submission_id link. No new RLS needed: coach_notes'
-- existing policies (migration 23) already authorize by coach_id/client_id.
-- ============================================================
alter table coach_notes
  add column conversation_session_id uuid references conversation_sessions(id) on delete set null;

create index coach_notes_conversation_idx on coach_notes (conversation_session_id);

-- ============================================================
-- RLS
-- ============================================================
alter table conversation_sessions enable row level security;
alter table conversation_messages enable row level security;
alter table conversation_memory enable row level security;
alter table conversation_handoffs enable row level security;

-- conversation_sessions
create policy member_insert_own_sessions on conversation_sessions
  for insert
  with check (member_id = auth.uid());

create policy member_read_own_sessions on conversation_sessions
  for select
  using (member_id = auth.uid());

-- The member's own session can update title/last_message_at/status
-- mechanically (e.g. archiving a thread they're done with) — restricting
-- a topic for safety reasons is a coach/admin action, enforced in
-- application code (lib/conversation-coach/), same trust boundary as
-- wellness_insights' member_update_own_insights.
create policy member_update_own_sessions on conversation_sessions
  for update
  using (member_id = auth.uid());

create policy coach_read_assigned_sessions on conversation_sessions
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_update_assigned_sessions on conversation_sessions
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_sessions on conversation_sessions
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- conversation_messages: append-only, no update/delete policy — a
-- correction is a new message, never an edit of history, same discipline
-- as safety_classifications/safety_audit_log.
create policy member_insert_own_messages on conversation_messages
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_messages on conversation_messages
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_read_own_messages on conversation_messages
  for select
  using (member_id = auth.uid() and member_visible);

-- A coach sees the full transcript for their assigned client, including
-- any member_visible = false system notes — same "coach sees everything,
-- member sees only what's meant for them" trust boundary as
-- narrative_items/wellness_insights.
create policy coach_read_assigned_messages on conversation_messages
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_messages on conversation_messages
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- conversation_memory: the member's own extracted continuity facts —
-- readable by the member (it's their own coaching context, not a clinical
-- secret) and by their assigned coach, for the same continuity purpose.
create policy member_insert_own_memory on conversation_memory
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_memory on conversation_memory
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_read_own_memory on conversation_memory
  for select
  using (member_id = auth.uid() and is_active);

create policy coach_read_assigned_memory on conversation_memory
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- Superseding (is_active flip) can happen from the member's own session
-- (extraction runs while they're chatting) or a coach's — the mechanical
-- transition only, same trust boundary as wellness_insights.
create policy member_update_own_memory on conversation_memory
  for update
  using (member_id = auth.uid());

create policy coach_update_assigned_memory on conversation_memory
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_memory on conversation_memory
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- conversation_handoffs: a member can create and read their own request
-- and see its status change; only the assigned coach (or admin) can
-- acknowledge/resolve it. No member update policy — mirrors
-- safety_review_queue's "member reads status, coach does the reviewing"
-- shape, applied to a member-initiated (not safety-triggered) request.
create policy member_insert_own_handoffs on conversation_handoffs
  for insert
  with check (member_id = auth.uid());

create policy member_read_own_handoffs on conversation_handoffs
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_handoffs on conversation_handoffs
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_update_assigned_handoffs on conversation_handoffs
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_handoffs on conversation_handoffs
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
