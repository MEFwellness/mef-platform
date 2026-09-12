-- The MEF Whole-Body Signal Assessment's practitioner library: the eight
-- cross section patterns and the fifty three coaching questions.
--
-- BOTH TABLES ARE COACH ONLY (migration 225). Neither has a member select
-- policy and neither may ever have one.
--
-- WHERE THE NUMBER 50 IS, AND WHERE IT IS NOT. The specification writes
-- ">= 50" beside every section and combination rule. That number is stored
-- ONCE, as whole_body_signal_settings 'load.elevated_min_percent', and the
-- rules below omit it so they read from that one place. A rule that
-- genuinely needs its own threshold may carry "minPercent" and the
-- evaluator prefers it; none of the approved rules does. The same applies
-- to the answer level rules and 'why.strong_min_signal', which is the one
-- definition of a strong answer this whole instrument uses.
--
-- Schema is migration 225. The rest of the content is migration 226.

-- ---------------------------------------------------------------------
-- The eight cross section patterns, verbatim.
-- ---------------------------------------------------------------------
insert into whole_body_signal_patterns (pattern_key, position, title, rule, coach_text)
values
  ('stress_digestion_axis', 1, 'Stress and Digestion Axis',
   '{"type":"sections_at_or_above","sections":["stress_recovery","digestive_flow"]}'::jsonb,
   'Stress and digestion are elevated together. The nervous system and the digestive system are likely feeding each other.'),
  ('rhythm_disruption_cluster', 2, 'Rhythm Disruption Cluster',
   '{"type":"sections_at_or_above","sections":["fuel_rhythm","body_clock"]}'::jsonb,
   'Meal timing and sleep timing are breaking down together. The daily rhythm itself may be the pattern, not either area alone.'),
  ('depletion_pattern', 3, 'Depletion Pattern',
   '{"type":"sections_at_or_above","sections":["stress_recovery","recovery_capacity","body_clock"]}'::jsonb,
   'Load, recovery and sleep rhythm are all elevated. The picture suggests sustained output without matching restoration.'),
  ('elimination_chain', 4, 'Elimination Chain',
   '{"type":"sections_at_or_above","sections":["digestive_flow","clearance_elimination"]}'::jsonb,
   'Digestive and elimination signals are moving together. Look at whether lower-digestive responses are driving both.'),
  ('gut_history_echo', 5, 'Gut History Echo',
   '{"type":"sections_at_or_above","sections":["gut_environment","digestive_flow"]}'::jsonb,
   'Current digestive signals sit on top of a gut history pattern. The story likely goes back further than recent meals.'),
  ('fuel_instability', 6, 'Fuel Instability',
   '{"type":"sections_at_or_above","sections":["fuel_quality","fuel_rhythm"]}'::jsonb,
   'Both what is eaten and when it is eaten are elevated. Blood sugar stability deserves early attention.'),
  ('hormone_sleep_link', 7, 'Hormone and Sleep Link',
   '{"type":"sections_at_or_above","sections":["hormone_pelvic_rhythm","body_clock"]}'::jsonb,
   'Hormonal signals and sleep rhythm are elevated together. Ask whether they changed around the same time.'),
  ('whole_system_load', 8, 'Whole-System Load',
   '{"type":"sections_count_at_or_above","minCount":5}'::jsonb,
   'Signals are widespread rather than concentrated. Prioritize capacity and foundations before chasing any single area.')
on conflict (pattern_key) do nothing;

-- ---------------------------------------------------------------------
-- The coaching question library, verbatim.
--
-- trigger_type decides the ORDER a sitting surfaces them in: combination
-- first, then answer level, then Zone level, then section level. It is a
-- column rather than something inferred from the shape of the trigger, so
-- that order is a stored fact a coach can see.
-- ---------------------------------------------------------------------
insert into whole_body_signal_coaching_questions
  (question_key, position, trigger_type, trigger, question, topic)
values
  -- Combination triggers.
  ('cmb_stress_digestion', 1, 'combination',
   '{"type":"sections_at_or_above","sections":["stress_recovery","digestive_flow"]}'::jsonb,
   'When your stress increases, what do you notice changing in your digestion?', 'Stress and digestion axis'),
  ('cmb_stress_sleep', 2, 'combination',
   '{"type":"sections_at_or_above","sections":["stress_recovery","body_clock"]}'::jsonb,
   'On your most stressful days, what happens to your sleep that night?', 'Stress and sleep'),
  ('cmb_depletion', 3, 'combination',
   '{"type":"sections_at_or_above","sections":["stress_recovery","recovery_capacity"]}'::jsonb,
   'When you rest, does your body actually let you rest, or does it stay on duty?', 'Depletion'),
  ('cmb_rhythm_cluster', 4, 'combination',
   '{"type":"sections_at_or_above","sections":["fuel_rhythm","body_clock"]}'::jsonb,
   'Do your meal times and your sleep times tend to fall apart together, or does one drag the other?', 'Rhythm cluster'),
  ('cmb_energy_management', 5, 'combination',
   '{"type":"sections_at_or_above","sections":["fuel_rhythm","recovery_capacity"]}'::jsonb,
   'When your energy crashes, do you reach for food, caffeine, or just push through?', 'Energy management'),
  ('cmb_elimination_chain', 6, 'combination',
   '{"type":"sections_at_or_above","sections":["digestive_flow","clearance_elimination"]}'::jsonb,
   'Are your digestion and your bathroom pattern acting up at the same times, or separately?', 'Elimination chain'),
  ('cmb_gut_history_echo', 7, 'combination',
   '{"type":"sections_at_or_above","sections":["gut_environment","digestive_flow"]}'::jsonb,
   'Have your digestive symptoms ever gone quiet for weeks and then returned, and what was happening when they came back?', 'Gut history echo'),
  ('cmb_hormone_sleep', 8, 'combination',
   '{"type":"sections_at_or_above","sections":["hormone_pelvic_rhythm","body_clock"]}'::jsonb,
   'Have your sleep changes and your hormonal changes shown up around the same time?', 'Hormone and sleep link'),
  ('cmb_hormone_stress', 9, 'combination',
   '{"type":"sections_at_or_above","sections":["hormone_pelvic_rhythm","stress_recovery"]}'::jsonb,
   'Do you notice your stress tolerance change across the month, or has it become harder to predict?', 'Hormone and stress'),
  ('cmb_natural_rhythm', 10, 'combination',
   '{"type":"sections_at_or_above","sections":["body_clock","recovery_capacity"]}'::jsonb,
   'If your schedule disappeared for a week, when do you think your body would naturally sleep and wake?', 'Natural rhythm'),

  -- Answer level triggers.
  ('ans_fq5_sugar', 11, 'answer', '{"type":"answer","questions":["FQ5"]}'::jsonb,
   'When do the sugar cravings hit hardest, and what is usually happening around that time?', 'Sugar pattern'),
  ('ans_fq7_stress_eating', 12, 'answer', '{"type":"answer","questions":["FQ7"]}'::jsonb,
   'When life gets busy, what is the first thing that changes about your food?', 'Stress eating'),
  ('ans_fr2_consistency', 13, 'answer', '{"type":"answer","questions":["FR2"]}'::jsonb,
   'What usually gets in the way of eating consistently on your busiest days?', 'Meal consistency'),
  ('ans_fr7_blood_sugar', 14, 'answer', '{"type":"answer","questions":["FR7"]}'::jsonb,
   'How long can you comfortably go between meals before your body starts complaining?', 'Blood sugar'),
  ('ans_fr8_late_eating', 15, 'answer', '{"type":"answer","questions":["FR8"]}'::jsonb,
   'What does the last meal or snack of your day usually look like, and when?', 'Late eating'),
  ('ans_df1_bloating', 16, 'answer', '{"type":"answer","questions":["DF1"]}'::jsonb,
   'Does the bloating follow certain foods, certain meals, or does it seem random?', 'Bloating pattern'),
  ('ans_df3_upper_digestion', 17, 'answer', '{"type":"answer","questions":["DF3"]}'::jsonb,
   'When does the burning or reflux tend to show up: during meals, after, or at night?', 'Upper digestion'),
  ('ans_df11_stress_digestion', 18, 'answer', '{"type":"answer","questions":["DF11"]}'::jsonb,
   'Do you notice your digestion change before you consciously feel stressed, or afterward?', 'Stress and digestion'),
  ('ans_ge_antibiotics', 19, 'answer', '{"type":"answer","questions":["GE1","GE2"]}'::jsonb,
   'Tell me about the antibiotics: roughly when, how many rounds, and what changed after.', 'Gut history'),
  ('ans_ge8_travel', 20, 'answer', '{"type":"answer","questions":["GE8"]}'::jsonb,
   'What happened with your digestion after that trip, and did it ever fully return to normal?', 'Gut history'),
  ('ans_ce2_elimination', 21, 'answer', '{"type":"answer","questions":["CE2"]}'::jsonb,
   'What does a normal week of bathroom patterns actually look like for you?', 'Elimination'),
  ('ans_ce8_alcohol', 22, 'answer', '{"type":"answer","questions":["CE8"]}'::jsonb,
   'How many drinks in an evening does it take before you feel it the next day?', 'Alcohol load'),
  ('ans_sr2_mental_load', 23, 'answer', '{"type":"answer","questions":["SR2"]}'::jsonb,
   'When your mind will not switch off, what is it usually working on?', 'Mental load'),
  ('ans_sr5_tension', 24, 'answer', '{"type":"answer","questions":["SR5"]}'::jsonb,
   'Where in your body do you tend to notice stress first?', 'Tension mapping'),
  ('ans_sr11_support', 25, 'answer', '{"type":"answer","questions":["SR11"]}'::jsonb,
   'Who in your life actually knows how much you are carrying right now?', 'Support'),
  ('ans_sr12_self_sacrifice', 26, 'answer', '{"type":"answer","questions":["SR12"]}'::jsonb,
   'Whose needs come before yours in a normal week, and where do you fit in?', 'Self-sacrifice'),
  ('ans_bc4_night_waking', 27, 'answer', '{"type":"answer","questions":["BC4"]}'::jsonb,
   'When you wake during the night, about what time is it, and what is your mind doing?', 'Night waking'),
  ('ans_bc12_caffeine', 28, 'answer', '{"type":"answer","questions":["BC12"]}'::jsonb,
   'Walk me through your caffeine on a normal day: what, when, and how much.', 'Caffeine'),
  ('ans_hpu1_bladder', 29, 'answer', '{"type":"answer","questions":["HPU1"]}'::jsonb,
   'How is the bladder pattern affecting your daily life: exercise, sleep, going out?', 'Pelvic function'),
  ('ans_hpu4_hormonal', 30, 'answer', '{"type":"answer","questions":["HPU4"]}'::jsonb,
   'If the hormonal side of things improved, what part of your everyday life would change most?', 'Hormonal impact'),
  ('ans_rc6_stimulants', 31, 'answer', '{"type":"answer","questions":["RC6"]}'::jsonb,
   'What gets you through the afternoon right now, and what would happen without it?', 'Stimulant reliance'),
  ('ans_rc8_wired_tired', 32, 'answer', '{"type":"answer","questions":["RC8"]}'::jsonb,
   'When you finally lie down exhausted, what happens: do you drop off, or does your body stay switched on?', 'Wired but tired'),

  -- Zone level triggers, on the PRIMARY Zone only.
  ('zone_1_foundation', 33, 'zone', '{"type":"primary_zone","zone":"zone_1"}'::jsonb,
   'What parts of your basic daily foundation, like food, elimination and routine, feel least steady right now?', 'Foundation'),
  ('zone_2_pelvic', 34, 'zone', '{"type":"primary_zone","zone":"zone_2"}'::jsonb,
   'What do you notice in your low back, hips and pelvis during a normal week?', 'Pelvic and sacral'),
  ('zone_3_digestive', 35, 'zone', '{"type":"primary_zone","zone":"zone_3"}'::jsonb,
   'When you push hard through a day, what do you notice around your stomach and your energy afterward?', 'Digestive and metabolic'),
  ('zone_4_heart', 36, 'zone', '{"type":"primary_zone","zone":"zone_4"}'::jsonb,
   'How is your breathing during a normal day: full and easy, or high and shallow?', 'Heart and chest'),
  ('zone_5_neck', 37, 'zone', '{"type":"primary_zone","zone":"zone_5"}'::jsonb,
   'What do you notice in your neck, shoulders and jaw at the end of a full day?', 'Neck and throat'),
  ('zone_6_head', 38, 'zone', '{"type":"primary_zone","zone":"zone_6"}'::jsonb,
   'What is your mind like when everything finally goes quiet at night?', 'Head and nervous system'),

  -- Section level triggers.
  ('sec_fq_typical_day', 39, 'section', '{"type":"section","section":"fuel_quality"}'::jsonb,
   'Walk me through what you eat on a typical day, starting with the first thing after waking.', 'Food quality'),
  ('sec_fq_easiest_meals', 40, 'section', '{"type":"section","section":"fuel_quality"}'::jsonb,
   'Which meals feel easiest to get right, and which fall apart first?', 'Food quality'),
  ('sec_fr_demanding_days', 41, 'section', '{"type":"section","section":"fuel_rhythm"}'::jsonb,
   'What normally happens with meals on your most demanding days?', 'Meal rhythm'),
  ('sec_fr_energy_dip', 42, 'section', '{"type":"section","section":"fuel_rhythm"}'::jsonb,
   'When during the day do you first notice your energy dip?', 'Energy rhythm'),
  ('sec_df_first_noticed', 43, 'section', '{"type":"section","section":"digestive_flow"}'::jsonb,
   'When did you first start noticing your digestion acting this way?', 'Digestive history'),
  ('sec_df_worst_times', 44, 'section', '{"type":"section","section":"digestive_flow"}'::jsonb,
   'Which meals or times of day feel worst for your digestion?', 'Digestive timing'),
  ('sec_ge_last_normal', 45, 'section', '{"type":"section","section":"gut_environment"}'::jsonb,
   'Looking back over the past few years, when did your digestion last feel truly normal?', 'Gut history'),
  ('sec_ce_water', 46, 'section', '{"type":"section","section":"clearance_elimination"}'::jsonb,
   'How much water do you actually get down on a normal day, and what makes it hard to drink more?', 'Hydration'),
  ('sec_sr_stress_mapping', 47, 'section', '{"type":"section","section":"stress_recovery"}'::jsonb,
   'When your stress is at its highest, what changes first in your body?', 'Stress mapping'),
  ('sec_sr_recovery_contrast', 48, 'section', '{"type":"section","section":"stress_recovery"}'::jsonb,
   'When you get several days away from your normal responsibilities, what changes?', 'Recovery contrast'),
  ('sec_bc_evening_routine', 49, 'section', '{"type":"section","section":"body_clock"}'::jsonb,
   'Walk me through your last hour before sleep on a normal night.', 'Evening routine'),
  ('sec_bc_schedule_conflict', 50, 'section', '{"type":"section","section":"body_clock"}'::jsonb,
   'What time does your body naturally want to sleep, and what time does life let it?', 'Schedule conflict'),
  ('sec_hp_unmentioned', 51, 'section', '{"type":"section","section":"hormone_pelvic_rhythm"}'::jsonb,
   'What changes have you noticed in your body over the past year that you have not mentioned to anyone yet?', 'Hormonal change'),
  ('sec_rc_rest_quality', 52, 'section', '{"type":"section","section":"recovery_capacity"}'::jsonb,
   'What does rest actually look like for you in a normal week?', 'Rest quality'),
  ('sec_rc_recovery_contrast', 53, 'section', '{"type":"section","section":"recovery_capacity"}'::jsonb,
   'When was the last time you woke up feeling genuinely restored, and what was different then?', 'Recovery contrast')
on conflict (question_key) do nothing;
