-- Architecture v2.1, Section B.2. Table exists per the Sprint 1 table list,
-- but per Sprint 1 task 7 ("do not generate wellness conclusions yet") the
-- job that populates this table from numeric onboarding_answers is
-- intentionally NOT built this sprint. See docs/SPRINT_1_COMPLETION_REPORT.md
-- section G.
create table onboarding_baselines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  baseline_version int not null,
  metric text not null,
  value numeric not null,
  source_submission_id uuid not null references onboarding_submissions(id),
  source_answer_id uuid not null references onboarding_answers(id),
  captured_at timestamptz not null default now(),
  superseded_at timestamptz,
  unique (user_id, metric, baseline_version)
);
