-- Rooted Reset Health Appraisal Questionnaire (HAQ): wording-only revision of
-- eleven questions, so that none of them assumes the symptom is present
-- before the member answers.
--
-- A WORDING CHANGE IS A NEW QUESTION VERSION, NEVER AN EDIT IN PLACE. This is
-- the case migrations 98 and 262 were built for: unified_assessment_questions
-- is unique on (question_key, version), haq_questions on (question_key,
-- question_version), and every stored answer and response record points at
-- the question ROW it was given to. So for each of the eleven:
--   1. a version 2 row is added with the new words, copying its section, its
--      position, its answer type and its options from version 1, and its HAQ
--      part, section and response type likewise;
--   2. version 1 is set inactive. The runtime reads only active rows, and the
--      completion guard (migration 263) counts only active rows, so every new
--      and resumed sitting asks version 2 and no sitting can be required to
--      answer both.
-- The question id (question_key), its Part, its Section, its order, its
-- response type and its hidden values are unchanged. Nothing here reads or
-- writes haq_response_scale, haq_section_cutoffs or haq_section_results, and
-- no engine function is replaced.
--
-- A COMPLETED SITTING IS NEVER TOUCHED. Its answers and response records keep
-- pointing at version 1, which is kept, and the write-once triggers of
-- migration 262 would refuse any change to them regardless.
--
-- AN OPEN SITTING'S ANSWER TO A VERSION 1 ROW IS FORGOTTEN. Left in place it
-- would sit beside her version 2 answer in the same section total. Deleting
-- the answer runs migration 262's own forget trigger, which removes its
-- response record, and she is asked the question again in its new words.
--
-- The VALUES block below is GENERATED from apps/consumer-web-app/lib/haq/
-- questionBank.ts by apps/consumer-web-app/scripts/print-haq-sql.mjs
-- (buildHaqQuestionRevisionRowsSql(2)), and tests/haq-content.test.ts asserts
-- this file still contains it character for character.

create temporary table haq_revision_v2 (
  question_key text primary key,
  question_version int not null,
  prompt text not null
);

insert into haq_revision_v2 (question_key, question_version, prompt) values
    ('haq_p1_b_q4', 2, 'Do you notice stomach pain, burning, or aching that improves after eating, drinking something soothing, or taking antacids?'),
    ('haq_p1_b_q6', 2, 'Do you notice digestive discomfort that improves when you rest or relax?'),
    ('haq_p3_a_q10', 2, 'Have you noticed unusual dryness or color changes in your skin or hair?'),
    ('haq_p4_b_q8', 2, 'Have you noticed weight gain or more difficulty losing weight when you regularly eat starchy foods such as rice, corn, beans, whole grains, or oats?'),
    ('haq_p5_b_q10', 2, 'Have you noticed any reduced ability to feel pain or tell the difference between hot and cold?'),
    ('haq_p5_b_q12', 2, 'Have you noticed more difficulty making decisions, concentrating, focusing your attention, or following directions?'),
    ('haq_p6_a_q7', 2, 'Have you experienced noticeable changes in both your appetite and your weight?'),
    ('haq_p7_q13', 2, 'Do you experience frequent colds during the winter that keep you feeling unwell?'),
    ('haq_p7_q14', 2, 'When you have flu-like symptoms, do they usually last longer than five days?'),
    ('haq_p7_q15', 2, 'When you have a respiratory infection, does it tend to move into or affect your lungs?'),
    ('haq_p7_q30', 2, 'Have you noticed symptoms involving your eyes, ears, nose, throat, or lungs after eating certain foods such as dairy or wheat products?');

-- The rows being replaced: each question's active version 1 on the HAQ.
create temporary table haq_revision_v1 as
select uq.id, uq.question_key, uq.assessment_definition_id, uq.section_id, uq.display_order,
       uq.answer_type, uq.answer_options, hq.section_id as haq_section_id, hq.part_id, hq.response_type
from unified_assessment_questions uq
join unified_assessment_definitions d on d.id = uq.assessment_definition_id and d.key = 'haq'
join haq_questions hq on hq.question_id = uq.id
join haq_revision_v2 r on r.question_key = uq.question_key and uq.version = r.question_version - 1
where uq.active;

do $$
begin
  if (select count(*) from haq_revision_v1) <> 11 then
    raise exception 'HAQ wording revision: expected 11 active version 1 rows, found %',
      (select count(*) from haq_revision_v1);
  end if;
end;
$$;

-- An open sitting's answers to the rows being replaced. Completed sittings are
-- excluded here, and migration 262's triggers would refuse them anyway.
delete from unified_assessment_answers a
using unified_assessment_sessions s, haq_revision_v1 v1
where a.session_id = s.id
  and a.question_id = v1.id
  and s.status = 'in_progress';

with inserted as (
  insert into unified_assessment_questions (
    assessment_definition_id, section_id, question_key, version, display_order, prompt, answer_type, answer_options
  )
  select v1.assessment_definition_id, v1.section_id, v1.question_key, r.question_version, v1.display_order,
         r.prompt, v1.answer_type, v1.answer_options
  from haq_revision_v1 v1
  join haq_revision_v2 r on r.question_key = v1.question_key
  returning id, question_key, version
)
insert into haq_questions (question_id, question_key, question_version, section_id, part_id, response_type)
select inserted.id, inserted.question_key, inserted.version, v1.haq_section_id, v1.part_id, v1.response_type
from inserted
join haq_revision_v1 v1 on v1.question_key = inserted.question_key;

update unified_assessment_questions uq
set active = false
from haq_revision_v1 v1
where uq.id = v1.id;

-- The instrument is still exactly 260 active questions, one per id, and each
-- of the eleven kept its section, position, answer type and response type.
do $$
declare
  v_active int;
  v_keys int;
  v_moved int;
  v_revised int;
begin
  select count(*), count(distinct uq.question_key) into v_active, v_keys
  from unified_assessment_questions uq
  join unified_assessment_definitions d on d.id = uq.assessment_definition_id and d.key = 'haq'
  join haq_questions hq on hq.question_id = uq.id
  where uq.active;

  if v_active <> 260 or v_keys <> 260 then
    raise exception 'HAQ wording revision: expected 260 active questions with 260 ids, found % and %', v_active, v_keys;
  end if;

  select count(*) into v_moved
  from haq_revision_v1 v1
  join unified_assessment_questions v2
    on v2.question_key = v1.question_key and v2.assessment_definition_id = v1.assessment_definition_id and v2.active
  join haq_questions hq2 on hq2.question_id = v2.id
  where v2.version <> 2
     or v2.section_id is distinct from v1.section_id
     or v2.display_order <> v1.display_order
     or v2.answer_type <> v1.answer_type
     or v2.answer_options <> v1.answer_options
     or hq2.question_version <> 2
     or hq2.section_id <> v1.haq_section_id
     or hq2.part_id <> v1.part_id
     or hq2.response_type <> v1.response_type;

  select count(*) into v_revised
  from haq_questions hq
  join haq_revision_v2 r on r.question_key = hq.question_key and r.question_version = hq.question_version
  join unified_assessment_questions uq on uq.id = hq.question_id and uq.active and uq.prompt = r.prompt;

  if v_revised <> 11 then
    raise exception 'HAQ wording revision: expected 11 active version 2 rows in their new words, found %', v_revised;
  end if;

  if v_moved <> 0 then
    raise exception 'HAQ wording revision: % revised questions moved or changed type', v_moved;
  end if;
end;
$$;

drop table haq_revision_v1;
drop table haq_revision_v2;
