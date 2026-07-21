-- Universal Assessment Intelligence Engine.
--
-- The engine that connects every assessment (the four Q&A/media systems),
-- daily check-ins, and the Universal Health Registry (migration 40) into
-- one cross-assessment findings/correlation/reassessment layer — reusing,
-- not replacing, any of it. Everything below is additive: two existing
-- tables gain new, nullable/defaulted columns and one additive constraint
-- extension; nothing existing changes shape or behavior.
--
-- 1. registry_entries.source_feature — extended (same additive
--    drop/re-add pattern migrations 44/55/58/59 already used) to admit
--    three new producers: the three Q&A questionnaire systems that today
--    write no findings into the registry at all (confirmed by
--    ASSESSMENT_INVENTORY.md — `domain='questionnaire'` has been reserved
--    since migration 40 but had no real writer until now):
--      questionnaire_category_finding  — generic points-scored engine
--                                         (CHEK HLC1 + Four Doctors),
--                                         lib/registry/adapters/questionnaireEngine.ts
--      onboarding_baseline_finding     — Onboarding Assessment,
--                                         lib/registry/adapters/onboarding.ts
--      primal_pattern_classification  — Primal Pattern Diet Type,
--                                         lib/registry/adapters/primalPattern.ts
--
-- 2. registry_entries.trend_status — new nullable column, the per-finding
--    Pattern Timeline status (new/improving/stable/worsening/resolved)
--    computed at write time by comparing a new entry to the active entry
--    it supersedes (lib/registry/trendStatus.ts). Distinct from `status`
--    (lifecycle: active/resolved/superseded/dismissed) — a finding can be
--    status='active' and trend_status='worsening' at the same time. Null
--    on every entry written before this column existed and on any
--    producer that doesn't compute it (the original five adapters keep
--    working unchanged) — never backfilled or guessed.
--
-- 3. reassessment_schedules.trigger_source / trigger_context — new
--    nullable-with-default columns. This table (migration 72) starts
--    completely empty; every row from now on records *why* it exists —
--    a due calendar date (the only reason support until now), or a
--    finding-change/check-in-signal/coach-action trigger (Reassessment
--    Intelligence, lib/reassessment-intelligence/). Defaulting
--    trigger_source to 'calendar' keeps this non-breaking for any future
--    calendar-only writer that doesn't know about the new column.
alter table registry_entries drop constraint registry_entries_source_feature_check;
alter table registry_entries add constraint registry_entries_source_feature_check
  check (source_feature in (
    'body_assessment_finding', 'assessment_ai_observation', 'wearable_daily_metric',
    'food_lens_pattern_comparison', 'movement_session_completed', 'food_analysis_result',
    'questionnaire_category_finding', 'onboarding_baseline_finding', 'primal_pattern_classification'
  ));

alter table registry_entries add column trend_status text
  check (trend_status is null or trend_status in ('new', 'improving', 'stable', 'worsening', 'resolved'));

-- Member-authored writes for the three new adapters, same shape as the
-- food_analysis_result policies (migration 59) except not domain-scoped —
-- unlike Food Lens, a single questionnaire attempt can legitimately touch
-- several domains at once (e.g. a Nutrition & Lifestyle attempt can
-- register both a nutrition and a stress finding in the same completion),
-- so the source_feature value itself (three-way, adapter-specific) is the
-- narrowing check, not a fixed domain.
create policy member_insert_own_questionnaire_registry_entries on registry_entries
  for insert
  with check (member_id = auth.uid() and source_feature = 'questionnaire_category_finding');

create policy member_update_own_questionnaire_registry_entries on registry_entries
  for update
  using (member_id = auth.uid() and source_feature = 'questionnaire_category_finding')
  with check (member_id = auth.uid() and source_feature = 'questionnaire_category_finding');

create policy member_insert_own_onboarding_registry_entries on registry_entries
  for insert
  with check (member_id = auth.uid() and source_feature = 'onboarding_baseline_finding');

create policy member_update_own_onboarding_registry_entries on registry_entries
  for update
  using (member_id = auth.uid() and source_feature = 'onboarding_baseline_finding')
  with check (member_id = auth.uid() and source_feature = 'onboarding_baseline_finding');

create policy member_insert_own_primal_pattern_registry_entries on registry_entries
  for insert
  with check (member_id = auth.uid() and source_feature = 'primal_pattern_classification');

create policy member_update_own_primal_pattern_registry_entries on registry_entries
  for update
  using (member_id = auth.uid() and source_feature = 'primal_pattern_classification')
  with check (member_id = auth.uid() and source_feature = 'primal_pattern_classification');

alter table reassessment_schedules add column trigger_source text not null default 'calendar'
  check (trigger_source in ('calendar', 'finding_change', 'checkin_signal', 'coach_action'));
alter table reassessment_schedules add column trigger_context jsonb;

-- Supersede-step fix (a real, previously-latent bug this milestone's own
-- test suite is the first to actually exercise): registry_entries'
-- member_read_own_registry_entries SELECT policy (migration 40) requires
-- status='active'. Postgres's row-security machinery requires an UPDATE's
-- resulting row to still satisfy the table's SELECT policy for the
-- executing role — an UPDATE that moves a row's status AWAY from 'active'
-- (exactly what marking a finding superseded/resolved does) fails with
-- "new row violates row-level security policy," REGARDLESS of how
-- permissive the UPDATE policy's own USING/WITH CHECK are, and regardless
-- of whether the client requests RETURNING. This was already latent in
-- every existing self-serve adapter that calls insertRegistryEntry's
-- supersede step under a MEMBER's own session (wearables.ts, foodLens.ts,
-- movement.ts, foodProducts.ts) — it simply never surfaced because no
-- existing test exercises a second, real supersede event for those
-- source_features under a member session (the two adapters that DO have
-- integration coverage of a real supersede, bodyAssessment.ts and
-- coachIntelligence.ts, run under a COACH session, whose
-- coach_read_assigned_registry_entries SELECT policy has no status
-- restriction — coincidentally sidestepping this bug rather than fixing
-- it). Fixed once, centrally, the same way find_active_registry_entry
-- already solves the equivalent read-side visibility problem: a
-- SECURITY DEFINER RPC that runs the UPDATE with the row owner's real
-- authorization check baked into the function body instead of relying on
-- table-level RLS policies (which remain in place, defense in depth, for
-- any other direct write path).
create or replace function supersede_registry_entry(
  p_id uuid,
  p_superseded_by_id uuid
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update registry_entries
  set status = 'superseded', superseded_by_id = p_superseded_by_id, updated_at = now()
  where id = p_id
    and (
      member_id = auth.uid()
      or public.is_active_coach_for(auth.uid(), member_id)
      or public.has_active_role(auth.uid(), 'platform_administrator')
    );
$$;

revoke all on function supersede_registry_entry(uuid, uuid) from public;
grant execute on function supersede_registry_entry(uuid, uuid) to authenticated, service_role;
