-- Camera-tilt columns: no schema change, corrected meaning.
--
-- WHY. body_assessment_captures.roll_degrees (migration 103) was written
-- with DeviceOrientationEvent's raw `gamma` value, on the assumption that
-- gamma IS the phone's side-to-side roll. It is not, in the one attitude
-- this assessment asks for. The event reports intrinsic Z-X'-Y' Tait-Bryan
-- angles, and that decomposition is in gimbal lock at beta = 90 degrees,
-- which is exactly a phone standing upright in portrait. At that attitude
-- gamma stops describing roll and starts describing which way the phone is
-- AIMED horizontally, so a perfectly level phone pointed 20 degrees off
-- dead ahead stored (and was gated on) roll_degrees = -20, and a phone
-- genuinely rolled by 1 degree stored 90.
--
-- apps/consumer-web-app/lib/body-assessment/cameraTilt.ts now derives both
-- angles from where gravity actually points relative to the device, which
-- is well defined at every attitude. These comments record what the two
-- columns hold from this migration forward.
--
-- ON EXISTING ROWS. Nothing is rewritten. A stored roll_degrees cannot be
-- corrected in place, because the raw gamma it came from does not by
-- itself determine the true roll: beta is needed too, and that pairing
-- only exists on rows where camera_tilt was also populated. Rather than
-- back-fill some rows and not others, every row keeps what it was written
-- with, and camera_tilt continues to hold the raw reading so any row that
-- has it can be re-derived later if it is ever worth doing. pitch_degrees
-- needs no such caveat: the old `beta - 90` was correct, and the new
-- derivation reproduces it exactly whenever the phone is not also panned.
comment on column body_assessment_captures.roll_degrees is
  'Side-to-side roll of the phone in degrees at capture time, 0 when the top of the phone points straight up. Positive means the phone''s right side is high. Derived from the direction of gravity relative to the device, measured against whichever screen edge was the top of the interface, NOT from DeviceOrientationEvent.gamma (which does not describe roll for an upright portrait phone). Gated to within +/-3 degrees before capture is allowed to fire. Null when orientation_source is manual_fallback or for movement/video captures. Rows written before migration 161 hold raw gamma instead and are not comparable, see that migration.';
comment on column body_assessment_captures.pitch_degrees is
  'Forward/back lean of the phone in degrees at capture time, 0 when perfectly vertical. Positive means the top of the phone has tipped toward the member; negative means it leans away, which is what a phone propped in a stand does. Gated to within +/-5 degrees before capture is allowed to fire. Equal to the older beta minus 90 convention whenever the phone is not also panned, so values from before migration 161 remain comparable. Null when orientation_source is manual_fallback or for movement/video captures.';
comment on column body_assessment_captures.camera_tilt is
  'The raw DeviceOrientationEvent reading at capture time as {gamma, beta}, kept alongside the derived roll_degrees/pitch_degrees so a stored capture can be re-derived if the tilt geometry is ever revised again. Null on devices or browsers that report no orientation.';
