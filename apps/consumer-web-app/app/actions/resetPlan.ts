/**
 * apps/consumer-web-app/app/actions/resetPlan.ts
 *
 * The only place a Server/Client Component reaches into the Personal
 * Reset Plan. Entitlement is enforced here (lib/reset-plan/eligibility.ts),
 * server-side, on every action, never trusted from the UI alone. The
 * input snapshot is recomputed here from each free experience's own real
 * scoring engine (computeCvsScoring/computeLscScoring/computeRplScoring)
 * against its most recently COMPLETED session — never a second downstream
 * answer reader, never parsed narrative prose. Same "thin action-layer
 * wrapper over lib/*" discipline as app/actions/coreValuesSnapshot.ts,
 * lifeSignalCheck.ts, readinessPulse.ts.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { getUnifiedAssessmentDefinitionByKey } from '@/lib/assessment-foundation/repository';
import { getSessionById } from '@/lib/assessment-runtime';
import { localDateFor } from './rootMap';
import { hasResetPlanAccess } from '@/lib/reset-plan/eligibility';
import { CVS_KEY } from '@/lib/core-values-snapshot/constants';
import { LSC_KEY } from '@/lib/life-signal-check/constants';
import { RPL_KEY } from '@/lib/readiness-pulse/constants';
import { computeCvsScoring } from '@/lib/core-values-snapshot/scoring';
import { computeLscScoring } from '@/lib/life-signal-check/scoring';
import { computeRplScoring } from '@/lib/readiness-pulse/scoring';
import type { CoachingTonePreference } from '@mef/shared-types-contracts';
import type { Signal } from '@/lib/life-signal-check/constants';
import type { ActionTier, ResetPlanDailyState, ResetPlanDay3Response, ResetPlanScreen } from '@/lib/reset-plan/constants';
import type { ResetPlan, ResetPlanDailyLog, ResetPlanSnapshot, ResetPlanVersion } from '@/lib/reset-plan/types';
import { buildResetPlanProposal, resetPlanProposedTier, shouldOfferDifficultDayVersion } from '@/lib/reset-plan/copy';
import { isDay3Eligible, isDay7Eligible } from '@/lib/core-values-snapshot/experiment';
import {
  acknowledgeResetPlanDay7,
  activateResetPlan,
  createDraftResetPlan,
  getCurrentResetPlan,
  getLatestResetPlanVersionId,
  getResetPlanById,
  listResetPlanDailyLogs,
  listResetPlanVersions,
  setResetPlanActionTier,
  setResetPlanFocus,
  submitResetPlanDay3Response,
  updateResetPlanScreen,
  upsertResetPlanDailyLog,
} from '@/lib/reset-plan/data';

type SupabaseServerClient = ReturnType<typeof createClient>;

async function requireMemberId(): Promise<string | null> {
  const user = await getCachedUser();
  return user?.id ?? null;
}

/**
 * The input snapshot — recomputed from each experience's own most
 * recently COMPLETED session via its own real scoring engine. Any
 * experience with no completed session degrades that piece of the
 * snapshot to null; nothing here is ever invented.
 */
async function computeResetPlanSnapshot(supabase: SupabaseServerClient, memberId: string): Promise<ResetPlanSnapshot> {
  const [cvsDefinition, lscDefinition, rplDefinition] = await Promise.all([
    getUnifiedAssessmentDefinitionByKey(supabase, CVS_KEY),
    getUnifiedAssessmentDefinitionByKey(supabase, LSC_KEY),
    getUnifiedAssessmentDefinitionByKey(supabase, RPL_KEY),
  ]);

  async function latestCompletedAnswers(definitionId: string | undefined) {
    if (!definitionId) return null;
    const { data } = await supabase
      .from('unified_assessment_sessions')
      .select('id')
      .eq('member_id', memberId)
      .eq('assessment_definition_id', definitionId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const session = await getSessionById(supabase, data.id as string);
    return session?.answers ?? null;
  }

  const cvsAnswers = await latestCompletedAnswers(cvsDefinition?.id);
  const cvs = cvsAnswers ? computeCvsScoring(cvsAnswers) : null;

  const lscAnswers = await latestCompletedAnswers(lscDefinition?.id);
  const lsc = lscAnswers
    ? computeLscScoring(lscAnswers, cvs ? { topValue: cvs.topValue, branch: cvs.branch } : null)
    : null;

  const rplAnswers = await latestCompletedAnswers(rplDefinition?.id);
  const rpl = rplAnswers
    ? computeRplScoring(
        rplAnswers,
        lsc ? { loudestSignal: lsc.loudestSignal, pattern: lsc.pattern, hardestTimeOfDay: lsc.hardestTimeOfDay } : null
      )
    : null;

  return {
    topValue: cvs?.topValue ?? null,
    loudestSignal: lsc && lsc.pattern !== 'quiet_body' ? lsc.loudestSignal : null,
    finalReadinessPattern: rpl?.finalPattern ?? null,
    q6Obstacle: rpl?.q6 ?? null,
    targetSignal: rpl?.targetSignal ?? (lsc && lsc.pattern !== 'quiet_body' ? lsc.loudestSignal : null),
    cvs,
    lsc,
    rpl,
    computedAt: new Date().toISOString(),
  };
}

/** Entitlement — presence of profiles.reset_plan_granted_at, checked server-side on every action below, never trusted from the UI alone. */
export async function getMyResetPlanAccessAction(): Promise<boolean> {
  const memberId = await requireMemberId();
  if (!memberId) return false;
  return hasResetPlanAccess(createClient(), memberId);
}

export type ResetPlanDashboardState =
  | { kind: 'not_granted' }
  | { kind: 'before' }
  | { kind: 'mid_creation'; plan: ResetPlan }
  | {
      kind: 'active';
      plan: ResetPlan;
      logs: ResetPlanDailyLog[];
      todayLocalDate: string;
      todayState: ResetPlanDailyState | null;
      offerDifficultDay: boolean;
      isDay3Eligible: boolean;
      day3Answered: boolean;
      isDay7Eligible: boolean;
      day7Acknowledged: boolean;
    };

/** The dashboard entry card's three states, per the locked build brief. */
export async function getMyResetPlanDashboardStateAction(): Promise<ResetPlanDashboardState> {
  const memberId = await requireMemberId();
  if (!memberId) return { kind: 'not_granted' };
  const supabase = createClient();

  const granted = await hasResetPlanAccess(supabase, memberId);
  if (!granted) return { kind: 'not_granted' };

  const plan = await getCurrentResetPlan(supabase, memberId);
  if (!plan) return { kind: 'before' };
  if (plan.status === 'draft') return { kind: 'mid_creation', plan };

  const logs = await listResetPlanDailyLogs(supabase, plan.id);
  const todayLocalDate = await localDateFor(supabase, memberId);
  const todayLog = logs.find((l) => l.localDate === todayLocalDate) ?? null;
  const startLocalDate = plan.startLocalDate ?? todayLocalDate;

  return {
    kind: 'active',
    plan,
    logs,
    todayLocalDate,
    todayState: todayLog?.state ?? null,
    offerDifficultDay: shouldOfferDifficultDayVersion(logs),
    isDay3Eligible: isDay3Eligible(startLocalDate, todayLocalDate),
    day3Answered: logs.some((l) => l.day3Response !== null),
    isDay7Eligible: isDay7Eligible(startLocalDate, todayLocalDate),
    day7Acknowledged: plan.day7AcknowledgedAt !== null,
  };
}

/**
 * Screen 5's miss-handling copy reads the existing, single
 * wellness_coaching_style_profile system (never a parallel taxonomy).
 * Screen 2/4 choices are never written here or read from here.
 *
 * Goes through get_my_coaching_tone_preference() (migration 142), a
 * narrow security-definer function, rather than selecting the table
 * directly: wellness_coaching_style_profile deliberately has no member
 * SELECT policy (tests/intelligence-core-integration.test.ts pins this —
 * confidence/rationale/the other dimensions are coach-internal working
 * data, same boundary as wellness_profile_dimensions). This experience
 * only ever needs the one coarse tone_preference category, never the
 * internal confidence/rationale, so it goes through this narrow function
 * instead of asking for a blanket table grant.
 */
export async function getMyCoachingTonePreferenceAction(): Promise<CoachingTonePreference> {
  const memberId = await requireMemberId();
  if (!memberId) return 'unclear';
  const { data, error } = await createClient().rpc('get_my_coaching_tone_preference');
  if (error) {
    console.error('getMyCoachingTonePreferenceAction failed', error);
    return 'unclear';
  }
  return (data as CoachingTonePreference | null) ?? 'unclear';
}

/** For the standalone creation-flow page: her current draft/active plan, if any (never creates one). */
export async function getMyResetPlanAction(): Promise<ResetPlan | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;
  return getCurrentResetPlan(createClient(), memberId);
}

export type StartResetPlanResult = { ok: true; plan: ResetPlan } | { ok: false; error: string };

/**
 * Starts a brand new plan, or resumes the one already in progress.
 * Idempotent under refresh/double-tap/retry: lib/reset-plan/data.ts's
 * createDraftResetPlan catches the real Postgres unique_violation the
 * partial unique index raises on a concurrent second insert and re-reads
 * the row that actually won, rather than ever creating a duplicate.
 */
export async function startOrResumeResetPlanAction(): Promise<StartResetPlanResult> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };
  const supabase = createClient();

  const granted = await hasResetPlanAccess(supabase, memberId);
  if (!granted) return { ok: false, error: 'The Personal Reset Plan is not available on your account yet.' };

  const existing = await getCurrentResetPlan(supabase, memberId);
  if (existing) return { ok: true, plan: existing };

  const snapshot = await computeResetPlanSnapshot(supabase, memberId);
  const plan = await createDraftResetPlan(supabase, memberId, snapshot);
  if (!plan) return { ok: false, error: 'Could not start your plan. Try again in a moment.' };
  return { ok: true, plan };
}

export async function updateMyResetPlanScreenAction(planId: string, screen: ResetPlanScreen): Promise<{ ok: boolean }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false };
  await updateResetPlanScreen(createClient(), planId, memberId, screen);
  return { ok: true };
}

export type ResetPlanMutationResult = { ok: true; plan: ResetPlan } | { ok: false; error: string };

/** Focus/tier are only ever mutable while the plan is still in creation (status 'draft') — once active, only the version history records changes, and this build ships no replace flow. */
async function loadOwnedDraftPlan(supabase: SupabaseServerClient, memberId: string, planId: string): Promise<ResetPlan | null> {
  const plan = await getResetPlanById(supabase, planId);
  if (!plan || plan.memberId !== memberId || plan.status !== 'draft') return null;
  return plan;
}

/** Screen 2's decision. Recorded as structured plan decision evidence (lib/reset-plan/data.ts's setResetPlanFocus), never as tone-preference evidence. */
export async function chooseResetPlanFocusAction(planId: string, chosenSignal: Signal): Promise<ResetPlanMutationResult> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };
  const supabase = createClient();

  const plan = await loadOwnedDraftPlan(supabase, memberId, planId);
  if (!plan) return { ok: false, error: 'Could not find your plan.' };

  const proposedSignal = buildResetPlanProposal(plan.snapshot).signal;
  const updated = await setResetPlanFocus(supabase, plan, chosenSignal, proposedSignal);
  return { ok: true, plan: updated };
}

/** Screen 4's decision, including any shrink from the proposed tier. Recorded as structured plan decision evidence, never as tone-preference evidence. */
export async function chooseResetPlanActionTierAction(planId: string, chosenTier: ActionTier): Promise<ResetPlanMutationResult> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };
  const supabase = createClient();

  const plan = await loadOwnedDraftPlan(supabase, memberId, planId);
  if (!plan) return { ok: false, error: 'Could not find your plan.' };

  const proposedTier = resetPlanProposedTier(plan.snapshot);
  const updated = await setResetPlanActionTier(supabase, plan, chosenTier, proposedTier);
  return { ok: true, plan: updated };
}

/** Screen 6's completion. Idempotent: lib/reset-plan/data.ts's activateResetPlan only ever transitions a real 'draft' row, so a retry against an already-active plan is a safe no-op. */
export async function completeResetPlanAction(planId: string): Promise<ResetPlanMutationResult> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };
  const supabase = createClient();

  const plan = await loadOwnedDraftPlan(supabase, memberId, planId);
  if (!plan) return { ok: false, error: 'Could not find your plan.' };
  if (!plan.focusSignal || !plan.actionTier) return { ok: false, error: 'Finish choosing a focus and an action first.' };

  const startLocalDate = plan.startLocalDate ?? (await localDateFor(supabase, memberId));
  const activated = await activateResetPlan(supabase, plan, startLocalDate);
  return { ok: true, plan: activated };
}

export type LogResetPlanDayResult = { ok: true } | { ok: false; error: string };

/** The daily card's three explicit states. A member correcting today's tap updates the existing row (unique (plan_id, local_date)), never inserts a duplicate. */
export async function logResetPlanDayAction(planId: string, state: ResetPlanDailyState): Promise<LogResetPlanDayResult> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };
  const supabase = createClient();

  const plan = await getResetPlanById(supabase, planId);
  if (!plan || plan.memberId !== memberId || plan.status !== 'active') return { ok: false, error: 'Could not find an active plan.' };

  const versionId = await getLatestResetPlanVersionId(supabase, planId);
  if (!versionId) return { ok: false, error: 'This plan has no version history yet.' };

  const localDate = await localDateFor(supabase, memberId);
  const ok = await upsertResetPlanDailyLog(supabase, memberId, planId, versionId, localDate, state);
  return ok ? { ok: true } : { ok: false, error: 'Could not save that.' };
}

export async function submitResetPlanDay3ResponseAction(planId: string, response: ResetPlanDay3Response): Promise<LogResetPlanDayResult> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };
  const supabase = createClient();

  const plan = await getResetPlanById(supabase, planId);
  if (!plan || plan.memberId !== memberId || plan.status !== 'active') return { ok: false, error: 'Could not find an active plan.' };

  const versionId = await getLatestResetPlanVersionId(supabase, planId);
  if (!versionId) return { ok: false, error: 'This plan has no version history yet.' };

  const localDate = await localDateFor(supabase, memberId);
  const ok = await submitResetPlanDay3Response(supabase, memberId, planId, versionId, localDate, response);
  return ok ? { ok: true } : { ok: false, error: 'Could not save that.' };
}

export async function acknowledgeResetPlanDay7Action(planId: string): Promise<LogResetPlanDayResult> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };
  const supabase = createClient();

  const plan = await getResetPlanById(supabase, planId);
  if (!plan || plan.memberId !== memberId) return { ok: false, error: 'Could not find your plan.' };

  const ok = await acknowledgeResetPlanDay7(supabase, planId, memberId);
  return ok ? { ok: true } : { ok: false, error: 'Could not save that.' };
}

export async function getResetPlanDailyLogsAction(planId: string): Promise<ResetPlanDailyLog[]> {
  const memberId = await requireMemberId();
  if (!memberId) return [];
  const supabase = createClient();
  const plan = await getResetPlanById(supabase, planId);
  if (!plan || plan.memberId !== memberId) return [];
  return listResetPlanDailyLogs(supabase, planId);
}

// ---------------------------------------------------------------
// Coach read-only view
// ---------------------------------------------------------------

export type ClientResetPlanView = {
  plan: ResetPlan;
  versions: ResetPlanVersion[];
  logs: ResetPlanDailyLog[];
} | null;

/** Read-only for the coach's client view — RLS itself (coach_read_assigned_member_reset_plans, migration 142) is the real boundary; this is only the UX-side check, same dual discipline as every other coach-facing action in this codebase. */
export async function getClientResetPlanAction(clientId: string): Promise<ClientResetPlanView> {
  const user = await getCachedUser();
  if (!user) return null;
  const supabase = createClient();

  const isCoachOrAdmin = (await hasActiveRole(supabase, user.id, 'coach')) || (await hasActiveRole(supabase, user.id, 'platform_administrator'));
  if (!isCoachOrAdmin) return null;

  const { data, error } = await supabase
    .from('member_reset_plans')
    .select(
      'id, member_id, status, current_screen, focus_signal, action_tier, snapshot_top_value, snapshot_loudest_signal, snapshot_final_readiness_pattern, snapshot_q6_obstacle, snapshot_target_signal, snapshot_cvs, snapshot_lsc, snapshot_rpl, snapshot_computed_at, created_at, updated_at, activated_at, start_local_date, day7_acknowledged_at'
    )
    .eq('member_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const plan = await getResetPlanById(supabase, data.id as string);
  if (!plan) return null;

  const [versions, logs] = await Promise.all([listResetPlanVersions(supabase, plan.id), listResetPlanDailyLogs(supabase, plan.id)]);
  return { plan, versions, logs };
}
