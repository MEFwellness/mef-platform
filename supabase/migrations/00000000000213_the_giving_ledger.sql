-- The Giving Ledger: nine written questions about where a member's energy
-- actually goes in a week, what comes back, and the one deposit she could
-- ask somebody for.
--
-- It is the THIRD of the Happiness deep-dives, and it costs what migration
-- 212 said a further template would cost: a catalog row, one clause on the
-- insert policy, one line in the trigger's pairing, plus the one structured
-- column this template's own brief asks for.
--
-- NOTHING NEW IS BUILT HERE. No third table, no second assignment ledger,
-- no second pop-up mechanism, no second receipt and no second experiment
-- machinery. The sitting lives in member_happiness_deep_dive_sessions
-- beside the two templates already there, because that table was
-- deliberately named after the family rather than after the first template
-- to use it.
--
-- WHO GETS IT. A coach assignment, and nothing else. Same as the two
-- templates beside it: no tier lock, no visibility key, no grant column and
-- no second flag. There is also NO PREREQUISITE on either template before
-- it. A coach may start any member here, and requiring a prior sitting
-- would be exactly the second invisible lock the standing rules forbid.
-- Unassigned members see nothing anywhere and the direct URL turns them
-- away.
--
-- NOTHING IS SCORED HERE EITHER. No pattern column, no band, no severity
-- and no registry_entries producer. The closing screen prints one sentence
-- the member wrote herself under one fixed line that claims nothing
-- specific about her.

-- ---------------------------------------------------------------------
-- 1. The catalog row, so the existing assignment machinery can address it.
-- ---------------------------------------------------------------------

-- Fixed id, matching lib/the-giving-ledger/constants.ts exactly, so every
-- environment resolves this experience to the same definition. Same
-- convention as migrations 70, 190, 211 and 212.
insert into assessment_definitions (id, key, display_name, category)
values (
  'd4b0f7c3-9a25-4e18-b6d3-8c1f5a2e70b9',
  'the-giving-ledger',
  'The Giving Ledger',
  'happiness'
)
on conflict (id) do nothing;

insert into assessment_definition_versions (assessment_definition_id, version, notes)
select 'd4b0f7c3-9a25-4e18-b6d3-8c1f5a2e70b9', 1, 'Initial version, nine written questions across three screens.'
where not exists (
  select 1 from assessment_definition_versions
  where assessment_definition_id = 'd4b0f7c3-9a25-4e18-b6d3-8c1f5a2e70b9' and version = 1
);

-- ---------------------------------------------------------------------
-- 2. The one structured column this template keeps.
-- ---------------------------------------------------------------------

-- THE DEPOSIT SHE COULD ASK FOR, from question eight, in its own column.
--
-- ITS OWN COLUMN, NOT ONE OF THE TWO ALREADY HERE, and that is the whole
-- point. held_sentence means "the sentence she would like to believe about
-- herself" on an Owning Your Value row. twenty_minute_joy means "the twenty
-- minute version of the thing that fills her" on a Where Your Joy Lives
-- row. This means "one specific thing a named person could do that would
-- put energy back into her". Three different questions, three different
-- meanings, so three columns. A later feature reading the family by one
-- shared column would get answers to three different questions with no way
-- to tell them apart.
--
-- Null on every row that is not this template's own.
alter table member_happiness_deep_dive_sessions
  add column if not exists deposit_request text;

comment on column member_happiness_deep_dive_sessions.deposit_request is
  'The Giving Ledger, question eight: the specific deposit she could ask a person in her life for. Null on every other template.';

-- ---------------------------------------------------------------------
-- 3. One more pairing on the insert policy.
-- ---------------------------------------------------------------------

-- THE ASSIGNMENT IS THE GATE, IN THE DATABASE TOO, and each template is
-- paired with its OWN definition. A member may only write a sitting that
-- answers a pending assignment of her own for the exact definition that
-- this experience_key names, so a sitting can never claim to be one
-- template while answering another template's assignment.
--
-- Dropped and recreated rather than added beside, exactly as migration 212
-- did it, so there is exactly one insert policy on this table and the list
-- of templates lives in one place. Two policies would be OR'd by Postgres,
-- which is the same result with two places to read.
drop policy if exists member_insert_own_happiness_deep_dive_sessions on member_happiness_deep_dive_sessions;

create policy member_insert_own_happiness_deep_dive_sessions on member_happiness_deep_dive_sessions
  for insert with check (
    member_id = auth.uid()
    and exists (
      select 1
      from public.assessment_assignments a
      where a.id = assignment_id
        and a.member_id = auth.uid()
        and a.status = 'pending'
        and (
          (
            experience_key = 'owning-your-value'
            and a.assessment_definition_id = 'c1d7a4f2-8b36-4e09-a5c7-2f9d63b48e15'
          )
          or (
            experience_key = 'where-your-joy-lives'
            and a.assessment_definition_id = 'b3e9c85a-47d1-4f26-9c0b-1a5e8d37f402'
          )
          or (
            experience_key = 'the-giving-ledger'
            and a.assessment_definition_id = 'd4b0f7c3-9a25-4e18-b6d3-8c1f5a2e70b9'
          )
        )
    )
  );

-- ---------------------------------------------------------------------
-- 4. One more line in the trigger's pairing.
-- ---------------------------------------------------------------------

-- Unchanged from migration 212 except for the third case arm. It writes the
-- attempt row the moment a sitting is completed, and migration 144's own
-- AFTER INSERT trigger on assessment_attempts then flips the pending
-- assignment to 'completed', which is what makes the pop-up and the Home
-- card disappear and what lets a coach assign a fresh one.
--
-- Same EXCEPTION-guarded, never-block-the-row-it-fires-from discipline: a
-- failure here can never roll back her completion.
create or replace function public.sync_assessment_attempt_from_happiness_deep_dive()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_definition_id uuid;
  v_is_first boolean;
begin
  if new.completed_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.completed_at is not null then
    return new;
  end if;

  -- One pairing per template, matching the insert policy above. An
  -- unknown key writes no attempt rather than guessing a definition.
  v_definition_id := case new.experience_key
    when 'owning-your-value' then 'c1d7a4f2-8b36-4e09-a5c7-2f9d63b48e15'::uuid
    when 'where-your-joy-lives' then 'b3e9c85a-47d1-4f26-9c0b-1a5e8d37f402'::uuid
    when 'the-giving-ledger' then 'd4b0f7c3-9a25-4e18-b6d3-8c1f5a2e70b9'::uuid
    else null
  end;
  if v_definition_id is null then
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
    'member_happiness_deep_dive_sessions', new.id
  )
  on conflict (source_table, source_id) do nothing;

  return new;
exception when others then
  return new;
end;
$$;
