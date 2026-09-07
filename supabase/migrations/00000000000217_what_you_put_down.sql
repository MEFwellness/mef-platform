-- What You Put Down: nine questions about the versions of herself she set
-- aside to carry everything else.
--
-- It is the SIXTH of the Happiness deep-dives, and it costs exactly what
-- migration 215 said a further template would cost: a catalog row, one
-- clause on the insert policy, one line in the trigger's pairing, plus the
-- structured storage this template's own brief asks for.
--
-- NOTHING NEW IS BUILT HERE. There is no sixth table, no second assignment
-- ledger, no second pop-up mechanism, no second receipt and no second
-- experiment machinery. The sitting lives in
-- member_happiness_deep_dive_sessions beside the five templates already
-- there.
--
-- WHO GETS IT. A coach assignment, and nothing else. Same as the five
-- templates beside it: no tier lock, no visibility key, no grant column and
-- no second flag.
--
-- THERE IS NO PREREQUISITE. A coach may start any member here, including a
-- member who has sat with none of the five templates before it. This
-- template also has no follow-up arm of its own: it never reads another
-- template's rows, and follow_up_source_experience_key is null on every row
-- it writes.
--
-- NOTHING IS SCORED HERE EITHER. No pattern column, no band, no severity
-- and no registry_entries producer. The closing screen prints her own shelf
-- and her own sentence under one fixed line that claims nothing specific
-- about her.
--
-- WHAT IS GENUINELY NEW IS THE SHAPE OF TWO OF ITS ANSWERS. This is the
-- first template in the family whose questions are not all open writing:
-- three of them ask her to commit to a position first (which of her own
-- lines stings most, how far away that version of her feels, which one
-- still has a pulse) and then to write about it. Those commitments are
-- structured data rather than prose, so they get a structured column.

-- ---------------------------------------------------------------------
-- 1. The catalog row, so the existing assignment machinery can address it.
-- ---------------------------------------------------------------------

-- Fixed id, matching lib/what-you-put-down/constants.ts exactly, so every
-- environment resolves this experience to the same definition. Same
-- convention as migrations 70, 190, 211, 212, 213, 214 and 215.
insert into assessment_definitions (id, key, display_name, category)
values (
  'a8e6d403-2f19-4c57-b8d2-6e4a1f97c503',
  'what-you-put-down',
  'What You Put Down',
  'happiness'
)
on conflict (id) do nothing;

insert into assessment_definition_versions (assessment_definition_id, version, notes)
select 'a8e6d403-2f19-4c57-b8d2-6e4a1f97c503', 1, 'Initial version, nine questions across three screens, three of them interactive.'
where not exists (
  select 1 from assessment_definition_versions
  where assessment_definition_id = 'a8e6d403-2f19-4c57-b8d2-6e4a1f97c503' and version = 1
);

-- ---------------------------------------------------------------------
-- 2. The two structured pieces this template keeps.
-- ---------------------------------------------------------------------

-- THE DOORWAY, from question eight, in its own column.
--
-- ITS OWN COLUMN, NOT ONE OF THE FIVE ALREADY HERE, and that is the whole
-- point, exactly as migrations 213, 214 and 215 argued it. held_sentence
-- means "the sentence she would like to believe about herself" on an Owning
-- Your Value row. twenty_minute_joy means "the twenty minute version of the
-- thing that fills her" on a Where Your Joy Lives row. deposit_request
-- means "one specific thing a named person could do that would put energy
-- back into her" on a The Giving Ledger row. kind_no means "the no she
-- needs to say, rewritten the way she could actually say it out loud" on a
-- The Weight of Yes row. noticed_wish means "the one thing she wishes
-- somebody would notice about her without being told" on a Being Seen row.
-- This means "the smallest possible return to a thing she put down,
-- something within reach in the next two weeks". Six different questions,
-- six different meanings, so six columns. A later feature reading the
-- family by one shared column would get answers to six different questions
-- with no way to tell them apart.
--
-- Null on every row that is not this template's own.
alter table member_happiness_deep_dive_sessions
  add column if not exists doorway text;

comment on column member_happiness_deep_dive_sessions.doorway is
  'What You Put Down, question eight: the smallest possible return to the thing she put down, something within reach in the next two weeks, in her own words. Null on every other template.';

-- THE SHELF, whole, in one structured column.
--
-- WHY A COLUMN AND NOT MORE PROSE IN answers. Three of this template's nine
-- questions are not writing. Question two turns each line of her question
-- one answer into a card and asks her to place every one of them and then
-- name the one that stings most to read back. Question five asks her to
-- place a version of herself on a line between "Right here" and "A
-- stranger". Question seven asks her to lift one card back off the shelf.
-- Those are positions and choices, not sentences, and storing them as
-- sentences would mean a coach card and any later feature both parsing
-- prose to find out which card she picked.
--
-- WHAT IS IN IT. Exactly this shape, and lib/what-you-put-down/shelf.ts is
-- the one place that reads or writes it:
--
--   {
--     "cards":        [{ "id": "c0", "text": "<one line she wrote>" }, ...],
--     "placed":       ["c0", "c2", ...],   ids, in the order she shelved them
--     "stingCardId":  "c2" | null,          question two's pick
--     "distance":     0..100 | null,        question five, 0 is Right here
--     "liftedCardId": "c0" | null           question seven's pick
--   }
--
-- EVERY CARD CARRIES ONLY WORDS SHE WROTE. The card list is DERIVED on the
-- server from the lines of her own question one answer on every save, so a
-- hand-built request cannot put a sentence on her shelf that she did not
-- type, and the shelf her closing screen and her coach both read can only
-- ever be her own words.
--
-- Null on every row that is not this template's own, and defaulted to null
-- rather than to an empty object so "this template did not run" and "she
-- shelved nothing" stay different facts.
alter table member_happiness_deep_dive_sessions
  add column if not exists shelf_state jsonb;

comment on column member_happiness_deep_dive_sessions.shelf_state is
  'What You Put Down: her cards (one per line of her question one answer), the order she shelved them, the card that stings most, her 0 to 100 distance on question five, and the card she lifted back off. Null on every other template.';

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
-- 212, 213, 214 and 215 did it, so there is exactly one insert policy on
-- this table and the list of templates lives in one place.
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
        )
    )
  );

-- ---------------------------------------------------------------------
-- 4. One more line in the trigger's pairing.
-- ---------------------------------------------------------------------

-- Unchanged from migration 215 except for the sixth case arm. It writes
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
