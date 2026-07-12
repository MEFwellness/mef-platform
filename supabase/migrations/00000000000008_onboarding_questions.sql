-- Architecture v2.1, Section B.2. Supports numeric, enum, multi_select,
-- boolean, and free_text answers, per Sprint 1 task 7.
create table onboarding_questions (
  id uuid primary key default gen_random_uuid(),
  question_key text not null,
  assessment_version_id uuid not null references onboarding_assessment_versions(id),
  question_version int not null,
  display_order int not null,
  prompt_text text not null,
  answer_type text not null
    check (answer_type in ('numeric', 'enum', 'multi_select', 'boolean', 'free_text')),
  allowed_values jsonb,
  domain text not null,
  allows_not_sure boolean not null default true,
  allows_not_applicable boolean not null default true,
  allows_prefer_not_to_answer boolean not null default true,
  unique (question_key, question_version)
);
