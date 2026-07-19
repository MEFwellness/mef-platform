-- Coaching Intelligence Engine — the cross-feature layer that recognizes
-- patterns across Daily Check-ins, Food Lens, the Primal Pattern
-- Assessment, Progress history (root_score_snapshots), and Questionnaires
-- (wellness_assessments), and turns them into evidence-backed,
-- member-facing coaching statements. Does not replace or recompute any of
-- those subsystems' own data — it only reads them (plus, for nutrition
-- observations, food_lens_pattern_comparisons and registry_entries) and
-- writes a small, versioned, evidence-tagged output row per statement it
-- was able to responsibly generate.
--
-- coaching_insights — one row per generated coaching statement, batched
-- once per member per local_date (idempotent, same "generate lazily on
-- first page load that day, or a cron pre-warms it" posture as
-- coach_morning_briefs, migration 53). Unlike that table, more than one
-- row can exist per (member, local_date): up to one per `category`
-- (Today's Insight / Recent Pattern / Weekly Observation / Things Worth
-- Watching / Small Wins), because each category is independently
-- evidence-gated — a category with insufficient evidence that day simply
-- has no row, never a fabricated placeholder. The unique constraint below
-- enforces "at most one statement per category per member per day," not
-- "exactly one."
--
-- Every row is a permanent snapshot of what was actually generated that
-- day from the evidence available at generation time — never recomputed
-- retroactively, so a member's insight from last week reads exactly as it
-- did that day even if later data would change the read.
create table coaching_insights (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,

  category text not null check (category in (
    'todays_insight', 'recent_pattern', 'weekly_observation', 'watch', 'small_win'
  )),

  -- Never skip directly to a higher level without the evidence a lower
  -- level would require — enforced in application code
  -- (lib/coaching-insights/levels.ts), this column just records which
  -- level the generator actually satisfied.
  level smallint not null check (level between 1 and 4),

  statement text not null,
  -- Plain-language answer to "Why am I seeing this?" — never references a
  -- table, column, or internal code name; written the same way the
  -- statement itself is.
  explanation text not null,

  -- Which real, currently-available sources fed this statement. Reserved
  -- future values (sleep, stress, blood_work, wearable,
  -- movement_assessment) are valid application-level source ids
  -- (lib/coaching-insights/types.ts) but this check constraint only needs
  -- to accept whatever a real producer can write today — the same
  -- additive-extension convention as registry_entries.domain,
  -- ai_events.event_type, and every other producer-driven enum in this
  -- schema. Stored as text[] rather than a join table since a statement's
  -- source list is fixed at generation time and never queried across
  -- members by source.
  data_sources text[] not null check (array_length(data_sources, 1) > 0),

  date_range_start date not null,
  date_range_end date not null,
  observation_count int not null check (observation_count > 0),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),

  -- {type, id, note?} — same evidence-pointer shape every other engine in
  -- this codebase already uses (registry_entries.evidence_refs,
  -- coach_morning_briefs.evidence_refs, wellness_insights).
  evidence_refs jsonb not null default '[]'::jsonb,

  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  unique (member_id, local_date, category)
);

create index coaching_insights_member_date_idx
  on coaching_insights (member_id, local_date desc);

alter table coaching_insights enable row level security;

create policy member_read_own_coaching_insights on coaching_insights
  for select
  using (member_id = auth.uid());

-- Needed for the on-demand (lazy) generation path, which runs under the
-- member's own session the first time they open Coaching Insights on a
-- new local_date — same reason migration 46 added
-- member_insert_own_notifications and migration 53 added
-- member_insert_own_morning_briefs for their own member-session write
-- paths.
create policy member_insert_own_coaching_insights on coaching_insights
  for insert
  with check (member_id = auth.uid());

create policy coach_read_assigned_coaching_insights on coaching_insights
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_coaching_insights on coaching_insights
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
