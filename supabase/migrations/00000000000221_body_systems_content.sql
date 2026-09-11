-- The MEF Body Systems Survey, its approved content.
--
-- Every row below is the coach approved specification, verbatim. Nothing
-- here was reworded, reordered, added or dropped. The three places where
-- the specification named a thing without giving its words are marked in
-- the `note` column of the copy row that supplies them, so the next person
-- to read this table can see exactly which sentences are the coach's and
-- which are placeholders waiting for his pen.
--
-- Schema is migration 220. Association library is migration 222.

-- ---------------------------------------------------------------------
-- The eleven sections, in the fixed order she always sees them in.
-- ---------------------------------------------------------------------
insert into body_systems_sections
  (section_key, position, display_name, member_intro_line, top_attention_line, registry_domain, registry_code)
values
  ('digestion', 1, 'Digestion', 'How your body receives and breaks down food.', 'Right now, the loudest signals in your body are about how it handles food.', 'digestive', 'body_systems_digestion'),
  ('blood_sugar', 2, 'Blood Sugar and Energy', 'How steady your fuel supply feels through the day.', 'Right now, your strongest signals are about how steady your energy holds through the day.', 'metabolic', 'body_systems_blood_sugar'),
  ('liver', 3, 'Liver and Detox', 'How your body filters and clears what it does not need.', 'Right now, your loudest signals are tied to how your body filters and clears.', 'metabolic', 'body_systems_liver'),
  ('adrenals', 4, 'Adrenals and Stress Response', 'How your body responds to demand and pressure.', 'Right now, your loudest signals are about demand, pressure, and recovery.', 'stress', 'body_systems_adrenals'),
  ('thyroid', 5, 'Thyroid and Metabolism', 'The pace your body runs at.', 'Right now, your strongest signals are about the pace your body is running at.', 'metabolic', 'body_systems_thyroid'),
  ('heart', 6, 'Heart and Circulation', 'How blood and oxygen move through you.', 'Right now, your loudest signals involve how blood and oxygen move through you.', 'circulatory', 'body_systems_heart'),
  ('immune', 7, 'Immune System', 'How your body defends and repairs itself.', 'Right now, your strongest signals involve how your body defends and repairs itself.', 'immune', 'body_systems_immune'),
  ('kidney', 8, 'Kidney and Bladder', 'How your body manages fluid and waste.', 'Right now, your loudest signals involve how your body manages fluid.', 'renal', 'body_systems_kidney'),
  ('muscles', 9, 'Muscles and Joints', 'How your frame feels carrying you through the day.', 'Right now, your loudest signals are coming from your frame and how it carries you.', 'movement', 'body_systems_muscles'),
  ('brain', 10, 'Brain and Nervous System', 'How your mind and nerves are holding up.', 'Right now, your strongest signals involve focus, mood, and your nerves.', 'neurological', 'body_systems_brain'),
  ('hormonal', 11, 'Hormonal Health', 'The messengers that set your body''s rhythm.', 'Right now, your loudest signals follow your body''s rhythm.', 'hormone', 'body_systems_hormonal')
on conflict (section_key) do nothing;

-- ---------------------------------------------------------------------
-- The questions. One symptom each, in the fixed order retakes repeat.
-- ---------------------------------------------------------------------
insert into body_systems_questions
  (question_ref, section_key, position, prompt, branch, allows_dna, dna_label)
values
  ('D1', 'digestion', 1, 'I feel bloated after eating.', 'all', false, null),
  ('D2', 'digestion', 2, 'I have gas that feels excessive or uncomfortable.', 'all', false, null),
  ('D3', 'digestion', 3, 'I feel burning in my chest or throat after meals.', 'all', false, null),
  ('D4', 'digestion', 4, 'I burp up food or acid after eating.', 'all', false, null),
  ('D5', 'digestion', 5, 'I still feel uncomfortably full long after a normal-sized meal.', 'all', false, null),
  ('D6', 'digestion', 6, 'I have stomach pain or cramping.', 'all', false, null),
  ('D7', 'digestion', 7, 'My bowel movements are loose or urgent.', 'all', false, null),
  ('D8', 'digestion', 8, 'I go a full day or longer without a bowel movement.', 'all', false, null),
  ('D9', 'digestion', 9, 'I feel nauseous.', 'all', false, null),
  ('D10', 'digestion', 10, 'I see undigested food in my stool.', 'all', false, null),
  ('B1', 'blood_sugar', 1, 'I feel shaky, lightheaded, or irritable if a meal is delayed.', 'all', false, null),
  ('B2', 'blood_sugar', 2, 'I get sleepy within two hours after eating.', 'all', false, null),
  ('B3', 'blood_sugar', 3, 'I crave sweets during the day.', 'all', false, null),
  ('B4', 'blood_sugar', 4, 'I need caffeine or sugar to get through the afternoon.', 'all', false, null),
  ('B5', 'blood_sugar', 5, 'I get headaches when I have not eaten.', 'all', false, null),
  ('B6', 'blood_sugar', 6, 'I wake during the night feeling hungry or restless.', 'all', false, null),
  ('B7', 'blood_sugar', 7, 'My energy rises and crashes through the day.', 'all', false, null),
  ('B8', 'blood_sugar', 8, 'I feel tired even after a full meal.', 'all', false, null),
  ('B9', 'blood_sugar', 9, 'I feel thirsty even when I drink water regularly.', 'all', false, null),
  ('L1', 'liver', 1, 'Strong smells (perfume, smoke, cleaning products) bother me more than they bother other people.', 'all', false, null),
  ('L2', 'liver', 2, 'I feel unwell after even small amounts of alcohol.', 'all', true, 'I do not drink'),
  ('L3', 'liver', 3, 'I wake between roughly 1 and 3 AM and struggle to fall back asleep.', 'all', false, null),
  ('L4', 'liver', 4, 'I have itchy skin without a clear cause.', 'all', false, null),
  ('L5', 'liver', 5, 'My skin breaks out.', 'all', false, null),
  ('L6', 'liver', 6, 'I wake up feeling groggy, like a hangover without the alcohol.', 'all', false, null),
  ('L7', 'liver', 7, 'Greasy or fried foods leave me feeling unwell.', 'all', false, null),
  ('L8', 'liver', 8, 'I have dark circles under my eyes.', 'all', false, null),
  ('L9', 'liver', 9, 'Caffeine or medications seem to hit me harder than they hit other people.', 'all', false, null),
  ('A1', 'adrenals', 1, 'I wake up tired even after a full night of sleep.', 'all', false, null),
  ('A2', 'adrenals', 2, 'I get a second wind of energy late at night.', 'all', false, null),
  ('A3', 'adrenals', 3, 'I feel dizzy or lightheaded when I stand up quickly.', 'all', false, null),
  ('A4', 'adrenals', 4, 'I crave salty foods.', 'all', false, null),
  ('A5', 'adrenals', 5, 'Small stresses feel harder to handle than they used to.', 'all', false, null),
  ('A6', 'adrenals', 6, 'I feel wired and tired at the same time.', 'all', false, null),
  ('A7', 'adrenals', 7, 'I need caffeine to feel normal in the morning.', 'all', false, null),
  ('A8', 'adrenals', 8, 'My heart races when I feel stressed.', 'all', false, null),
  ('A9', 'adrenals', 9, 'After a demanding day, it takes me days to recover.', 'all', false, null),
  ('A10', 'adrenals', 10, 'Bright light bothers my eyes.', 'all', false, null),
  ('T1', 'thyroid', 1, 'I feel cold when people around me are comfortable.', 'all', false, null),
  ('T2', 'thyroid', 2, 'My hands or feet are cold.', 'all', false, null),
  ('T3', 'thyroid', 3, 'My hair is thinning or shedding more than usual.', 'all', false, null),
  ('T4', 'thyroid', 4, 'My skin is dry.', 'all', false, null),
  ('T5', 'thyroid', 5, 'I feel sluggish or slowed down, in body or mind.', 'all', false, null),
  ('T6', 'thyroid', 6, 'My weight changes without changes in how I eat or move.', 'all', false, null),
  ('T7', 'thyroid', 7, 'My face looks puffy or swollen in the morning.', 'all', false, null),
  ('T8', 'thyroid', 8, 'I am constipated.', 'all', false, null),
  ('T9', 'thyroid', 9, 'My voice gets hoarse without a cold.', 'all', false, null),
  ('H1', 'heart', 1, 'My heart races or skips beats.', 'all', false, null),
  ('H2', 'heart', 2, 'I get short of breath during everyday activities.', 'all', false, null),
  ('H3', 'heart', 3, 'I am out of breath after one flight of stairs.', 'all', false, null),
  ('H4', 'heart', 4, 'My ankles or feet swell.', 'all', false, null),
  ('H5', 'heart', 5, 'My hands or feet fall asleep easily.', 'all', false, null),
  ('H6', 'heart', 6, 'I bruise easily.', 'all', false, null),
  ('H7', 'heart', 7, 'My legs feel heavy or achy after standing.', 'all', false, null),
  ('H8', 'heart', 8, 'I feel my heartbeat pounding while resting.', 'all', false, null),
  ('H9', 'heart', 9, 'My hands or feet stay cold even in warm rooms.', 'all', false, null),
  ('I1', 'immune', 1, 'I catch colds or infections more often than the people around me.', 'all', false, null),
  ('I2', 'immune', 2, 'When I get sick, it takes me a long time to recover.', 'all', false, null),
  ('I3', 'immune', 3, 'Cuts and scrapes heal slowly.', 'all', false, null),
  ('I4', 'immune', 4, 'The glands in my neck or underarms feel swollen or tender.', 'all', false, null),
  ('I5', 'immune', 5, 'I get cold sores or mouth ulcers.', 'all', false, null),
  ('I6', 'immune', 6, 'I have a stuffy or runny nose without being sick.', 'all', false, null),
  ('I7', 'immune', 7, 'My eyes are itchy or watery.', 'all', false, null),
  ('I8', 'immune', 8, 'I feel feverish or run a low fever without being sick.', 'all', false, null),
  ('I9', 'immune', 9, 'Certain foods trigger congestion, itching, or swelling for me.', 'all', false, null),
  ('K1', 'kidney', 1, 'I wake up at night to urinate.', 'all', false, null),
  ('K2', 'kidney', 2, 'I urinate more often than feels normal.', 'all', false, null),
  ('K3', 'kidney', 3, 'I get a sudden urge to urinate that is hard to hold.', 'all', false, null),
  ('K4', 'kidney', 4, 'It burns or stings when I urinate.', 'all', false, null),
  ('K5', 'kidney', 5, 'My urine is dark or strong-smelling even when I drink water.', 'all', false, null),
  ('K6', 'kidney', 6, 'Rings, shoes, or clothes feel tighter by the end of the day.', 'all', false, null),
  ('K7', 'kidney', 7, 'I have puffiness under my eyes in the morning.', 'all', false, null),
  ('K8', 'kidney', 8, 'I leak urine when I cough, sneeze, or laugh.', 'all', false, null),
  ('M1', 'muscles', 1, 'I wake up stiff in the morning.', 'all', false, null),
  ('M2', 'muscles', 2, 'My joints ache.', 'all', false, null),
  ('M3', 'muscles', 3, 'My muscles feel sore without exercise to explain it.', 'all', false, null),
  ('M4', 'muscles', 4, 'I get muscle cramps or spasms.', 'all', false, null),
  ('M5', 'muscles', 5, 'Pain limits what I can do in a normal day.', 'all', false, null),
  ('M6', 'muscles', 6, 'My neck or shoulders carry tension.', 'all', false, null),
  ('M7', 'muscles', 7, 'My lower back aches.', 'all', false, null),
  ('M8', 'muscles', 8, 'My joints swell.', 'all', false, null),
  ('M9', 'muscles', 9, 'Everyday tasks feel heavier than they used to.', 'all', false, null),
  ('M10', 'muscles', 10, 'Old injuries flare up.', 'all', false, null),
  ('N1', 'brain', 1, 'I have trouble concentrating.', 'all', false, null),
  ('N2', 'brain', 2, 'I forget words, names, or why I walked into a room.', 'all', false, null),
  ('N3', 'brain', 3, 'My thinking feels foggy.', 'all', false, null),
  ('N4', 'brain', 4, 'I get headaches.', 'all', false, null),
  ('N5', 'brain', 5, 'I feel anxious or on edge.', 'all', false, null),
  ('N6', 'brain', 6, 'I feel down or flat.', 'all', false, null),
  ('N7', 'brain', 7, 'My mind will not switch off when I try to fall asleep.', 'all', false, null),
  ('N8', 'brain', 8, 'I feel dizzy.', 'all', false, null),
  ('N9', 'brain', 9, 'My hands or feet tingle or go numb.', 'all', false, null),
  ('N10', 'brain', 10, 'Noisy or busy environments overwhelm me.', 'all', false, null),
  ('HA1', 'hormonal', 1, 'My cycle has become irregular or unpredictable.', 'a', true, 'I no longer have a cycle'),
  ('HA2', 'hormonal', 2, 'My periods are heavier or more painful than they used to be.', 'a', true, 'Does not apply to me'),
  ('HA3', 'hormonal', 3, 'I get hot flashes.', 'a', false, null),
  ('HA4', 'hormonal', 4, 'I have night sweats.', 'a', false, null),
  ('HA5', 'hormonal', 5, 'My mood shifts noticeably through the month.', 'a', false, null),
  ('HA6', 'hormonal', 6, 'I feel irritable or tearful in the days before my period.', 'a', true, 'Does not apply to me'),
  ('HA7', 'hormonal', 7, 'My sleep gets disrupted around my cycle.', 'a', false, null),
  ('HA8', 'hormonal', 8, 'I crave sugar or carbs at certain times of the month.', 'a', false, null),
  ('HA9', 'hormonal', 9, 'My skin or hair has changed noticeably.', 'a', false, null),
  ('HA10', 'hormonal', 10, 'I feel bloated or swollen at certain times of the month.', 'a', false, null),
  ('HB1', 'hormonal', 1, 'My energy is lower than it used to be.', 'b', false, null),
  ('HB2', 'hormonal', 2, 'My motivation or drive has dropped.', 'b', false, null),
  ('HB3', 'hormonal', 3, 'I have lost muscle even though my activity has not changed.', 'b', false, null),
  ('HB4', 'hormonal', 4, 'I have gained weight around my midsection.', 'b', false, null),
  ('HB5', 'hormonal', 5, 'My mood is flatter or more irritable than it used to be.', 'b', false, null),
  ('HB6', 'hormonal', 6, 'I need more recovery time after exercise than I used to.', 'b', false, null),
  ('HB7', 'hormonal', 7, 'My sleep is lighter or more broken than it used to be.', 'b', false, null),
  ('HB8', 'hormonal', 8, 'I sweat at night.', 'b', false, null)
on conflict (question_ref) do nothing;

-- ---------------------------------------------------------------------
-- The one answer scale, and its weights.
-- ---------------------------------------------------------------------
insert into body_systems_scale_options (value_key, position, label, points, is_elevated)
values
  ('never', 1, 'Never', 0, false),
  ('rarely', 2, 'Rarely', 1, false),
  ('sometimes', 3, 'Sometimes', 3, false),
  ('often', 4, 'Often', 6, true),
  ('almost_always', 5, 'Almost always', 8, true)
on conflict (value_key) do nothing;

-- ---------------------------------------------------------------------
-- The three loudness bands. min_percent inclusive, max_percent exclusive,
-- the loudest band open ended.
-- ---------------------------------------------------------------------
insert into body_systems_bands
  (band_key, position, min_percent, max_percent, color_key, member_label, member_status_line)
values
  ('quiet', 1, 0, 15, 'green', 'Quiet', 'Quiet. Signals here are barely showing up right now.'),
  ('showing_up', 2, 15, 35, 'yellow', 'Showing up', 'Showing up. Some signals here are making themselves known.'),
  ('speaking_loudly', 3, 35, null, 'red', 'Speaking loudly', 'Speaking loudly. Signals here are showing up strongly and often.')
on conflict (band_key) do nothing;

-- ---------------------------------------------------------------------
-- The two safety levels and their exact on-screen responses.
-- ---------------------------------------------------------------------
insert into body_systems_safety_levels (level, label, member_response)
values
  (1, 'Urgent evaluation', 'Thank you for telling me. This one matters more than anything else in this survey. Please contact your doctor promptly, or seek urgent care if it happens again. This is not something coaching should work on alone. Your coach will see this and will check in with you.'),
  (2, 'Medical follow-up', 'Thank you for telling me. This one is outside what coaching should work on alone. Please bring it to your doctor soon, even if it turns out to be nothing. Your coach will see this too, and will check in with you about it.')
on conflict (level) do nothing;

-- ---------------------------------------------------------------------
-- The six red flag questions. Never scored, ever.
-- ---------------------------------------------------------------------
insert into body_systems_red_flags (flag_key, position, prompt, level)
values
  ('chest_pain', 1, 'Have you felt pain or pressure in your chest, especially during activity?', 1),
  ('fainting', 2, 'Have you fainted or blacked out?', 1),
  ('severe_headaches', 3, 'Have you had severe headaches, or headaches that are suddenly getting worse?', 1),
  ('blood_in_stool', 4, 'Have you noticed blood in your stool, or stool that is black?', 2),
  ('unexplained_bleeding', 5, 'Have you had any unexplained bleeding?', 2),
  ('unexplained_weight_loss', 6, 'Have you lost a noticeable amount of weight without trying?', 2)
on conflict (flag_key) do nothing;

-- ---------------------------------------------------------------------
-- Every other line this survey can print.
-- ---------------------------------------------------------------------
insert into body_systems_copy (copy_key, value, audience, note)
values
  ('member.popup_title', 'MEF Body Systems Survey', 'member', 'The pop-up heading. The survey''s own name.'),
  ('member.popup_body', 'Your coach asked Root to walk through your whole body with you. It takes about 15 minutes, and nothing about it is a test.', 'member', 'Approved verbatim in the survey specification.'),
  ('member.popup_cta', 'Start now', 'member', null),
  ('member.card_title', 'From your coach: MEF Body Systems Survey', 'member', null),
  ('member.card_body', 'Eleven short sections about how your whole body has been feeling. Every answer is a tap.', 'member', null),
  ('member.card_cta', 'Start the survey', 'member', null),
  ('member.intro_title', 'MEF Body Systems Survey', 'member', null),
  ('member.intro_line_1', 'Your coach asked Root to walk through your whole body with you.', 'member', null),
  ('member.intro_line_2', 'It takes about 15 minutes, and nothing about it is a test.', 'member', null),
  ('member.intro_line_3', 'Eleven short sections. Answer for the last 3 months. Every answer is a tap.', 'member', null),
  ('member.intro_line_4', 'You will not see which part of your body a section is about while you answer. That is on purpose, and every name is on your results at the end.', 'member', 'Added 2026-09-11 with the blind sections change. She is told once, up front, why the sections are unnamed.'),
  ('member.intro_button', 'Begin', 'member', null),
  ('member.timeframe_reminder', 'Thinking about the last 3 months.', 'member', 'Repeated in small text on every section screen, per global rule three.'),
  ('member.section_heading', 'How often has this been true?', 'member', 'The heading on all eleven section screens. It names the task, never the body system, because she answers blind.'),
  ('member.continue', 'Continue', 'member', null),
  ('member.back', 'Back', 'member', null),
  ('member.exit_label', 'Close', 'member', null),
  ('member.home_label', 'Home', 'member', null),
  ('member.blocked_reason', 'Answer every question on this screen to keep going.', 'member', null),
  ('member.dna_default_label', 'Does not apply to me', 'member', null),
  ('member.branch_question', 'Which set of questions fits your body?', 'member', 'Approved verbatim in the survey specification.'),
  ('member.branch_option_a', 'Cycles, hot flashes, and monthly changes', 'member', 'The specification named the branch question but not the two option labels. These words were approved by the coach on 2026-09-11 and are no longer a placeholder. Migration 223 carries the same change to environments already seeded.'),
  ('member.branch_option_b', 'Energy, drive, muscle, and recovery', 'member', 'The specification named the branch question but not the two option labels. These words were approved by the coach on 2026-09-11 and are no longer a placeholder. Migration 223 carries the same change to environments already seeded.'),
  ('member.branch_remembered', 'Root remembers this for next time. You can change it in your profile whenever you like.', 'member', null),
  ('member.branch_profile_label', 'Hormonal Health question set', 'member', null),
  ('member.branch_profile_hint', 'Which set of questions the MEF Body Systems Survey asks you in its last section.', 'member', null),
  ('member.red_flags_heading', 'Six last questions', 'member', null),
  ('member.red_flags_intro', 'These six are asked of everybody, every time. They are not scored and they change nothing about your results. Root asks them so nothing important gets missed.', 'member', null),
  ('member.red_flag_yes', 'Yes', 'member', null),
  ('member.red_flag_no', 'No', 'member', null),
  ('member.red_flag_finish', 'See your results', 'member', null),
  ('member.results_eyebrow', 'Your signals', 'member', null),
  ('member.results_heading', 'What your body is saying right now', 'member', null),
  ('member.results_intro', 'Loudest first. This is about how strongly signals are showing up, and nothing more than that.', 'member', null),
  ('member.results_closing', 'Your coach has the full picture. This is where you''ll start together.', 'member', 'Approved verbatim in the survey specification.'),
  ('member.legend_label', 'What the three loudness bands mean', 'member', 'The accessible name of the legend above her graph. Read by a screen reader, not drawn on the screen.'),
  ('member.results_done', 'Back to home', 'member', null),
  ('member.compare_heading', 'This time next to last time', 'member', null),
  ('member.compare_quieter', 'Quieter', 'member', null),
  ('member.compare_unchanged', 'Unchanged', 'member', null),
  ('member.compare_louder', 'Louder', 'member', null),
  ('member.compare_this_time', 'This time', 'member', null),
  ('member.compare_last_time', 'Last time', 'member', null),
  ('member.already_done_heading', 'This one is done', 'member', null),
  ('member.already_done_body', 'You have already finished this survey and your coach can see it. If they want another look, they will send you a fresh one.', 'member', null),
  ('member.resume_note', 'Root kept your place. Pick up where you left off.', 'member', null),
  ('member.save_error', 'We could not save that. Please try again.', 'member', null),
  ('coach.red_flags_heading', 'Red flags, answered Yes', 'coach', null),
  ('coach.red_flags_none', 'No red flag was answered Yes in this sitting.', 'coach', null),
  ('coach.red_flags_note', 'Answered Yes. The member saw the matching safety response on screen immediately. This changed no percentage, no colour and no order anywhere in this sitting.', 'coach', null),
  ('coach.sections_heading', 'Section loudness', 'coach', null),
  ('coach.questions_heading', 'Every answer, by contribution', 'coach', null),
  ('coach.patterns_heading', 'Pattern analysis', 'coach', null),
  ('coach.high_frequency_heading', 'Answered Often or Almost always', 'coach', null),
  ('coach.cluster_heading', 'Moving together inside a section', 'coach', null),
  ('coach.cross_section_heading', 'Systems moving together', 'coach', null),
  ('coach.changes_heading', 'Changes since the previous sitting', 'coach', null),
  ('coach.associations_heading', 'Possible associations', 'coach', null),
  ('coach.why_surfaced_label', 'Why this surfaced', 'coach', null),
  ('coach.next_step_label', 'Next step', 'coach', null),
  ('coach.opener_heading', 'Where to open the session', 'coach', null),
  ('coach.opener_note', 'The loudest section, with the answers that made it loudest.', 'coach', null),
  ('coach.coverage_note', 'This section is loud, and no defined pattern matched. Review the top-contributing answers directly.', 'coach', 'Approved verbatim in the association library. The system never invents an association outside the library.'),
  ('coach.label_observed', 'Observed data', 'coach', null),
  ('coach.label_pattern', 'Pattern interpretation', 'coach', null),
  ('coach.label_possible', 'Possible association', 'coach', null),
  ('coach.label_confirmed', 'Confirmed medical information', 'coach', null),
  ('coach.confirmed_never_generated', 'Reserved for medically confirmed information from an appropriate source. This assessment never generates anything with this label.', 'coach', null),
  ('coach.association_compare_heading', 'Patterns across sittings', 'coach', null),
  ('coach.pattern_quieter', 'Quieter', 'coach', null),
  ('coach.pattern_unchanged', 'Unchanged', 'coach', null),
  ('coach.pattern_louder', 'Louder', 'coach', null),
  ('coach.pattern_resolved', 'Resolved', 'coach', null),
  ('coach.pattern_joined', 'Joined by new related signals', 'coach', null),
  ('coach.dna_label', 'Does not apply to me', 'coach', null),
  ('coach.dna_note', 'Scored nothing and left this section''s denominator.', 'coach', null)
on conflict (copy_key) do nothing;

-- ---------------------------------------------------------------------
-- Editable numbers that are not band cut offs.
-- ---------------------------------------------------------------------
insert into body_systems_settings (setting_key, numeric_value, note)
values
  ('compare.min_delta_percent', 1, 'How many whole percentage points a section must move between two sittings before it is called quieter or louder rather than unchanged.')
on conflict (setting_key) do nothing;
