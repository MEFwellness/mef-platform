-- Reassessments: a member can submit onboarding_submissions again after
-- their baseline. The table already had no unique constraint on user_id
-- and a reserved superseded_at column for exactly this (see migration 9
-- and lib/onboarding/baseline.ts) — this migration adds the two columns
-- actually needed to tell submissions apart and to prepare for a future
-- scheduled-reminder system, without touching any existing row's meaning.
alter table onboarding_submissions
  add column assessment_type text not null default 'baseline'
    check (assessment_type in ('baseline', 'reassessment')),
  add column checkpoint_label text
    check (checkpoint_label in ('30_day', '90_day') or checkpoint_label is null);

comment on column onboarding_submissions.assessment_type is
  'baseline = the member''s first-ever submission, permanent and never overwritten. reassessment = any later submission, stored as its own dated row.';
comment on column onboarding_submissions.checkpoint_label is
  'Reserved for a future scheduled-reminder system (30/90-day check-ins). Null today — every reassessment so far is member-initiated, not scheduler-tagged. No notification/reminder logic reads this column yet.';

-- Existing rows (all pre-reassessment-feature) are every member's actual
-- baseline, which the column default already covers correctly.

-- Recompute assessment_type server-side, not from client input: the DB is
-- the only source of truth for "is this the member's first submission
-- ever," matching the same philosophy as every other write path in this
-- app (RLS decides authorization, not what the client claims). Parameter
-- list is unchanged from migration 18, so this is a plain replace — no
-- drop needed, unlike the submit_daily_checkin v2 signature change.
create or replace function public.submit_onboarding(
  p_assessment_version int,
  p_timezone text,
  p_raw_payload jsonb,
  p_answers jsonb  -- array of { question_key, question_version, answer_status, value }
)
returns uuid
language plpgsql
as $$
declare
  v_assessment_version_id uuid;
  v_submission_id uuid;
  v_answer jsonb;
  v_question_id uuid;
  v_answer_type text;
  v_local_date date;
  v_assessment_type text;
begin
  select id into v_assessment_version_id
  from onboarding_assessment_versions
  where assessment_version = p_assessment_version and retired_at is null;

  if v_assessment_version_id is null then
    raise exception 'No active onboarding_assessment_versions row for version %', p_assessment_version;
  end if;

  v_local_date := (now() at time zone p_timezone)::date;

  select case when exists (
    select 1 from onboarding_submissions where user_id = auth.uid()
  ) then 'reassessment' else 'baseline' end into v_assessment_type;

  insert into onboarding_submissions (
    user_id, assessment_version_id, timezone, local_date, raw_payload, assessment_type
  )
  values (auth.uid(), v_assessment_version_id, p_timezone, v_local_date, p_raw_payload, v_assessment_type)
  returning id into v_submission_id;

  for v_answer in select * from jsonb_array_elements(p_answers)
  loop
    select id, answer_type into v_question_id, v_answer_type
    from onboarding_questions
    where question_key = v_answer ->> 'question_key'
      and question_version = (v_answer ->> 'question_version')::int
      and assessment_version_id = v_assessment_version_id;

    if v_question_id is null then
      raise exception 'Unknown question_key/version: % / %',
        v_answer ->> 'question_key', v_answer ->> 'question_version';
    end if;

    insert into onboarding_answers (
      submission_id, question_id, answer_status,
      value_numeric, value_enum, value_multi_select, value_boolean, value_free_text
    ) values (
      v_submission_id,
      v_question_id,
      coalesce(v_answer ->> 'answer_status', 'answered'),
      case when v_answer_type = 'numeric' then (v_answer ->> 'value')::numeric end,
      case when v_answer_type = 'enum' then v_answer ->> 'value' end,
      case when v_answer_type = 'multi_select' then v_answer -> 'value' end,
      case when v_answer_type = 'boolean' then (v_answer ->> 'value')::boolean end,
      case when v_answer_type = 'free_text' then v_answer ->> 'value' end
    );
  end loop;

  return v_submission_id;
end;
$$;
