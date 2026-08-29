-- The Weekly Reflection — one table, for a program-tier member's own words
-- about her week.
--
-- WHAT IT IS. Every Friday through Sunday night, a member on the 24 week
-- program tier is offered one experience: Root reads her week back to her
-- (Part 1, generated, no input), she answers five fixed questions in her
-- own words (Part 2), and she is told her coach will read it with her
-- (Part 3). Her coach sees the identical recap alongside her five answers
-- in the Friday review.
--
-- WHO SEES IT is decided by member_subscriptions.tier alone (migration
-- 159, read through the member_access_facts view). There is no second
-- lock: no assignment, no grant column, no visibility rule. A member on
-- trial, monthly, annual or none never receives it, and the tier is the
-- whole of the reason why.
--
-- WHICH WEEK. week_start is the member's OWN local FRIDAY, computed from
-- her stored profile timezone by lib/weekly-reflection/week.ts. The
-- unique constraint on (member_id, week_start) IS the once-per-week rule:
-- there is no schedule table and no second delivery system. Saturday and
-- Sunday resolve to the same Friday, which is what makes the three day
-- window one week's reflection rather than three.
--
-- WHAT THIS TABLE STORES THAT migration 151 DELIBERATELY DID NOT.
-- Free text, in the member's own words. That is a real departure from the
-- Weekly Root Review's "a row stores a plan, never prose" rule, and it is
-- deliberate: the whole point of this feature is that a coach reads what
-- she actually wrote. So the answers column holds her sentences.
--
-- The recap column, by contrast, keeps migration 151's discipline exactly.
-- It stores DESCRIPTORS, never sentences: which already-classified signal
-- (member_pattern_states, migrations 93/105), at which language tier, in
-- which state, with which counts. lib/weekly-reflection/recap.ts renders
-- the words from those descriptors at read time through the SAME
-- three-tier language module the rest of the app uses
-- (lib/longitudinal-intelligence/copy.ts), so the member and her coach
-- read one identical recap without a single generated sentence being
-- persisted, and a later wording fix reaches every past week at once.

create table member_weekly_reflections (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- The member's own local Friday, YYYY-MM-DD.
  week_start date not null,

  -- Which version of the five spine questions these answers belong to.
  -- The five questions are identical every week ON PURPOSE, so that week
  -- against week is a real comparison. If they are ever changed, this is
  -- what keeps the old answers readable as answers to the old questions
  -- rather than silently re-labelled as answers to the new ones. See
  -- lib/weekly-reflection/questions.ts.
  questions_version integer not null default 1,

  -- Part 1, as descriptors. { checkinCount, from, to, signals: [{ signalKey,
  -- signalLabel, state, tier, occurrenceCount, confidence }] }. Slugs and
  -- numbers only, enforced on the way in AND on the way out by
  -- lib/weekly-reflection/recap.ts's sanitizer, the same drop-do-not-throw
  -- discipline lib/weekly-review/plan.ts uses.
  recap jsonb not null default '{}'::jsonb,

  -- Part 2. { week_overall: 1..5, what_helped: text, what_got_in_the_way:
  -- text, body_response: text, next_week_change: text }. Her own words,
  -- stored as written.
  answers jsonb not null default '{}'::jsonb,

  -- A row exists only once she has finished, so this is never null in
  -- practice. It is nullable anyway so that a later build can add a
  -- resumable draft without a schema change, and so nothing here has to
  -- pretend a partial answer set is a completed reflection.
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (member_id, week_start)
);

create index member_weekly_reflections_member_week_idx
  on member_weekly_reflections (member_id, week_start desc);

alter table member_weekly_reflections enable row level security;

create policy member_read_own_weekly_reflections on member_weekly_reflections
  for select using (member_id = auth.uid());

create policy member_insert_own_weekly_reflections on member_weekly_reflections
  for insert with check (member_id = auth.uid());

create policy member_update_own_weekly_reflections on member_weekly_reflections
  for update using (member_id = auth.uid());

-- Same narrow test-account escape hatch migration 151 gives the Weekly
-- Root Review, and for the same reason: a verification pass has to be able
-- to see the experience arrive more than once in a week. Restricted to
-- seeded test accounts in the database itself, not only at the call site.
create policy test_member_delete_own_weekly_reflections on member_weekly_reflections
  for delete using (
    member_id = auth.uid()
    and exists (
      select 1 from profiles p where p.id = auth.uid() and p.is_test = true
    )
  );

create policy coach_read_assigned_weekly_reflections on member_weekly_reflections
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_weekly_reflections on member_weekly_reflections
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
