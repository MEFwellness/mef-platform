-- A SECOND ANSWER SCALE, AND FOUR QUESTIONS THAT ARE FACTS RATHER THAN
-- FREQUENCIES.
--
-- WHAT WENT WRONG. Every question in this instrument was answered on one
-- five option frequency scale, Never to Almost Always. Four of them do not
-- ask how often anything happens. "I have previously been treated for a
-- gastrointestinal infection" either happened or it did not, and a member
-- offered Sometimes against it will pick one, because the screen asked her
-- to. That answer then scores two points out of four and carries a section
-- percentage, a Zone rollup and a Signal Load that a coach reads as if it
-- meant something. A meaningless middle is worse than a missing answer,
-- because nothing downstream can tell it apart from a real one.
--
-- WHAT THIS DOES. It adds a BINARY scale, Yes / No / Not sure, and moves
-- exactly the questions that are historical facts onto it. It is a second
-- scale, not a replacement: ninety two questions keep the frequency scale
-- they already had, with the same two point maps and the same words.
--
-- THE POINTS ARE ROWS, LIKE EVERYTHING ELSE HERE. Yes is three, No is
-- nought, Not sure is one, and a reverse scored binary question reads the
-- other column exactly as a reverse scored frequency question does: Yes
-- nought, No three, Not sure one. Nothing in code knows what the top of
-- either scale is, so a coach who retunes Not sure from one to two retunes
-- one row and every past reading rebuilds from it, with the change written
-- into whole_body_signal_content_revisions like every other content edit.
--
-- A BINARY QUESTION'S MAXIMUM IS THREE, NOT FOUR, AND THE ARITHMETIC KNOWS
-- IT. A section's maximum is now summed per question from that question's
-- own scale instead of multiplied by one global top of scale, so Gut
-- Environment is out of thirty six (six questions at four plus four at
-- three) rather than out of forty. The Zone rollup is per question too and
-- was already normalised, so it needed no new rule. lib/whole-body-signal/
-- scoring.ts carries the same note.
--
-- NO COMPLETED SITTING IS TOUCHED. Every stored answer keeps its recorded
-- value. A sitting still in progress cannot crash either: a stored value
-- that is not on its question's scale is treated as unanswered, so she is
-- asked that one question again and it sits in neither side of the
-- fraction until she answers it.
--
-- SECTION 8's UNIVERSAL QUESTION ABOUT HORMONES IS REWORDED. HPU4 is asked
-- of everybody who reaches Section 8, including the member who has just
-- answered "None of these apply to me", and it asked her whether hormonal
-- changes were affecting her wellbeing. Its tags, its weights, its Zone
-- and its direction are unchanged. Only the words she reads are.
--
-- IT TOUCHES NO OTHER INSTRUMENT. The MEF Body Systems Survey (migrations
-- 220 to 224) and the legacy Whole-Body Check-In keep their own tables,
-- their own scales and their own bands, and nothing below reads or writes
-- either.

-- ---------------------------------------------------------------------
-- 1. The scales themselves, as rows.
-- ---------------------------------------------------------------------

-- WHY A TABLE RATHER THAN A TEXT COLUMN. Both the option rows and the
-- question rows name a scale, and a free text column on each would let a
-- question point at a scale with no options, which is a question with no
-- answers on a member's screen. A key here, referenced by both, makes that
-- impossible in the database rather than in a test.
create table whole_body_signal_scales (
  scale_key text primary key,
  position integer not null,
  /** The coach's name for it. No member ever reads this: she reads the option labels. */
  display_name text not null,
  /** What this scale is for, so a coach choosing one for a new question can tell them apart. */
  purpose_line text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index whole_body_signal_scales_position_idx
  on whole_body_signal_scales (position);

insert into whole_body_signal_scales (scale_key, position, display_name, purpose_line)
values
  ('frequency', 1, 'Frequency',
   'Never to Almost Always, nought to four. For a question about something that happens more or less often.'),
  ('binary', 2, 'Yes / No / Not sure',
   'For a question about a fact or a one time event, where a frequency answer would mean nothing.')
on conflict (scale_key) do nothing;

-- ---------------------------------------------------------------------
-- 2. The option rows learn which scale they belong to.
-- ---------------------------------------------------------------------

-- The five existing rows are the frequency scale, which is what the
-- default says, so nothing about them changes.
alter table whole_body_signal_scale_options
  add column if not exists scale_key text not null default 'frequency'
  references whole_body_signal_scales(scale_key);

-- Position is unique WITHIN a scale now. It was unique across the whole
-- table, which was correct while there was one scale and is wrong the
-- moment there are two: Yes is the first option of its own scale and Never
-- is the first option of the other one.
drop index if exists whole_body_signal_scale_options_position_idx;
create unique index whole_body_signal_scale_options_scale_position_idx
  on whole_body_signal_scale_options (scale_key, position);

-- Yes is a loud answer on a direct question and a quiet one on a reverse
-- question, exactly as Almost Always is. Not sure is one point either way:
-- it is not a middle, it is an honest "I do not know", and it is scored
-- low rather than half so that a member who cannot remember is never read
-- as a member who said yes.
insert into whole_body_signal_scale_options
  (scale_key, value_key, position, label, direct_points, reverse_points)
values
  ('binary', 'yes', 1, 'Yes', 3, 0),
  ('binary', 'no', 2, 'No', 0, 3),
  ('binary', 'not_sure', 3, 'Not sure', 1, 1)
on conflict (value_key) do nothing;

-- ---------------------------------------------------------------------
-- 3. The question rows learn which scale they are answered on.
-- ---------------------------------------------------------------------

alter table whole_body_signal_questions
  add column if not exists scale_key text not null default 'frequency'
  references whole_body_signal_scales(scale_key);

-- ---------------------------------------------------------------------
-- 4. The four questions that are facts, not frequencies.
-- ---------------------------------------------------------------------

-- THE TEST APPLIED TO THE WHOLE BANK, question by question: does this
-- sentence describe something that either happened or did not, rather than
-- something that happens more or less often? Four passed it, and all four
-- are in Gut Environment, which is the section whose signal is largely
-- history. Everything else in the ninety six, including "my body seems to
-- need longer to recover than it once did" and "my recovery from exercise
-- has changed over the last several years", describes an ongoing state a
-- member can honestly hold more or less often, and is left on the
-- frequency scale.
--
-- WRITTEN AS AN UPSERT OF THE WHOLE ROW rather than as an update of one
-- column, so the row that production ends up with is visible here in full,
-- and so the fixture that reads these migrations reads the final state of
-- each question from the last file that states it.
insert into whole_body_signal_questions
  (question_ref, section_key, position, prompt, direction,
   primary_zone_key, secondary_zone_key, organ_gland, coach_topic, member_theme,
   feeds_section_key, branch_group, is_universal, allows_pnta, scale_key)
values
  ('GE1', 'gut_environment', 1, 'I have needed repeated courses of antibiotics within the past few years.', 'direct', 'zone_1', null, 'Large Intestines', 'Antibiotic history', 'courses of antibiotics', null, null, false, false, 'binary'),
  ('GE2', 'gut_environment', 2, 'My digestion noticeably changed after taking antibiotics.', 'direct', 'zone_1', 'zone_3', 'Large Intestines', 'Post-antibiotic change', 'changes after antibiotics', null, null, false, false, 'binary'),
  ('GE8', 'gut_environment', 8, 'Travel has previously been followed by a significant change in my digestion.', 'direct', 'zone_1', null, 'Large Intestines', 'Travel-linked change', 'digestion after travel', null, null, false, false, 'binary'),
  ('GE9', 'gut_environment', 9, 'I have previously been treated for a gastrointestinal infection.', 'direct', 'zone_1', 'zone_3', 'Large Intestines', 'GI infection history', 'a stomach infection in the past', null, null, false, false, 'binary')
on conflict (question_ref) do update set
  prompt = excluded.prompt,
  direction = excluded.direction,
  scale_key = excluded.scale_key,
  coach_topic = excluded.coach_topic,
  member_theme = excluded.member_theme,
  updated_at = now();

-- ---------------------------------------------------------------------
-- 5. Section 8's universal question that named hormones.
-- ---------------------------------------------------------------------

-- HPU4 is universal: it is asked of every member who reaches Section 8,
-- whatever she answered to the routing question, including "None of these
-- apply to me". Asking that member whether hormonal changes are affecting
-- her wellbeing is the screen contradicting the answer she just gave.
--
-- The other three universals name no hormone and no life stage, so they
-- are not restated here and their words are untouched.
--
-- COPY ONLY. Same Zone, same direction, same section, same Prefer not to
-- answer, same everything that decides a number. member_theme changes with
-- it because that phrase is printed on HER results card and would
-- otherwise say "how hormonal change affects your days" about a question
-- that no longer mentions it. coach_topic changes for the same reason on
-- the coach's side: a label has to describe the question that was asked.
insert into whole_body_signal_questions
  (question_ref, section_key, position, prompt, direction,
   primary_zone_key, secondary_zone_key, organ_gland, coach_topic, member_theme,
   feeds_section_key, branch_group, is_universal, allows_pnta, scale_key)
values
  ('HPU4', 'hormone_pelvic_rhythm', 10, 'I notice shifts in my energy, mood, or body that seem to follow a pattern over time.', 'direct', 'zone_2', null, 'Gonads', 'Perceived rhythm shifts', 'patterns you notice over time', null, 'U', true, true, 'frequency')
on conflict (question_ref) do update set
  prompt = excluded.prompt,
  coach_topic = excluded.coach_topic,
  member_theme = excluded.member_theme,
  updated_at = now();

-- ---------------------------------------------------------------------
-- 6. The revision trail covers the new table too.
-- ---------------------------------------------------------------------

alter table whole_body_signal_content_revisions
  drop constraint if exists whole_body_signal_content_revisions_table_name_check;

alter table whole_body_signal_content_revisions
  add constraint whole_body_signal_content_revisions_table_name_check
  check (table_name in (
    'whole_body_signal_zones', 'whole_body_signal_sections', 'whole_body_signal_questions',
    'whole_body_signal_scales', 'whole_body_signal_scale_options', 'whole_body_signal_bands',
    'whole_body_signal_routing_options', 'whole_body_signal_branch_rules',
    'whole_body_signal_patterns', 'whole_body_signal_coaching_questions',
    'whole_body_signal_copy', 'whole_body_signal_settings'
  ));

-- ---------------------------------------------------------------------
-- 7. Row level security on the new table, same rules as the scale it names.
-- ---------------------------------------------------------------------

alter table whole_body_signal_scales enable row level security;

create policy authenticated_read_wbs_scales on whole_body_signal_scales
  for select using (auth.role() = 'authenticated');

create policy coach_write_wbs_scales on whole_body_signal_scales
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));

create policy platform_admin_all_wbs_scales on whole_body_signal_scales
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
