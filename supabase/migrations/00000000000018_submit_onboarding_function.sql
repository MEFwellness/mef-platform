-- Sprint 1 task 7. Atomic submission: the raw payload and every typed
-- answer are written in one transaction, so a client never ends up with a
-- submission row and no answers (or vice versa) from a partial failure.
--
-- SECURITY INVOKER (the default) — this function does not bypass RLS. It
-- runs as the calling user, and the INSERT policies on onboarding_submissions
-- and onboarding_answers (migration 16) are what actually authorize the
-- writes. The function's only job is atomicity, not privilege escalation.
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
begin
  select id into v_assessment_version_id
  from onboarding_assessment_versions
  where assessment_version = p_assessment_version and retired_at is null;

  if v_assessment_version_id is null then
    raise exception 'No active onboarding_assessment_versions row for version %', p_assessment_version;
  end if;

  v_local_date := (now() at time zone p_timezone)::date;

  insert into onboarding_submissions (user_id, assessment_version_id, timezone, local_date, raw_payload)
  values (auth.uid(), v_assessment_version_id, p_timezone, v_local_date, p_raw_payload)
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

grant execute on function public.submit_onboarding(int, text, jsonb, jsonb) to authenticated;
