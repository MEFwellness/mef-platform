-- THE WHOLE-BODY ASSOCIATION MAP, PART 1 OF 4: STRUCTURE.
--
-- Every body area the eighteen starter entries did not already own, so
-- that every major joint and every major muscle region has an entry of
-- its own rather than falling through to one wide musculoskeletal card.
-- The eleven areas the starters DO own (hip, pelvis, low back, shoulder,
-- arm, neck, knee, ankle, foot, skin and abdomen) are deliberately not
-- seeded again here: two entries about one complaint is two cards a
-- coach has to reconcile.
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
  'map-area-jaw',
  'Jaw signals, whole-body areas worth reviewing',
  'referred_pain',
  'A signal reported at the jaw is observed alongside Neck, Head, Upper back, Stress, Sleep, Posture/Alignment, Digestion and Breathing/Respiratory in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["body_area","jaw"]]'::jsonb,
  '[["body_area","neck"],["body_area","head"],["body_area","upper_back"],["category","stress"],["category","sleep"],["category","posture_alignment"],["category","digestion"],["category","respiratory"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-digestion",40]]'::jsonb,
  array[
    'Ask whether she notices clenching or grinding, in the day or overnight.',
    'Ask about dental work, mouthguards and any change in chewing on one side.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Head alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-area-head',
  'Head signals, whole-body areas worth reviewing',
  'chek_hlc',
  'A signal reported at the head is often observed alongside Neck, Jaw, Eyes, Sleep, Stress, Breathing/Respiratory, Metabolic, Hormonal, Digestion and Kidney/Bladder. This is a possible association worth exploring, not an established medical finding.',
  '[["body_area","head"]]'::jsonb,
  '[["body_area","neck"],["body_area","jaw"],["body_area","eyes"],["category","sleep"],["category","stress"],["category","respiratory"],["category","metabolic"],["category","hormonal"],["category","digestion"],["category","kidney_bladder"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-blood-sugar",40]]'::jsonb,
  array[
    'Ask when it began, how long it lasts, and what she has already tried.',
    'Ask about screen hours, fluid intake and meal spacing on the days it happens.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Jaw alongside this, and note what is already on her timeline there.',
    'Review Eyes alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-area-upper-back',
  'Upper back signals, whole-body areas worth reviewing',
  'biomechanics',
  'Where a signal reported at the upper back is reported, this coaching framework treats Neck, Shoulder, Ribs, Chest, Breathing/Respiratory, Posture/Alignment, Stress, Digestion and Circulation as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["body_area","upper_back"]]'::jsonb,
  '[["body_area","neck"],["body_area","shoulder"],["body_area","ribs"],["body_area","chest"],["category","respiratory"],["category","posture_alignment"],["category","stress"],["category","digestion"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-digestion",40]]'::jsonb,
  array[
    'Ask how many hours a day she spends at a desk or on a phone.',
    'Ask whether it eases with movement or builds through the day.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Shoulder alongside this, and note what is already on her timeline there.',
    'Review Ribs alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-area-mid-back',
  'Mid back signals, whole-body areas worth reviewing',
  'chek_hlc',
  'A signal reported at the mid back and Ribs, Upper back, Low back, Abdomen, Breathing/Respiratory, Digestion, Clearance/Detox, Posture/Alignment and Stress are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["body_area","mid_back"]]'::jsonb,
  '[["body_area","ribs"],["body_area","upper_back"],["body_area","low_back"],["body_area","abdomen"],["category","respiratory"],["category","digestion"],["category","clearance_detox"],["category","posture_alignment"],["category","stress"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-liver",40]]'::jsonb,
  array[
    'Ask whether it changes after meals or with deep breathing.',
    'Ask whether it sits to one side or across the middle.',
    'Review Ribs alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-area-si-joint',
  'Sacroiliac joint signals, whole-body areas worth reviewing',
  'biomechanics',
  'A signal reported at the sacroiliac joint is observed alongside Pelvis, Low back, Hip, Glutes, Kidney/Bladder, Hormonal, Posture/Alignment, Musculoskeletal and Stress in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["body_area","si_joint"]]'::jsonb,
  '[["body_area","pelvis"],["body_area","low_back"],["body_area","hip"],["body_area","glute"],["category","kidney_bladder"],["category","hormonal"],["category","posture_alignment"],["category","musculoskeletal"],["category","stress"]]'::jsonb,
  '[["signal","bss-system-kidney",40],["signal","bss-system-hormonal",40]]'::jsonb,
  array[
    'Ask whether it changes with single leg standing, stairs or rolling over in bed.',
    'Ask about pregnancy, childbirth and any change in training load.',
    'Review Pelvis alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Review Hip alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-area-ribs',
  'Ribs signals, whole-body areas worth reviewing',
  'chek_hlc',
  'A signal reported at the ribs is often observed alongside Mid back, Upper back, Chest, Breathing/Respiratory, Digestion, Posture/Alignment, Stress and Clearance/Detox. This is a possible association worth exploring, not an established medical finding.',
  '[["body_area","ribs"]]'::jsonb,
  '[["body_area","mid_back"],["body_area","upper_back"],["body_area","chest"],["category","respiratory"],["category","digestion"],["category","posture_alignment"],["category","stress"],["category","clearance_detox"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask whether it changes with a full breath, a cough or a twist.',
    'Ask whether it follows meals or a particular position.',
    'Review Mid back alongside this, and note what is already on her timeline there.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Review Chest alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-area-chest',
  'Chest signals, whole-body areas worth reviewing',
  'referred_pain',
  'Where a signal reported at the chest is reported, this coaching framework treats Upper back, Ribs, Neck, Shoulder, Breathing/Respiratory, Circulation, Stress, Digestion and Posture/Alignment as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["body_area","chest"]]'::jsonb,
  '[["body_area","upper_back"],["body_area","ribs"],["body_area","neck"],["body_area","shoulder"],["category","respiratory"],["category","circulation"],["category","stress"],["category","digestion"],["category","posture_alignment"]]'::jsonb,
  '[["signal","bss-system-heart",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask what she was doing when it came on, and how long it lasted.',
    'Ask whether it changes with position, with breathing or with effort.',
    'Review Upper back alongside this, and note what is already on her timeline there.',
    'Review Ribs alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-area-elbow',
  'Elbow signals, whole-body areas worth reviewing',
  'biomechanics',
  'A signal reported at the elbow and Shoulder, Neck, Wrist, Hand, Posture/Alignment, Musculoskeletal, Circulation, Neurological and Joint/Movement are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["body_area","elbow"]]'::jsonb,
  '[["body_area","shoulder"],["body_area","neck"],["body_area","wrist"],["body_area","hand"],["category","posture_alignment"],["category","musculoskeletal"],["category","circulation"],["category","neurological"],["category","joint_movement"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-heart",40]]'::jsonb,
  array[
    'Ask about grip, carrying, keyboard and any repeated movement at work.',
    'Ask whether the sensation travels toward the hand or toward the shoulder.',
    'Review Shoulder alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Wrist alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-area-wrist',
  'Wrist signals, whole-body areas worth reviewing',
  'referred_pain',
  'A signal reported at the wrist is observed alongside Hand, Elbow, Shoulder, Neck, Neurological, Posture/Alignment, Circulation, Immune and Hormonal in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["body_area","wrist"]]'::jsonb,
  '[["body_area","hand"],["body_area","elbow"],["body_area","shoulder"],["body_area","neck"],["category","neurological"],["category","posture_alignment"],["category","circulation"],["category","immune"],["category","hormonal"]]'::jsonb,
  '[["signal","bss-system-brain",40],["signal","bss-system-heart",40]]'::jsonb,
  array[
    'Ask whether it is worse overnight or on waking.',
    'Ask about typing, lifting and any repeated wrist position.',
    'Review Hand alongside this, and note what is already on her timeline there.',
    'Review Elbow alongside this, and note what is already on her timeline there.',
    'Review Shoulder alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-area-hand',
  'Hand signals, whole-body areas worth reviewing',
  'referred_pain',
  'A signal reported at the hand is often observed alongside Wrist, Elbow, Neck, Neurological, Circulation, Immune, Hormonal and Metabolic. This is a possible association worth exploring, not an established medical finding.',
  '[["body_area","hand"]]'::jsonb,
  '[["body_area","wrist"],["body_area","elbow"],["body_area","neck"],["category","neurological"],["category","circulation"],["category","immune"],["category","hormonal"],["category","metabolic"]]'::jsonb,
  '[["signal","bss-system-brain",40],["signal","bss-system-heart",40]]'::jsonb,
  array[
    'Ask whether both hands are involved or only one.',
    'Ask whether the sensation is numbness, tingling, weakness or pain, in her own words.',
    'Review Wrist alongside this, and note what is already on her timeline there.',
    'Review Elbow alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-area-eyes',
  'Eyes signals, whole-body areas worth reviewing',
  'chek_hlc',
  'Where a signal reported at the eyes is reported, this coaching framework treats Head, Neck, Sleep, Stress, Neurological, Circulation, Clearance/Detox and Kidney/Bladder as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["body_area","eyes"]]'::jsonb,
  '[["body_area","head"],["body_area","neck"],["category","sleep"],["category","stress"],["category","neurological"],["category","circulation"],["category","clearance_detox"],["category","kidney_bladder"]]'::jsonb,
  '[["signal","bss-system-adrenals",40],["signal","bss-system-brain",40]]'::jsonb,
  array[
    'Ask about screen hours and whether she has had a recent eye test.',
    'Ask whether it is worse at the end of the day.',
    'Review Head alongside this, and note what is already on her timeline there.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-area-throat',
  'Throat signals, whole-body areas worth reviewing',
  'chek_hlc',
  'A signal reported at the throat and Neck, Chest, Breathing/Respiratory, Digestion, Immune, Hormonal, Stress and Kidney/Bladder are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["body_area","throat"]]'::jsonb,
  '[["body_area","neck"],["body_area","chest"],["category","respiratory"],["category","digestion"],["category","immune"],["category","hormonal"],["category","stress"],["category","kidney_bladder"]]'::jsonb,
  '[["signal","bss-system-digestion",40],["signal","bss-system-immune",40]]'::jsonb,
  array[
    'Ask about reflux, voice use and breathing through the mouth.',
    'Ask whether it comes and goes or has been constant.',
    'Review Neck alongside this, and note what is already on her timeline there.',
    'Review Chest alongside this, and note what is already on her timeline there.',
    'Review Breathing/Respiratory alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-area-leg',
  'Leg signals, whole-body areas worth reviewing',
  'biomechanics',
  'A signal reported at the leg is observed alongside Hip, Knee, Ankle, Calf, Low back, Circulation, Posture/Alignment, Musculoskeletal and Neurological in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["body_area","leg"]]'::jsonb,
  '[["body_area","hip"],["body_area","knee"],["body_area","ankle"],["body_area","calf"],["body_area","low_back"],["category","circulation"],["category","posture_alignment"],["category","musculoskeletal"],["category","neurological"]]'::jsonb,
  '[["signal","bss-system-heart",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask whether the sensation travels, and in which direction.',
    'Ask whether it is worse standing, walking or resting.',
    'Review Hip alongside this, and note what is already on her timeline there.',
    'Review Knee alongside this, and note what is already on her timeline there.',
    'Review Ankle alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-area-glute',
  'Glutes signals, whole-body areas worth reviewing',
  'biomechanics',
  'A signal reported at the glutes is often observed alongside Hip, Sacroiliac joint, Low back, Pelvis, Hamstrings, Posture/Alignment, Musculoskeletal, Stress and Joint/Movement. This is a possible association worth exploring, not an established medical finding.',
  '[["body_area","glute"]]'::jsonb,
  '[["body_area","hip"],["body_area","si_joint"],["body_area","low_back"],["body_area","pelvis"],["body_area","hamstring"],["category","posture_alignment"],["category","musculoskeletal"],["category","stress"],["category","joint_movement"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask how much of her day is spent sitting.',
    'Ask whether the sensation sits deep or on the surface, and whether it travels down the leg.',
    'Review Hip alongside this, and note what is already on her timeline there.',
    'Review Sacroiliac joint alongside this, and note what is already on her timeline there.',
    'Review Low back alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-area-groin',
  'Groin signals, whole-body areas worth reviewing',
  'chek_hlc',
  'Where a signal reported at the groin is reported, this coaching framework treats Hip, Pelvis, Sacroiliac joint, Abdomen, Thigh, Kidney/Bladder, Hormonal, Digestion and Musculoskeletal as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["body_area","groin"]]'::jsonb,
  '[["body_area","hip"],["body_area","pelvis"],["body_area","si_joint"],["body_area","abdomen"],["body_area","thigh"],["category","kidney_bladder"],["category","hormonal"],["category","digestion"],["category","musculoskeletal"]]'::jsonb,
  '[["signal","bss-system-kidney",40],["signal","bss-system-hormonal",40]]'::jsonb,
  array[
    'Ask when it began and whether anything changed in training or daily load around then.',
    'Ask whether it changes with the cycle, with walking or with getting out of a car.',
    'Review Hip alongside this, and note what is already on her timeline there.',
    'Review Pelvis alongside this, and note what is already on her timeline there.',
    'Review Sacroiliac joint alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-area-thigh',
  'Thigh signals, whole-body areas worth reviewing',
  'biomechanics',
  'A signal reported at the thigh and Hip, Knee, Pelvis, Low back, Musculoskeletal, Circulation, Posture/Alignment and Neurological are observed together often enough in this coaching methodology to be worth reviewing as one picture. This may be relevant, and it is not a statement about what produced the complaint.',
  '[["body_area","thigh"]]'::jsonb,
  '[["body_area","hip"],["body_area","knee"],["body_area","pelvis"],["body_area","low_back"],["category","musculoskeletal"],["category","circulation"],["category","posture_alignment"],["category","neurological"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-heart",40]]'::jsonb,
  array[
    'Ask whether it is a muscle sensation or one that travels from the back.',
    'Ask about training volume over the last two weeks.',
    'Review Hip alongside this, and note what is already on her timeline there.',
    'Review Knee alongside this, and note what is already on her timeline there.',
    'Review Pelvis alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-area-hamstring',
  'Hamstrings signals, whole-body areas worth reviewing',
  'biomechanics',
  'A signal reported at the hamstrings is observed alongside Hip, Glutes, Knee, Low back, Pelvis, Musculoskeletal, Posture/Alignment, Nutrition/Fuel and Circulation in this coaching methodology. These are areas that may be relevant and worth reviewing together, rather than an account of what produced the complaint.',
  '[["body_area","hamstring"]]'::jsonb,
  '[["body_area","hip"],["body_area","glute"],["body_area","knee"],["body_area","low_back"],["body_area","pelvis"],["category","musculoskeletal"],["category","posture_alignment"],["category","nutrition"],["category","circulation"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-heart",40]]'::jsonb,
  array[
    'Ask whether it is tight, sore or sharp, in her own words.',
    'Ask about sitting hours, warm up and any recent change in running or lifting.',
    'Review Hip alongside this, and note what is already on her timeline there.',
    'Review Glutes alongside this, and note what is already on her timeline there.',
    'Review Knee alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-area-calf',
  'Calf signals, whole-body areas worth reviewing',
  'biomechanics',
  'A signal reported at the calf is often observed alongside Ankle, Foot, Knee, Leg, Circulation, Musculoskeletal, Kidney/Bladder, Nutrition/Fuel and Posture/Alignment. This is a possible association worth exploring, not an established medical finding.',
  '[["body_area","calf"]]'::jsonb,
  '[["body_area","ankle"],["body_area","foot"],["body_area","knee"],["body_area","leg"],["category","circulation"],["category","musculoskeletal"],["category","kidney_bladder"],["category","nutrition"],["category","posture_alignment"]]'::jsonb,
  '[["signal","bss-system-heart",40],["signal","bss-system-muscles",40]]'::jsonb,
  array[
    'Ask about cramping, footwear and time on her feet.',
    'Ask whether one side is affected or both.',
    'Review Ankle alongside this, and note what is already on her timeline there.',
    'Review Foot alongside this, and note what is already on her timeline there.',
    'Review Knee alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

select pg_temp.seed_map_entry(
  'map-area-whole-body',
  'Whole body signals, whole-body areas worth reviewing',
  'chek_hlc',
  'Where a signal reported at the whole body is reported, this coaching framework treats Musculoskeletal, Stress, Sleep, Energy, Immune, Nutrition/Fuel, Digestion, Hormonal, Metabolic and Mood as areas worth reviewing alongside it. Nothing here is a conclusion about the complaint.',
  '[["body_area","whole_body"]]'::jsonb,
  '[["category","musculoskeletal"],["category","stress"],["category","sleep"],["category","energy"],["category","immune"],["category","nutrition"],["category","digestion"],["category","hormonal"],["category","metabolic"],["category","mood"]]'::jsonb,
  '[["signal","bss-system-muscles",40],["signal","bss-system-adrenals",40]]'::jsonb,
  array[
    'Ask whether this is everywhere at once or moves around.',
    'Ask what has changed in the last month in sleep, food, training and load.',
    'Review Musculoskeletal alongside this, and note what is already on her timeline there.',
    'Review Stress alongside this, and note what is already on her timeline there.',
    'Review Sleep alongside this, and note what is already on her timeline there.',
    'Consider medical referral if the signal is persistent, worsening, unusual, or outside coaching scope.'
  ]
);

drop function pg_temp.seed_map_entry(text, text, text, text, jsonb, jsonb, jsonb, text[]);
