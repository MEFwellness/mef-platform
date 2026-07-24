-- Unified Adaptive Assessment Runtime — session/answer storage for the
-- content schema migration 98 built (unified_assessment_definitions/
-- sections/questions), which deliberately shipped with no session/attempt
-- storage of its own. Mirrors wellness_assessments/wellness_assessment_
-- answers (migration 62) exactly: same partial-unique-index "at most one
-- open draft" guarantee, same per-answer upsert, same RLS shape. Nothing
-- existing is touched — onboarding and every other questionnaire keep
-- using their own tables; this is purely additive, and both new tables
-- start empty.

create table unified_assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  assessment_definition_id uuid not null references unified_assessment_definitions(id),
  assessment_version int not null default 1,

  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),

  -- Resume position: recomputed from real stored answers after every
  -- write (never an independently-advanced cursor) — see
  -- lib/assessment-runtime/data.ts, same discipline as store.ts's
  -- current_category_id/current_question_number.
  current_section_id uuid references unified_assessment_sections(id),
  current_question_id uuid references unified_assessment_questions(id),

  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint unified_assessment_sessions_completed_fields check (
    (status = 'completed' and completed_at is not null)
    or
    (status = 'in_progress' and completed_at is null)
  )
);

-- At most one open draft per member per assessment definition — this is
-- what makes "start" and "resume" the same well-defined entry point.
create unique index unified_assessment_sessions_one_draft_per_definition
  on unified_assessment_sessions (member_id, assessment_definition_id)
  where status = 'in_progress';

create index unified_assessment_sessions_member_definition_idx
  on unified_assessment_sessions (member_id, assessment_definition_id, completed_at desc);

alter table unified_assessment_sessions enable row level security;

create policy member_read_own_unified_assessment_sessions on unified_assessment_sessions
  for select
  using (member_id = auth.uid());

create policy member_insert_own_unified_assessment_sessions on unified_assessment_sessions
  for insert
  with check (member_id = auth.uid());

create policy member_update_own_unified_assessment_sessions on unified_assessment_sessions
  for update
  using (member_id = auth.uid());

create policy coach_read_assigned_unified_assessment_sessions on unified_assessment_sessions
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_unified_assessment_sessions on unified_assessment_sessions
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- One row per answered question, upserted immediately on every save. A
-- single `value` jsonb column (not typed columns, unlike
-- onboarding_answers) because unified_assessment_questions.answer_type
-- varies per question/per future assessment — the unified schema's own
-- design already committed to in migration 98.
create table unified_assessment_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references unified_assessment_sessions(id) on delete cascade,
  question_id uuid not null references unified_assessment_questions(id),

  value jsonb not null,

  answered_at timestamptz not null default now(),

  unique (session_id, question_id)
);

create index unified_assessment_answers_session_idx on unified_assessment_answers (session_id);

alter table unified_assessment_answers enable row level security;

create policy member_read_own_unified_assessment_answers on unified_assessment_answers
  for select
  using (
    exists (
      select 1 from unified_assessment_sessions s
      where s.id = unified_assessment_answers.session_id
        and s.member_id = auth.uid()
    )
  );

create policy member_insert_own_unified_assessment_answers on unified_assessment_answers
  for insert
  with check (
    exists (
      select 1 from unified_assessment_sessions s
      where s.id = unified_assessment_answers.session_id
        and s.member_id = auth.uid()
    )
  );

-- Postgres RLS checks the UPDATE policy for an upsert's conflict-update
-- branch even though the statement is nominally an insert (same note
-- migration 62 makes) — required for saveAnswer's upsert to succeed on a
-- re-save of the same question, not optional.
create policy member_update_own_unified_assessment_answers on unified_assessment_answers
  for update
  using (
    exists (
      select 1 from unified_assessment_sessions s
      where s.id = unified_assessment_answers.session_id
        and s.member_id = auth.uid()
    )
  );

create policy coach_read_assigned_unified_assessment_answers on unified_assessment_answers
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and exists (
      select 1 from unified_assessment_sessions s
      where s.id = unified_assessment_answers.session_id
        and public.is_active_coach_for(auth.uid(), s.member_id)
    )
  );

create policy platform_admin_all_unified_assessment_answers on unified_assessment_answers
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- registry_entries.source_feature — extended (same additive drop/re-add
-- pattern migrations 44/55/58/59/84 already used) to admit the runtime's
-- own producer: findings published by lib/registry/adapters/
-- unifiedAssessment.ts when a unified-runtime session completes.
alter table registry_entries drop constraint registry_entries_source_feature_check;
alter table registry_entries add constraint registry_entries_source_feature_check
  check (source_feature in (
    'body_assessment_finding', 'assessment_ai_observation', 'wearable_daily_metric',
    'food_lens_pattern_comparison', 'movement_session_completed', 'food_analysis_result',
    'questionnaire_category_finding', 'onboarding_baseline_finding', 'primal_pattern_classification',
    'unified_assessment_finding'
  ));

-- Member-authored writes for the new adapter, same shape as migration 84's
-- three additions (member_insert/update_own_..._registry_entries).
create policy member_insert_own_unified_assessment_registry_entries on registry_entries
  for insert
  with check (member_id = auth.uid() and source_feature = 'unified_assessment_finding');

create policy member_update_own_unified_assessment_registry_entries on registry_entries
  for update
  using (member_id = auth.uid() and source_feature = 'unified_assessment_finding')
  with check (member_id = auth.uid() and source_feature = 'unified_assessment_finding');
