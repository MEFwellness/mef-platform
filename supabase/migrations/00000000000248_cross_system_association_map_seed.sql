-- ROOT'S STARTER WHOLE-BODY ASSOCIATION MAP.
--
-- WHY THIS SUPERSEDES MIGRATION 243'S "THE LIBRARY SHIPS EMPTY" RULE, and
-- why that is not a contradiction. That rule existed to stop the SYSTEM
-- from inventing relationships at runtime, and it still holds absolutely:
-- there is no generator, no inference and no suggestion anywhere in this
-- feature, and Root at runtime still uses only what exists in these
-- tables. What changed is who authored the first rows. The map below is
-- AUTHORED COACHING METHODOLOGY CONTENT, delivered as part of the build
-- and reviewed as content, exactly like migration 241's 159 standardized
-- signal names and migration 221's questionnaire. A coach should not have
-- to type two hundred relationships before the app does anything.
--
-- WHAT AN ENTRY MEANS, said once and meant everywhere:
--
--   "When a client presents with this type of complaint, these are the
--    other body systems, areas, functions or findings that may be worth
--    reviewing."
--
-- IT DOES NOT MEAN "this other system produced the complaint", and no
-- wording below says so. Every association text uses the approved
-- vocabulary from lib/cross-system-relationships/language.ts, and
-- tests/cross-system-relationship-copy.test.ts reads these rows out of the
-- SQL and holds them to zero banned phrases, which no source guard could
-- do on its own.
--
-- THE BASIS IS STATED, NEVER IMPLIED. Every row carries a source_type_key,
-- because a CHEK / HLC methodology association and a conventional
-- referred-pain relationship do not have the same evidence basis and must
-- not be presented as though they do.
--
-- SHE STILL OWNS IT. Every row below is an ordinary relationship: the
-- editor opens it, an edit writes version 2 the normal way, and
-- deactivating one takes it out of Root's lookups immediately. is_seeded
-- only records where the first version came from.
--
-- NOTHING HERE IS HARD CODED TO A PAIRING. Read the function: it takes
-- lists of (vocabulary, key) pairs and resolves their labels from the
-- Signal Library. There is no hip column and no kidney column, and the
-- same call that seeds the hip entry seeds the mood one.

-- ---------------------------------------------------------------------
-- The seeding helper. Dropped at the end of this migration, so it is a
-- build-time tool and never an API.
-- ---------------------------------------------------------------------
create or replace function pg_temp.seed_association_entry(
  p_key            text,
  p_name           text,
  p_source_type    text,
  p_association    text,
  p_primaries      jsonb,
  p_related        jsonb,
  p_considerations text[]
) returns void
language plpgsql
as $fn$
declare
  v_rel  uuid;
  v_ver  uuid;
  v_item jsonb;
  v_pos  integer := 0;
  v_kind text;
  v_key  text;
  v_label text;
  v_i    integer;
begin
  insert into cross_system_relationships (pattern_key, is_active, is_example, is_seeded, current_version)
  values (p_key, true, false, true, 1)
  on conflict (pattern_key) do nothing
  returning id into v_rel;

  -- Already seeded by an earlier run of this migration: leave it alone.
  -- A coach may have edited it since, and a re-run must never overwrite
  -- her version.
  if v_rel is null then
    return;
  end if;

  insert into cross_system_relationship_versions (
    relationship_id, version_number, pattern_name, min_supporting_signals,
    possible_association_text, evidence_notes, change_summary,
    source_type_key, surfaces_on_complaint
  ) values (
    v_rel, 1, p_name, 1,
    p_association,
    null,
    null,
    p_source_type,
    /* THE BEHAVIOUR FLAG. A seeded map entry is read by the complaint
       driven lookup, which needs no floor: an area worth reviewing is
       worth reviewing even when nothing supports it yet, and "not
       currently observed" is information a coach wants. The floor based
       matcher from Prompt 3 skips these, so one entry never produces two
       different cards about the same thing. */
    true
  ) returning id into v_ver;

  -- THE PRIMARIES. What a client has to have reported for this entry to
  -- be consulted at all.
  for v_item in select * from jsonb_array_elements(p_primaries) loop
    v_kind := v_item ->> 0;
    v_key  := v_item ->> 1;
    v_label := case v_kind
      when 'category'  then (select display_name from cross_system_signal_categories where category_key = v_key)
      when 'body_area' then (select display_name from cross_system_body_areas where area_key = v_key)
      when 'signal'    then (select display_name from cross_system_signal_names where signal_slug = v_key)
    end;
    if v_label is null then
      raise exception 'seed_association_entry: % names a % key "%" that does not exist', p_key, v_kind, v_key;
    end if;
    insert into cross_system_relationship_components
      (version_id, position, role, ref_kind, ref_key, ref_label)
    values (v_ver, v_pos, 'primary', v_kind, v_key, v_label);
    v_pos := v_pos + 1;
  end loop;

  -- THE RELATED AREAS. What Root goes and looks at when a primary is
  -- reported. These are the "worth reviewing" half, and they are the
  -- reason a coach never has to connect a symptom by hand.
  for v_item in select * from jsonb_array_elements(p_related) loop
    v_kind := v_item ->> 0;
    v_key  := v_item ->> 1;
    v_label := case v_kind
      when 'category'  then (select display_name from cross_system_signal_categories where category_key = v_key)
      when 'body_area' then (select display_name from cross_system_body_areas where area_key = v_key)
      when 'signal'    then (select display_name from cross_system_signal_names where signal_slug = v_key)
    end;
    if v_label is null then
      raise exception 'seed_association_entry: % names a % key "%" that does not exist', p_key, v_kind, v_key;
    end if;
    insert into cross_system_relationship_components
      (version_id, position, role, ref_kind, ref_key, ref_label)
    values (v_ver, v_pos, 'related', v_kind, v_key, v_label);
    v_pos := v_pos + 1;
  end loop;

  -- The two default bands, so the editor opens on a well formed entry and
  -- a coach who wants to convert one to floor based counting can.
  insert into cross_system_relationship_strength_levels
    (version_id, level_key, position, display_label, min_supporting_signals, min_distinct_categories, min_related_signals)
  values
    (v_ver, 'emerging', 0, 'Emerging', 2, null, null),
    (v_ver, 'stronger', 1, 'Stronger', 3, 2, null);

  for v_i in 1 .. coalesce(array_length(p_considerations, 1), 0) loop
    insert into cross_system_relationship_considerations (version_id, position, body)
    values (v_ver, v_i - 1, p_considerations[v_i]);
  end loop;
end;
$fn$;

-- ---------------------------------------------------------------------
-- THE MAP. Eighteen entries, covering the whole body.
-- ---------------------------------------------------------------------

-- 1. HIP AND PELVIS.
select pg_temp.seed_association_entry(
  'starter-hip-pelvis',
  'Hip and pelvis signals, whole-body areas worth reviewing',
  'chek_hlc',
  'Hip and pelvic signals are observed alongside kidney and bladder findings, low-back and sacral findings, pelvic alignment, gait and gluteal function, and stress and recovery load in this coaching methodology. These are areas that may be relevant and worth reviewing together, not an account of what produced the complaint.',
  '[["body_area","hip"],["body_area","pelvis"]]'::jsonb,
  '[["category","kidney_bladder"],["body_area","low_back"],["category","posture_alignment"],["category","hormonal"],["category","stress"],["category","sleep"],["category","musculoskeletal"],["body_area","knee"],["category","joint_movement"]]'::jsonb,
  array[
    'Ask when the hip signal began, and whether anything changed in training, footwear or daily load around that time.',
    'Ask whether it changes with walking, sitting or standing, and whether it is worse at any particular time of day.',
    'Review the Kidney and Bladder responses in her Body Systems Survey alongside any urinary patterns she has reported.',
    'Review pelvic alignment and gait findings from her posture and movement assessment.',
    'Consider whether gluteal and hip flexor function is worth assessing directly.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

-- 2. LOW BACK AND LUMBAR.
select pg_temp.seed_association_entry(
  'starter-low-back',
  'Low-back signals, whole-body areas worth reviewing',
  'chek_hlc',
  'Low-back signals are observed alongside kidney and bladder findings, digestion and bowel patterns, pelvic and hip findings, breathing mechanics, posture and loading, sleep and stress in this coaching methodology. These areas may be relevant and worth reviewing together.',
  '[["body_area","low_back"]]'::jsonb,
  '[["category","kidney_bladder"],["category","digestion"],["body_area","pelvis"],["body_area","hip"],["category","respiratory"],["category","posture_alignment"],["category","sleep"],["category","stress"],["category","hormonal"],["category","musculoskeletal"]]'::jsonb,
  array[
    'Ask when the low-back signal began and whether it follows a pattern through the week.',
    'Ask whether it changes with stress, with sitting, or around her cycle.',
    'Review her bowel patterns and digestion responses alongside this.',
    'Review breathing mechanics and core function, which carry load through this area.',
    'Review recent changes in movement, training volume or daily sitting.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

-- 3. SHOULDER AND UPPER ARM.
select pg_temp.seed_association_entry(
  'starter-shoulder',
  'Shoulder and upper-arm signals, whole-body areas worth reviewing',
  'chek_hlc',
  'Shoulder signals are observed alongside cervical and thoracic posture, ribcage and breathing mechanics, scapular mechanics, stress and tension, and liver and gallbladder related findings within this coaching framework. These are areas worth reviewing, and this is a methodology relationship rather than an established medical finding.',
  '[["body_area","shoulder"],["body_area","arm"]]'::jsonb,
  '[["body_area","neck"],["body_area","upper_back"],["category","respiratory"],["category","stress"],["category","clearance_detox"],["category","posture_alignment"],["category","sleep"],["body_area","chest"],["category","musculoskeletal"]]'::jsonb,
  array[
    'Ask when the shoulder signal began and whether it relates to a particular movement or a repeated task.',
    'Ask about sleep position and which side she settles on.',
    'Review cervical and thoracic posture findings from her assessment.',
    'Review ribcage movement and breathing pattern findings.',
    'Review her Liver and Detox responses, noting that this is a coaching relationship rather than a proven one.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

-- 4. NECK AND UPPER CERVICAL.
select pg_temp.seed_association_entry(
  'starter-neck',
  'Neck signals, whole-body areas worth reviewing',
  'chek_hlc',
  'Neck signals are observed alongside breathing mechanics, jaw and mastication findings, posture and upper thoracic alignment, shoulder findings, stress, sleep, visual strain and nervous-system load. These areas may be relevant and are worth reviewing together.',
  '[["body_area","neck"]]'::jsonb,
  '[["category","respiratory"],["body_area","jaw"],["category","posture_alignment"],["body_area","upper_back"],["body_area","shoulder"],["category","stress"],["category","sleep"],["body_area","eyes"],["category","neurological"],["category","digestion"]]'::jsonb,
  array[
    'Ask when the neck signal began and whether it tracks with her workload or screen time.',
    'Ask whether she notices jaw clenching or grinding, particularly at night.',
    'Review her breathing pattern findings, since accessory breathing loads this area.',
    'Review forward head posture and upper thoracic findings from her assessment.',
    'Ask whether headaches arrive with the neck signal or separately from it.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

-- 5. KNEE.
select pg_temp.seed_association_entry(
  'starter-knee',
  'Knee signals, whole-body areas worth reviewing',
  'biomechanics',
  'Knee signals are observed alongside hip mechanics, ankle and foot findings, gait, pelvic alignment, lower-extremity strength and recent changes in load. The joints above and below a knee are part of how it is reviewed in this methodology.',
  '[["body_area","knee"]]'::jsonb,
  '[["body_area","hip"],["body_area","ankle"],["body_area","foot"],["body_area","pelvis"],["category","posture_alignment"],["category","musculoskeletal"],["category","energy"],["category","metabolic"],["category","joint_movement"]]'::jsonb,
  array[
    'Ask when the knee signal began and what changed in her training or daily load around then.',
    'Ask whether it is worse going up or down stairs, and whether it changes with walking distance.',
    'Review hip mechanics and ankle mobility, the joints above and below.',
    'Review inward knee drift and pelvic alignment findings from her posture assessment.',
    'Review recovery and any inflammation-type signals she has reported.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

-- 6. ANKLE AND FOOT.
select pg_temp.seed_association_entry(
  'starter-ankle-foot',
  'Ankle and foot signals, whole-body areas worth reviewing',
  'biomechanics',
  'Ankle and foot signals are observed alongside gait, knee and hip mechanics, pelvic alignment, balance, lower-leg findings and footwear or load history. These are areas worth reviewing together rather than treating the foot in isolation.',
  '[["body_area","ankle"],["body_area","foot"]]'::jsonb,
  '[["body_area","knee"],["body_area","hip"],["body_area","pelvis"],["category","posture_alignment"],["category","musculoskeletal"],["category","circulation"],["category","energy"],["category","joint_movement"]]'::jsonb,
  array[
    'Ask when the signal began and whether footwear, terrain or training surface changed around then.',
    'Ask about any previous ankle or foot injury, however long ago.',
    'Review foot turnout, weight shift and gait findings from her posture assessment.',
    'Review knee and hip mechanics, since load travels through all three.',
    'Consider whether balance is worth assessing directly.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

-- 7. HEADACHES.
select pg_temp.seed_association_entry(
  'starter-headaches',
  'Headache signals, whole-body areas worth reviewing',
  'lifestyle',
  'Headache signals are observed alongside hydration, sleep, stress, breathing, cervical posture, jaw tension, blood sugar and energy patterns, hormonal findings, digestive signals and visual strain. These areas may be relevant and are worth reviewing together.',
  '[["signal","headaches"],["signal","headaches-when-not-eaten"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","respiratory"],["body_area","neck"],["body_area","jaw"],["category","metabolic"],["category","hormonal"],["category","digestion"],["body_area","eyes"],["category","immune"],["category","nutrition"]]'::jsonb,
  array[
    'Ask when the headaches began, what time of day they arrive and how long they last.',
    'Ask whether they follow a missed or delayed meal.',
    'Ask whether they track with her cycle.',
    'Review her fluid intake and caffeine timing.',
    'Review cervical posture and jaw tension findings.',
    'Consider medical referral if headaches are persistent, worsening, unusual, or outside coaching scope.'
  ]
);

-- 8. SKIN.
select pg_temp.seed_association_entry(
  'starter-skin',
  'Skin signals, whole-body areas worth reviewing',
  'chek_hlc',
  'Skin signals are observed alongside digestion, bowel regularity, liver and detox findings, hormonal health, immune findings, food-related responses, stress, sleep and hydration in this coaching methodology. These areas may be relevant and are worth reviewing together.',
  '[["body_area","skin"],["category","skin_immune"]]'::jsonb,
  '[["category","digestion"],["category","clearance_detox"],["category","hormonal"],["category","immune"],["category","stress"],["category","sleep"],["category","nutrition"]]'::jsonb,
  array[
    'Ask when the skin signal began and whether anything changed in diet, products or stress around then.',
    'Ask whether it tracks with her cycle.',
    'Ask whether it changes after particular foods.',
    'Review her bowel regularity and digestion responses.',
    'Review her Liver and Detox and Hormonal Health responses.',
    'Consider medical referral if the skin signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

-- 9. DIGESTION.
select pg_temp.seed_association_entry(
  'starter-digestion',
  'Digestive signals, whole-body areas worth reviewing',
  'chek_hlc',
  'Digestive signals are observed alongside liver and detox findings, the stress response, breathing, eating speed and meal timing, bowel habits, sleep, blood sugar and energy, and hormonal findings. These areas may be relevant and are worth reviewing together.',
  '[["category","digestion"],["body_area","abdomen"]]'::jsonb,
  '[["category","clearance_detox"],["category","stress"],["category","respiratory"],["category","nutrition"],["category","sleep"],["category","metabolic"],["category","hormonal"],["category","skin_immune"]]'::jsonb,
  array[
    'Ask when the digestive signal began and whether it follows particular meals.',
    'Ask how quickly she eats and whether she eats while working or moving.',
    'Ask whether it changes with stress.',
    'Review her bowel habits and meal timing.',
    'Review breathing findings, since breathing mechanics and digestion share the diaphragm.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

-- 10. SUGAR CRAVINGS AND ENERGY CRASHES.
select pg_temp.seed_association_entry(
  'starter-blood-sugar-energy',
  'Sugar craving and energy-crash signals, whole-body areas worth reviewing',
  'lifestyle',
  'Craving and energy-instability signals are observed alongside blood sugar and energy findings, meal timing and macronutrient balance, sleep, stress and adrenal findings, digestion, caffeine use, hydration and hormonal findings. These areas may be relevant and are worth reviewing together.',
  '[["signal","sugar-cravings"],["signal","afternoon-caffeine-or-sugar"],["signal","energy-rises-and-crashes"],["signal","shaky-when-meals-delayed"],["signal","cyclical-sugar-or-carb-cravings"]]'::jsonb,
  '[["category","metabolic"],["category","nutrition"],["category","sleep"],["category","stress"],["category","digestion"],["category","hormonal"],["category","energy"]]'::jsonb,
  array[
    'Ask what she eats at breakfast and how long she goes between meals.',
    'Ask what time the craving or the crash arrives.',
    'Ask how she slept the night before a day with strong cravings.',
    'Review protein, fat and carbohydrate balance across her day.',
    'Review caffeine timing and quantity.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

-- 11. SLEEP.
select pg_temp.seed_association_entry(
  'starter-sleep',
  'Sleep signals, whole-body areas worth reviewing',
  'lifestyle',
  'Sleep signals are observed alongside the stress response, breathing, pain load, blood sugar and energy, hormonal health, digestion, caffeine timing, nighttime urination, mood and movement load. These areas may be relevant and are worth reviewing together.',
  '[["category","sleep"]]'::jsonb,
  '[["category","stress"],["category","respiratory"],["category","pain_discomfort"],["category","metabolic"],["category","hormonal"],["category","digestion"],["category","kidney_bladder"],["category","mood"],["category","energy"],["category","nutrition"]]'::jsonb,
  array[
    'Ask whether the difficulty is falling asleep, staying asleep, or waking unrefreshed, since these point different ways.',
    'Ask what time she wakes and whether it is consistent.',
    'Ask whether she gets up to use the bathroom in the night.',
    'Review caffeine timing and her last meal of the day.',
    'Review current pain load, which changes sleep quality.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

-- 12. STRESS AND OVERLOAD.
select pg_temp.seed_association_entry(
  'starter-stress',
  'Stress and overload signals, whole-body areas worth reviewing',
  'lifestyle',
  'Stress signals are observed alongside breathing, sleep, digestion, energy, pain, headaches, muscle tension, mood, blood sugar patterns, hormonal findings and recovery load. These areas may be relevant and are worth reviewing together.',
  '[["category","stress"]]'::jsonb,
  '[["category","respiratory"],["category","sleep"],["category","digestion"],["category","energy"],["category","pain_discomfort"],["category","musculoskeletal"],["category","mood"],["category","metabolic"],["category","hormonal"],["category","neurological"]]'::jsonb,
  array[
    'Ask what specifically has been demanding recently, and for how long.',
    'Ask what her recovery looks like on an ordinary week.',
    'Review her breathing findings, which change quickly under load.',
    'Review sleep and digestion alongside this rather than separately.',
    'Consider whether current training load is adding to the total rather than helping it.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

-- 13. MOOD AND IRRITABILITY.
select pg_temp.seed_association_entry(
  'starter-mood',
  'Mood and irritability signals, whole-body areas worth reviewing',
  'lifestyle',
  'Mood signals are observed alongside sleep, the stress response, blood sugar and energy, hormonal health, digestion, pain burden, movement and meal regularity. These areas may be relevant and are worth reviewing together. Nothing here is a psychiatric assessment.',
  '[["category","mood"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","metabolic"],["category","hormonal"],["category","digestion"],["category","pain_discomfort"],["category","energy"],["category","respiratory"],["category","nutrition"]]'::jsonb,
  array[
    'Ask when the change began and whether it follows any pattern through the week or the month.',
    'Ask how she has been sleeping over the same period.',
    'Ask whether meals have been regular.',
    'Review current pain load, which carries a real mood cost.',
    'Do not treat these findings as a mental health assessment. Refer where that is what is needed.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

-- 14. HORMONAL AND REPRODUCTIVE.
select pg_temp.seed_association_entry(
  'starter-hormonal',
  'Hormonal and cycle signals, whole-body areas worth reviewing',
  'chek_hlc',
  'Hormonal and cycle signals are observed alongside the stress response, sleep, digestion, blood sugar and energy, liver and detox findings, pelvic and low-back signals, training load and nutrition patterns. These areas may be relevant and are worth reviewing together.',
  '[["category","hormonal"]]'::jsonb,
  '[["category","stress"],["category","sleep"],["category","digestion"],["category","metabolic"],["category","clearance_detox"],["body_area","pelvis"],["body_area","low_back"],["category","nutrition"],["category","mood"],["category","energy"]]'::jsonb,
  array[
    'Ask what has changed about her cycle specifically, and over how many cycles.',
    'Ask whether energy, mood or sleep shift at a particular point in the month.',
    'Review training load and whether it changed before the cycle did.',
    'Review her nutrition patterns and whether she is eating enough for her load.',
    'Review Liver and Detox and Stress Response responses alongside this.',
    'Consider medical referral for cycle changes that are persistent, unusual, or outside coaching scope.'
  ]
);

-- 15. URINARY AND BLADDER.
select pg_temp.seed_association_entry(
  'starter-urinary',
  'Urinary and bladder signals, whole-body areas worth reviewing',
  'chek_hlc',
  'Urinary signals are observed alongside kidney and bladder findings, pelvic findings, low-back and hip signals, hydration, caffeine, sleep, stress and relevant hormonal findings. These areas may be relevant and are worth reviewing together.',
  '[["category","kidney_bladder"]]'::jsonb,
  '[["body_area","pelvis"],["body_area","low_back"],["body_area","hip"],["category","sleep"],["category","stress"],["category","hormonal"],["category","nutrition"]]'::jsonb,
  array[
    'Ask how much she drinks and when, and how much of it is caffeinated.',
    'Ask whether she wakes at night to use the bathroom, and how often.',
    'Review pelvic floor findings where they are available.',
    'Review low-back and hip signals alongside this.',
    'Consider medical referral for urinary signals that are persistent, painful, unusual, or outside coaching scope.'
  ]
);

-- 16. BREATHING.
select pg_temp.seed_association_entry(
  'starter-breathing',
  'Breathing signals, whole-body areas worth reviewing',
  'biomechanics',
  'Breathing signals are observed alongside the breathing assessment, stress, posture, ribcage mechanics, neck and shoulder findings, sleep, energy, pain and nervous-system load. These areas may be relevant and are worth reviewing together.',
  '[["category","respiratory"]]'::jsonb,
  '[["category","stress"],["category","posture_alignment"],["body_area","chest"],["body_area","neck"],["body_area","shoulder"],["category","sleep"],["category","energy"],["category","pain_discomfort"],["category","neurological"]]'::jsonb,
  array[
    'Ask when she notices it most, and whether it arrives at rest or with effort.',
    'Ask whether it changes with stress.',
    'Review her Breathing Pattern Check-In findings directly.',
    'Review ribcage and thoracic posture findings.',
    'Breathing signals can fall into a safety category. Follow the existing red-flag process first where they do.',
    'Consider medical referral for breathlessness that is new, persistent, worsening, or outside coaching scope.'
  ]
);

-- 17. FATIGUE AND LOW ENERGY.
select pg_temp.seed_association_entry(
  'starter-fatigue',
  'Fatigue and low-energy signals, whole-body areas worth reviewing',
  'lifestyle',
  'Fatigue signals are observed alongside blood sugar and energy findings, sleep, the stress response, thyroid and metabolism findings, digestion, hormonal health, food intake patterns, hydration and recovery. These areas may be relevant and are worth reviewing together.',
  '[["category","energy"]]'::jsonb,
  '[["category","metabolic"],["category","sleep"],["category","stress"],["category","digestion"],["category","hormonal"],["category","nutrition"],["category","immune"],["category","circulation"],["category","mood"]]'::jsonb,
  array[
    'Ask whether she wakes tired or fades through the day, since these point different ways.',
    'Ask what she eats before the part of the day that is hardest.',
    'Review her Thyroid and Metabolism and Blood Sugar and Energy responses.',
    'Review sleep quantity against sleep quality.',
    'Review training load against recovery.',
    'Consider medical referral for fatigue that is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

-- 18. MUSCULOSKELETAL COMPLAINTS GENERALLY.
--
-- THE WIDE ONE. It exists so that a musculoskeletal signal at a place the
-- seventeen entries above do not name still sends Root to look beyond the
-- painful location, which is the whole-body coaching approach rather than
-- treating every joint signal as an isolated orthopedic problem.
select pg_temp.seed_association_entry(
  'starter-musculoskeletal-general',
  'Any musculoskeletal signal, whole-body areas worth reviewing',
  'mef_internal',
  'A musculoskeletal signal is reviewed alongside the local structure, the joints above and below, posture, movement patterns, breathing, stress and recovery, sleep, nutrition and digestion, and hormonal or energy findings where relevant. Reviewing only the painful location is what this entry exists to prevent.',
  '[["category","musculoskeletal"],["category","joint_movement"],["category","pain_discomfort"]]'::jsonb,
  '[["category","posture_alignment"],["category","respiratory"],["category","stress"],["category","sleep"],["category","nutrition"],["category","digestion"],["category","hormonal"],["category","energy"],["category","circulation"]]'::jsonb,
  array[
    'Ask when it began, what changed around then, and whether it has happened before.',
    'Review the joints above and below the one she named, not only the painful one.',
    'Review posture and movement findings from her assessment.',
    'Review breathing and stress, which change how load is carried.',
    'Review sleep and recovery over the same period.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

drop function pg_temp.seed_association_entry(text, text, text, text, jsonb, jsonb, text[]);
