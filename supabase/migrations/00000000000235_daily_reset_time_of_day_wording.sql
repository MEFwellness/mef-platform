-- Daily Reset: every question asked in a voice that works at any hour.
--
-- WHAT WAS WRONG. Migration 113 folded the whole question bank onto the
-- morning screen, so all 87 live questions are Daily Reset questions now.
-- Most of them were written for an evening surface and still spoke as if
-- the day were already finished: "How many of today's meals had a real
-- protein source?", "What's most of today's stress coming from?", "How
-- active would you say you were today overall?". A member who signs up at
-- 8am and opens her first Daily Reset is being asked to report on a day
-- that has not happened yet, and several questions had no honest answer
-- at all for her (there was no way to say "I have not eaten").
--
-- THE RULE THIS APPLIES. A question about the present says "right now". A
-- question about what has accumulated says "so far today". A question
-- about last night keeps saying last night, because that one was always
-- true at any hour and is left exactly as it was. Where a question could
-- only be answered by somebody who had already done the thing, the answer
-- she was missing is added ("Haven't eaten yet", "None yet today",
-- "Haven't carried anything").
--
-- WHAT IS NOT CHANGED. No question is added, retired, re-driver'd or
-- moved between screens. No option VALUE changes, so every answer already
-- stored still resolves to the label it was chosen as. No response_type
-- changes, so no stored answer changes shape. This migration is words.
--
-- NO EM DASHES, here or in anything it writes.
--
-- Deliberately unconditional. Each statement sets the prompt it wants by
-- question_key rather than matching the old text, so re-running it is a
-- no-op and a partially applied run repairs itself (see the 2026-09-08
-- note about a migration that guarded on the old value and silently
-- matched nothing).

-- ------------------------------------------------------------------
-- The two named in the report
-- ------------------------------------------------------------------

-- Protein: a proportion of meals, asked of somebody who may have had
-- none yet, so "Haven't eaten yet" is now sayable.
update driver_probe_questions
set prompt = 'So far today, how many of your meals had a real protein source?',
    options = '[{"value":"all_of_them","label":"All of them"},{"value":"most_of_them","label":"Most of them"},{"value":"about_half","label":"About half"},{"value":"one_or_none","label":"One or none"},{"value":"havent_eaten_yet","label":"Haven''t eaten yet"}]'::jsonb
where question_key = 'checkin_probe.meals_with_protein';

-- Stress: what is on her now, not a day's worth of it in retrospect.
update driver_probe_questions
set prompt = 'What is weighing on you most right now, if anything?',
    options = '[{"value":"work","label":"Work"},{"value":"relationships_or_family","label":"Relationships or family"},{"value":"health","label":"Health"},{"value":"money","label":"Money"},{"value":"time_pressure","label":"Time pressure"},{"value":"no_clear_source","label":"Nothing in particular"},{"value":"other","label":"Other"}]'::jsonb
where question_key = 'checkin_probe.stress_source_today';

-- ------------------------------------------------------------------
-- Fuel
-- ------------------------------------------------------------------

update driver_probe_questions
set prompt = 'Have you had any alcohol so far today?'
where question_key = 'checkin_probe.alcohol_present';

update driver_probe_questions
set prompt = 'How many caffeinated drinks have you had so far today?'
where question_key = 'checkin_probe.caffeine_servings';

update driver_probe_questions
set prompt = 'Have you had caffeine before eating anything today?'
where question_key = 'checkin_probe.caffeine_on_empty_stomach';

update driver_probe_questions
set options = '[{"value":"before_noon","label":"Before noon"},{"value":"noon_to_3pm","label":"Noon to 3pm"},{"value":"3_to_6pm","label":"3 to 6pm"},{"value":"after_6pm","label":"After 6pm"},{"value":"none_today","label":"None yet today"}]'::jsonb
where question_key = 'checkin_probe.last_caffeine_timing';

update driver_probe_questions
set prompt = 'Any strong cravings so far today?'
where question_key = 'checkin_probe.cravings_today';

update driver_probe_questions
set prompt = 'Have you hit an energy crash at any point today?'
where question_key = 'checkin_probe.energy_crash_today';

update driver_probe_questions
set prompt = 'So far today, does it feel like you have had enough water?'
where question_key = 'checkin_probe.hydration_felt_adequate';

update driver_probe_questions
set prompt = 'How many meals have you skipped so far today?'
where question_key = 'checkin_probe.meals_skipped_today';

update driver_probe_questions
set prompt = 'What has been the longest stretch between meals so far today?'
where question_key = 'checkin_probe.longest_gap_between_meals';

-- FUE-1 is about eating late and how that lands on sleep, and its own
-- answers are all evening clock times, so the meal it means is last
-- night's. Said out loud now, because at 8am "your last meal" was
-- ambiguous and at 8pm it invited today's lunch.
update driver_probe_questions
set prompt = 'About when did you have your last meal or snack last night?'
where question_key = 'checkin_probe.last_meal_timing';

update driver_probe_questions
set prompt = 'About how soon after waking did you eat today?',
    options = '[{"value":"within_1h_of_waking","label":"Within an hour of waking"},{"value":"1_to_3h_after_waking","label":"1 to 3 hours after waking"},{"value":"skipped_breakfast","label":"Skipped breakfast"},{"value":"havent_eaten_yet","label":"Haven''t eaten yet"}]'::jsonb
where question_key = 'checkin_probe.breakfast_timing';

-- Was "Did your first meal today include protein?", which only had an
-- honest answer once she had eaten. Same driver, same yes or no, true at
-- any hour.
update driver_probe_questions
set prompt = 'Have you had protein yet today?'
where question_key = 'checkin_probe.protein_at_breakfast';

update driver_probe_questions
set prompt = 'What has been your main protein source so far today, if any?',
    options = '[{"value":"meat_fish_eggs","label":"Meat, fish, or eggs"},{"value":"dairy","label":"Dairy"},{"value":"plant_based","label":"Plant-based"},{"value":"protein_supplement","label":"Protein supplement or shake"},{"value":"mostly_none","label":"Mostly none"},{"value":"havent_eaten_yet","label":"Haven''t eaten yet"}]'::jsonb
where question_key = 'checkin_probe.protein_source_today';

-- ------------------------------------------------------------------
-- Movement and mechanics
-- ------------------------------------------------------------------

update driver_probe_questions
set prompt = 'How active have you been so far today, movement-wise?'
where question_key = 'checkin_probe.activity_level_today';

update driver_probe_questions
set prompt = 'Compared to your usual, does today feel like more or less walking so far?'
where question_key = 'checkin_probe.steps_felt_like';

update driver_probe_questions
set prompt = 'About how many hours have you spent sitting so far today?'
where question_key = 'checkin_probe.sitting_hours_today';

update driver_probe_questions
set prompt = 'About how often have you been getting up from sitting today?'
where question_key = 'checkin_probe.got_up_from_sitting';

update driver_probe_questions
set prompt = 'What has been the longest stretch you sat without getting up today?'
where question_key = 'checkin_probe.longest_sitting_stretch';

update driver_probe_questions
set prompt = 'Have you been getting up and moving at least once an hour today?'
where question_key = 'checkin_probe.got_up_hourly';

update driver_probe_questions
set prompt = 'About how many hours have you been at a desk or workstation so far today?'
where question_key = 'checkin_probe.desk_hours_today';

update driver_probe_questions
set prompt = 'Has your screen been at a comfortable height, or have you found yourself hunching toward it?'
where question_key = 'checkin_probe.screen_height_comfort';

update driver_probe_questions
set prompt = 'Is today a planned rest day?'
where question_key = 'checkin_probe.took_a_rest_day';

update driver_probe_questions
set prompt = 'How intense did today''s session feel, if you have had one?'
where question_key = 'checkin_probe.session_intensity';

update driver_probe_questions
set prompt = 'About how long was today''s session, if you have had one?'
where question_key = 'checkin_probe.training_minutes_today';

update driver_probe_questions
set prompt = 'Has today''s movement been the same pattern you usually do, or something different?',
    options = '[{"value":"same_as_usual","label":"Same as usual"},{"value":"something_different","label":"Something different"},{"value":"mix_of_both","label":"A mix of both"},{"value":"no_movement_today","label":"No movement yet today"}]'::jsonb
where question_key = 'checkin_probe.movement_type_today';

update driver_probe_questions
set prompt = 'How much time have you spent barefoot so far today?'
where question_key = 'checkin_probe.barefoot_time_today';

update driver_probe_questions
set prompt = 'What have you mostly been in, shoe-wise, today?'
where question_key = 'checkin_probe.footwear_today';

update driver_probe_questions
set prompt = 'How much support is today''s footwear giving you?'
where question_key = 'checkin_probe.footwear_support_level';

update driver_probe_questions
set prompt = 'If you have carried a bag today, which side (or did you switch)?',
    options = '[{"value":"always_same_side","label":"Always the same side"},{"value":"switch_sides","label":"I switch sides"},{"value":"backpack_or_even_load","label":"Backpack / evenly loaded"},{"value":"didnt_carry_anything","label":"Haven''t carried anything"}]'::jsonb
where question_key = 'checkin_probe.bag_or_carry_side';

update driver_probe_questions
set prompt = 'Have you noticed yourself favoring one side of your body today?'
where question_key = 'checkin_probe.dominant_side_overuse';

update driver_probe_questions
set prompt = 'Has anything today loaded one side more than the other (a sport, carrying something, your desk setup)?',
    options = '[{"value":"golf_or_racquet_sport","label":"Golf or a racquet sport"},{"value":"carrying_child_or_heavy_bag","label":"Carrying a child or heavy bag"},{"value":"desk_with_mouse_or_phone_favoring_one_side","label":"Desk, mouse or phone favoring one side"},{"value":"none_that_i_noticed","label":"None that I have noticed"}]'::jsonb
where question_key = 'checkin_probe.one_sided_activity_today';

-- ------------------------------------------------------------------
-- Stress, breath and the shape of the day
-- ------------------------------------------------------------------

update driver_probe_questions
set prompt = 'How emotionally heavy does today feel so far?'
where question_key = 'checkin_probe.emotional_load_today';

update driver_probe_questions
set prompt = 'What is most of that weight about, if you are comfortable sharing?'
where question_key = 'checkin_probe.emotional_load_source';

update driver_probe_questions
set prompt = 'Has today felt rushed so far?'
where question_key = 'checkin_probe.felt_rushed_all_day';

update driver_probe_questions
set prompt = 'Have you had any real downtime today (time with nothing scheduled or expected of you)?'
where question_key = 'checkin_probe.had_unstructured_time';

update driver_probe_questions
set prompt = 'About how much unstructured time have you had so far today?'
where question_key = 'checkin_probe.downtime_amount';

update driver_probe_questions
set prompt = 'How has your breathing been so far today: relaxed, or shallow or held at times?'
where question_key = 'checkin_probe.breath_holding_or_shallow';

update driver_probe_questions
set prompt = 'Have you caught yourself sighing or yawning a lot today?'
where question_key = 'checkin_probe.sighing_or_yawning_a_lot';

update driver_probe_questions
set prompt = 'Is today''s schedule your normal routine, or has it been thrown off (travel, a shift change, something like that)?'
where question_key = 'checkin_probe.schedule_today_vs_usual';

-- ------------------------------------------------------------------
-- Digestion and daylight
-- ------------------------------------------------------------------

update driver_probe_questions
set prompt = 'How has your digestion been so far today?'
where question_key = 'checkin_probe.digestion_rating';

update driver_probe_questions
set prompt = 'How many bowel movements so far today?'
where question_key = 'checkin_probe.bowel_movement_frequency_today';

update driver_probe_questions
set prompt = 'How have your bowel movements been so far today?',
    options = '[{"value":"normal","label":"Normal"},{"value":"constipated","label":"Constipated"},{"value":"loose","label":"Loose"},{"value":"none","label":"None yet today"}]'::jsonb
where question_key = 'checkin_probe.bowel_movement_status';

update driver_probe_questions
set prompt = 'Have you been mostly indoors so far today?'
where question_key = 'checkin_probe.mostly_indoors_today';

update driver_probe_questions
set prompt = 'About how much time have you spent outdoors so far today?'
where question_key = 'checkin_probe.time_outdoors_today';

-- ------------------------------------------------------------------
-- Option labels that carried an en dash, rewritten as words so a range
-- reads the same in every font and on every screen.
-- ------------------------------------------------------------------

update driver_probe_questions
set options = '[{"value":"under_3h","label":"Under 3 hours"},{"value":"3_to_5h","label":"3 to 5 hours"},{"value":"5_to_7h","label":"5 to 7 hours"},{"value":"7h_plus","label":"7 hours or more"}]'::jsonb
where question_key = 'checkin_probe.longest_gap_between_meals';

update driver_probe_questions
set options = '[{"value":"before_6pm","label":"Before 6pm"},{"value":"6_to_8pm","label":"6 to 8pm"},{"value":"8_to_9pm","label":"8 to 9pm"},{"value":"after_9pm","label":"After 9pm"},{"value":"skipped_dinner","label":"Skipped dinner"}]'::jsonb
where question_key = 'checkin_probe.last_meal_timing';

update driver_probe_questions
set options = '[{"value":"every_30_60_min","label":"Every 30 to 60 minutes"},{"value":"every_couple_hours","label":"Every couple hours"},{"value":"rarely_got_up","label":"Rarely got up"}]'::jsonb
where question_key = 'checkin_probe.got_up_from_sitting';

update driver_probe_questions
set options = '[{"value":"under_1h","label":"Under 1 hour"},{"value":"1_to_2h","label":"1 to 2 hours"},{"value":"2_to_3h","label":"2 to 3 hours"},{"value":"over_3h","label":"Over 3 hours"}]'::jsonb
where question_key = 'checkin_probe.longest_sitting_stretch';

update driver_probe_questions
set options = '[{"value":"under_4h","label":"Under 4 hours"},{"value":"4_to_6h","label":"4 to 6 hours"},{"value":"6_to_8h","label":"6 to 8 hours"},{"value":"8_to_10h","label":"8 to 10 hours"},{"value":"over_10h","label":"Over 10 hours"}]'::jsonb
where question_key = 'checkin_probe.sitting_hours_today';

update driver_probe_questions
set options = '[{"value":"none","label":"None"},{"value":"under_2h","label":"Under 2 hours"},{"value":"2_to_4h","label":"2 to 4 hours"},{"value":"4_to_6h","label":"4 to 6 hours"},{"value":"over_6h","label":"Over 6 hours"}]'::jsonb
where question_key = 'checkin_probe.desk_hours_today';

update driver_probe_questions
set options = '[{"value":"none","label":"None"},{"value":"under_15min","label":"Under 15 min"},{"value":"15_to_60min","label":"15 to 60 min"},{"value":"over_1h","label":"Over 1 hour"}]'::jsonb
where question_key = 'checkin_probe.time_outdoors_today';

update driver_probe_questions
set options = '[{"value":"none","label":"None"},{"value":"under_30min","label":"Under 30 min"},{"value":"30_to_60min","label":"30 to 60 min"},{"value":"over_60min","label":"Over 60 min"}]'::jsonb
where question_key = 'checkin_probe.screens_before_bed';

update driver_probe_questions
set options = '[{"value":"none","label":"None"},{"value":"a_few_minutes","label":"A few minutes"},{"value":"15_to_30_minutes","label":"15 to 30 minutes"},{"value":"more_than_30_minutes","label":"More than 30 minutes"}]'::jsonb
where question_key = 'checkin_probe.downtime_amount';

update driver_probe_questions
set options = '[{"value":"none","label":"None"},{"value":"under_20min","label":"Under 20 min"},{"value":"20_to_40min","label":"20 to 40 min"},{"value":"40_to_60min","label":"40 to 60 min"},{"value":"over_60min","label":"Over 60 min"}]'::jsonb
where question_key = 'checkin_probe.training_minutes_today';

update driver_probe_questions
set options = '[{"value":"today_or_yesterday","label":"Today or yesterday"},{"value":"2_to_3_days","label":"2 to 3 days"},{"value":"4_to_7_days","label":"4 to 7 days"},{"value":"over_a_week","label":"Over a week"},{"value":"cant_remember","label":"Can''t remember"}]'::jsonb
where question_key = 'checkin_probe.days_since_last_real_workout';

-- The follow-up to "how many meals have you skipped so far today", which
-- still spoke in the past tense about a finished day.
update driver_probe_questions
set prompt = 'Which meal or meals have you skipped?'
where question_key = 'checkin_probe.skipped_meal_which';
