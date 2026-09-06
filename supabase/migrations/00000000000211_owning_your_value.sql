-- Owning Your Value: nine written questions about what a member does for
-- everybody else, what she believes she is worth apart from it, and one
-- sentence she would like to believe about herself.
--
-- It is the first of the Happiness deep-dives, and it is delivered by
-- exactly the machinery the Stress & Load Deep-Dive (migration 190) already
-- uses. Nothing here is a new engine: a catalog row so the existing
-- assignment ledger can address it, one table for her sitting, and the same
-- attempt-ledger trigger that closes an assignment out when she finishes.
--
-- WHO GETS IT. A coach assignment, and nothing else. No tier lock on top,
-- no visibility key, no second flag. An assignment is the one thing that
-- can ADD access for one specific member, and here it is the whole gate
-- rather than a layer on a plan. Unassigned members see nothing anywhere
-- and the direct URL turns them away.
--
-- NOTHING IS SCORED HERE. There is no pattern column, no band, no severity
-- and no registry_entries producer, because this experience draws no
-- conclusions. Root mirrors her own words back and says nothing about her.
-- That is why this migration adds nothing to
-- registry_entries.source_feature: a finding it never produces must not
-- have a name reserved for it.
--
-- ONE TABLE FOR THE WHOLE SET. The Happiness deep-dives are a family of
-- templates sharing one shape (open written answers, one held sentence, no
-- scoring), so the table carries an experience_key rather than being named
-- after the first template to use it. A second template adds its catalog
-- row and one clause to the insert policy below, and nothing else.

-- ---------------------------------------------------------------------
-- 1. The catalog row, so the existing assignment machinery can address it.
-- ---------------------------------------------------------------------

-- Fixed id, matching lib/owning-your-value/constants.ts exactly, so every
-- environment resolves this experience to the same definition. Same
-- convention as migration 70's own rows and migration 190's.
insert into assessment_definitions (id, key, display_name, category)
values (
  'c1d7a4f2-8b36-4e09-a5c7-2f9d63b48e15',
  'owning-your-value',
  'Owning Your Value',
  'happiness'
)
on conflict (id) do nothing;

insert into assessment_definition_versions (assessment_definition_id, version, notes)
select 'c1d7a4f2-8b36-4e09-a5c7-2f9d63b48e15', 1, 'Initial version, nine written questions across three screens.'
where not exists (
  select 1 from assessment_definition_versions
  where assessment_definition_id = 'c1d7a4f2-8b36-4e09-a5c7-2f9d63b48e15' and version = 1
);

-- ---------------------------------------------------------------------
-- 2. Her sitting.
-- ---------------------------------------------------------------------

-- A ROW EXISTS ONLY ONCE SHE HAS WRITTEN SOMETHING AND PRESSED CONTINUE.
-- This experience supports save and resume, so unlike migration 190 there
-- IS a row before the final button. It is still never written by a render:
-- the only things that create or update it are the two server actions she
-- reaches by tapping, and the standing rule is about renders, not about
-- drafts.
create table if not exists member_happiness_deep_dive_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- Which Happiness template this sitting is. Paired with the assignment's
  -- own definition id by the insert policy below, so a session can never
  -- claim to be one template while answering another template's
  -- assignment.
  experience_key text not null,

  -- The assignment this sitting answers. Nullable only so a member's
  -- history survives an assignment row being removed; in practice a
  -- session is never inserted without one, because the insert policy
  -- requires a pending assignment to exist.
  assignment_id uuid references assessment_assignments(id) on delete set null,

  -- Which version of the nine questions these answers belong to, so a
  -- later edit to the wording leaves old answers readable as answers to
  -- the questions actually asked. See lib/owning-your-value/questions.ts.
  questions_version integer not null default 1,

  -- Her answers, keyed by question key, stored exactly as written. There
  -- is no interpretation column beside this one on purpose: her words are
  -- the whole of what this experience holds.
  answers jsonb not null default '{}'::jsonb,

  -- The sentence she wrote at question nine, on its own, because the
  -- screen says "Root will hold onto it" and a promise a later feature
  -- cannot read is not a promise. Null until she finishes.
  held_sentence text,

  -- Which earlier experience this sitting follows on from, by its
  -- experience key. Null for this template, which is offered on its own.
  -- It exists now so a later Happiness template that is genuinely a
  -- follow-up has somewhere honest to record what it follows, rather than
  -- that fact living in a coach's memory.
  follow_up_source_experience_key text,

  started_at timestamptz not null default now(),
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One sitting per assignment. A double submit (a slow network, a second
-- tab, a double tap) resolves to the row that already exists rather than
-- to a second one. Re-assignment creates a NEW assignment row, so a fresh
-- sitting is always possible and no prior completion is ever touched.
create unique index if not exists member_happiness_deep_dive_sessions_one_per_assignment
  on member_happiness_deep_dive_sessions (assignment_id)
  where assignment_id is not null;

create index if not exists member_happiness_deep_dive_sessions_member_idx
  on member_happiness_deep_dive_sessions (member_id, experience_key, completed_at desc);

alter table member_happiness_deep_dive_sessions enable row level security;

create policy member_read_own_happiness_deep_dive_sessions on member_happiness_deep_dive_sessions
  for select using (member_id = auth.uid());

-- THE ASSIGNMENT IS THE GATE, IN THE DATABASE TOO. A member may only write
-- a sitting that answers a pending assignment of her own, for the exact
-- definition that this experience_key names. Nothing else in the app is
-- allowed to open this, so nothing else can write one either. A second
-- Happiness template adds one more pair to the list below.
create policy member_insert_own_happiness_deep_dive_sessions on member_happiness_deep_dive_sessions
  for insert with check (
    member_id = auth.uid()
    and exists (
      select 1
      from public.assessment_assignments a
      where a.id = assignment_id
        and a.member_id = auth.uid()
        and a.status = 'pending'
        and (
          experience_key = 'owning-your-value'
          and a.assessment_definition_id = 'c1d7a4f2-8b36-4e09-a5c7-2f9d63b48e15'
        )
    )
  );

-- WRITE ONCE, THEN NEVER AGAIN. A draft may be updated as she works
-- through the nine questions. The update that stamps completed_at is the
-- last one this policy will ever allow, because the USING clause reads the
-- row as it stands: once completed_at is set, no further update matches.
-- That is the same write-once discipline the assessment runtime's own
-- completion holds, enforced here in the database rather than only in the
-- action.
create policy member_update_own_happiness_deep_dive_sessions on member_happiness_deep_dive_sessions
  for update
  using (member_id = auth.uid() and completed_at is null)
  with check (member_id = auth.uid());

-- Same narrow test-account escape hatch migrations 151, 189 and 190 give
-- their own tables, and for the same reason: a verification pass has to be
-- able to see the experience arrive more than once. Restricted to seeded
-- test accounts in the database itself, not only at the call site.
create policy test_member_delete_own_happiness_deep_dive_sessions on member_happiness_deep_dive_sessions
  for delete using (
    member_id = auth.uid()
    and exists (
      select 1 from profiles p where p.id = auth.uid() and p.is_test = true
    )
  );

create policy coach_read_assigned_happiness_deep_dive_sessions on member_happiness_deep_dive_sessions
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_happiness_deep_dive_sessions on member_happiness_deep_dive_sessions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 3. Joining the cross-assessment attempt ledger, so the existing
--    assignment close-out works without a second mechanism.
-- ---------------------------------------------------------------------

-- Same additive drop and re-add migrations 100 and 190 already used.
alter table assessment_attempts drop constraint assessment_attempts_source_table_check;
alter table assessment_attempts add constraint assessment_attempts_source_table_check
  check (source_table in (
    'wellness_assessments', 'primal_pattern_assessments', 'onboarding_submissions',
    'body_assessments', 'unified_assessment_sessions', 'member_stress_load_sessions',
    'member_happiness_deep_dive_sessions'
  ));

-- Writes the attempt row the moment a sitting is completed. Migration
-- 144's own AFTER INSERT trigger on assessment_attempts then flips the
-- pending assignment to 'completed', which is what makes the pop-up and
-- the Home card disappear and what lets a coach assign a fresh one.
--
-- Same EXCEPTION-guarded, never-block-the-row-it-fires-from discipline as
-- every trigger in migrations 79, 100 and 190: a failure here can never
-- roll back her completion.
create or replace function public.sync_assessment_attempt_from_happiness_deep_dive()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_definition_id uuid;
  v_is_first boolean;
begin
  if new.completed_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.completed_at is not null then
    return new;
  end if;

  -- One pairing per template, matching the insert policy above. An
  -- unknown key writes no attempt rather than guessing a definition.
  v_definition_id := case new.experience_key
    when 'owning-your-value' then 'c1d7a4f2-8b36-4e09-a5c7-2f9d63b48e15'::uuid
    else null
  end;
  if v_definition_id is null then
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
    new.member_id, v_definition_id, new.questions_version,
    case when v_is_first then 'standard' else 'retake' end,
    'completed', new.started_at, new.completed_at,
    'member_happiness_deep_dive_sessions', new.id
  )
  on conflict (source_table, source_id) do nothing;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists sync_assessment_attempt_after_happiness_deep_dive on public.member_happiness_deep_dive_sessions;
create trigger sync_assessment_attempt_after_happiness_deep_dive
  after insert or update on public.member_happiness_deep_dive_sessions
  for each row
  execute function public.sync_assessment_attempt_from_happiness_deep_dive();
