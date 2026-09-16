-- THE WHOLE-BODY ASSOCIATION MAP, PART 4 OF 4: ONE ENTRY PER SIGNAL.
--
-- WHY EVERY SIGNAL AND NOT A SELECTION. A member does not report the
-- category a library files a thing under, she reports the thing. The
-- entry that has to exist is the one named after what she said, and the
-- gaps in a map with gaps in it are invisible until a coach is not told
-- something. The instrument level rollups are excluded, because a
-- section percentage is not a complaint, and so are the seven signals
-- the starter entries already key on.
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
  'map-signal-acid-reflux-or-burping',
  'Acid reflux or burping, whole-body areas worth reviewing',
  'chek_hlc',
  'Acid reflux or burping and Throat, Neck, Chest, Nutrition/Fuel, Clearance/Detox, Stress, Sleep, Skin/Immune, Hormonal and Breathing/Respiratory are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","acid-reflux-or-burping"]]'::jsonb,
  '[["body_area","throat"],["body_area","neck"],["body_area","chest"],["category","nutrition"],["category","clearance_detox"],["category","stress"],["category","sleep"],["category","skin_immune"],["category","hormonal"],["category","respiratory"]]'::jsonb,
  '[["signal","bss-system-liver",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when acid reflux or burping began, how often it happens now, and what she has already tried.',
    'Ask what she notices after meals, how soon after, and whether any food reliably makes a difference.',
    'Review Throat alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Chest alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-ankle-or-foot-swelling',
  'Ankle or foot swelling, whole-body areas worth reviewing',
  'chek_hlc',
  'Ankle or foot swelling is observed alongside Ankle, Foot, Knee, Calf, Breathing/Respiratory, Kidney/Bladder, Metabolic, Nutrition/Fuel and Musculoskeletal in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","ankle-or-foot-swelling"]]'::jsonb,
  '[["body_area","ankle"],["body_area","foot"],["body_area","knee"],["body_area","calf"],["category","respiratory"],["category","kidney_bladder"],["category","metabolic"],["category","nutrition"],["category","musculoskeletal"]]'::jsonb,
  '[["signal","bss-system-kidney",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when ankle or foot swelling began, how often it happens now, and what she has already tried.',
    'Ask whether one side is involved or both, and whether it changes with position.',
    'Review Ankle alongside this, and note what is already on her timeline there.',
    'Review Foot alongside this, and note what is already on her timeline there.',
    'Review Knee alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-bloated-stomach',
  'Bloated stomach, whole-body areas worth reviewing',
  'chek_hlc',
  'Bloated stomach is often observed alongside Abdomen, Low back, Mid back, Pelvis, Ribs, Nutrition/Fuel, Clearance/Detox, Stress, Sleep and Skin/Immune. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","bloated-stomach"]]'::jsonb,
  '[["body_area","abdomen"],["body_area","low_back"],["body_area","mid_back"],["body_area","pelvis"],["body_area","ribs"],["category","nutrition"],["category","clearance_detox"],["category","stress"],["category","sleep"],["category","skin_immune"]]'::jsonb,
  '[["signal","bss-system-liver",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when bloated stomach began, how often it happens now, and what she has already tried.',
    'Ask what she notices after meals, how soon after, and whether any food reliably makes a difference.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Mid back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-bloating-after-eating',
  'Bloating after eating, whole-body areas worth reviewing',
  'chek_hlc',
  'Where bloating after eating is reported, this coaching framework treats Abdomen, Low back, Mid back, Pelvis, Ribs, Nutrition/Fuel, Clearance/Detox, Stress, Sleep and Skin/Immune as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","bloating-after-eating"]]'::jsonb,
  '[["body_area","abdomen"],["body_area","low_back"],["body_area","mid_back"],["body_area","pelvis"],["body_area","ribs"],["category","nutrition"],["category","clearance_detox"],["category","stress"],["category","sleep"],["category","skin_immune"]]'::jsonb,
  '[["signal","bss-system-liver",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when bloating after eating began, how often it happens now, and what she has already tried.',
    'Ask what she notices after meals, how soon after, and whether any food reliably makes a difference.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Mid back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-blurred-vision',
  'Blurred vision, whole-body areas worth reviewing',
  'referred_pain',
  'Blurred vision and Eyes, Head, Neck, Sleep, Stress, Metabolic, Circulation, Posture/Alignment and Nutrition/Fuel are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","blurred-vision"]]'::jsonb,
  '[["body_area","eyes"],["body_area","head"],["body_area","neck"],["category","sleep"],["category","stress"],["category","metabolic"],["category","circulation"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when blurred vision began, how often it happens now, and what she has already tried.',
    'Ask exactly what the sensation is in her own words, where it starts and whether it travels.',
    'Review Eyes alongside this, and note what is already on her timeline there.',
    'Review Head alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-brain-fog',
  'Brain fog, whole-body areas worth reviewing',
  'referred_pain',
  'Brain fog is observed alongside Sleep, Stress, Metabolic, Circulation, Posture/Alignment and Nutrition/Fuel in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","brain-fog"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","metabolic"],["category","circulation"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when brain fog began, how often it happens now, and what she has already tried.',
    'Ask exactly what the sensation is in her own words, where it starts and whether it travels.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-breathless-on-stairs',
  'Breathless after one flight of stairs, whole-body areas worth reviewing',
  'chek_hlc',
  'Breathless after one flight of stairs is often observed alongside Stress, Posture/Alignment, Sleep, Musculoskeletal and Circulation. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","breathless-on-stairs"]]'::jsonb,
  '[["category","stress"],["category","posture_alignment"],["category","sleep"],["category","musculoskeletal"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask when breathless after one flight of stairs began, how often it happens now, and what she has already tried.',
    'Ask whether she breathes through her nose at rest, and where she feels the breath move.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-bruising-easily',
  'Bruising easily, whole-body areas worth reviewing',
  'chek_hlc',
  'Where bruising easily is reported, this coaching framework treats Skin, Abdomen, Breathing/Respiratory, Kidney/Bladder, Metabolic, Nutrition/Fuel and Musculoskeletal as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","bruising-easily"]]'::jsonb,
  '[["body_area","skin"],["body_area","abdomen"],["category","respiratory"],["category","kidney_bladder"],["category","metabolic"],["category","nutrition"],["category","musculoskeletal"]]'::jsonb,
  '[["signal","bss-system-kidney",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when bruising easily began, how often it happens now, and what she has already tried.',
    'Ask whether one side is involved or both, and whether it changes with position.',
    'Review Skin alongside this, and note what is already on her timeline there.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Breathing/Respiratory alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-burning-on-urination',
  'Burning on urination, whole-body areas worth reviewing',
  'chek_hlc',
  'Burning on urination and Hormonal, Sleep, Nutrition/Fuel, Stress and Circulation are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","burning-on-urination"]]'::jsonb,
  '[["category","hormonal"],["category","sleep"],["category","nutrition"],["category","stress"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-hormonal",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when burning on urination began, how often it happens now, and what she has already tried.',
    'Ask about fluid across the day, and about caffeine and alcohol in particular.',
    'Review Hormonal alongside this, and note what is already on her timeline there.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-burning-sensation',
  'Burning sensation, whole-body areas worth reviewing',
  'chek_hlc',
  'Burning sensation is observed alongside Sleep, Stress, Musculoskeletal, Posture/Alignment and Nutrition/Fuel in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","burning-sensation"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","musculoskeletal"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask when burning sensation began, how often it happens now, and what she has already tried.',
    'Ask her to describe the sensation in her own words, and what makes it better or worse.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Musculoskeletal alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-chest-pain',
  'Chest pain, whole-body areas worth reviewing',
  'chek_hlc',
  'Chest pain is often observed alongside Chest, Ribs, Upper back, Neck, Shoulder, Sleep, Stress, Musculoskeletal, Posture/Alignment and Nutrition/Fuel. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","chest-pain"]]'::jsonb,
  '[["body_area","chest"],["body_area","ribs"],["body_area","upper_back"],["body_area","neck"],["body_area","shoulder"],["category","sleep"],["category","stress"],["category","musculoskeletal"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask when chest pain began, how often it happens now, and what she has already tried.',
    'Ask her to describe the sensation in her own words, and what makes it better or worse.',
    'Review Chest alongside this, and note what is already on her timeline there.',
    'Review Ribs alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-chest-tightness',
  'Chest tightness, whole-body areas worth reviewing',
  'chek_hlc',
  'Where chest tightness is reported, this coaching framework treats Chest, Ribs, Upper back, Neck, Shoulder, Stress, Posture/Alignment, Sleep, Musculoskeletal and Circulation as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","chest-tightness"]]'::jsonb,
  '[["body_area","chest"],["body_area","ribs"],["body_area","upper_back"],["body_area","neck"],["body_area","shoulder"],["category","stress"],["category","posture_alignment"],["category","sleep"],["category","musculoskeletal"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask when chest tightness began, how often it happens now, and what she has already tried.',
    'Ask whether she breathes through her nose at rest, and where she feels the breath move.',
    'Review Chest alongside this, and note what is already on her timeline there.',
    'Review Ribs alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-cold-hands-or-feet',
  'Cold hands or feet, whole-body areas worth reviewing',
  'chek_hlc',
  'Cold hands or feet and Hand, Wrist, Elbow, Neck, Breathing/Respiratory, Kidney/Bladder, Metabolic, Nutrition/Fuel and Musculoskeletal are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","cold-hands-or-feet"]]'::jsonb,
  '[["body_area","hand"],["body_area","wrist"],["body_area","elbow"],["body_area","neck"],["category","respiratory"],["category","kidney_bladder"],["category","metabolic"],["category","nutrition"],["category","musculoskeletal"]]'::jsonb,
  '[["signal","bss-system-kidney",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when cold hands or feet began, how often it happens now, and what she has already tried.',
    'Ask whether one side is involved or both, and whether it changes with position.',
    'Review Hand alongside this, and note what is already on her timeline there.',
    'Review Wrist alongside this, and note what is already on her timeline there.',
    'Review Elbow alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-cold-sores-or-mouth-ulcers',
  'Cold sores or mouth ulcers, whole-body areas worth reviewing',
  'chek_hlc',
  'Cold sores or mouth ulcers is observed alongside Digestion, Sleep, Stress, Nutrition/Fuel, Clearance/Detox and Energy in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","cold-sores-or-mouth-ulcers"]]'::jsonb,
  '[["category","digestion"],["category","sleep"],["category","stress"],["category","nutrition"],["category","clearance_detox"],["category","energy"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when cold sores or mouth ulcers began, how often it happens now, and what she has already tried.',
    'Ask how often this has happened in the last six months and how long each episode ran.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-congestion-without-illness',
  'Congestion without being sick, whole-body areas worth reviewing',
  'chek_hlc',
  'Congestion without being sick is often observed alongside Throat, Neck, Chest, Digestion, Sleep, Stress, Nutrition/Fuel, Clearance/Detox and Energy. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","congestion-without-illness"]]'::jsonb,
  '[["body_area","throat"],["body_area","neck"],["body_area","chest"],["category","digestion"],["category","sleep"],["category","stress"],["category","nutrition"],["category","clearance_detox"],["category","energy"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when congestion without being sick began, how often it happens now, and what she has already tried.',
    'Ask how often this has happened in the last six months and how long each episode ran.',
    'Review Throat alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Chest alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-constipation',
  'Constipation, whole-body areas worth reviewing',
  'chek_hlc',
  'Where constipation is reported, this coaching framework treats Abdomen, Low back, Mid back, Pelvis, Ribs, Nutrition/Fuel, Clearance/Detox, Stress, Sleep and Skin/Immune as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","constipation"]]'::jsonb,
  '[["body_area","abdomen"],["body_area","low_back"],["body_area","mid_back"],["body_area","pelvis"],["body_area","ribs"],["category","nutrition"],["category","clearance_detox"],["category","stress"],["category","sleep"],["category","skin_immune"]]'::jsonb,
  '[["signal","bss-system-liver",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when constipation began, how often it happens now, and what she has already tried.',
    'Ask what she notices after meals, how soon after, and whether any food reliably makes a difference.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Mid back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-cyclical-bloating-or-swelling',
  'Cyclical bloating or swelling, whole-body areas worth reviewing',
  'chek_hlc',
  'Cyclical bloating or swelling and Sleep, Stress, Metabolic, Digestion, Mood and Clearance/Detox are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","cyclical-bloating-or-swelling"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","metabolic"],["category","digestion"],["category","mood"],["category","clearance_detox"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when cyclical bloating or swelling began, how often it happens now, and what she has already tried.',
    'Ask whether it follows a monthly rhythm, and where she is in her cycle or transition.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-dark-circles-under-eyes',
  'Dark circles under the eyes, whole-body areas worth reviewing',
  'chek_hlc',
  'Dark circles under the eyes is observed alongside Eyes, Head, Neck, Digestion, Kidney/Bladder, Skin/Immune, Hormonal, Nutrition/Fuel and Sleep in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","dark-circles-under-eyes"]]'::jsonb,
  '[["body_area","eyes"],["body_area","head"],["body_area","neck"],["category","digestion"],["category","kidney_bladder"],["category","skin_immune"],["category","hormonal"],["category","nutrition"],["category","sleep"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-kidney",40]]'::jsonb,
  array[
    'Ask when dark circles under the eyes began, how often it happens now, and what she has already tried.',
    'Ask about bowel rhythm, sweating and fluid, which is how this framework reads clearance.',
    'Review Eyes alongside this, and note what is already on her timeline there.',
    'Review Head alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-dark-or-strong-smelling-urine',
  'Dark or strong smelling urine, whole-body areas worth reviewing',
  'chek_hlc',
  'Dark or strong smelling urine is often observed alongside Hormonal, Sleep, Nutrition/Fuel, Stress and Circulation. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","dark-or-strong-smelling-urine"]]'::jsonb,
  '[["category","hormonal"],["category","sleep"],["category","nutrition"],["category","stress"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-hormonal",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when dark or strong smelling urine began, how often it happens now, and what she has already tried.',
    'Ask about fluid across the day, and about caffeine and alcohol in particular.',
    'Review Hormonal alongside this, and note what is already on her timeline there.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-difficulty-switching-off',
  'Difficulty switching off, whole-body areas worth reviewing',
  'chek_hlc',
  'Where difficulty switching off is reported, this coaching framework treats Sleep, Breathing/Respiratory, Digestion, Energy, Mood and Musculoskeletal as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","difficulty-switching-off"]]'::jsonb,
  '[["category","sleep"],["category","respiratory"],["category","digestion"],["category","energy"],["category","mood"],["category","musculoskeletal"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask when difficulty switching off began, how often it happens now, and what she has already tried.',
    'Ask what the last two weeks have actually been like, and where she feels it first.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Breathing/Respiratory alongside this, and note what is already on her timeline there.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-dizziness',
  'Dizziness, whole-body areas worth reviewing',
  'referred_pain',
  'Dizziness and Head, Neck, Jaw, Eyes, Sleep, Stress, Metabolic, Circulation, Posture/Alignment and Nutrition/Fuel are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","dizziness"]]'::jsonb,
  '[["body_area","head"],["body_area","neck"],["body_area","jaw"],["body_area","eyes"],["category","sleep"],["category","stress"],["category","metabolic"],["category","circulation"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when dizziness began, how often it happens now, and what she has already tried.',
    'Ask exactly what the sensation is in her own words, where it starts and whether it travels.',
    'Review Head alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Jaw alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-dizziness-on-standing',
  'Dizziness on standing, whole-body areas worth reviewing',
  'referred_pain',
  'Dizziness on standing is observed alongside Head, Neck, Jaw, Eyes, Sleep, Stress, Metabolic, Circulation, Posture/Alignment and Nutrition/Fuel in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","dizziness-on-standing"]]'::jsonb,
  '[["body_area","head"],["body_area","neck"],["body_area","jaw"],["body_area","eyes"],["category","sleep"],["category","stress"],["category","metabolic"],["category","circulation"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when dizziness on standing began, how often it happens now, and what she has already tried.',
    'Ask exactly what the sensation is in her own words, where it starts and whether it travels.',
    'Review Head alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Jaw alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-drinking-little-water',
  'Drinking little water, whole-body areas worth reviewing',
  'chek_hlc',
  'Drinking little water is often observed alongside Hormonal, Sleep, Nutrition/Fuel, Stress and Circulation. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","drinking-little-water"]]'::jsonb,
  '[["category","hormonal"],["category","sleep"],["category","nutrition"],["category","stress"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-hormonal",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when drinking little water began, how often it happens now, and what she has already tried.',
    'Ask about fluid across the day, and about caffeine and alcohol in particular.',
    'Review Hormonal alongside this, and note what is already on her timeline there.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-dry-mouth',
  'Dry mouth, whole-body areas worth reviewing',
  'chek_hlc',
  'Where dry mouth is reported, this coaching framework treats Throat, Neck, Chest, Hormonal, Sleep, Nutrition/Fuel, Stress and Circulation as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","dry-mouth"]]'::jsonb,
  '[["body_area","throat"],["body_area","neck"],["body_area","chest"],["category","hormonal"],["category","sleep"],["category","nutrition"],["category","stress"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-hormonal",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when dry mouth began, how often it happens now, and what she has already tried.',
    'Ask about fluid across the day, and about caffeine and alcohol in particular.',
    'Review Throat alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Chest alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-dry-skin',
  'Dry skin, whole-body areas worth reviewing',
  'chek_hlc',
  'Dry skin and Skin, Abdomen, Digestion, Clearance/Detox, Hormonal, Immune, Stress and Nutrition/Fuel are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","dry-skin"]]'::jsonb,
  '[["body_area","skin"],["body_area","abdomen"],["category","digestion"],["category","clearance_detox"],["category","hormonal"],["category","immune"],["category","stress"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-liver",40]]'::jsonb,
  array[
    'Ask when dry skin began, how often it happens now, and what she has already tried.',
    'Ask where it appears, whether it moves, and whether it follows food, stress or the cycle.',
    'Review Skin alongside this, and note what is already on her timeline there.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-end-of-day-fluid-retention',
  'Rings, shoes or clothes tighter by evening, whole-body areas worth reviewing',
  'chek_hlc',
  'Rings, shoes or clothes tighter by evening is observed alongside Hormonal, Sleep, Nutrition/Fuel, Stress and Circulation in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","end-of-day-fluid-retention"]]'::jsonb,
  '[["category","hormonal"],["category","sleep"],["category","nutrition"],["category","stress"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-hormonal",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when rings, shoes or clothes tighter by evening began, how often it happens now, and what she has already tried.',
    'Ask about fluid across the day, and about caffeine and alcohol in particular.',
    'Review Hormonal alongside this, and note what is already on her timeline there.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-energy-dip-mid-afternoon',
  'Energy dip in the afternoon, whole-body areas worth reviewing',
  'lifestyle',
  'Energy dip in the afternoon is often observed alongside Sleep, Metabolic, Nutrition/Fuel, Stress, Immune and Circulation. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","energy-dip-mid-afternoon"]]'::jsonb,
  '[["category","sleep"],["category","metabolic"],["category","nutrition"],["category","stress"],["category","immune"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-blood-sugar",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when energy dip in the afternoon began, how often it happens now, and what she has already tried.',
    'Ask what her energy does hour by hour, and what is different on the better days.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-everyday-tasks-feel-heavier',
  'Everyday tasks feeling heavier, whole-body areas worth reviewing',
  'lifestyle',
  'Where everyday tasks feeling heavier is reported, this coaching framework treats Sleep, Metabolic, Nutrition/Fuel, Stress, Immune and Circulation as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","everyday-tasks-feel-heavier"]]'::jsonb,
  '[["category","sleep"],["category","metabolic"],["category","nutrition"],["category","stress"],["category","immune"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-blood-sugar",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when everyday tasks feeling heavier began, how often it happens now, and what she has already tried.',
    'Ask what her energy does hour by hour, and what is different on the better days.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-excessive-gas',
  'Excessive gas, whole-body areas worth reviewing',
  'chek_hlc',
  'Excessive gas and Abdomen, Low back, Mid back, Pelvis, Ribs, Nutrition/Fuel, Clearance/Detox, Stress, Sleep and Skin/Immune are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","excessive-gas"]]'::jsonb,
  '[["body_area","abdomen"],["body_area","low_back"],["body_area","mid_back"],["body_area","pelvis"],["body_area","ribs"],["category","nutrition"],["category","clearance_detox"],["category","stress"],["category","sleep"],["category","skin_immune"]]'::jsonb,
  '[["signal","bss-system-liver",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when excessive gas began, how often it happens now, and what she has already tried.',
    'Ask what she notices after meals, how soon after, and whether any food reliably makes a difference.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Mid back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-excessive-sweating',
  'Sweating more than usual, whole-body areas worth reviewing',
  'chek_hlc',
  'Sweating more than usual is observed alongside Skin, Abdomen, Digestion, Kidney/Bladder, Skin/Immune, Hormonal, Nutrition/Fuel and Sleep in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","excessive-sweating"]]'::jsonb,
  '[["body_area","skin"],["body_area","abdomen"],["category","digestion"],["category","kidney_bladder"],["category","skin_immune"],["category","hormonal"],["category","nutrition"],["category","sleep"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-kidney",40]]'::jsonb,
  array[
    'Ask when sweating more than usual began, how often it happens now, and what she has already tried.',
    'Ask about bowel rhythm, sweating and fluid, which is how this framework reads clearance.',
    'Review Skin alongside this, and note what is already on her timeline there.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-faster-or-deeper-breathing',
  'Faster or deeper breathing, whole-body areas worth reviewing',
  'chek_hlc',
  'Faster or deeper breathing is often observed alongside Chest, Ribs, Upper back, Neck, Shoulder, Stress, Posture/Alignment, Sleep, Musculoskeletal and Circulation. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","faster-or-deeper-breathing"]]'::jsonb,
  '[["body_area","chest"],["body_area","ribs"],["body_area","upper_back"],["body_area","neck"],["body_area","shoulder"],["category","stress"],["category","posture_alignment"],["category","sleep"],["category","musculoskeletal"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask when faster or deeper breathing began, how often it happens now, and what she has already tried.',
    'Ask whether she breathes through her nose at rest, and where she feels the breath move.',
    'Review Chest alongside this, and note what is already on her timeline there.',
    'Review Ribs alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-feeling-anxious-or-on-edge',
  'Feeling anxious or on edge, whole-body areas worth reviewing',
  'lifestyle',
  'Where feeling anxious or on edge is reported, this coaching framework treats Sleep, Stress, Nutrition/Fuel, Metabolic, Hormonal and Energy as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","feeling-anxious-or-on-edge"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","nutrition"],["category","metabolic"],["category","hormonal"],["category","energy"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when feeling anxious or on edge began, how often it happens now, and what she has already tried.',
    'Ask how long it has been like this, and what is already helping even a little.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-feeling-cold-when-others-are-not',
  'Feeling cold when others are comfortable, whole-body areas worth reviewing',
  'chek_hlc',
  'Feeling cold when others are comfortable and Nutrition/Fuel, Digestion, Energy, Sleep, Stress and Hormonal are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","feeling-cold-when-others-are-not"]]'::jsonb,
  '[["category","nutrition"],["category","digestion"],["category","energy"],["category","sleep"],["category","stress"],["category","hormonal"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when feeling cold when others are comfortable began, how often it happens now, and what she has already tried.',
    'Ask how long she goes between meals, and what happens when a meal is late.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Review Energy alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-feeling-confused',
  'Feeling confused, whole-body areas worth reviewing',
  'referred_pain',
  'Feeling confused is observed alongside Sleep, Stress, Metabolic, Circulation, Posture/Alignment and Nutrition/Fuel in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","feeling-confused"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","metabolic"],["category","circulation"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when feeling confused began, how often it happens now, and what she has already tried.',
    'Ask exactly what the sensation is in her own words, where it starts and whether it travels.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-feeling-down-or-flat',
  'Feeling down or flat, whole-body areas worth reviewing',
  'lifestyle',
  'Feeling down or flat is often observed alongside Sleep, Stress, Nutrition/Fuel, Metabolic, Hormonal and Energy. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","feeling-down-or-flat"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","nutrition"],["category","metabolic"],["category","hormonal"],["category","energy"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when feeling down or flat began, how often it happens now, and what she has already tried.',
    'Ask how long it has been like this, and what is already helping even a little.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-feeling-sluggish-or-slowed-down',
  'Feeling sluggish or slowed down, whole-body areas worth reviewing',
  'lifestyle',
  'Where feeling sluggish or slowed down is reported, this coaching framework treats Sleep, Metabolic, Nutrition/Fuel, Stress, Immune and Circulation as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","feeling-sluggish-or-slowed-down"]]'::jsonb,
  '[["category","sleep"],["category","metabolic"],["category","nutrition"],["category","stress"],["category","immune"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-blood-sugar",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when feeling sluggish or slowed down began, how often it happens now, and what she has already tried.',
    'Ask what her energy does hour by hour, and what is different on the better days.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-feeling-tense',
  'Feeling tense, whole-body areas worth reviewing',
  'chek_hlc',
  'Feeling tense and Sleep, Breathing/Respiratory, Digestion, Energy, Mood and Musculoskeletal are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","feeling-tense"]]'::jsonb,
  '[["category","sleep"],["category","respiratory"],["category","digestion"],["category","energy"],["category","mood"],["category","musculoskeletal"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask when feeling tense began, how often it happens now, and what she has already tried.',
    'Ask what the last two weeks have actually been like, and where she feels it first.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Breathing/Respiratory alongside this, and note what is already on her timeline there.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-flatter-or-more-irritable-mood',
  'Flatter or more irritable mood, whole-body areas worth reviewing',
  'lifestyle',
  'Flatter or more irritable mood is observed alongside Sleep, Stress, Nutrition/Fuel, Metabolic, Hormonal and Energy in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","flatter-or-more-irritable-mood"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","nutrition"],["category","metabolic"],["category","hormonal"],["category","energy"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when flatter or more irritable mood began, how often it happens now, and what she has already tried.',
    'Ask how long it has been like this, and what is already helping even a little.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-food-triggered-reactions',
  'Food triggered congestion, itching or swelling, whole-body areas worth reviewing',
  'chek_hlc',
  'Food triggered congestion, itching or swelling is often observed alongside Digestion, Clearance/Detox, Hormonal, Immune, Stress and Nutrition/Fuel. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","food-triggered-reactions"]]'::jsonb,
  '[["category","digestion"],["category","clearance_detox"],["category","hormonal"],["category","immune"],["category","stress"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-liver",40]]'::jsonb,
  array[
    'Ask when food triggered congestion, itching or swelling began, how often it happens now, and what she has already tried.',
    'Ask where it appears, whether it moves, and whether it follows food, stress or the cycle.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Review Clearance/Detox alongside this, and note what is already on her timeline there.',
    'Review Hormonal alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-forgetfulness',
  'Forgetfulness, whole-body areas worth reviewing',
  'referred_pain',
  'Where forgetfulness is reported, this coaching framework treats Sleep, Stress, Metabolic, Circulation, Posture/Alignment and Nutrition/Fuel as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","forgetfulness"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","metabolic"],["category","circulation"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when forgetfulness began, how often it happens now, and what she has already tried.',
    'Ask exactly what the sensation is in her own words, where it starts and whether it travels.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-frequent-colds-or-infections',
  'Frequent colds or infections, whole-body areas worth reviewing',
  'chek_hlc',
  'Frequent colds or infections and Digestion, Sleep, Stress, Nutrition/Fuel, Clearance/Detox and Energy are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","frequent-colds-or-infections"]]'::jsonb,
  '[["category","digestion"],["category","sleep"],["category","stress"],["category","nutrition"],["category","clearance_detox"],["category","energy"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when frequent colds or infections began, how often it happens now, and what she has already tried.',
    'Ask how often this has happened in the last six months and how long each episode ran.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-frequent-urination',
  'Frequent urination, whole-body areas worth reviewing',
  'chek_hlc',
  'Frequent urination is observed alongside Hormonal, Sleep, Nutrition/Fuel, Stress and Circulation in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","frequent-urination"]]'::jsonb,
  '[["category","hormonal"],["category","sleep"],["category","nutrition"],["category","stress"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-hormonal",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when frequent urination began, how often it happens now, and what she has already tried.',
    'Ask about fluid across the day, and about caffeine and alcohol in particular.',
    'Review Hormonal alongside this, and note what is already on her timeline there.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-fullness-long-after-meals',
  'Fullness long after meals, whole-body areas worth reviewing',
  'chek_hlc',
  'Fullness long after meals is often observed alongside Abdomen, Low back, Mid back, Pelvis, Ribs, Nutrition/Fuel, Clearance/Detox, Stress, Sleep and Skin/Immune. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","fullness-long-after-meals"]]'::jsonb,
  '[["body_area","abdomen"],["body_area","low_back"],["body_area","mid_back"],["body_area","pelvis"],["body_area","ribs"],["category","nutrition"],["category","clearance_detox"],["category","stress"],["category","sleep"],["category","skin_immune"]]'::jsonb,
  '[["signal","bss-system-liver",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when fullness long after meals began, how often it happens now, and what she has already tried.',
    'Ask what she notices after meals, how soon after, and whether any food reliably makes a difference.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Mid back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-groggy-on-waking',
  'Groggy on waking, whole-body areas worth reviewing',
  'lifestyle',
  'Where groggy on waking is reported, this coaching framework treats Sleep, Metabolic, Nutrition/Fuel, Stress, Immune and Circulation as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","groggy-on-waking"]]'::jsonb,
  '[["category","sleep"],["category","metabolic"],["category","nutrition"],["category","stress"],["category","immune"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-blood-sugar",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when groggy on waking began, how often it happens now, and what she has already tried.',
    'Ask what her energy does hour by hour, and what is different on the better days.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-hair-thinning-or-shedding',
  'Hair thinning or shedding, whole-body areas worth reviewing',
  'chek_hlc',
  'Hair thinning or shedding and Sleep, Stress, Metabolic, Digestion, Mood and Clearance/Detox are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","hair-thinning-or-shedding"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","metabolic"],["category","digestion"],["category","mood"],["category","clearance_detox"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when hair thinning or shedding began, how often it happens now, and what she has already tried.',
    'Ask whether it follows a monthly rhythm, and where she is in her cycle or transition.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-hands-or-feet-falling-asleep',
  'Hands or feet falling asleep, whole-body areas worth reviewing',
  'referred_pain',
  'Hands or feet falling asleep is observed alongside Hand, Wrist, Elbow, Neck, Sleep, Stress, Metabolic, Circulation, Posture/Alignment and Nutrition/Fuel in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","hands-or-feet-falling-asleep"]]'::jsonb,
  '[["body_area","hand"],["body_area","wrist"],["body_area","elbow"],["body_area","neck"],["category","sleep"],["category","stress"],["category","metabolic"],["category","circulation"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when hands or feet falling asleep began, how often it happens now, and what she has already tried.',
    'Ask exactly what the sensation is in her own words, where it starts and whether it travels.',
    'Review Hand alongside this, and note what is already on her timeline there.',
    'Review Wrist alongside this, and note what is already on her timeline there.',
    'Review Elbow alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-heart-racing-or-palpitations',
  'Heart racing or palpitations, whole-body areas worth reviewing',
  'chek_hlc',
  'Heart racing or palpitations is often observed alongside Chest, Ribs, Upper back, Neck, Shoulder, Breathing/Respiratory, Kidney/Bladder, Metabolic, Nutrition/Fuel and Musculoskeletal. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","heart-racing-or-palpitations"]]'::jsonb,
  '[["body_area","chest"],["body_area","ribs"],["body_area","upper_back"],["body_area","neck"],["body_area","shoulder"],["category","respiratory"],["category","kidney_bladder"],["category","metabolic"],["category","nutrition"],["category","musculoskeletal"]]'::jsonb,
  '[["signal","bss-system-kidney",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when heart racing or palpitations began, how often it happens now, and what she has already tried.',
    'Ask whether one side is involved or both, and whether it changes with position.',
    'Review Chest alongside this, and note what is already on her timeline there.',
    'Review Ribs alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-heart-racing-under-stress',
  'Heart racing under stress, whole-body areas worth reviewing',
  'chek_hlc',
  'Where heart racing under stress is reported, this coaching framework treats Chest, Ribs, Upper back, Neck, Shoulder, Breathing/Respiratory, Kidney/Bladder, Metabolic, Nutrition/Fuel and Musculoskeletal as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","heart-racing-under-stress"]]'::jsonb,
  '[["body_area","chest"],["body_area","ribs"],["body_area","upper_back"],["body_area","neck"],["body_area","shoulder"],["category","respiratory"],["category","kidney_bladder"],["category","metabolic"],["category","nutrition"],["category","musculoskeletal"]]'::jsonb,
  '[["signal","bss-system-kidney",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when heart racing under stress began, how often it happens now, and what she has already tried.',
    'Ask whether one side is involved or both, and whether it changes with position.',
    'Review Chest alongside this, and note what is already on her timeline there.',
    'Review Ribs alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-heartburn',
  'Heartburn, whole-body areas worth reviewing',
  'chek_hlc',
  'Heartburn and Chest, Ribs, Upper back, Neck, Shoulder, Nutrition/Fuel, Clearance/Detox, Stress, Sleep and Skin/Immune are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","heartburn"]]'::jsonb,
  '[["body_area","chest"],["body_area","ribs"],["body_area","upper_back"],["body_area","neck"],["body_area","shoulder"],["category","nutrition"],["category","clearance_detox"],["category","stress"],["category","sleep"],["category","skin_immune"]]'::jsonb,
  '[["signal","bss-system-liver",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when heartburn began, how often it happens now, and what she has already tried.',
    'Ask what she notices after meals, how soon after, and whether any food reliably makes a difference.',
    'Review Chest alongside this, and note what is already on her timeline there.',
    'Review Ribs alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-heavy-or-achy-legs',
  'Heavy or achy legs after standing, whole-body areas worth reviewing',
  'chek_hlc',
  'Heavy or achy legs after standing is observed alongside Leg, Hip, Knee, Ankle, Calf, Breathing/Respiratory, Kidney/Bladder, Metabolic, Nutrition/Fuel and Musculoskeletal in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","heavy-or-achy-legs"]]'::jsonb,
  '[["body_area","leg"],["body_area","hip"],["body_area","knee"],["body_area","ankle"],["body_area","calf"],["category","respiratory"],["category","kidney_bladder"],["category","metabolic"],["category","nutrition"],["category","musculoskeletal"]]'::jsonb,
  '[["signal","bss-system-kidney",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when heavy or achy legs after standing began, how often it happens now, and what she has already tried.',
    'Ask whether one side is involved or both, and whether it changes with position.',
    'Review Leg alongside this, and note what is already on her timeline there.',
    'Review Hip alongside this, and note what is already on her timeline there.',
    'Review Knee alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-heavy-or-painful-periods',
  'Heavy or painful periods, whole-body areas worth reviewing',
  'chek_hlc',
  'Heavy or painful periods is often observed alongside Pelvis, Low back, Sacroiliac joint, Hip, Groin, Sleep, Stress, Metabolic, Digestion and Mood. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","heavy-or-painful-periods"]]'::jsonb,
  '[["body_area","pelvis"],["body_area","low_back"],["body_area","si_joint"],["body_area","hip"],["body_area","groin"],["category","sleep"],["category","stress"],["category","metabolic"],["category","digestion"],["category","mood"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when heavy or painful periods began, how often it happens now, and what she has already tried.',
    'Ask whether it follows a monthly rhythm, and where she is in her cycle or transition.',
    'Review Pelvis alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Sacroiliac joint alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-hip-clicking',
  'Hip clicking, whole-body areas worth reviewing',
  'biomechanics',
  'Where hip clicking is reported, this coaching framework treats Hip, Pelvis, Sacroiliac joint, Low back, Knee, Posture/Alignment, Musculoskeletal, Nutrition/Fuel, Metabolic and Circulation as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","hip-clicking"]]'::jsonb,
  '[["body_area","hip"],["body_area","pelvis"],["body_area","si_joint"],["body_area","low_back"],["body_area","knee"],["category","posture_alignment"],["category","musculoskeletal"],["category","nutrition"],["category","metabolic"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when hip clicking began, how often it happens now, and what she has already tried.',
    'Ask whether it is noisy, stiff, unstable or painful, and whether it is worse cold or warm.',
    'Review Hip alongside this, and note what is already on her timeline there.',
    'Review Pelvis alongside this, and note what is already on her timeline there.',
    'Review Sacroiliac joint alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-hoarse-voice',
  'Hoarse voice, whole-body areas worth reviewing',
  'mef_internal',
  'Hoarse voice and Throat, Neck, Chest, Immune, Breathing/Respiratory, Hormonal, Digestion, Stress and Clearance/Detox are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","hoarse-voice"]]'::jsonb,
  '[["body_area","throat"],["body_area","neck"],["body_area","chest"],["category","immune"],["category","respiratory"],["category","hormonal"],["category","digestion"],["category","stress"],["category","clearance_detox"]]'::jsonb,
  '[["signal","bss-system-immune",40],["signal","bss-system-hormonal",40]]'::jsonb,
  array[
    'Ask when hoarse voice began, how often it happens now, and what she has already tried.',
    'Ask how long it has been going on, and whether it comes and goes or has been steady.',
    'Review Throat alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Chest alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-hot-flashes',
  'Hot flashes, whole-body areas worth reviewing',
  'chek_hlc',
  'Hot flashes is observed alongside Sleep, Stress, Metabolic, Digestion, Mood and Clearance/Detox in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","hot-flashes"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","metabolic"],["category","digestion"],["category","mood"],["category","clearance_detox"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when hot flashes began, how often it happens now, and what she has already tried.',
    'Ask whether it follows a monthly rhythm, and where she is in her cycle or transition.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-infrequent-bowel-rhythm',
  'Bowel rhythm slower than usual, whole-body areas worth reviewing',
  'chek_hlc',
  'Bowel rhythm slower than usual is often observed alongside Abdomen, Low back, Mid back, Pelvis, Ribs, Nutrition/Fuel, Clearance/Detox, Stress, Sleep and Skin/Immune. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","infrequent-bowel-rhythm"]]'::jsonb,
  '[["body_area","abdomen"],["body_area","low_back"],["body_area","mid_back"],["body_area","pelvis"],["body_area","ribs"],["category","nutrition"],["category","clearance_detox"],["category","stress"],["category","sleep"],["category","skin_immune"]]'::jsonb,
  '[["signal","bss-system-liver",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when bowel rhythm slower than usual began, how often it happens now, and what she has already tried.',
    'Ask what she notices after meals, how soon after, and whether any food reliably makes a difference.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Mid back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-irregular-cycle',
  'Irregular cycle, whole-body areas worth reviewing',
  'chek_hlc',
  'Where irregular cycle is reported, this coaching framework treats Sleep, Stress, Metabolic, Digestion, Mood and Clearance/Detox as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","irregular-cycle"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","metabolic"],["category","digestion"],["category","mood"],["category","clearance_detox"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when irregular cycle began, how often it happens now, and what she has already tried.',
    'Ask whether it follows a monthly rhythm, and where she is in her cycle or transition.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-irritability',
  'Irritability, whole-body areas worth reviewing',
  'lifestyle',
  'Irritability and Sleep, Stress, Nutrition/Fuel, Metabolic, Hormonal and Energy are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","irritability"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","nutrition"],["category","metabolic"],["category","hormonal"],["category","energy"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when irritability began, how often it happens now, and what she has already tried.',
    'Ask how long it has been like this, and what is already helping even a little.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-irritable-when-hungry',
  'Irritable when hungry, whole-body areas worth reviewing',
  'chek_hlc',
  'Irritable when hungry is observed alongside Nutrition/Fuel, Digestion, Energy, Sleep, Stress and Hormonal in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","irritable-when-hungry"]]'::jsonb,
  '[["category","nutrition"],["category","digestion"],["category","energy"],["category","sleep"],["category","stress"],["category","hormonal"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when irritable when hungry began, how often it happens now, and what she has already tried.',
    'Ask how long she goes between meals, and what happens when a meal is late.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Review Energy alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-itchy-or-watery-eyes',
  'Itchy or watery eyes, whole-body areas worth reviewing',
  'chek_hlc',
  'Itchy or watery eyes is often observed alongside Eyes, Head, Neck, Digestion, Clearance/Detox, Hormonal, Immune, Stress and Nutrition/Fuel. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","itchy-or-watery-eyes"]]'::jsonb,
  '[["body_area","eyes"],["body_area","head"],["body_area","neck"],["category","digestion"],["category","clearance_detox"],["category","hormonal"],["category","immune"],["category","stress"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-liver",40]]'::jsonb,
  array[
    'Ask when itchy or watery eyes began, how often it happens now, and what she has already tried.',
    'Ask where it appears, whether it moves, and whether it follows food, stress or the cycle.',
    'Review Eyes alongside this, and note what is already on her timeline there.',
    'Review Head alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-itchy-skin',
  'Itchy skin, whole-body areas worth reviewing',
  'chek_hlc',
  'Where itchy skin is reported, this coaching framework treats Skin, Abdomen, Digestion, Clearance/Detox, Hormonal, Immune, Stress and Nutrition/Fuel as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","itchy-skin"]]'::jsonb,
  '[["body_area","skin"],["body_area","abdomen"],["category","digestion"],["category","clearance_detox"],["category","hormonal"],["category","immune"],["category","stress"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-liver",40]]'::jsonb,
  array[
    'Ask when itchy skin began, how often it happens now, and what she has already tried.',
    'Ask where it appears, whether it moves, and whether it follows food, stress or the cycle.',
    'Review Skin alongside this, and note what is already on her timeline there.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-jaw-clenching',
  'Jaw clenching or teeth grinding, whole-body areas worth reviewing',
  'biomechanics',
  'Jaw clenching or teeth grinding and Jaw, Neck, Head, Upper back, Posture/Alignment, Breathing/Respiratory, Stress, Sleep, Nutrition/Fuel and Joint/Movement are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","jaw-clenching"]]'::jsonb,
  '[["body_area","jaw"],["body_area","neck"],["body_area","head"],["body_area","upper_back"],["category","posture_alignment"],["category","respiratory"],["category","stress"],["category","sleep"],["category","nutrition"],["category","joint_movement"]]'::jsonb,
  '[["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when jaw clenching or teeth grinding began, how often it happens now, and what she has already tried.',
    'Ask what changed in training, work or sleep around the time this started.',
    'Review Jaw alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Head alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-jaw-clicking',
  'Jaw clicking or grinding, whole-body areas worth reviewing',
  'biomechanics',
  'Jaw clicking or grinding is observed alongside Jaw, Neck, Head, Upper back, Posture/Alignment, Musculoskeletal, Nutrition/Fuel, Metabolic and Circulation in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","jaw-clicking"]]'::jsonb,
  '[["body_area","jaw"],["body_area","neck"],["body_area","head"],["body_area","upper_back"],["category","posture_alignment"],["category","musculoskeletal"],["category","nutrition"],["category","metabolic"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when jaw clicking or grinding began, how often it happens now, and what she has already tried.',
    'Ask whether it is noisy, stiff, unstable or painful, and whether it is worse cold or warm.',
    'Review Jaw alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Head alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-joint-aching',
  'Joint aching, whole-body areas worth reviewing',
  'biomechanics',
  'Joint aching is often observed alongside Posture/Alignment, Musculoskeletal, Nutrition/Fuel, Metabolic and Circulation. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","joint-aching"]]'::jsonb,
  '[["category","posture_alignment"],["category","musculoskeletal"],["category","nutrition"],["category","metabolic"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when joint aching began, how often it happens now, and what she has already tried.',
    'Ask whether it is noisy, stiff, unstable or painful, and whether it is worse cold or warm.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Musculoskeletal alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-joint-clicking',
  'Joint clicking, whole-body areas worth reviewing',
  'biomechanics',
  'Where joint clicking is reported, this coaching framework treats Posture/Alignment, Musculoskeletal, Nutrition/Fuel, Metabolic and Circulation as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","joint-clicking"]]'::jsonb,
  '[["category","posture_alignment"],["category","musculoskeletal"],["category","nutrition"],["category","metabolic"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when joint clicking began, how often it happens now, and what she has already tried.',
    'Ask whether it is noisy, stiff, unstable or painful, and whether it is worse cold or warm.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Musculoskeletal alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-joint-grinding',
  'Joint grinding, whole-body areas worth reviewing',
  'biomechanics',
  'Joint grinding and Posture/Alignment, Musculoskeletal, Nutrition/Fuel, Metabolic and Circulation are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","joint-grinding"]]'::jsonb,
  '[["category","posture_alignment"],["category","musculoskeletal"],["category","nutrition"],["category","metabolic"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when joint grinding began, how often it happens now, and what she has already tried.',
    'Ask whether it is noisy, stiff, unstable or painful, and whether it is worse cold or warm.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Musculoskeletal alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-joint-instability',
  'Joint instability or giving way, whole-body areas worth reviewing',
  'biomechanics',
  'Joint instability or giving way is observed alongside Posture/Alignment, Musculoskeletal, Nutrition/Fuel, Metabolic and Circulation in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","joint-instability"]]'::jsonb,
  '[["category","posture_alignment"],["category","musculoskeletal"],["category","nutrition"],["category","metabolic"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when joint instability or giving way began, how often it happens now, and what she has already tried.',
    'Ask whether it is noisy, stiff, unstable or painful, and whether it is worse cold or warm.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Musculoskeletal alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-joint-locking',
  'Joint locking or catching, whole-body areas worth reviewing',
  'biomechanics',
  'Joint locking or catching is often observed alongside Posture/Alignment, Musculoskeletal, Nutrition/Fuel, Metabolic and Circulation. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","joint-locking"]]'::jsonb,
  '[["category","posture_alignment"],["category","musculoskeletal"],["category","nutrition"],["category","metabolic"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when joint locking or catching began, how often it happens now, and what she has already tried.',
    'Ask whether it is noisy, stiff, unstable or painful, and whether it is worse cold or warm.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Musculoskeletal alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-joint-pain',
  'Joint pain, whole-body areas worth reviewing',
  'chek_hlc',
  'Where joint pain is reported, this coaching framework treats Sleep, Stress, Musculoskeletal, Posture/Alignment and Nutrition/Fuel as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","joint-pain"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","musculoskeletal"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask when joint pain began, how often it happens now, and what she has already tried.',
    'Ask her to describe the sensation in her own words, and what makes it better or worse.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Musculoskeletal alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-joint-popping',
  'Joint popping or snapping, whole-body areas worth reviewing',
  'biomechanics',
  'Joint popping or snapping and Posture/Alignment, Musculoskeletal, Nutrition/Fuel, Metabolic and Circulation are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","joint-popping"]]'::jsonb,
  '[["category","posture_alignment"],["category","musculoskeletal"],["category","nutrition"],["category","metabolic"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when joint popping or snapping began, how often it happens now, and what she has already tried.',
    'Ask whether it is noisy, stiff, unstable or painful, and whether it is worse cold or warm.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Musculoskeletal alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-joint-stiffness',
  'Joint stiffness, whole-body areas worth reviewing',
  'biomechanics',
  'Joint stiffness is observed alongside Posture/Alignment, Musculoskeletal, Nutrition/Fuel, Metabolic and Circulation in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","joint-stiffness"]]'::jsonb,
  '[["category","posture_alignment"],["category","musculoskeletal"],["category","nutrition"],["category","metabolic"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when joint stiffness began, how often it happens now, and what she has already tried.',
    'Ask whether it is noisy, stiff, unstable or painful, and whether it is worse cold or warm.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Musculoskeletal alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-joint-swelling',
  'Joint swelling, whole-body areas worth reviewing',
  'biomechanics',
  'Joint swelling is often observed alongside Posture/Alignment, Musculoskeletal, Nutrition/Fuel, Metabolic and Circulation. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","joint-swelling"]]'::jsonb,
  '[["category","posture_alignment"],["category","musculoskeletal"],["category","nutrition"],["category","metabolic"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when joint swelling began, how often it happens now, and what she has already tried.',
    'Ask whether it is noisy, stiff, unstable or painful, and whether it is worse cold or warm.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Musculoskeletal alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-late-night-second-wind',
  'Late night second wind, whole-body areas worth reviewing',
  'lifestyle',
  'Where late night second wind is reported, this coaching framework treats Stress, Hormonal, Metabolic, Kidney/Bladder, Breathing/Respiratory and Mood as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","late-night-second-wind"]]'::jsonb,
  '[["category","stress"],["category","hormonal"],["category","metabolic"],["category","kidney_bladder"],["category","respiratory"],["category","mood"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-hormonal",40]]'::jsonb,
  array[
    'Ask when late night second wind began, how often it happens now, and what she has already tried.',
    'Ask about the hour before bed, and what time she is actually asleep rather than in bed.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Hormonal alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-light-sensitivity',
  'Light sensitivity, whole-body areas worth reviewing',
  'referred_pain',
  'Light sensitivity and Eyes, Head, Neck, Sleep, Stress, Metabolic, Circulation, Posture/Alignment and Nutrition/Fuel are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","light-sensitivity"]]'::jsonb,
  '[["body_area","eyes"],["body_area","head"],["body_area","neck"],["category","sleep"],["category","stress"],["category","metabolic"],["category","circulation"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when light sensitivity began, how often it happens now, and what she has already tried.',
    'Ask exactly what the sensation is in her own words, where it starts and whether it travels.',
    'Review Eyes alongside this, and note what is already on her timeline there.',
    'Review Head alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-lighter-or-broken-sleep',
  'Lighter or broken sleep, whole-body areas worth reviewing',
  'lifestyle',
  'Lighter or broken sleep is observed alongside Stress, Hormonal, Metabolic, Kidney/Bladder, Breathing/Respiratory and Mood in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","lighter-or-broken-sleep"]]'::jsonb,
  '[["category","stress"],["category","hormonal"],["category","metabolic"],["category","kidney_bladder"],["category","respiratory"],["category","mood"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-hormonal",40]]'::jsonb,
  array[
    'Ask when lighter or broken sleep began, how often it happens now, and what she has already tried.',
    'Ask about the hour before bed, and what time she is actually asleep rather than in bed.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Hormonal alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-longer-recovery-after-exercise',
  'Longer recovery after exercise, whole-body areas worth reviewing',
  'lifestyle',
  'Longer recovery after exercise is often observed alongside Sleep, Metabolic, Nutrition/Fuel, Stress, Immune and Circulation. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","longer-recovery-after-exercise"]]'::jsonb,
  '[["category","sleep"],["category","metabolic"],["category","nutrition"],["category","stress"],["category","immune"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-blood-sugar",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when longer recovery after exercise began, how often it happens now, and what she has already tried.',
    'Ask what her energy does hour by hour, and what is different on the better days.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-loose-or-urgent-stools',
  'Loose or urgent stools, whole-body areas worth reviewing',
  'chek_hlc',
  'Where loose or urgent stools is reported, this coaching framework treats Abdomen, Low back, Mid back, Pelvis, Ribs, Nutrition/Fuel, Clearance/Detox, Stress, Sleep and Skin/Immune as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","loose-or-urgent-stools"]]'::jsonb,
  '[["body_area","abdomen"],["body_area","low_back"],["body_area","mid_back"],["body_area","pelvis"],["body_area","ribs"],["category","nutrition"],["category","clearance_detox"],["category","stress"],["category","sleep"],["category","skin_immune"]]'::jsonb,
  '[["signal","bss-system-liver",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when loose or urgent stools began, how often it happens now, and what she has already tried.',
    'Ask what she notices after meals, how soon after, and whether any food reliably makes a difference.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Mid back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-low-back-ache',
  'Low-back ache, whole-body areas worth reviewing',
  'biomechanics',
  'Low-back ache and Low back, Pelvis, Sacroiliac joint, Hip, Abdomen, Posture/Alignment, Breathing/Respiratory, Stress, Sleep and Nutrition/Fuel are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","low-back-ache"]]'::jsonb,
  '[["body_area","low_back"],["body_area","pelvis"],["body_area","si_joint"],["body_area","hip"],["body_area","abdomen"],["category","posture_alignment"],["category","respiratory"],["category","stress"],["category","sleep"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when low-back ache began, how often it happens now, and what she has already tried.',
    'Ask what changed in training, work or sleep around the time this started.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Pelvis alongside this, and note what is already on her timeline there.',
    'Review Sacroiliac joint alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-low-back-tightness',
  'Low-back tightness, whole-body areas worth reviewing',
  'biomechanics',
  'Low-back tightness is observed alongside Low back, Pelvis, Sacroiliac joint, Hip, Abdomen, Posture/Alignment, Breathing/Respiratory, Stress, Sleep and Nutrition/Fuel in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","low-back-tightness"]]'::jsonb,
  '[["body_area","low_back"],["body_area","pelvis"],["body_area","si_joint"],["body_area","hip"],["body_area","abdomen"],["category","posture_alignment"],["category","respiratory"],["category","stress"],["category","sleep"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when low-back tightness began, how often it happens now, and what she has already tried.',
    'Ask what changed in training, work or sleep around the time this started.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Pelvis alongside this, and note what is already on her timeline there.',
    'Review Sacroiliac joint alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-low-grade-fever-feeling',
  'Feeling feverish without being sick, whole-body areas worth reviewing',
  'chek_hlc',
  'Feeling feverish without being sick is often observed alongside Digestion, Sleep, Stress, Nutrition/Fuel, Clearance/Detox and Energy. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","low-grade-fever-feeling"]]'::jsonb,
  '[["category","digestion"],["category","sleep"],["category","stress"],["category","nutrition"],["category","clearance_detox"],["category","energy"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when feeling feverish without being sick began, how often it happens now, and what she has already tried.',
    'Ask how often this has happened in the last six months and how long each episode ran.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-low-motivation',
  'Low motivation, whole-body areas worth reviewing',
  'lifestyle',
  'Where low motivation is reported, this coaching framework treats Sleep, Stress, Nutrition/Fuel, Metabolic, Hormonal and Energy as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","low-motivation"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","nutrition"],["category","metabolic"],["category","hormonal"],["category","energy"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when low motivation began, how often it happens now, and what she has already tried.',
    'Ask how long it has been like this, and what is already helping even a little.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-lower-energy-than-before',
  'Lower energy than before, whole-body areas worth reviewing',
  'lifestyle',
  'Lower energy than before and Sleep, Metabolic, Nutrition/Fuel, Stress, Immune and Circulation are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","lower-energy-than-before"]]'::jsonb,
  '[["category","sleep"],["category","metabolic"],["category","nutrition"],["category","stress"],["category","immune"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-blood-sugar",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when lower energy than before began, how often it happens now, and what she has already tried.',
    'Ask what her energy does hour by hour, and what is different on the better days.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-midsection-weight-gain',
  'Midsection weight gain, whole-body areas worth reviewing',
  'chek_hlc',
  'Midsection weight gain is observed alongside Abdomen, Low back, Mid back, Pelvis, Ribs, Nutrition/Fuel, Digestion, Energy, Sleep and Stress in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","midsection-weight-gain"]]'::jsonb,
  '[["body_area","abdomen"],["body_area","low_back"],["body_area","mid_back"],["body_area","pelvis"],["body_area","ribs"],["category","nutrition"],["category","digestion"],["category","energy"],["category","sleep"],["category","stress"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when midsection weight gain began, how often it happens now, and what she has already tried.',
    'Ask how long she goes between meals, and what happens when a meal is late.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Mid back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-mood-shifts-through-the-month',
  'Mood shifts through the month, whole-body areas worth reviewing',
  'lifestyle',
  'Mood shifts through the month is often observed alongside Sleep, Stress, Nutrition/Fuel, Metabolic, Hormonal and Energy. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","mood-shifts-through-the-month"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","nutrition"],["category","metabolic"],["category","hormonal"],["category","energy"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when mood shifts through the month began, how often it happens now, and what she has already tried.',
    'Ask how long it has been like this, and what is already helping even a little.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-morning-facial-puffiness',
  'Morning facial puffiness, whole-body areas worth reviewing',
  'chek_hlc',
  'Where morning facial puffiness is reported, this coaching framework treats Head, Neck, Jaw, Eyes, Hormonal, Sleep, Nutrition/Fuel, Stress and Circulation as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","morning-facial-puffiness"]]'::jsonb,
  '[["body_area","head"],["body_area","neck"],["body_area","jaw"],["body_area","eyes"],["category","hormonal"],["category","sleep"],["category","nutrition"],["category","stress"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-hormonal",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when morning facial puffiness began, how often it happens now, and what she has already tried.',
    'Ask about fluid across the day, and about caffeine and alcohol in particular.',
    'Review Head alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Jaw alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-morning-stiffness',
  'Morning stiffness, whole-body areas worth reviewing',
  'biomechanics',
  'Morning stiffness and Posture/Alignment, Breathing/Respiratory, Stress, Sleep, Nutrition/Fuel and Joint/Movement are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","morning-stiffness"]]'::jsonb,
  '[["category","posture_alignment"],["category","respiratory"],["category","stress"],["category","sleep"],["category","nutrition"],["category","joint_movement"]]'::jsonb,
  '[["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when morning stiffness began, how often it happens now, and what she has already tried.',
    'Ask what changed in training, work or sleep around the time this started.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Breathing/Respiratory alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-mouth-breathing',
  'Mouth breathing, whole-body areas worth reviewing',
  'chek_hlc',
  'Mouth breathing is observed alongside Throat, Neck, Chest, Stress, Posture/Alignment, Sleep, Musculoskeletal and Circulation in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","mouth-breathing"]]'::jsonb,
  '[["body_area","throat"],["body_area","neck"],["body_area","chest"],["category","stress"],["category","posture_alignment"],["category","sleep"],["category","musculoskeletal"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask when mouth breathing began, how often it happens now, and what she has already tried.',
    'Ask whether she breathes through her nose at rest, and where she feels the breath move.',
    'Review Throat alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Chest alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-muscle-cramps-or-spasms',
  'Muscle cramps or spasms, whole-body areas worth reviewing',
  'biomechanics',
  'Muscle cramps or spasms is often observed alongside Posture/Alignment, Breathing/Respiratory, Stress, Sleep, Nutrition/Fuel and Joint/Movement. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","muscle-cramps-or-spasms"]]'::jsonb,
  '[["category","posture_alignment"],["category","respiratory"],["category","stress"],["category","sleep"],["category","nutrition"],["category","joint_movement"]]'::jsonb,
  '[["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when muscle cramps or spasms began, how often it happens now, and what she has already tried.',
    'Ask what changed in training, work or sleep around the time this started.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Breathing/Respiratory alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-muscle-loss-without-activity-change',
  'Muscle loss without a change in activity, whole-body areas worth reviewing',
  'biomechanics',
  'Where muscle loss without a change in activity is reported, this coaching framework treats Posture/Alignment, Breathing/Respiratory, Stress, Sleep, Nutrition/Fuel and Joint/Movement as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","muscle-loss-without-activity-change"]]'::jsonb,
  '[["category","posture_alignment"],["category","respiratory"],["category","stress"],["category","sleep"],["category","nutrition"],["category","joint_movement"]]'::jsonb,
  '[["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when muscle loss without a change in activity began, how often it happens now, and what she has already tried.',
    'Ask what changed in training, work or sleep around the time this started.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Breathing/Respiratory alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-muscle-pulling-sensation',
  'Muscle pulling sensation, whole-body areas worth reviewing',
  'biomechanics',
  'Muscle pulling sensation and Posture/Alignment, Breathing/Respiratory, Stress, Sleep, Nutrition/Fuel and Joint/Movement are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","muscle-pulling-sensation"]]'::jsonb,
  '[["category","posture_alignment"],["category","respiratory"],["category","stress"],["category","sleep"],["category","nutrition"],["category","joint_movement"]]'::jsonb,
  '[["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when muscle pulling sensation began, how often it happens now, and what she has already tried.',
    'Ask what changed in training, work or sleep around the time this started.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Breathing/Respiratory alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-muscle-soreness',
  'Muscle soreness, whole-body areas worth reviewing',
  'biomechanics',
  'Muscle soreness is observed alongside Posture/Alignment, Breathing/Respiratory, Stress, Sleep, Nutrition/Fuel and Joint/Movement in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","muscle-soreness"]]'::jsonb,
  '[["category","posture_alignment"],["category","respiratory"],["category","stress"],["category","sleep"],["category","nutrition"],["category","joint_movement"]]'::jsonb,
  '[["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when muscle soreness began, how often it happens now, and what she has already tried.',
    'Ask what changed in training, work or sleep around the time this started.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Breathing/Respiratory alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-muscle-soreness-without-exercise',
  'Muscle soreness without exercise, whole-body areas worth reviewing',
  'biomechanics',
  'Muscle soreness without exercise is often observed alongside Posture/Alignment, Breathing/Respiratory, Stress, Sleep, Nutrition/Fuel and Joint/Movement. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","muscle-soreness-without-exercise"]]'::jsonb,
  '[["category","posture_alignment"],["category","respiratory"],["category","stress"],["category","sleep"],["category","nutrition"],["category","joint_movement"]]'::jsonb,
  '[["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when muscle soreness without exercise began, how often it happens now, and what she has already tried.',
    'Ask what changed in training, work or sleep around the time this started.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Breathing/Respiratory alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-muscle-tightness',
  'Muscle tightness, whole-body areas worth reviewing',
  'biomechanics',
  'Where muscle tightness is reported, this coaching framework treats Posture/Alignment, Breathing/Respiratory, Stress, Sleep, Nutrition/Fuel and Joint/Movement as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","muscle-tightness"]]'::jsonb,
  '[["category","posture_alignment"],["category","respiratory"],["category","stress"],["category","sleep"],["category","nutrition"],["category","joint_movement"]]'::jsonb,
  '[["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when muscle tightness began, how often it happens now, and what she has already tried.',
    'Ask what changed in training, work or sleep around the time this started.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Breathing/Respiratory alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-muscle-weakness',
  'Muscle weakness, whole-body areas worth reviewing',
  'biomechanics',
  'Muscle weakness and Posture/Alignment, Breathing/Respiratory, Stress, Sleep, Nutrition/Fuel and Joint/Movement are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","muscle-weakness"]]'::jsonb,
  '[["category","posture_alignment"],["category","respiratory"],["category","stress"],["category","sleep"],["category","nutrition"],["category","joint_movement"]]'::jsonb,
  '[["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when muscle weakness began, how often it happens now, and what she has already tried.',
    'Ask what changed in training, work or sleep around the time this started.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Breathing/Respiratory alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-nausea',
  'Nausea, whole-body areas worth reviewing',
  'chek_hlc',
  'Nausea is observed alongside Abdomen, Low back, Mid back, Pelvis, Ribs, Nutrition/Fuel, Clearance/Detox, Stress, Sleep and Skin/Immune in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","nausea"]]'::jsonb,
  '[["body_area","abdomen"],["body_area","low_back"],["body_area","mid_back"],["body_area","pelvis"],["body_area","ribs"],["category","nutrition"],["category","clearance_detox"],["category","stress"],["category","sleep"],["category","skin_immune"]]'::jsonb,
  '[["signal","bss-system-liver",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when nausea began, how often it happens now, and what she has already tried.',
    'Ask what she notices after meals, how soon after, and whether any food reliably makes a difference.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Mid back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-neck-and-shoulder-tension',
  'Neck and shoulder tension, whole-body areas worth reviewing',
  'biomechanics',
  'Neck and shoulder tension is often observed alongside Neck, Upper back, Shoulder, Jaw, Head, Posture/Alignment, Breathing/Respiratory, Stress, Sleep and Nutrition/Fuel. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","neck-and-shoulder-tension"]]'::jsonb,
  '[["body_area","neck"],["body_area","upper_back"],["body_area","shoulder"],["body_area","jaw"],["body_area","head"],["category","posture_alignment"],["category","respiratory"],["category","stress"],["category","sleep"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when neck and shoulder tension began, how often it happens now, and what she has already tried.',
    'Ask what changed in training, work or sleep around the time this started.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Review Shoulder alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-needing-caffeine-to-start',
  'Needing caffeine to feel normal in the morning, whole-body areas worth reviewing',
  'lifestyle',
  'Where needing caffeine to feel normal in the morning is reported, this coaching framework treats Sleep, Metabolic, Nutrition/Fuel, Stress, Immune and Circulation as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","needing-caffeine-to-start"]]'::jsonb,
  '[["category","sleep"],["category","metabolic"],["category","nutrition"],["category","stress"],["category","immune"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-blood-sugar",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when needing caffeine to feel normal in the morning began, how often it happens now, and what she has already tried.',
    'Ask what her energy does hour by hour, and what is different on the better days.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-night-sweats',
  'Night sweats, whole-body areas worth reviewing',
  'chek_hlc',
  'Night sweats and Sleep, Stress, Metabolic, Digestion, Mood and Clearance/Detox are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","night-sweats"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","metabolic"],["category","digestion"],["category","mood"],["category","clearance_detox"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when night sweats began, how often it happens now, and what she has already tried.',
    'Ask whether it follows a monthly rhythm, and where she is in her cycle or transition.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-numbness',
  'Numbness, whole-body areas worth reviewing',
  'referred_pain',
  'Numbness is observed alongside Sleep, Stress, Metabolic, Circulation, Posture/Alignment and Nutrition/Fuel in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","numbness"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","metabolic"],["category","circulation"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when numbness began, how often it happens now, and what she has already tried.',
    'Ask exactly what the sensation is in her own words, where it starts and whether it travels.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-old-injuries-flaring-up',
  'Old injuries flaring up, whole-body areas worth reviewing',
  'biomechanics',
  'Old injuries flaring up is often observed alongside Posture/Alignment, Breathing/Respiratory, Stress, Sleep, Nutrition/Fuel and Joint/Movement. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","old-injuries-flaring-up"]]'::jsonb,
  '[["category","posture_alignment"],["category","respiratory"],["category","stress"],["category","sleep"],["category","nutrition"],["category","joint_movement"]]'::jsonb,
  '[["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when old injuries flaring up began, how often it happens now, and what she has already tried.',
    'Ask what changed in training, work or sleep around the time this started.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Breathing/Respiratory alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-one-sided-tension',
  'Tension on one side, whole-body areas worth reviewing',
  'biomechanics',
  'Where tension on one side is reported, this coaching framework treats Posture/Alignment, Breathing/Respiratory, Stress, Sleep, Nutrition/Fuel and Joint/Movement as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","one-sided-tension"]]'::jsonb,
  '[["category","posture_alignment"],["category","respiratory"],["category","stress"],["category","sleep"],["category","nutrition"],["category","joint_movement"]]'::jsonb,
  '[["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when tension on one side began, how often it happens now, and what she has already tried.',
    'Ask what changed in training, work or sleep around the time this started.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Breathing/Respiratory alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-overwhelm-in-busy-environments',
  'Overwhelm in busy environments, whole-body areas worth reviewing',
  'referred_pain',
  'Overwhelm in busy environments and Sleep, Stress, Metabolic, Circulation, Posture/Alignment and Nutrition/Fuel are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","overwhelm-in-busy-environments"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","metabolic"],["category","circulation"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when overwhelm in busy environments began, how often it happens now, and what she has already tried.',
    'Ask exactly what the sensation is in her own words, where it starts and whether it travels.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-pain-after-activity',
  'Pain after activity, whole-body areas worth reviewing',
  'chek_hlc',
  'Pain after activity is observed alongside Sleep, Stress, Musculoskeletal, Posture/Alignment and Nutrition/Fuel in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","pain-after-activity"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","musculoskeletal"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask when pain after activity began, how often it happens now, and what she has already tried.',
    'Ask her to describe the sensation in her own words, and what makes it better or worse.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Musculoskeletal alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-pain-limiting-daily-activity',
  'Pain limiting daily activity, whole-body areas worth reviewing',
  'chek_hlc',
  'Pain limiting daily activity is often observed alongside Sleep, Stress, Musculoskeletal, Posture/Alignment and Nutrition/Fuel. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","pain-limiting-daily-activity"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","musculoskeletal"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask when pain limiting daily activity began, how often it happens now, and what she has already tried.',
    'Ask her to describe the sensation in her own words, and what makes it better or worse.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Musculoskeletal alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-persistent-thirst',
  'Persistent thirst, whole-body areas worth reviewing',
  'chek_hlc',
  'Where persistent thirst is reported, this coaching framework treats Nutrition/Fuel, Digestion, Energy, Sleep, Stress and Hormonal as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","persistent-thirst"]]'::jsonb,
  '[["category","nutrition"],["category","digestion"],["category","energy"],["category","sleep"],["category","stress"],["category","hormonal"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when persistent thirst began, how often it happens now, and what she has already tried.',
    'Ask how long she goes between meals, and what happens when a meal is late.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Review Energy alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-pounding-heartbeat-at-rest',
  'Pounding heartbeat at rest, whole-body areas worth reviewing',
  'chek_hlc',
  'Pounding heartbeat at rest and Chest, Ribs, Upper back, Neck, Shoulder, Breathing/Respiratory, Kidney/Bladder, Metabolic, Nutrition/Fuel and Musculoskeletal are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","pounding-heartbeat-at-rest"]]'::jsonb,
  '[["body_area","chest"],["body_area","ribs"],["body_area","upper_back"],["body_area","neck"],["body_area","shoulder"],["category","respiratory"],["category","kidney_bladder"],["category","metabolic"],["category","nutrition"],["category","musculoskeletal"]]'::jsonb,
  '[["signal","bss-system-kidney",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when pounding heartbeat at rest began, how often it happens now, and what she has already tried.',
    'Ask whether one side is involved or both, and whether it changes with position.',
    'Review Chest alongside this, and note what is already on her timeline there.',
    'Review Ribs alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-premenstrual-irritability',
  'Premenstrual irritability or tearfulness, whole-body areas worth reviewing',
  'lifestyle',
  'Premenstrual irritability or tearfulness is observed alongside Sleep, Stress, Nutrition/Fuel, Metabolic, Hormonal and Energy in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","premenstrual-irritability"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","nutrition"],["category","metabolic"],["category","hormonal"],["category","energy"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when premenstrual irritability or tearfulness began, how often it happens now, and what she has already tried.',
    'Ask how long it has been like this, and what is already helping even a little.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-pressure-or-fullness',
  'Pressure or fullness, whole-body areas worth reviewing',
  'chek_hlc',
  'Pressure or fullness is often observed alongside Sleep, Stress, Musculoskeletal, Posture/Alignment and Nutrition/Fuel. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","pressure-or-fullness"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","musculoskeletal"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask when pressure or fullness began, how often it happens now, and what she has already tried.',
    'Ask her to describe the sensation in her own words, and what makes it better or worse.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Musculoskeletal alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-puffy-or-heavy-limbs',
  'Puffy or heavy limbs, whole-body areas worth reviewing',
  'chek_hlc',
  'Where puffy or heavy limbs is reported, this coaching framework treats Leg, Hip, Knee, Ankle, Calf, Breathing/Respiratory, Kidney/Bladder, Metabolic, Nutrition/Fuel and Musculoskeletal as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","puffy-or-heavy-limbs"]]'::jsonb,
  '[["body_area","leg"],["body_area","hip"],["body_area","knee"],["body_area","ankle"],["body_area","calf"],["category","respiratory"],["category","kidney_bladder"],["category","metabolic"],["category","nutrition"],["category","musculoskeletal"]]'::jsonb,
  '[["signal","bss-system-kidney",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when puffy or heavy limbs began, how often it happens now, and what she has already tried.',
    'Ask whether one side is involved or both, and whether it changes with position.',
    'Review Leg alongside this, and note what is already on her timeline there.',
    'Review Hip alongside this, and note what is already on her timeline there.',
    'Review Knee alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-racing-mind-at-bedtime',
  'Racing mind at bedtime, whole-body areas worth reviewing',
  'lifestyle',
  'Racing mind at bedtime and Stress, Hormonal, Metabolic, Kidney/Bladder, Breathing/Respiratory and Mood are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","racing-mind-at-bedtime"]]'::jsonb,
  '[["category","stress"],["category","hormonal"],["category","metabolic"],["category","kidney_bladder"],["category","respiratory"],["category","mood"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-hormonal",40]]'::jsonb,
  array[
    'Ask when racing mind at bedtime began, how often it happens now, and what she has already tried.',
    'Ask about the hour before bed, and what time she is actually asleep rather than in bed.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Hormonal alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-radiating-sensation',
  'Sensation travelling down a limb, whole-body areas worth reviewing',
  'referred_pain',
  'Sensation travelling down a limb is observed alongside Sleep, Stress, Metabolic, Circulation, Posture/Alignment and Nutrition/Fuel in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","radiating-sensation"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","metabolic"],["category","circulation"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when sensation travelling down a limb began, how often it happens now, and what she has already tried.',
    'Ask exactly what the sensation is in her own words, where it starts and whether it travels.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-reduced-joint-range',
  'Reduced joint range, whole-body areas worth reviewing',
  'biomechanics',
  'Reduced joint range is often observed alongside Posture/Alignment, Musculoskeletal, Nutrition/Fuel, Metabolic and Circulation. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","reduced-joint-range"]]'::jsonb,
  '[["category","posture_alignment"],["category","musculoskeletal"],["category","nutrition"],["category","metabolic"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when reduced joint range began, how often it happens now, and what she has already tried.',
    'Ask whether it is noisy, stiff, unstable or painful, and whether it is worse cold or warm.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Musculoskeletal alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-reduced-motivation-or-drive',
  'Reduced motivation or drive, whole-body areas worth reviewing',
  'lifestyle',
  'Where reduced motivation or drive is reported, this coaching framework treats Sleep, Stress, Nutrition/Fuel, Metabolic, Hormonal and Energy as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","reduced-motivation-or-drive"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","nutrition"],["category","metabolic"],["category","hormonal"],["category","energy"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when reduced motivation or drive began, how often it happens now, and what she has already tried.',
    'Ask how long it has been like this, and what is already helping even a little.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-restless-legs-at-night',
  'Restless legs at night, whole-body areas worth reviewing',
  'lifestyle',
  'Restless legs at night and Leg, Hip, Knee, Ankle, Calf, Stress, Hormonal, Metabolic, Kidney/Bladder and Breathing/Respiratory are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","restless-legs-at-night"]]'::jsonb,
  '[["body_area","leg"],["body_area","hip"],["body_area","knee"],["body_area","ankle"],["body_area","calf"],["category","stress"],["category","hormonal"],["category","metabolic"],["category","kidney_bladder"],["category","respiratory"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-hormonal",40]]'::jsonb,
  array[
    'Ask when restless legs at night began, how often it happens now, and what she has already tried.',
    'Ask about the hour before bed, and what time she is actually asleep rather than in bed.',
    'Review Leg alongside this, and note what is already on her timeline there.',
    'Review Hip alongside this, and note what is already on her timeline there.',
    'Review Knee alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-salt-cravings',
  'Salt cravings, whole-body areas worth reviewing',
  'lifestyle',
  'Salt cravings is observed alongside Digestion, Metabolic, Energy, Mood, Sleep and Hormonal in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","salt-cravings"]]'::jsonb,
  '[["category","digestion"],["category","metabolic"],["category","energy"],["category","mood"],["category","sleep"],["category","hormonal"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when salt cravings began, how often it happens now, and what she has already tried.',
    'Ask what a normal day of eating looks like, including timing and what she drinks.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Review Energy alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-sensitivity-to-strong-smells',
  'Sensitivity to strong smells, whole-body areas worth reviewing',
  'chek_hlc',
  'Sensitivity to strong smells is often observed alongside Digestion, Kidney/Bladder, Skin/Immune, Hormonal, Nutrition/Fuel and Sleep. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","sensitivity-to-strong-smells"]]'::jsonb,
  '[["category","digestion"],["category","kidney_bladder"],["category","skin_immune"],["category","hormonal"],["category","nutrition"],["category","sleep"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-kidney",40]]'::jsonb,
  array[
    'Ask when sensitivity to strong smells began, how often it happens now, and what she has already tried.',
    'Ask about bowel rhythm, sweating and fluid, which is how this framework reads clearance.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Review Kidney/Bladder alongside this, and note what is already on her timeline there.',
    'Review Skin/Immune alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-shallow-breathing-under-stress',
  'Breathing gets shallow under stress, whole-body areas worth reviewing',
  'chek_hlc',
  'Where breathing gets shallow under stress is reported, this coaching framework treats Chest, Ribs, Upper back, Neck, Shoulder, Sleep, Breathing/Respiratory, Digestion, Energy and Mood as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","shallow-breathing-under-stress"]]'::jsonb,
  '[["body_area","chest"],["body_area","ribs"],["body_area","upper_back"],["body_area","neck"],["body_area","shoulder"],["category","sleep"],["category","respiratory"],["category","digestion"],["category","energy"],["category","mood"]]'::jsonb,
  '[["signal","bss-system-digestion",40]]'::jsonb,
  array[
    'Ask when breathing gets shallow under stress began, how often it happens now, and what she has already tried.',
    'Ask what the last two weeks have actually been like, and where she feels it first.',
    'Review Chest alongside this, and note what is already on her timeline there.',
    'Review Ribs alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-sharp-or-pinching-pain',
  'Sharp or pinching pain, whole-body areas worth reviewing',
  'chek_hlc',
  'Sharp or pinching pain and Sleep, Stress, Musculoskeletal, Posture/Alignment and Nutrition/Fuel are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","sharp-or-pinching-pain"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","musculoskeletal"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask when sharp or pinching pain began, how often it happens now, and what she has already tried.',
    'Ask her to describe the sensation in her own words, and what makes it better or worse.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Musculoskeletal alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-short-of-breath',
  'Short of breath, whole-body areas worth reviewing',
  'chek_hlc',
  'Short of breath is observed alongside Chest, Ribs, Upper back, Neck, Shoulder, Stress, Posture/Alignment, Sleep, Musculoskeletal and Circulation in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","short-of-breath"]]'::jsonb,
  '[["body_area","chest"],["body_area","ribs"],["body_area","upper_back"],["body_area","neck"],["body_area","shoulder"],["category","stress"],["category","posture_alignment"],["category","sleep"],["category","musculoskeletal"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask when short of breath began, how often it happens now, and what she has already tried.',
    'Ask whether she breathes through her nose at rest, and where she feels the breath move.',
    'Review Chest alongside this, and note what is already on her timeline there.',
    'Review Ribs alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-sighing-or-yawning-often',
  'Sighing or yawning often, whole-body areas worth reviewing',
  'chek_hlc',
  'Sighing or yawning often is often observed alongside Chest, Ribs, Upper back, Neck, Shoulder, Stress, Posture/Alignment, Sleep, Musculoskeletal and Circulation. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","sighing-or-yawning-often"]]'::jsonb,
  '[["body_area","chest"],["body_area","ribs"],["body_area","upper_back"],["body_area","neck"],["body_area","shoulder"],["category","stress"],["category","posture_alignment"],["category","sleep"],["category","musculoskeletal"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask when sighing or yawning often began, how often it happens now, and what she has already tried.',
    'Ask whether she breathes through her nose at rest, and where she feels the breath move.',
    'Review Chest alongside this, and note what is already on her timeline there.',
    'Review Ribs alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-skin-breakouts',
  'Skin breakouts, whole-body areas worth reviewing',
  'chek_hlc',
  'Where skin breakouts is reported, this coaching framework treats Skin, Abdomen, Digestion, Clearance/Detox, Hormonal, Immune, Stress and Nutrition/Fuel as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","skin-breakouts"]]'::jsonb,
  '[["body_area","skin"],["body_area","abdomen"],["category","digestion"],["category","clearance_detox"],["category","hormonal"],["category","immune"],["category","stress"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-liver",40]]'::jsonb,
  array[
    'Ask when skin breakouts began, how often it happens now, and what she has already tried.',
    'Ask where it appears, whether it moves, and whether it follows food, stress or the cycle.',
    'Review Skin alongside this, and note what is already on her timeline there.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-skin-flare-ups',
  'Skin flare-ups, whole-body areas worth reviewing',
  'chek_hlc',
  'Skin flare-ups and Skin, Abdomen, Digestion, Clearance/Detox, Hormonal, Immune, Stress and Nutrition/Fuel are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","skin-flare-ups"]]'::jsonb,
  '[["body_area","skin"],["body_area","abdomen"],["category","digestion"],["category","clearance_detox"],["category","hormonal"],["category","immune"],["category","stress"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-liver",40]]'::jsonb,
  array[
    'Ask when skin flare-ups began, how often it happens now, and what she has already tried.',
    'Ask where it appears, whether it moves, and whether it follows food, stress or the cycle.',
    'Review Skin alongside this, and note what is already on her timeline there.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-skin-itching',
  'Skin itching, whole-body areas worth reviewing',
  'chek_hlc',
  'Skin itching is observed alongside Skin, Abdomen, Digestion, Clearance/Detox, Hormonal, Immune, Stress and Nutrition/Fuel in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","skin-itching"]]'::jsonb,
  '[["body_area","skin"],["body_area","abdomen"],["category","digestion"],["category","clearance_detox"],["category","hormonal"],["category","immune"],["category","stress"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-liver",40]]'::jsonb,
  array[
    'Ask when skin itching began, how often it happens now, and what she has already tried.',
    'Ask where it appears, whether it moves, and whether it follows food, stress or the cycle.',
    'Review Skin alongside this, and note what is already on her timeline there.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-skin-or-hair-changes',
  'Skin or hair changes, whole-body areas worth reviewing',
  'chek_hlc',
  'Skin or hair changes is often observed alongside Skin, Abdomen, Sleep, Stress, Metabolic, Digestion, Mood and Clearance/Detox. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","skin-or-hair-changes"]]'::jsonb,
  '[["body_area","skin"],["body_area","abdomen"],["category","sleep"],["category","stress"],["category","metabolic"],["category","digestion"],["category","mood"],["category","clearance_detox"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when skin or hair changes began, how often it happens now, and what she has already tried.',
    'Ask whether it follows a monthly rhythm, and where she is in her cycle or transition.',
    'Review Skin alongside this, and note what is already on her timeline there.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-skin-rash',
  'Skin rash, whole-body areas worth reviewing',
  'chek_hlc',
  'Where skin rash is reported, this coaching framework treats Skin, Abdomen, Digestion, Clearance/Detox, Hormonal, Immune, Stress and Nutrition/Fuel as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","skin-rash"]]'::jsonb,
  '[["body_area","skin"],["body_area","abdomen"],["category","digestion"],["category","clearance_detox"],["category","hormonal"],["category","immune"],["category","stress"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-liver",40]]'::jsonb,
  array[
    'Ask when skin rash began, how often it happens now, and what she has already tried.',
    'Ask where it appears, whether it moves, and whether it follows food, stress or the cycle.',
    'Review Skin alongside this, and note what is already on her timeline there.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-skipping-meals',
  'Skipping meals, whole-body areas worth reviewing',
  'lifestyle',
  'Skipping meals and Digestion, Metabolic, Energy, Mood, Sleep and Hormonal are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","skipping-meals"]]'::jsonb,
  '[["category","digestion"],["category","metabolic"],["category","energy"],["category","mood"],["category","sleep"],["category","hormonal"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when skipping meals began, how often it happens now, and what she has already tried.',
    'Ask what a normal day of eating looks like, including timing and what she drinks.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Review Energy alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-sleep-disruption-around-cycle',
  'Sleep disruption around the cycle, whole-body areas worth reviewing',
  'lifestyle',
  'Sleep disruption around the cycle is observed alongside Stress, Hormonal, Metabolic, Kidney/Bladder, Breathing/Respiratory and Mood in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","sleep-disruption-around-cycle"]]'::jsonb,
  '[["category","stress"],["category","hormonal"],["category","metabolic"],["category","kidney_bladder"],["category","respiratory"],["category","mood"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-hormonal",40]]'::jsonb,
  array[
    'Ask when sleep disruption around the cycle began, how often it happens now, and what she has already tried.',
    'Ask about the hour before bed, and what time she is actually asleep rather than in bed.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Hormonal alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-sleepy-after-eating',
  'Sleepy after eating, whole-body areas worth reviewing',
  'chek_hlc',
  'Sleepy after eating is often observed alongside Nutrition/Fuel, Digestion, Energy, Sleep, Stress and Hormonal. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","sleepy-after-eating"]]'::jsonb,
  '[["category","nutrition"],["category","digestion"],["category","energy"],["category","sleep"],["category","stress"],["category","hormonal"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when sleepy after eating began, how often it happens now, and what she has already tried.',
    'Ask how long she goes between meals, and what happens when a meal is late.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Review Energy alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-slow-recovery-after-demanding-days',
  'Slow recovery after a demanding day, whole-body areas worth reviewing',
  'lifestyle',
  'Where slow recovery after a demanding day is reported, this coaching framework treats Sleep, Metabolic, Nutrition/Fuel, Stress, Immune and Circulation as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","slow-recovery-after-demanding-days"]]'::jsonb,
  '[["category","sleep"],["category","metabolic"],["category","nutrition"],["category","stress"],["category","immune"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-blood-sugar",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when slow recovery after a demanding day began, how often it happens now, and what she has already tried.',
    'Ask what her energy does hour by hour, and what is different on the better days.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-slow-recovery-from-illness',
  'Slow recovery from illness, whole-body areas worth reviewing',
  'chek_hlc',
  'Slow recovery from illness and Digestion, Sleep, Stress, Nutrition/Fuel, Clearance/Detox and Energy are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","slow-recovery-from-illness"]]'::jsonb,
  '[["category","digestion"],["category","sleep"],["category","stress"],["category","nutrition"],["category","clearance_detox"],["category","energy"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when slow recovery from illness began, how often it happens now, and what she has already tried.',
    'Ask how often this has happened in the last six months and how long each episode ran.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-slow-warm-up',
  'Slow to warm up in movement, whole-body areas worth reviewing',
  'biomechanics',
  'Slow to warm up in movement is observed alongside Posture/Alignment, Breathing/Respiratory, Stress, Sleep, Nutrition/Fuel and Joint/Movement in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","slow-warm-up"]]'::jsonb,
  '[["category","posture_alignment"],["category","respiratory"],["category","stress"],["category","sleep"],["category","nutrition"],["category","joint_movement"]]'::jsonb,
  '[["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when slow to warm up in movement began, how often it happens now, and what she has already tried.',
    'Ask what changed in training, work or sleep around the time this started.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Breathing/Respiratory alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-slow-wound-healing',
  'Slow wound healing, whole-body areas worth reviewing',
  'chek_hlc',
  'Slow wound healing is often observed alongside Skin, Abdomen, Digestion, Sleep, Stress, Nutrition/Fuel, Clearance/Detox and Energy. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","slow-wound-healing"]]'::jsonb,
  '[["body_area","skin"],["body_area","abdomen"],["category","digestion"],["category","sleep"],["category","stress"],["category","nutrition"],["category","clearance_detox"],["category","energy"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when slow wound healing began, how often it happens now, and what she has already tried.',
    'Ask how often this has happened in the last six months and how long each episode ran.',
    'Review Skin alongside this, and note what is already on her timeline there.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-small-stresses-feel-harder',
  'Small stresses feeling harder to handle, whole-body areas worth reviewing',
  'chek_hlc',
  'Where small stresses feeling harder to handle is reported, this coaching framework treats Sleep, Breathing/Respiratory, Digestion, Energy, Mood and Musculoskeletal as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","small-stresses-feel-harder"]]'::jsonb,
  '[["category","sleep"],["category","respiratory"],["category","digestion"],["category","energy"],["category","mood"],["category","musculoskeletal"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask when small stresses feeling harder to handle began, how often it happens now, and what she has already tried.',
    'Ask what the last two weeks have actually been like, and where she feels it first.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Breathing/Respiratory alongside this, and note what is already on her timeline there.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-startles-easily',
  'Startles easily, whole-body areas worth reviewing',
  'chek_hlc',
  'Startles easily and Sleep, Breathing/Respiratory, Digestion, Energy, Mood and Musculoskeletal are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","startles-easily"]]'::jsonb,
  '[["category","sleep"],["category","respiratory"],["category","digestion"],["category","energy"],["category","mood"],["category","musculoskeletal"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask when startles easily began, how often it happens now, and what she has already tried.',
    'Ask what the last two weeks have actually been like, and where she feels it first.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Breathing/Respiratory alongside this, and note what is already on her timeline there.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-stiff-fingers-or-arms',
  'Stiff fingers or arms, whole-body areas worth reviewing',
  'biomechanics',
  'Stiff fingers or arms is observed alongside Arm, Shoulder, Elbow, Wrist, Neck, Posture/Alignment, Breathing/Respiratory, Stress, Sleep and Nutrition/Fuel in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","stiff-fingers-or-arms"]]'::jsonb,
  '[["body_area","arm"],["body_area","shoulder"],["body_area","elbow"],["body_area","wrist"],["body_area","neck"],["category","posture_alignment"],["category","respiratory"],["category","stress"],["category","sleep"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when stiff fingers or arms began, how often it happens now, and what she has already tried.',
    'Ask what changed in training, work or sleep around the time this started.',
    'Review Arm alongside this, and note what is already on her timeline there.',
    'Review Shoulder alongside this, and note what is already on her timeline there.',
    'Review Elbow alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-stomach-pain-or-cramping',
  'Stomach pain or cramping, whole-body areas worth reviewing',
  'chek_hlc',
  'Stomach pain or cramping is often observed alongside Abdomen, Low back, Mid back, Pelvis, Ribs, Nutrition/Fuel, Clearance/Detox, Stress, Sleep and Skin/Immune. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","stomach-pain-or-cramping"]]'::jsonb,
  '[["body_area","abdomen"],["body_area","low_back"],["body_area","mid_back"],["body_area","pelvis"],["body_area","ribs"],["category","nutrition"],["category","clearance_detox"],["category","stress"],["category","sleep"],["category","skin_immune"]]'::jsonb,
  '[["signal","bss-system-liver",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when stomach pain or cramping began, how often it happens now, and what she has already tried.',
    'Ask what she notices after meals, how soon after, and whether any food reliably makes a difference.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Mid back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-straining-with-stools',
  'Straining with stools, whole-body areas worth reviewing',
  'chek_hlc',
  'Where straining with stools is reported, this coaching framework treats Abdomen, Low back, Mid back, Pelvis, Ribs, Nutrition/Fuel, Clearance/Detox, Stress, Sleep and Skin/Immune as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","straining-with-stools"]]'::jsonb,
  '[["body_area","abdomen"],["body_area","low_back"],["body_area","mid_back"],["body_area","pelvis"],["body_area","ribs"],["category","nutrition"],["category","clearance_detox"],["category","stress"],["category","sleep"],["category","skin_immune"]]'::jsonb,
  '[["signal","bss-system-liver",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when straining with stools began, how often it happens now, and what she has already tried.',
    'Ask what she notices after meals, how soon after, and whether any food reliably makes a difference.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Mid back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-strong-reaction-to-caffeine-or-medication',
  'Strong reaction to caffeine or medication, whole-body areas worth reviewing',
  'chek_hlc',
  'Strong reaction to caffeine or medication and Digestion, Kidney/Bladder, Skin/Immune, Hormonal, Nutrition/Fuel and Sleep are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","strong-reaction-to-caffeine-or-medication"]]'::jsonb,
  '[["category","digestion"],["category","kidney_bladder"],["category","skin_immune"],["category","hormonal"],["category","nutrition"],["category","sleep"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-kidney",40]]'::jsonb,
  array[
    'Ask when strong reaction to caffeine or medication began, how often it happens now, and what she has already tried.',
    'Ask about bowel rhythm, sweating and fluid, which is how this framework reads clearance.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Review Kidney/Bladder alongside this, and note what is already on her timeline there.',
    'Review Skin/Immune alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-sudden-urge-to-urinate',
  'Sudden urge to urinate, whole-body areas worth reviewing',
  'chek_hlc',
  'Sudden urge to urinate is observed alongside Hormonal, Sleep, Nutrition/Fuel, Stress and Circulation in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","sudden-urge-to-urinate"]]'::jsonb,
  '[["category","hormonal"],["category","sleep"],["category","nutrition"],["category","stress"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-hormonal",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when sudden urge to urinate began, how often it happens now, and what she has already tried.',
    'Ask about fluid across the day, and about caffeine and alcohol in particular.',
    'Review Hormonal alongside this, and note what is already on her timeline there.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-swollen-or-tender-glands',
  'Swollen or tender glands, whole-body areas worth reviewing',
  'chek_hlc',
  'Swollen or tender glands is often observed alongside Neck, Upper back, Shoulder, Jaw, Head, Digestion, Sleep, Stress, Nutrition/Fuel and Clearance/Detox. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","swollen-or-tender-glands"]]'::jsonb,
  '[["body_area","neck"],["body_area","upper_back"],["body_area","shoulder"],["body_area","jaw"],["body_area","head"],["category","digestion"],["category","sleep"],["category","stress"],["category","nutrition"],["category","clearance_detox"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when swollen or tender glands began, how often it happens now, and what she has already tried.',
    'Ask how often this has happened in the last six months and how long each episode ran.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Review Shoulder alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-tearfulness',
  'Tearfulness, whole-body areas worth reviewing',
  'lifestyle',
  'Where tearfulness is reported, this coaching framework treats Sleep, Stress, Nutrition/Fuel, Metabolic, Hormonal and Energy as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","tearfulness"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","nutrition"],["category","metabolic"],["category","hormonal"],["category","energy"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when tearfulness began, how often it happens now, and what she has already tried.',
    'Ask how long it has been like this, and what is already helping even a little.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-throbbing-pain',
  'Throbbing pain, whole-body areas worth reviewing',
  'chek_hlc',
  'Throbbing pain and Sleep, Stress, Musculoskeletal, Posture/Alignment and Nutrition/Fuel are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","throbbing-pain"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","musculoskeletal"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask when throbbing pain began, how often it happens now, and what she has already tried.',
    'Ask her to describe the sensation in her own words, and what makes it better or worse.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Musculoskeletal alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-tightness-around-the-mouth',
  'Tightness around the mouth, whole-body areas worth reviewing',
  'referred_pain',
  'Tightness around the mouth is observed alongside Jaw, Neck, Head, Upper back, Sleep, Stress, Metabolic, Circulation, Posture/Alignment and Nutrition/Fuel in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","tightness-around-the-mouth"]]'::jsonb,
  '[["body_area","jaw"],["body_area","neck"],["body_area","head"],["body_area","upper_back"],["category","sleep"],["category","stress"],["category","metabolic"],["category","circulation"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when tightness around the mouth began, how often it happens now, and what she has already tried.',
    'Ask exactly what the sensation is in her own words, where it starts and whether it travels.',
    'Review Jaw alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Head alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-tingling',
  'Tingling, whole-body areas worth reviewing',
  'referred_pain',
  'Tingling is often observed alongside Sleep, Stress, Metabolic, Circulation, Posture/Alignment and Nutrition/Fuel. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","tingling"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","metabolic"],["category","circulation"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when tingling began, how often it happens now, and what she has already tried.',
    'Ask exactly what the sensation is in her own words, where it starts and whether it travels.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-tingling-fingers',
  'Tingling fingers, whole-body areas worth reviewing',
  'referred_pain',
  'Where tingling fingers is reported, this coaching framework treats Hand, Wrist, Elbow, Neck, Sleep, Stress, Metabolic, Circulation, Posture/Alignment and Nutrition/Fuel as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","tingling-fingers"]]'::jsonb,
  '[["body_area","hand"],["body_area","wrist"],["body_area","elbow"],["body_area","neck"],["category","sleep"],["category","stress"],["category","metabolic"],["category","circulation"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when tingling fingers began, how often it happens now, and what she has already tried.',
    'Ask exactly what the sensation is in her own words, where it starts and whether it travels.',
    'Review Hand alongside this, and note what is already on her timeline there.',
    'Review Wrist alongside this, and note what is already on her timeline there.',
    'Review Elbow alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-tingling-or-numbness-in-hands-or-feet',
  'Tingling or numbness in hands or feet, whole-body areas worth reviewing',
  'referred_pain',
  'Tingling or numbness in hands or feet and Hand, Wrist, Elbow, Neck, Sleep, Stress, Metabolic, Circulation, Posture/Alignment and Nutrition/Fuel are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","tingling-or-numbness-in-hands-or-feet"]]'::jsonb,
  '[["body_area","hand"],["body_area","wrist"],["body_area","elbow"],["body_area","neck"],["category","sleep"],["category","stress"],["category","metabolic"],["category","circulation"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when tingling or numbness in hands or feet began, how often it happens now, and what she has already tried.',
    'Ask exactly what the sensation is in her own words, where it starts and whether it travels.',
    'Review Hand alongside this, and note what is already on her timeline there.',
    'Review Wrist alongside this, and note what is already on her timeline there.',
    'Review Elbow alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-tired-after-a-full-meal',
  'Tired after a full meal, whole-body areas worth reviewing',
  'lifestyle',
  'Tired after a full meal is observed alongside Sleep, Metabolic, Nutrition/Fuel, Stress, Immune and Circulation in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","tired-after-a-full-meal"]]'::jsonb,
  '[["category","sleep"],["category","metabolic"],["category","nutrition"],["category","stress"],["category","immune"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-blood-sugar",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when tired after a full meal began, how often it happens now, and what she has already tried.',
    'Ask what her energy does hour by hour, and what is different on the better days.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-trigger-point-tenderness',
  'Tender spot in a muscle, whole-body areas worth reviewing',
  'biomechanics',
  'Tender spot in a muscle is often observed alongside Posture/Alignment, Breathing/Respiratory, Stress, Sleep, Nutrition/Fuel and Joint/Movement. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","trigger-point-tenderness"]]'::jsonb,
  '[["category","posture_alignment"],["category","respiratory"],["category","stress"],["category","sleep"],["category","nutrition"],["category","joint_movement"]]'::jsonb,
  '[["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when tender spot in a muscle began, how often it happens now, and what she has already tried.',
    'Ask what changed in training, work or sleep around the time this started.',
    'Review Posture/Alignment alongside this, and note what is already on her timeline there.',
    'Review Breathing/Respiratory alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-trouble-concentrating',
  'Trouble concentrating, whole-body areas worth reviewing',
  'referred_pain',
  'Where trouble concentrating is reported, this coaching framework treats Sleep, Stress, Metabolic, Circulation, Posture/Alignment and Nutrition/Fuel as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","trouble-concentrating"]]'::jsonb,
  '[["category","sleep"],["category","stress"],["category","metabolic"],["category","circulation"],["category","posture_alignment"],["category","nutrition"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when trouble concentrating began, how often it happens now, and what she has already tried.',
    'Ask exactly what the sensation is in her own words, where it starts and whether it travels.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-trouble-falling-asleep',
  'Trouble falling asleep, whole-body areas worth reviewing',
  'lifestyle',
  'Trouble falling asleep and Stress, Hormonal, Metabolic, Kidney/Bladder, Breathing/Respiratory and Mood are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","trouble-falling-asleep"]]'::jsonb,
  '[["category","stress"],["category","hormonal"],["category","metabolic"],["category","kidney_bladder"],["category","respiratory"],["category","mood"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-hormonal",40]]'::jsonb,
  array[
    'Ask when trouble falling asleep began, how often it happens now, and what she has already tried.',
    'Ask about the hour before bed, and what time she is actually asleep rather than in bed.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Hormonal alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-unable-to-breathe-deeply',
  'Unable to breathe deeply, whole-body areas worth reviewing',
  'chek_hlc',
  'Unable to breathe deeply is observed alongside Chest, Ribs, Upper back, Neck, Shoulder, Stress, Posture/Alignment, Sleep, Musculoskeletal and Circulation in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","unable-to-breathe-deeply"]]'::jsonb,
  '[["body_area","chest"],["body_area","ribs"],["body_area","upper_back"],["body_area","neck"],["body_area","shoulder"],["category","stress"],["category","posture_alignment"],["category","sleep"],["category","musculoskeletal"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask when unable to breathe deeply began, how often it happens now, and what she has already tried.',
    'Ask whether she breathes through her nose at rest, and where she feels the breath move.',
    'Review Chest alongside this, and note what is already on her timeline there.',
    'Review Ribs alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-under-eye-puffiness',
  'Under-eye puffiness in the morning, whole-body areas worth reviewing',
  'chek_hlc',
  'Under-eye puffiness in the morning is often observed alongside Eyes, Head, Neck, Hormonal, Sleep, Nutrition/Fuel, Stress and Circulation. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","under-eye-puffiness"]]'::jsonb,
  '[["body_area","eyes"],["body_area","head"],["body_area","neck"],["category","hormonal"],["category","sleep"],["category","nutrition"],["category","stress"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-hormonal",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when under-eye puffiness in the morning began, how often it happens now, and what she has already tried.',
    'Ask about fluid across the day, and about caffeine and alcohol in particular.',
    'Review Eyes alongside this, and note what is already on her timeline there.',
    'Review Head alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-undigested-food-in-stool',
  'Undigested food in stool, whole-body areas worth reviewing',
  'chek_hlc',
  'Where undigested food in stool is reported, this coaching framework treats Abdomen, Low back, Mid back, Pelvis, Ribs, Nutrition/Fuel, Clearance/Detox, Stress, Sleep and Skin/Immune as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","undigested-food-in-stool"]]'::jsonb,
  '[["body_area","abdomen"],["body_area","low_back"],["body_area","mid_back"],["body_area","pelvis"],["body_area","ribs"],["category","nutrition"],["category","clearance_detox"],["category","stress"],["category","sleep"],["category","skin_immune"]]'::jsonb,
  '[["signal","bss-system-liver",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when undigested food in stool began, how often it happens now, and what she has already tried.',
    'Ask what she notices after meals, how soon after, and whether any food reliably makes a difference.',
    'Review Abdomen alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Mid back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-unexplained-weight-change',
  'Unexplained weight change, whole-body areas worth reviewing',
  'chek_hlc',
  'Unexplained weight change and Nutrition/Fuel, Digestion, Energy, Sleep, Stress and Hormonal are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","unexplained-weight-change"]]'::jsonb,
  '[["category","nutrition"],["category","digestion"],["category","energy"],["category","sleep"],["category","stress"],["category","hormonal"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when unexplained weight change began, how often it happens now, and what she has already tried.',
    'Ask how long she goes between meals, and what happens when a meal is late.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Review Energy alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-unwell-after-alcohol',
  'Feeling unwell after small amounts of alcohol, whole-body areas worth reviewing',
  'chek_hlc',
  'Feeling unwell after small amounts of alcohol is observed alongside Digestion, Kidney/Bladder, Skin/Immune, Hormonal, Nutrition/Fuel and Sleep in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","unwell-after-alcohol"]]'::jsonb,
  '[["category","digestion"],["category","kidney_bladder"],["category","skin_immune"],["category","hormonal"],["category","nutrition"],["category","sleep"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-kidney",40]]'::jsonb,
  array[
    'Ask when feeling unwell after small amounts of alcohol began, how often it happens now, and what she has already tried.',
    'Ask about bowel rhythm, sweating and fluid, which is how this framework reads clearance.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Review Kidney/Bladder alongside this, and note what is already on her timeline there.',
    'Review Skin/Immune alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-unwell-after-greasy-food',
  'Feeling unwell after greasy or fried food, whole-body areas worth reviewing',
  'chek_hlc',
  'Feeling unwell after greasy or fried food is often observed alongside Digestion, Kidney/Bladder, Skin/Immune, Hormonal, Nutrition/Fuel and Sleep. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","unwell-after-greasy-food"]]'::jsonb,
  '[["category","digestion"],["category","kidney_bladder"],["category","skin_immune"],["category","hormonal"],["category","nutrition"],["category","sleep"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-kidney",40]]'::jsonb,
  array[
    'Ask when feeling unwell after greasy or fried food began, how often it happens now, and what she has already tried.',
    'Ask about bowel rhythm, sweating and fluid, which is how this framework reads clearance.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Review Kidney/Bladder alongside this, and note what is already on her timeline there.',
    'Review Skin/Immune alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-urine-leaking-with-effort',
  'Urine leaking with a cough or sneeze, whole-body areas worth reviewing',
  'chek_hlc',
  'Where urine leaking with a cough or sneeze is reported, this coaching framework treats Pelvis, Low back, Sacroiliac joint, Hip, Groin, Hormonal, Sleep, Nutrition/Fuel, Stress and Circulation as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","urine-leaking-with-effort"]]'::jsonb,
  '[["body_area","pelvis"],["body_area","low_back"],["body_area","si_joint"],["body_area","hip"],["body_area","groin"],["category","hormonal"],["category","sleep"],["category","nutrition"],["category","stress"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-hormonal",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when urine leaking with a cough or sneeze began, how often it happens now, and what she has already tried.',
    'Ask about fluid across the day, and about caffeine and alcohol in particular.',
    'Review Pelvis alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Sacroiliac joint alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-waking-at-night-to-urinate',
  'Waking at night to urinate, whole-body areas worth reviewing',
  'chek_hlc',
  'Waking at night to urinate and Hormonal, Sleep, Nutrition/Fuel, Stress and Circulation are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","waking-at-night-to-urinate"]]'::jsonb,
  '[["category","hormonal"],["category","sleep"],["category","nutrition"],["category","stress"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-hormonal",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when waking at night to urinate began, how often it happens now, and what she has already tried.',
    'Ask about fluid across the day, and about caffeine and alcohol in particular.',
    'Review Hormonal alongside this, and note what is already on her timeline there.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-waking-between-1-and-3-am',
  'Waking between 1 and 3 AM, whole-body areas worth reviewing',
  'lifestyle',
  'Waking between 1 and 3 AM is observed alongside Stress, Hormonal, Metabolic, Kidney/Bladder, Breathing/Respiratory and Mood in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","waking-between-1-and-3-am"]]'::jsonb,
  '[["category","stress"],["category","hormonal"],["category","metabolic"],["category","kidney_bladder"],["category","respiratory"],["category","mood"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-hormonal",40]]'::jsonb,
  array[
    'Ask when waking between 1 and 3 AM began, how often it happens now, and what she has already tried.',
    'Ask about the hour before bed, and what time she is actually asleep rather than in bed.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Hormonal alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-waking-early-unable-to-return',
  'Waking early and unable to return to sleep, whole-body areas worth reviewing',
  'lifestyle',
  'Waking early and unable to return to sleep is often observed alongside Stress, Hormonal, Metabolic, Kidney/Bladder, Breathing/Respiratory and Mood. This is a possible association worth exploring, not an established medical finding.',
  '[["signal","waking-early-unable-to-return"]]'::jsonb,
  '[["category","stress"],["category","hormonal"],["category","metabolic"],["category","kidney_bladder"],["category","respiratory"],["category","mood"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-hormonal",40]]'::jsonb,
  array[
    'Ask when waking early and unable to return to sleep began, how often it happens now, and what she has already tried.',
    'Ask about the hour before bed, and what time she is actually asleep rather than in bed.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Hormonal alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-waking-hungry-or-restless',
  'Waking at night hungry or restless, whole-body areas worth reviewing',
  'lifestyle',
  'Where waking at night hungry or restless is reported, this coaching framework treats Stress, Hormonal, Metabolic, Kidney/Bladder, Breathing/Respiratory and Mood as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["signal","waking-hungry-or-restless"]]'::jsonb,
  '[["category","stress"],["category","hormonal"],["category","metabolic"],["category","kidney_bladder"],["category","respiratory"],["category","mood"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-hormonal",40]]'::jsonb,
  array[
    'Ask when waking at night hungry or restless began, how often it happens now, and what she has already tried.',
    'Ask about the hour before bed, and what time she is actually asleep rather than in bed.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Hormonal alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-waking-tired-after-full-sleep',
  'Waking tired after a full night of sleep, whole-body areas worth reviewing',
  'lifestyle',
  'Waking tired after a full night of sleep and Sleep, Metabolic, Nutrition/Fuel, Stress, Immune and Circulation are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["signal","waking-tired-after-full-sleep"]]'::jsonb,
  '[["category","sleep"],["category","metabolic"],["category","nutrition"],["category","stress"],["category","immune"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-blood-sugar",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask when waking tired after a full night of sleep began, how often it happens now, and what she has already tried.',
    'Ask what her energy does hour by hour, and what is different on the better days.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Metabolic alongside this, and note what is already on her timeline there.',
    'Review Nutrition/Fuel alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-signal-wired-and-tired',
  'Wired and tired at the same time, whole-body areas worth reviewing',
  'chek_hlc',
  'Wired and tired at the same time is observed alongside Sleep, Breathing/Respiratory, Digestion, Energy, Mood and Musculoskeletal in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["signal","wired-and-tired"]]'::jsonb,
  '[["category","sleep"],["category","respiratory"],["category","digestion"],["category","energy"],["category","mood"],["category","musculoskeletal"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask when wired and tired at the same time began, how often it happens now, and what she has already tried.',
    'Ask what the last two weeks have actually been like, and where she feels it first.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Review Breathing/Respiratory alongside this, and note what is already on her timeline there.',
    'Review Digestion alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

drop function pg_temp.seed_map_entry(text, text, text, text, jsonb, jsonb, jsonb, text[]);
