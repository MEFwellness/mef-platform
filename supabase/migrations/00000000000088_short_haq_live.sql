-- Promote the Short Health Assessment Questionnaire (short-haq) from its
-- Coming Soon placeholder (migration 78) to a live, takeable assessment.
--
-- Content/scoring lives entirely in code, same "config in code, not in the
-- database" convention as every other generic-engine questionnaire — see
-- apps/consumer-web-app/lib/assessments/short-haq/questionnaire.json. This
-- migration only flips the catalog row's status and records its first
-- version, mirroring the row inserted for every other definition in
-- 00000000000070_assessment_registry_catalog.sql.
update assessment_definitions
set
  implementation_status = 'live',
  is_active = true,
  updated_at = now()
where key = 'short-haq';

insert into assessment_definition_versions (assessment_definition_id, version, notes)
select id, 1, 'Initial version: original, MEF-authored 9-category symptom-frequency questionnaire.'
from assessment_definitions
where key = 'short-haq';
