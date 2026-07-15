-- Additive extension of body_assessment_findings.finding_type for the
-- on-device MediaPipe posture-screening estimates
-- (apps/consumer-web-app/lib/body-assessment/postureMeasurements.ts).
-- Same "drop and recreate the check constraint with every existing value
-- plus new ones" pattern migration 37 itself established for ai_events /
-- safety_classifications / conversation_sessions — every previously valid
-- finding_type stays valid, nothing here changes existing rows.
--
-- Each new value is a composite screening indicator built from several
-- external landmark signals together (see that file's docblock for the
-- exact formulas) — none of them are diagnoses. lateral_trunk_asymmetry
-- and lower_crossed_pattern are explicitly named as external visible
-- patterns, never as scoliosis or lower-crossed syndrome; the application
-- layer's narrative text enforces the exact required wording ("possible",
-- "screening indicator", "practitioner review recommended"), but the
-- finding_type value itself is also written to be self-descriptive of
-- what it is, not a clinical name.
alter table body_assessment_findings drop constraint body_assessment_findings_finding_type_check;
alter table body_assessment_findings add constraint body_assessment_findings_finding_type_check
  check (finding_type in (
    'forward_head', 'rounded_shoulders', 'elevated_shoulder', 'pelvic_tilt',
    'thoracic_kyphosis', 'lumbar_posture', 'knee_valgus', 'foot_turnout',
    'weight_shift', 'breathing_pattern', 'hip_asymmetry',
    'lateral_trunk_asymmetry', 'lower_crossed_pattern', 'sagittal_trunk_posture',
    'pelvic_drop_screening', 'custom'
  ));
