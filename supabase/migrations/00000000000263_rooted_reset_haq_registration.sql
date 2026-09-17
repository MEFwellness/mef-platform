-- Rooted Reset Health Appraisal Questionnaire (HAQ), Prompt 2 of 3:
-- registration and the coach assignment gate. Nothing in migration 262's
-- question bank, response scale, cutoffs, scoring or result tables changes.
--
-- 1) A CATALOG ROW. assessment_assignments points at assessment_definitions,
--    so a coach cannot assign what the catalog does not carry. The id is
--    fixed and shared with apps/consumer-web-app/lib/haq/constants.ts, the
--    same convention as migrations 70, 231 and 236.
--
-- 2) THE BRIDGE. unified_assessment_definitions.catalog_definition_id is set
--    to that row, which is what migration 100's attempt ledger trigger reads.
--    Completing an instance now writes one assessment_attempts row, and
--    migration 144's trigger on that table closes her pending assignment in
--    the same transaction, exactly as it does for Fuel Pattern.
--
-- 3) THE GATE, IN THE DATABASE AS WELL AS THE APP. The runtime's shared
--    session insert policy only asks that a member writes her own row, which
--    is right for the self serve instruments and wrong for this one: the HAQ
--    opens only when a coach assigns it, like the Breathing Pattern Check-In
--    whose own insert policy has required a pending assignment since
--    migration 231. The shared policy is not touched (every other
--    questionnaire keeps it exactly), so the rule is added to the HAQ's own
--    instance guard instead, and it applies only to a member opening an
--    instance for herself. The service role and an administrator acting on
--    somebody else are not members opening their own instance, and pass as
--    before.
--
--    The rest of haq_guard_instance is migration 262's body, unchanged.
--
-- NO REGISTRY ENTRY. lib/assessment-registry/registry.ts is the plan map,
-- and every entry in it is opened by a plan tier. The HAQ is opened by a
-- coach and by nothing else, so it sits with the other coach assign only
-- questionnaires (lib/questionnaires/coachAssignedQuestionnaires.ts), which
-- have never had registry entries for the same reason.

insert into assessment_definitions (id, key, display_name, category)
values (
  '62aaba8a-9cbd-4a8b-998c-101c3f665e69',
  'haq',
  'Rooted Reset Health Appraisal Questionnaire',
  'health_appraisal'
)
on conflict (id) do nothing;

insert into assessment_definition_versions (assessment_definition_id, version, notes)
select '62aaba8a-9cbd-4a8b-998c-101c3f665e69', 1,
  'haq_v1. 21 scored sections, 260 questions, per section cutoffs. Coach assign only.'
where not exists (
  select 1 from assessment_definition_versions
  where assessment_definition_id = '62aaba8a-9cbd-4a8b-998c-101c3f665e69' and version = 1
);

update unified_assessment_definitions
set catalog_definition_id = '62aaba8a-9cbd-4a8b-998c-101c3f665e69',
    updated_at = now()
where key = 'haq';

create or replace function public.haq_guard_instance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unanswered int;
begin
  if not exists (
    select 1 from unified_assessment_definitions
    where id = new.assessment_definition_id and key = 'haq'
  ) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'in_progress' then
      raise exception 'A HAQ instance starts In Progress'
        using errcode = 'check_violation';
    end if;

    -- A member opens her own instance only on a pending coach assignment.
    if auth.uid() is not null and auth.uid() = new.member_id and not exists (
      select 1
      from assessment_assignments a
      join unified_assessment_definitions d on d.catalog_definition_id = a.assessment_definition_id
      where d.id = new.assessment_definition_id
        and a.member_id = new.member_id
        and a.status = 'pending'
    ) then
      raise exception 'The HAQ opens only when a coach assigns it'
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end if;

  if old.status = 'completed' then
    raise exception 'A completed HAQ instance is never changed'
      using errcode = 'check_violation';
  end if;

  if new.assessment_definition_id <> old.assessment_definition_id
     or new.member_id <> old.member_id
     or new.assessment_version <> old.assessment_version then
    raise exception 'A HAQ instance cannot change its assessment, member or version'
      using errcode = 'check_violation';
  end if;

  if new.status = 'completed' then
    select count(*) into v_unanswered
    from haq_questions hq
    join unified_assessment_questions uq on uq.id = hq.question_id
    where uq.assessment_definition_id = new.assessment_definition_id
      and uq.active
      and not exists (
        select 1 from haq_question_responses r
        where r.session_id = new.id and r.question_id = hq.question_id
      );

    if v_unanswered > 0 then
      raise exception 'A HAQ instance cannot be completed with % unanswered questions', v_unanswered
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.haq_guard_instance() from public, anon, authenticated;
