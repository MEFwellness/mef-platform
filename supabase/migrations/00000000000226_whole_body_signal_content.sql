-- The MEF Whole-Body Signal Assessment, its approved content.
--
-- Every row below is the practitioner approved specification. The question
-- prompts, the Zone reference map, the band cut offs and their copy, the
-- Section 8 routing question and its branch map, and the two coach facing
-- columns on every question (organ or gland, coach topic) are VERBATIM.
--
-- Three kinds of row are authored here rather than copied, and each is
-- marked so the next person to read this table can see which is which:
--
--   member_transition_line and member_area_phrase on a section, because
--     the specification gives a practitioner's description of what the
--     section covers and a member needs a sentence rather than a note.
--   member_theme on a question, because the specification gives a COACH
--     topic and a member may never read one. It is NOT NULL on purpose:
--     a nullable column with a fallback to coach_topic would be a
--     practitioner label one missing row away from her screen.
--   the member and coach copy rows that the specification names without
--     giving words for, each carrying a note saying so.
--
-- Schema is migration 225. Patterns and the coaching question library are
-- migration 227.

-- ---------------------------------------------------------------------
-- The six Zones. Coach only, verbatim from the approved reference map.
-- ---------------------------------------------------------------------
insert into whole_body_signal_zones
  (zone_key, position, display_name, spinal_segments, organ_gland_list, chakra_lens)
values
  ('zone_1', 1, 'Zone 1', 'L1 to L5 + Sacral Plexus', 'Adrenal, Legs, Feet, Bones, Large Intestines', 'Root'),
  ('zone_2', 2, 'Zone 2', 'T9 to T12 + Sacral Plexus', 'Gonads, Womb, Genitals, Kidney, Bladder, Low Back, Adrenal', 'Sacral'),
  ('zone_3', 3, 'Zone 3', 'T5 to T9', 'Pancreas, Adrenals, Digestive System, Muscles of Body, Liver and Gall Bladder', 'Solar Plexus'),
  ('zone_4', 4, 'Zone 4', 'T1 to T5', 'Heart, Thymus Gland, Lungs, Pericardium, Arms and Hands, Circulation and Breathing', 'Heart'),
  ('zone_5', 5, 'Zone 5', 'C3 to C7', 'Thyroid and Parathyroid Gland, Neck, Shoulders, Arms and Hands, Adrenal Communication (C3, 4, 5)', 'Throat'),
  ('zone_6', 6, 'Zone 6', 'C1 to C2 (Cerebral)', 'C1 and Head, Cerebral Cortex and Central Nervous System, Eyes, Pineal Gland, Pituitary Gland', 'Third Eye')
on conflict (zone_key) do nothing;

-- ---------------------------------------------------------------------
-- The nine sections, in the fixed order she always walks them in.
-- ---------------------------------------------------------------------
insert into whole_body_signal_sections
  (section_key, position, display_name, purpose_line, member_transition_line, member_area_phrase, motion_cue)
values
  ('fuel_quality', 1, 'Fuel Quality',
   'Food quality, variety, processing load, consistency and nourishment.',
   'What your food is made of, most of the time.',
   'food quality and nourishment', 'organic_shapes'),
  ('fuel_rhythm', 2, 'Fuel Rhythm',
   'Meal consistency, appetite rhythm, energy stability, long food gaps and late eating.',
   'When you eat, and how steady that is.',
   'meal timing and steady energy', 'circular_pulse'),
  ('digestive_flow', 3, 'Digestive Flow',
   'Upper digestion, lower digestion, food response, bowel patterns and digestive comfort.',
   'How comfortably food moves through you.',
   'digestive comfort', 'flowing_line'),
  ('gut_environment', 4, 'Gut Environment',
   'Patterns relevant to coaching interpretation without diagnosing the client.',
   'The longer story your digestion has been telling.',
   'longer-term gut patterns', 'connected_dots'),
  ('clearance_elimination', 5, 'Clearance & Elimination',
   'Elimination, hydration, environmental load and recovery patterns.',
   'How your body clears what it does not need.',
   'clearing and hydration', 'clearing_flow'),
  ('stress_recovery', 6, 'Stress & Recovery',
   'Perceived stress, body tension, recovery, sleep disruption, eating changes and support.',
   'What you are carrying, and what lets you put it down.',
   'stress and recovery', 'opening_line'),
  ('body_clock', 7, 'Body Clock',
   'Circadian rhythm, sleep timing, daily energy rhythm, light exposure and schedule disruption.',
   'The rhythm your days and nights are keeping.',
   'daily rhythm and sleep timing', 'sunrise_arc'),
  ('hormone_pelvic_rhythm', 8, 'Hormone & Pelvic Rhythm',
   'Hormonal, pelvic, bladder, reproductive and recovery-related signals.',
   'Changes in rhythm, recovery and the pelvic area.',
   'hormonal and pelvic rhythm', 'balanced_wave'),
  ('recovery_capacity', 9, 'Recovery Capacity',
   'Energy stability, recovery from exercise, fatigue, stimulation dependence and overall resilience.',
   'How well your energy comes back.',
   'energy and recovery capacity', 'settling_pulse')
on conflict (section_key) do nothing;

-- ---------------------------------------------------------------------
-- The five option response scale, with both point maps.
-- ---------------------------------------------------------------------
insert into whole_body_signal_scale_options
  (value_key, position, label, direct_points, reverse_points)
values
  ('never', 1, 'Never', 0, 4),
  ('rarely', 2, 'Rarely', 1, 3),
  ('sometimes', 3, 'Sometimes', 2, 2),
  ('often', 4, 'Often', 3, 1),
  ('almost_always', 5, 'Almost Always', 4, 0)
on conflict (value_key) do nothing;

-- ---------------------------------------------------------------------
-- The four bands. This instrument's own, and nobody else's.
-- ---------------------------------------------------------------------
insert into whole_body_signal_bands
  (band_key, position, min_percent, max_percent, member_label, member_line, member_intensity_word, coach_color)
values
  ('quiet', 1, 0, 25, 'Quiet', 'Few signals are showing up here right now.', 'Mild', 'green'),
  ('showing_up', 2, 25, 50, 'Showing Up', 'There are some patterns worth paying attention to.', 'Mild', 'yellow'),
  ('speaking_loudly', 3, 50, 75, 'Speaking Loudly', 'Several responses suggest this area deserves attention.', 'Moderate', 'orange'),
  ('asking_for_priority', 4, 75, null, 'Asking for Priority', 'This area is showing up strongly in your current picture.', 'Strong', 'red')
on conflict (band_key) do nothing;

-- ---------------------------------------------------------------------
-- Section 8's routing question and its branch map.
-- ---------------------------------------------------------------------
insert into whole_body_signal_routing_options
  (option_key, position, label, is_pnta)
values
  ('cycles', 1, 'I currently have menstrual cycles', false),
  ('changing', 2, 'My cycles are changing or becoming less predictable', false),
  ('menopause', 3, 'I am in perimenopause or menopause', false),
  ('other_reason', 4, 'I no longer have menstrual cycles for another reason', false),
  ('none_apply', 5, 'None of these apply to me', false),
  ('prefer_not', 6, 'Prefer not to answer', true)
on conflict (option_key) do nothing;

-- The universal set (HPU1 to HPU4) is NOT listed here. It is marked on the
-- questions themselves, so the three options with an empty rule still ask
-- the universal four rather than asking nothing.
insert into whole_body_signal_branch_rules (option_key, question_refs)
values
  ('cycles', array['HPC1', 'HPC2', 'HPC3', 'HPB1']),
  ('changing', array['HPC1', 'HPC2', 'HPC3', 'HPT1', 'HPT2', 'HPB1']),
  ('menopause', array['HPT1', 'HPT2', 'HPB1']),
  ('other_reason', array[]::text[]),
  ('none_apply', array[]::text[]),
  ('prefer_not', array[]::text[])
on conflict (option_key) do nothing;

-- ---------------------------------------------------------------------
-- The editable numbers.
-- ---------------------------------------------------------------------
insert into whole_body_signal_settings (setting_key, numeric_value, note)
values
  ('load.weight_a', 0.60, 'Weight on component A, the mean of all section percentages.'),
  ('load.weight_b', 0.25, 'Weight on component B, the share of sections at the elevated threshold or above.'),
  ('load.weight_c', 0.15, 'Weight on component C, the mean of the highest sections.'),
  ('load.elevated_min_percent', 50, 'A section at this percentage or above counts as elevated, for component B and for every pattern and coaching trigger that reads loudness.'),
  ('load.top_component_count', 3, 'How many of the highest sections component C averages.'),
  ('zone.secondary_min_percent', 25, 'A secondary Zone is displayed only at this absolute percentage or above.'),
  ('zone.secondary_min_ratio', 0.60, 'A secondary Zone is displayed only at this share of the primary Zone or above.'),
  ('zone.top_contributor_count', 3, 'How many coach topics a displayed Zone lists as its top contributors.'),
  ('coaching.max_questions', 6, 'The most coaching questions one sitting may surface.'),
  ('priorities.max', 2, 'The most sections the primary coaching priorities block may name.'),
  ('member.max_themes', 3, 'The most plain language themes one member section card may print.'),
  ('why.strong_min_signal', 3, 'A question scoring this or above is a strong contributor.'),
  ('why.moderate_signal', 2, 'A question scoring exactly this is a moderate contributor.'),
  ('compare.min_delta_percent', 1, 'How many whole percentage points a section has to move between two sittings before it is called changed.')
on conflict (setting_key) do nothing;

-- ---------------------------------------------------------------------
-- The ninety six questions.
--
-- prompt, direction, both Zones, organ_gland and coach_topic are verbatim
-- from the approved question bank. member_theme is authored, for the
-- reason the header of this file gives.
--
-- feeds_section_key is the specification's "also feeds" column. It is
-- provenance a coach can read and it changes NO arithmetic: a question
-- scores in its own section and nowhere else.
-- ---------------------------------------------------------------------
insert into whole_body_signal_questions
  (question_ref, section_key, position, prompt, direction,
   primary_zone_key, secondary_zone_key, organ_gland, coach_topic, member_theme,
   feeds_section_key, branch_group, is_universal, allows_pnta)
values
  -- Section 1: Fuel Quality
  ('FQ1', 'fuel_quality', 1, 'Most of my meals are built from foods that are close to their natural form.', 'reverse', 'zone_3', null, 'Digestive system', 'Food quality', 'the quality of your food', null, null, false, false),
  ('FQ2', 'fuel_quality', 2, 'I eat a variety of vegetables and/or fruits throughout the week.', 'reverse', 'zone_3', null, 'Digestive system', 'Nourishment variety', 'variety in what you eat', null, null, false, false),
  ('FQ3', 'fuel_quality', 3, 'Protein is regularly included in my meals.', 'reverse', 'zone_3', null, 'Muscles of Body', 'Protein intake', 'protein in your meals', null, null, false, false),
  ('FQ4', 'fuel_quality', 4, 'I rely on packaged or highly processed foods for a significant part of my diet.', 'direct', 'zone_3', null, 'Digestive system', 'Processed load', 'how much packaged food you lean on', null, null, false, false),
  ('FQ5', 'fuel_quality', 5, 'Sugary foods or drinks are a regular part of my day.', 'direct', 'zone_3', null, 'Pancreas', 'Sugar load', 'sugar through the day', null, null, false, false),
  ('FQ6', 'fuel_quality', 6, 'I frequently eat foods primarily because they are quick or convenient.', 'direct', 'zone_3', null, 'Digestive system', 'Convenience eating', 'eating for speed', null, null, false, false),
  ('FQ7', 'fuel_quality', 7, 'The quality of my food changes significantly when I am busy or stressed.', 'direct', 'zone_3', null, 'Adrenals', 'Stress eating', 'how stress changes your food', 'stress_recovery', null, false, false),
  ('FQ8', 'fuel_quality', 8, 'I regularly eat meals that leave me feeling energized rather than heavy or depleted.', 'reverse', 'zone_3', null, 'Pancreas', 'Post-meal energy', 'how you feel after eating', null, null, false, false),
  ('FQ9', 'fuel_quality', 9, 'I am comfortable identifying foods that generally work well for my body.', 'reverse', 'zone_3', null, 'Digestive system', 'Body awareness', 'knowing what works for you', null, null, false, false),
  ('FQ10', 'fuel_quality', 10, 'My current eating habits feel supportive of my health goals.', 'reverse', 'zone_3', null, 'Digestive system', 'Goal alignment', 'how your eating fits your goals', null, null, false, false),

  -- Section 2: Fuel Rhythm
  ('FR1', 'fuel_rhythm', 1, 'I frequently go long stretches without eating even when I am hungry.', 'direct', 'zone_3', null, 'Pancreas', 'Long food gaps', 'long gaps without food', null, null, false, false),
  ('FR2', 'fuel_rhythm', 2, 'I regularly skip meals because I am too busy.', 'direct', 'zone_3', null, 'Adrenals', 'Skipped meals', 'skipped meals', null, null, false, false),
  ('FR3', 'fuel_rhythm', 3, 'My first meal happens at very different times from one day to another.', 'direct', 'zone_3', null, 'Pancreas', 'Meal timing consistency', 'when your first meal lands', 'body_clock', null, false, false),
  ('FR4', 'fuel_rhythm', 4, 'I experience strong hunger or cravings after going too long without food.', 'direct', 'zone_3', null, 'Pancreas', 'Rebound hunger', 'hunger that comes back hard', null, null, false, false),
  ('FR5', 'fuel_rhythm', 5, 'I tend to eat much more later in the day after eating very little earlier.', 'direct', 'zone_3', null, 'Pancreas', 'Back-loaded eating', 'eating more later in the day', 'body_clock', null, false, false),
  ('FR6', 'fuel_rhythm', 6, 'My energy noticeably drops between meals.', 'direct', 'zone_3', null, 'Pancreas', 'Between-meal energy', 'energy between meals', null, null, false, false),
  ('FR7', 'fuel_rhythm', 7, 'I become irritable, shaky, foggy or unusually tired when I have not eaten.', 'direct', 'zone_3', 'zone_6', 'Pancreas, Adrenals', 'Blood sugar symptoms', 'how you feel when a meal is late', null, null, false, false),
  ('FR8', 'fuel_rhythm', 8, 'I frequently eat close to bedtime.', 'direct', 'zone_3', null, 'Digestive system', 'Late eating', 'eating close to bed', 'body_clock', null, false, false),
  ('FR9', 'fuel_rhythm', 9, 'My meal schedule changes dramatically between weekdays and weekends.', 'direct', 'zone_3', null, 'Pancreas', 'Weekday and weekend swing', 'weekday and weekend differences', 'body_clock', null, false, false),
  ('FR10', 'fuel_rhythm', 10, 'My appetite feels predictable throughout most days.', 'reverse', 'zone_3', null, 'Pancreas', 'Appetite predictability', 'how predictable your appetite is', null, null, false, false),

  -- Section 3: Digestive Flow
  ('DF1', 'digestive_flow', 1, 'I experience bloating after meals.', 'direct', 'zone_3', null, 'Digestive system', 'Bloating', 'bloating after meals', null, null, false, false),
  ('DF2', 'digestive_flow', 2, 'I regularly experience excessive gas.', 'direct', 'zone_1', 'zone_3', 'Large Intestines', 'Gas', 'gas', null, null, false, false),
  ('DF3', 'digestive_flow', 3, 'I experience burning, reflux or food coming back up after eating.', 'direct', 'zone_3', null, 'Digestive system', 'Reflux', 'reflux or burning', null, null, false, false),
  ('DF4', 'digestive_flow', 4, 'I feel unusually full after eating a normal-sized meal.', 'direct', 'zone_3', null, 'Digestive system', 'Early fullness', 'feeling full very quickly', null, null, false, false),
  ('DF5', 'digestive_flow', 5, 'I experience abdominal discomfort around meals.', 'direct', 'zone_3', null, 'Digestive system', 'Meal discomfort', 'discomfort around meals', null, null, false, false),
  ('DF6', 'digestive_flow', 6, 'My bowel movements are inconsistent.', 'direct', 'zone_1', null, 'Large Intestines', 'Bowel consistency', 'how regular things have been', 'clearance_elimination', null, false, false),
  ('DF7', 'digestive_flow', 7, 'I frequently strain or have difficulty passing a bowel movement.', 'direct', 'zone_1', null, 'Large Intestines', 'Constipation and straining', 'difficulty going', 'clearance_elimination', null, false, false),
  ('DF8', 'digestive_flow', 8, 'I sometimes have an urgent need to use the bathroom.', 'direct', 'zone_1', null, 'Large Intestines', 'Urgency', 'sudden urgency', 'clearance_elimination', null, false, false),
  ('DF9', 'digestive_flow', 9, 'Certain foods seem to repeatedly upset my digestion.', 'direct', 'zone_3', null, 'Digestive system', 'Food reactions', 'foods that upset you', 'gut_environment', null, false, false),
  ('DF10', 'digestive_flow', 10, 'I become unusually tired or sluggish after eating.', 'direct', 'zone_3', null, 'Pancreas', 'Post-meal fatigue', 'tiredness after eating', null, null, false, false),
  ('DF11', 'digestive_flow', 11, 'My appetite and digestion noticeably change when I am stressed.', 'direct', 'zone_3', null, 'Adrenals, Digestive system', 'Stress and digestion link', 'how stress reaches your digestion', 'stress_recovery', null, false, false),
  ('DF12', 'digestive_flow', 12, 'I generally feel comfortable and settled after meals.', 'reverse', 'zone_3', null, 'Digestive system', 'Post-meal comfort', 'comfort after meals', null, null, false, false),

  -- Section 4: Gut Environment
  ('GE1', 'gut_environment', 1, 'I have needed repeated courses of antibiotics within the past few years.', 'direct', 'zone_1', null, 'Large Intestines', 'Antibiotic history', 'courses of antibiotics', null, null, false, false),
  ('GE2', 'gut_environment', 2, 'My digestion noticeably changed after taking antibiotics.', 'direct', 'zone_1', 'zone_3', 'Large Intestines', 'Post-antibiotic change', 'changes after antibiotics', null, null, false, false),
  ('GE3', 'gut_environment', 3, 'I experience recurring unexplained digestive disturbances.', 'direct', 'zone_1', 'zone_3', 'Large Intestines, Digestive system', 'Recurring disturbance', 'digestion that keeps flaring', null, null, false, false),
  ('GE4', 'gut_environment', 4, 'I frequently experience unusual bloating that is difficult to connect to one particular food.', 'direct', 'zone_3', 'zone_1', 'Digestive system', 'Unexplained bloating', 'bloating with no clear cause', null, null, false, false),
  ('GE5', 'gut_environment', 5, 'I frequently experience strong sugar cravings.', 'direct', 'zone_3', 'zone_1', 'Pancreas', 'Sugar cravings', 'strong sugar cravings', null, null, false, false),
  ('GE6', 'gut_environment', 6, 'My bowel pattern can shift significantly without an obvious reason.', 'direct', 'zone_1', null, 'Large Intestines', 'Unexplained bowel shifts', 'bowel changes with no clear cause', 'clearance_elimination', null, false, false),
  ('GE7', 'gut_environment', 7, 'I have recurring skin, mouth or other irritation that tends to appear alongside digestive changes.', 'direct', 'zone_1', 'zone_3', 'Large Intestines', 'Gut and skin signals', 'skin or mouth changes alongside digestion', null, null, false, false),
  ('GE8', 'gut_environment', 8, 'Travel has previously been followed by a significant change in my digestion.', 'direct', 'zone_1', null, 'Large Intestines', 'Travel-linked change', 'digestion after travel', null, null, false, false),
  ('GE9', 'gut_environment', 9, 'I have previously been treated for a gastrointestinal infection.', 'direct', 'zone_1', 'zone_3', 'Large Intestines', 'GI infection history', 'a stomach infection in the past', null, null, false, false),
  ('GE10', 'gut_environment', 10, 'My digestive symptoms tend to come in recurring cycles.', 'direct', 'zone_1', null, 'Large Intestines', 'Cyclical symptoms', 'digestion that comes and goes in cycles', null, null, false, false),

  -- Section 5: Clearance & Elimination
  ('CE1', 'clearance_elimination', 1, 'I usually have a comfortable bowel movement every day or close to every day.', 'reverse', 'zone_1', null, 'Large Intestines', 'Daily elimination', 'going comfortably most days', null, null, false, false),
  ('CE2', 'clearance_elimination', 2, 'I frequently feel constipated or backed up.', 'direct', 'zone_1', null, 'Large Intestines', 'Constipation', 'feeling backed up', null, null, false, false),
  ('CE3', 'clearance_elimination', 3, 'My urine is often very dark even when I have access to water.', 'direct', 'zone_2', null, 'Kidney', 'Urine concentration', 'how concentrated your urine is', null, null, false, false),
  ('CE4', 'clearance_elimination', 4, 'I regularly go through the day without drinking much water.', 'direct', 'zone_2', null, 'Kidney, Bladder', 'Hydration', 'how much water you get', null, null, false, false),
  ('CE5', 'clearance_elimination', 5, 'I frequently experience unexplained headaches.', 'direct', 'zone_3', 'zone_6', 'Liver', 'Headaches', 'headaches', null, null, false, false),
  ('CE6', 'clearance_elimination', 6, 'I regularly feel sluggish or heavy upon waking.', 'direct', 'zone_3', null, 'Liver', 'Morning sluggishness', 'how heavy mornings feel', 'recovery_capacity', null, false, false),
  ('CE7', 'clearance_elimination', 7, 'I am regularly exposed to strong fumes, chemicals, smoke or similar environmental irritants.', 'direct', 'zone_4', 'zone_3', 'Lungs, Liver', 'Environmental exposure', 'fumes and chemicals around you', null, null, false, false),
  ('CE8', 'clearance_elimination', 8, 'Alcohol noticeably affects my sleep, digestion or energy the following day.', 'direct', 'zone_3', null, 'Liver', 'Alcohol response', 'how alcohol lands the next day', null, null, false, false),
  ('CE9', 'clearance_elimination', 9, 'I regularly sweat through exercise, heat or physical activity.', 'reverse', 'zone_3', null, 'Muscles of Body', 'Sweating and skin elimination', 'how often you sweat', null, null, false, false),
  ('CE10', 'clearance_elimination', 10, 'My body generally feels like it recovers well following periods of heavier food, travel or disrupted routine.', 'reverse', 'zone_3', null, 'Liver', 'Bounce-back capacity', 'how well you bounce back', 'recovery_capacity', null, false, false),

  -- Section 6: Stress & Recovery
  ('SR1', 'stress_recovery', 1, 'I feel that there is more being asked of me than I can comfortably manage.', 'direct', 'zone_3', null, 'Adrenals', 'Perceived load', 'how much is being asked of you', null, null, false, false),
  ('SR2', 'stress_recovery', 2, 'I find it difficult to mentally switch off.', 'direct', 'zone_6', 'zone_3', 'Central Nervous System', 'Mental switch-off', 'switching your mind off', null, null, false, false),
  ('SR3', 'stress_recovery', 3, 'Small problems feel much larger when I am under pressure.', 'direct', 'zone_6', 'zone_3', 'Central Nervous System', 'Stress amplification', 'how big small things feel', null, null, false, false),
  ('SR4', 'stress_recovery', 4, 'Stress frequently shows up physically in my body.', 'direct', 'zone_5', 'zone_3', 'Neck, Shoulders, Adrenals', 'Somatic stress', 'where stress lands in your body', null, null, false, false),
  ('SR5', 'stress_recovery', 5, 'I notice tension in areas such as my jaw, neck, shoulders or back.', 'direct', 'zone_5', null, 'Neck, Shoulders', 'Tension mapping', 'tension in your jaw, neck or shoulders', null, null, false, false),
  ('SR6', 'stress_recovery', 6, 'Stress changes the way I eat.', 'direct', 'zone_3', null, 'Adrenals, Digestive system', 'Stress eating', 'how stress changes your eating', 'fuel_quality', null, false, false),
  ('SR7', 'stress_recovery', 7, 'Stress affects my digestion.', 'direct', 'zone_3', null, 'Adrenals, Digestive system', 'Stress and digestion', 'how stress reaches your digestion', 'digestive_flow', null, false, false),
  ('SR8', 'stress_recovery', 8, 'Worry or racing thoughts interfere with my sleep.', 'direct', 'zone_6', null, 'Central Nervous System, Pineal Gland', 'Racing thoughts at night', 'racing thoughts at night', 'body_clock', null, false, false),
  ('SR9', 'stress_recovery', 9, 'I feel emotionally drained by the end of many days.', 'direct', 'zone_4', null, 'Heart', 'Emotional depletion', 'feeling drained by evening', null, null, false, false),
  ('SR10', 'stress_recovery', 10, 'I have enough time during most weeks to recover from my responsibilities.', 'reverse', 'zone_3', null, 'Adrenals', 'Recovery time', 'time to recover', null, null, false, false),
  ('SR11', 'stress_recovery', 11, 'I feel supported by the people around me.', 'reverse', 'zone_4', null, 'Heart', 'Support network', 'feeling supported', null, null, false, false),
  ('SR12', 'stress_recovery', 12, 'I frequently sacrifice my own needs to handle responsibilities for other people.', 'direct', 'zone_4', null, 'Heart', 'Self-sacrifice', 'putting yourself last', null, null, false, false),

  -- Section 7: Body Clock
  ('BC1', 'body_clock', 1, 'I usually go to sleep around the same time.', 'reverse', 'zone_6', null, 'Pineal Gland', 'Bedtime consistency', 'a steady bedtime', null, null, false, false),
  ('BC2', 'body_clock', 2, 'I usually wake around the same time.', 'reverse', 'zone_6', null, 'Pineal Gland', 'Wake consistency', 'a steady wake time', null, null, false, false),
  ('BC3', 'body_clock', 3, 'I wake feeling restored.', 'reverse', 'zone_6', 'zone_3', 'Pineal Gland, Adrenals', 'Restorative sleep', 'waking restored', 'recovery_capacity', null, false, false),
  ('BC4', 'body_clock', 4, 'I regularly wake during the night and have difficulty returning to sleep.', 'direct', 'zone_6', 'zone_3', 'Pineal Gland, Liver', 'Night waking', 'waking in the night', null, null, false, false),
  ('BC5', 'body_clock', 5, 'My schedule requires me to stay awake much later than my body seems to want.', 'direct', 'zone_6', null, 'Pineal Gland', 'Schedule versus body', 'staying up later than your body wants', null, null, false, false),
  ('BC6', 'body_clock', 6, 'I experience a strong afternoon energy crash.', 'direct', 'zone_3', null, 'Adrenals, Pancreas', 'Afternoon crash', 'the afternoon crash', 'fuel_rhythm', null, false, false),
  ('BC7', 'body_clock', 7, 'I get natural outdoor light during the first part of my day.', 'reverse', 'zone_6', null, 'Pineal Gland, Eyes', 'Morning light', 'morning daylight', null, null, false, false),
  ('BC8', 'body_clock', 8, 'Screens or work regularly keep me mentally stimulated late at night.', 'direct', 'zone_6', null, 'Central Nervous System, Eyes', 'Evening stimulation', 'screens and work late at night', null, null, false, false),
  ('BC9', 'body_clock', 9, 'Travel or schedule changes significantly disrupt my sleep, appetite or bowel pattern.', 'direct', 'zone_6', null, 'Pineal Gland', 'Travel disruption', 'how travel affects you', null, null, false, false),
  ('BC10', 'body_clock', 10, 'My hunger tends to appear at predictable times.', 'reverse', 'zone_3', null, 'Pancreas', 'Hunger timing', 'when hunger shows up', 'fuel_rhythm', null, false, false),
  ('BC11', 'body_clock', 11, 'I feel sleepy at an appropriate time in the evening.', 'reverse', 'zone_6', null, 'Pineal Gland', 'Evening sleepiness', 'feeling sleepy in the evening', null, null, false, false),
  ('BC12', 'body_clock', 12, 'I need caffeine to feel functional after waking.', 'direct', 'zone_3', null, 'Adrenals', 'Caffeine dependence', 'needing caffeine to start', 'recovery_capacity', null, false, false),

  -- Section 8: Hormone & Pelvic Rhythm. Every question here offers Prefer
  -- not to answer, and a Prefer not to answer tap leaves the section
  -- maximum and contributes to no Zone.
  ('HPC1', 'hormone_pelvic_rhythm', 1, 'My menstrual cycle has become noticeably less predictable.', 'direct', 'zone_2', null, 'Gonads, Womb', 'Cycle predictability', 'how predictable your cycle is', null, 'C', false, true),
  ('HPC2', 'hormone_pelvic_rhythm', 2, 'My energy changes dramatically during different parts of my cycle.', 'direct', 'zone_2', null, 'Gonads', 'Cycle energy swings', 'energy across your cycle', null, 'C', false, true),
  ('HPC3', 'hormone_pelvic_rhythm', 3, 'I regularly experience significant menstrual discomfort.', 'direct', 'zone_2', null, 'Womb', 'Menstrual discomfort', 'period discomfort', null, 'C', false, true),
  ('HPT1', 'hormone_pelvic_rhythm', 4, 'I experience hot flashes or sudden temperature changes.', 'direct', 'zone_2', 'zone_5', 'Gonads, Thyroid', 'Hot flashes', 'hot flashes or temperature swings', null, 'T', false, true),
  ('HPT2', 'hormone_pelvic_rhythm', 5, 'My sleep has changed alongside changes in my cycle or menopause transition.', 'direct', 'zone_2', 'zone_6', 'Gonads, Pineal Gland', 'Sleep and hormone link', 'sleep changing alongside your cycle', 'body_clock', 'T', false, true),
  ('HPB1', 'hormone_pelvic_rhythm', 6, 'My mood changes noticeably alongside hormonal changes.', 'direct', 'zone_2', 'zone_6', 'Gonads', 'Mood and hormone link', 'mood alongside hormonal change', null, 'B', false, true),
  ('HPU1', 'hormone_pelvic_rhythm', 7, 'I experience changes in bladder control or urinary frequency.', 'direct', 'zone_2', null, 'Bladder', 'Bladder control and frequency', 'bladder changes', null, 'U', true, true),
  ('HPU2', 'hormone_pelvic_rhythm', 8, 'I regularly experience unexplained pelvic or low-back discomfort.', 'direct', 'zone_2', null, 'Low Back', 'Pelvic and low-back discomfort', 'pelvic or low back discomfort', null, 'U', true, true),
  ('HPU3', 'hormone_pelvic_rhythm', 9, 'My recovery from exercise has changed over the last several years.', 'direct', 'zone_2', 'zone_3', 'Gonads, Adrenals', 'Recovery change over years', 'how recovery has changed over the years', 'recovery_capacity', 'U', true, true),
  ('HPU4', 'hormone_pelvic_rhythm', 10, 'I feel that hormonal changes are affecting my everyday wellbeing.', 'direct', 'zone_2', null, 'Gonads', 'Hormonal wellbeing impact', 'how hormonal change affects your days', null, 'U', true, true),

  -- Section 9: Recovery Capacity
  ('RC1', 'recovery_capacity', 1, 'I wake with enough energy to start my day.', 'reverse', 'zone_3', null, 'Adrenals', 'Morning energy', 'morning energy', null, null, false, false),
  ('RC2', 'recovery_capacity', 2, 'My energy remains relatively stable through most of the day.', 'reverse', 'zone_3', null, 'Adrenals, Pancreas', 'Energy stability', 'how steady your energy is', null, null, false, false),
  ('RC3', 'recovery_capacity', 3, 'I recover well following exercise.', 'reverse', 'zone_3', null, 'Adrenals, Muscles of Body', 'Exercise recovery', 'recovery after exercise', null, null, false, false),
  ('RC4', 'recovery_capacity', 4, 'I regularly feel physically exhausted without knowing why.', 'direct', 'zone_3', null, 'Adrenals', 'Unexplained exhaustion', 'exhaustion with no clear cause', null, null, false, false),
  ('RC5', 'recovery_capacity', 5, 'Ordinary daily activities sometimes feel unusually demanding.', 'direct', 'zone_3', null, 'Adrenals', 'Daily demand tolerance', 'how demanding ordinary days feel', null, null, false, false),
  ('RC6', 'recovery_capacity', 6, 'I need caffeine, sugar or other stimulation to push through the day.', 'direct', 'zone_3', null, 'Adrenals', 'Stimulant dependence', 'what you need to push through', null, null, false, false),
  ('RC7', 'recovery_capacity', 7, 'I feel refreshed following rest.', 'reverse', 'zone_3', null, 'Adrenals', 'Rest effectiveness', 'whether rest refreshes you', null, null, false, false),
  ('RC8', 'recovery_capacity', 8, 'I regularly feel wired even though I am tired.', 'direct', 'zone_3', 'zone_6', 'Adrenals, Central Nervous System', 'Wired but tired', 'feeling wired but tired', null, null, false, false),
  ('RC9', 'recovery_capacity', 9, 'My motivation to move changes significantly depending on how stressed I am.', 'direct', 'zone_3', null, 'Adrenals', 'Stress and movement link', 'how stress changes your motivation to move', 'stress_recovery', null, false, false),
  ('RC10', 'recovery_capacity', 10, 'My body seems to need longer to recover than it once did.', 'direct', 'zone_3', null, 'Adrenals', 'Slower recovery over time', 'needing longer to recover', null, null, false, false)
on conflict (question_ref) do nothing;

-- ---------------------------------------------------------------------
-- Every member facing line.
--
-- THE PREFIX IS THE FENCE. A 'member.' key may render on a member screen.
-- A 'coach.' key may not, ever.
-- ---------------------------------------------------------------------
insert into whole_body_signal_copy (copy_key, value, audience, note)
values
  -- The pop-up her coach's assignment knocks with.
  ('member.popup_title', 'MEF Whole-Body Signal Assessment', 'member', null),
  ('member.popup_body', 'Your coach asked Root to take a deeper look with you on this one.', 'member', null),
  ('member.popup_cta', 'Begin Assessment', 'member', null),

  -- The persistent entry card on Home.
  ('member.card_title', 'MEF Whole-Body Signal Assessment', 'member', null),
  ('member.card_body', 'A deeper look at the patterns your body has been giving you.', 'member', null),
  ('member.card_duration', 'Approx. 10 to 15 minutes', 'member', null),
  ('member.card_cta', 'Begin Assessment', 'member', null),
  ('member.card_footnote', 'Your coach will use your answers to identify the areas that deserve the most attention.', 'member', null),

  -- The opening screen.
  ('member.intro_title', 'MEF Whole-Body Signal Assessment', 'member', null),
  ('member.intro_line_1', 'Your body gives signals through energy, digestion, sleep, stress, appetite, recovery and other patterns.', 'member', null),
  ('member.intro_line_2', 'This assessment helps me understand what is showing up most strongly so your coaching can be more focused and personal.', 'member', null),
  ('member.intro_line_3', 'Answer based on how you have generally felt over the last 8 to 12 weeks, not just today.', 'member', null),
  ('member.intro_button', 'Start My Assessment', 'member', null),

  -- The section transition screen and the question screens under it.
  ('member.transition_micro_line', 'Answer based on what happens most often.', 'member', null),
  ('member.continue', 'Continue', 'member', null),
  ('member.back', 'Back', 'member', null),
  ('member.home_label', 'Home', 'member', null),
  ('member.exit_label', 'Leave for now', 'member', null),
  ('member.blocked_reason', 'Choose an answer to continue.', 'member', null),
  ('member.save_error', 'We could not save that just now. Please try again.', 'member', 'The one line shown when a write does not land. Approved wording pending.'),

  -- The beat between two sections.
  ('member.section_complete_suffix', 'complete', 'member', null),
  ('member.section_complete_line', 'Thank you. Your responses are being added to your whole-body picture.', 'member', null),
  ('member.next_section_label', 'Next', 'member', null),

  -- Section 8.
  ('member.branch_intro', 'Before we continue...', 'member', null),
  ('member.branch_question', 'Which of these best describes what is relevant to you right now?', 'member', null),
  ('member.pnta_label', 'Prefer not to answer', 'member', null),

  -- Coming back to an unfinished sitting.
  ('member.resume_title', 'Welcome back', 'member', null),
  ('member.resume_body', 'You are {n} sections in. Pick up where you left off.', 'member', 'The {n} is replaced with how many sections she has finished.'),
  ('member.resume_cta', 'Continue Assessment', 'member', null),

  -- Finishing.
  ('member.completion_title', 'You are done.', 'member', null),
  ('member.completion_body', 'We are pulling your answers together into a clearer picture.', 'member', null),
  ('member.completion_cta', 'View My Results', 'member', null),

  -- Her results.
  ('member.results_heading', 'Your Whole-Body Signal Picture', 'member', null),
  ('member.results_intro', 'Some areas are quieter. Others are asking for more attention.', 'member', null),
  ('member.results_landscape_label', 'Your signal landscape', 'member', null),
  ('member.priority_card_line', 'This area showed the strongest concentration of signals in your responses.', 'member', null),
  ('member.section_card_lead', 'Your answers suggest {area} patterns are showing up strongly right now.', 'member', 'The {area} is replaced with the section''s own plain language phrase.'),
  ('member.section_card_themes_label', 'What showed up most', 'member', null),
  ('member.section_card_next_heading', 'What happens next?', 'member', null),
  ('member.section_card_next_body', 'Your coach will look at this alongside your other responses and decide what deserves attention first.', 'member', null),
  ('member.closing_line_1', 'You do not need to work on everything at once.', 'member', null),
  ('member.closing_line_2', 'I will use this picture to help decide where we begin.', 'member', null),
  ('member.closing_line_3', 'Your coach will review this with you.', 'member', null),
  ('member.results_done', 'Return Home', 'member', null),

  -- Opening a route she has already finished.
  ('member.already_done_heading', 'You have already completed this one', 'member', null),
  ('member.already_done_body', 'Here is the picture your answers made.', 'member', null)
on conflict (copy_key) do nothing;

-- ---------------------------------------------------------------------
-- Every coach facing line.
-- ---------------------------------------------------------------------
insert into whole_body_signal_copy (copy_key, value, audience, note)
values
  ('coach.priorities_heading', 'Primary coaching priorities', 'coach', null),
  ('coach.priorities_line_one', 'This section carries the strongest current signal.', 'coach', 'Printed when only one section is named.'),
  ('coach.priorities_line_two', 'These two sections carry the strongest current signal.', 'coach', null),
  ('coach.priorities_none', 'Nothing in this sitting is loud enough to name a priority from.', 'coach', null),
  ('coach.use_as_focus', 'Use as Coaching Focus', 'coach', null),
  ('coach.choose_different', 'Choose Different Priority', 'coach', null),

  ('coach.signal_map_heading', 'Signal map', 'coach', null),

  ('coach.load_heading', 'Whole-Body Signal Load', 'coach', null),
  ('coach.load_component_a', 'Mean of all sections', 'coach', null),
  ('coach.load_component_b', 'Share of sections at 50 or above', 'coach', null),
  ('coach.load_component_c', 'Mean of the three highest sections', 'coach', null),
  ('coach.load_change_label', 'Change since last assessment', 'coach', null),
  ('coach.load_no_previous', 'No previous assessment to compare against.', 'coach', null),

  ('coach.why_heading', 'Why this scored high', 'coach', null),
  ('coach.why_strong_label', 'Strong', 'coach', null),
  ('coach.why_moderate_label', 'Moderate', 'coach', null),
  ('coach.why_low_label', 'Low', 'coach', null),
  ('coach.why_strongest_label', 'Strongest contributors', 'coach', null),
  ('coach.view_all_answers', 'View All Answers', 'coach', null),
  ('coach.pnta_note', 'Prefer not to answer. Left out of this section''s total and out of every Zone.', 'coach', null),

  ('coach.zone_heading', 'Zone pattern', 'coach', null),
  ('coach.zone_primary_label', 'Primary Zone pattern', 'coach', null),
  ('coach.zone_secondary_label', 'Secondary Zone pattern', 'coach', null),
  ('coach.zone_why_label', 'Why it surfaced', 'coach', null),
  ('coach.zone_interpretation_note', 'Interpretation, not diagnosis. This is where the answers cluster, and nothing here names a cause.', 'coach', null),
  ('coach.zone_sentence_lead', 'The {zone} contribution is primarily coming from', 'coach', 'Assembled with the topics below it and the tail fragment. The {zone} is the Zone''s own display name.'),
  ('coach.zone_sentence_join', 'and', 'coach', 'The word between the last two topics.'),
  ('coach.zone_sentence_tail', 'responses.', 'coach', null),
  ('coach.zone_none', 'No Zone reached a readable level in this sitting.', 'coach', null),

  ('coach.associated_map_heading', 'Associated coaching map', 'coach', null),
  ('coach.associated_spinal_label', 'Spinal segments', 'coach', null),
  ('coach.associated_organs_label', 'Organs and glands', 'coach', null),
  ('coach.associated_chakra_label', 'Chakra lens', 'coach', null),

  ('coach.patterns_heading', 'Patterns across the assessment', 'coach', null),
  ('coach.patterns_none', 'No cross-section pattern fired for this sitting.', 'coach', null),

  ('coach.questions_heading', 'Questions worth exploring', 'coach', null),
  ('coach.questions_none', 'No coaching question fired for this sitting.', 'coach', null),
  ('coach.question_ask', 'Mark as asked', 'coach', null),
  ('coach.question_asked', 'Asked', 'coach', null),
  ('coach.question_copy', 'Copy', 'coach', null),
  ('coach.question_copied', 'Copied', 'coach', null),
  ('coach.question_hide', 'Hide', 'coach', null),
  ('coach.question_unhide', 'Show again', 'coach', null),
  ('coach.question_save', 'Save to session prep', 'coach', null),
  ('coach.question_saved', 'Saved to session prep', 'coach', null),

  ('coach.focus_heading', 'Choose coaching focus', 'coach', null),
  ('coach.focus_recommended_label', 'Recommended by this assessment', 'coach', null),
  ('coach.focus_selected_label', 'Chosen by you', 'coach', null),
  ('coach.focus_change', 'Change Priority', 'coach', null),
  ('coach.focus_none', 'No coaching focus chosen yet.', 'coach', null),

  ('coach.reassessment_heading', 'Reassessment', 'coach', null),
  ('coach.reassessment_none', 'This is the first sitting, so there is nothing to compare it against yet.', 'coach', null),
  ('coach.reassessment_zone_previous', 'Previous primary:', 'coach', null),
  ('coach.reassessment_zone_current', 'Current primary:', 'coach', null),
  ('coach.reassessment_zone_unchanged', 'The primary Zone has not moved.', 'coach', null),
  ('coach.reassessment_contributors_heading', 'Contributor shifts', 'coach', null),
  ('coach.reassessment_contributors_none', 'No section changed band between these two sittings.', 'coach', null),
  ('coach.reassessment_previous_focus_label', 'Priority chosen last time', 'coach', null),
  ('coach.load_trend_label', 'Signal Load trend', 'coach', null),
  ('coach.answers_heading', 'All answers', 'coach', null)
on conflict (copy_key) do nothing;
