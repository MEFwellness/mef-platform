-- The Breathing Pattern Check-In: sixteen questions, one five point scale,
-- one total, and a validated instrument underneath that this migration is
-- deliberately unable to change.
--
-- IT IS A NEW INSTRUMENT. It is not the MEF Body Systems Survey
-- (migrations 220 to 224), not the MEF Whole-Body Signal Assessment
-- (migrations 225 to 228), not the Health & Lifestyle Intake (migration
-- 230) and not the Stress & Load Deep-Dive (migration 190). Nothing in
-- this migration reads, writes, renames or retires any of them. They keep
-- their own tables, their own content and their own bands, and a change
-- here can never move theirs.
--
-- WHO GETS IT. A coach assignment, and nothing else. Same rule as every
-- coach assigned experience beside it: no tier lock, no visibility key, no
-- grant column and no second flag. assessment_assignments (migration 77)
-- is the ledger, which is what gives this the coach write RLS, the one
-- pending row per member partial unique index (migration 144), and the
-- trigger that closes an assignment out.
--
-- =====================================================================
-- WHY THERE IS NO CONTENT TABLE HERE, WHEN EVERY OTHER SCORED INSTRUMENT
-- IN THIS APP HAS ONE.
-- =====================================================================
--
-- A content table exists so a coach can retune a weight, a cut off or a
-- band with no deploy. That is exactly what must NOT be possible here.
-- The sixteen questions, the five response labels, their nought to four
-- point values, the sixty four point maximum and the twenty three point
-- reference figure are a published, validated instrument, and an
-- instrument whose wording or whose arithmetic can be edited from an admin
-- screen is no longer the instrument it claims to be: a score from before
-- the edit and a score from after it would sit in one history under one
-- name meaning two different things.
--
-- So the validated layer is a frozen typed constant in
-- lib/breathing-check-in/instrument.ts, changeable only by a reviewed
-- deploy that also bumps BPC_CONTENT_VERSION, and covered by tests that
-- assert its sixteen items, its five options, its point map and its
-- maximum have not moved.
--
-- THE ROOTED RESET LAYER IS A SEPARATE MODULE AGAIN, NOT A ROW EITHER
-- (lib/breathing-check-in/copy.ts and ./signals.ts). Both layers are code,
-- and the separation between them is a module boundary plus a test that
-- walks the import graph: what a member reads about her result can be
-- rewritten without touching the file that holds the instrument, and the
-- file that holds the instrument imports nothing from the experience.
--
-- WHAT THIS MIGRATION HOLDS is therefore only what a database has to
-- hold: the catalog row so the assignment machinery can address the thing,
-- her sitting, and the policies that decide who may read and write it.

-- ---------------------------------------------------------------------
-- 1. The catalog row, so the existing assignment machinery can address it.
-- ---------------------------------------------------------------------

-- Fixed id, matching lib/breathing-check-in/constants.ts exactly, so every
-- environment resolves this experience to the same definition. Same
-- convention as migrations 70, 190, 211 through 220, 225 and 230.
--
-- THE DISPLAY NAME IS THE MEMBER FACING NAME, and it is the only name this
-- row carries. The underlying instrument is named on the coach's own
-- results card, from a coach only module, because a coach reading a result
-- needs to know which instrument produced it and a member does not. Two
-- names in one column would be one deploy away from the wrong one
-- appearing on her screen.
insert into assessment_definitions (id, key, display_name, category)
values (
  '2f6a8c31-9d47-4b58-a0e3-6c1b7d92f405',
  'breathing-pattern-check-in',
  'Breathing Pattern Check-In',
  'breathing_pattern'
)
on conflict (id) do nothing;

insert into assessment_definition_versions (assessment_definition_id, version, notes)
select '2f6a8c31-9d47-4b58-a0e3-6c1b7d92f405', 1,
  'Initial version. Sixteen questions, one five point scale, total nought to sixty four. Validated instrument held as a frozen constant in code.'
where not exists (
  select 1 from assessment_definition_versions
  where assessment_definition_id = '2f6a8c31-9d47-4b58-a0e3-6c1b7d92f405' and version = 1
);

-- ---------------------------------------------------------------------
-- 2. Her sitting.
-- ---------------------------------------------------------------------

-- ONE ROW PER ASSIGNMENT, CREATED BY A TAP AND NEVER BY A RENDER.
--
-- The check-in is short but resumable, so a row exists while she is partway
-- through. It is still never written by a page render: the only thing that
-- creates or updates it is the save behind her own answer
-- (app/api/breathing-check-in/progress/route.ts). That is also what makes
-- started_at a real number rather than the moment a screen was prefetched.
--
-- COMPLETION IS WRITE ONCE. The update policy below only matches a row
-- whose completed_at is still null, so a finished sitting can never be
-- edited, re-answered or re-summarised. A retake is a new assignment and a
-- new row, which is what keeps every past completion standing for the
-- comparison a coach reads.
create table member_breathing_check_in_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  assignment_id uuid references assessment_assignments(id) on delete set null,

  -- Which generation of the VALIDATED instrument this sitting answered.
  -- Bumped only by a reviewed change to lib/breathing-check-in/instrument.ts,
  -- never by a reworded member facing sentence, so two sittings filed under
  -- one version are genuinely comparable.
  content_version integer not null default 1,

  -- Her answers, keyed by the permanent item id
  -- (lib/breathing-check-in/instrument.ts). A value is one of the five
  -- stored option keys and nothing else: the server drops anything the
  -- scale does not hold rather than guessing, so a hand made POST cannot
  -- invent a sixth response.
  answers jsonb not null default '{}'::jsonb,

  -- How far she got, so reopening puts her back where she was. Nothing
  -- trusts it on its own: the taker re-derives the first unanswered
  -- question from her answers and never lets a stored index carry her past
  -- a question that still needs her.
  progress jsonb not null default '{}'::jsonb,

  -- THE SCORE, WRITTEN ONCE, AT SUBMIT, BY THE SERVER.
  --
  -- Computed by lib/breathing-check-in/instrument.ts from her stored
  -- answers and stored here so every surface reads ONE number rather than
  -- each recomputing its own. It holds the total, the maximum it was out
  -- of, how many of the sixteen she answered, and the per item points, all
  -- of which are the validated layer's own output.
  --
  -- IT CARRIES NO BAND, NO LABEL AND NO INTERPRETATION. The member's
  -- reading and the coach's reading are both derived from this at display
  -- time by the Rooted Reset layer, so rewording a band never needs a
  -- migration and never rewrites a stored result.
  results jsonb,

  started_at timestamptz not null default now(),
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index member_breathing_check_in_one_per_assignment
  on member_breathing_check_in_sessions (assignment_id)
  where assignment_id is not null;

create index member_breathing_check_in_member_idx
  on member_breathing_check_in_sessions (member_id, completed_at desc);

alter table member_breathing_check_in_sessions enable row level security;

create policy member_read_own_breathing_check_in on member_breathing_check_in_sessions
  for select using (member_id = auth.uid());

-- THE ASSIGNMENT IS THE GATE, IN THE DATABASE TOO. A member with no pending
-- assignment of her own for this definition cannot write a sitting at all,
-- whatever a screen or a hand made POST says.
create policy member_insert_own_breathing_check_in on member_breathing_check_in_sessions
  for insert with check (
    member_id = auth.uid()
    and exists (
      select 1
      from public.assessment_assignments a
      where a.id = assignment_id
        and a.member_id = auth.uid()
        and a.assessment_definition_id = '2f6a8c31-9d47-4b58-a0e3-6c1b7d92f405'
        and a.status = 'pending'
    )
  );

create policy member_update_own_unfinished_breathing_check_in on member_breathing_check_in_sessions
  for update
  using (member_id = auth.uid() and completed_at is null)
  with check (member_id = auth.uid());

-- Same narrow test account escape hatch migrations 151, 189, 190, 220, 225
-- and 230 give their own tables, and for the same reason: a verification
-- pass has to be able to see the experience arrive more than once, and has
-- to be able to leave production clean afterwards.
create policy test_member_delete_own_breathing_check_in on member_breathing_check_in_sessions
  for delete using (
    member_id = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.is_test = true)
  );

create policy coach_read_assigned_breathing_check_in on member_breathing_check_in_sessions
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_breathing_check_in on member_breathing_check_in_sessions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- NO COACH WRITE POLICY, AND THERE NEVER MAY BE ONE. These are her answers
-- about her own body. A coach reads them; a coach does not edit them, and a
-- coach cannot correct one on her behalf, because a corrected answer is
-- indistinguishable from an answer she gave, and this instrument's whole
-- value is that the sixteen responses are hers.

-- ---------------------------------------------------------------------
-- 3. Joining the cross assessment attempt ledger.
-- ---------------------------------------------------------------------

alter table assessment_attempts drop constraint assessment_attempts_source_table_check;
alter table assessment_attempts add constraint assessment_attempts_source_table_check
  check (source_table in (
    'wellness_assessments', 'primal_pattern_assessments', 'onboarding_submissions',
    'body_assessments', 'unified_assessment_sessions', 'member_stress_load_sessions',
    'member_happiness_deep_dive_sessions', 'member_body_systems_sessions',
    'member_whole_body_signal_sessions', 'member_health_intake_sessions',
    'member_breathing_check_in_sessions'
  ));

-- Writes the attempt row the moment a sitting is completed, which is what
-- migration 144's own trigger then reads to close the pending assignment
-- out. Same EXCEPTION guarded, never block the row it fires from discipline
-- as every trigger in migrations 79, 100, 190, 220, 225 and 230.
create or replace function public.sync_assessment_attempt_from_breathing_check_in()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_definition_id uuid := '2f6a8c31-9d47-4b58-a0e3-6c1b7d92f405';
  v_is_first boolean;
begin
  if new.completed_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.completed_at is not null then
    return new;
  end if;

  select not exists (
    select 1 from public.assessment_attempts
    where member_id = new.member_id and assessment_definition_id = v_definition_id
  ) into v_is_first;

  insert into public.assessment_attempts (
    member_id, assessment_definition_id, assessment_version,
    attempt_type, status, started_at, completed_at,
    source_table, source_id
  ) values (
    new.member_id, v_definition_id, new.content_version,
    case when v_is_first then 'standard' else 'retake' end,
    'completed', new.started_at, new.completed_at,
    'member_breathing_check_in_sessions', new.id
  )
  on conflict (source_table, source_id) do nothing;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists sync_assessment_attempt_after_breathing_check_in
  on public.member_breathing_check_in_sessions;
create trigger sync_assessment_attempt_after_breathing_check_in
  after insert or update on public.member_breathing_check_in_sessions
  for each row
  execute function public.sync_assessment_attempt_from_breathing_check_in();
