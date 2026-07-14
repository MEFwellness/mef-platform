-- Coaching Safety, Scope, and Human Oversight.
--
-- One central safety/scope decision layer every coaching-output pathway
-- (today: dynamic coaching's AI dispatcher and the check-in free-text
-- fields; later: the Daily Coaching Feed and conversational coaching)
-- runs through before anything reaches a member. Deterministic — no LLM
-- call is involved in classification itself, matching this codebase's
-- existing "rules run before any model" precedent from the AI Coaching
-- Engine Foundation (migration 27).
--
-- Five tables:
--
--   safety_message_templates  approved, versioned member-facing copy per
--                              classification level (and optionally per
--                              concern category). Never freeform-generated.
--   safety_classifications    the structured, auditable result of running
--                              the classifier against a piece of member
--                              input or a proposed coaching output.
--                              Append-only — a new classification is a new
--                              row, never an edit of a past one.
--   safety_acknowledgments    a member's acknowledgment of a shown safety
--                              message, for classifications that require
--                              one. Acknowledging never unlocks prohibited
--                              advice — enforced in application code
--                              (lib/safety/), not by this table.
--   safety_review_queue       the Coach Review Queue — one row per
--                              classification that required human review.
--                              Coach-internal working data: members can
--                              see their own classification/acknowledgment
--                              rows (what was shown to them), but not the
--                              coach's raw review queue entry.
--   safety_audit_log          append-only trail of every safety-relevant
--                              event (classification created, message
--                              shown, acknowledgment recorded, review
--                              created/updated, restriction added/removed,
--                              resolution) — a member may read their own
--                              history; the coach-only review notes live
--                              in safety_review_queue, not here.
--
-- RLS follows the exact pattern migration 27 established: member reads/
-- writes their own rows, an assigned coach (is_active_coach_for) reads/
-- writes their client's, platform_administrator reads/writes everything.

-- ============================================================
-- safety_message_templates
-- ============================================================
create table safety_message_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  classification_level text not null check (classification_level in (
    'standard_coaching',
    'coaching_with_caution',
    'medical_evaluation_recommended',
    'coach_review_required',
    'safety_response_only'
  )),
  -- Null means "generic default for this classification level." A
  -- non-null value overrides the generic template for that specific
  -- concern category (e.g. a self-harm-specific SAFETY_RESPONSE_ONLY
  -- message, distinct from the generic one).
  concern_category text,
  version int not null default 1,
  title text not null,
  body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index safety_message_templates_level_category_idx
  on safety_message_templates (classification_level, coalesce(concern_category, ''), version);

-- ============================================================
-- safety_classifications
-- ============================================================
create table safety_classifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  -- Which feature triggered this classification — extend this list as
  -- new coaching surfaces integrate the safety layer (Milestone 3's Daily
  -- Coaching Feed adds 'daily_feed').
  source_feature text not null check (source_feature in (
    'daily_checkin',
    'coach_note',
    'ai_recommendation',
    'daily_feed',
    'dynamic_coaching'
  )),
  source_record_type text,
  source_record_id uuid,
  source_event_id uuid references ai_events(id) on delete set null,
  -- The member-authored text (or generated coaching copy) that was
  -- classified, truncated at the application layer — never chain-of-
  -- thought, just the actual input.
  input_excerpt text,
  classification_level text not null check (classification_level in (
    'standard_coaching',
    'coaching_with_caution',
    'medical_evaluation_recommended',
    'coach_review_required',
    'safety_response_only'
  )),
  urgency text not null check (urgency in ('none', 'low', 'medium', 'high', 'critical')),
  -- Array of concern-category keys (lib/safety/categories.ts) detected.
  concern_categories jsonb not null default '[]'::jsonb,
  -- Short, auditable codes explaining the decision — never free-text
  -- chain-of-thought. See lib/safety/classifier.ts.
  reasoning_codes jsonb not null default '[]'::jsonb,
  coaching_allowed boolean not null default true,
  -- Structured restriction detail, e.g. { "restrictedTopics": ["medication"] }.
  coaching_restrictions jsonb not null default '{}'::jsonb,
  restricted_topics jsonb not null default '[]'::jsonb,
  coach_review_required boolean not null default false,
  acknowledgment_required boolean not null default false,
  escalation_action text not null default 'none' check (escalation_action in (
    'none', 'notify_coach', 'coach_review_queue', 'urgent_follow_up'
  )),
  message_template_id uuid references safety_message_templates(id) on delete set null,
  -- Snapshot of the exact message text shown, independent of whether the
  -- template row is later edited — the audit trail must reflect what the
  -- member actually saw at the time.
  member_message_shown text,
  policy_version text not null,
  created_at timestamptz not null default now()
);

create index safety_classifications_member_idx on safety_classifications (member_id, created_at desc);
create index safety_classifications_review_idx on safety_classifications (member_id)
  where coach_review_required;

-- ============================================================
-- safety_acknowledgments
-- ============================================================
create table safety_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  classification_id uuid not null references safety_classifications(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  message_shown text not null,
  message_version text not null,
  classification_level text not null check (classification_level in (
    'standard_coaching',
    'coaching_with_caution',
    'medical_evaluation_recommended',
    'coach_review_required',
    'safety_response_only'
  )),
  status text not null default 'pending' check (status in ('pending', 'acknowledged', 'dismissed')),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index safety_acknowledgments_member_idx on safety_acknowledgments (member_id, created_at desc);
create index safety_acknowledgments_classification_idx on safety_acknowledgments (classification_id);

-- ============================================================
-- safety_review_queue (the Coach Review Queue)
-- ============================================================
create table safety_review_queue (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  -- Resolved at creation time from coach_client_assignments — nullable
  -- since an unassigned member can still trigger a classification that
  -- needs review (platform_administrator handles it until a coach is
  -- assigned).
  assigned_coach_id uuid references auth.users(id) on delete set null,
  classification_id uuid not null references safety_classifications(id) on delete cascade,
  source_feature text not null,
  source_record_type text,
  source_record_id uuid,
  member_input_excerpt text,
  concern_categories jsonb not null default '[]'::jsonb,
  classification_level text not null check (classification_level in (
    'standard_coaching',
    'coaching_with_caution',
    'medical_evaluation_recommended',
    'coach_review_required',
    'safety_response_only'
  )),
  urgency text not null check (urgency in ('none', 'low', 'medium', 'high', 'critical')),
  restrictions_applied jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in (
    'new', 'reviewing', 'approved_for_limited_coaching', 'referred_out', 'urgent_follow_up', 'closed'
  )),
  coach_notes text,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index safety_review_queue_member_idx on safety_review_queue (member_id, created_at desc);
create index safety_review_queue_coach_idx on safety_review_queue (assigned_coach_id, status);
create index safety_review_queue_open_idx on safety_review_queue (status)
  where status not in ('closed', 'approved_for_limited_coaching');

-- ============================================================
-- safety_audit_log
-- ============================================================
create table safety_audit_log (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  classification_id uuid references safety_classifications(id) on delete set null,
  review_id uuid references safety_review_queue(id) on delete set null,
  event_type text not null check (event_type in (
    'classification_created',
    'message_shown',
    'acknowledgment_recorded',
    'review_created',
    'review_updated',
    'restriction_added',
    'restriction_removed',
    'review_resolved'
  )),
  actor_type text not null check (actor_type in ('member', 'coach', 'system')),
  actor_id uuid,
  policy_version text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index safety_audit_log_member_idx on safety_audit_log (member_id, created_at desc);
create index safety_audit_log_review_idx on safety_audit_log (review_id, created_at desc);

-- ============================================================
-- RLS
-- ============================================================
alter table safety_message_templates enable row level security;
alter table safety_classifications enable row level security;
alter table safety_acknowledgments enable row level security;
alter table safety_review_queue enable row level security;
alter table safety_audit_log enable row level security;

-- safety_message_templates: harmless approved copy — any authenticated
-- user may read it (same pattern as ai_agents/ai_rules), only
-- platform_administrator may author/change it.
create policy authenticated_read_message_templates on safety_message_templates
  for select
  using (auth.role() = 'authenticated');

create policy platform_admin_all_message_templates on safety_message_templates
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- safety_classifications: written by the safety service running as the
-- same session that triggered it (a member's check-in, a coach's note) —
-- append-only, no update policy.
create policy member_insert_own_classifications on safety_classifications
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_classifications on safety_classifications
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_read_own_classifications on safety_classifications
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_classifications on safety_classifications
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_classifications on safety_classifications
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- safety_acknowledgments: only the member themselves ever records their
-- own acknowledgment (clicking "I understand"). Only ever created in
-- 'pending' status — member_update_own_acknowledgments is the only way to
-- move it to acknowledged/dismissed, enforced in application code
-- (lib/safety/), same trust boundary as every other update policy in this
-- schema that doesn't restrict individual columns. The insert may run on
-- either the member's own session (a check-in's free text) or an assigned
-- coach's session (evaluateConcern() invoked from a coach-triggered event,
-- e.g. via the AI dispatcher's safety guard) — the acknowledgment record
-- itself always represents "pending, waiting on the member," regardless
-- of which session created it.
create policy member_insert_own_acknowledgments on safety_acknowledgments
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_acknowledgments on safety_acknowledgments
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_update_own_acknowledgments on safety_acknowledgments
  for update
  using (member_id = auth.uid());

create policy member_read_own_acknowledgments on safety_acknowledgments
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_acknowledgments on safety_acknowledgments
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_acknowledgments on safety_acknowledgments
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- safety_review_queue: coach-internal working data. A member's own
-- classification/acknowledgment rows already tell them what they were
-- shown; the raw review queue (coach notes, resolution) is intentionally
-- not member-readable.
create policy member_insert_own_review_queue on safety_review_queue
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_review_queue on safety_review_queue
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_read_assigned_review_queue on safety_review_queue
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- A coach may review/update a case for their own assigned client
-- (status, notes, resolution, assigned_coach_id) — nothing about this
-- policy allows changing what classification a case is tied to.
create policy coach_update_assigned_review_queue on safety_review_queue
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_review_queue on safety_review_queue
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- safety_audit_log: append-only. A member may read their own history
-- (transparency into what happened around their own safety events);
-- coach-only deliberation lives in safety_review_queue.coach_notes, not
-- here.
create policy member_insert_own_audit_log on safety_audit_log
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_audit_log on safety_audit_log
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_read_own_audit_log on safety_audit_log
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_audit_log on safety_audit_log
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_audit_log on safety_audit_log
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
