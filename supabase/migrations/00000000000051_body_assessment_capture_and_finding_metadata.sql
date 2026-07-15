-- Additive metadata columns closing two gaps identified in a practitioner-
-- dashboard audit of the AI Body Assessment Framework (migration 37):
--
--   body_assessment_captures.device_info   jsonb — user-agent/device model/
--                                           OS captured client-side at
--                                           capture time (e.g.
--                                           { userAgent, platform, model? }),
--                                           so a practitioner can tell a
--                                           front-facing-phone-camera
--                                           capture from a tripod/webcam one
--                                           when interpreting angles.
--   body_assessment_captures.camera_tilt   jsonb — the device orientation
--                                           reading at capture time, shape
--                                           { gamma: number, beta: number }
--                                           (DeviceOrientationEvent's own
--                                           field names), so a coach can
--                                           see whether the phone itself was
--                                           tilted rather than the member.
--
--   body_assessment_findings.threshold_config_version   text — which
--                                           version of the on-device
--                                           screening threshold constants
--                                           (lib/body-assessment/
--                                           postureMeasurements.ts) produced
--                                           this finding, so a finding can
--                                           be traced back to the exact
--                                           formula/thresholds that
--                                           generated it after those
--                                           constants change over time.
--   body_assessment_findings.raw_value     numeric — the raw measured
--                                           degree/ratio the narrative text
--                                           currently only ever describes in
--                                           prose, so a dashboard can sort/
--                                           filter/chart on the actual
--                                           number instead of parsing it out
--                                           of narrative.
--   body_assessment_findings.unit          text — the unit raw_value is in
--                                           (e.g. 'degrees', 'ratio').
--   body_assessment_findings.side_diff     numeric — a left/right
--                                           differential (e.g. shoulder
--                                           height difference) for findings
--                                           that measure an asymmetry,
--                                           distinct from raw_value which is
--                                           the primary measured quantity.
--
-- All eight columns are nullable, optional metadata — no existing row needs
-- a value, no existing insert breaks, no RLS policy changes are needed
-- (RLS in migration 37 is defined per-table, not per-column, and every
-- policy already governs the full row). Same "alter table ... add column"
-- additive-only shape as every other single-purpose migration in this
-- series (43, 45, 47, 48).
alter table body_assessment_captures
  add column if not exists device_info jsonb,
  add column if not exists camera_tilt jsonb,
  add column if not exists validation_summary jsonb;

comment on column body_assessment_captures.device_info is
  'Client-reported device metadata at capture time, e.g. { userAgent, platform, model? }. Null until the capturing client sends it.';
comment on column body_assessment_captures.camera_tilt is
  'Device orientation reading at capture time, shape { gamma: number, beta: number } (DeviceOrientationEvent field names). Null on devices/browsers without orientation sensor access.';
comment on column body_assessment_captures.validation_summary is
  'Session summary of the live capture-validation pipeline for this step, shape { categoryFailureCounts: Record<string, number>, multiPersonEvents: number } — how many frames failed each validation category (framing, orientation, etc.) and how many confirmed second-person events occurred while positioning for this capture. A lightweight session summary, not a full per-frame event log. Null for captures made before this column existed.';

alter table body_assessment_findings
  add column if not exists threshold_config_version text,
  add column if not exists raw_value numeric,
  add column if not exists unit text,
  add column if not exists side_diff numeric;

comment on column body_assessment_findings.threshold_config_version is
  'Which version of the on-device screening threshold constants (lib/body-assessment/postureMeasurements.ts) produced this finding. Null for coach-authored/override findings and any finding written before this column existed.';
comment on column body_assessment_findings.raw_value is
  'The raw measured degree/ratio behind narrative, e.g. 14.2 for a 14.2-degree forward head angle. Null until a provider populates it — narrative remains the source of truth for display until then.';
comment on column body_assessment_findings.unit is
  'The unit raw_value is expressed in, e.g. ''degrees'' or ''ratio''. Null whenever raw_value is null.';
comment on column body_assessment_findings.side_diff is
  'Left/right differential for findings that measure an asymmetry (e.g. shoulder height difference), distinct from raw_value. Null for findings with no side-to-side comparison.';
