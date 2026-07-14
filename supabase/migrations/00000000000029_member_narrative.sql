-- Member Health Narrative.
--
-- A structured, evolving understanding of each member — not a raw
-- timeline of records. One table, narrative_items, where every row is a
-- single claim ("stress tends to rise when sleep falls below 6 hours")
-- that always traces back to real evidence (source_refs) and carries its
-- own provenance/confidence, so coaching can reference it honestly
-- ("tends to," never "always" or "we know").
--
-- Update model: an item is never edited in place once created — a new
-- fact supersedes an old one (supersedes_id / superseded_by_id), and the
-- old row's status flips to 'outdated'. This is itself the audit trail
-- (who claimed what, when, and what replaced it) without a second table,
-- the same "prepare architecture, don't overbuild" judgment call this
-- codebase has made before (see migration 27's ai_history staying
-- intentionally empty until a UI writes to it).
--
-- RLS follows the established pattern: a member reads their own
-- member-visible rows; an assigned coach reads everything (including
-- coach-only observations); only a coach may correct, pin, or mark an
-- item outdated (members never directly edit their own narrative — the
-- narrative update service and coach corrections are the only writers).

create table narrative_items (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in (
    'current_goals',
    'primary_priorities',
    'four_doctors_balance',
    'recurring_patterns',
    'recent_changes',
    'life_events',
    'barriers_to_adherence',
    'successful_interventions',
    'unsuccessful_interventions',
    'coaching_preferences',
    'learning_preferences',
    'motivation_patterns',
    'member_reported_context',
    'coach_verified_observations',
    'unresolved_concerns',
    'active_restrictions',
    'recent_wins',
    'progress_trends'
  )),
  title text not null,
  -- The coaching-safe narrative statement itself — correlation-worded,
  -- never a fabricated causal claim. See lib/narrative/generator.ts.
  summary text not null,
  provenance text not null check (provenance in (
    'member_reported', 'coach_entered', 'system_observed', 'inferred', 'confirmed_recurring'
  )),
  -- 0-1, null when provenance doesn't warrant a numeric confidence (e.g.
  -- a directly member-reported or coach-entered fact is either present or
  -- not — confidence is most meaningful for 'inferred'/'system_observed').
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'active' check (status in ('active', 'historical', 'outdated', 'resolved')),
  is_pinned boolean not null default false,
  pinned_by uuid references auth.users(id) on delete set null,
  pinned_at timestamptz,
  -- Coach-authored items a coach has explicitly protected from being
  -- silently superseded by the automated narrative update service —
  -- lib/narrative/service.ts checks this before ever superseding a row.
  coach_protected boolean not null default false,
  -- False for coach-only observations never meant to reach the member
  -- (e.g. a sensitive clinical note) — default true because most of the
  -- narrative IS meant to safely inform coaching the member also
  -- experiences, per the milestone's "safe subset" requirement.
  member_visible boolean not null default true,
  -- Array of { type, id, note? } evidence pointers (check-in ids,
  -- submission ids, ai_insight ids, coach_note ids, safety_classification
  -- ids, ...) — every narrative claim must link back to what caused it.
  source_refs jsonb not null default '[]'::jsonb,
  supersedes_id uuid references narrative_items(id) on delete set null,
  superseded_by_id uuid references narrative_items(id) on delete set null,
  created_by_actor_type text not null check (created_by_actor_type in ('member', 'coach', 'system')),
  created_by_actor_id uuid,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index narrative_items_member_category_idx on narrative_items (member_id, category, status);
create index narrative_items_member_active_idx on narrative_items (member_id) where status = 'active';
create index narrative_items_pinned_idx on narrative_items (member_id) where is_pinned;
create index narrative_items_supersedes_idx on narrative_items (supersedes_id);

alter table narrative_items enable row level security;

-- A member sees only their own member-visible, non-superseded-into-void
-- rows (status filtering, e.g. hiding 'outdated', is an application-layer
-- query concern, not an RLS concern — outdated items are still real
-- history a member may reasonably want to see).
create policy member_read_own_narrative on narrative_items
  for select
  using (member_id = auth.uid() and member_visible);

-- An assigned coach sees everything about their client, including
-- coach-only observations never shown to the member.
create policy coach_read_assigned_narrative on narrative_items
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- The narrative update service runs on whichever session triggered the
-- underlying event — a member's own session (a check-in) or an assigned
-- coach's session (a coach note/correction) — same dual-actor pattern as
-- every other AI/safety table in this schema.
create policy member_insert_own_narrative on narrative_items
  for insert
  with check (member_id = auth.uid() and created_by_actor_type in ('member', 'system'));

create policy coach_insert_assigned_narrative on narrative_items
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- The narrative update service needs to flip an old row's status to
-- 'outdated' and set superseded_by_id when a new fact replaces it — and
-- per the dispatcher pattern, that runs on whichever session (member's or
-- coach's) triggered the underlying event, not a separate privileged
-- writer. This does NOT let a member author new interpretations of their
-- own history — the service only ever performs that one mechanical
-- transition, never edits title/summary/category. Members never pin,
-- protect, or correct — that stays coach-only, enforced in application
-- code (lib/narrative/), same trust boundary as every other RLS update
-- policy in this schema that doesn't restrict individual columns.
create policy member_update_own_narrative on narrative_items
  for update
  using (member_id = auth.uid());

-- A coach corrects, pins, protects, or marks an item outdated for their
-- assigned client — the actual human-in-the-loop edit surface Milestone
-- 2's "Human coach controls" describes.
create policy coach_update_assigned_narrative on narrative_items
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_narrative on narrative_items
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
