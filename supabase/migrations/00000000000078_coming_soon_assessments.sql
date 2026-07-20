-- Coming Soon placeholders — catalog rows only, no question content, no
-- route, no scoring. These exist so the Questionnaires page's "Coming
-- Soon" section (config-based, per the guided-journey framework) has real
-- rows to read instead of a hardcoded list in a component. A placeholder
-- must never open a missing route or fake a completion — implementation_
-- status = 'coming_soon' is exactly what the page checks before ever
-- rendering a "Start" action, and no take/results route exists for these
-- keys, so there is nothing to accidentally link to.
insert into assessment_definitions (id, key, display_name, category, implementation_status) values
  ('a2d5570d-cd03-49ed-af95-5c99a6a2783f', 'readiness-to-change', 'Readiness to Change', 'behavior_change', 'coming_soon'),
  ('f34fae60-88ba-45d0-8a51-7b7f1776bff4', 'short-haq', 'Short Health Assessment Questionnaire', 'health_history', 'coming_soon'),
  ('6b792a3c-b2ea-4b3d-b272-1142798641fb', 'finding-1-love', 'Finding 1 Love', 'nutrition_lifestyle', 'coming_soon');
