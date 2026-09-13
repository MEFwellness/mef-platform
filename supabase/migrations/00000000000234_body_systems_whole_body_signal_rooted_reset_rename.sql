-- Two questionnaires are renamed, and nothing else about them moves.
--
--   'MEF Body Systems Survey'          -> 'Rooted Reset Body Systems Survey'
--   'MEF Whole-Body Signal Assessment' -> 'Rooted Reset Whole-Body Signal Assessment'
--
-- DISPLAY NAME ONLY. No key, no id, no slug, no route, no table and no
-- stored answer changes. `assessment_definitions.key` stays
-- 'body-systems-survey' and 'whole-body-signal', the two fixed ids in
-- lib/body-systems/constants.ts and lib/whole-body-signal/constants.ts are
-- untouched, and every sitting, assignment and finding keeps pointing at
-- exactly the row it pointed at before.
--
-- WHY IT IS A `replace()` AND NOT A LITERAL SET. Both copy banks are coach
-- editable, so a value here may have been reworded around the name since it
-- was seeded. Replacing the name inside whatever sentence currently holds it
-- keeps the coach's edit and changes only the name. `replace()` on a value
-- that does not contain the old name returns it unchanged, so the same
-- statement is a no-op wherever it has already been applied.
--
-- IT SCANS FOR THE OLD NAME RATHER THAN FOR THE ROW KEYS IT WAS SEEDED
-- UNDER, because a rename that guards on a row key would miss a name a coach
-- had since written into a different row, and the standing rule is that a
-- migration must not quietly match nothing.

-- ---------------------------------------------------------------------
-- 1. The two catalog rows the assignment ledger addresses them by.
-- ---------------------------------------------------------------------

update assessment_definitions
set display_name = replace(display_name, 'MEF Body Systems Survey', 'Rooted Reset Body Systems Survey')
where id = 'c1d8a4f2-97b3-4e56-8a0d-2f7b6c3e91a4';

update assessment_definitions
set display_name = replace(display_name, 'MEF Whole-Body Signal Assessment', 'Rooted Reset Whole-Body Signal Assessment')
where id = '5b9e2c74-3a81-4f6d-9c25-7e48d1b0af36';

-- ---------------------------------------------------------------------
-- 2. The stored copy each survey speaks in.
-- ---------------------------------------------------------------------

-- The member's pop-up heading, her Home card title, the title on the
-- opening screen, and the hint beside her remembered branch on /profile.
update body_systems_copy
set value = replace(value, 'MEF Body Systems Survey', 'Rooted Reset Body Systems Survey')
where value like '%MEF Body Systems Survey%';

update whole_body_signal_copy
set value = replace(value, 'MEF Whole-Body Signal Assessment', 'Rooted Reset Whole-Body Signal Assessment')
where value like '%MEF Whole-Body Signal Assessment%';

-- ---------------------------------------------------------------------
-- 3. The coach note on findings already published.
-- ---------------------------------------------------------------------

-- Eleven rows per completed sitting, each one naming the survey it was read
-- from (lib/body-systems/rootMap.ts's sectionCoachContext). This is the
-- coach's own sentence about where a number came from, so leaving the old
-- name on it would put two names for one survey on one coach screen. Her
-- ANSWERS, her scores, her bands and every id on these rows are untouched:
-- only the name inside the sentence moves.
update registry_entries
set coach_context = replace(coach_context, 'MEF Body Systems Survey', 'Rooted Reset Body Systems Survey')
where coach_context like '%MEF Body Systems Survey%';

update registry_entries
set coach_context = replace(coach_context, 'MEF Whole-Body Signal Assessment', 'Rooted Reset Whole-Body Signal Assessment')
where coach_context like '%MEF Whole-Body Signal Assessment%';

-- ---------------------------------------------------------------------
-- 4. The column comment that names it.
-- ---------------------------------------------------------------------

comment on column profiles.body_systems_branch is
  'Which Hormonal Health question set the Rooted Reset Body Systems Survey
   asks this member. Set by her own answer to the branch question, editable
   by her on /profile. Never inferred from anything else.';
