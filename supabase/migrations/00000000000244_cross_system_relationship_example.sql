-- The one demonstration record the Relationship Library ships with.
--
-- THE LIBRARY IS OTHERWISE EMPTY, AND THAT IS THE POINT. Whole-body
-- coaching relationships are defined by the coach, from her own training,
-- one at a time. This app does not invent them, does not generate them,
-- does not infer them from data and does not seed a set of them for her
-- to correct. There is exactly one row below, it is INACTIVE, it is
-- flagged is_example, and it is named "Example" in the first word a coach
-- reads, so nobody can mistake it for a clinical statement or for
-- something the platform is asserting.
--
-- ITS ONLY JOB IS TO SHOW THE SHAPE OF THE FORM: a primary component, a
-- related component, two support components, a floor, two strength levels
-- and two coaching considerations. It is a hip and bladder pairing purely
-- because the brief used one as an illustration, and NOTHING ANYWHERE IN
-- THIS FEATURE IS HARD CODED TO IT. Deleting this row leaves the feature
-- working and the library empty, which is the state it is meant to be in
-- before the coach starts writing.
--
-- EVERY WORD BELOW IS ASSOCIATION LANGUAGE. Observed together, may be
-- relevant, worth exploring. No claim about what causes what, and
-- tests/cross-system-relationship-copy.test.ts reads this file to keep it
-- that way.
--
-- created_by is null: no user wrote this, the migration did, and pretending
-- otherwise would put a coach's name on words she did not type.

insert into cross_system_relationships (id, pattern_key, is_active, is_example, current_version, created_by)
values (
  '00000000-0000-4000-8000-000000000244',
  'example-structure-demonstration',
  false,
  true,
  1,
  null
)
on conflict (pattern_key) do nothing;

insert into cross_system_relationship_versions (
  id, relationship_id, version_number, pattern_name, min_supporting_signals,
  possible_association_text, evidence_notes, change_summary, created_by
)
values (
  '00000000-0000-4000-8001-000000000244',
  '00000000-0000-4000-8000-000000000244',
  1,
  'Example: hip area signals observed alongside kidney and bladder signals',
  2,
  'This is an example record showing how a whole-body pattern is written down. It is inactive and it is not a clinical statement. When hip area signals and kidney and bladder signals are observed together in the same period, that pairing may be relevant and can be worth exploring in conversation. The wording here stays with what was observed together and what is worth asking about next.',
  'Example only. Use this field for your own reasoning, your training sources and anything you want to remember about why you wrote the pattern this way. It is private to you and it is shown nowhere outside this editor.',
  null,
  null
)
on conflict (id) do nothing;

-- Observed inputs. A body area in the primary role, a category (which is
-- what this feature calls a body system) in the related role, and two
-- named standardized signals as support.
insert into cross_system_relationship_components (
  id, version_id, position, role, ref_kind, ref_key, ref_label, side, value_key, value_label,
  min_value_numeric, source_key, source_question_ref, source_question_prompt, note
)
values
  ('00000000-0000-4000-8002-000000000001',
   '00000000-0000-4000-8001-000000000244', 1, 'primary', 'body_area', 'hip', 'Hip',
   null, null, null, null, null, null, null,
   'The area this example pattern starts from.'),
  ('00000000-0000-4000-8002-000000000002',
   '00000000-0000-4000-8001-000000000244', 2, 'related', 'category', 'kidney_bladder', 'Kidney/Bladder',
   null, null, null, null, null, null, null,
   'A body system observed alongside it.'),
  ('00000000-0000-4000-8002-000000000003',
   '00000000-0000-4000-8001-000000000244', 3, 'support', 'signal', 'hip-clicking', 'Hip clicking',
   null, null, null, 3, null, null, null,
   'Counts as support when it is reported at Sometimes or above.'),
  ('00000000-0000-4000-8002-000000000004',
   '00000000-0000-4000-8001-000000000244', 4, 'support', 'signal', 'frequent-urination', 'Frequent urination',
   null, null, null, null, null, null, null,
   'Counts as support whenever it is present.')
on conflict (id) do nothing;

-- Pattern composition. Two strength levels over the same floor.
insert into cross_system_relationship_strength_levels (
  version_id, level_key, position, display_label,
  min_supporting_signals, min_distinct_categories, min_related_signals
)
values
  ('00000000-0000-4000-8001-000000000244', 'emerging', 1, 'Emerging', 2, null, null),
  ('00000000-0000-4000-8001-000000000244', 'stronger', 2, 'Stronger', 3, 2, 1)
on conflict (version_id, level_key) do nothing;

-- Coaching considerations.
insert into cross_system_relationship_considerations (id, version_id, position, body)
values
  ('00000000-0000-4000-8003-000000000001', '00000000-0000-4000-8001-000000000244', 1,
   'Ask what else she has noticed in the same period, and listen for anything neither of you has named yet.'),
  ('00000000-0000-4000-8003-000000000002', '00000000-0000-4000-8001-000000000244', 2,
   'Worth exploring hydration, daily movement and how the week has been loading her, before drawing any line between the two.')
on conflict (id) do nothing;
