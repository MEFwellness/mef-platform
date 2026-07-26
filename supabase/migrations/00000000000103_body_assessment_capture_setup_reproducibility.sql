-- Camera-setup reproducibility gate for the AI Body Assessment Framework's
-- standing-photo captures (front/left_side/right_side/back).
--
-- Every angle postureMeasurements.ts computes assumes the camera was in
-- the same physical position (level, aimed straight ahead, at hip height,
-- the right distance away) at capture time — otherwise two photos of the
-- same person taken from different camera setups aren't actually
-- comparable, even if the posture itself didn't change. This migration
-- adds columns to record the EXACT camera-setup measurements the capture
-- flow's new blocking gate (apps/consumer-web-app/lib/body-assessment/
-- cameraTilt.ts's tightened roll/pitch tolerance, and poseValidation.ts's
-- tightened hip-height/frame-fill checks) verified before allowing that
-- capture to fire, so:
--   (a) a coach can see exactly what setup produced a given capture, and
--   (b) a later capture of the same view can be guided to replicate it
--       (see app/actions/body-assessment.ts's getMostRecentCaptureSetupAction).
--
-- All five columns are nullable, additive metadata — no existing row needs
-- a value (captures made before this migration, and every movement/video
-- capture, simply have nulls here), no existing insert breaks, no RLS
-- policy change needed (RLS in migration 37 is per-table, already governs
-- the full row). Same "alter table ... add column" shape as migration 51.
alter table body_assessment_captures
  add column if not exists roll_degrees numeric,
  add column if not exists pitch_degrees numeric,
  add column if not exists hip_mid_y_ratio numeric,
  add column if not exists subject_frame_height_ratio numeric,
  add column if not exists orientation_source text
    check (orientation_source in ('sensor', 'manual_fallback'));

comment on column body_assessment_captures.roll_degrees is
  'Left-right phone tilt in degrees at capture time, 0 = level. Gated to within +/-1 degree by cameraTilt.ts before capture is allowed to fire. Null when orientation_source is manual_fallback (no sensor reading exists) or for movement/video captures.';
comment on column body_assessment_captures.pitch_degrees is
  'Forward-back phone lean in degrees of deviation from vertical at capture time, 0 = phone standing perfectly vertical. Gated to within +/-2 degrees by cameraTilt.ts before capture is allowed to fire. Null when orientation_source is manual_fallback or for movement/video captures.';
comment on column body_assessment_captures.hip_mid_y_ratio is
  'Normalized [0,1] vertical position of the hip-landmark midpoint in the frame at capture time. Gated to within the middle 10% of the frame (0.45-0.55) by poseValidation.ts before capture is allowed to fire. Null for movement/video captures.';
comment on column body_assessment_captures.subject_frame_height_ratio is
  'Normalized [0,1] share of the frame height the subject''s body spanned at capture time. Gated to 80-90% by poseValidation.ts before capture is allowed to fire. Null for movement/video captures.';
comment on column body_assessment_captures.orientation_source is
  'Whether roll_degrees/pitch_degrees came from a real DeviceOrientation sensor reading (''sensor'') or the member manually attesting a level phone via the on-screen bubble-level fallback (''manual_fallback'') because no sensor reading was ever available on this device/browser. Null for movement/video captures and rows written before this column existed.';
