-- The Health & Lifestyle Intake: eleven chapters, one sitting per
-- assignment, and no score anywhere in it.
--
-- IT IS A NEW INSTRUMENT, AND IT IS THE CONTEXT ONE. It is not the MEF
-- Body Systems Survey (migrations 220 to 224), not the MEF Whole-Body
-- Signal Assessment (migrations 225 to 228) and not the Stress & Load
-- Deep-Dive (migration 190). Nothing in this migration reads, writes,
-- renames or retires any of them. They keep their own tables, their own
-- content and their own bands, and a change here can never move theirs.
--
-- WHAT IT ESTABLISHES. History, context, concerns, medications, injuries,
-- lifestyle patterns, sleep rhythm, stress and what she has already tried.
-- The survey says which systems are speaking loudly, the deep dives go
-- deeper when a coach decides it is warranted, and the movement work covers
-- the physical side. This one is the background the other three are read
-- against.
--
-- WHO GETS IT. A coach assignment, and nothing else. Same rule as every
-- coach assigned experience beside it: no tier lock, no visibility key, no
-- grant column and no second flag. assessment_assignments (migration 77) is
-- the ledger, which is what gives this the coach write RLS, the one pending
-- row per member partial unique index (migration 144), and the trigger that
-- closes an assignment out.
--
-- WHY THERE IS NO CONTENT TABLE HERE, WHEN EVERY SCORED INSTRUMENT IN THIS
-- APP HAS ONE. A content table exists so a coach can retune a weight, a cut
-- off or a band with no deploy. This instrument has no weight, no cut off,
-- no band and no reading: it asks eleven different KINDS of question,
-- several carrying their own repeatable entries and their own per item
-- follow-ups, and a row schema able to express all of them would be a
-- second questionnaire engine rather than a content table. So the questions
-- are a typed constant in lib/health-intake/questions.ts, covered by tests
-- that parse the same constant the app serves, exactly as the eight
-- Happiness deep-dives (migrations 211 to 219) hold theirs.

-- ---------------------------------------------------------------------
-- 1. The catalog row, so the existing assignment machinery can address it.
-- ---------------------------------------------------------------------

-- Fixed id, matching lib/health-intake/constants.ts exactly, so every
-- environment resolves this experience to the same definition.
insert into assessment_definitions (id, key, display_name, category)
values (
  '7d4c1a58-2b93-4e07-9f61-3a8e5c2d0b74',
  'health-lifestyle-intake',
  'Health & Lifestyle Intake',
  'health_lifestyle_intake'
)
on conflict (id) do nothing;

insert into assessment_definition_versions (assessment_definition_id, version, notes)
select '7d4c1a58-2b93-4e07-9f61-3a8e5c2d0b74', 1,
  'Initial version. Eleven chapters, progressive disclosure throughout, no score and no band.'
where not exists (
  select 1 from assessment_definition_versions
  where assessment_definition_id = '7d4c1a58-2b93-4e07-9f61-3a8e5c2d0b74' and version = 1
);

-- ---------------------------------------------------------------------
-- 2. Her sitting.
-- ---------------------------------------------------------------------

-- ONE ROW PER ASSIGNMENT, CREATED BY A TAP AND NEVER BY A RENDER.
--
-- The intake is long and resumable, so a row exists while she is partway
-- through. It is still never written by a page render: the only thing that
-- creates or updates it is the save behind her own answer and her own
-- Continue (app/actions/healthIntake.ts). That is also what makes
-- started_at a real number rather than the moment a screen was prefetched,
-- so how long the intake took her is reportable later.
--
-- COMPLETION IS WRITE ONCE. The update policy below only matches a row
-- whose completed_at is still null, so a finished sitting can never be
-- edited, re-answered or re-summarised. A retake is a new assignment and a
-- new row.
create table member_health_intake_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  assignment_id uuid references assessment_assignments(id) on delete set null,

  content_version integer not null default 1,

  -- Her answers, keyed by the permanent field id
  -- (lib/health-intake/questions.ts). A value is a string, a number, a list
  -- of strings, a list of flat string maps (a repeatable entry list) or a
  -- flat string map (a per item follow-up), and the reader drops anything
  -- that is none of those rather than guessing.
  --
  -- THIS IS THE PRUNED SET. A branch she closed is not in here.
  answers jsonb not null default '{}'::jsonb,

  -- Answers she REMOVED by changing a gate, kept for audit and for nothing
  -- else. A member who said Yes to medications, added two and later said No
  -- has two medications that are no longer true about her, so they stop
  -- existing for every coach facing surface immediately: nothing that
  -- builds the Health Context summary, a safety signal or a question worth
  -- exploring is ever handed this column. It exists so that "she once told
  -- us this and then took it back" is answerable, not so that it can quietly
  -- keep counting.
  archived jsonb not null default '{}'::jsonb,

  -- How far she got, so reopening puts her back where she was. Nothing
  -- trusts it on its own: lib/health-intake/steps.ts re-derives the walk
  -- from her answers and never lets a stored index carry her past a screen
  -- that still needs her.
  progress jsonb not null default '{}'::jsonb,

  -- When the shared safety pipeline was run for this sitting.
  --
  -- A FLAG, NOT A COPY OF WHAT FIRED. Which rules fired is recomputed from
  -- her stored answers every time it is read, so a later correction to a
  -- rule reaches every past sitting at once and a member and her coach can
  -- never be looking at two different readings of one sitting. This answers
  -- a different question: has the escalation already been written, so a
  -- retried submit does not open a second review case for the same answers.
  safety_escalated_at timestamptz,

  started_at timestamptz not null default now(),
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index member_health_intake_one_per_assignment
  on member_health_intake_sessions (assignment_id)
  where assignment_id is not null;

create index member_health_intake_member_idx
  on member_health_intake_sessions (member_id, completed_at desc);

alter table member_health_intake_sessions enable row level security;

create policy member_read_own_health_intake on member_health_intake_sessions
  for select using (member_id = auth.uid());

-- THE ASSIGNMENT IS THE GATE, IN THE DATABASE TOO. A member with no pending
-- assignment of her own for this definition cannot write a sitting at all,
-- whatever a screen or a hand made POST says.
create policy member_insert_own_health_intake on member_health_intake_sessions
  for insert with check (
    member_id = auth.uid()
    and exists (
      select 1
      from public.assessment_assignments a
      where a.id = assignment_id
        and a.member_id = auth.uid()
        and a.assessment_definition_id = '7d4c1a58-2b93-4e07-9f61-3a8e5c2d0b74'
        and a.status = 'pending'
    )
  );

create policy member_update_own_unfinished_health_intake on member_health_intake_sessions
  for update
  using (member_id = auth.uid() and completed_at is null)
  with check (member_id = auth.uid());

-- Same narrow test account escape hatch migrations 151, 189, 190, 220 and
-- 225 give their own tables, and for the same reason: a verification pass
-- has to be able to see the experience arrive more than once, and has to be
-- able to leave production clean afterwards.
create policy test_member_delete_own_health_intake on member_health_intake_sessions
  for delete using (
    member_id = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.is_test = true)
  );

create policy coach_read_assigned_health_intake on member_health_intake_sessions
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_health_intake on member_health_intake_sessions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- NO COACH WRITE POLICY, AND THERE NEVER MAY BE ONE. These are her answers
-- about her own body. A coach reads them; a coach does not edit them, and a
-- coach cannot correct one on her behalf, because a corrected answer is
-- indistinguishable from an answer she gave.

-- ---------------------------------------------------------------------
-- 3. Joining the cross assessment attempt ledger.
-- ---------------------------------------------------------------------

alter table assessment_attempts drop constraint assessment_attempts_source_table_check;
alter table assessment_attempts add constraint assessment_attempts_source_table_check
  check (source_table in (
    'wellness_assessments', 'primal_pattern_assessments', 'onboarding_submissions',
    'body_assessments', 'unified_assessment_sessions', 'member_stress_load_sessions',
    'member_happiness_deep_dive_sessions', 'member_body_systems_sessions',
    'member_whole_body_signal_sessions', 'member_health_intake_sessions'
  ));

-- Writes the attempt row the moment a sitting is completed, which is what
-- migration 144's own trigger then reads to close the pending assignment
-- out. Same EXCEPTION guarded, never block the row it fires from discipline
-- as every trigger in migrations 79, 100, 190, 220 and 225.
create or replace function public.sync_assessment_attempt_from_health_intake()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_definition_id uuid := '7d4c1a58-2b93-4e07-9f61-3a8e5c2d0b74';
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
    'member_health_intake_sessions', new.id
  )
  on conflict (source_table, source_id) do nothing;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists sync_assessment_attempt_after_health_intake
  on public.member_health_intake_sessions;
create trigger sync_assessment_attempt_after_health_intake
  after insert or update on public.member_health_intake_sessions
  for each row
  execute function public.sync_assessment_attempt_from_health_intake();
