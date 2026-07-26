# Driver Question Bank — v1 draft (for correction)

**What this is.** New check-in questions for the 33 drivers that get daily questions (MEC-2 and MEC-3 are skipped on purpose — the driver library says those come from the camera posture assessment, never from daily questions). Today only 7 rows exist in the database; this draft adds 86 more, for a total of 93.

**What to correct.** For every question below, the **Prompt** line is exactly what a member will read — fix it to sound like you. For multiple-choice questions, the words after `=` (e.g. `"Fell back asleep easily"`) are what the member sees and taps — edit those freely too. Leave the `checkin_probe.snake_case` keys and the technical labels (Type, Storage, Follow-up trigger) alone — those are wiring, not copy, and changing them will break the load-in step.

**A few already fully covered — no new question drafted:**
- **SLP-1 (sleep duration)** and **STR-1 (stress load)** already have a dedicated question every single day (the check-in's fixed core) — I added one small supplementary question to each below rather than a duplicate.
- **FUE-3 (hydration)** is tracked as a running counter throughout the day, not a check-in question — I added one short subjective question ("did it feel like enough") rather than a duplicate of the counter.

---

## Before you read the questions — one thing Claude Code found

The 7 existing rotating questions aren't actually rendered from their database data today. Each one is individually hand-built into the check-in screen's code (its exact wording, its exact answer buttons, all hard-typed into the page). That's fine for 7 questions. It will not work for 93 — nobody is going to hand-build 93 custom question blocks into the screen, and "add a question without a deploy" isn't true yet in practice, only in principle.

So loading this batch in is two things, not one:
1. **Insert the 93 rows** into the database (the easy part, no deploy needed on its own).
2. **Build one generic question renderer** that reads a row's type (scale / single-select / count / yes-no) and its answer options, and draws the right buttons automatically — replacing the hand-built blocks for the 7 that exist today, and making every future question (including these 93) actually show up on the screen without a code change. This is the part that makes "add a question later without a deploy" real.

Both are included in the Claude Code prompt at the bottom, once you're done correcting the wording below.

---

## Sleep and recovery

### SLP-1 — Sleep duration *(already asked every day; supplementary only)*
1. **checkin_probe.sleep_felt_like_enough** — boolean
   Prompt: "Even given the hours, did last night's sleep feel like enough?"

### SLP-2 — Sleep continuity *(existing: night_waking_count)*
2. **checkin_probe.woke_and_couldnt_fall_back** — single_select
   Prompt: "Once you woke up, how did falling back asleep go?"
   Options: `fell_back_asleep_easily` = "Fell back asleep easily" · `took_a_while` = "Took a while" · `couldnt_fall_back_asleep` = "Couldn't fall back asleep" · `didnt_wake_up` = "Didn't wake up"
3. **checkin_probe.morning_grogginess** — scale (1–5)
   Prompt: "How groggy did you feel when you first woke up?"

### SLP-3 — Bedtime consistency
4. **checkin_probe.bedtime_vs_usual** — single_select
   Prompt: "Compared to your usual bedtime, last night you went to bed—"
   Options: `much_earlier` = "Much earlier" · `little_earlier` = "A little earlier" · `about_the_same` = "About the same time" · `little_later` = "A little later" · `much_later` = "Much later"
5. **checkin_probe.weekday_weekend_bedtime_gap** — single_select *(asked rarely)*
   Prompt: "Is your bedtime usually different on weekends than weekdays?"
   Options: `about_the_same` = "About the same" · `a_little_different` = "A little different" · `very_different` = "Very different"
6. **checkin_probe.trouble_falling_asleep** — boolean
   Prompt: "Did it take you a while to fall asleep last night?"

### SLP-4 — Late bedtime
7. **checkin_probe.bedtime_later_than_wanted** — boolean
   Prompt: "Did you go to bed later than you wanted to?"
8. **checkin_probe.what_kept_you_up** — single_select — *Follow-up, shown only if #7 = Yes*
   Prompt: "What kept you up?"
   Options: `work` = "Work" · `screens_or_tv` = "Screens or TV" · `socializing` = "Socializing" · `couldnt_sleep_wasnt_tired` = "Couldn't sleep / wasn't tired" · `other` = "Other"

### SLP-5 — Sleep position
9. **checkin_probe.sleep_position** — single_select
   Prompt: "What position did you mostly sleep in?"
   Options: `side` = "Side" · `back` = "Back" · `stomach` = "Stomach" · `propped_up` = "Propped up" · `varied_didnt_notice` = "Varied / didn't notice"
10. **checkin_probe.woke_in_different_position** — boolean *(asked rarely)*
    Prompt: "Did you wake up in a different position than you fell asleep in?"
11. **checkin_probe.sleep_setup_recent_change** — boolean *(asked rarely)*
    Prompt: "Any recent change to your pillow, mattress, or sleep setup?"

### SLP-6 — Thermal disruption *(existing: night_sweats)*
12. **checkin_probe.woke_up_hot** — boolean
    Prompt: "Did you wake up feeling overheated, even without sweating?"
13. **checkin_probe.room_temperature_comfort** — single_select *(asked rarely)*
    Prompt: "Was your room temperature comfortable last night?"
    Options: `too_hot` = "Too hot" · `too_cold` = "Too cold" · `just_right` = "Just right"

---

## Fuel and nutrition

### FUE-1 — Meal timing
14. **checkin_probe.last_meal_timing** — single_select
    Prompt: "About when did you eat your last meal or snack?"
    Options: `before_6pm` = "Before 6pm" · `6_to_8pm` = "6–8pm" · `8_to_9pm` = "8–9pm" · `after_9pm` = "After 9pm" · `skipped_dinner` = "Skipped dinner"
15. **checkin_probe.late_eating_reason** — single_select — *Follow-up, shown only if #14 = 8–9pm or After 9pm*
    Prompt: "What made it a later meal?"
    Options: `work_schedule` = "Work schedule" · `social` = "Social" · `just_hungry` = "Just hungry" · `habit` = "Habit" · `other` = "Other"
16. **checkin_probe.breakfast_timing** — single_select
    Prompt: "About how soon after waking did you eat?"
    Options: `within_1h_of_waking` = "Within an hour of waking" · `1_to_3h_after_waking` = "1–3 hours after waking" · `skipped_breakfast` = "Skipped breakfast"

### FUE-2 — Meal regularity
17. **checkin_probe.meals_skipped_today** — count (0–3+)
    Prompt: "How many meals did you skip today?"
18. **checkin_probe.longest_gap_between_meals** — single_select
    Prompt: "What was the longest stretch between meals today?"
    Options: `under_3h` = "Under 3 hours" · `3_to_5h` = "3–5 hours" · `5_to_7h` = "5–7 hours" · `7h_plus` = "7+ hours"
19. **checkin_probe.skipped_meal_which** — single_select — *Follow-up, shown only if #17 ≥ 1*
    Prompt: "Which meal(s) did you skip?"
    Options: `breakfast` = "Breakfast" · `lunch` = "Lunch" · `dinner` = "Dinner" · `more_than_one` = "More than one"

### FUE-3 — Hydration *(already tracked as a running counter; supplementary only)*
20. **checkin_probe.hydration_felt_adequate** — boolean *(asked rarely)*
    Prompt: "Did you feel like you drank enough water today?"

### FUE-4 — Blood sugar swings
21. **checkin_probe.energy_crash_today** — boolean
    Prompt: "Did you hit an energy crash at any point today?"
22. **checkin_probe.crash_timing** — single_select — *Follow-up, shown only if #21 = Yes*
    Prompt: "About when did it hit?"
    Options: `mid_morning` = "Mid-morning" · `early_afternoon` = "Early afternoon" · `late_afternoon` = "Late afternoon" · `evening` = "Evening" · `more_than_once` = "More than once"
23. **checkin_probe.cravings_today** — single_select
    Prompt: "Any strong cravings today?"
    Options: `none` = "None" · `sugar_or_carbs` = "Sugar or carbs" · `salty` = "Salty" · `caffeine` = "Caffeine" · `just_hungry_in_general` = "Just hungry in general"

### FUE-5 — Caffeine load and timing
24. **checkin_probe.caffeine_servings** — count (0–5+)
    Prompt: "How many caffeinated drinks did you have today?"
25. **checkin_probe.last_caffeine_timing** — single_select
    Prompt: "About when was your last one?"
    Options: `before_noon` = "Before noon" · `noon_to_3pm` = "Noon–3pm" · `3_to_6pm` = "3–6pm" · `after_6pm` = "After 6pm" · `none_today` = "None today"
26. **checkin_probe.caffeine_on_empty_stomach** — boolean *(asked rarely)*
    Prompt: "Did you have caffeine before eating anything?"

### FUE-6 — Alcohol
27. **checkin_probe.alcohol_present** — boolean
    Prompt: "Did you have any alcohol today?"
28. **checkin_probe.alcohol_drinks_count** — count (1–4+) — *Follow-up, shown only if #27 = Yes*
    Prompt: "About how many drinks?"

### FUE-7 — Protein adequacy
29. **checkin_probe.meals_with_protein** — single_select
    Prompt: "How many of today's meals had a real protein source?"
    Options: `all_of_them` = "All of them" · `most_of_them` = "Most of them" · `about_half` = "About half" · `one_or_none` = "One or none"
30. **checkin_probe.protein_at_breakfast** — boolean *(asked rarely)*
    Prompt: "Did your first meal today include protein?"
31. **checkin_probe.protein_source_today** — single_select *(asked rarely)*
    Prompt: "What was your main protein source today, if any?"
    Options: `meat_fish_eggs` = "Meat, fish, or eggs" · `dairy` = "Dairy" · `plant_based` = "Plant-based" · `protein_supplement` = "Protein supplement/shake" · `mostly_none` = "Mostly none"

---

## Digestion

### DIG-1 — Bowel regularity *(existing: bowel_movement_status)*
32. **checkin_probe.bowel_movement_frequency_today** — count (0–3+)
    Prompt: "How many bowel movements today?"
33. **checkin_probe.bowel_regularity_this_week** — single_select *(asked rarely)*
    Prompt: "How regular has this been for you this week overall?"
    Options: `very_regular` = "Very regular" · `somewhat_regular` = "Somewhat regular" · `irregular` = "Irregular" · `not_sure` = "Not sure"

### DIG-2 — Digestive discomfort *(existing: digestion_rating)*
34. **checkin_probe.digestive_symptom_type** — single_select — *Follow-up, shown only if digestion_rating is 1–2 (poor)*
    Prompt: "What kind of discomfort?"
    Options: `bloating` = "Bloating" · `cramping` = "Cramping" · `reflux_or_heartburn` = "Reflux or heartburn" · `gas` = "Gas" · `nausea` = "Nausea" · `more_than_one` = "More than one"
35. **checkin_probe.discomfort_timing** — single_select
    Prompt: "When does it tend to show up?"
    Options: `after_meals` = "After meals" · `most_of_the_day` = "Most of the day" · `morning` = "Morning" · `evening` = "Evening" · `no_clear_pattern` = "No clear pattern"

---

## Movement and load

### MOV-1 — Sitting hours
36. **checkin_probe.sitting_hours_today** — single_select
    Prompt: "About how many hours did you spend sitting today?"
    Options: `under_4h` = "Under 4 hours" · `4_to_6h` = "4–6 hours" · `6_to_8h` = "6–8 hours" · `8_to_10h` = "8–10 hours" · `over_10h` = "Over 10 hours"
37. **checkin_probe.longest_sitting_stretch** — single_select *(asked rarely)*
    Prompt: "What was the longest stretch you sat without getting up?"
    Options: `under_1h` = "Under 1 hour" · `1_to_2h` = "1–2 hours" · `2_to_3h` = "2–3 hours" · `over_3h` = "Over 3 hours"
38. **checkin_probe.got_up_from_sitting** — single_select *(asked rarely)*
    Prompt: "About how often did you get up from sitting today?"
    Options: `every_30_60_min` = "Every 30–60 minutes" · `every_couple_hours` = "Every couple hours" · `rarely_got_up` = "Rarely got up"

### MOV-2 — Training volume *(existing: movement_today)*
39. **checkin_probe.training_minutes_today** — single_select *(skipped automatically if a connected wearable already logged a session)*
    Prompt: "About how long was today's session, if you had one?"
    Options: `none` = "None" · `under_20min` = "Under 20 min" · `20_to_40min` = "20–40 min" · `40_to_60min` = "40–60 min" · `over_60min` = "Over 60 min"
40. **checkin_probe.session_intensity** — single_select
    Prompt: "How intense did today's session feel, if you had one?"
    Options: `easy` = "Easy" · `moderate` = "Moderate" · `hard` = "Hard" · `very_hard` = "Very hard"

### MOV-3 — Training absence
41. **checkin_probe.days_since_last_real_workout** — single_select *(asked rarely)*
    Prompt: "How long has it been since your last real workout?"
    Options: `today_or_yesterday` = "Today or yesterday" · `2_to_3_days` = "2–3 days" · `4_to_7_days` = "4–7 days" · `over_a_week` = "Over a week" · `cant_remember` = "Can't remember"
42. **checkin_probe.longest_break_this_month** — single_select *(asked rarely)*
    Prompt: "Have you had a longer break from training this month?"
    Options: `none` = "None" · `a_few_days` = "A few days" · `about_a_week` = "About a week" · `more_than_a_week` = "More than a week"
43. **checkin_probe.motivation_to_train** — single_select *(asked rarely)*
    Prompt: "How's your motivation to train feeling lately?"
    Options: `eager` = "Eager" · `neutral` = "Neutral" · `dreading_it` = "Dreading it" · `didnt_think_about_it` = "Didn't think about it"

### MOV-4 — Movement variety
44. **checkin_probe.movement_type_today** — single_select
    Prompt: "Was today's movement the same pattern you usually do, or something different?"
    Options: `same_as_usual` = "Same as usual" · `something_different` = "Something different" · `mix_of_both` = "A mix of both" · `no_movement_today` = "No movement today"
45. **checkin_probe.variety_this_week** — single_select *(asked rarely)*
    Prompt: "How varied has your movement been this week?"
    Options: `mostly_one_activity` = "Mostly one activity" · `two_or_three_activities` = "Two or three activities" · `lots_of_variety` = "Lots of variety"
46. **checkin_probe.same_muscle_groups_repeatedly** — boolean *(asked rarely)*
    Prompt: "Have you been hitting the same muscle groups or movement pattern repeatedly lately?"

### MOV-5 — Recovery days
47. **checkin_probe.morning_soreness** — *wire existing column, no new question* — reuses the "How sore does your body feel this morning?" field that's already asked every day; this just tells the driver-state engine it's evidence for MOV-5. No screen change.
48. **checkin_probe.took_a_rest_day** — boolean
    Prompt: "Was today a planned rest day?"
49. **checkin_probe.feel_recovered** — single_select
    Prompt: "How recovered do you feel from your last hard session?"
    Options: `fully_recovered` = "Fully recovered" · `mostly_recovered` = "Mostly recovered" · `still_a_bit_tired` = "Still a bit tired" · `still_pretty_sore_or_tired` = "Still pretty sore or tired"

### MOV-6 — Daily step volume
50. **checkin_probe.activity_level_today** — single_select *(skipped automatically if a connected wearable already reports steps)*
    Prompt: "How active would you say you were today overall, movement-wise?"
    Options: `mostly_sedentary` = "Mostly sedentary" · `some_walking` = "Some walking" · `fairly_active` = "Fairly active" · `very_active` = "Very active"
51. **checkin_probe.steps_felt_like** — single_select *(asked rarely)*
    Prompt: "Compared to your usual, did today feel like more or less walking than normal?"
    Options: `a_lot_less_than_usual` = "A lot less than usual" · `about_usual` = "About usual" · `more_than_usual` = "More than usual"

---

## Mechanics and posture

*(MEC-2 and MEC-3 skipped — camera assessment only, per the driver library.)*

### MEC-1 — Workstation load
52. **checkin_probe.desk_hours_today** — single_select
    Prompt: "About how many hours were you at a desk or workstation today?"
    Options: `none` = "None" · `under_2h` = "Under 2 hours" · `2_to_4h` = "2–4 hours" · `4_to_6h` = "4–6 hours" · `over_6h` = "Over 6 hours"
53. **checkin_probe.screen_height_comfort** — single_select *(asked rarely)*
    Prompt: "Was your screen at a comfortable height, or did you find yourself hunching toward it?"
    Options: `comfortable` = "Comfortable" · `a_little_off` = "A little off" · `uncomfortable_had_to_hunch` = "Uncomfortable — had to hunch" · `not_sure` = "Not sure"
54. **checkin_probe.got_up_hourly** — boolean — *Follow-up, shown only if #52 = 4–6 hours or Over 6 hours*
    Prompt: "Did you get up and move at least once an hour?"

### MEC-4 — Footwear
55. **checkin_probe.footwear_today** — single_select
    Prompt: "What were you mostly in, shoe-wise, today?"
    Options: `supportive_sneakers` = "Supportive sneakers" · `dress_or_work_shoes` = "Dress or work shoes" · `heels` = "Heels" · `flats_or_sandals` = "Flats or sandals" · `barefoot_or_socks_mostly` = "Barefoot or socks, mostly"
56. **checkin_probe.barefoot_time_today** — single_select *(asked rarely)*
    Prompt: "How much time did you spend barefoot today?"
    Options: `none` = "None" · `a_little` = "A little" · `a_good_amount` = "A good amount" · `most_of_the_day` = "Most of the day"
57. **checkin_probe.footwear_support_level** — single_select *(asked rarely)*
    Prompt: "How much support would you say today's footwear gave you?"
    Options: `good_support` = "Good support" · `minimal_support` = "Minimal support" · `no_support` = "No support"

### MEC-5 — One-sided loading
58. **checkin_probe.bag_or_carry_side** — single_select
    Prompt: "If you carried a bag today, which side — or did you switch?"
    Options: `always_same_side` = "Always the same side" · `switch_sides` = "I switch sides" · `backpack_or_even_load` = "Backpack / evenly loaded" · `didnt_carry_anything` = "Didn't carry anything"
59. **checkin_probe.dominant_side_overuse** — single_select *(asked rarely)*
    Prompt: "Did you notice yourself favoring one side of your body today?"
    Options: `yes_noticeably` = "Yes, noticeably" · `a_little` = "A little" · `not_that_i_noticed` = "Not that I noticed"
60. **checkin_probe.one_sided_activity_today** — single_select *(asked rarely)*
    Prompt: "Did anything today load one side more than the other — a sport, carrying something, your desk setup?"
    Options: `golf_or_racquet_sport` = "Golf or a racquet sport" · `carrying_child_or_heavy_bag` = "Carrying a child or heavy bag" · `desk_with_mouse_or_phone_favoring_one_side` = "Desk/mouse/phone favoring one side" · `none_that_i_noticed` = "None that I noticed"

---

## Stress and nervous system

### STR-1 — Perceived stress load *(already asked every day; supplementary only)*
61. **checkin_probe.stress_source_today** — single_select
    Prompt: "What's most of today's stress coming from, if anything?"
    Options: `work` = "Work" · `relationships_or_family` = "Relationships or family" · `health` = "Health" · `money` = "Money" · `time_pressure` = "Time pressure" · `no_clear_source` = "No clear source" · `other` = "Other"

### STR-2 — Breathing pattern
62. **checkin_probe.breath_holding_or_shallow** — single_select
    Prompt: "How would you describe your breathing today — relaxed, or shallow/held at times?"
    Options: `normal_relaxed` = "Normal and relaxed" · `shallow_at_times` = "Shallow at times" · `caught_myself_holding_breath` = "Caught myself holding my breath" · `not_sure` = "Not sure"
63. **checkin_probe.chest_vs_belly_breathing** — single_select *(asked rarely)*
    Prompt: "When you notice your breath, does it feel like it's coming more from your chest or your belly?"
    Options: `mostly_belly` = "Mostly belly" · `mostly_chest` = "Mostly chest" · `a_mix` = "A mix" · `not_sure` = "Not sure"
64. **checkin_probe.sighing_or_yawning_a_lot** — boolean *(asked rarely)*
    Prompt: "Did you catch yourself sighing or yawning a lot today?"

### STR-3 — Evening wind-down
65. **checkin_probe.screens_before_bed** — single_select
    Prompt: "About how much screen time did you have in the hour before bed?"
    Options: `none` = "None" · `under_30min` = "Under 30 min" · `30_to_60min` = "30–60 min" · `over_60min` = "Over 60 min"
66. **checkin_probe.had_a_windown_routine** — boolean
    Prompt: "Did you have any kind of wind-down routine before bed last night?"
67. **checkin_probe.work_right_up_to_bed** — boolean *(asked rarely)*
    Prompt: "Were you working, emailing, or on your phone for work right up until bed?"

### STR-4 — Emotional load
68. **checkin_probe.emotional_load_today** — single_select
    Prompt: "How emotionally heavy did today feel?"
    Options: `light` = "Light" · `some` = "Some" · `heavy` = "Heavy" · `very_heavy` = "Very heavy"
69. **checkin_probe.emotional_load_source** — single_select — *Follow-up, shown only if #68 = Heavy or Very heavy*
    Prompt: "What was most of that weight about, if you're comfortable sharing?"
    Options: `work` = "Work" · `relationship_or_family` = "Relationship or family" · `health` = "Health" · `grief_or_loss` = "Grief or loss" · `caregiving` = "Caregiving" · `money` = "Money" · `other` = "Other"

### STR-5 — Downtime scarcity
70. **checkin_probe.had_unstructured_time** — boolean
    Prompt: "Did you have any real downtime today — time with nothing scheduled or expected of you?"
71. **checkin_probe.downtime_amount** — single_select *(asked rarely)*
    Prompt: "About how much unstructured time did you get?"
    Options: `none` = "None" · `a_few_minutes` = "A few minutes" · `15_to_30_minutes` = "15–30 minutes" · `more_than_30_minutes` = "More than 30 minutes"
72. **checkin_probe.felt_rushed_all_day** — boolean *(asked rarely)*
    Prompt: "Did today feel rushed from start to finish?"

---

## Context

### CTX-1 — Cycle phase
73. **checkin_probe.cycle_phase** — single_select *(asked rarely)*
    Prompt: "Where are you in your cycle, if applicable?"
    Options: `menstrual` = "Menstrual" · `follicular` = "Follicular" · `ovulation` = "Ovulation" · `luteal` = "Luteal" · `not_applicable` = "Not applicable" · `prefer_not_to_say` = "Prefer not to say"

### CTX-2 — Daylight exposure
74. **checkin_probe.morning_light_today** — boolean
    Prompt: "Did you get outside in daylight within an hour or two of waking?"
75. **checkin_probe.time_outdoors_today** — single_select *(asked rarely)*
    Prompt: "About how much time did you spend outdoors today?"
    Options: `none` = "None" · `under_15min` = "Under 15 min" · `15_to_60min` = "15–60 min" · `over_1h` = "Over 1 hour"
76. **checkin_probe.mostly_indoors_today** — boolean *(asked rarely)*
    Prompt: "Were you mostly indoors today?"

### CTX-3 — Schedule irregularity
77. **checkin_probe.schedule_today_vs_usual** — single_select
    Prompt: "Was today's schedule your normal routine, or was it thrown off — travel, a shift change, something like that?"
    Options: `normal_routine` = "Normal routine" · `slightly_different` = "Slightly different" · `very_different_travel_or_shift` = "Very different — travel or shift change"
78. **checkin_probe.days_of_irregular_schedule_this_week** — single_select *(asked rarely)*
    Prompt: "How many days this week have been off your usual schedule?"
    Options: `none` = "None" · `one_or_two` = "One or two" · `most_of_the_week` = "Most of the week"
79. **checkin_probe.upcoming_travel_or_shift_change** — boolean *(asked rarely)*
    Prompt: "Any travel or schedule change coming up in the next few days?"

### CTX-4 — Medication or supplement change
80. **checkin_probe.medication_or_supplement_change** — boolean *(asked rarely)*
    Prompt: "Any change to medications or supplements recently — starting, stopping, or a dose change?"
81. **checkin_probe.what_changed** — single_select — *Follow-up, shown only if #80 = Yes*
    Prompt: "What changed?"
    Options: `started_something_new` = "Started something new" · `stopped_something` = "Stopped something" · `changed_a_dose` = "Changed a dose" · `prefer_not_to_say` = "Prefer not to say"

---

## Count check

80 new question rows above (items 1–46, 48–81 — 81 numbered items, minus #47, which is a re-wiring of an existing field, not a new question), plus the 7 that already exist = **87 total** driver questions, across 33 drivers. Every driver in the library that's eligible for daily questions has at least 1; most have 2–3.

*(Correction: an earlier version of this doc said 86/93 — that was a counting error, fixed here to match what's actually listed above and what the migration below actually inserts.)*

---

## Once you've corrected the wording

Save your edits directly into this file (same path: `docs/driver-question-bank-draft-v1.md`), then hand Claude Code the prompt below.
