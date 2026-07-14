-- Personal Wellness Intelligence Engine — dedup-lookup fix.
--
-- lib/intelligence/service.ts's recalculation dedups against a member's
-- own prior insight for the same pattern_key before deciding whether to
-- insert a fresh row or supersede the old one. That lookup is internal
-- bookkeeping ("has the engine already said this"), not a "what can the
-- current viewer see" query — but recalculation can run under the
-- MEMBER's own session (a member simply opening their Progress page, see
-- app/actions/wellness-intelligence.ts's getMyWellnessPatterns), and
-- migration 31's member_read_own_insights policy requires
-- member_visible = true. A coach-only row (the priority_summary insight,
-- or any insight a real safety restriction has downgraded) would then be
-- invisible to that same member's own dedup lookup, making the engine
-- believe no active insight exists yet and insert a duplicate on every
-- single recalculation — for priority_summary, that happened on every
-- page view; for a safety-downgraded insight, every duplicate also
-- re-opened a Coach Review Queue entry.
--
-- Same fix pattern as get_member_restricted_topics (migration 30): a
-- narrow, security-definer function mirroring the exact same
-- authorization RLS already enforces (a member reads their own rows, an
-- assigned coach reads their client's), just not limited by
-- member_visible specifically. Used only by
-- lib/intelligence/data.ts's findActiveInsightByPatternKey — its result
-- is internal bookkeeping and is never rendered directly to a
-- member-facing surface.
create or replace function public.find_active_wellness_insight(
  p_member uuid,
  p_pattern_key text
)
returns setof wellness_insights
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select *
  from wellness_insights
  where member_id = p_member
    and pattern_key = p_pattern_key
    and status in ('active', 'confirmed')
    and (
      p_member = auth.uid()
      or public.is_active_coach_for(auth.uid(), p_member)
      or public.has_active_role(auth.uid(), 'platform_administrator')
    )
  limit 1;
$$;

revoke all on function public.find_active_wellness_insight(uuid, text) from public;
grant execute on function public.find_active_wellness_insight(uuid, text) to authenticated, service_role;
