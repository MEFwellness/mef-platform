-- Coach Member Detail: let an assigned coach read what her member actually
-- said her goals were.
--
-- member_goal_selections (migration 104) is the insert-only history of what a
-- member chose on the welcome flow's goal screen and later confirmed or
-- changed during onboarding. It shipped with exactly two policies, both
-- member-scoped: read own, insert own. There has never been a coach policy.
--
-- The practical consequence was quiet rather than loud, which is why it
-- survived this long. lib/case-view/service.ts calls
-- fetchLatestMemberGoalSelection through the CALLER'S client, so when a
-- member opens her own Case View she sees her goal, and when a coach opens
-- the same Case View for that member the read returns no row under RLS and
-- the goal simply renders as absent. The coach was not shown an error and was
-- not shown the wrong goal; the member's stated goal was just missing, and
-- looked the same as a member who had never chosen one.
--
-- SELECT only, and only for a coach who is actively assigned to that member.
-- Deliberately the same shape as the coach policy migration 106 already put
-- on daily_checkin_probe_answers, and it reuses the same two security
-- functions (migration 15), so there is one definition of "an active coach
-- for this member" and this policy cannot drift from the others.
--
-- No insert, no update, no delete. A coach may read what a member stated;
-- only the member may ever state it. The table's own no-update/no-delete
-- design (migration 104) is untouched.
--
-- Deliberately NOT granted to platform_administrator. Nothing in the admin
-- analytics section reads this table, and the analytics layer is built so
-- that member-entered content cannot reach it at all. Adding an admin policy
-- here would create the first path by which it could.

create policy coach_read_assigned_member_goal_selections on member_goal_selections
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );
