-- Primal Pattern Assessment — a second, deliberately separate reusable
-- assessment engine, alongside the points-based one from migration 62
-- (wellness_assessments / wellness_assessment_answers /
-- wellness_assessment_category_scores, powering apps/consumer-web-app/
-- lib/assessments/).
--
-- Why not reuse migration 62's tables: that engine's data model is
-- fundamentally shaped around single-select options with a points value
-- and category-level priority bands ('low'/'moderate'/'high') derived from
-- a score threshold — wellness_assessments.total_priority is even
-- constrained by a check clause to exactly those three values. The Primal
-- Pattern instrument (docs/primal-pattern-diet-type-questionnaire, member-
-- facing as a MEF Wellness assessment) is a different shape entirely: one
-- flat list of questions (no categories), each with exactly two lettered
-- options (A/B) instead of variable point-valued options, a member may
-- select BOTH letters on a question, either letter may be left unanswered
-- (skipped), and the result is a three-way classification
-- ('polar'/'variable'/'equatorial') derived by comparing an A-count to a
-- B-count — not a point sum against a threshold. Reusing migration 62's
-- tables/columns for this would mean overloading total_priority's check
-- constraint with unrelated values and inventing a fake "points" value for
-- letters that don't have one. A second, equally generic, table pair is
-- the more honest fit — exactly the same design choice this codebase
-- already made between onboarding_submissions, body_assessment, and
-- wellness_assessments: parallel, independently-shaped systems that share
-- conventions (RLS pattern, auto-save-per-answer, "config in code, not in
-- the database", one open draft at a time) without sharing tables.
--
-- Like wellness_assessments, questionnaire_id/questionnaire_version point
-- at a config file shipped in code
-- (apps/consumer-web-app/lib/primal-pattern/questionnaire.ts) rather than
-- being modeled in the database, so a future letter-pattern instrument of
-- the same shape can reuse these same two tables with zero migration.
--
-- Two tables:
--   primal_pattern_assessments        — one row per assessment attempt
--                                        (in_progress draft or completed).
--   primal_pattern_assessment_answers — one row per answered question. A
--                                        skipped question simply has no
--                                        row — the same "absence = not yet
--                                        answered" convention migration
--                                        62's answers table already uses,
--                                        which is what makes skip counting
--                                        (total questions - row count)
--                                        trivial and never wrong.
--
-- At most one open draft per member per questionnaire_id, enforced by a
-- partial unique index exactly like migration 62 — "resume" always has an
-- unambiguous single row to resume.
--
-- RLS follows the established pattern from migration 15's helpers and
-- migration 62's own precedent: member_read_own / member_insert_own /
-- member_update_own, coach_read_assigned via is_active_coach_for,
-- platform_admin_all. The answers table additionally checks ownership of
-- the parent assessment row via a join, rather than duplicating member_id
-- on every answer row.

create table primal_pattern_assessments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  questionnaire_id text not null default 'primal-pattern-diet-type',
  questionnaire_version int not null default 1,

  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),

  -- Resume position: the next question number the member hasn't visited
  -- yet. Null once completed (nothing left to resume into). No category
  -- equivalent exists for this questionnaire's flat question list.
  current_question_number int,

  -- Written once, at completion, by the verified scoring engine
  -- (lib/primal-pattern/scoring.ts) — never computed or edited by a client
  -- directly. a_count/b_count count questions where that letter was among
  -- the member's selection (a both-answer question increments both).
  -- skipped_count + (distinct questions represented in a_count/b_count,
  -- counting a both-answer question once) always equals the questionnaire's
  -- total question count at completion time.
  result text check (result is null or result in ('polar', 'variable', 'equatorial')),
  a_count int not null default 0 check (a_count >= 0),
  b_count int not null default 0 check (b_count >= 0),
  skipped_count int not null default 0 check (skipped_count >= 0),
  both_count int not null default 0 check (both_count >= 0),

  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint primal_pattern_assessments_completed_fields check (
    (status = 'completed' and completed_at is not null and result is not null and current_question_number is null)
    or
    (status = 'in_progress' and completed_at is null and result is null)
  )
);

create unique index primal_pattern_assessments_one_draft_per_questionnaire
  on primal_pattern_assessments (member_id, questionnaire_id)
  where status = 'in_progress';

create index primal_pattern_assessments_member_questionnaire_idx
  on primal_pattern_assessments (member_id, questionnaire_id, completed_at desc);

alter table primal_pattern_assessments enable row level security;

create policy member_read_own_primal_pattern_assessments on primal_pattern_assessments
  for select
  using (member_id = auth.uid());

create policy member_insert_own_primal_pattern_assessments on primal_pattern_assessments
  for insert
  with check (member_id = auth.uid());

create policy member_update_own_primal_pattern_assessments on primal_pattern_assessments
  for update
  using (member_id = auth.uid());

create policy coach_read_assigned_primal_pattern_assessments on primal_pattern_assessments
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_primal_pattern_assessments on primal_pattern_assessments
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- One row per answered question. selected_letters holds one or two of
-- 'A'/'B' — a both-answer selection stores both in the same row rather
-- than two rows, so "does this question have a both-answer" is a single
-- array-length check, not a join/group-by.
create table primal_pattern_assessment_answers (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references primal_pattern_assessments(id) on delete cascade,

  question_number int not null check (question_number >= 1),
  selected_letters text[] not null,

  answered_at timestamptz not null default now(),

  unique (assessment_id, question_number),
  constraint primal_pattern_answers_letters_valid check (
    selected_letters <@ array['A', 'B']::text[]
    and array_length(selected_letters, 1) between 1 and 2
    and (array_length(selected_letters, 1) = 1 or selected_letters[1] <> selected_letters[2])
  )
);

create index primal_pattern_assessment_answers_assessment_idx
  on primal_pattern_assessment_answers (assessment_id);

alter table primal_pattern_assessment_answers enable row level security;

create policy member_read_own_primal_pattern_answers on primal_pattern_assessment_answers
  for select
  using (
    exists (
      select 1 from primal_pattern_assessments a
      where a.id = primal_pattern_assessment_answers.assessment_id
        and a.member_id = auth.uid()
    )
  );

create policy member_insert_own_primal_pattern_answers on primal_pattern_assessment_answers
  for insert
  with check (
    exists (
      select 1 from primal_pattern_assessments a
      where a.id = primal_pattern_assessment_answers.assessment_id
        and a.member_id = auth.uid()
    )
  );

create policy member_update_own_primal_pattern_answers on primal_pattern_assessment_answers
  for update
  using (
    exists (
      select 1 from primal_pattern_assessments a
      where a.id = primal_pattern_assessment_answers.assessment_id
        and a.member_id = auth.uid()
    )
  );

create policy member_delete_own_primal_pattern_answers on primal_pattern_assessment_answers
  for delete
  using (
    exists (
      select 1 from primal_pattern_assessments a
      where a.id = primal_pattern_assessment_answers.assessment_id
        and a.member_id = auth.uid()
    )
  );

create policy coach_read_assigned_primal_pattern_answers on primal_pattern_assessment_answers
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and exists (
      select 1 from primal_pattern_assessments a
      where a.id = primal_pattern_assessment_answers.assessment_id
        and public.is_active_coach_for(auth.uid(), a.member_id)
    )
  );

create policy platform_admin_all_primal_pattern_answers on primal_pattern_assessment_answers
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
