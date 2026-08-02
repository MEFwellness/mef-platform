/**
 * Personal Reset Plan — the one place raw member_reset_plans /
 * member_reset_plan_versions / member_reset_plan_daily_logs rows are
 * mapped to/from the domain types in lib/reset-plan/types.ts. Every
 * mutator that changes plan content writes a real version row in the same
 * call, mirroring lib/driver-probe-admin/data.ts's recordRevision
 * discipline, under the same caller-scoped SupabaseClient so changed_by
 * stays RLS-verified.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Signal } from '../life-signal-check/constants';
import type { ValueArea } from '../core-values-snapshot/constants';
import type { ReadinessPattern, Q6Answer } from '../readiness-pulse/constants';
import type { CvsScoring } from '../core-values-snapshot/types';
import type { LscScoring } from '../life-signal-check/types';
import type { RplScoring } from '../readiness-pulse/types';
import type { ActionTier, ResetPlanDailyState, ResetPlanDay3Response, ResetPlanScreen, ResetPlanStatus } from './constants';
import { EMPTY_RESET_PLAN_SNAPSHOT, type ResetPlan, type ResetPlanDailyLog, type ResetPlanSnapshot, type ResetPlanVersion } from './types';

type Row = Record<string, unknown>;

function mapSnapshot(row: Row): ResetPlanSnapshot {
  if (!row.snapshot_computed_at) return EMPTY_RESET_PLAN_SNAPSHOT;
  return {
    topValue: (row.snapshot_top_value as ValueArea | null) ?? null,
    loudestSignal: (row.snapshot_loudest_signal as Signal | null) ?? null,
    finalReadinessPattern: (row.snapshot_final_readiness_pattern as ReadinessPattern | null) ?? null,
    q6Obstacle: (row.snapshot_q6_obstacle as Q6Answer | null) ?? null,
    targetSignal: (row.snapshot_target_signal as Signal | null) ?? null,
    cvs: (row.snapshot_cvs as CvsScoring | null) ?? null,
    lsc: (row.snapshot_lsc as LscScoring | null) ?? null,
    rpl: (row.snapshot_rpl as RplScoring | null) ?? null,
    computedAt: row.snapshot_computed_at as string,
  };
}

function mapPlan(row: Row): ResetPlan {
  return {
    id: row.id as string,
    memberId: row.member_id as string,
    status: row.status as ResetPlanStatus,
    currentScreen: row.current_screen as ResetPlanScreen,
    focusSignal: (row.focus_signal as Signal | null) ?? null,
    actionTier: (row.action_tier as ActionTier | null) ?? null,
    snapshot: mapSnapshot(row),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    activatedAt: (row.activated_at as string | null) ?? null,
    startLocalDate: (row.start_local_date as string | null) ?? null,
    day7AcknowledgedAt: (row.day7_acknowledged_at as string | null) ?? null,
  };
}

const PLAN_COLUMNS =
  'id, member_id, status, current_screen, focus_signal, action_tier, snapshot_top_value, snapshot_loudest_signal, snapshot_final_readiness_pattern, snapshot_q6_obstacle, snapshot_target_signal, snapshot_cvs, snapshot_lsc, snapshot_rpl, snapshot_computed_at, created_at, updated_at, activated_at, start_local_date, day7_acknowledged_at';

/** The member's one current (draft or active) plan, if any. */
export async function getCurrentResetPlan(supabase: SupabaseClient, memberId: string): Promise<ResetPlan | null> {
  const { data, error } = await supabase
    .from('member_reset_plans')
    .select(PLAN_COLUMNS)
    .eq('member_id', memberId)
    .in('status', ['draft', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapPlan(data);
}

export async function getResetPlanById(supabase: SupabaseClient, planId: string): Promise<ResetPlan | null> {
  const { data, error } = await supabase.from('member_reset_plans').select(PLAN_COLUMNS).eq('id', planId).maybeSingle();
  if (error || !data) return null;
  return mapPlan(data);
}

type SnapshotInput = {
  topValue: ValueArea | null;
  loudestSignal: Signal | null;
  finalReadinessPattern: ReadinessPattern | null;
  q6Obstacle: Q6Answer | null;
  targetSignal: Signal | null;
  cvs: CvsScoring | null;
  lsc: LscScoring | null;
  rpl: RplScoring | null;
};

/**
 * Creates a new draft plan with its input snapshot, plus the 'created'
 * V1 version row. Idempotent under a race: the partial unique index
 * (member_reset_plans_one_current) rejects a concurrent second insert
 * with a real Postgres unique_violation (23505) — that case is treated as
 * success, and the caller re-fetches the real row that won the race,
 * never surfacing a duplicate-plan error to a member who simply double-
 * tapped or refreshed.
 */
export async function createDraftResetPlan(supabase: SupabaseClient, memberId: string, snapshot: SnapshotInput): Promise<ResetPlan | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('member_reset_plans')
    .insert({
      member_id: memberId,
      status: 'draft',
      current_screen: 'intro',
      snapshot_top_value: snapshot.topValue,
      snapshot_loudest_signal: snapshot.loudestSignal,
      snapshot_final_readiness_pattern: snapshot.finalReadinessPattern,
      snapshot_q6_obstacle: snapshot.q6Obstacle,
      snapshot_target_signal: snapshot.targetSignal,
      snapshot_cvs: snapshot.cvs,
      snapshot_lsc: snapshot.lsc,
      snapshot_rpl: snapshot.rpl,
      snapshot_computed_at: nowIso,
    })
    .select(PLAN_COLUMNS)
    .maybeSingle();

  if (error) {
    // 23505 = unique_violation. Someone else's concurrent request already
    // created this member's one current plan; that row is the real,
    // correct one to resume.
    if (error.code === '23505') {
      return getCurrentResetPlan(supabase, memberId);
    }
    console.error('createDraftResetPlan failed', error);
    return null;
  }
  if (!data) return null;

  const plan = mapPlan(data);
  await recordResetPlanVersion(supabase, plan, {
    changeType: 'created',
    before: null,
    after: { status: 'draft', snapshotComputedAt: nowIso },
    decisionEvidence: null,
  });
  return plan;
}

export async function updateResetPlanScreen(supabase: SupabaseClient, planId: string, memberId: string, screen: ResetPlanScreen): Promise<void> {
  await supabase
    .from('member_reset_plans')
    .update({ current_screen: screen, updated_at: new Date().toISOString() })
    .eq('id', planId)
    .eq('member_id', memberId);
}

export async function recordResetPlanVersion(
  supabase: SupabaseClient,
  plan: Pick<ResetPlan, 'id' | 'memberId'>,
  params: { changeType: ResetPlanVersion['changeType']; before: Record<string, unknown> | null; after: Record<string, unknown> | null; decisionEvidence: Record<string, unknown> | null; changedBy?: string }
): Promise<void> {
  const { error } = await supabase.from('member_reset_plan_versions').insert({
    plan_id: plan.id,
    member_id: plan.memberId,
    change_type: params.changeType,
    before: params.before,
    after: params.after,
    decision_evidence: params.decisionEvidence,
    changed_by: params.changedBy ?? plan.memberId,
  });
  if (error) console.error('recordResetPlanVersion failed', error);
}

/** Idempotent: a repeated submission of the same focus is a no-op, no duplicate version row. */
export async function setResetPlanFocus(
  supabase: SupabaseClient,
  plan: ResetPlan,
  chosenSignal: Signal,
  proposedSignal: Signal | null
): Promise<ResetPlan> {
  if (plan.focusSignal === chosenSignal) return plan;

  const { error } = await supabase
    .from('member_reset_plans')
    .update({ focus_signal: chosenSignal, current_screen: 'why', updated_at: new Date().toISOString() })
    .eq('id', plan.id);
  if (error) {
    console.error('setResetPlanFocus failed', error);
    return plan;
  }

  await recordResetPlanVersion(supabase, plan, {
    changeType: 'focus_chosen',
    before: { focusSignal: plan.focusSignal },
    after: { focusSignal: chosenSignal },
    decisionEvidence: { proposedSignal, chosenSignal, followedProposal: proposedSignal !== null && proposedSignal === chosenSignal },
  });

  return { ...plan, focusSignal: chosenSignal, currentScreen: 'why' };
}

/** Idempotent: a repeated submission of the same tier is a no-op, no duplicate version row. */
export async function setResetPlanActionTier(
  supabase: SupabaseClient,
  plan: ResetPlan,
  chosenTier: ActionTier,
  proposedTier: ActionTier
): Promise<ResetPlan> {
  if (plan.actionTier === chosenTier) return plan;

  const { error } = await supabase
    .from('member_reset_plans')
    .update({ action_tier: chosenTier, current_screen: 'agreement', updated_at: new Date().toISOString() })
    .eq('id', plan.id);
  if (error) {
    console.error('setResetPlanActionTier failed', error);
    return plan;
  }

  await recordResetPlanVersion(supabase, plan, {
    changeType: 'action_tier_chosen',
    before: { actionTier: plan.actionTier },
    after: { actionTier: chosenTier },
    decisionEvidence: { proposedTier, chosenTier, shrunk: chosenTier !== proposedTier },
  });

  return { ...plan, actionTier: chosenTier, currentScreen: 'agreement' };
}

/**
 * Activates the plan (draft -> active). Idempotent: the update only ever
 * touches a row still in 'draft', so a retry against an already-active
 * plan matches zero rows and writes no second 'activated' version.
 */
export async function activateResetPlan(supabase: SupabaseClient, plan: ResetPlan, startLocalDate: string): Promise<ResetPlan> {
  if (plan.status === 'active') return plan;

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('member_reset_plans')
    .update({ status: 'active', current_screen: 'done', activated_at: nowIso, start_local_date: startLocalDate, updated_at: nowIso })
    .eq('id', plan.id)
    .eq('status', 'draft')
    .select(PLAN_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    // Either a real error, or someone else's concurrent request already
    // activated this exact plan — either way, re-read the real row.
    const existing = await getResetPlanById(supabase, plan.id);
    return existing ?? plan;
  }

  const activated = mapPlan(data);
  await recordResetPlanVersion(supabase, activated, {
    changeType: 'activated',
    before: { status: 'draft' },
    after: { status: 'active', focusSignal: activated.focusSignal, actionTier: activated.actionTier },
    decisionEvidence: null,
  });
  return activated;
}

export async function listResetPlanVersions(supabase: SupabaseClient, planId: string): Promise<ResetPlanVersion[]> {
  const { data, error } = await supabase
    .from('member_reset_plan_versions')
    .select('id, plan_id, change_type, before, after, decision_evidence, changed_at')
    .eq('plan_id', planId)
    .order('changed_at', { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    planId: row.plan_id as string,
    changeType: row.change_type as ResetPlanVersion['changeType'],
    before: (row.before as Record<string, unknown> | null) ?? null,
    after: (row.after as Record<string, unknown> | null) ?? null,
    decisionEvidence: (row.decision_evidence as Record<string, unknown> | null) ?? null,
    changedAt: row.changed_at as string,
  }));
}

export async function getLatestResetPlanVersionId(supabase: SupabaseClient, planId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('member_reset_plan_versions')
    .select('id')
    .eq('plan_id', planId)
    .order('changed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.id as string;
}

function mapDailyLog(row: Row): ResetPlanDailyLog {
  return {
    id: row.id as string,
    planId: row.plan_id as string,
    planVersionId: row.plan_version_id as string,
    localDate: row.local_date as string,
    state: (row.state as ResetPlanDailyState | null) ?? null,
    day3Response: (row.day3_response as ResetPlanDay3Response | null) ?? null,
    loggedAt: row.logged_at as string,
  };
}

const DAILY_LOG_COLUMNS = 'id, plan_id, plan_version_id, local_date, state, day3_response, logged_at';

export async function listResetPlanDailyLogs(supabase: SupabaseClient, planId: string): Promise<ResetPlanDailyLog[]> {
  const { data, error } = await supabase
    .from('member_reset_plan_daily_logs')
    .select(DAILY_LOG_COLUMNS)
    .eq('plan_id', planId)
    .order('local_date', { ascending: true });
  if (error || !data) return [];
  return data.map(mapDailyLog);
}

/**
 * One final state per member/plan/local day: a real database constraint
 * (unique (plan_id, local_date)) backs this, so a correction to today's
 * choice updates the existing row via upsert's own conflict target,
 * never inserts a duplicate — same shape as
 * lib/core-values-snapshot/dailyLogsData.ts's upsertCvsDailyLog.
 */
export async function upsertResetPlanDailyLog(
  supabase: SupabaseClient,
  memberId: string,
  planId: string,
  planVersionId: string,
  localDate: string,
  state: ResetPlanDailyState
): Promise<boolean> {
  const { error } = await supabase
    .from('member_reset_plan_daily_logs')
    .upsert(
      {
        plan_id: planId,
        plan_version_id: planVersionId,
        member_id: memberId,
        local_date: localDate,
        state,
        logged_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'plan_id,local_date' }
    );
  if (error) {
    console.error('upsertResetPlanDailyLog failed', error);
    return false;
  }
  return true;
}

/** The day-3 qualitative response, stored on that day's own log row (never clobbers an existing daily state, same partial-SET upsert discipline as upsertResetPlanDailyLog above). */
export async function submitResetPlanDay3Response(
  supabase: SupabaseClient,
  memberId: string,
  planId: string,
  planVersionId: string,
  localDate: string,
  response: ResetPlanDay3Response
): Promise<boolean> {
  const { error } = await supabase
    .from('member_reset_plan_daily_logs')
    .upsert(
      {
        plan_id: planId,
        plan_version_id: planVersionId,
        member_id: memberId,
        local_date: localDate,
        day3_response: response,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'plan_id,local_date' }
    );
  if (error) {
    console.error('submitResetPlanDay3Response failed', error);
    return false;
  }
  return true;
}

export async function acknowledgeResetPlanDay7(supabase: SupabaseClient, planId: string, memberId: string): Promise<boolean> {
  const { error } = await supabase
    .from('member_reset_plans')
    .update({ day7_acknowledged_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', planId)
    .eq('member_id', memberId);
  if (error) {
    console.error('acknowledgeResetPlanDay7 failed', error);
    return false;
  }
  return true;
}
