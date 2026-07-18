-- Wellness Assessments — the generic storage layer behind the reusable
-- questionnaire assessment engine (apps/consumer-web-app/lib/assessments/).
--
-- Deliberately questionnaire-agnostic: nothing here references CHEK, HLC1,
-- or any specific category/question. questionnaire_id/questionnaire_version
-- point at a config file shipped in code
-- (apps/consumer-web-app/lib/assessments/<questionnaire_id>/questionnaire.json,
-- registered in lib/assessments/registry.ts) — same "config in code, not in
-- the database" choice already made for lib/scoring/config.ts's
-- DOMAIN_WEIGHTS and lib/wellness/wellness-index.ts's WELLNESS_WEIGHTS, so a
-- brand new questionnaire can ship as a new JSON file + registry entry with
-- no migration required. Only when a *response* is recorded does a row
-- exist here.
--
-- Three tables:
--   wellness_assessments               — one row per assessment attempt
--                                         (in_progress draft or completed).
--   wellness_assessment_answers        — one row per answered question,
--                                         upserted as the member moves
--                                         through the flow (this is what
--                                         "save and resume later" persists
--                                         against).
--   wellness_assessment_category_scores — one row per category, written
--                                         once at completion from the
--                                         verified scoring engine — a
--                                         denormalized cache so history/
--                                         comparison views never need to
--                                         re-walk raw answers.
--
-- A member may have any number of *completed* assessments per questionnaire
-- (unlimited history, per product requirement), but at most one *in_progress*
-- draft per questionnaire at a time — enforced by a partial unique index,
-- not application logic, so "resume" always has an unambiguous single row
-- to resume.
--
-- RLS follows the exact established pattern (migration 15 helpers;
-- precedent: migration 61's root_score_snapshots): member_read_own /
-- member_insert_own / member_update_own, coach_read_assigned via
-- is_active_coach_for, platform_admin_all. Answers and category scores
-- additionally check ownership of the parent assessment row (via a join,
-- same shape already used for capture/finding metadata under
-- body_assessment in migrations 37/50/51) rather than duplicating
-- member_id on every child row.

create table wellness_assessments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  questionnaire_id text not null,
  questionnaire_version int not null default 1,

  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),

  -- Resume position: which category/question the member was last on.
  -- Null once completed (nothing left to resume into).
  current_category_id text,
  current_question_number int,

  -- Written once, at completion, by the verified scoring engine
  -- (lib/assessments/engine/scoring.ts) — never computed or edited by a
  -- client directly.
  total_score int,
  total_max_score int,
  total_priority text check (total_priority is null or total_priority in ('low', 'moderate', 'high')),

  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint wellness_assessments_completed_fields check (
    (status = 'completed' and completed_at is not null and total_score is not null and total_max_score is not null and total_priority is not null)
    or
    (status = 'in_progress' and completed_at is null)
  )
);

-- At most one open draft per member per questionnaire — this is what makes
-- "resume" well-defined without an application-level race.
create unique index wellness_assessments_one_draft_per_questionnaire
  on wellness_assessments (member_id, questionnaire_id)
  where status = 'in_progress';

create index wellness_assessments_member_questionnaire_idx
  on wellness_assessments (member_id, questionnaire_id, completed_at desc);

alter table wellness_assessments enable row level security;

create policy member_read_own_wellness_assessments on wellness_assessments
  for select
  using (member_id = auth.uid());

create policy member_insert_own_wellness_assessments on wellness_assessments
  for insert
  with check (member_id = auth.uid());

create policy member_update_own_wellness_assessments on wellness_assessments
  for update
  using (member_id = auth.uid());

create policy coach_read_assigned_wellness_assessments on wellness_assessments
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_wellness_assessments on wellness_assessments
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- One row per answered question. category_id/question_number identify the
-- question the same way questionnaire.json does (there is no separate
-- global question id in the source data — see
-- docs/assessments/chek-hlc1-nutrition-lifestyle/SPEC.md — a question is
-- addressed by its category plus its printed number, exactly as extracted).
-- option_index/points are a snapshot of what the member picked and what it
-- was worth *at answer time*, so a later content edit to a questionnaire
-- config can never silently rewrite the meaning of a historical answer.
create table wellness_assessment_answers (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references wellness_assessments(id) on delete cascade,

  category_id text not null,
  question_number int not null,
  option_index int not null check (option_index >= 0),
  points int not null check (points >= 0),

  answered_at timestamptz not null default now(),

  unique (assessment_id, category_id, question_number)
);

create index wellness_assessment_answers_assessment_idx
  on wellness_assessment_answers (assessment_id);

alter table wellness_assessment_answers enable row level security;

create policy member_read_own_wellness_assessment_answers on wellness_assessment_answers
  for select
  using (
    exists (
      select 1 from wellness_assessments a
      where a.id = wellness_assessment_answers.assessment_id
        and a.member_id = auth.uid()
    )
  );

create policy member_insert_own_wellness_assessment_answers on wellness_assessment_answers
  for insert
  with check (
    exists (
      select 1 from wellness_assessments a
      where a.id = wellness_assessment_answers.assessment_id
        and a.member_id = auth.uid()
    )
  );

create policy member_update_own_wellness_assessment_answers on wellness_assessment_answers
  for update
  using (
    exists (
      select 1 from wellness_assessments a
      where a.id = wellness_assessment_answers.assessment_id
        and a.member_id = auth.uid()
    )
  );

create policy coach_read_assigned_wellness_assessment_answers on wellness_assessment_answers
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and exists (
      select 1 from wellness_assessments a
      where a.id = wellness_assessment_answers.assessment_id
        and public.is_active_coach_for(auth.uid(), a.member_id)
    )
  );

create policy platform_admin_all_wellness_assessment_answers on wellness_assessment_answers
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- One row per category, written once at completion — the denormalized
-- score-sheet cache described above.
create table wellness_assessment_category_scores (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references wellness_assessments(id) on delete cascade,

  category_id text not null,
  score int not null check (score >= 0),
  max_score int not null check (max_score >= 0),
  priority text not null check (priority in ('low', 'moderate', 'high')),

  unique (assessment_id, category_id)
);

create index wellness_assessment_category_scores_assessment_idx
  on wellness_assessment_category_scores (assessment_id);

alter table wellness_assessment_category_scores enable row level security;

create policy member_read_own_wellness_assessment_category_scores on wellness_assessment_category_scores
  for select
  using (
    exists (
      select 1 from wellness_assessments a
      where a.id = wellness_assessment_category_scores.assessment_id
        and a.member_id = auth.uid()
    )
  );

create policy member_insert_own_wellness_assessment_category_scores on wellness_assessment_category_scores
  for insert
  with check (
    exists (
      select 1 from wellness_assessments a
      where a.id = wellness_assessment_category_scores.assessment_id
        and a.member_id = auth.uid()
    )
  );

-- store.ts's completeAssessment upserts on (assessment_id, category_id) —
-- an insert ... on conflict do update. Postgres RLS checks the UPDATE
-- policy for the conflict-update branch even though the statement is
-- nominally an insert, so this is required, not optional, for a
-- re-completion (or a retried request) to succeed rather than fail with
-- a silent-looking RLS error on the second write.
create policy member_update_own_wellness_assessment_category_scores on wellness_assessment_category_scores
  for update
  using (
    exists (
      select 1 from wellness_assessments a
      where a.id = wellness_assessment_category_scores.assessment_id
        and a.member_id = auth.uid()
    )
  );

create policy coach_read_assigned_wellness_assessment_category_scores on wellness_assessment_category_scores
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and exists (
      select 1 from wellness_assessments a
      where a.id = wellness_assessment_category_scores.assessment_id
        and public.is_active_coach_for(auth.uid(), a.member_id)
    )
  );

create policy platform_admin_all_wellness_assessment_category_scores on wellness_assessment_category_scores
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
