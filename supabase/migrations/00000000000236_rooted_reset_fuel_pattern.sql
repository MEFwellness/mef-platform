-- Rooted Reset Fuel Pattern Assessment, Build 1 of 4: the assessment core.
--
-- WHAT THIS REPLACES. The Primal Pattern Diet Type assessment is retired
-- from every member facing surface by this build. NOTHING OF ITS DATA IS
-- TOUCHED: primal_pattern_assessments, primal_pattern_answers, every
-- completed row and every registry finding it ever published stay exactly
-- where they are, and a coach keeps read access to all of it. The retirement
-- itself is decided in code, in one place (lib/assessment-registry/
-- registry.ts, retired: true), because that is where the plan map, the
-- member catalog and the coach assignable list all already read from. The
-- one thing this migration does about it is flip the catalog row's
-- descriptive is_active flag so a database side report agrees with the app.
--
-- WHAT THIS ADDS. A new assessment on the Unified Adaptive Assessment
-- Foundation and Runtime (migrations 98 and 99), following exactly the
-- pattern Core Values Snapshot (134), Life Signal Check (138) and
-- Readiness Pulse (141) established: a catalog row, a content definition
-- with sections and questions, and nothing new in the runtime itself. It
-- inherits Primal Pattern's slot in the plan map (monthly tier and up) and
-- nothing else.
--
-- Its own clean internal id throughout: key 'fuel-pattern', question keys
-- fpa_q1 to fpa_q24. No primal_pattern name, table or column is reused or
-- renamed.
--
-- The question rows below are GENERATED from
-- apps/consumer-web-app/lib/fuel-pattern/questionContent.ts by
-- apps/consumer-web-app/scripts/print-fuel-pattern-sql.mjs, and
-- tests/fuel-pattern-content.test.ts regenerates them and asserts this file
-- still matches. That is what keeps the scoring weight map from naming an
-- option value the database does not have.

-- 1) Catalog row for the new assessment.
insert into assessment_definitions (id, key, display_name, category) values
  ('30acea0e-123e-4094-80b3-8b4d8dc7b187', 'fuel-pattern', 'Rooted Reset Fuel Pattern Assessment', 'nutrition_lifestyle');

insert into assessment_definition_versions (assessment_definition_id, version, notes)
values ('30acea0e-123e-4094-80b3-8b4d8dc7b187', 1, 'Initial Rooted Reset Fuel Pattern Assessment release on the Unified Adaptive Assessment Runtime.');

-- 2) Primal Pattern's catalog row, marked inactive. Descriptive only: the
-- real retirement is the registry entry's own retired flag, and this column
-- has always been documented as audit metadata rather than a second source
-- of truth for behaviour (migration 70). No row of member data is touched.
update assessment_definitions
set is_active = false, updated_at = now()
where key = 'primal-pattern-diet-type';

-- 3) Content: definition, 4 sections, 24 questions, one per screen.
--
-- No question sets concern_category, severity_tags or validation. Like
-- Core Values Snapshot and Readiness Pulse, this is a listening
-- instrument rather than a symptom instrument, so it deliberately
-- produces zero Universal Registry findings. adaptive_enabled is false:
-- every member is asked all 24, in order.
with def as (
  insert into unified_assessment_definitions (
    key, catalog_definition_id, title, description, assessment_type,
    estimated_completion_time_minutes, adaptive_enabled, reassessment_enabled,
    safety_enabled, version, active
  ) values (
    'fuel-pattern',
    '30acea0e-123e-4094-80b3-8b4d8dc7b187',
    'Rooted Reset Fuel Pattern Assessment',
    'Twenty four questions about how food actually lands, producing a starting fuel pattern rather than a prescription.',
    'fuel_pattern',
    7, false, true, false, 1, true
  )
  returning id
),
sections as (
  insert into unified_assessment_sections (assessment_definition_id, title, subtitle, display_order)
  select def.id, v.title, v.subtitle, v.display_order
  from def, (values
    ('Fuel and Satiety', null, 1),
    ('Meals Through the Day', null, 2),
    ('Appetite and Portions', null, 3),
    ('The Whole Picture', null, 4)
  ) as v(title, subtitle, display_order)
  returning id, title
)
insert into unified_assessment_questions (
  assessment_definition_id, section_id, question_key, display_order, prompt, description, answer_type, answer_options
)
select def.id, sections.id, q.question_key, q.display_order, q.prompt, q.description, q.answer_type, q.answer_options
from def, sections, (values
  ('Fuel and Satiety', 'fpa_q1', 1,
   'After a meal that feels especially satisfying, how long can you usually go before becoming genuinely hungry again?',
   null, 'single_select',
   '[{"value":"under_2h","label":"Less than 2 hours"},{"value":"two_to_three_h","label":"Around 2 to 3 hours"},{"value":"three_to_four_h","label":"Around 3 to 4 hours"},{"value":"over_4h","label":"4+ hours"},{"value":"not_sure","label":"It varies, I''m not sure"}]'::jsonb),
  ('Fuel and Satiety', 'fpa_q2', 2,
   'Which kind of meal tends to keep your energy most stable?',
   null, 'single_select',
   '[{"value":"protein_veg_fat","label":"Protein-rich with vegetables and some healthy fat"},{"value":"balanced_mix","label":"A balanced mix of protein, carbohydrate and fat"},{"value":"carb_plus_protein","label":"A meal with plenty of carbohydrate plus some protein"},{"value":"no_difference","label":"I haven''t noticed a difference"},{"value":"depends_on_day","label":"It depends on the day"}]'::jsonb),
  ('Fuel and Satiety', 'fpa_q3', 3,
   'After a carbohydrate-heavy meal such as pasta, rice, bread or cereal, how do you usually feel?',
   null, 'single_select',
   '[{"value":"energized","label":"Energized and satisfied"},{"value":"steady","label":"Fine and fairly steady"},{"value":"hungry_soon","label":"Hungry again fairly quickly"},{"value":"sleepy_foggy","label":"Sleepy, foggy or sluggish"},{"value":"not_sure","label":"It varies, I''m not sure"}]'::jsonb),
  ('Fuel and Satiety', 'fpa_q4', 4,
   'After a protein-rich meal, how do you usually feel?',
   null, 'single_select',
   '[{"value":"very_satisfied","label":"Very satisfied and steady"},{"value":"want_carb","label":"Good, but I still want some carbohydrate"},{"value":"too_heavy","label":"Too heavy or overly full"},{"value":"no_difference","label":"Not much different"},{"value":"not_sure","label":"It varies, I''m not sure"}]'::jsonb),
  ('Fuel and Satiety', 'fpa_q5', 5,
   'When you have something sweet by itself, what usually happens afterward?',
   null, 'single_select',
   '[{"value":"crash","label":"I feel good briefly, then crash or get hungry"},{"value":"small_boost","label":"I notice a small boost, then return to normal"},{"value":"fairly_steady","label":"I feel fairly steady"},{"value":"tolerate_well","label":"I generally tolerate it well"},{"value":"not_sure","label":"It varies, I''m not sure"}]'::jsonb),
  ('Fuel and Satiety', 'fpa_q6', 6,
   'When you become very hungry, what do you tend to want first?',
   null, 'single_select',
   '[{"value":"savory_protein","label":"Meat, eggs, cheese or another savory protein-rich food"},{"value":"complete_meal","label":"A complete balanced meal"},{"value":"starch_or_sweet","label":"Bread, rice, pasta, fruit or something sweet"},{"value":"salty_crunchy","label":"Something salty or crunchy"},{"value":"no_pattern","label":"No consistent pattern"}]'::jsonb),
  ('Meals Through the Day', 'fpa_q7', 7,
   'Which breakfast tends to keep you feeling best?',
   null, 'single_select',
   '[{"value":"protein_fat_small_carb","label":"Protein + healthy fat + smaller amount of carbohydrate"},{"value":"protein_plus_carb","label":"Protein + fruit or whole-food carbohydrate"},{"value":"carb_centered","label":"Oatmeal, fruit, toast or another carbohydrate-centered breakfast"},{"value":"skips_breakfast","label":"I usually don''t eat breakfast"},{"value":"varies","label":"It varies"}]'::jsonb),
  ('Meals Through the Day', 'fpa_q8', 8,
   'If breakfast is mostly carbohydrate, how do you usually feel afterward?',
   null, 'single_select',
   '[{"value":"hungry_quickly","label":"Hungry again quickly"},{"value":"energetic_then_fade","label":"Energetic initially, then I fade"},{"value":"good_stable","label":"Pretty good and stable"},{"value":"better_than_protein","label":"Better than I do after a heavier protein breakfast"},{"value":"not_sure","label":"I''m not sure"}]'::jsonb),
  ('Meals Through the Day', 'fpa_q9', 9,
   'When a meal gets delayed, what tends to happen?',
   null, 'single_select',
   '[{"value":"irritable_shaky","label":"I become very hungry, irritable or shaky"},{"value":"focus_drops","label":"My focus and energy drop noticeably"},{"value":"manage_comfortably","label":"I get hungry but manage comfortably"},{"value":"go_a_long_while","label":"I can usually go quite a while without eating"},{"value":"depends","label":"It depends"}]'::jsonb),
  ('Meals Through the Day', 'fpa_q10', 10,
   'Which dinner usually leaves you feeling best afterward?',
   null, 'single_select',
   '[{"value":"protein_centered","label":"Protein-centered with vegetables"},{"value":"balanced_plate","label":"Balanced protein, vegetables and starch"},{"value":"lighter_veg_carb","label":"A lighter meal with more vegetables and carbohydrate"},{"value":"no_pattern","label":"I don''t notice a pattern"},{"value":"varies","label":"It varies"}]'::jsonb),
  ('Meals Through the Day', 'fpa_q11', 11,
   'Which type of dinner tends to support your best sleep?',
   null, 'single_select',
   '[{"value":"protein_and_fat","label":"More protein and healthy fat"},{"value":"balanced_meal","label":"A balanced meal"},{"value":"more_carb","label":"A little more carbohydrate"},{"value":"no_effect","label":"Meal composition doesn''t seem to affect my sleep"},{"value":"not_sure","label":"I''m not sure"}]'::jsonb),
  ('Meals Through the Day', 'fpa_q12', 12,
   'How do you usually feel after a very low-fat meal?',
   null, 'single_select',
   '[{"value":"unsatisfied","label":"Unsatisfied or still hungry"},{"value":"fine_with_protein","label":"Fine if there is enough protein"},{"value":"light_energized","label":"Light and energized"},{"value":"no_difference","label":"No noticeable difference"},{"value":"varies","label":"It varies"}]'::jsonb),
  ('Meals Through the Day', 'fpa_q13', 13,
   'How do you usually feel after a higher-fat meal?',
   null, 'single_select',
   '[{"value":"more_satisfied","label":"More satisfied and steady"},{"value":"fine_if_portioned","label":"Comfortable as long as the portion is reasonable"},{"value":"heavy_sluggish","label":"Heavy or sluggish"},{"value":"no_difference","label":"No noticeable difference"},{"value":"varies","label":"It varies"}]'::jsonb),
  ('Meals Through the Day', 'fpa_q14', 14,
   'After exercise, what sounds most appealing?',
   null, 'single_select',
   '[{"value":"savory_protein","label":"Protein-rich savory food"},{"value":"balanced_meal","label":"A balanced meal"},{"value":"fruit_or_grains","label":"Fruit, grains or another carbohydrate source"},{"value":"nothing_particular","label":"Nothing in particular"},{"value":"depends_on_workout","label":"It depends on the workout"}]'::jsonb),
  ('Meals Through the Day', 'fpa_q15', 15,
   'What best describes your afternoon energy?',
   null, 'single_select',
   '[{"value":"steadier_with_protein","label":"More stable when lunch contains plenty of protein"},{"value":"best_after_balanced","label":"Best after a balanced lunch"},{"value":"better_with_carb","label":"Better when lunch contains enough carbohydrate"},{"value":"dip_regardless","label":"I often experience an afternoon dip regardless"},{"value":"varies","label":"It varies"}]'::jsonb),
  ('Meals Through the Day', 'fpa_q16', 16,
   'Which type of snack tends to satisfy you longest?',
   null, 'single_select',
   '[{"value":"protein_fat","label":"Protein/fat such as yogurt, eggs, nuts or cheese"},{"value":"protein_plus_carb","label":"Protein plus fruit or another carbohydrate"},{"value":"carb_snack","label":"Fruit, crackers or another carbohydrate"},{"value":"snacks_rarely_satisfy","label":"Snacks rarely satisfy me"},{"value":"varies","label":"It varies"}]'::jsonb),
  ('Appetite and Portions', 'fpa_q17', 17,
   'How would you describe your appetite most days?',
   null, 'single_select',
   '[{"value":"strong","label":"Strong"},{"value":"moderate","label":"Moderate"},{"value":"light","label":"Light"},{"value":"highly_variable","label":"Highly variable"},{"value":"hard_to_tell","label":"Hard to tell"}]'::jsonb),
  ('Appetite and Portions', 'fpa_q18', 18,
   'Which meal size usually feels best for you?',
   null, 'single_select',
   '[{"value":"substantial","label":"More substantial meals"},{"value":"moderate","label":"Moderate meals"},{"value":"smaller_lighter","label":"Smaller, lighter meals"},{"value":"changes_through_day","label":"It changes throughout the day"},{"value":"not_sure","label":"I''m not sure"}]'::jsonb),
  ('Appetite and Portions', 'fpa_q19', 19,
   'How does a very large meal usually affect you?',
   null, 'single_select',
   '[{"value":"satisfied_calm","label":"Satisfied and calm"},{"value":"fine_if_balanced","label":"Fine if it is balanced"},{"value":"heavy_sleepy","label":"Heavy or sleepy"},{"value":"depends_on_food","label":"It depends heavily on what I ate"},{"value":"not_sure","label":"I''m not sure"}]'::jsonb),
  ('Appetite and Portions', 'fpa_q20', 20,
   'When you are under stress, what usually happens to your eating?',
   null, 'single_select',
   '[{"value":"hungrier_substantial","label":"I become hungrier and want substantial food"},{"value":"crave_sweets_starches","label":"I crave sweets or starches"},{"value":"appetite_decreases","label":"My appetite decreases"},{"value":"unpredictable","label":"My eating becomes unpredictable"},{"value":"no_effect","label":"Stress doesn''t affect it much"}]'::jsonb),
  ('The Whole Picture', 'fpa_q21', 21,
   'Which statement best describes your digestion after your usual meals?',
   null, 'single_select',
   '[{"value":"best_with_protein_fat","label":"I tend to feel best when meals include enough protein and fat"},{"value":"best_balanced","label":"I tend to feel best with balanced mixed meals"},{"value":"best_lighter_plants","label":"I tend to feel best with lighter meals containing more plant foods and carbohydrate"},{"value":"discomfort_regardless","label":"I frequently experience digestive discomfort regardless"},{"value":"havent_noticed","label":"I haven''t noticed"}]'::jsonb),
  ('The Whole Picture', 'fpa_q22', 22,
   'Thinking about your energy across an entire day, which pattern sounds most familiar?',
   null, 'single_select',
   '[{"value":"need_substantial","label":"I need substantial meals to stay steady"},{"value":"balanced_consistent","label":"Balanced meals keep me fairly consistent"},{"value":"better_lighter","label":"I generally feel better eating lighter meals"},{"value":"changes_regardless","label":"My energy changes considerably regardless of food"},{"value":"not_sure","label":"I''m not sure"}]'::jsonb),
  ('The Whole Picture', 'fpa_q23', 23,
   'How would you describe your overall sense of physical vitality lately?',
   'This can include general energy, motivation, physical drive and interest in intimacy. Answer only what feels comfortable.', 'single_select',
   '[{"value":"strong_consistent","label":"Strong and consistent"},{"value":"generally_good","label":"Generally good"},{"value":"comes_and_goes","label":"Comes and goes"},{"value":"noticeably_lower","label":"Noticeably lower than usual"},{"value":"very_low","label":"Very low lately"},{"value":"prefer_not_to_answer","label":"Prefer not to answer"}]'::jsonb),
  ('The Whole Picture', 'fpa_q24', 24,
   'If you had no nutrition rules to follow, which plate would naturally appeal to you most?',
   null, 'single_select',
   '[{"value":"protein_forward","label":"Protein-forward","detail":"Protein, vegetables, healthy fat and a smaller starch portion"},{"value":"balanced","label":"Balanced","detail":"Protein, vegetables, a moderate starch portion and healthy fat"},{"value":"carb_forward","label":"Carbohydrate-forward","detail":"Vegetables, a larger whole-food carbohydrate portion and moderate protein"},{"value":"really_depends","label":"It really depends."}]'::jsonb)
) as q(section_title, question_key, display_order, prompt, description, answer_type, answer_options)
where sections.title = q.section_title;

-- 4) Her result. One row per completed sitting.
--
-- WHY A STORED ROW RATHER THAN A LIVE RECOMPUTE. Core Values Snapshot and
-- Readiness Pulse recompute their reading from stored answers on every
-- render, which is right for them: their scoring is a reading of the
-- answers and carries no independent facts. This instrument does carry
-- them. The digestive discomfort flag and the vitality response are
-- deliberately NOT part of the fuel pattern, so they have nowhere to live
-- inside a recomputed score, and the coach view in Build 2 needs the
-- pattern that was actually reported to her on the day, not the pattern a
-- later weight map would produce from the same answers.
--
-- RAW SCORES ARE NEVER SHOWN TO A MEMBER. They are stored for the coach
-- view. The member facing surfaces read the pattern alone.
create table fuel_pattern_results (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references unified_assessment_sessions(id) on delete cascade,

  pattern text not null check (pattern in ('protein_supportive', 'balanced_fuel', 'carb_supportive', 'flexible_fuel')),
  confidence text not null check (confidence in ('high', 'moderate', 'low')),

  protein_score int not null,
  balanced_score int not null,
  carb_score int not null,

  -- The two denominators the Flexible Fuel rule and the confidence rule
  -- both read, stored so a coach screen can say what it counted rather
  -- than recount it.
  scored_question_count int not null,
  zero_weight_count int not null,

  -- question_key to the option value she chose, all 24.
  responses jsonb not null default '{}'::jsonb,
  -- Zero weight answers that describe neither direction, as codes.
  response_tendencies text[] not null default '{}',

  -- Question 21's fourth option. A coaching signal, never scored.
  digestive_discomfort boolean not null default false,
  -- Question 23. Contextual only, never scored, null when she did not answer.
  vitality_response text,

  created_at timestamptz not null default now()
);

-- ONE RESULT PER SITTING, ENFORCED BY THE DATABASE. The completion path
-- reads before it inserts, and a read-then-insert without a unique index
-- is a race: finishing is a Server Action, and a Server Action re-renders
-- the route it was called from, so the same completion can arrive twice
-- inside the same second.
create unique index fuel_pattern_results_one_per_session
  on fuel_pattern_results (session_id);

create index fuel_pattern_results_member_idx
  on fuel_pattern_results (member_id, created_at desc);

alter table fuel_pattern_results enable row level security;

create policy member_read_own_fuel_pattern_results on fuel_pattern_results
  for select
  using (member_id = auth.uid());

create policy member_insert_own_fuel_pattern_results on fuel_pattern_results
  for insert
  with check (member_id = auth.uid());

create policy coach_read_assigned_fuel_pattern_results on fuel_pattern_results
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_fuel_pattern_results on fuel_pattern_results
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
