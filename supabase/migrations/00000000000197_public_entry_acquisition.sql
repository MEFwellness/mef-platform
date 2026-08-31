-- The public entry experience, and the funnel that measures it.
--
-- WHAT THIS IS FOR. Someone who has never heard of Rooted Reset follows a
-- link a physiotherapist, a past client or a social post handed them,
-- answers nine questions about where their energy goes, and reads a real
-- result. No account, no email, no obligation. If they go on to create an
-- account, everything they told us travels with them, and it travels
-- LABELLED.
--
-- THE ONE RULE THIS SCHEMA EXISTS TO ENFORCE. A public answer is not a
-- member assessment and can never become one. Two guarantees, both
-- structural rather than conventional:
--
--   1. Public answers live in public_entry_answers and NOWHERE ELSE.
--      There is no column here that any scoring engine reads, no foreign
--      key into onboarding_answers, daily_checkins, unified_assessment_*
--      or member_wellness_events, and nothing in this migration writes to
--      any of them. A public answer physically cannot satisfy a
--      prerequisite or move a score, because no code path exists that
--      could carry it there.
--
--   2. The row that binds a member to their public session declares its
--      own provenance and cannot lie about it.
--      member_public_entry_origin.origin is checked = 'public_acquisition'
--      and .preliminary is checked = true. Those are not defaults that a
--      later update could flip; they are constraints. A row in that table
--      is, by the database's own definition, a preliminary public
--      impression. Root may say "this is what you told us when you first
--      arrived". Nothing may say "this is your assessment".
--
-- WHY THE ANONYMOUS EVENTS ARE NOT IN member_wellness_events. That table's
-- member_id is `not null references auth.users(id)`, and every row in it is
-- one member's own record, readable by that member under RLS. A visitor who
-- has not created an account has no auth.users row to reference and no
-- session to be scoped by, so an anonymous event cannot be represented
-- there at all. The split is therefore: the pre-account half of the funnel
-- lives in public_entry_events, the post-account half stays exactly where it
-- already is (member_wellness_events, migration 146), and
-- member_public_entry_origin is the join between them. One new analytics
-- event type, public_entry_claimed, is added to the EXISTING pipeline at the
-- bottom of this file so the post-account half needs no new machinery.
--
-- WHY SOURCES ARE A TABLE AND NOT A STRING. The goal is 100 real people,
-- and the question that matters is which individual partner sent them, not
-- which channel. A registered code carries a human label and a channel and
-- an is_test flag; an unregistered code (a mistyped link, a code someone
-- invented) is still recorded verbatim in source_raw so nothing is lost,
-- but it resolves to no source row and is reported separately rather than
-- being silently folded into "direct".
--
-- WRITES. Every table here has RLS on and NO public policy at all, exactly
-- like the lead capture tables (migration 123). An anonymous visitor has no
-- session, so the only writer is the app's own route handler running with
-- the service role, gated by its own origin check and rate limit. Coaches
-- and platform administrators read.

-- ---------------------------------------------------------------------
-- Sources
-- ---------------------------------------------------------------------

create table public_entry_sources (
  -- The code that appears in the link: /energy/dr-okafor or
  -- /energy?ref=dr-okafor. Lowercase, url-safe, stable forever once handed
  -- out, because a printed QR code cannot be edited.
  code text primary key check (code ~ '^[a-z0-9][a-z0-9-]{0,39}$'),

  -- What a human calls this source on a report. "Dr Okafor, Ridgeway
  -- Physio", not "partner 3".
  label text not null,

  channel text not null check (channel in (
    'partner',    -- a referring practitioner or business
    'client',     -- a current or past client sharing it
    'network',    -- personal network
    'social',     -- a social post or profile link
    'corporate',  -- a corporate wellness contact
    'direct',     -- no code on the link at all
    'qa'          -- our own testing
  )),

  -- Our own traffic. Excluded from every real funnel number by the view
  -- below, the same way profiles.is_test already works for members.
  is_test boolean not null default false,

  -- A retired partner keeps their code (old links and printed QR codes
  -- keep resolving and keep being attributed correctly) but stops being
  -- offered as a new one.
  active boolean not null default true,

  notes text,
  created_at timestamptz not null default now()
);

comment on table public_entry_sources is
  'Registered acquisition source codes for the public entry experience. One
   row per individual referral partner, not per channel: the whole point is
   telling two partners apart. A code is permanent once handed out because
   printed links and QR codes cannot be edited.';

-- ---------------------------------------------------------------------
-- Sessions: one anonymous visitor, one arrival
-- ---------------------------------------------------------------------

create table public_entry_sessions (
  id uuid primary key default gen_random_uuid(),

  -- Opaque random token the browser keeps in localStorage so a visitor can
  -- refresh, close the tab and come back, and later be recognised at
  -- signup. Never derived from an IP, a fingerprint or an auth.users id,
  -- and it identifies a browser rather than a person.
  visitor_token text not null unique,

  experience_key text not null check (experience_key in ('energy_map')),

  -- Resolved code, null when the link carried none or carried one we do
  -- not know. source_raw is what the link actually said, always, so an
  -- unregistered code is investigable instead of lost.
  source_code text references public_entry_sources(code),
  source_raw text,

  -- Where they landed and who sent them. referrer_host is the HOST ONLY,
  -- never a full referring URL: the host answers "which platform" without
  -- storing the page someone was reading before they arrived.
  landing_path text,
  referrer_host text,

  first_seen_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,

  -- The observational pattern their answers resolved to. Same vocabulary
  -- the lead capture agent already uses (migration 123), deliberately, so
  -- a lead from the widget and a lead from this experience read the same
  -- way on a coach's screen.
  pattern_key text check (pattern_key in (
    'recovery_deficit',
    'compensation_pattern',
    'overload_pattern',
    'fuel_timing_pattern',
    'depletion_pattern',
    'wind_down_deficit',
    'rhythm_disruption',
    'stress_loading_pattern'
  )),

  -- The optional email step, which happens only after the whole free
  -- result is already on screen.
  lead_email text,
  lead_captured_at timestamptz,
  captured_lead_id uuid references captured_leads(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index public_entry_sessions_source_idx on public_entry_sessions (source_code, first_seen_at desc);
create index public_entry_sessions_completed_idx on public_entry_sessions (completed_at desc) where completed_at is not null;

comment on table public_entry_sessions is
  'One anonymous arrival at the public entry experience. visitor_token is a
   browser-held random token, never a fingerprint. Answers live in
   public_entry_answers and are preliminary public impressions, never
   assessment data.';

-- ---------------------------------------------------------------------
-- Answers: the preliminary public impression, and nothing else
-- ---------------------------------------------------------------------

create table public_entry_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public_entry_sessions(id) on delete cascade,

  -- A key from lib/public-entry/questions.ts and a value from that
  -- question's own fixed option list. Both are short slugs. There is
  -- deliberately no free-text answer anywhere in this experience, so a
  -- stranger cannot type a health disclosure into a table that has no
  -- session, no member and no clinical review behind it.
  question_key text not null check (question_key ~ '^[a-z0-9_]{1,40}$'),
  answer_value text not null check (answer_value ~ '^[a-z0-9_]{1,40}$'),

  answered_at timestamptz not null default now(),
  unique (session_id, question_key)
);

comment on table public_entry_answers is
  'PRELIMINARY PUBLIC ANSWERS. Given by an anonymous visitor with no account,
   no consent flow and no clinical review. Never an assessment, never a
   prerequisite, never an input to any scoring engine. Nothing in this
   codebase copies a row from here into onboarding_answers, daily_checkins,
   unified_assessment_answers or member_wellness_events, and
   tests/public-entry-provenance.test.ts fails the build if that changes.';

-- ---------------------------------------------------------------------
-- The anonymous half of the funnel
-- ---------------------------------------------------------------------

create table public_entry_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public_entry_sessions(id) on delete cascade,

  event_type text not null check (event_type in (
    'entry_viewed',          -- the page was opened
    'experience_started',    -- the first question was reached
    'chapter_completed',     -- one of the four chapters finished
    'experience_completed',  -- the result was produced
    'result_engaged',        -- they read past the fold of their own result
    'notes_unlocked',        -- the email step was completed
    'app_clicked'            -- they clicked toward Rooted Reset
  )),

  -- A short neutral slug and nothing else: a chapter number, the name of a
  -- button. Never an answer, never an email, never prose. Same rule the
  -- product analytics payload allowlist enforces on the member side.
  detail text check (detail is null or detail ~ '^[a-z0-9_]{1,32}$'),

  occurred_at timestamptz not null default now()
);

create index public_entry_events_session_idx on public_entry_events (session_id, occurred_at);
create index public_entry_events_type_idx on public_entry_events (event_type, occurred_at desc);

-- ---------------------------------------------------------------------
-- The bind: a member, and the public arrival they came from
-- ---------------------------------------------------------------------

create table member_public_entry_origin (
  member_id uuid primary key references auth.users(id) on delete cascade,
  session_id uuid not null unique references public_entry_sessions(id) on delete cascade,

  experience_key text not null,
  source_code text references public_entry_sources(code),
  source_raw text,
  pattern_key text,

  entered_at timestamptz not null,
  claimed_at timestamptz not null default now(),

  -- THE PROVENANCE, AS A CONSTRAINT RATHER THAN A CONVENTION. Neither of
  -- these columns can hold any other value, in any row, ever, including
  -- through a later update. A row in this table is by the database's own
  -- definition a preliminary public impression. Root is allowed to say
  -- "this is what you told us when you first arrived"; nothing anywhere is
  -- allowed to say "this is your assessment".
  origin text not null default 'public_acquisition' check (origin = 'public_acquisition'),
  preliminary boolean not null default true check (preliminary = true)
);

create index member_public_entry_origin_source_idx on member_public_entry_origin (source_code);

comment on table member_public_entry_origin is
  'Binds a member to the anonymous public arrival they came from, and is the
   join between the pre-account funnel (public_entry_events) and the
   post-account one (member_wellness_events). origin and preliminary are
   check-constrained to single values on purpose: this row can never be
   restated as a completed in-app assessment.';

-- ---------------------------------------------------------------------
-- RLS: no public policy anywhere, exactly like the lead capture tables
-- ---------------------------------------------------------------------

alter table public_entry_sources enable row level security;
alter table public_entry_sessions enable row level security;
alter table public_entry_answers enable row level security;
alter table public_entry_events enable row level security;
alter table member_public_entry_origin enable row level security;

create policy coach_read_public_entry_sources on public_entry_sources
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy platform_admin_all_public_entry_sources on public_entry_sources
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_public_entry_sessions on public_entry_sessions
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy platform_admin_all_public_entry_sessions on public_entry_sessions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_public_entry_answers on public_entry_answers
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy platform_admin_all_public_entry_answers on public_entry_answers
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_public_entry_events on public_entry_events
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy platform_admin_all_public_entry_events on public_entry_events
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- The member reads her own origin row, because Root shows her what it says
-- and she is entitled to see the same thing. There is deliberately NO
-- insert, update or delete policy for anybody, including her: the bind is
-- written once by the claim route running with the service role, and after
-- that it is a fact about where she came from, not something any session
-- can manufacture, re-point or erase. Same discipline as the push delivery
-- receipt (migration 196).
create policy member_read_own_public_entry_origin on member_public_entry_origin
  for select using (member_id = auth.uid());
create policy coach_read_public_entry_origin on member_public_entry_origin
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy platform_admin_read_public_entry_origin on member_public_entry_origin
  for select using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- The read surface
-- ---------------------------------------------------------------------

-- One row per arrival, with the source resolved and is_test settled once so
-- no query has to work it out again. is_test is true when EITHER the source
-- is one of ours OR the member who later claimed it is a test account, so a
-- real visitor arriving on a QA link and a test account arriving on a real
-- link are both excluded, which is the behaviour a funnel number needs.
-- security_invoker so this view carries no privilege of its own.
create view public_entry_funnel
  with (security_invoker = true) as
  select
    s.id as session_id,
    s.experience_key,
    s.source_code,
    s.source_raw,
    coalesce(src.label, case when s.source_raw is null then 'Direct (no code)' else 'Unregistered code' end) as source_label,
    coalesce(src.channel, case when s.source_raw is null then 'direct' else 'partner' end) as source_channel,
    s.landing_path,
    s.referrer_host,
    s.first_seen_at,
    s.started_at,
    s.completed_at,
    s.pattern_key,
    s.lead_captured_at,
    o.member_id,
    o.claimed_at,
    coalesce(src.is_test, false) or coalesce(p.is_test, false) as is_test,
    (s.started_at is not null) as did_start,
    (s.completed_at is not null) as did_complete,
    (s.lead_captured_at is not null) as did_leave_email,
    exists (
      select 1 from public_entry_events e
      where e.session_id = s.id and e.event_type = 'app_clicked'
    ) as did_click_to_app,
    (o.member_id is not null) as did_create_account
  from public_entry_sessions s
  left join public_entry_sources src on src.code = s.source_code
  left join member_public_entry_origin o on o.session_id = s.id
  left join profiles p on p.id = o.member_id;

comment on view public_entry_funnel is
  'One row per public arrival with every funnel step already resolved to a
   boolean and is_test already settled. Read this, not the raw tables, and
   never omit `where is_test = false` on a number anyone will act on. See
   docs/ACQUISITION_FUNNEL.md.';

-- ---------------------------------------------------------------------
-- The post-account half: one new type on the EXISTING pipeline
-- ---------------------------------------------------------------------
--
-- Written when a member's public arrival is bound to her account. Carries
-- the source code slug and the experience key and nothing else: no answer,
-- no pattern, no email. That is enough to follow one referral partner all
-- the way from a first click through activation and return, using the
-- product_analytics_events view that already exists.

alter table member_wellness_events drop constraint member_wellness_events_event_type_check;

alter table member_wellness_events add constraint member_wellness_events_event_type_check
  check (event_type in (
    -- Wellness types (migration 63), real health content, NOT analytics.
    'morning_readiness_recorded',
    'hydration_logged',
    'movement_logged',
    'concern_flagged',
    'evening_reflection_recorded',

    -- Product analytics types (migration 146), behavioral only.
    'signup_completed',
    'session_started',
    'onboarding_started',
    'onboarding_completed',
    'surface_viewed',
    'daily_reset_started',
    'daily_reset_completed',
    'food_scan_performed',
    'food_entry_logged',
    'feature_engaged',
    'paywall_viewed',
    'membership_tier_changed',
    'purchase_completed',

    -- Priority Card (migration 147), behavioral only.
    'priority_shown',
    'priority_action',
    're_entry_shown',

    -- Adaptive Coaching Direction Part 1 (migration 150), behavioral only.
    'coaching_action_delivered',
    'coaching_action_acted',
    'coaching_action_dismissed',

    -- The Weekly Root Review, Part 2 (migration 151), behavioral only.
    'weekly_review_delivered',
    'weekly_review_viewed',
    'weekly_review_completed',
    'weekly_review_question_answered',

    -- Adaptive Coaching Direction Part 3 (migration 152), behavioral only.
    'coaching_thread_escalated',
    'coaching_escalation_resolved',
    'coaching_grades_computed',

    -- Root Movement Level 1 (migration 153), behavioral only.
    'movement_session_viewed',
    'movement_session_started',
    'movement_session_completed',
    'movement_exercise_skipped',

    -- Program lifecycle (migration 172), operational only.
    'program_started',
    'program_week_advanced',
    'program_completed',
    'program_paused',
    'program_resumed',
    'program_replaced',

    -- The member's voice inside her program (migration 177), operational.
    'exercise_weight_logged',
    'exercise_feedback_reported',
    'exercise_stopped_for_pain',
    'exercise_swapped',
    'exercise_progression_flagged',

    -- The coaching brain (migration 178), operational.
    'program_review_opened',
    'program_review_drafted',
    'exercise_feedback_resolved',
    'exercise_avoidance_released',

    -- She opened her program (this migration), operational.
    'program_opened',

    -- She arrived through a public entry link (this migration).
    'public_entry_claimed'
  ));

create or replace function public.is_product_analytics_event_type(p_event_type text)
returns boolean
language sql
immutable
as $$
  select p_event_type in (
    'signup_completed',
    'session_started',
    'onboarding_started',
    'onboarding_completed',
    'surface_viewed',
    'daily_reset_started',
    'daily_reset_completed',
    'food_scan_performed',
    'food_entry_logged',
    'feature_engaged',
    'paywall_viewed',
    'membership_tier_changed',
    'purchase_completed',
    'priority_shown',
    'priority_action',
    're_entry_shown',
    'coaching_action_delivered',
    'coaching_action_acted',
    'coaching_action_dismissed',
    'weekly_review_delivered',
    'weekly_review_viewed',
    'weekly_review_completed',
    'weekly_review_question_answered',
    'coaching_thread_escalated',
    'coaching_escalation_resolved',
    'coaching_grades_computed',
    'movement_session_viewed',
    'movement_session_started',
    'movement_session_completed',
    'movement_exercise_skipped',
    'public_entry_claimed'
  );
$$;

-- ---------------------------------------------------------------------
-- The starting set of source codes
-- ---------------------------------------------------------------------
--
-- Handed out as-is, or relabelled. The CODE is what must never change once
-- a link is printed; the LABEL is free to be edited at any time, which is
-- why the numbered partner and corporate slots exist: a code can be
-- allocated to a real person the moment they say yes, without waiting for a
-- deploy.

insert into public_entry_sources (code, label, channel, is_test, notes) values
  ('direct',      'Direct (no code)',           'direct',    false, 'Reserved. Recorded when a link carries no code at all.'),
  ('qa',          'Our own testing',            'qa',        true,  'Always excluded from real funnel numbers.'),
  ('network',     'Personal network',           'network',   false, 'General personal-network link, when no individual code applies.'),
  ('past-client', 'Past clients',               'client',    false, 'General past-client link.'),
  ('ig',          'Instagram',                  'social',    false, 'Profile link and story link.'),
  ('fb',          'Facebook',                   'social',    false, null),
  ('li',          'LinkedIn',                   'social',    false, null),
  ('yt',          'YouTube',                    'social',    false, null),
  ('newsletter',  'Email newsletter',           'social',    false, null),
  ('qr-card',     'Printed card QR',            'partner',   false, 'The QR on a physical card handed out in person.'),
  ('partner-01',  'Partner slot 1 (unassigned)','partner',   false, 'Relabel when allocated to a named referral partner.'),
  ('partner-02',  'Partner slot 2 (unassigned)','partner',   false, null),
  ('partner-03',  'Partner slot 3 (unassigned)','partner',   false, null),
  ('partner-04',  'Partner slot 4 (unassigned)','partner',   false, null),
  ('partner-05',  'Partner slot 5 (unassigned)','partner',   false, null),
  ('partner-06',  'Partner slot 6 (unassigned)','partner',   false, null),
  ('client-01',   'Client slot 1 (unassigned)', 'client',    false, 'Relabel when allocated to a named current or past client.'),
  ('client-02',   'Client slot 2 (unassigned)', 'client',    false, null),
  ('client-03',   'Client slot 3 (unassigned)', 'client',    false, null),
  ('client-04',   'Client slot 4 (unassigned)', 'client',    false, null),
  ('corp-01',     'Corporate slot 1 (unassigned)','corporate', false, 'Relabel when allocated to a named corporate wellness contact.'),
  ('corp-02',     'Corporate slot 2 (unassigned)','corporate', false, null),
  ('corp-03',     'Corporate slot 3 (unassigned)','corporate', false, null);
