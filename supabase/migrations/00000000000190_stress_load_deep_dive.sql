-- The Stress & Load Deep-Dive: one sitting, eleven questions, mapping what
-- a member's life is demanding of her against what is actually restoring
-- her. It exists to feed her next coaching session.
--
-- WHO GETS IT. A coach assignment, and nothing else. There is no tier
-- lock on top of it, no visibility key and no second flag: an assignment
-- is the one thing that can ADD access for one specific member (the
-- standing rule), and here it is the whole gate rather than a layer on a
-- plan. Unassigned members see nothing anywhere, and the direct URL turns
-- them away.
--
-- WHY IT REUSES assessment_assignments RATHER THAN A NEW TABLE. That
-- table (migration 77) already carries coach-write RLS, the one-pending-
-- per-member partial unique index (migration 144), and the trigger that
-- closes an assignment out when the member finishes. Adding a catalog row
-- here is what lets all of it work unchanged. The deep-dive deliberately
-- does NOT get an entry in lib/assessment-registry/registry.ts, because
-- that registry's entries are what build the Questionnaires catalog and
-- the plan map, and this is neither: it is an experience delivered by
-- assignment, like the Weekly Reflection is an experience delivered by
-- tier.
--
-- TWO DIMENSIONS, NEVER ONE. A completion writes two separate
-- registry_entries rows, one about the load she carries and one about the
-- recovery available to her, which the Member Interpretation Layer files
-- under two different Coaching Domains (Stress & Nervous System, Recovery
-- & Energy Regulation). They are never blended into a single score, here
-- or anywhere above here: a member can be under heavy load with strong
-- recovery, or under moderate load with almost none, and Root has to be
-- able to hold both of those at once.

-- ---------------------------------------------------------------------
-- 1. The catalog row, so the existing assignment machinery can address it.
-- ---------------------------------------------------------------------

-- Fixed id, matching lib/stress-load/constants.ts exactly, so every
-- environment resolves this experience to the same definition. Same
-- convention as migration 70's own five rows.
insert into assessment_definitions (id, key, display_name, category)
values (
  '9f2c4d7e-3a51-4b86-9c0d-6e5f1a72b834',
  'stress-load-deep-dive',
  'Stress & Load Deep-Dive',
  'stress_recovery'
)
on conflict (id) do nothing;

insert into assessment_definition_versions (assessment_definition_id, version, notes)
select '9f2c4d7e-3a51-4b86-9c0d-6e5f1a72b834', 1, 'Initial version, eleven questions across three screens.'
where not exists (
  select 1 from assessment_definition_versions
  where assessment_definition_id = '9f2c4d7e-3a51-4b86-9c0d-6e5f1a72b834' and version = 1
);

-- ---------------------------------------------------------------------
-- 2. Her sitting.
-- ---------------------------------------------------------------------

-- NO ROW EXISTS UNTIL SHE FINISHES. There is deliberately no draft row
-- and no "start" write, the same discipline member_weekly_reflections
-- (migration 189) holds: a page render may read, it may not insert. The
-- only write in this feature happens inside the server action she
-- triggers by pressing the final button.
create table if not exists member_stress_load_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- The assignment this sitting answers. Nullable only so a member's
  -- history survives an assignment row being removed; in practice a
  -- session is never inserted without one, because the insert policy
  -- below requires a pending assignment to exist.
  assignment_id uuid references assessment_assignments(id) on delete set null,

  -- Which version of the eleven questions these answers belong to, so a
  -- later edit to the wording leaves old answers readable as answers to
  -- the questions actually asked. See lib/stress-load/questions.ts.
  questions_version integer not null default 1,

  -- Her eleven answers, keyed by question key. Free text is stored as
  -- written: the whole point of the coach card is that a coach reads what
  -- she actually wrote.
  answers jsonb not null default '{}'::jsonb,

  -- The interpretation, as DESCRIPTORS, never as sentences. Slugs and
  -- numbers only: pattern key, the two side bands, the two point totals,
  -- the counted breadth and signal count, and the check-in cross
  -- reference descriptor. The words are rendered from these at read time
  -- by lib/stress-load/patterns.ts and lib/stress-load/copy.ts, so she and
  -- her coach read one identical reading, and a wording fix reaches every
  -- past sitting at once. Same rule migration 189's recap column follows.
  --
  -- The two sides are stored as two separate fields inside this object and
  -- are never summed into a third. There is no combined score column here
  -- on purpose.
  pattern jsonb not null default '{}'::jsonb,

  started_at timestamptz not null default now(),
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One sitting per assignment. A double submit (a slow network, a second
-- tab, a double tap) resolves to the row that already exists rather than
-- to a second one. Re-assignment creates a NEW assignment row, so a fresh
-- sitting is always possible and no prior completion is ever touched.
create unique index if not exists member_stress_load_sessions_one_per_assignment
  on member_stress_load_sessions (assignment_id)
  where assignment_id is not null;

create index if not exists member_stress_load_sessions_member_idx
  on member_stress_load_sessions (member_id, completed_at desc);

alter table member_stress_load_sessions enable row level security;

create policy member_read_own_stress_load_sessions on member_stress_load_sessions
  for select using (member_id = auth.uid());

-- THE ASSIGNMENT IS THE GATE, IN THE DATABASE TOO. A member may only write
-- a sitting that answers a pending assignment of her own for this exact
-- definition. Nothing else in the app is allowed to open this, so nothing
-- else can write one either.
create policy member_insert_own_stress_load_sessions on member_stress_load_sessions
  for insert with check (
    member_id = auth.uid()
    and exists (
      select 1
      from public.assessment_assignments a
      where a.id = assignment_id
        and a.member_id = auth.uid()
        and a.assessment_definition_id = '9f2c4d7e-3a51-4b86-9c0d-6e5f1a72b834'
        and a.status = 'pending'
    )
  );

-- Same narrow test-account escape hatch migrations 151 and 189 give their
-- own tables, and for the same reason: a verification pass has to be able
-- to see the experience arrive more than once. Restricted to seeded test
-- accounts in the database itself, not only at the call site.
create policy test_member_delete_own_stress_load_sessions on member_stress_load_sessions
  for delete using (
    member_id = auth.uid()
    and exists (
      select 1 from profiles p where p.id = auth.uid() and p.is_test = true
    )
  );

create policy coach_read_assigned_stress_load_sessions on member_stress_load_sessions
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_stress_load_sessions on member_stress_load_sessions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 3. Joining the cross-assessment attempt ledger, so the existing
--    assignment close-out works without a second mechanism.
-- ---------------------------------------------------------------------

-- Same additive drop and re-add migration 100 used for the unified
-- runtime.
alter table assessment_attempts drop constraint assessment_attempts_source_table_check;
alter table assessment_attempts add constraint assessment_attempts_source_table_check
  check (source_table in (
    'wellness_assessments', 'primal_pattern_assessments', 'onboarding_submissions',
    'body_assessments', 'unified_assessment_sessions', 'member_stress_load_sessions'
  ));

-- Writes the attempt row the moment a sitting is completed. Migration
-- 144's own AFTER INSERT trigger on assessment_attempts then flips the
-- pending assignment to 'completed', which is what makes the pop-up and
-- the Home card disappear and what lets a coach assign a fresh one.
--
-- Same EXCEPTION-guarded, never-block-the-row-it-fires-from discipline as
-- every trigger in migrations 79 and 100: a failure here can never roll
-- back her completion.
create or replace function public.sync_assessment_attempt_from_stress_load_session()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_definition_id uuid := '9f2c4d7e-3a51-4b86-9c0d-6e5f1a72b834';
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
    new.member_id, v_definition_id, new.questions_version,
    case when v_is_first then 'standard' else 'retake' end,
    'completed', new.started_at, new.completed_at,
    'member_stress_load_sessions', new.id
  )
  on conflict (source_table, source_id) do nothing;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists sync_assessment_attempt_after_stress_load_session on public.member_stress_load_sessions;
create trigger sync_assessment_attempt_after_stress_load_session
  after insert or update on public.member_stress_load_sessions
  for each row
  execute function public.sync_assessment_attempt_from_stress_load_session();

-- ---------------------------------------------------------------------
-- 4. The Root Map feed: one new registry producer, two dimensions.
-- ---------------------------------------------------------------------

-- Same additive drop and re-add pattern migrations 44, 55, 58, 84 and 99
-- already used.
alter table registry_entries drop constraint registry_entries_source_feature_check;
alter table registry_entries add constraint registry_entries_source_feature_check
  check (source_feature in (
    'body_assessment_finding', 'assessment_ai_observation', 'wearable_daily_metric',
    'food_lens_pattern_comparison', 'movement_session_completed', 'food_analysis_result',
    'questionnaire_category_finding', 'onboarding_baseline_finding', 'primal_pattern_classification',
    'unified_assessment_finding', 'stress_load_deep_dive_finding'
  ));

-- Member-authored writes for the new producer, same shape as migration
-- 99's two additions. The two rows this producer writes are
-- stress::stress_load_burden and stress::recovery_capacity, and they are
-- filed under two different Coaching Domains by
-- lib/member-interpretation/domainMap.ts.
create policy member_insert_own_stress_load_registry_entries on registry_entries
  for insert
  with check (member_id = auth.uid() and source_feature = 'stress_load_deep_dive_finding');

create policy member_update_own_stress_load_registry_entries on registry_entries
  for update
  using (member_id = auth.uid() and source_feature = 'stress_load_deep_dive_finding')
  with check (member_id = auth.uid() and source_feature = 'stress_load_deep_dive_finding');
