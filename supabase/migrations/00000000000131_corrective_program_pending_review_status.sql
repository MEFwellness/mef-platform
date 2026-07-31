-- Corrective Program Generator Engine — schema-only change.
--
-- The engine (apps/consumer-web-app/lib/corrective-engine/) writes its
-- 4-week program drafts straight into the existing Coach Program Builder
-- tables (coach_program_templates / _sections / _exercises, migration 82)
-- rather than inventing a parallel storage format — per the task's own
-- "reuse the existing program/prescription structures" instruction. One
-- coach_program_templates row per weekly session slot (2 or 3), grouped by
-- a shared program_tags entry, same "a program is several templates, no
-- new schema" convention already used by the Your Move program-generation
-- feature (migration 122's entry in BUILD_STATUS.md).
--
-- coach_program_templates.status only ever had 'draft' | 'active' |
-- 'archived' (migration 82) — none of which describe "an engine generated
-- this, a coach hasn't reviewed it yet." Widened additively, same
-- convention as every other check-constraint widening in this schema
-- (program_section, event_type, etc.). A generated draft's status starts
-- and stays 'pending_coach_review' until a coach explicitly reviews it —
-- nothing in this migration or the engine ever sets it to 'active' or
-- assigns it to a member.
alter table coach_program_templates drop constraint coach_program_templates_status_check;
alter table coach_program_templates add constraint coach_program_templates_status_check
  check (status in ('draft', 'active', 'archived', 'pending_coach_review'));
