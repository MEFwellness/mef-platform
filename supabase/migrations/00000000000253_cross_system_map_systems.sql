-- THE WHOLE-BODY ASSOCIATION MAP, PART 2 OF 4: THE SYSTEMS, READ BOTH
-- WAYS.
--
-- THE LINKS ARE BIDIRECTIONAL, and that is what this file is for. The
-- first set of entries is keyed on a system and sends Root to the body
-- areas and other systems this coaching framework reviews alongside it.
-- The second set is the return journey: a finding in a system, and the
-- body areas worth reviewing because of it. A coach can read either
-- direction in the library rather than having to infer one from the
-- other, and the engine needs no special case for either, because a
-- component names a vocabulary and a key and does not care which.
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
-- SQL and holds them to zero banned phrases and zero em dashes, which no
-- source guard could do on its own.
--
-- THE BASIS IS STATED, NEVER IMPLIED. Every row carries a
-- source_type_key, because a CHEK / HLC methodology association, a
-- conventional referred pain relationship and a loading relationship do
-- not have the same evidence basis and must not be presented as though
-- they do.
--
-- SHE STILL OWNS IT. Every row below is an ordinary relationship: the
-- editor opens it, an edit writes version 2 the normal way, and
-- deactivating one takes it out of Root's lookups immediately. is_seeded
-- only records where the first version came from.
--
-- THIS IS AUTHORED CONTENT, NOT A GENERATOR. Nothing in the running app
-- writes a relationship, infers one or suggests one. Migration 243's rule
-- holds exactly as migration 248 restated it: Root at runtime uses only
-- what is in these tables.


-- THE SEEDING HELPER, the same shape migration 248 used and extended by
-- one argument. It is created in pg_temp and dropped at the foot of this
-- file, so it is a build time tool and never an API.
--
-- NOTHING BELOW IS HARD CODED TO A PAIRING. It takes lists of
-- (vocabulary, key) pairs and resolves their labels from the Signal
-- Library, so the same call that seeds a knee entry seeds a thyroid one,
-- and a key that does not exist raises and FAILS THE MIGRATION rather than
-- shipping a component labelled with its own slug.
--
-- A RE-RUN NEVER OVERWRITES HER WORK. An entry whose pattern_key is
-- already there is left exactly as it is, because a coach may have edited
-- it since and an edit is a version she wrote.
create or replace function pg_temp.seed_map_entry(
  p_key            text,
  p_name           text,
  p_source_type    text,
  p_association    text,
  p_primaries      jsonb,
  p_related        jsonb,
  p_support        jsonb,
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
  v_min  numeric;
  v_i    integer;
  v_role text;
  v_list jsonb;
begin
  insert into cross_system_relationships (pattern_key, is_active, is_example, is_seeded, current_version)
  values (p_key, true, false, true, 1)
  on conflict (pattern_key) do nothing
  returning id into v_rel;

  if v_rel is null then
    return;
  end if;

  insert into cross_system_relationship_versions (
    relationship_id, version_number, pattern_name, min_supporting_signals,
    possible_association_text, evidence_notes, change_summary,
    source_type_key, surfaces_on_complaint
  ) values (
    v_rel, 1, p_name, 1, p_association, null, null, p_source_type,
    /* Read by the complaint driven lookup, which needs no floor: an area
       worth reviewing is worth reviewing even when nothing supports it
       yet. The floor based matcher from Prompt 3 skips these, so one entry
       never produces two different cards about one set of her rows. */
    true
  ) returning id into v_ver;

  foreach v_role in array array['primary', 'related', 'support'] loop
    v_list := case v_role
      when 'primary' then p_primaries
      when 'related' then p_related
      else p_support
    end;
    for v_item in select * from jsonb_array_elements(coalesce(v_list, '[]'::jsonb)) loop
      v_kind := v_item ->> 0;
      v_key  := v_item ->> 1;
      v_min  := case when jsonb_array_length(v_item) > 2 then (v_item ->> 2)::numeric else null end;
      v_label := case v_kind
        when 'category'  then (select display_name from cross_system_signal_categories where category_key = v_key)
        when 'body_area' then (select display_name from cross_system_body_areas where area_key = v_key)
        when 'signal'    then (select display_name from cross_system_signal_names where signal_slug = v_key)
      end;
      if v_label is null then
        raise exception 'seed_map_entry: % names a % key "%" that does not exist', p_key, v_kind, v_key;
      end if;
      insert into cross_system_relationship_components
        (version_id, position, role, ref_kind, ref_key, ref_label, min_value_numeric)
      values (v_ver, v_pos, v_role, v_kind, v_key, v_label, v_min);
      v_pos := v_pos + 1;
    end loop;
  end loop;

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


select pg_temp.seed_map_entry(
  'map-system-posture-alignment',
  'Posture/Alignment findings, body areas and systems worth reviewing',
  'biomechanics',
  'Posture/Alignment findings and Neck, Upper back, Low back, Pelvis, Hip, Knee, Foot, Musculoskeletal, Breathing/Respiratory and Joint/Movement are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["category","posture_alignment"]]'::jsonb,
  '[["body_area","neck"],["body_area","upper_back"],["body_area","low_back"],["body_area","pelvis"],["body_area","hip"],["body_area","knee"],["body_area","foot"],["category","musculoskeletal"],["category","respiratory"],["category","joint_movement"]]'::jsonb,
  '[["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask what she does for most hours of the day, and in what position.',
    'Ask whether anything in her setup at work or at home changed recently.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-system-immune',
  'Immune findings, body areas and systems worth reviewing',
  'chek_hlc',
  'Immune findings is observed alongside Digestion, Sleep, Stress, Nutrition/Fuel, Clearance/Detox, Skin/Immune, Energy, Throat and Skin in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["category","immune"]]'::jsonb,
  '[["category","digestion"],["category","sleep"],["category","stress"],["category","nutrition"],["category","clearance_detox"],["category","skin_immune"],["category","energy"],["body_area","throat"],["body_area","skin"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask how often she has picked something up in the last six months, and how long it took to clear.',
    'Ask about sleep, food and training load over the same window.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-system-nutrition',
  'Nutrition/Fuel findings, body areas and systems worth reviewing',
  'lifestyle',
  'Nutrition/Fuel findings is often observed alongside Digestion, Metabolic, Energy, Mood, Sleep, Hormonal, Musculoskeletal and Abdomen. This is a possible association worth exploring, not an established medical finding.',
  '[["category","nutrition"]]'::jsonb,
  '[["category","digestion"],["category","metabolic"],["category","energy"],["category","mood"],["category","sleep"],["category","hormonal"],["category","musculoskeletal"],["body_area","abdomen"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask what a normal day of eating looks like, in her own words.',
    'Ask about meal timing, protein and how long she goes between meals.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Review Energy alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-system-clearance-detox',
  'Clearance/Detox findings, body areas and systems worth reviewing',
  'chek_hlc',
  'Where clearance/Detox findings is reported, this coaching framework treats Digestion, Kidney/Bladder, Skin/Immune, Hormonal, Sleep, Nutrition/Fuel, Skin, Abdomen and Mid back as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["category","clearance_detox"]]'::jsonb,
  '[["category","digestion"],["category","kidney_bladder"],["category","skin_immune"],["category","hormonal"],["category","sleep"],["category","nutrition"],["body_area","skin"],["body_area","abdomen"],["body_area","mid_back"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-kidney",40]]'::jsonb,
  array[
    'Ask about bowel rhythm, fluid intake and sweating.',
    'Ask about alcohol, medication changes and anything new in the household or at work.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Review Kidney/Bladder alongside this, and note what is already on her timeline there.',
    'Review Skin/Immune alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-system-metabolic',
  'Metabolic findings, body areas and systems worth reviewing',
  'chek_hlc',
  'Metabolic findings and Nutrition/Fuel, Digestion, Energy, Sleep, Stress, Hormonal, Circulation and Mood are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["category","metabolic"]]'::jsonb,
  '[["category","nutrition"],["category","digestion"],["category","energy"],["category","sleep"],["category","stress"],["category","hormonal"],["category","circulation"],["category","mood"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask how her energy runs across a day, from waking to evening.',
    'Ask about meal spacing, caffeine and what she reaches for when energy dips.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Review Energy alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-system-circulation',
  'Circulation findings, body areas and systems worth reviewing',
  'chek_hlc',
  'Circulation findings is observed alongside Leg, Ankle, Hand, Foot, Chest, Breathing/Respiratory, Kidney/Bladder, Metabolic, Musculoskeletal and Nutrition/Fuel in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["category","circulation"]]'::jsonb,
  '[["body_area","leg"],["body_area","ankle"],["body_area","hand"],["body_area","foot"],["body_area","chest"],["category","respiratory"],["category","kidney_bladder"],["category","metabolic"],["category","musculoskeletal"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-kidney",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask whether it is worse at the end of the day or after sitting or standing for a long time.',
    'Ask whether one side is affected or both.',
    'Review Leg alongside this, and note what is already on her timeline there.',
    'Review Ankle alongside this, and note what is already on her timeline there.',
    'Review Hand alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-system-neurological',
  'Neurological findings, body areas and systems worth reviewing',
  'chek_hlc',
  'Neurological findings is often observed alongside Head, Neck, Hand, Foot, Sleep, Stress, Metabolic, Circulation, Posture/Alignment and Nutrition/Fuel. This is a possible association worth exploring, not an established medical finding.',
  '[["category","neurological"]]'::jsonb,
  '[["body_area","head"],["body_area","neck"],["body_area","hand"],["body_area","foot"],["category","sleep"],["category","stress"],["category","metabolic"],["category","circulation"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask exactly what the sensation is, in her own words, and where it starts.',
    'Ask whether it comes and goes with position, with load or with time of day.',
    'Review Head alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Hand alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-reverse-kidney-bladder',
  'Kidney/Bladder findings, body areas worth reviewing in return',
  'chek_hlc',
  'Where a kidney/bladder finding is reported, this coaching framework treats Low back, Pelvis, Hip, Sacroiliac joint, Groin, Ankle, Hormonal, Sleep and Nutrition/Fuel as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["category","kidney_bladder"]]'::jsonb,
  '[["body_area","low_back"],["body_area","pelvis"],["body_area","hip"],["body_area","si_joint"],["body_area","groin"],["body_area","ankle"],["category","hormonal"],["category","sleep"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-hormonal",40]]'::jsonb,
  array[
    'Ask about fluid intake across the day and in the evening.',
    'Ask whether anything wakes her at night, and how many times.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Pelvis alongside this, and note what is already on her timeline there.',
    'Review Hip alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-reverse-digestion',
  'Digestion findings, body areas worth reviewing in return',
  'chek_hlc',
  'A digestion finding and Abdomen, Mid back, Low back, Ribs, Skin, Stress, Breathing/Respiratory, Nutrition/Fuel and Sleep are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["category","digestion"]]'::jsonb,
  '[["body_area","abdomen"],["body_area","mid_back"],["body_area","low_back"],["body_area","ribs"],["body_area","skin"],["category","stress"],["category","respiratory"],["category","nutrition"],["category","sleep"]]'::jsonb,
  '[["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask what she notices after meals, and how soon after.',
    'Ask about bowel rhythm over a normal week.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Mid back alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-reverse-hormonal',
  'Hormonal findings, body areas worth reviewing in return',
  'chek_hlc',
  'A hormonal finding is observed alongside Pelvis, Low back, Abdomen, Hip, Skin, Head, Sleep, Mood and Metabolic in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["category","hormonal"]]'::jsonb,
  '[["body_area","pelvis"],["body_area","low_back"],["body_area","abdomen"],["body_area","hip"],["body_area","skin"],["body_area","head"],["category","sleep"],["category","mood"],["category","metabolic"]]'::jsonb,
  '[["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask where she is in her cycle, or what stage of transition she is in.',
    'Ask whether anything follows a monthly rhythm.',
    'Review Pelvis alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-reverse-stress',
  'Stress findings, body areas worth reviewing in return',
  'chek_hlc',
  'A stress finding is often observed alongside Neck, Jaw, Upper back, Shoulder, Chest, Abdomen, Breathing/Respiratory, Sleep and Digestion. This is a possible association worth exploring, not an established medical finding.',
  '[["category","stress"]]'::jsonb,
  '[["body_area","neck"],["body_area","jaw"],["body_area","upper_back"],["body_area","shoulder"],["body_area","chest"],["body_area","abdomen"],["category","respiratory"],["category","sleep"],["category","digestion"]]'::jsonb,
  '[["signal","bss-system-digestion",40]]'::jsonb,
  array[
    'Ask what the last two weeks have actually been like, in her own words.',
    'Ask where she feels it in her body first.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Jaw alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-reverse-sleep',
  'Sleep findings, body areas worth reviewing in return',
  'lifestyle',
  'Where a sleep finding is reported, this coaching framework treats Neck, Jaw, Low back, Leg, Stress, Hormonal, Metabolic, Kidney/Bladder and Breathing/Respiratory as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["category","sleep"]]'::jsonb,
  '[["body_area","neck"],["body_area","jaw"],["body_area","low_back"],["body_area","leg"],["category","stress"],["category","hormonal"],["category","metabolic"],["category","kidney_bladder"],["category","respiratory"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-hormonal",40]]'::jsonb,
  array[
    'Ask about the hour before bed, and about screens, food and alcohol in it.',
    'Ask what time she goes to bed and what time she is actually asleep.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Jaw alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-reverse-respiratory',
  'Breathing/Respiratory findings, body areas worth reviewing in return',
  'chek_hlc',
  'A breathing/respiratory finding and Chest, Ribs, Neck, Upper back, Throat, Posture/Alignment, Stress, Musculoskeletal and Sleep are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["category","respiratory"]]'::jsonb,
  '[["body_area","chest"],["body_area","ribs"],["body_area","neck"],["body_area","upper_back"],["body_area","throat"],["category","posture_alignment"],["category","stress"],["category","musculoskeletal"],["category","sleep"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask whether she breathes through her nose or her mouth at rest.',
    'Ask where she feels the breath move, and whether a full breath is comfortable.',
    'Review Chest alongside this, and note what is already on her timeline there.',
    'Review Ribs alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-reverse-skin-immune',
  'Skin/Immune findings, body areas worth reviewing in return',
  'chek_hlc',
  'A skin/immune finding is observed alongside Skin, Abdomen, Head, Digestion, Clearance/Detox, Hormonal, Immune, Stress and Nutrition/Fuel in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["category","skin_immune"]]'::jsonb,
  '[["body_area","skin"],["body_area","abdomen"],["body_area","head"],["category","digestion"],["category","clearance_detox"],["category","hormonal"],["category","immune"],["category","stress"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-liver",40]]'::jsonb,
  array[
    'Ask where on the body it shows up and whether it moves.',
    'Ask whether it follows food, stress, the cycle or the seasons.',
    'Review Skin alongside this, and note what is already on her timeline there.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Head alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-reverse-energy',
  'Energy findings, body areas worth reviewing in return',
  'lifestyle',
  'A energy finding is often observed alongside Whole body, Head, Sleep, Metabolic, Nutrition/Fuel, Stress, Immune, Mood and Circulation. This is a possible association worth exploring, not an established medical finding.',
  '[["category","energy"]]'::jsonb,
  '[["body_area","whole_body"],["body_area","head"],["category","sleep"],["category","metabolic"],["category","nutrition"],["category","stress"],["category","immune"],["category","mood"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-blood-sugar",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask what her energy does hour by hour on a normal day.',
    'Ask what she is doing differently on the days that feel better.',
    'Review Whole body alongside this, and note what is already on her timeline there.',
    'Review Head alongside this, and note what is already on her timeline there.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-reverse-mood',
  'Mood findings, body areas worth reviewing in return',
  'lifestyle',
  'Where a mood finding is reported, this coaching framework treats Head, Chest, Abdomen, Sleep, Stress, Nutrition/Fuel, Metabolic, Hormonal and Energy as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["category","mood"]]'::jsonb,
  '[["body_area","head"],["body_area","chest"],["body_area","abdomen"],["category","sleep"],["category","stress"],["category","nutrition"],["category","metabolic"],["category","hormonal"],["category","energy"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask how long it has been like this, and whether anything shifted around then.',
    'Ask what is already helping, even a little.',
    'Review Head alongside this, and note what is already on her timeline there.',
    'Review Chest alongside this, and note what is already on her timeline there.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-reverse-musculoskeletal',
  'Musculoskeletal findings, body areas worth reviewing in return',
  'biomechanics',
  'A musculoskeletal finding and Neck, Shoulder, Low back, Hip, Knee, Posture/Alignment, Breathing/Respiratory, Stress, Nutrition/Fuel and Sleep are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["category","musculoskeletal"]]'::jsonb,
  '[["body_area","neck"],["body_area","shoulder"],["body_area","low_back"],["body_area","hip"],["body_area","knee"],["category","posture_alignment"],["category","respiratory"],["category","stress"],["category","nutrition"],["category","sleep"]]'::jsonb,
  '[["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask whether this is one place or several, and whether it moves.',
    'Ask what changed in training, work or sleep around the time it started.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Shoulder alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-reverse-metabolic',
  'Metabolic findings, body areas worth reviewing in return',
  'chek_hlc',
  'A metabolic finding is observed alongside Abdomen, Head, Whole body, Nutrition/Fuel, Digestion, Energy, Sleep, Stress and Hormonal in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["category","metabolic"]]'::jsonb,
  '[["body_area","abdomen"],["body_area","head"],["body_area","whole_body"],["category","nutrition"],["category","digestion"],["category","energy"],["category","sleep"],["category","stress"],["category","hormonal"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask how long she goes between meals, and what happens when one is late.',
    'Ask what she reaches for when her energy dips, and at what time of day.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Head alongside this, and note what is already on her timeline there.',
    'Review Whole body alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-reverse-joint-movement',
  'Joint/Movement findings, body areas worth reviewing in return',
  'biomechanics',
  'A joint/movement finding is often observed alongside Hip, Knee, Shoulder, Ankle, Neck, Posture/Alignment, Musculoskeletal, Nutrition/Fuel and Metabolic. This is a possible association worth exploring, not an established medical finding.',
  '[["category","joint_movement"]]'::jsonb,
  '[["body_area","hip"],["body_area","knee"],["body_area","shoulder"],["body_area","ankle"],["body_area","neck"],["category","posture_alignment"],["category","musculoskeletal"],["category","nutrition"],["category","metabolic"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask whether the joint is noisy, stiff, unstable or painful, in her own words.',
    'Ask whether it is worse cold, worse warm, or the same either way.',
    'Review Hip alongside this, and note what is already on her timeline there.',
    'Review Knee alongside this, and note what is already on her timeline there.',
    'Review Shoulder alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-reverse-pain-discomfort',
  'Pain/Discomfort findings, body areas worth reviewing in return',
  'chek_hlc',
  'Where a pain/discomfort finding is reported, this coaching framework treats Whole body, Low back, Neck, Head, Sleep, Stress, Musculoskeletal, Posture/Alignment and Nutrition/Fuel as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["category","pain_discomfort"]]'::jsonb,
  '[["body_area","whole_body"],["body_area","low_back"],["body_area","neck"],["body_area","head"],["category","sleep"],["category","stress"],["category","musculoskeletal"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask her to describe the sensation in her own words rather than to rate it.',
    'Ask what makes it better and what makes it worse.',
    'Review Whole body alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

drop function pg_temp.seed_map_entry(text, text, text, text, jsonb, jsonb, jsonb, text[]);
