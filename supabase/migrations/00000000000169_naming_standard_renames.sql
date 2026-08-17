-- The Naming Standard, applied to stored text.
--
-- docs/NAMING-STANDARD.md: a name describes what the member experiences or
-- what the check looks at. It never names a condition, a pathogen, an organ
-- dysfunction, or a deficiency.
--
-- The application does not need this migration to show the right names. Every
-- screen renders findings through the Member Interpretation Layer, which looks
-- a finding's name up by its stable `domain::code` in lib/naming/findingNames.ts
-- rather than reading `registry_entries.label`. This migration exists so the
-- STORED record agrees with what she is now being shown, which matters for the
-- coach's audit trail, for exports, and for anyone reading the table directly.
--
-- NOTHING IS DELETED AND NOTHING IS OVERWRITTEN IN PLACE. A stored finding row
-- is a record of what a member was told on the day she was told it, and that
-- record is not ours to rewrite. Each affected row is SUPERSEDED by a new row
-- carrying the new wording, with the supersede pointers set in both directions,
-- exactly the way migration 165 retired duplicates.
--
-- Two other things are renamed, and those two ARE updates rather than
-- supersedes, because they are content definitions rather than records of what
-- somebody was told: the Whole-Body Check-In's own title, and its sixteen
-- section titles. Renaming a section heading does not change any answer any
-- member gave; the answers point at the section by id, not by title.
--
-- Idempotent throughout: re-running it renames nothing a second time and
-- supersedes nothing a second time.

-- =====================================================================
-- 1. The Whole-Body Check-In: its own name, and its sixteen sections
-- =====================================================================
--
-- Every one of the sixteen used to name an organ or a clinical process
-- ("Adrenal & Stress-Response Patterns", "Liver & Detoxification Support",
-- "Nutrient Insufficiency Patterns"), which told a member reading a heading
-- that the app was looking for something wrong with a specific organ. The
-- questions underneath are untouched. Each new title says what its own
-- questions actually ask about.
--
-- Matched on the exact old title so a section that has already been renamed,
-- or one added later, is left alone.

update unified_assessment_definitions
set title = 'Whole-Body Check-In',
    description =
      'A walk through 16 short areas of everyday life: how meals sit with you, how your energy holds up, sleep, aches, mood, recovery, and more. It helps show what is worth a closer look. This is wellness education, not a medical diagnosis.',
    updated_at = now()
where key = 'wbsa'
  and title <> 'Whole-Body Check-In';

update unified_assessment_sections s
set title = v.new_title,
    updated_at = now()
from (values
  ('Upper Digestive Function', 'How meals sit with you'),
  ('Lower Digestive & Elimination Function', 'How things move through'),
  ('Blood Sugar & Energy Regulation', 'Energy between meals'),
  ('Liver & Detoxification Support', 'Skin, headaches and strong smells'),
  ('Immune & Inflammatory Patterns', 'Colds, and how quickly you bounce back'),
  ('Respiratory & Oxygenation Patterns', 'Breathing, and catching your breath'),
  ('Circulation & Cardiovascular-Related Observations', 'Effort, cold hands and cold feet'),
  ('Kidney, Bladder & Fluid-Balance Patterns', 'Water, swelling and bathroom trips'),
  ('Thyroid & Metabolic-Related Observations', 'Temperature, weight and everyday pace'),
  ('Adrenal & Stress-Response Patterns', 'How you handle stress and demand'),
  ('Reproductive & Hormonal Patterns', 'Cycle, mood and monthly changes'),
  ('Neurological & Cognitive Patterns', 'Focus, memory and steadiness'),
  ('Musculoskeletal & Connective-Tissue Patterns', 'Aches, stiffness and joints'),
  ('Skin, Hair & Nail Observations', 'Skin, hair and nails'),
  ('Nutrient Insufficiency Patterns', 'Cravings, and what your body seems short of'),
  ('Recovery & Resilience Patterns', 'How well you recover')
) as v(old_title, new_title)
where s.title = v.old_title
  and s.assessment_definition_id in (
    select id from unified_assessment_definitions where key = 'wbsa'
  );

-- =====================================================================
-- 2. Stored finding labels, superseded rather than rewritten
-- =====================================================================
--
-- The table below is the same one lib/naming/findingNames.ts holds, keyed the
-- same way, so the two cannot describe different renames. Anything not listed
-- here keeps the label it was written with, which is correct: this migration
-- renames what the audit flagged, not everything that has ever been stored.

create temporary table naming_renames (
  domain text not null,
  code text not null,
  new_label text not null
) on commit drop;

insert into naming_renames (domain, code, new_label) values
  -- Intake and reassessment sliders
  ('sleep', 'poor_sleep_quality', 'Sleep that has not been leaving you rested'),
  ('stress', 'elevated_stress', 'The stress you are carrying'),
  ('sleep', 'low_energy', 'Energy that runs out through the day'),
  ('nutrition', 'digestive_complaints', 'Digestion that has been uncomfortable'),
  -- Where it hurts
  ('movement', 'pain_neck', 'Neck discomfort you reported'),
  ('movement', 'pain_shoulders', 'Shoulder discomfort you reported'),
  ('movement', 'pain_upper_back', 'Upper back discomfort you reported'),
  ('movement', 'pain_lower_back', 'Lower back discomfort you reported'),
  ('movement', 'pain_hips', 'Hip discomfort you reported'),
  ('movement', 'pain_knees', 'Knee discomfort you reported'),
  -- Nutrition & Lifestyle Questionnaire
  ('nutrition', 'nutrition_quality_concern', 'The quality of what you are eating'),
  ('sleep', 'circadian_disruption', 'Your daily sleep and wake rhythm'),
  ('nutrition', 'meal_timing_irregularity', 'When you eat across the day'),
  ('nutrition', 'gut_fungal_parasite_concern', 'Bloating, cravings and gut discomfort'),
  ('nutrition', 'detoxification_load_concern', 'Headaches, skin changes and sensitivity to strong smells'),
  -- Four Doctors
  ('stress', 'emotional_wellbeing_concern', 'How you have been feeling day to day'),
  ('nutrition', 'diet_quality_concern', 'What your everyday eating looks like'),
  ('movement', 'movement_deficiency', 'How much you have been moving'),
  -- Short Health Assessment Questionnaire
  ('nutrition', 'digestive_wellness_concern', 'How your digestion has been settling'),
  ('movement', 'energy_fatigue_pattern', 'Energy and tiredness through the week'),
  ('sleep', 'sleep_quality_pattern', 'How your nights have been going'),
  ('stress', 'stress_and_mood_pattern', 'Stress and mood together'),
  ('breathing', 'immune_respiratory_pattern', 'Colds, congestion and how easily you breathe'),
  ('movement', 'musculoskeletal_discomfort_pattern', 'Aches and stiffness when you move'),
  ('movement', 'cardiovascular_circulation_pattern', 'How you feel with effort, and cold hands or feet'),
  ('stress', 'cognitive_clarity_pattern', 'Focus and mental clarity'),
  ('hormone', 'hormonal_balance_pattern', 'Cycle, mood and energy changes over the month'),
  -- Posture findings, which reached members as the raw enum with its
  -- underscores swapped for spaces
  ('posture', 'forward_head', 'Head sitting forward of your shoulders'),
  ('posture', 'rounded_shoulders', 'Shoulders rolling forward'),
  ('posture', 'elevated_shoulder', 'One shoulder sitting higher than the other'),
  ('posture', 'pelvic_tilt', 'The tilt of your pelvis'),
  ('posture', 'thoracic_kyphosis', 'Rounding through your upper back'),
  ('posture', 'lumbar_posture', 'The curve of your lower back'),
  ('posture', 'knee_valgus', 'Knees drifting inward'),
  ('posture', 'foot_turnout', 'Feet turning outward'),
  ('posture', 'weight_shift', 'Weight favouring one side'),
  ('posture', 'hip_asymmetry', 'Hips sitting unevenly'),
  ('posture', 'lateral_trunk_asymmetry', 'Side to side evenness through your trunk'),
  ('posture', 'lower_crossed_pattern', 'A tight hips and long back combination worth looking at'),
  ('posture', 'sagittal_trunk_posture', 'How you stack from the side'),
  ('posture', 'pelvic_drop_screening', 'How level your hips stay on one leg'),
  ('breathing', 'breathing_pattern', 'How you are breathing');

-- Only ACTIVE rows are superseded. A row that is already superseded,
-- resolved or dismissed is history twice over and is left exactly as it is.
create temporary table naming_rename_targets on commit drop as
select r.id as old_id, n.new_label
from registry_entries r
join naming_renames n
  on n.domain = r.domain and n.code = r.code
where r.status = 'active'
  and r.entry_kind = 'finding'
  and r.label is distinct from n.new_label;

-- The replacement rows. Everything except the label and the supersede pointer
-- is copied forward verbatim, including confidence, evidence, severity and
-- recorded_at, because none of those facts changed. Only the wording did.
with inserted as (
  insert into registry_entries (
    member_id, entry_kind, domain, code, label, severity, numeric_value, unit,
    confidence, narrative, evidence_refs, source_feature, source_record_id,
    status, member_visible, coach_context, coach_reviewed_by, coach_reviewed_at,
    supersedes_id, recorded_at, canonical_source_key, evidence_tier, coach_verified_at
  )
  select
    r.member_id, r.entry_kind, r.domain, r.code, t.new_label, r.severity,
    r.numeric_value, r.unit, r.confidence, r.narrative, r.evidence_refs,
    r.source_feature, r.source_record_id, 'active', r.member_visible,
    r.coach_context, r.coach_reviewed_by, r.coach_reviewed_at,
    r.id, r.recorded_at, r.canonical_source_key, r.evidence_tier, r.coach_verified_at
  from registry_entries r
  join naming_rename_targets t on t.old_id = r.id
  returning id as new_id, supersedes_id as old_id
)
update registry_entries r
set status = 'superseded',
    superseded_by_id = i.new_id,
    updated_at = now()
from inserted i
where r.id = i.old_id;

-- =====================================================================
-- 3. Stored narratives that quoted a raw enum into member copy
-- =====================================================================
--
-- Audit 3.6: the intake adapter wrote "Elevated Stress reported as 'poor' on
-- the latest onboarding submission." The quotes around a lowercase system
-- value are the giveaway that a variable escaped into a sentence. The
-- interpretation layer already authors its own statement and never renders a
-- stored narrative to a member, so this only affects what the row itself
-- says. It is set to null rather than rewritten: inventing a sentence the
-- producer never wrote would be worse than the row simply not carrying one,
-- and the layer supplies the sentence either way.

update registry_entries
set narrative = null,
    updated_at = now()
where narrative is not null
  and narrative like '%reported as ''%'' on the latest onboarding submission.%';

-- =====================================================================
-- What this migration deliberately does NOT do
-- =====================================================================
--
-- It does not touch the twelve coaching domain names, the Movement Score, or
-- the unbuilt-feature placeholders. Those are the three items still carrying a
-- decision (lib/naming/standard.ts, NAMES_PENDING_DECISION), and none of them
-- is stored text in any case: all three are decided in code and a decision on
-- any of them lands without a migration.
