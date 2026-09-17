-- Rooted Reset Health Appraisal Questionnaire (HAQ), Prompt 1 of 3: the
-- foundation. Data model, question bank seed, scoring engine. Backend only.
--
-- WHAT THIS IS NOT. It is not the Health Check-In (short-haq, its own
-- wellness_assessments engine) and it is not the Body Systems Survey
-- (body_systems_*). Neither is touched, renamed or read by anything here.
--
-- WHAT IS REUSED. The Unified Adaptive Assessment Foundation and Runtime
-- (migrations 98 and 99), exactly as Fuel Pattern (236) uses them:
--   unified_assessment_definitions  the HAQ itself, key 'haq', version 1
--   unified_assessment_sections     21 sections (title, and the intro as subtitle)
--   unified_assessment_questions    260 questions, question_key = HAQ id, version 1
--   unified_assessment_sessions     the assessment instance: id, member,
--                                   version, started_at, completed_at, status
--   unified_assessment_answers      the selected response and answered_at
-- Not Started is the absence of a session row, the way the runtime and
-- assessment_status_by_member already read it. A retake is the runtime's own
-- startRetake: a new session row, never a change to an old one.
--
-- WHAT IS NEW, and why the runtime could not hold it. The runtime's answer
-- and question rows are readable by the member who owns them, and any
-- number put there would reach her. So every number lives in a HAQ table
-- with NO member policy at all:
--   haq_response_scale      the locked hidden value of each response
--   haq_section_cutoffs     each section's own cutoffs
--   haq_question_responses  one record per answered question, with its hidden value
--   haq_section_results     21 rows per completed instance: raw total, color,
--                           member label, original priority
-- Structure with no numbers is readable like the rest of the content:
--   haq_sections, haq_questions  (part id, section id, response type)
--   haq_body_map_entries         body map structure, never in any total
-- A member reads her own section results only through
-- haq_member_section_results(), which returns the color and the label and
-- nothing else.
--
-- THE ENGINE RUNS IN THE DATABASE, IN THE SAME TRANSACTION AS THE RUNTIME.
-- The runtime writes answers and completes sessions through the member's own
-- session client, and none of the numbers are visible to that client. So:
--   1. An answer to a HAQ question is checked before it is stored: only the
--      response type's approved values, only on an open instance of the HAQ.
--      Anything else raises and the runtime's upsert fails.
--   2. The stored answer writes (or replaces) its haq_question_responses row
--      with the hidden value. Changing an answer replaces the value.
--   3. Completing an instance with any of its 260 questions unanswered raises,
--      so the instance stays In Progress and no result exists.
--   4. Completing a whole instance writes its 21 section results, each from
--      that section's own total and that section's own cutoffs.
--   5. A completed instance, its responses and its results are never updated.
-- lib/haq/scoring.ts is the same engine in TypeScript, and the integration
-- test proves the two agree at every section's four boundaries.
--
-- NOTHING HERE IS VISIBLE IN THE MEMBER APP. There is no catalog row
-- (assessment_definitions) and catalog_definition_id is null, so the attempt
-- ledger trigger and assessment_status_by_member skip it, and there is no
-- registry entry in lib/assessment-registry/registry.ts, so no card, route or
-- assignment can name it. Prompt 2 registers it.
--
-- The content VALUES blocks below are GENERATED from
-- apps/consumer-web-app/lib/haq/questionBank.ts and scoringRules.ts by
-- apps/consumer-web-app/scripts/print-haq-sql.mjs, and
-- tests/haq-content.test.ts asserts this file still matches them.

-- ---------------------------------------------------------------------
-- 1) The definition, on the shared runtime.
-- ---------------------------------------------------------------------

insert into unified_assessment_definitions (
  key, catalog_definition_id, title, description, assessment_type,
  estimated_completion_time_minutes, adaptive_enabled, reassessment_enabled,
  safety_enabled, scoring_profile, version, active
) values (
  'haq', null, 'Rooted Reset Health Appraisal Questionnaire', null, 'health_appraisal',
  null, false, true, false, '{"haq_version":"haq_v1","scoring":"per_section_cutoffs"}'::jsonb, 1, true
);

-- ---------------------------------------------------------------------
-- 2) The locked response scale. No member policy.
-- ---------------------------------------------------------------------

create table haq_response_scale (
  response_type text not null check (response_type in ('frequency', 'yes_no')),
  response_value text not null,
  hidden_value int not null,
  display_order int not null,
  primary key (response_type, response_value),
  -- The locked rule, held by the table itself: no other pair can exist.
  constraint haq_response_scale_locked check (
    (response_type = 'frequency' and response_value = 'never_or_rarely' and hidden_value = 0)
    or (response_type = 'frequency' and response_value = 'sometimes' and hidden_value = 1)
    or (response_type = 'frequency' and response_value = 'often' and hidden_value = 4)
    or (response_type = 'frequency' and response_value = 'very_often' and hidden_value = 8)
    or (response_type = 'yes_no' and response_value = 'no' and hidden_value = 0)
    or (response_type = 'yes_no' and response_value = 'yes' and hidden_value = 8)
  )
);

insert into haq_response_scale (response_type, response_value, hidden_value, display_order) values
    ('frequency', 'never_or_rarely', 0, 1),
    ('frequency', 'sometimes', 1, 2),
    ('frequency', 'often', 4, 3),
    ('frequency', 'very_often', 8, 4),
    ('yes_no', 'no', 0, 1),
    ('yes_no', 'yes', 8, 2);

alter table haq_response_scale enable row level security;

create policy coach_read_haq_response_scale on haq_response_scale
  for select using (public.has_active_role(auth.uid(), 'coach'));

create policy platform_admin_read_haq_response_scale on haq_response_scale
  for select using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 3) Sections: the shared section rows, plus the HAQ's part and section ids.
-- ---------------------------------------------------------------------

create table haq_sections (
  section_id text primary key,
  haq_version text not null default 'haq_v1',
  part_id text not null,
  part_label text not null,
  section_letter text,
  display_order int not null unique,
  unified_section_id uuid not null unique references unified_assessment_sections(id),
  created_at timestamptz not null default now()
);

with def as (
  select id from unified_assessment_definitions where key = 'haq'
),
layout (section_id, part_id, part_label, section_letter, title, intro, display_order) as (
  values
    ('haq_p1_a', 'haq_p1', 'Part I', 'A', 'Gastric Function', null, 1),
    ('haq_p1_b', 'haq_p1', 'Part I', 'B', 'GI Inflammation', null, 2),
    ('haq_p1_c', 'haq_p1', 'Part I', 'C', 'Small Intestine & Pancreas', null, 3),
    ('haq_p1_d', 'haq_p1', 'Part I', 'D', 'Colon', null, 4),
    ('haq_p2', 'haq_p2', 'Part II', null, 'Liver / Gallbladder (Hepatobiliary Function)', null, 5),
    ('haq_p3_a', 'haq_p3', 'Part III', 'A', 'Thyroid', null, 6),
    ('haq_p3_b', 'haq_p3', 'Part III', 'B', 'Adrenal', null, 7),
    ('haq_p4_a', 'haq_p4', 'Part IV', 'A', 'Dysglycemia-L', 'When you miss meals or go for extended periods without food, do you experience any of the following?', 8),
    ('haq_p4_b', 'haq_p4', 'Part IV', 'B', 'Dysglycemia-E', null, 9),
    ('haq_p5_a', 'haq_p5', 'Part V', 'A', 'Heart', null, 10),
    ('haq_p5_b', 'haq_p5', 'Part V', 'B', 'Circulation', null, 11),
    ('haq_p6_a', 'haq_p6', 'Part VI', 'A', 'Depression', null, 12),
    ('haq_p6_b', 'haq_p6', 'Part VI', 'B', 'Anxiety', null, 13),
    ('haq_p6_c', 'haq_p6', 'Part VI', 'C', 'Anger', null, 14),
    ('haq_p7', 'haq_p7', 'Part VII', null, 'Eyes, Ears, Nose, Throat & Lungs', null, 15),
    ('haq_p8', 'haq_p8', 'Part VIII', null, 'Kidney & Bladder', null, 16),
    ('haq_p9_a', 'haq_p9', 'Part IX', 'A', 'Bone Integrity', null, 17),
    ('haq_p9_b', 'haq_p9', 'Part IX', 'B', 'Connective Tissue', null, 18),
    ('haq_p9_c', 'haq_p9', 'Part IX', 'C', 'Muscle & Nerves', null, 19),
    ('haq_p10_a', 'haq_p10', 'Part X', 'A', 'Central Nervous System', null, 20),
    ('haq_p10_b', 'haq_p10', 'Part X', 'B', 'Cognition', null, 21)
),
inserted as (
  insert into unified_assessment_sections (assessment_definition_id, title, subtitle, display_order)
  select def.id, layout.title, layout.intro, layout.display_order
  from def, layout
  returning id, display_order
)
insert into haq_sections (section_id, haq_version, part_id, part_label, section_letter, display_order, unified_section_id)
select layout.section_id, 'haq_v1', layout.part_id, layout.part_label, layout.section_letter, layout.display_order, inserted.id
from layout
join inserted on inserted.display_order = layout.display_order;

alter table haq_sections enable row level security;

create policy authenticated_read_haq_sections on haq_sections
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- 4) Each section's own cutoffs. No member policy.
--    Green 0 to green_max, Yellow green_max + 1 to yellow_max, Red above.
-- ---------------------------------------------------------------------

create table haq_section_cutoffs (
  section_id text primary key references haq_sections(section_id),
  green_max int not null check (green_max >= 0),
  yellow_max int not null,
  check (yellow_max > green_max)
);

insert into haq_section_cutoffs (section_id, green_max, yellow_max) values
    ('haq_p1_a', 3, 7),
    ('haq_p1_b', 3, 7),
    ('haq_p1_c', 7, 15),
    ('haq_p1_d', 7, 15),
    ('haq_p2', 7, 15),
    ('haq_p3_a', 15, 31),
    ('haq_p3_b', 7, 15),
    ('haq_p4_a', 15, 23),
    ('haq_p4_b', 15, 23),
    ('haq_p5_a', 7, 11),
    ('haq_p5_b', 7, 15),
    ('haq_p6_a', 11, 19),
    ('haq_p6_b', 11, 19),
    ('haq_p6_c', 7, 11),
    ('haq_p7', 7, 11),
    ('haq_p8', 7, 31),
    ('haq_p9_a', 3, 7),
    ('haq_p9_b', 3, 7),
    ('haq_p9_c', 7, 15),
    ('haq_p10_a', 7, 15),
    ('haq_p10_b', 15, 31);

alter table haq_section_cutoffs enable row level security;

create policy coach_read_haq_section_cutoffs on haq_section_cutoffs
  for select using (public.has_active_role(auth.uid(), 'coach'));

create policy platform_admin_read_haq_section_cutoffs on haq_section_cutoffs
  for select using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 5) Questions: the shared question rows, plus part, section and response type.
--    answer_options carry values and labels only.
-- ---------------------------------------------------------------------

create table haq_questions (
  question_id uuid primary key references unified_assessment_questions(id),
  question_key text not null,
  question_version int not null,
  section_id text not null references haq_sections(section_id),
  part_id text not null,
  response_type text not null check (response_type in ('frequency', 'yes_no')),
  created_at timestamptz not null default now(),
  unique (question_key, question_version)
);

create index haq_questions_section_idx on haq_questions (section_id);

with def as (
  select id from unified_assessment_definitions where key = 'haq'
),
bank (section_id, question_key, display_order, prompt, response_type) as (
  values
    ('haq_p1_a', 'haq_p1_a_q1', 1, 'After eating, do you experience indigestion or feel or taste food coming back up?', 'frequency'),
    ('haq_p1_a', 'haq_p1_a_q2', 2, 'Do you experience excessive burping, belching, or bloating after meals?', 'frequency'),
    ('haq_p1_a', 'haq_p1_a_q3', 3, 'Do you experience stomach spasms or cramping during or after eating?', 'frequency'),
    ('haq_p1_a', 'haq_p1_a_q4', 4, 'After eating, does food feel as though it just sits in your stomach, causing uncomfortable fullness, pressure, or bloating?', 'frequency'),
    ('haq_p1_a', 'haq_p1_a_q5', 5, 'Do you frequently notice a bad or unpleasant taste in your mouth?', 'frequency'),
    ('haq_p1_a', 'haq_p1_a_q6', 6, 'Do you feel full very quickly, even after eating only a small amount?', 'frequency'),
    ('haq_p1_a', 'haq_p1_a_q7', 7, 'Do you sometimes skip meals or eat irregularly because you have little or no appetite?', 'frequency'),
    ('haq_p1_b', 'haq_p1_b_q1', 1, 'Can strong emotions, or even the thought or smell of food, upset your stomach or cause stomach discomfort?', 'frequency'),
    ('haq_p1_b', 'haq_p1_b_q2', 2, 'Do you feel hungry again within about an hour or two after eating a full meal?', 'frequency'),
    ('haq_p1_b', 'haq_p1_b_q3', 3, 'Do you experience stomach pain, burning, or aching for one to four hours after eating?', 'frequency'),
    ('haq_p1_b', 'haq_p1_b_q4', 4, 'Does stomach pain, burning, or aching improve after eating food, drinking something soothing, or taking antacids?', 'frequency'),
    ('haq_p1_b', 'haq_p1_b_q5', 5, 'Do you experience a burning sensation in the lower part of your chest, especially when lying down or bending forward?', 'frequency'),
    ('haq_p1_b', 'haq_p1_b_q6', 6, 'Do digestive problems tend to improve when you rest or relax?', 'yes_no'),
    ('haq_p1_b', 'haq_p1_b_q7', 7, 'Do spicy foods, fried or fatty foods, chocolate, coffee, alcohol, citrus, or hot peppers cause stomach burning or aching?', 'frequency'),
    ('haq_p1_b', 'haq_p1_b_q8', 8, 'Do you feel nauseated when you eat?', 'frequency'),
    ('haq_p1_b', 'haq_p1_b_q9', 9, 'Do you experience difficulty or pain when swallowing food or beverages?', 'frequency'),
    ('haq_p1_c', 'haq_p1_c_q1', 1, 'When you press or massage beneath the left side of your rib cage, do you notice pain, tenderness, or soreness?', 'frequency'),
    ('haq_p1_c', 'haq_p1_c_q2', 2, 'Do indigestion, fullness, or abdominal tension tend to appear two to four hours after a meal?', 'frequency'),
    ('haq_p1_c', 'haq_p1_c_q3', 3, 'Does discomfort in your lower abdomen improve after passing gas or having a bowel movement?', 'frequency'),
    ('haq_p1_c', 'haq_p1_c_q4', 4, 'Do certain foods or beverages consistently make your indigestion worse?', 'frequency'),
    ('haq_p1_c', 'haq_p1_c_q5', 5, 'Does the consistency or shape of your stool change noticeably within the same day?', 'frequency'),
    ('haq_p1_c', 'haq_p1_c_q6', 6, 'Does the odor of your stool seem unusually strong or embarrassing?', 'frequency'),
    ('haq_p1_c', 'haq_p1_c_q7', 7, 'Do you notice pieces of undigested food in your stool?', 'frequency'),
    ('haq_p1_c', 'haq_p1_c_q8', 8, 'Do you typically have three or more large bowel movements in a day?', 'frequency'),
    ('haq_p1_c', 'haq_p1_c_q9', 9, 'Do you experience frequent loose or watery stools?', 'frequency'),
    ('haq_p1_c', 'haq_p1_c_q10', 10, 'Do you often need to have a bowel movement within about one hour after eating?', 'frequency'),
    ('haq_p1_d', 'haq_p1_d_q1', 1, 'Do you experience discomfort, pain, or cramping in your lower abdomen or colon area?', 'frequency'),
    ('haq_p1_d', 'haq_p1_d_q2', 2, 'Do raw fruits or vegetables trigger abdominal bloating, pain, cramping, or gas?', 'frequency'),
    ('haq_p1_d', 'haq_p1_d_q3', 3, 'Are you generally constipated or do you often need to strain during a bowel movement?', 'frequency'),
    ('haq_p1_d', 'haq_p1_d_q4', 4, 'Is your stool frequently small, hard, or dry?', 'frequency'),
    ('haq_p1_d', 'haq_p1_d_q5', 5, 'Do you notice mucus in your stool?', 'frequency'),
    ('haq_p1_d', 'haq_p1_d_q6', 6, 'Do you alternate between constipation and diarrhea?', 'frequency'),
    ('haq_p1_d', 'haq_p1_d_q7', 7, 'Do you experience rectal pain, itching, or cramping?', 'frequency'),
    ('haq_p1_d', 'haq_p1_d_q8', 8, 'Do you feel a sudden or urgent need to have a bowel movement?', 'yes_no'),
    ('haq_p1_d', 'haq_p1_d_q9', 9, 'Do you feel an almost constant need to have a bowel movement?', 'yes_no'),
    ('haq_p2', 'haq_p2_q1', 1, 'When you press or massage beneath the right side of your rib cage, do you notice pain, tenderness, or soreness?', 'frequency'),
    ('haq_p2', 'haq_p2_q2', 2, 'Does abdominal pain become worse when you take a deep breath?', 'frequency'),
    ('haq_p2', 'haq_p2_q3', 3, 'Do you experience pain at night that may travel toward your back or right shoulder?', 'frequency'),
    ('haq_p2', 'haq_p2_q4', 4, 'Do you have a bitter taste or bitter-tasting fluid come back up after eating?', 'frequency'),
    ('haq_p2', 'haq_p2_q5', 5, 'Do rich, fatty, or fried foods cause abdominal discomfort or nausea?', 'frequency'),
    ('haq_p2', 'haq_p2_q6', 6, 'Do you experience throbbing at the temples or a dull forehead headache that seems associated with overeating?', 'frequency'),
    ('haq_p2', 'haq_p2_q7', 7, 'Do you experience unexplained itchy skin that becomes worse at night?', 'frequency'),
    ('haq_p2', 'haq_p2_q8', 8, 'Does your stool color sometimes change between very pale or clay-colored and normal brown?', 'frequency'),
    ('haq_p2', 'haq_p2_q9', 9, 'Do you generally feel that your health is poor?', 'frequency'),
    ('haq_p2', 'haq_p2_q10', 10, 'Do your muscles ache even when the soreness is not related to exercise?', 'frequency'),
    ('haq_p2', 'haq_p2_q11', 11, 'Do you retain fluid or feel swollen around your abdomen?', 'frequency'),
    ('haq_p2', 'haq_p2_q12', 12, 'Do you notice unusually red skin, especially on the palms of your hands?', 'frequency'),
    ('haq_p2', 'haq_p2_q13', 13, 'Do you notice unusually strong body odor?', 'frequency'),
    ('haq_p2', 'haq_p2_q14', 14, 'Are you concerned or embarrassed by the odor of your breath?', 'frequency'),
    ('haq_p2', 'haq_p2_q15', 15, 'Do you bruise easily?', 'yes_no'),
    ('haq_p2', 'haq_p2_q16', 16, 'Have you noticed a yellowish color or tint in the whites of your eyes?', 'yes_no'),
    ('haq_p3_a', 'haq_p3_a_q1', 1, 'Do you feel unusually cold or chilled in your hands, feet, or throughout your body without an obvious reason?', 'frequency'),
    ('haq_p3_a', 'haq_p3_a_q2', 2, 'Do your upper eyelids appear swollen or puffy?', 'frequency'),
    ('haq_p3_a', 'haq_p3_a_q3', 3, 'Do your muscles feel weak, cramp, or tremble?', 'frequency'),
    ('haq_p3_a', 'haq_p3_a_q4', 4, 'Do you feel unusually forgetful?', 'frequency'),
    ('haq_p3_a', 'haq_p3_a_q5', 5, 'Does your heartbeat sometimes feel unusually slow?', 'frequency'),
    ('haq_p3_a', 'haq_p3_a_q6', 6, 'Do your reactions or reflexes feel slower than usual?', 'frequency'),
    ('haq_p3_a', 'haq_p3_a_q7', 7, 'Has your interest in sex decreased compared with what is normal for you?', 'frequency'),
    ('haq_p3_a', 'haq_p3_a_q8', 8, 'Do you often feel physically slow or sluggish?', 'frequency'),
    ('haq_p3_a', 'haq_p3_a_q9', 9, 'Do you experience constipation?', 'frequency'),
    ('haq_p3_a', 'haq_p3_a_q10', 10, 'Have you noticed unusual dryness or changes in the color of your skin or hair?', 'yes_no'),
    ('haq_p3_a', 'haq_p3_a_q11', 11, 'Have you noticed that your voice has become deeper?', 'yes_no'),
    ('haq_p3_a', 'haq_p3_a_q12', 12, 'Are your nails unusually thick or brittle?', 'yes_no'),
    ('haq_p3_a', 'haq_p3_a_q13', 13, 'Have you gained weight without an obvious reason?', 'yes_no'),
    ('haq_p3_a', 'haq_p3_a_q14', 14, 'Have you noticed thinning or loss of hair along the outer portion of your eyebrows?', 'yes_no'),
    ('haq_p3_a', 'haq_p3_a_q15', 15, 'Have you noticed swelling in your neck?', 'yes_no'),
    ('haq_p3_b', 'haq_p3_b_q1', 1, 'Do you experience lingering fatigue after physical activity or stress?', 'frequency'),
    ('haq_p3_b', 'haq_p3_b_q2', 2, 'Do you become tired or exhausted more easily than you would expect?', 'frequency'),
    ('haq_p3_b', 'haq_p3_b_q3', 3, 'Do you frequently crave salty foods?', 'frequency'),
    ('haq_p3_b', 'haq_p3_b_q4', 4, 'Are you unusually sensitive to small changes in weather or your surroundings?', 'frequency'),
    ('haq_p3_b', 'haq_p3_b_q5', 5, 'Do you become dizzy when standing up after sitting, lying down, or kneeling?', 'frequency'),
    ('haq_p3_b', 'haq_p3_b_q6', 6, 'Do you have dark bluish or black circles under your eyes?', 'frequency'),
    ('haq_p3_b', 'haq_p3_b_q7', 7, 'Do you experience episodes of nausea, with or without vomiting?', 'frequency'),
    ('haq_p3_b', 'haq_p3_b_q8', 8, 'Do you seem to catch colds or infections easily?', 'yes_no'),
    ('haq_p3_b', 'haq_p3_b_q9', 9, 'Do cuts or wounds seem to heal slowly?', 'frequency'),
    ('haq_p3_b', 'haq_p3_b_q10', 10, 'Do areas of your body feel unusually tender, sore, painful, or sensitive to touch?', 'frequency'),
    ('haq_p3_b', 'haq_p3_b_q11', 11, 'Do you feel generally puffy or swollen throughout your body?', 'frequency'),
    ('haq_p3_b', 'haq_p3_b_q12', 12, 'Has your skin gradually become darker without increased sun exposure or another obvious reason?', 'yes_no'),
    ('haq_p4_a', 'haq_p4_a_q1', 1, 'A sense of weakness?', 'frequency'),
    ('haq_p4_a', 'haq_p4_a_q2', 2, 'A sudden feeling of anxiety when you become hungry?', 'frequency'),
    ('haq_p4_a', 'haq_p4_a_q3', 3, 'Tingling in your hands?', 'frequency'),
    ('haq_p4_a', 'haq_p4_a_q4', 4, 'A feeling that your heart is beating unusually fast or forcefully?', 'frequency'),
    ('haq_p4_a', 'haq_p4_a_q5', 5, 'Shaking, jitteriness, or trembling hands?', 'frequency'),
    ('haq_p4_a', 'haq_p4_a_q6', 6, 'Sudden heavy sweating or clammy skin?', 'frequency'),
    ('haq_p4_a', 'haq_p4_a_q7', 7, 'Nightmares that seem more likely when you go to bed without eating?', 'frequency'),
    ('haq_p4_a', 'haq_p4_a_q8', 8, 'Waking during the night feeling restless?', 'frequency'),
    ('haq_p4_a', 'haq_p4_a_q9', 9, 'Feeling agitated, nervous, or easily upset?', 'frequency'),
    ('haq_p4_a', 'haq_p4_a_q10', 10, 'Poor memory or unusual forgetfulness?', 'frequency'),
    ('haq_p4_a', 'haq_p4_a_q11', 11, 'Feeling confused or disoriented?', 'frequency'),
    ('haq_p4_a', 'haq_p4_a_q12', 12, 'Dizziness or feeling faint?', 'frequency'),
    ('haq_p4_a', 'haq_p4_a_q13', 13, 'Feeling unusually cold or numb?', 'frequency'),
    ('haq_p4_a', 'haq_p4_a_q14', 14, 'Mild headaches or a pounding sensation in your head?', 'frequency'),
    ('haq_p4_a', 'haq_p4_a_q15', 15, 'Blurred or double vision?', 'frequency'),
    ('haq_p4_a', 'haq_p4_a_q16', 16, 'Feeling clumsy or poorly coordinated?', 'frequency'),
    ('haq_p4_b', 'haq_p4_b_q1', 1, 'Do you urinate frequently during both the day and night?', 'frequency'),
    ('haq_p4_b', 'haq_p4_b_q2', 2, 'Do you experience unusual thirst or feel that you cannot drink enough water?', 'frequency'),
    ('haq_p4_b', 'haq_p4_b_q3', 3, 'Do you feel unusually hungry or feel as though you could eat constantly?', 'frequency'),
    ('haq_p4_b', 'haq_p4_b_q4', 4, 'Does your vision become blurry?', 'frequency'),
    ('haq_p4_b', 'haq_p4_b_q5', 5, 'Do you experience itching throughout your body?', 'frequency'),
    ('haq_p4_b', 'haq_p4_b_q6', 6, 'Do you experience tingling or numbness in your feet?', 'frequency'),
    ('haq_p4_b', 'haq_p4_b_q7', 7, 'Do you feel unusually sleepy or sluggish during the day even when it is not related to missed meals or lack of sleep?', 'frequency'),
    ('haq_p4_b', 'haq_p4_b_q8', 8, 'Do starchy foods such as rice, corn, beans, whole grains, or oats seem to contribute to weight gain or make weight loss more difficult for you?', 'yes_no'),
    ('haq_p4_b', 'haq_p4_b_q9', 9, 'Do cuts or sores seem to heal slowly?', 'yes_no'),
    ('haq_p4_b', 'haq_p4_b_q10', 10, 'Have you experienced loss of hair on your legs?', 'yes_no'),
    ('haq_p5_a', 'haq_p5_a_q1', 1, 'Do you often feel jittery or physically on edge?', 'frequency'),
    ('haq_p5_a', 'haq_p5_a_q2', 2, 'When you first become active for the day, do you experience pain, pressure, tightness, or heaviness around your chest?', 'frequency'),
    ('haq_p5_a', 'haq_p5_a_q3', 3, 'Do you become exhausted after only a small amount of physical activity?', 'frequency'),
    ('haq_p5_a', 'haq_p5_a_q4', 4, 'Do you experience heavy sweating when you have not been exercising and are not having a hot flash?', 'frequency'),
    ('haq_p5_a', 'haq_p5_a_q5', 5, 'Do you have difficulty catching your breath, especially during exercise or physical activity?', 'frequency'),
    ('haq_p5_a', 'haq_p5_a_q6', 6, 'Do you notice your heart pounding or feel that it is beating too fast, too slowly, or irregularly?', 'frequency'),
    ('haq_p5_a', 'haq_p5_a_q7', 7, 'Do your feet, ankles, or legs swell and then return to normal without an obvious reason?', 'frequency'),
    ('haq_p5_b', 'haq_p5_b_q1', 1, 'Do you experience muscle pain while resting?', 'frequency'),
    ('haq_p5_b', 'haq_p5_b_q2', 2, 'Do you experience cramp-like pain in your ankles, calves, or legs?', 'frequency'),
    ('haq_p5_b', 'haq_p5_b_q3', 3, 'Do you experience numbness, tingling, or a prickling sensation in your hands or feet?', 'frequency'),
    ('haq_p5_b', 'haq_p5_b_q4', 4, 'Do your feet or toes become unusually cold or appear bluish?', 'frequency'),
    ('haq_p5_b', 'haq_p5_b_q5', 5, 'Do you experience brief moments when your hearing seems reduced or disappears?', 'frequency'),
    ('haq_p5_b', 'haq_p5_b_q6', 6, 'Do you experience episodes of nausea that come and go quickly and are not related to eating?', 'frequency'),
    ('haq_p5_b', 'haq_p5_b_q7', 7, 'When standing, do your legs feel unusually heavy or tired?', 'frequency'),
    ('haq_p5_b', 'haq_p5_b_q8', 8, 'Does leg discomfort or fatigue improve when you raise or elevate your legs?', 'frequency'),
    ('haq_p5_b', 'haq_p5_b_q9', 9, 'Do your fingers or toes become numb in cold weather even when they are protected?', 'frequency'),
    ('haq_p5_b', 'haq_p5_b_q10', 10, 'Have you noticed a change in your ability to feel pain or tell the difference between hot and cold?', 'yes_no'),
    ('haq_p5_b', 'haq_p5_b_q11', 11, 'Have you noticed body hair on your arms, hands, fingers, legs, or toes becoming thinner or disappearing?', 'yes_no'),
    ('haq_p5_b', 'haq_p5_b_q12', 12, 'Have you noticed a decline in your ability to make decisions, concentrate, focus your attention, or follow directions?', 'yes_no'),
    ('haq_p6_a', 'haq_p6_a_q1', 1, 'Have you lost interest in family, friends, work, hobbies, or activities that used to matter to you?', 'frequency'),
    ('haq_p6_a', 'haq_p6_a_q2', 2, 'Do you find yourself crying?', 'frequency'),
    ('haq_p6_a', 'haq_p6_a_q3', 3, 'Does life sometimes feel completely hopeless?', 'frequency'),
    ('haq_p6_a', 'haq_p6_a_q4', 4, 'Do you feel miserable, sad, unhappy, or blue?', 'frequency'),
    ('haq_p6_a', 'haq_p6_a_q5', 5, 'Do you find it difficult to make the best of challenging situations?', 'frequency'),
    ('haq_p6_a', 'haq_p6_a_q6', 6, 'Do you have problems sleeping, either sleeping too much or too little?', 'frequency'),
    ('haq_p6_a', 'haq_p6_a_q7', 7, 'Have you noticed a change in both your appetite and your weight?', 'yes_no'),
    ('haq_p6_a', 'haq_p6_a_q8', 8, 'Have you recently noticed difficulty thinking clearly or concentrating?', 'yes_no'),
    ('haq_p6_a', 'haq_p6_a_q9', 9, 'Have you had difficulty making decisions, getting clear about what you want, or working toward your goals?', 'yes_no'),
    ('haq_p6_b', 'haq_p6_b_q1', 1, 'Does worrying negatively affect your mood?', 'frequency'),
    ('haq_p6_b', 'haq_p6_b_q2', 2, 'Do small things easily get on your nerves or wear you out?', 'frequency'),
    ('haq_p6_b', 'haq_p6_b_q3', 3, 'Do you often feel nervous?', 'frequency'),
    ('haq_p6_b', 'haq_p6_b_q4', 4, 'Do you become easily agitated?', 'frequency'),
    ('haq_p6_b', 'haq_p6_b_q5', 5, 'Do you shake or tremble?', 'frequency'),
    ('haq_p6_b', 'haq_p6_b_q6', 6, 'Do you feel keyed up, tense, or jittery?', 'frequency'),
    ('haq_p6_b', 'haq_p6_b_q7', 7, 'Do you tremble or feel weak when someone shouts at you?', 'frequency'),
    ('haq_p6_b', 'haq_p6_b_q8', 8, 'Do sudden movements or noises at night easily frighten you?', 'frequency'),
    ('haq_p6_b', 'haq_p6_b_q9', 9, 'Do you find yourself sighing frequently?', 'frequency'),
    ('haq_p6_b', 'haq_p6_b_q10', 10, 'Do frightening dreams wake you from sleep?', 'frequency'),
    ('haq_p6_b', 'haq_p6_b_q11', 11, 'Do frightening or disturbing thoughts repeatedly come back into your mind?', 'frequency'),
    ('haq_p6_b', 'haq_p6_b_q12', 12, 'Do you suddenly become frightened even when there is no obvious reason?', 'frequency'),
    ('haq_p6_b', 'haq_p6_b_q13', 13, 'Do you suddenly break out in a cold sweat?', 'frequency'),
    ('haq_p6_b', 'haq_p6_b_q14', 14, 'Do you experience "butterflies" in your stomach, nausea, or diarrhea when you feel nervous or anxious?', 'frequency'),
    ('haq_p6_c', 'haq_p6_c_q1', 1, 'Do you feel emotionally bottled up, as though you might suddenly lose your temper?', 'frequency'),
    ('haq_p6_c', 'haq_p6_c_q2', 2, 'Are you prone to loud or emotional outbursts?', 'frequency'),
    ('haq_p6_c', 'haq_p6_c_q3', 3, 'Do you sometimes act impulsively without thinking things through first?', 'frequency'),
    ('haq_p6_c', 'haq_p6_c_q4', 4, 'Are you easily upset or irritated?', 'frequency'),
    ('haq_p6_c', 'haq_p6_c_q5', 5, 'Do you feel as though you might fall apart if you cannot control yourself?', 'frequency'),
    ('haq_p6_c', 'haq_p6_c_q6', 6, 'Do small annoyances easily get on your nerves or make you angry?', 'frequency'),
    ('haq_p6_c', 'haq_p6_c_q7', 7, 'Does being told what to do make you angry?', 'frequency'),
    ('haq_p6_c', 'haq_p6_c_q8', 8, 'Do you become angry when you cannot get what you want right away?', 'frequency'),
    ('haq_p7', 'haq_p7_q1', 1, 'Do your eyes water or tear frequently?', 'frequency'),
    ('haq_p7', 'haq_p7_q2', 2, 'Do you experience mucus or discharge from your eyes?', 'frequency'),
    ('haq_p7', 'haq_p7_q3', 3, 'Do your ears ache, itch, feel congested, or feel sore?', 'frequency'),
    ('haq_p7', 'haq_p7_q4', 4, 'Do you experience discharge from your ears?', 'frequency'),
    ('haq_p7', 'haq_p7_q5', 5, 'Does your nose feel continually congested?', 'frequency'),
    ('haq_p7', 'haq_p7_q6', 6, 'Are you prone to loud snoring?', 'yes_no'),
    ('haq_p7', 'haq_p7_q7', 7, 'Does your nose run frequently?', 'frequency'),
    ('haq_p7', 'haq_p7_q8', 8, 'Do you experience nosebleeds?', 'yes_no'),
    ('haq_p7', 'haq_p7_q9', 9, 'Does your voice frequently sound hoarse?', 'frequency'),
    ('haq_p7', 'haq_p7_q10', 10, 'Do you frequently need to clear your throat?', 'frequency'),
    ('haq_p7', 'haq_p7_q11', 11, 'Do you feel a choking or tight sensation in your throat?', 'frequency'),
    ('haq_p7', 'haq_p7_q12', 12, 'Do you tend to have severe colds?', 'yes_no'),
    ('haq_p7', 'haq_p7_q13', 13, 'Do frequent colds tend to keep you feeling unwell during the winter?', 'yes_no'),
    ('haq_p7', 'haq_p7_q14', 14, 'Do flu-like symptoms tend to last longer than five days for you?', 'yes_no'),
    ('haq_p7', 'haq_p7_q15', 15, 'Do respiratory infections tend to settle in your lungs?', 'yes_no'),
    ('haq_p7', 'haq_p7_q16', 16, 'Do you experience chest discomfort or pain?', 'frequency'),
    ('haq_p7', 'haq_p7_q17', 17, 'Do you experience sudden difficulty breathing?', 'frequency'),
    ('haq_p7', 'haq_p7_q18', 18, 'Do you experience shortness of breath?', 'frequency'),
    ('haq_p7', 'haq_p7_q19', 19, 'Do you have difficulty breathing out or fully exhaling?', 'frequency'),
    ('haq_p7', 'haq_p7_q20', 20, 'Does even mild physical activity leave you breathless and coughing?', 'frequency'),
    ('haq_p7', 'haq_p7_q21', 21, 'Do you have difficulty breathing comfortably while lying down?', 'frequency'),
    ('haq_p7', 'haq_p7_q22', 22, 'Do you frequently cough up a lot of phlegm?', 'frequency'),
    ('haq_p7', 'haq_p7_q23', 23, 'Do you hear rattling or noisy sounds when breathing in or out?', 'frequency'),
    ('haq_p7', 'haq_p7_q24', 24, 'Are you frequently troubled by coughing?', 'frequency'),
    ('haq_p7', 'haq_p7_q25', 25, 'Do you wheeze when you breathe?', 'frequency'),
    ('haq_p7', 'haq_p7_q26', 26, 'Do you experience severe soaking sweats at night?', 'frequency'),
    ('haq_p7', 'haq_p7_q27', 27, 'Do your lips or nails sometimes appear bluish?', 'frequency'),
    ('haq_p7', 'haq_p7_q28', 28, 'Do you frequently feel sleepy during the day?', 'frequency'),
    ('haq_p7', 'haq_p7_q29', 29, 'Do you have difficulty concentrating?', 'frequency'),
    ('haq_p7', 'haq_p7_q30', 30, 'Do symptoms involving your eyes, ears, nose, throat, or lungs seem connected to particular foods such as dairy or wheat products?', 'yes_no'),
    ('haq_p7', 'haq_p7_q31', 31, 'Do symptoms involving your eyes, ears, nose, throat, or lungs seem to change with the seasons?', 'yes_no'),
    ('haq_p8', 'haq_p8_q1', 1, 'Do you accidentally leak urine when you cough, lift something, strain, or perform physical activity?', 'frequency'),
    ('haq_p8', 'haq_p8_q2', 2, 'Do you experience a mild ache or pain in your lower back?', 'frequency'),
    ('haq_p8', 'haq_p8_q3', 3, 'Do you experience aching or pain in your abdomen?', 'frequency'),
    ('haq_p8', 'haq_p8_q4', 4, 'Do you experience pain or burning when urinating?', 'frequency'),
    ('haq_p8', 'haq_p8_q5', 5, 'Do you rarely feel the urge to urinate?', 'frequency'),
    ('haq_p8', 'haq_p8_q6', 6, 'Do you feel the need to urinate less often than every two hours during the day or night?', 'frequency'),
    ('haq_p8', 'haq_p8_q7', 7, 'Does your urine have an unusually strong odor?', 'frequency'),
    ('haq_p8', 'haq_p8_q8', 8, 'Is back or leg pain associated with dripping urine after urination?', 'frequency'),
    ('haq_p8', 'haq_p8_q9', 9, 'Do you experience soreness or pain in the genital area?', 'frequency'),
    ('haq_p8', 'haq_p8_q10', 10, 'Does your urine sometimes appear pink or rose-colored?', 'frequency'),
    ('haq_p8', 'haq_p8_q11', 11, 'Does a sudden urge to urinate sometimes cause accidental urine leakage?', 'frequency'),
    ('haq_p8', 'haq_p8_q12', 12, 'Do you generally feel as though you are retaining fluid throughout your body?', 'frequency'),
    ('haq_p9_a', 'haq_p9_a_q1', 1, 'Do the bones throughout your body feel achy, tender, or sore?', 'frequency'),
    ('haq_p9_a', 'haq_p9_a_q2', 2, 'Do you experience pain that feels localized to a specific bone?', 'frequency'),
    ('haq_p9_a', 'haq_p9_a_q3', 3, 'Do your hands, feet, or throat become tight, spasm, or feel numb?', 'frequency'),
    ('haq_p9_a', 'haq_p9_a_q4', 4, 'Do you have difficulty sitting upright or maintaining a straight posture?', 'frequency'),
    ('haq_p9_a', 'haq_p9_a_q5', 5, 'Do you experience upper-back pain?', 'frequency'),
    ('haq_p9_a', 'haq_p9_a_q6', 6, 'Do you experience lower-back pain?', 'frequency'),
    ('haq_p9_a', 'haq_p9_a_q7', 7, 'Do you experience pain while sitting or walking?', 'frequency'),
    ('haq_p9_a', 'haq_p9_a_q8', 8, 'Do you find yourself limping or favoring one leg?', 'frequency'),
    ('haq_p9_a', 'haq_p9_a_q9', 9, 'Do your shins hurt during or after exercise?', 'frequency'),
    ('haq_p9_b', 'haq_p9_b_q1', 1, 'Do you feel stiff when you wake up in the morning?', 'frequency'),
    ('haq_p9_b', 'haq_p9_b_q2', 2, 'Do you have difficulty bending down to pick clothing or other items up from the floor?', 'frequency'),
    ('haq_p9_b', 'haq_p9_b_q3', 3, 'Do you experience joint swelling, pain, or stiffness in areas such as the fingers, hands, wrists, elbows, shoulders, toes, feet, ankles, or knees?', 'frequency'),
    ('haq_p9_b', 'haq_p9_b_q4', 4, 'Do your joints hurt when you move or carry weight?', 'frequency'),
    ('haq_p9_b', 'haq_p9_b_q5', 5, 'Does routine exercise, such as daily walking, cause your knees to hurt or swell?', 'frequency'),
    ('haq_p9_b', 'haq_p9_b_q6', 6, 'Do you have difficulty opening jars that used to be easy for you to open?', 'frequency'),
    ('haq_p9_b', 'haq_p9_b_q7', 7, 'Do you experience discomfort, numbness, prickling, tingling, or pain in your neck, shoulder, or arm?', 'frequency'),
    ('haq_p9_b', 'haq_p9_b_q8', 8, 'Do you experience pain or aching on one side of your head that spreads toward your cheek, temple, lower jaw, ear, neck, or shoulder?', 'frequency'),
    ('haq_p9_b', 'haq_p9_b_q9', 9, 'Do you have difficulty chewing food or opening your mouth?', 'frequency'),
    ('haq_p9_b', 'haq_p9_b_q10', 10, 'Do you have difficulty standing up from a seated position?', 'frequency'),
    ('haq_p9_b', 'haq_p9_b_q11', 11, 'Do you experience shooting, aching, or tingling pain down the back of your leg?', 'frequency'),
    ('haq_p9_b', 'haq_p9_b_q12', 12, 'Is it difficult for you to reach overhead and lift an object weighing about five pounds, such as a bag of flour?', 'yes_no'),
    ('haq_p9_b', 'haq_p9_b_q13', 13, 'Do you injure, strain, or sprain yourself easily?', 'yes_no'),
    ('haq_p9_c', 'haq_p9_c_q1', 1, 'Do your muscles feel stiff, sore, tense, or achy?', 'frequency'),
    ('haq_p9_c', 'haq_p9_c_q2', 2, 'Do you experience burning, throbbing, shooting, or stabbing muscle pain?', 'frequency'),
    ('haq_p9_c', 'haq_p9_c_q3', 3, 'Do you experience muscle cramps or spasms, either unexpectedly or after physical activity?', 'frequency'),
    ('haq_p9_c', 'haq_p9_c_q4', 4, 'Is your muscle pain or stiffness worse in the morning than at other times of the day?', 'frequency'),
    ('haq_p9_c', 'haq_p9_c_q5', 5, 'Do specific areas of your body feel sore or tender when pressed?', 'frequency'),
    ('haq_p9_c', 'haq_p9_c_q6', 6, 'Do you wake up feeling unrefreshed?', 'frequency'),
    ('haq_p9_c', 'haq_p9_c_q7', 7, 'Do you experience headaches?', 'frequency'),
    ('haq_p9_c', 'haq_p9_c_q8', 8, 'Do you experience pain along the sides of your head or in your face, especially when waking?', 'frequency'),
    ('haq_p9_c', 'haq_p9_c_q9', 9, 'Does your jaw click or pop?', 'frequency'),
    ('haq_p9_c', 'haq_p9_c_q10', 10, 'Do you experience muscle twitching or tremors, such as around your eyelids, thumb, or calf?', 'frequency'),
    ('haq_p9_c', 'haq_p9_c_q11', 11, 'Do you have an irresistible urge to move your legs?', 'frequency'),
    ('haq_p9_c', 'haq_p9_c_q12', 12, 'Do your legs move while you are sleeping?', 'frequency'),
    ('haq_p9_c', 'haq_p9_c_q13', 13, 'Do you experience an unpleasant crawling sensation inside your calves when lying down?', 'frequency'),
    ('haq_p9_c', 'haq_p9_c_q14', 14, 'Do you experience numbness or pain in your hand or wrist that interferes with activities such as writing or buttoning clothing?', 'frequency'),
    ('haq_p9_c', 'haq_p9_c_q15', 15, 'Do you experience a pins-and-needles sensation in your thumb and first three fingers?', 'frequency'),
    ('haq_p9_c', 'haq_p9_c_q16', 16, 'Do you experience pain in your forearm that sometimes extends into your shoulder?', 'frequency'),
    ('haq_p10_a', 'haq_p10_a_q1', 1, 'Does your head sometimes feel unusually heavy?', 'frequency'),
    ('haq_p10_a', 'haq_p10_a_q2', 2, 'Do you experience dizziness?', 'frequency'),
    ('haq_p10_a', 'haq_p10_a_q3', 3, 'Do you have difficulty bending over, standing up from sitting, rolling over in bed, or turning your head from side to side?', 'frequency'),
    ('haq_p10_a', 'haq_p10_a_q4', 4, 'Do your hands tremble, even slightly, without an obvious reason?', 'frequency'),
    ('haq_p10_a', 'haq_p10_a_q5', 5, 'When walking, do your feet feel as though heavy weights are attached to them?', 'frequency'),
    ('haq_p10_a', 'haq_p10_a_q6', 6, 'Do you bump into things, trip, stumble, or feel clumsy?', 'frequency'),
    ('haq_p10_a', 'haq_p10_a_q7', 7, 'Do you have difficulty breathing?', 'frequency'),
    ('haq_p10_a', 'haq_p10_a_q8', 8, 'Do you have difficulty swallowing?', 'frequency'),
    ('haq_p10_a', 'haq_p10_a_q9', 9, 'Do people ask you to speak louder because they have difficulty hearing you?', 'frequency'),
    ('haq_p10_a', 'haq_p10_a_q10', 10, 'Does speaking or forming words sometimes feel less automatic than it should?', 'frequency'),
    ('haq_p10_a', 'haq_p10_a_q11', 11, 'Do you need 10-12 hours of sleep to feel rested?', 'frequency'),
    ('haq_p10_a', 'haq_p10_a_q12', 12, 'Do you feel weakness in your grip, find it difficult to hold your head up, or find lifting your arms unusually tiring?', 'frequency'),
    ('haq_p10_a', 'haq_p10_a_q13', 13, 'Do your hands tire easily when writing, or has your handwriting become noticeably smaller or less clear than it used to be?', 'yes_no'),
    ('haq_p10_a', 'haq_p10_a_q14', 14, 'Do the muscles in your arms or legs seem softer or smaller than they used to?', 'yes_no'),
    ('haq_p10_a', 'haq_p10_a_q15', 15, 'Have your eyesight, sense of smell, taste, or hearing become less sharp than they used to be?', 'yes_no'),
    ('haq_p10_a', 'haq_p10_a_q16', 16, 'Do you find yourself moving more slowly than you used to?', 'yes_no'),
    ('haq_p10_b', 'haq_p10_b_q1', 1, 'Do you have difficulty taking in or understanding new information?', 'frequency'),
    ('haq_p10_b', 'haq_p10_b_q2', 2, 'Do you tend to forget things?', 'frequency'),
    ('haq_p10_b', 'haq_p10_b_q3', 3, 'Do you have difficulty thinking clearly or concentrating?', 'frequency'),
    ('haq_p10_b', 'haq_p10_b_q4', 4, 'Are you easily distracted?', 'frequency'),
    ('haq_p10_b', 'haq_p10_b_q5', 5, 'Do you become frustrated quickly?', 'frequency'),
    ('haq_p10_b', 'haq_p10_b_q6', 6, 'Do you find it difficult to sit still for any length of time, including during meals?', 'frequency'),
    ('haq_p10_b', 'haq_p10_b_q7', 7, 'Do you often find it easier to start tasks than to finish them?', 'frequency'),
    ('haq_p10_b', 'haq_p10_b_q8', 8, 'Do you have more difficulty than usual solving problems or managing your time?', 'frequency'),
    ('haq_p10_b', 'haq_p10_b_q9', 9, 'Do you have a low tolerance for stress or everyday problems?', 'frequency')
),
inserted as (
  insert into unified_assessment_questions (
    assessment_definition_id, section_id, question_key, version, display_order, prompt, answer_type, answer_options
  )
  select
    def.id, hs.unified_section_id, bank.question_key, 1, bank.display_order, bank.prompt, 'single_select',
    case bank.response_type
      when 'frequency' then '[{"value":"never_or_rarely","label":"Never or rarely"},{"value":"sometimes","label":"Sometimes"},{"value":"often","label":"Often"},{"value":"very_often","label":"Very often"}]'::jsonb
      else '[{"value":"no","label":"No"},{"value":"yes","label":"Yes"}]'::jsonb
    end
  from def, bank
  join haq_sections hs on hs.section_id = bank.section_id
  returning id, question_key, version
)
insert into haq_questions (question_id, question_key, question_version, section_id, part_id, response_type)
select inserted.id, inserted.question_key, inserted.version, bank.section_id, hs.part_id, bank.response_type
from inserted
join bank on bank.question_key = inserted.question_key
join haq_sections hs on hs.section_id = bank.section_id;

alter table haq_questions enable row level security;

create policy authenticated_read_haq_questions on haq_questions
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- 6) One record per answered question, per instance. No member policy, and
--    no write policy for anybody: only the answer trigger below writes it.
-- ---------------------------------------------------------------------

create table haq_question_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references unified_assessment_sessions(id) on delete cascade,
  -- Deliberately no foreign key of its own: the instance's cascade removes
  -- this row, and a second cascade straight from auth.users could arrive
  -- while the completed instance still exists and be refused below.
  member_id uuid not null,
  question_id uuid not null references unified_assessment_questions(id),
  question_key text not null,
  part_id text not null,
  section_id text not null references haq_sections(section_id),
  question_version int not null,
  response_type text not null,
  selected_response text not null,
  hidden_value int not null,
  answered_at timestamptz not null,
  unique (session_id, question_id),
  foreign key (response_type, selected_response) references haq_response_scale(response_type, response_value)
);

create index haq_question_responses_session_section_idx on haq_question_responses (session_id, section_id);
create index haq_question_responses_member_idx on haq_question_responses (member_id);

alter table haq_question_responses enable row level security;

create policy coach_read_assigned_haq_question_responses on haq_question_responses
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_read_haq_question_responses on haq_question_responses
  for select using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 7) Section results, computed once at completion. No member policy.
-- ---------------------------------------------------------------------

create table haq_section_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references unified_assessment_sessions(id) on delete cascade,
  -- No foreign key of its own, for the reason given on haq_question_responses.
  member_id uuid not null,
  haq_version text not null,
  section_id text not null references haq_sections(section_id),
  raw_total int not null check (raw_total >= 0),
  result_color text not null check (result_color in ('green', 'yellow', 'red')),
  member_result_label text not null,
  original_priority text not null,
  computed_at timestamptz not null default now(),
  unique (session_id, section_id),
  constraint haq_section_results_state_mapping check (
    (result_color = 'green' and member_result_label = 'Doing Well' and original_priority = 'Low Priority')
    or (result_color = 'yellow' and member_result_label = 'Needs Attention' and original_priority = 'Moderate Priority')
    or (result_color = 'red' and member_result_label = 'High Attention' and original_priority = 'High Priority')
  )
);

create index haq_section_results_member_idx on haq_section_results (member_id, computed_at desc);

alter table haq_section_results enable row level security;

create policy coach_read_assigned_haq_section_results on haq_section_results
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_read_haq_section_results on haq_section_results
  for select using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 8) Body map structure. Never read by the scoring engine.
-- ---------------------------------------------------------------------

create table haq_body_map_entries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references unified_assessment_sessions(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  body_location text not null check (length(btrim(body_location)) > 0),
  body_side text not null check (body_side in ('front', 'back')),
  issue_type text not null check (issue_type in ('pain', 'swelling', 'discomfort', 'skin_change')),
  created_at timestamptz not null default now()
);

create index haq_body_map_entries_session_idx on haq_body_map_entries (session_id);
create index haq_body_map_entries_member_idx on haq_body_map_entries (member_id);

alter table haq_body_map_entries enable row level security;

create policy member_read_own_haq_body_map_entries on haq_body_map_entries
  for select using (member_id = auth.uid());

-- Only onto her own open HAQ instance.
create policy member_insert_own_haq_body_map_entries on haq_body_map_entries
  for insert with check (
    member_id = auth.uid()
    and exists (
      select 1
      from unified_assessment_sessions s
      join unified_assessment_definitions d on d.id = s.assessment_definition_id
      where s.id = haq_body_map_entries.session_id
        and s.member_id = auth.uid()
        and s.status = 'in_progress'
        and d.key = 'haq'
    )
  );

create policy member_delete_own_haq_body_map_entries on haq_body_map_entries
  for delete using (
    member_id = auth.uid()
    and exists (
      select 1 from unified_assessment_sessions s
      where s.id = haq_body_map_entries.session_id
        and s.member_id = auth.uid()
        and s.status = 'in_progress'
    )
  );

create policy coach_read_assigned_haq_body_map_entries on haq_body_map_entries
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_read_haq_body_map_entries on haq_body_map_entries
  for select using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 9) The engine: answers.
-- ---------------------------------------------------------------------

-- Before an answer row is stored or changed: is this a HAQ question, and if
-- so, is this an approved response on an open instance of the HAQ?
create or replace function public.haq_check_answer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_response_type text;
  v_question_definition uuid;
  v_session_status text;
  v_session_definition uuid;
begin
  if tg_op = 'UPDATE' then
    if old.question_id <> new.question_id or old.session_id <> new.session_id then
      if exists (select 1 from haq_questions where question_id in (old.question_id, new.question_id)) then
        raise exception 'A HAQ answer cannot be moved to another question or instance'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  select hq.response_type, uq.assessment_definition_id
    into v_response_type, v_question_definition
  from haq_questions hq
  join unified_assessment_questions uq on uq.id = hq.question_id
  where hq.question_id = new.question_id;

  if not found then
    return new;
  end if;

  select s.status, s.assessment_definition_id
    into v_session_status, v_session_definition
  from unified_assessment_sessions s
  where s.id = new.session_id;

  if v_session_definition is distinct from v_question_definition then
    raise exception 'A HAQ question can only be answered on a HAQ instance'
      using errcode = 'check_violation';
  end if;

  if v_session_status <> 'in_progress' then
    raise exception 'A completed HAQ instance is never changed'
      using errcode = 'check_violation';
  end if;

  if jsonb_typeof(new.value) <> 'string' or not exists (
    select 1 from haq_response_scale
    where response_type = v_response_type
      and response_value = new.value #>> '{}'
  ) then
    raise exception 'Response % is not accepted for a % question', new.value::text, v_response_type
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- After it is stored: write or replace the one response record, with its
-- hidden value. The answer's own answered_at is carried over, so a changed
-- answer records when it was last chosen.
create or replace function public.haq_record_answer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into haq_question_responses (
    session_id, member_id, question_id, question_key, part_id, section_id,
    question_version, response_type, selected_response, hidden_value, answered_at
  )
  select
    new.session_id, s.member_id, hq.question_id, hq.question_key, hq.part_id, hq.section_id,
    hq.question_version, hq.response_type, new.value #>> '{}', scale.hidden_value, new.answered_at
  from haq_questions hq
  join unified_assessment_sessions s on s.id = new.session_id
  join haq_response_scale scale
    on scale.response_type = hq.response_type
   and scale.response_value = new.value #>> '{}'
  where hq.question_id = new.question_id
  on conflict (session_id, question_id) do update set
    selected_response = excluded.selected_response,
    hidden_value = excluded.hidden_value,
    answered_at = excluded.answered_at;

  return new;
end;
$$;

-- An answer removed from an open instance takes its record with it: missing
-- is not zero. An answer on a completed instance cannot be removed while
-- that instance exists (a cascade from deleting the instance itself, as an
-- account deletion does, finds no instance and passes).
create or replace function public.haq_forget_answer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_status text;
begin
  if not exists (select 1 from haq_questions where question_id = old.question_id) then
    return old;
  end if;

  select status into v_session_status from unified_assessment_sessions where id = old.session_id;

  if v_session_status = 'completed' then
    raise exception 'A completed HAQ instance is never changed'
      using errcode = 'check_violation';
  end if;

  delete from haq_question_responses
  where session_id = old.session_id and question_id = old.question_id;

  return old;
end;
$$;

create trigger haq_check_answer_before_write
  before insert or update on unified_assessment_answers
  for each row execute function public.haq_check_answer();

create trigger haq_record_answer_after_write
  after insert or update on unified_assessment_answers
  for each row execute function public.haq_record_answer();

create trigger haq_forget_answer_before_delete
  before delete on unified_assessment_answers
  for each row execute function public.haq_forget_answer();

-- ---------------------------------------------------------------------
-- 10) The engine: completion and results.
-- ---------------------------------------------------------------------

-- One section's total against that section's own cutoffs. Not callable by a
-- member: a probe of it would reveal the cutoffs.
create or replace function public.haq_classify_section_total(p_section_id text, p_total int)
returns table (result_color text, member_result_label text, original_priority text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    case when p_total <= c.green_max then 'green' when p_total <= c.yellow_max then 'yellow' else 'red' end,
    case when p_total <= c.green_max then 'Doing Well' when p_total <= c.yellow_max then 'Needs Attention' else 'High Attention' end,
    case when p_total <= c.green_max then 'Low Priority' when p_total <= c.yellow_max then 'Moderate Priority' else 'High Priority' end
  from haq_section_cutoffs c
  where c.section_id = p_section_id;
$$;

revoke execute on function public.haq_classify_section_total(text, int) from public, anon, authenticated;

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

create or replace function public.haq_compute_section_results()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'completed' or old.status <> 'in_progress' then
    return new;
  end if;
  if not exists (
    select 1 from unified_assessment_definitions
    where id = new.assessment_definition_id and key = 'haq'
  ) then
    return new;
  end if;

  insert into haq_section_results (
    session_id, member_id, haq_version, section_id, raw_total,
    result_color, member_result_label, original_priority, computed_at
  )
  select
    new.id, new.member_id, 'haq_v' || new.assessment_version, hs.section_id, totals.raw_total,
    state.result_color, state.member_result_label, state.original_priority, new.completed_at
  from haq_sections hs
  cross join lateral (
    select coalesce(sum(r.hidden_value), 0)::int as raw_total
    from haq_question_responses r
    where r.session_id = new.id and r.section_id = hs.section_id
  ) totals
  cross join lateral public.haq_classify_section_total(hs.section_id, totals.raw_total) state
  where hs.haq_version = 'haq_v' || new.assessment_version;

  return new;
end;
$$;

create trigger haq_guard_instance_before_write
  before insert or update on unified_assessment_sessions
  for each row execute function public.haq_guard_instance();

create trigger haq_compute_section_results_after_complete
  after update on unified_assessment_sessions
  for each row execute function public.haq_compute_section_results();

-- ---------------------------------------------------------------------
-- 11) Records are write once.
-- ---------------------------------------------------------------------

create or replace function public.haq_protect_completed_records()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_status text;
begin
  if tg_table_name = 'haq_section_results' and tg_op = 'UPDATE' then
    raise exception 'HAQ section results are never changed'
      using errcode = 'check_violation';
  end if;

  select status into v_session_status from unified_assessment_sessions where id = old.session_id;

  -- A missing instance means this is the cascade from deleting the instance.
  if v_session_status = 'completed' then
    raise exception 'A completed HAQ instance is never changed'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger haq_protect_question_responses
  before update or delete on haq_question_responses
  for each row execute function public.haq_protect_completed_records();

create trigger haq_protect_section_results
  before update or delete on haq_section_results
  for each row execute function public.haq_protect_completed_records();

revoke execute on function public.haq_check_answer() from public, anon, authenticated;
revoke execute on function public.haq_record_answer() from public, anon, authenticated;
revoke execute on function public.haq_forget_answer() from public, anon, authenticated;
revoke execute on function public.haq_guard_instance() from public, anon, authenticated;
revoke execute on function public.haq_compute_section_results() from public, anon, authenticated;
revoke execute on function public.haq_protect_completed_records() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 12) The one member read of results: color and label, her own, nothing else.
-- ---------------------------------------------------------------------

create or replace function public.haq_member_section_results(p_session_id uuid)
returns table (section_id text, result_color text, member_result_label text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.section_id, r.result_color, r.member_result_label
  from haq_section_results r
  join haq_sections hs on hs.section_id = r.section_id
  where r.session_id = p_session_id
    and r.member_id = auth.uid()
  order by hs.display_order;
$$;

revoke execute on function public.haq_member_section_results(uuid) from public, anon;
grant execute on function public.haq_member_section_results(uuid) to authenticated;
