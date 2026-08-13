-- ---------------------------------------------------------------------
-- The movement flip — one new rule slug, and nothing else.
-- ---------------------------------------------------------------------
--
-- WHY A MIGRATION AT ALL. Everything else in the movement flip is code:
-- the six sessions already exist (migrations 153 and 154), the outcome
-- ledger already accepts action_type 'movement' (migration 150 seeded it
-- into the check constraint deliberately, ahead of the feature), and the
-- coaching_action_* events are already behavioral-only. The single thing
-- the database refuses today is the NAME of the new rung, because
-- member_daily_priorities.rule is a closed check constraint.
--
-- WHAT THE NEW RUNG IS.
--
--   'movement_session'  A Root Movement session, offered only when today's
--                       Daily Reset is already complete. It sits directly
--                       ABOVE the final fallback and below every other
--                       rung, so every pre-existing rule keeps its exact
--                       position relative to every other pre-existing rule
--                       and nothing that used to win stops winning. When
--                       the Daily Reset is not done this rung is not built
--                       at all and the 'daily_reset' fallback is reached
--                       exactly as before.
--
-- A movement priority can also arrive on the EXISTING 'implicated_driver'
-- rung, when the winning driver is one the mapping table in
-- lib/coaching-direction/movement.ts names. That needs no schema change at
-- all: the rule slug is unchanged, and only the action_type and the href
-- differ, both of which the schema already accepts.
--
-- NO NEW TABLE, NO NEW COLUMN, NO NEW POLICY, NO DATA WRITTEN. Applying
-- this to a database with no movement rows changes nothing observable; the
-- constraint simply admits one more value.
-- ---------------------------------------------------------------------

alter table member_daily_priorities drop constraint member_daily_priorities_rule_check;

alter table member_daily_priorities add constraint member_daily_priorities_rule_check
  check (rule in (
    'safety',
    're_entry',
    'reset_plan_commitment',
    'implicated_driver',
    'qualified_pattern',
    'incomplete_action',
    'behavioral_friction',
    'todays_focus',
    'movement_session',
    'daily_reset',
    'gentle_focus'
  ));

comment on constraint member_daily_priorities_rule_check on member_daily_priorities is
  'The Priority Card hierarchy, in ladder order. ''safety'' and ''re_entry'' are overrides rather than rungs. ''movement_session'' is the movement flip''s enriched fallback and is only ever built when the Daily Reset is already complete.';
