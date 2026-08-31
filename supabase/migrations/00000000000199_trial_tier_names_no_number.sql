-- Migration 199: the trial tier stops naming a number of days.
--
-- Found during live verification of migration 198. `member_access_tiers`
-- carried the trial's display name as '30 day trial', and that string is
-- what the administrator's Member access panel prints beside every account,
-- in the Tier row and in the assign-a-tier dropdown. With the trial now 7
-- days for new accounts and 30 for the ones already here, one label has to
-- describe two different windows, so it names neither.
--
-- The card beside it already shows that member's own trial start, her trial
-- end and how many days are left, which is the honest answer for whichever
-- window she is actually on. lib/membership/types.ts holds the same string
-- in ACCESS_TIER_LABEL.
--
-- A staff surface, not a member one: nothing here is rendered to a member.
--
-- Writes nothing to member_subscriptions. No expiry date moves.
update member_access_tiers
set
  display_name = 'Free trial',
  description = 'The free trial, granted automatically at account creation. Grants access while that account''s own trial window is still open. 7 days for accounts created from migration 198 on, 30 days for accounts stamped before it.'
where key = 'trial';
