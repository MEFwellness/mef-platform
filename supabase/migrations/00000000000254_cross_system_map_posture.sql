-- THE WHOLE-BODY ASSOCIATION MAP, PART 3 OF 4: POSTURE PATTERNS.
--
-- The five patterns the brief names (upper cross, lower cross, forward
-- head, flat back, sway back) and the rest of the posture and movement
-- vocabulary the assessment already records, each linked to the complaint
-- areas reviewed alongside it.
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
  'map-posture-forward-head-posture',
  'Forward head posture, complaint areas worth reviewing',
  'biomechanics',
  'Forward head posture and Neck, Jaw, Upper back, Shoulder, Head, Breathing/Respiratory, Stress, Sleep and Neurological are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","forward-head-posture"]]'::jsonb,
  '[["body_area","neck"],["body_area","jaw"],["body_area","upper_back"],["body_area","shoulder"],["body_area","head"],["category","respiratory"],["category","stress"],["category","sleep"],["category","neurological"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-brain",40]]'::jsonb,
  array[
    'Ask what she does for most hours of the day, and in what position.',
    'Ask whether she has noticed this herself, and whether anybody else has mentioned it.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Jaw alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-posture-upper-crossed-pattern',
  'Upper-crossed postural pattern, complaint areas worth reviewing',
  'biomechanics',
  'Upper-crossed postural pattern is observed alongside Neck, Upper back, Shoulder, Chest, Ribs, Breathing/Respiratory, Musculoskeletal, Stress and Circulation in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","upper-crossed-pattern"]]'::jsonb,
  '[["body_area","neck"],["body_area","upper_back"],["body_area","shoulder"],["body_area","chest"],["body_area","ribs"],["category","respiratory"],["category","musculoskeletal"],["category","stress"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask what she does for most hours of the day, and in what position.',
    'Ask whether she has noticed this herself, and whether anybody else has mentioned it.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Review Shoulder alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-posture-lower-crossed-pattern',
  'Lower-crossed postural pattern, complaint areas worth reviewing',
  'biomechanics',
  'Lower-crossed postural pattern is often observed alongside Low back, Pelvis, Hip, Glutes, Abdomen, Musculoskeletal, Digestion, Breathing/Respiratory and Kidney/Bladder. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","lower-crossed-pattern"]]'::jsonb,
  '[["body_area","low_back"],["body_area","pelvis"],["body_area","hip"],["body_area","glute"],["body_area","abdomen"],["category","musculoskeletal"],["category","digestion"],["category","respiratory"],["category","kidney_bladder"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-digestion",40]]'::jsonb,
  array[
    'Ask what she does for most hours of the day, and in what position.',
    'Ask whether she has noticed this herself, and whether anybody else has mentioned it.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Pelvis alongside this, and note what is already on her timeline there.',
    'Review Hip alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-posture-flat-back-pattern',
  'Flat-back postural pattern, complaint areas worth reviewing',
  'biomechanics',
  'Where flat-back postural pattern is reported, this coaching framework treats Low back, Pelvis, Hamstrings, Glutes, Mid back, Musculoskeletal, Breathing/Respiratory, Joint/Movement and Posture/Alignment as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","flat-back-pattern"]]'::jsonb,
  '[["body_area","low_back"],["body_area","pelvis"],["body_area","hamstring"],["body_area","glute"],["body_area","mid_back"],["category","musculoskeletal"],["category","respiratory"],["category","joint_movement"],["category","posture_alignment"]]'::jsonb,
  '[["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask what she does for most hours of the day, and in what position.',
    'Ask whether she has noticed this herself, and whether anybody else has mentioned it.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Pelvis alongside this, and note what is already on her timeline there.',
    'Review Hamstrings alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-posture-sway-back-pattern',
  'Sway-back postural pattern, complaint areas worth reviewing',
  'biomechanics',
  'Sway-back postural pattern and Low back, Pelvis, Hip, Abdomen, Knee, Musculoskeletal, Breathing/Respiratory, Digestion and Joint/Movement are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","sway-back-pattern"]]'::jsonb,
  '[["body_area","low_back"],["body_area","pelvis"],["body_area","hip"],["body_area","abdomen"],["body_area","knee"],["category","musculoskeletal"],["category","respiratory"],["category","digestion"],["category","joint_movement"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-digestion",40]]'::jsonb,
  array[
    'Ask what she does for most hours of the day, and in what position.',
    'Ask whether she has noticed this herself, and whether anybody else has mentioned it.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Pelvis alongside this, and note what is already on her timeline there.',
    'Review Hip alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-posture-rounded-shoulders',
  'Rounded shoulders, complaint areas worth reviewing',
  'biomechanics',
  'Rounded shoulders is observed alongside Shoulder, Upper back, Neck, Chest, Breathing/Respiratory, Posture/Alignment, Stress and Circulation in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","rounded-shoulders"]]'::jsonb,
  '[["body_area","shoulder"],["body_area","upper_back"],["body_area","neck"],["body_area","chest"],["category","respiratory"],["category","posture_alignment"],["category","stress"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-heart",40]]'::jsonb,
  array[
    'Ask what she does for most hours of the day, and in what position.',
    'Ask whether she has noticed this herself, and whether anybody else has mentioned it.',
    'Review Shoulder alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-posture-elevated-shoulder',
  'Elevated shoulder, complaint areas worth reviewing',
  'biomechanics',
  'Elevated shoulder is often observed alongside Shoulder, Neck, Upper back, Ribs, Musculoskeletal, Breathing/Respiratory, Stress and Posture/Alignment. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","elevated-shoulder"]]'::jsonb,
  '[["body_area","shoulder"],["body_area","neck"],["body_area","upper_back"],["body_area","ribs"],["category","musculoskeletal"],["category","respiratory"],["category","stress"],["category","posture_alignment"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask what she does for most hours of the day, and in what position.',
    'Ask whether she has noticed this herself, and whether anybody else has mentioned it.',
    'Review Shoulder alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-posture-increased-upper-back-curve',
  'Increased upper back curve, complaint areas worth reviewing',
  'biomechanics',
  'Where increased upper back curve is reported, this coaching framework treats Upper back, Mid back, Neck, Ribs, Chest, Breathing/Respiratory, Digestion, Posture/Alignment and Musculoskeletal as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","increased-upper-back-curve"]]'::jsonb,
  '[["body_area","upper_back"],["body_area","mid_back"],["body_area","neck"],["body_area","ribs"],["body_area","chest"],["category","respiratory"],["category","digestion"],["category","posture_alignment"],["category","musculoskeletal"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask what she does for most hours of the day, and in what position.',
    'Ask whether she has noticed this herself, and whether anybody else has mentioned it.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Review Mid back alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-posture-lumbar-posture-outside-neutral',
  'Lumbar posture outside neutral, complaint areas worth reviewing',
  'biomechanics',
  'Lumbar posture outside neutral and Low back, Pelvis, Hip, Abdomen, Musculoskeletal, Kidney/Bladder, Digestion and Breathing/Respiratory are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","lumbar-posture-outside-neutral"]]'::jsonb,
  '[["body_area","low_back"],["body_area","pelvis"],["body_area","hip"],["body_area","abdomen"],["category","musculoskeletal"],["category","kidney_bladder"],["category","digestion"],["category","respiratory"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-kidney",40]]'::jsonb,
  array[
    'Ask what she does for most hours of the day, and in what position.',
    'Ask whether she has noticed this herself, and whether anybody else has mentioned it.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Pelvis alongside this, and note what is already on her timeline there.',
    'Review Hip alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-posture-pelvic-tilt',
  'Pelvic tilt, complaint areas worth reviewing',
  'biomechanics',
  'Pelvic tilt is observed alongside Pelvis, Low back, Hip, Sacroiliac joint, Abdomen, Musculoskeletal, Kidney/Bladder, Hormonal and Digestion in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","pelvic-tilt"]]'::jsonb,
  '[["body_area","pelvis"],["body_area","low_back"],["body_area","hip"],["body_area","si_joint"],["body_area","abdomen"],["category","musculoskeletal"],["category","kidney_bladder"],["category","hormonal"],["category","digestion"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-kidney",40]]'::jsonb,
  array[
    'Ask what she does for most hours of the day, and in what position.',
    'Ask whether she has noticed this herself, and whether anybody else has mentioned it.',
    'Review Pelvis alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Hip alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-posture-pelvic-drop',
  'Pelvic drop, complaint areas worth reviewing',
  'biomechanics',
  'Pelvic drop is often observed alongside Pelvis, Hip, Sacroiliac joint, Knee, Low back, Musculoskeletal, Joint/Movement and Posture/Alignment. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","pelvic-drop"]]'::jsonb,
  '[["body_area","pelvis"],["body_area","hip"],["body_area","si_joint"],["body_area","knee"],["body_area","low_back"],["category","musculoskeletal"],["category","joint_movement"],["category","posture_alignment"]]'::jsonb,
  '[["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask what she does for most hours of the day, and in what position.',
    'Ask whether she has noticed this herself, and whether anybody else has mentioned it.',
    'Review Pelvis alongside this, and note what is already on her timeline there.',
    'Review Hip alongside this, and note what is already on her timeline there.',
    'Review Sacroiliac joint alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-posture-uneven-hips',
  'Uneven hips, complaint areas worth reviewing',
  'biomechanics',
  'Where uneven hips is reported, this coaching framework treats Hip, Pelvis, Sacroiliac joint, Low back, Knee, Musculoskeletal, Joint/Movement and Posture/Alignment as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","uneven-hips"]]'::jsonb,
  '[["body_area","hip"],["body_area","pelvis"],["body_area","si_joint"],["body_area","low_back"],["body_area","knee"],["category","musculoskeletal"],["category","joint_movement"],["category","posture_alignment"]]'::jsonb,
  '[["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask what she does for most hours of the day, and in what position.',
    'Ask whether she has noticed this herself, and whether anybody else has mentioned it.',
    'Review Hip alongside this, and note what is already on her timeline there.',
    'Review Pelvis alongside this, and note what is already on her timeline there.',
    'Review Sacroiliac joint alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-posture-lateral-trunk-asymmetry',
  'Lateral trunk asymmetry, complaint areas worth reviewing',
  'biomechanics',
  'Lateral trunk asymmetry and Mid back, Ribs, Low back, Shoulder, Pelvis, Breathing/Respiratory, Musculoskeletal and Digestion are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","lateral-trunk-asymmetry"]]'::jsonb,
  '[["body_area","mid_back"],["body_area","ribs"],["body_area","low_back"],["body_area","shoulder"],["body_area","pelvis"],["category","respiratory"],["category","musculoskeletal"],["category","digestion"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-digestion",40]]'::jsonb,
  array[
    'Ask what she does for most hours of the day, and in what position.',
    'Ask whether she has noticed this herself, and whether anybody else has mentioned it.',
    'Review Mid back alongside this, and note what is already on her timeline there.',
    'Review Ribs alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-posture-sagittal-trunk-posture',
  'Sagittal trunk posture, complaint areas worth reviewing',
  'biomechanics',
  'Sagittal trunk posture is observed alongside Mid back, Low back, Upper back, Pelvis, Breathing/Respiratory, Musculoskeletal and Posture/Alignment in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","sagittal-trunk-posture"]]'::jsonb,
  '[["body_area","mid_back"],["body_area","low_back"],["body_area","upper_back"],["body_area","pelvis"],["category","respiratory"],["category","musculoskeletal"],["category","posture_alignment"]]'::jsonb,
  '[["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask what she does for most hours of the day, and in what position.',
    'Ask whether she has noticed this herself, and whether anybody else has mentioned it.',
    'Review Mid back alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-posture-inward-knee-drift',
  'Inward knee drift, complaint areas worth reviewing',
  'biomechanics',
  'Inward knee drift is often observed alongside Knee, Hip, Foot, Ankle, Glutes, Musculoskeletal, Joint/Movement and Posture/Alignment. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","inward-knee-drift"]]'::jsonb,
  '[["body_area","knee"],["body_area","hip"],["body_area","foot"],["body_area","ankle"],["body_area","glute"],["category","musculoskeletal"],["category","joint_movement"],["category","posture_alignment"]]'::jsonb,
  '[["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask what she does for most hours of the day, and in what position.',
    'Ask whether she has noticed this herself, and whether anybody else has mentioned it.',
    'Review Knee alongside this, and note what is already on her timeline there.',
    'Review Hip alongside this, and note what is already on her timeline there.',
    'Review Foot alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-posture-foot-turnout',
  'Foot turnout, complaint areas worth reviewing',
  'biomechanics',
  'Where foot turnout is reported, this coaching framework treats Foot, Ankle, Knee, Hip, Calf, Musculoskeletal, Joint/Movement and Posture/Alignment as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","foot-turnout"]]'::jsonb,
  '[["body_area","foot"],["body_area","ankle"],["body_area","knee"],["body_area","hip"],["body_area","calf"],["category","musculoskeletal"],["category","joint_movement"],["category","posture_alignment"]]'::jsonb,
  '[["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask what she does for most hours of the day, and in what position.',
    'Ask whether she has noticed this herself, and whether anybody else has mentioned it.',
    'Review Foot alongside this, and note what is already on her timeline there.',
    'Review Ankle alongside this, and note what is already on her timeline there.',
    'Review Knee alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-posture-weight-shift-to-one-side',
  'Weight shift to one side, complaint areas worth reviewing',
  'biomechanics',
  'Weight shift to one side and Hip, Pelvis, Knee, Ankle, Low back, Musculoskeletal, Joint/Movement and Posture/Alignment are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","weight-shift-to-one-side"]]'::jsonb,
  '[["body_area","hip"],["body_area","pelvis"],["body_area","knee"],["body_area","ankle"],["body_area","low_back"],["category","musculoskeletal"],["category","joint_movement"],["category","posture_alignment"]]'::jsonb,
  '[["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask what she does for most hours of the day, and in what position.',
    'Ask whether she has noticed this herself, and whether anybody else has mentioned it.',
    'Review Hip alongside this, and note what is already on her timeline there.',
    'Review Pelvis alongside this, and note what is already on her timeline there.',
    'Review Knee alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-posture-rib-flare',
  'Rib flare, complaint areas worth reviewing',
  'biomechanics',
  'Rib flare is observed alongside Ribs, Mid back, Abdomen, Chest, Breathing/Respiratory, Posture/Alignment, Musculoskeletal and Digestion in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","rib-flare"]]'::jsonb,
  '[["body_area","ribs"],["body_area","mid_back"],["body_area","abdomen"],["body_area","chest"],["category","respiratory"],["category","posture_alignment"],["category","musculoskeletal"],["category","digestion"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-digestion",40]]'::jsonb,
  array[
    'Ask what she does for most hours of the day, and in what position.',
    'Ask whether she has noticed this herself, and whether anybody else has mentioned it.',
    'Review Ribs alongside this, and note what is already on her timeline there.',
    'Review Mid back alongside this, and note what is already on her timeline there.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-posture-observed-breathing-mechanics',
  'Observed breathing mechanics, complaint areas worth reviewing',
  'biomechanics',
  'Observed breathing mechanics is often observed alongside Chest, Ribs, Neck, Upper back, Breathing/Respiratory, Stress, Posture/Alignment and Sleep. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","observed-breathing-mechanics"]]'::jsonb,
  '[["body_area","chest"],["body_area","ribs"],["body_area","neck"],["body_area","upper_back"],["category","respiratory"],["category","stress"],["category","posture_alignment"],["category","sleep"]]'::jsonb,
  '[["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask what she does for most hours of the day, and in what position.',
    'Ask whether she has noticed this herself, and whether anybody else has mentioned it.',
    'Review Chest alongside this, and note what is already on her timeline there.',
    'Review Ribs alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-posture-head-carried-forward-at-work',
  'Head carried forward at a desk, complaint areas worth reviewing',
  'biomechanics',
  'Where head carried forward at a desk is reported, this coaching framework treats Neck, Upper back, Shoulder, Eyes, Head, Posture/Alignment, Stress and Breathing/Respiratory as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","head-carried-forward-at-work"]]'::jsonb,
  '[["body_area","neck"],["body_area","upper_back"],["body_area","shoulder"],["body_area","eyes"],["body_area","head"],["category","posture_alignment"],["category","stress"],["category","respiratory"]]'::jsonb,
  '[["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask what she does for most hours of the day, and in what position.',
    'Ask whether she has noticed this herself, and whether anybody else has mentioned it.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Review Shoulder alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

drop function pg_temp.seed_map_entry(text, text, text, text, jsonb, jsonb, jsonb, text[]);
