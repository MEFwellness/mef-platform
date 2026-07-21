-- Prompt 2: goal-selection storage for the welcome flow, built on the
-- Prompt 1 foundation (profiles.welcome_flow_eligible / completed_at,
-- migration 85). Two more nullable columns on the same table, no new
-- table, no RLS change: member_read_own_profile / member_update_own_profile
-- (migration 16) already cover them the same way as every other
-- welcome_flow_* column.
--
-- Deliberately independent of the existing onboarding_questions
-- "primary_concern" question: that is a single-select question answered
-- later, as part of the onboarding assessment submission, and
-- onboarding_answers rows require an onboarding_submissions row to attach
-- to. The welcome flow's goal screen runs before any submission exists, so
-- it cannot write there; a second, purpose-built pair of columns is the
-- smallest safe option, not a duplicate of existing onboarding logic.
alter table profiles
  add column welcome_flow_goals jsonb;

alter table profiles
  add column welcome_flow_goals_other text;

comment on column profiles.welcome_flow_goals is
  'Array of goal keys selected on the welcome flow''s "What brought you here
   today?" screen (see lib/welcome/goals.ts for the fixed list). Null until
   the flow is completed. Independent of the separate onboarding_questions
   "primary_concern" answer.';

comment on column profiles.welcome_flow_goals_other is
  'Free-text detail entered when "something_else" is among
   welcome_flow_goals. Null otherwise.';
