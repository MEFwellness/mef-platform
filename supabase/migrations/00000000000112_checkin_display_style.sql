-- Daily Check-In redesign — "question types that look like what they
-- measure" (task requirement 2). Adds a nullable display_style override
-- to driver_probe_questions so a coach-added question's visual
-- treatment can be data-driven instead of hardcoded per question.
--
-- Left nullable with NO default on purpose: the fallback (a sensible
-- treatment derived from response_type alone) lives in application code
-- (lib/daily-checkin-adaptive/displayStyle.ts), not in the database, so
-- every one of the 88 existing rows — and any future coach-created
-- question — renders well with this column unset. Setting an explicit
-- value here is only ever an override, never required.
alter table driver_probe_questions
  add column display_style text
  check (
    display_style is null or display_style in (
      'five_faces', 'vertical_fill', 'tightening_shape', 'five_moons',
      'segmented', 'dots', 'boolean_pills', 'pill_row', 'arc_time', 'body_map'
    )
  );

-- Chrome fix (task requirement 3): "Bowel movement status: 'Normal /
-- Constipated / Loose / None' is ambiguous. Change 'None' to 'Didn't
-- go.'" This row is one of the two pre-existing single_select rows that
-- still store plain strings rather than {value,label} objects (see
-- migration 109's own comment) — converting it to the richer shape here
-- fixes the label the same data-driven way every other question already
-- gets its labels, rather than special-casing this one key in the
-- renderer. The stored value ('none') is unchanged, so no historical
-- answer is reinterpreted.
update driver_probe_questions
set options = '[
  {"value": "normal", "label": "Normal"},
  {"value": "constipated", "label": "Constipated"},
  {"value": "loose", "label": "Loose"},
  {"value": "none", "label": "Didn''t go"}
]'::jsonb
where question_key = 'checkin_probe.bowel_movement_status';
