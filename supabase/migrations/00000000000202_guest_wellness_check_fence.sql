-- The Quick Wellness Check's answers, fenced.
--
-- WHAT WAS WRONG. /wellness-check asks a signed-out stranger seven
-- questions about energy, stress, sleep, digestion, movement, pain and
-- mood, and kept the answers in that browser's localStorage. Then, on the
-- first page load after she created an account, app/GuestPreviewMigrator.tsx
-- copied them into a real `daily_checkins` row through the ordinary member
-- check-in action. Nothing recorded that they had come from a stranger with
-- no account, no consent flow and no clinical review. From that moment on
-- they were indistinguishable from a Daily Reset she had sat down and
-- completed, and every honesty threshold that counts check-ins ("checked in
-- on 3 days in the last 21 days") counted a day she had never checked in.
--
-- Migration 197 had already settled the correct treatment for exactly this
-- situation on the /energy public entry: public answers live in their own
-- table, their provenance is a check constraint rather than a convention,
-- and no code path exists that carries one into member data. This migration
-- gives the Quick Wellness Check the same fence. Its tables are separate
-- from /energy's on purpose: `public_entry_sessions` is the arrival table
-- the acquisition funnel and the /admin/acquisition report count, and
-- pouring a second experience into it would silently change every number on
-- a report that means one specific thing. Same discipline, own tables.
--
-- WHAT THIS BUILD DELIBERATELY DOES NOT ADD. There is no promotion path. A
-- guest's answers are preserved and bound to her account, and nothing
-- anywhere turns them into a check-in, an assessment or a score. If Root is
-- ever to use them it will be because she was shown them and said yes, the
-- way the /energy concern confirmation on the onboarding form already works.
-- Until that exists, preserved-and-fenced is the whole behaviour.

-- ---------------------------------------------------------------------
-- Sessions: one anonymous visitor, one run through the wellness check
-- ---------------------------------------------------------------------

create table guest_wellness_check_sessions (
  id uuid primary key default gen_random_uuid(),

  -- Opaque random token the browser keeps in localStorage, so a guest can
  -- refresh mid-quiz and be recognised afterwards as the person who took
  -- it. Never derived from an IP, a fingerprint or an auth.users id. It
  -- identifies a browser, and a browser is not a person. Same shape and
  -- same reasoning as public_entry_sessions.visitor_token (migration 197).
  visitor_token text not null unique,

  started_at timestamptz,
  completed_at timestamptz,

  -- The account this browser turned out to belong to, written once by the
  -- claim route after the member's own session has authorised it. Nullable
  -- forever: most guests never create an account, and their answers stay
  -- exactly where they are. Unique, so one arrival can back at most one
  -- account and a second browser cannot re-point an existing bind.
  claimed_by uuid unique references auth.users(id) on delete set null,
  claimed_at timestamptz,

  -- THE PROVENANCE, AS A CONSTRAINT RATHER THAN A CONVENTION. Neither
  -- column can hold any other value, in any row, ever, including through a
  -- later update. A row in this table is by the database's own definition a
  -- preliminary answer given before there was an account. Root may say
  -- "this is what you told us before you signed up". Nothing anywhere may
  -- say "this is your check-in".
  origin text not null default 'guest_wellness_check' check (origin = 'guest_wellness_check'),
  preliminary boolean not null default true check (preliminary = true),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A claim is both halves or neither. Without this, a row could name a
  -- member with no time, or a time with no member, and "when did she claim
  -- it" would have two different answers depending on which column you read.
  constraint guest_wellness_check_claim_is_whole
    check ((claimed_by is null) = (claimed_at is null))
);

create index guest_wellness_check_sessions_claimed_idx
  on guest_wellness_check_sessions (claimed_by) where claimed_by is not null;

comment on table guest_wellness_check_sessions is
  'One anonymous run through the Quick Wellness Check at /wellness-check.
   visitor_token is a browser-held random token, never a fingerprint.
   Answers live in guest_wellness_check_answers and are preliminary
   pre-account impressions, never check-in or assessment data. origin and
   preliminary are check-constrained to single values so this can never be
   restated as something the member completed inside the app.';

-- ---------------------------------------------------------------------
-- Answers: the preliminary pre-account impression, and nothing else
-- ---------------------------------------------------------------------

create table guest_wellness_check_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references guest_wellness_check_sessions(id) on delete cascade,

  -- A key from lib/guest-preview/questions.ts and a value from that
  -- question's own fixed option list, both stored as short slugs. A numeric
  -- answer is stored as its own digits ('4'), not as a number, so this
  -- table can never be joined to a scoring column by accident and nothing
  -- can average it without first deciding, in code somebody has to write,
  -- that it means a level. There is deliberately no free-text answer
  -- anywhere in this experience, so a stranger cannot type a health
  -- disclosure into a table with no session, no member and no review
  -- behind it.
  question_key text not null check (question_key ~ '^[a-z0-9_]{1,40}$'),
  answer_value text not null check (answer_value ~ '^[a-z0-9_]{1,40}$'),

  answered_at timestamptz not null default now(),
  unique (session_id, question_key)
);

comment on table guest_wellness_check_answers is
  'PRELIMINARY PRE-ACCOUNT ANSWERS from the Quick Wellness Check. Given by
   an anonymous visitor with no account, no consent flow and no clinical
   review. Never a check-in, never an assessment, never a prerequisite,
   never an input to any scoring engine. Nothing in this codebase copies a
   row from here into daily_checkins, onboarding_answers,
   unified_assessment_answers or member_wellness_events, and
   tests/public-entry-provenance.test.ts fails the build if that changes.';

-- ---------------------------------------------------------------------
-- RLS: no public policy anywhere, exactly like the public entry tables
-- ---------------------------------------------------------------------

alter table guest_wellness_check_sessions enable row level security;
alter table guest_wellness_check_answers enable row level security;

-- The member reads the session row that turned out to be hers, because if
-- anything is ever shown back to her she is entitled to see the same thing.
-- There is deliberately NO insert, update or delete policy for anybody,
-- including her: the bind is written once by the claim route running with
-- the service role, and after that it is a fact about how she arrived, not
-- something any session can manufacture, re-point or erase. Same discipline
-- as member_public_entry_origin (migration 197) and the push delivery
-- receipt (migration 196).
create policy member_read_own_guest_wellness_check_session on guest_wellness_check_sessions
  for select using (claimed_by = auth.uid());
create policy coach_read_guest_wellness_check_sessions on guest_wellness_check_sessions
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy platform_admin_read_guest_wellness_check_sessions on guest_wellness_check_sessions
  for select using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- The answers themselves are read by staff only, matching
-- public_entry_answers. A member is not offered her own pre-account answers
-- by any screen today, and the day she is, it will be through a surface
-- that says what they are rather than through a raw table read.
create policy coach_read_guest_wellness_check_answers on guest_wellness_check_answers
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy platform_admin_read_guest_wellness_check_answers on guest_wellness_check_answers
  for select using (public.has_active_role(auth.uid(), 'platform_administrator'));
