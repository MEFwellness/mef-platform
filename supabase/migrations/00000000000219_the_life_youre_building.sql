-- The Life You're Building: nine questions that all face forward.
--
-- It is the EIGHTH of the Happiness deep-dives and the closer of the set,
-- and it costs exactly what migrations 215, 217 and 218 said a further
-- template would cost: a catalog row, one clause on the insert policy, one
-- arm in the trigger's pairing, plus the structured storage this template's
-- own brief asks for.
--
-- NOTHING NEW IS BUILT HERE. There is no eighth table, no second assignment
-- ledger, no second pop-up mechanism, no second receipt and no second
-- experiment machinery. The sitting lives in
-- member_happiness_deep_dive_sessions beside the seven templates already
-- there.
--
-- WHO GETS IT. A coach assignment, and nothing else. Same as the seven
-- templates beside it: no tier lock, no visibility key, no grant column and
-- no second flag.
--
-- THERE IS NO PREREQUISITE. A coach may start any member here, including a
-- member who has sat with none of the seven templates before it.
--
-- IT CAN FOLLOW ON FROM Owning Your Value, which is the SECOND use of the
-- follow-up mechanism migration 214 introduced and the first reuse of it.
-- When a member has a completed Owning Your Value sitting at the moment she
-- is about to be shown the intro, her question nine quotes the sentence she
-- asked Root to hold onto, her closing prints Then beside Now, and the row
-- records that it ran that way in follow_up_source_experience_key. When she
-- does not, the row's flag stays null and NOTHING she can read anywhere
-- mentions that another template exists. Null means the standalone version
-- ran, on this template as on migration 214's.
--
-- NOTHING IS SCORED HERE EITHER. No pattern column, no band, no severity
-- and no registry_entries producer. The closing screen prints her own three
-- marks and her own sentences under one fixed line that claims nothing
-- about her.
--
-- WHAT IS GENUINELY NEW IS THE SHAPE OF THREE OF ITS ANSWERS, and the
-- rotation rule is why. Migration 218's signature was the instinct pick,
-- the rapid round and the sentence that replaces another, and NONE of those
-- appears here. This template's signature is the PLACE-YOURSELF SLIDER:
-- three of the nine open with a line that has a word at each end, she
-- commits to a position between them, and only then does the writing ask
-- her why she put it there. There is no shelf here, nothing is dragged,
-- there is no this-or-that pair and there is no rapid round. Those three
-- positions are numbers rather than sentences, so they get a structured
-- column of their own.

-- ---------------------------------------------------------------------
-- 1. The catalog row, so the existing assignment machinery can address it.
-- ---------------------------------------------------------------------

-- Fixed id, matching lib/the-life-youre-building/constants.ts exactly, so
-- every environment resolves this experience to the same definition. Same
-- convention as migrations 70, 190, 211, 212, 213, 214, 215, 217 and 218.
insert into assessment_definitions (id, key, display_name, category)
values (
  'c9f4a1d7-8e52-4b36-a7c1-4d9b2e650f83',
  'the-life-youre-building',
  'The Life You''re Building',
  'happiness'
)
on conflict (id) do nothing;

insert into assessment_definition_versions (assessment_definition_id, version, notes)
select 'c9f4a1d7-8e52-4b36-a7c1-4d9b2e650f83', 1, 'Initial version, nine questions across three screens, three of them opening with a place-yourself slider.'
where not exists (
  select 1 from assessment_definition_versions
  where assessment_definition_id = 'c9f4a1d7-8e52-4b36-a7c1-4d9b2e650f83' and version = 1
);

-- ---------------------------------------------------------------------
-- 2. The three structured pieces this template keeps.
-- ---------------------------------------------------------------------

-- THE FIRST STONE, from question eight, in its own column.
--
-- ITS OWN COLUMN, NOT ONE OF THE SEVEN ALREADY HERE, and that is the whole
-- point, exactly as migrations 213, 214, 215, 217 and 218 argued it.
-- held_sentence means "the sentence she would like to believe about
-- herself" on an Owning Your Value row. twenty_minute_joy means "the twenty
-- minute version of the thing that fills her" on a Where Your Joy Lives
-- row. deposit_request means "one specific thing a named person could do
-- that would put energy back into her" on a The Giving Ledger row. kind_no
-- means "the no she needs to say, rewritten the way she could actually say
-- it out loud" on a The Weight of Yes row. noticed_wish means "the one
-- thing she wishes somebody would notice about her without being told" on a
-- Being Seen row. doorway means "the smallest possible return to a thing
-- she put down" on a What You Put Down row. rewritten_line means "one of
-- the things her inner voice says on repeat, rewritten the way a kind voice
-- would say it" on a Your Own Company row. This means "one act inside the
-- next seven days that belongs to the life she is building rather than to
-- the one she is living". Eight different questions, eight different
-- meanings, so eight columns. A later feature reading the family by one
-- shared column would get answers to eight different questions with no way
-- to tell them apart.
--
-- Null on every row that is not this template's own.
alter table member_happiness_deep_dive_sessions
  add column if not exists first_stone text;

comment on column member_happiness_deep_dive_sessions.first_stone is
  'The Life You''re Building, question eight: one act in the next seven days that belongs to the life she is building rather than to the one she is living, in her own words. Null on every other template.';

-- THE SENTENCE SHE LEAVES BEHIND HER, from question nine, in its own
-- column, IN BOTH MODES.
--
-- WHY BOTH MODES. In standalone mode question nine asks her for the
-- sentence she would want Root to hold onto from today, and the closing
-- says Root will hold onto it. In follow-up mode it asks her what she wants
-- to say back to the sentence she left last time, and the closing prints
-- the two side by side. Those are two different questions, but they produce
-- the same kind of thing: the sentence this sitting ends on. A future arc
-- that brings one back must be able to find it without knowing which mode
-- ran, so it is stored the same way either way and the mode is recorded
-- separately in follow_up_source_experience_key.
--
-- IT IS NOT held_sentence, and it never writes into it. held_sentence
-- belongs to Owning Your Value and means something else. Reusing it would
-- mean a member's Owning Your Value follow-up quoting a sentence she wrote
-- in a different sitting answering a different question.
--
-- Null on every row that is not this template's own.
alter table member_happiness_deep_dive_sessions
  add column if not exists forward_sentence text;

comment on column member_happiness_deep_dive_sessions.forward_sentence is
  'The Life You''re Building, question nine: the sentence this sitting ends on, stored in both the standalone and the follow-up mode so a later arc can bring it back without knowing which one ran. Null on every other template.';

-- HER THREE MARKS, in one structured column.
--
-- WHY A COLUMN AND NOT MORE PROSE IN answers. Three of this template's nine
-- questions open with a line that has a word at each end, and she puts a
-- mark somewhere on it. A position is a number between 0 and 100, not a
-- sentence, and storing it as a sentence would mean the closing
-- composition, the coach card and any later feature all parsing prose to
-- find out where she put her mark.
--
-- WHAT IS IN IT. Exactly this shape, and
-- lib/the-life-youre-building/sliders.ts is the one place that reads or
-- writes it:
--
--   { "positions": { "<question key>": 0 to 100, ... } }
--
-- 0 IS THE NEAR POLE AND 100 IS THE FAR ONE, per question, and which words
-- those poles carry is authored beside the question rather than stored
-- here. A stored position is meaningless without its question, and its
-- question already carries its own two words.
--
-- NOTHING IS SCORED, RANKED OR COMBINED. There is no total here, no average
-- of the three, no band and no adjective. The only thing ever built on top
-- of a position is putting it back into WORDS
-- (hddPolePositionInWords), so a coach reads a sentence rather than the
-- number 78, and the member and her coach read the same sentence.
--
-- Null on every row that is not this template's own, and defaulted to null
-- rather than to an empty object so "this template did not run" and "she
-- placed nothing" stay different facts.
alter table member_happiness_deep_dive_sessions
  add column if not exists slider_positions jsonb;

comment on column member_happiness_deep_dive_sessions.slider_positions is
  'The Life You''re Building: where she placed her mark on each of the three two-pole lines, as {"positions": {"<question key>": 0 to 100}}. 0 is the near pole and 100 the far one. Nothing is scored, ranked or combined. Null on every other template.';

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
-- 212, 213, 214, 215, 217 and 218 did it, so there is exactly one insert
-- policy on this table and the list of templates lives in one place.
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
          or (
            experience_key = 'the-life-youre-building'
            and a.assessment_definition_id = 'c9f4a1d7-8e52-4b36-a7c1-4d9b2e650f83'
          )
        )
    )
  );

-- ---------------------------------------------------------------------
-- 4. One more line in the trigger's pairing.
-- ---------------------------------------------------------------------

-- Unchanged from migration 218 except for the eighth case arm. It writes
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
    when 'the-life-youre-building' then 'c9f4a1d7-8e52-4b36-a7c1-4d9b2e650f83'::uuid
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
