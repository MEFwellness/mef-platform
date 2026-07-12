-- Architecture v2.1, Section B.2. answer_status covers 'not sure',
-- 'not applicable', and 'prefer not to answer' as first-class states, not
-- null-value hacks. Not every answer needs to be numeric.
create table onboarding_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references onboarding_submissions(id) on delete cascade,
  question_id uuid not null references onboarding_questions(id),
  answer_status text not null default 'answered'
    check (answer_status in ('answered', 'not_sure', 'not_applicable', 'prefer_not_to_answer')),
  value_numeric numeric,
  value_enum text,
  value_multi_select jsonb,
  value_boolean boolean,
  value_free_text text,
  check (
    answer_status <> 'answered' or (
      value_numeric is not null or value_enum is not null or value_multi_select is not null
      or value_boolean is not null or value_free_text is not null
    )
  )
);

create index onboarding_answers_submission_idx on onboarding_answers (submission_id);
