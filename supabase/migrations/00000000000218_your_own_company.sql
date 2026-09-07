-- Your Own Company: nine questions about the voice she lives with.
--
-- It is the SEVENTH of the Happiness deep-dives, and it costs exactly what
-- migrations 215 and 217 said a further template would cost: a catalog row,
-- one clause on the insert policy, one arm in the trigger's pairing, plus
-- the structured storage this template's own brief asks for.
--
-- NOTHING NEW IS BUILT HERE. There is no seventh table, no second
-- assignment ledger, no second pop-up mechanism, no second receipt and no
-- second experiment machinery. The sitting lives in
-- member_happiness_deep_dive_sessions beside the six templates already
-- there.
--
-- WHO GETS IT. A coach assignment, and nothing else. Same as the six
-- templates beside it: no tier lock, no visibility key, no grant column and
-- no second flag.
--
-- THERE IS NO PREREQUISITE. A coach may start any member here, including a
-- member who has sat with none of the six templates before it. This
-- template also has no follow-up arm of its own: it never reads another
-- template's rows, and follow_up_source_experience_key is null on every row
-- it writes.
--
-- NOTHING IS SCORED HERE EITHER. No pattern column, no band, no severity
-- and no registry_entries producer. The closing screen prints two sentences
-- she wrote, one after the other, under one fixed line that claims nothing
-- about her.
--
-- WHAT IS GENUINELY NEW IS THE SHAPE OF FIVE OF ITS ANSWERS. Migration 217
-- introduced questions that are not open writing. This one rotates the
-- format rather than repeating it: there is no shelf here, nothing is
-- dragged and there is no line with a mark on it. Five of the nine open
-- with an INSTINCT PICK, a this-or-that answered from the gut, and every
-- one of those picks is immediately followed by the writing it was there to
-- set up. Those picks are choices rather than sentences, so they get a
-- structured column of their own.

-- ---------------------------------------------------------------------
-- 1. The catalog row, so the existing assignment machinery can address it.
-- ---------------------------------------------------------------------

-- Fixed id, matching lib/your-own-company/constants.ts exactly, so every
-- environment resolves this experience to the same definition. Same
-- convention as migrations 70, 190, 211, 212, 213, 214, 215 and 217.
insert into assessment_definitions (id, key, display_name, category)
values (
  'b7d2ef85-3c61-4a09-8d47-5f2b6e1c94a0',
  'your-own-company',
  'Your Own Company',
  'happiness'
)
on conflict (id) do nothing;

insert into assessment_definition_versions (assessment_definition_id, version, notes)
select 'b7d2ef85-3c61-4a09-8d47-5f2b6e1c94a0', 1, 'Initial version, nine questions across three screens, five of them opening with an instinct pick.'
where not exists (
  select 1 from assessment_definition_versions
  where assessment_definition_id = 'b7d2ef85-3c61-4a09-8d47-5f2b6e1c94a0' and version = 1
);

-- ---------------------------------------------------------------------
-- 2. The two structured pieces this template keeps.
-- ---------------------------------------------------------------------

-- THE REWRITE, from question eight, in its own column.
--
-- ITS OWN COLUMN, NOT ONE OF THE SIX ALREADY HERE, and that is the whole
-- point, exactly as migrations 213, 214, 215 and 217 argued it.
-- held_sentence means "the sentence she would like to believe about
-- herself" on an Owning Your Value row. twenty_minute_joy means "the twenty
-- minute version of the thing that fills her" on a Where Your Joy Lives
-- row. deposit_request means "one specific thing a named person could do
-- that would put energy back into her" on a The Giving Ledger row. kind_no
-- means "the no she needs to say, rewritten the way she could actually say
-- it out loud" on a The Weight of Yes row. noticed_wish means "the one
-- thing she wishes somebody would notice about her without being told" on a
-- Being Seen row. doorway means "the smallest possible return to a thing
-- she put down" on a What You Put Down row. This means "one of the things
-- her inner voice says on repeat, rewritten the way a kind voice would say
-- it". Seven different questions, seven different meanings, so seven
-- columns. A later feature reading the family by one shared column would
-- get answers to seven different questions with no way to tell them apart.
--
-- Null on every row that is not this template's own.
alter table member_happiness_deep_dive_sessions
  add column if not exists rewritten_line text;

comment on column member_happiness_deep_dive_sessions.rewritten_line is
  'Your Own Company, question eight: the line her inner voice says on repeat that cuts deepest, rewritten the way the kindest voice she has known would say it, in her own words. Null on every other template.';

-- HER INSTINCT PICKS, THE RAPID ROUND AND HER DEEPEST-CUT PICK, in one
-- structured column.
--
-- WHY A COLUMN AND NOT MORE PROSE IN answers. Five of this template's nine
-- questions open with something that is not writing. Three of them are a
-- single this-or-that card pair answered from the gut. One of them is a
-- round of five pairs in a row, whose count Root reads back to her in her
-- own numbers. The last is a pick between the lines she wrote at question
-- three. Those are choices, not sentences, and storing them as
-- sentences would mean a coach card and any later feature both parsing
-- prose to find out which card she tapped.
--
-- WHAT IS IN IT. Exactly this shape, and lib/your-own-company/instinct.ts
-- is the one place that reads or writes it:
--
--   {
--     "picks":    { "<question key>": "a" | "b", ... },
--     "rapid":    { "<phrase id>": "a" | "b", ... },
--     "lines":    [{ "id": "l0", "text": "<one line she wrote>" }, ...],
--     "deepestCutLineId": "l1" | null
--   }
--
-- THE TALLY IS NOT STORED, IT IS DERIVED. Root tells her how many times she
-- answered one way in the round of five, and her coach reads the same
-- sentence. Storing that number beside the five answers it counts would be
-- two sources of truth for one number, and the one that went stale would be
-- the one on the coach's screen. yocRapidTally is the single place it is
-- computed.
--
-- EVERY LINE IS ONE SHE WROTE. The list of lines is DERIVED on the server
-- from her own question three answer on every save, so a hand-built request
-- cannot put a sentence in front of her that she did not type, and the
-- sentence her closing screen and her coach both read can only ever be
-- hers.
--
-- Null on every row that is not this template's own, and defaulted to null
-- rather than to an empty object so "this template did not run" and "she
-- picked nothing" stay different facts.
alter table member_happiness_deep_dive_sessions
  add column if not exists instinct_state jsonb;

comment on column member_happiness_deep_dive_sessions.instinct_state is
  'Your Own Company: her instinct pick on each of the three this-or-that questions, her five answers in the rapid round, the lines of her question three answer, and the one she said cuts deepest. Null on every other template.';

-- ---------------------------------------------------------------------
-- 3. One more pairing on the insert policy.
-- ---------------------------------------------------------------------

-- THE ASSIGNMENT IS THE GATE, IN THE DATABASE TOO, and each template is
-- paired with its OWN definition. A member may only write a sitting that
-- answers a pending assignment of her own for the exact definition that
-- this experience_key names, so a sitting can never claim to be one
-- template while answering another template's assignment.
--
-- Dropped and recreated rather than added beside, exactly as migrations
-- 212, 213, 214, 215 and 217 did it, so there is exactly one insert policy
-- on this table and the list of templates lives in one place.
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
          or (
            experience_key = 'the-weight-of-yes'
            and a.assessment_definition_id = 'e2a8d16b-5c34-4f79-a0e5-3b7c9d248f16'
          )
          or (
            experience_key = 'being-seen'
            and a.assessment_definition_id = 'f5c3b921-6d47-4a8e-9b12-7e0a4c85d3f6'
          )
          or (
            experience_key = 'what-you-put-down'
            and a.assessment_definition_id = 'a8e6d403-2f19-4c57-b8d2-6e4a1f97c503'
          )
          or (
            experience_key = 'your-own-company'
            and a.assessment_definition_id = 'b7d2ef85-3c61-4a09-8d47-5f2b6e1c94a0'
          )
        )
    )
  );

-- ---------------------------------------------------------------------
-- 4. One more line in the trigger's pairing.
-- ---------------------------------------------------------------------

-- Unchanged from migration 217 except for the seventh case arm. It writes
-- the attempt row the moment a sitting is completed, and migration 144's
-- own AFTER INSERT trigger on assessment_attempts then flips the pending
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
    when 'the-weight-of-yes' then 'e2a8d16b-5c34-4f79-a0e5-3b7c9d248f16'::uuid
    when 'being-seen' then 'f5c3b921-6d47-4a8e-9b12-7e0a4c85d3f6'::uuid
    when 'what-you-put-down' then 'a8e6d403-2f19-4c57-b8d2-6e4a1f97c503'::uuid
    when 'your-own-company' then 'b7d2ef85-3c61-4a09-8d47-5f2b6e1c94a0'::uuid
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
