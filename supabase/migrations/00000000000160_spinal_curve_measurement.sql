-- Spinal curve measurement from the body silhouette, for the AI Body
-- Assessment Framework's side-view standing photos.
--
-- WHY THESE COLUMNS EXIST. MediaPipe's 33-point pose topology has no
-- landmark anywhere between the shoulder and the hip: no C7, no thoracic or
-- lumbar vertebra, no sacrum. A line between the shoulder point and the hip
-- point is straight by definition, so nothing in the existing landmark-based
-- engine (apps/consumer-web-app/lib/body-assessment/postureMeasurements.ts)
-- can describe a spinal curve — that file's docblock says so explicitly and
-- deliberately declines to fake one.
--
-- The pose model also produces a SEGMENTATION MASK, a per-pixel body
-- outline. On a side view the back edge of that outline is the person's
-- actual back surface, sampled at every pixel row from the base of the neck
-- to the pelvis. apps/consumer-web-app/lib/body-assessment/spinalCurve.ts
-- fits a smooth curve to that edge and reads two angles off it. These
-- columns are where those two angles land.
--
-- WHAT THE ANGLES MEAN. Both are "how many degrees the back surface turns
-- across this region", the same quantity a two-inclinometer or kyphometer
-- protocol reads off the skin. The upper-back angle is measured between the
-- base of the neck and a fixed 60% split point; the lower-back angle between
-- that split and the top of the pelvis. Neither is a Cobb angle and neither
-- is a radiographic measurement. See spinalCurve.ts's docblock for the full
-- geometric definition.
--
-- MEASUREMENT ONLY. Nothing here carries a severity, a finding type, or a
-- normal/abnormal judgement, and no body_assessment_findings row is written
-- from these numbers. Interpretation is deliberately a separate concern.
--
-- All columns are nullable, additive metadata, exactly the shape of
-- migrations 51 and 103. No existing row needs a value: front, back,
-- movement and video captures, every capture taken before this migration,
-- and any side view whose outline was not clear enough to measure all
-- simply have nulls here. No existing insert breaks, and no RLS policy
-- change is needed — migration 37's per-table policies already govern the
-- full row.
alter table body_assessment_captures
  add column if not exists thoracic_angle_degrees numeric,
  add column if not exists thoracic_angle_confidence numeric,
  add column if not exists lumbar_angle_degrees numeric,
  add column if not exists lumbar_angle_confidence numeric,
  add column if not exists spinal_curve_quality jsonb;

comment on column body_assessment_captures.thoracic_angle_degrees is
  'Upper back (thoracic) angle in degrees: how far the back surface turns between the base of the neck and the fixed 60% thoracolumbar split point, read off a smooth curve fitted to the back edge of the segmentation mask. A straight upper back reads near 0; a rounded one reads a larger positive number. An external surface measurement, not a spinal or radiographic one. Null for every non-side-view capture, and null (never a guessed number) whenever thoracic_angle_confidence fell below the measurement floor. See lib/body-assessment/spinalCurve.ts.';
comment on column body_assessment_captures.thoracic_angle_confidence is
  'How much to trust thoracic_angle_degrees, 0-1. The weakest of three mask-edge signals: how much of the back outline was traceable, how crisp the mask transition was at the edge, and how closely the traced edge followed a smooth curve. Loose clothing, low contrast with the background, and a ragged outline each push it down. Always recorded even when the angle itself was withheld, so a rejection is auditable.';
comment on column body_assessment_captures.lumbar_angle_degrees is
  'Lower back (lumbar) angle in degrees: how far the back surface turns between the fixed 60% thoracolumbar split point and the top of the pelvis. A flattened lower back reads near 0; a deeply hollowed one reads a larger positive number. The measured band deliberately stops short of hip-joint height so the gluteal contour cannot corrupt it. Same null-rather-than-guess rule as thoracic_angle_degrees.';
comment on column body_assessment_captures.lumbar_angle_confidence is
  'How much to trust lumbar_angle_degrees, 0-1. Computed the same way as thoracic_angle_confidence, over the lower half of the measured band.';
comment on column body_assessment_captures.spinal_curve_quality is
  'Mask-edge quality metadata behind the two angles: which side of the frame the back was found on, the height of the measured band in pixels, how many pixel rows were attempted and how many produced a usable edge, edge crispness, edge roughness against the fitted curve, rows dropped as outliers, the method version that produced the reading, and a plain-language reason when an angle was withheld. Kept so a stored reading can be audited later rather than merely trusted.';
