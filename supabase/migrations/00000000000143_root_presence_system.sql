-- Root Presence System (Prompt 4). Two small new tracking tables, plus a
-- data-only content fix to two dormant guilt-adjacent ai_rules rows.
--
-- Both new tables follow member_root_popup_dismissals's own shape
-- (migration 137): member_id references auth.users, RLS scopes every
-- policy to member_id = auth.uid(), platform_administrator gets a
-- read-all escape hatch. Neither table is written by any engine — both
-- are written only by this prompt's presentation layer, never by the
-- correlation/trend/driver engines themselves.

-- member_discovery_moments: marks a correlation finding (member_pattern_states,
-- signal_kind = 'correlation_finding') as having been presented to the
-- member as a one-time "I noticed something" discovery moment. Keyed by
-- the finding's own pairKey-derived signal_key, not a foreign key, since
-- member_pattern_states rows are recomputed/upserted in place rather than
-- versioned. Once a signal_key is in this table, the same finding renders
-- as an ordinary Case View list item forever after, never as a discovery
-- again.
create table member_discovery_moments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  signal_key text not null,

  surfaced_at timestamptz not null default now(),

  unique (member_id, signal_key)
);

create index member_discovery_moments_member_idx on member_discovery_moments (member_id);

alter table member_discovery_moments enable row level security;

create policy member_read_own_discovery_moments on member_discovery_moments
  for select
  using (member_id = auth.uid());

create policy member_insert_own_discovery_moments on member_discovery_moments
  for insert
  with check (member_id = auth.uid());

create policy platform_admin_all_discovery_moments on member_discovery_moments
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- member_return_greetings: marks that Root's one-time "I'm glad you're
-- back" line has already been shown for a specific gap episode. Keyed on
-- gap_start_local_date (the member's last real check-in date before the
-- gap that triggered the greeting), not a serial id, so the same gap
-- episode can never show the greeting twice, while a later, genuinely new
-- gap (a different gap_start_local_date) earns its own fresh greeting.
create table member_return_greetings (
  member_id uuid not null references auth.users(id) on delete cascade,
  gap_start_local_date date not null,

  shown_at timestamptz not null default now(),

  primary key (member_id, gap_start_local_date)
);

alter table member_return_greetings enable row level security;

create policy member_read_own_return_greetings on member_return_greetings
  for select
  using (member_id = auth.uid());

create policy member_insert_own_return_greetings on member_return_greetings
  for insert
  with check (member_id = auth.uid());

create policy platform_admin_all_return_greetings on member_return_greetings
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- Data-only content fix: two ai_rules rows seeded by migration 053
-- (missed_checkin_scheduled_nudge, member_inactive_reengagement) carry
-- guilt-adjacent, third-person copy ("keeps things on track", "We have
-- missed you"). Confirmed these rows are persisted but never actually
-- reach any member-facing surface today (their outputs only populate
-- ai_recommendations/ai_actions, which nothing member-facing currently
-- reads) — still worth fixing at the source per the Bible's no-guilt rule
-- (§7), so a future notification surface reading this table inherits
-- correct copy rather than a latent guilt-language bug. No schema change,
-- no behavior change, no threshold change — title/descriptionTemplate
-- text only, inside the existing produces jsonb column.
update ai_rules
set produces = jsonb_set(
  jsonb_set(produces, '{title}', '"A quick check-in today"'),
  '{descriptionTemplate}',
  '"I noticed it has been {{daysSinceLastCheckin}} days since your last check-in. No pressure, today is a good day if you have a moment."'
)
where rule_key = 'missed_checkin_scheduled_nudge';

update ai_rules
set produces = jsonb_set(
  jsonb_set(produces, '{title}', '"I am glad you are back"'),
  '{descriptionTemplate}',
  '"It has been {{daysSinceLastCheckin}} days. Whenever you are ready, I am right here."'
)
where rule_key = 'member_inactive_reengagement';
