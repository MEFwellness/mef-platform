-- The gate, and the rows the old gate left behind.
--
-- Four unrelated-looking repairs that are all the same mistake: something
-- other than the member's plan was deciding what she could open, and
-- something other than a button she pressed was writing rows on her
-- account.
--
--   1. Pending "reassessments" of questionnaires nobody has ever taken.
--      The daily coaching scan mapped a worsening finding in a DOMAIN onto
--      an assessment key without ever checking whether that assessment was
--      assessed, and the access gate then honoured the resulting schedule
--      row as proof of history. Four of the six pending rows on production
--      were for something the member had never completed, across three
--      accounts, one of them a real (non-test) tester. One of the four
--      unlocked the camera Body Assessment.
--   2. Two rows a read-only page load created during the 2026-08-27 bug
--      sweep: an empty 91-question draft, and the router-decision row the
--      same render logged.
--   3. The standing live test member is not flagged as a test account, so
--      every verification run lands in the funnel, the engagement report
--      and the coach's caseload as a real member.
--   4. member_daily_priorities cannot yet record whether Root decided the
--      day's priority before or after her Daily Reset, which is what the
--      one allowed revision needs to know.
--
-- Every statement below is guarded and idempotent: re-running finds
-- nothing left to do. The two SELECTs at the top are a dry run and change
-- nothing; read their notices before trusting the deletes underneath them.

-- ---------------------------------------------------------------------
-- DRY RUN. Nothing here writes. Read it, then read the deletes.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  v_count integer := 0;
begin
  raise notice '--- pending reassessment schedules with NO completed attempt (will be deleted) ---';
  for r in
    select rs.id,
           left(rs.member_id::text, 8) as member,
           ad.key as assessment,
           rs.stage,
           rs.due_at::date as due
    from public.reassessment_schedules rs
    join public.assessment_definitions ad on ad.id = rs.assessment_definition_id
    where rs.status = 'pending'
      and not exists (
        select 1
        from public.assessment_attempts aa
        where aa.member_id = rs.member_id
          and aa.assessment_definition_id = rs.assessment_definition_id
          and aa.status = 'completed'
      )
    order by ad.key
  loop
    v_count := v_count + 1;
    raise notice '  member % / % / stage % / due %', r.member, r.assessment, r.stage, r.due;
  end loop;
  raise notice '  total to delete: %', v_count;

  v_count := 0;
  raise notice '--- pending reassessment schedules WITH a completed attempt (left alone) ---';
  for r in
    select rs.id,
           left(rs.member_id::text, 8) as member,
           ad.key as assessment,
           rs.stage
    from public.reassessment_schedules rs
    join public.assessment_definitions ad on ad.id = rs.assessment_definition_id
    where rs.status = 'pending'
      and exists (
        select 1
        from public.assessment_attempts aa
        where aa.member_id = rs.member_id
          and aa.assessment_definition_id = rs.assessment_definition_id
          and aa.status = 'completed'
      )
    order by ad.key
  loop
    v_count := v_count + 1;
    raise notice '  member % / % / stage %', r.member, r.assessment, r.stage;
  end loop;
  raise notice '  total kept: %', v_count;
end $$;

-- ---------------------------------------------------------------------
-- 1. Retire the phantom reassessments.
--
-- Deletes ONLY a row that is all three of: still pending, and for a
-- (member, assessment) pair with no completed attempt at all. A real
-- overdue reassessment of something she genuinely finished is untouched,
-- and so is any row already acted on (status other than 'pending').
--
-- The code fix is in two places and either one alone would close this:
-- lib/reassessment-intelligence/ no longer proposes or writes one, and
-- lib/assessment-registry/status.ts no longer treats a schedule row as
-- permission to open anything. This clears what is already stored.
-- ---------------------------------------------------------------------
do $$
declare
  v_deleted integer;
begin
  delete from public.reassessment_schedules rs
  where rs.status = 'pending'
    and not exists (
      select 1
      from public.assessment_attempts aa
      where aa.member_id = rs.member_id
        and aa.assessment_definition_id = rs.assessment_definition_id
        and aa.status = 'completed'
    );
  get diagnostics v_deleted = row_count;
  raise notice 'Retired % phantom reassessment schedule(s).', v_deleted;
end $$;

-- ---------------------------------------------------------------------
-- 2. The two rows the 2026-08-27 sweep's own page load created.
--
-- Both are recorded in docs/BUG_SWEEP_2026-08-27.md under "State this
-- sweep left on production". The draft is matched by id AND by every fact
-- that makes it safe to delete (still in progress, zero answers), so if
-- somebody has since answered a question in it, this finds nothing and
-- leaves it alone.
-- ---------------------------------------------------------------------
do $$
declare
  v_deleted integer;
begin
  delete from public.wellness_assessments w
  where w.id = 'd83a451a-a9cf-4c0b-a359-7880943436a5'
    and w.status = 'in_progress'
    and not exists (
      select 1 from public.wellness_assessment_answers a where a.assessment_id = w.id
    );
  get diagnostics v_deleted = row_count;
  raise notice 'Removed % empty draft(s) created by a page render.', v_deleted;

  delete from public.investigation_router_decisions
  where id = '592961c5-d5dc-4eb5-ad61-c1012d4c2be0';
  get diagnostics v_deleted = row_count;
  raise notice 'Removed % router-decision row(s) logged by that same render.', v_deleted;
end $$;

-- ---------------------------------------------------------------------
-- 3. The standing live test member is a test member.
--
-- Matched by email rather than by id so it is readable, and scoped to
-- exactly that one address. Every analytics query in the app already
-- filters on profiles.is_test (admin analytics gates on p_include_test
-- defaulting to false, and the coach client list has its own filter), so
-- this is the whole change: nothing else needs to learn about her.
--
-- The cost, recorded honestly: the live verification runs that use this
-- account no longer exercise the analytics write paths end to end,
-- because those paths now correctly skip her.
-- ---------------------------------------------------------------------
do $$
declare
  v_updated integer;
begin
  update public.profiles p
  set is_test = true
  from auth.users u
  where u.id = p.id
    and u.email = '8weeks2fab@gmail.com'
    and p.is_test is distinct from true;
  get diagnostics v_updated = row_count;
  raise notice 'Flagged % account(s) as a test account.', v_updated;
end $$;

-- ---------------------------------------------------------------------
-- 4. The day's priority can wait for the Daily Reset.
--
-- The Priority Card is shown the moment she opens Home, which for most
-- members is before the check-in. Root then decided her whole day without
-- today's answers in front of it and had no way to revisit that once she
-- had answered. These two columns are what lets it revise exactly once:
-- `decided_before_checkin` records the condition, `redecided_at` makes the
-- revision single rather than a loop.
--
-- Both are additive and nullable-or-defaulted, so a deploy that lands
-- before this migration keeps working: the app reads them defensively.
-- ---------------------------------------------------------------------
alter table public.member_daily_priorities
  add column if not exists decided_before_checkin boolean not null default false,
  add column if not exists redecided_at timestamptz;

comment on column public.member_daily_priorities.decided_before_checkin is
  'True when Root decided this day''s priority before the member''s Daily
   Reset existed. The one condition under which the decision may be revised,
   and only once. See lib/priority/data.ts''s redecideDailyPriority.';

comment on column public.member_daily_priorities.redecided_at is
  'When that single revision happened. Non-null means no further revision is
   allowed today, which is what keeps "one priority per day" true while
   still letting the check-in be seen.';
