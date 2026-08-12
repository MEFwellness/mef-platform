/**
 * Priority Card — orchestration.
 *
 * Reads what already exists and hands it to the pure hierarchy in
 * ./select.ts. Every input below comes from a system that shipped before
 * this build, through that system's own published accessor:
 *
 *   rule 0  lib/return-greeting/absence.ts + ./data.ts's session_started read
 *   rule 1  lib/reset-plan/data.ts (getCurrentResetPlan, listResetPlanDailyLogs)
 *           and lib/reset-plan/actionLibrary.ts for the agreed wording
 *   rule 2  lib/case-view/investigation.ts's buildInvestigationPanel over
 *           lib/driver-library/data.ts + lib/correlation-engine/data.ts,
 *           with the reason sentence from lib/case-view/findings.ts
 *   rule 3  lib/assessment-registry/facts.ts + the Reset Plan's own draft state
 *   rule 4  the Coaching Brain's decision, passed in by the caller that
 *           already fetched it, never fetched a second time here
 *
 * This module computes no correlation, no driver state, no content
 * selection, and no score. It picks between conclusions other systems
 * already reached.
 *
 * Best-effort throughout: a failure anywhere resolves to "no card" rather
 * than an exception, because every caller is a page render the member is
 * already waiting on.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyCheckin } from '@mef/shared-types-contracts';
import { daysBetweenLocalDates } from '../feed/dateMath';
import { classifyPresence } from '../return-greeting/absence';
import { RETURN_GREETING_TEXT } from '../return-greeting/copy';
import {
  listActiveDrivers,
  listDriverDomains,
  listDriverGoalWeights,
  listMemberDriverStates,
} from '../driver-library/data';
import { listActiveCandidatePairs } from '../correlation-engine/data';
import { listMemberPatternStates } from '../longitudinal-intelligence/data';
import { fetchLatestMemberGoalSelection } from '../member-goals/data';
import { WELCOME_GOALS } from '../welcome/goals';
import { buildInvestigationPanel } from '../case-view/investigation';
import { buildFindings } from '../case-view/findings';
import {
  getCurrentResetPlan,
  getLatestResetPlanVersionId,
  listResetPlanDailyLogs,
} from '../reset-plan/data';
import { resetPlanAction } from '../reset-plan/actionLibrary';
import { getMemberAssessmentFacts } from '../assessment-registry/facts';
import { listAssessmentRegistryEntries } from '../assessment-registry/registry';
import { getLastSignInLocalDateBefore, claimDailyPriority, getDailyPriority } from './data';
import { selectPriority } from './select';
import { buildPriorityBridge, previousLocalDate } from './transition';
import type {
  ImplicatedDriverInput,
  IncompleteActionInput,
  PriorityInputs,
  PriorityView,
  ResetPlanCommitmentInput,
  TodaysFocusInput,
} from './types';

/** What the caller already has in hand, so this service never re-fetches it. */
export type PriorityContext = {
  /** Oldest-first, per getRecentCheckins' contract. */
  recentCheckins: DailyCheckin[];
  /** Built by the caller from the Coaching Brain's decision it already fetched. */
  todaysFocus: TodaysFocusInput | null;
  /** Whether today's Daily Reset is already complete. Decides which half of the final fallback applies. */
  checkinDoneToday: boolean;
  /** All-time completed check-ins, for the fallback's honest count. */
  totalCheckins: number;
};

/**
 * Rule 4's input, mapped from the Coaching Brain's decision. Lives here
 * rather than in each caller so the Today page, Home, and the pop-up chain
 * can never disagree about what "today's focus" means or which fields of
 * the decision it reads.
 *
 * Deliberately duck-typed on the fields it actually uses rather than
 * importing the CoachingDecision type: app/actions/coaching-brain.ts is a
 * 'use server' module, and importing its types into lib/ would drag a
 * server-action boundary into a plain library the pure engine also uses.
 */
export function toTodaysFocusInput(
  decision: {
    feedItem: { id: string; focus_text: string } | null;
    reasonText?: string | null;
    content: { suggested_action: string | null } | null;
  } | null
): TodaysFocusInput | null {
  if (!decision?.feedItem) return null;
  return {
    feedItemId: decision.feedItem.id,
    focusText: decision.feedItem.focus_text,
    reasonText: decision.reasonText ?? null,
    suggestedAction: decision.content?.suggested_action ?? null,
  };
}

// ---------------------------------------------------------------------
// Rule 1 — an active Reset Plan commitment not completed today.
// ---------------------------------------------------------------------

async function loadResetPlanCommitment(
  supabase: SupabaseClient,
  memberId: string,
  todayLocalDate: string
): Promise<{ commitment: ResetPlanCommitmentInput | null; draftPlanCreatedAt: string | null }> {
  const plan = await getCurrentResetPlan(supabase, memberId);
  if (!plan) return { commitment: null, draftPlanCreatedAt: null };

  // A draft plan is not a commitment: she never finished agreeing to it.
  // It is an abandoned experience instead, which is rule 3's business.
  if (plan.status !== 'active') {
    return { commitment: null, draftPlanCreatedAt: plan.createdAt };
  }

  // An active plan always has both of these; the guard keeps the types
  // honest rather than asserting.
  if (!plan.focusSignal || !plan.actionTier) {
    return { commitment: null, draftPlanCreatedAt: null };
  }

  const [logs, planVersionId] = await Promise.all([
    listResetPlanDailyLogs(supabase, plan.id),
    getLatestResetPlanVersionId(supabase, plan.id),
  ]);

  // "Not completed today" uses the Reset Plan's own three-state rule: a
  // row with no state is not a completion, and no row at all is never
  // treated as an implicit miss (migration 142's own accuracy rule).
  const todaysLog = logs.find((log) => log.localDate === todayLocalDate);
  if (todaysLog?.state) return { commitment: null, draftPlanCreatedAt: null };

  if (!planVersionId) return { commitment: null, draftPlanCreatedAt: null };

  const action = resetPlanAction(plan.focusSignal, plan.actionTier);
  const daysLogged = logs.filter((log) => log.state !== null).length;
  const daysSinceStart = plan.startLocalDate
    ? daysBetweenLocalDates(plan.startLocalDate, todayLocalDate)
    : 0;

  return {
    commitment: {
      planId: plan.id,
      planVersionId,
      actionText: action.normal,
      difficultDayText: action.difficult,
      daysLogged,
      daysSinceStart,
    },
    draftPlanCreatedAt: null,
  };
}

// ---------------------------------------------------------------------
// Rule 2 — a strongly implicated, goal-relevant driver.
// ---------------------------------------------------------------------

/**
 * Uses Case View's own investigation panel rather than re-deriving "which
 * drivers matter to her goals", so the two surfaces can never disagree
 * about what Root is looking at. `likelyInvolved` is by definition the
 * 'implicated' bucket, so 'watching' cannot reach this rule.
 *
 * The reason sentence is the correlation engine's own member-facing
 * wording for the finding that did the implicating, matched through the
 * driver state's `implicatingPairs` evidence summary, which is exactly
 * what lib/driver-state-engine/classify.ts records when it promotes a
 * driver to 'implicated'.
 */
async function loadImplicatedDriver(
  supabase: SupabaseClient,
  memberId: string
): Promise<ImplicatedDriverInput | null> {
  const [goalSelection, drivers, domains, goalWeights, driverStates, candidatePairs, patternStates] =
    await Promise.all([
      fetchLatestMemberGoalSelection(supabase, memberId),
      listActiveDrivers(supabase),
      listDriverDomains(supabase),
      listDriverGoalWeights(supabase),
      listMemberDriverStates(supabase, memberId),
      listActiveCandidatePairs(supabase),
      listMemberPatternStates(supabase, memberId),
    ]);

  const memberGoalKeys = goalSelection?.goals ?? [];
  const domainLabelByKey = new Map(domains.map((d) => [d.key, d.label]));

  const panel = buildInvestigationPanel(
    drivers,
    domainLabelByKey,
    goalWeights,
    memberGoalKeys,
    driverStates,
    candidatePairs
  );

  const winner = panel.likelyInvolved[0];
  if (!winner) return null;

  const driver = drivers.find((d) => d.id === winner.driverId);
  if (!driver) return null;

  const findings = buildFindings([...patternStates.values()], candidatePairs, memberGoalKeys);
  const implicatingPairs = driverStates.get(winner.driverId)?.evidenceSummary
    ?.implicatingPairs as string[] | undefined;

  // Strongest earned finding among the pairs that actually implicated this
  // driver. Null when none of them is one of her goal-relevant earned
  // findings, in which case the card shows no reason line at all rather
  // than substituting a weaker or unrelated sentence.
  const findingSentence =
    findings
      .filter((f) => implicatingPairs?.includes(f.pairKey))
      .sort((a, b) => b.tier - a.tier || b.confidence - a.confidence)[0]?.memberSentence ?? null;

  return {
    driverId: driver.id,
    label: driver.label,
    whatItObserves: driver.whatItObserves,
    findingSentence,
  };
}

// ---------------------------------------------------------------------
// Rule 3 — an incomplete high-value action.
// ---------------------------------------------------------------------

/**
 * Two real sources, in this order:
 *   1. A Reset Plan still sitting in 'draft'. She opened the experience
 *      that builds her plan and left before agreeing to it, which is the
 *      single highest-value thing in the product she can be part-way
 *      through.
 *   2. Any registered assessment whose completion status is 'in_progress',
 *      taken from the registry's own facts layer (which reads
 *      assessment_status_by_member, covering every assessment engine in
 *      the product, not just the newest one). Lowest displayOrder wins,
 *      which is the registry's own idea of what comes first.
 *
 * `lastTouchedLocalDate` is only ever a real timestamp from the source
 * system. The registry's status view does not expose a started_at, so an
 * assessment candidate carries null and the card shows no reason line for
 * it. That is the honest outcome, not a gap to paper over.
 */
async function loadIncompleteAction(
  supabase: SupabaseClient,
  memberId: string,
  draftPlanCreatedAt: string | null
): Promise<IncompleteActionInput | null> {
  if (draftPlanCreatedAt) {
    return {
      key: 'personal-reset-plan',
      name: 'your Personal Reset Plan',
      href: '/reset-plan',
      resumeHint:
        'You are already part of the way through. Opening it again picks up on the exact screen you left, and you can stop again any time.',
      lastTouchedLocalDate: draftPlanCreatedAt.slice(0, 10),
    };
  }

  const facts = await getMemberAssessmentFacts(supabase, memberId);
  const entry = listAssessmentRegistryEntries().find(
    (e) => facts.get(e.key)?.completionStatus === 'in_progress'
  );
  if (!entry) return null;

  return {
    key: entry.key,
    name: entry.displayName,
    href: entry.takeRoute ?? entry.route,
    resumeHint:
      'Your answers so far are saved. Open it and answer one more question, then leave it if that is enough for today.',
    lastTouchedLocalDate: null,
  };
}

// ---------------------------------------------------------------------
// The final fallback's one lookup.
// ---------------------------------------------------------------------

/**
 * Her own stated onboarding goal, as the label she actually saw and
 * picked, or null if she never went through goal selection.
 *
 * `primaryGoal` first, then the first of her selected goals — the same
 * "her own words first" preference Case View's own header logic already
 * applies. Reads member_goal_selections through its existing accessor and
 * WELCOME_GOALS for the label, so the card can never name a goal
 * differently from the screen she chose it on.
 */
async function loadStatedGoalLabel(
  supabase: SupabaseClient,
  memberId: string
): Promise<string | null> {
  const selection = await fetchLatestMemberGoalSelection(supabase, memberId);
  if (!selection) return null;

  const key = selection.primaryGoal ?? selection.goals[0] ?? null;
  if (!key) return null;

  // 'something_else' is a placeholder for her free text, not a goal in
  // itself. Use what she actually typed when it exists, and otherwise say
  // nothing rather than quoting the placeholder back at her.
  if (key === 'something_else') {
    return selection.goalsOther?.trim() ? selection.goalsOther.trim() : null;
  }

  return WELCOME_GOALS.find((goal) => goal.key === key)?.label ?? null;
}

// ---------------------------------------------------------------------

/**
 * The whole decision, end to end. Returns null only when the row could not
 * be claimed (see the fail-closed note below); the hierarchy itself is now
 * total and always produces a priority.
 *
 * Claims today's row as a side effect, so the same priority Root showed
 * her this morning is the one she sees this afternoon even if a driver
 * state was recomputed in between. See claimDailyPriority for why that is
 * an insert-if-absent and never an overwrite.
 */
export async function buildPriorityView(
  supabase: SupabaseClient,
  memberId: string,
  todayLocalDate: string,
  context: PriorityContext
): Promise<PriorityView | null> {
  try {
    const latestCheckin = context.recentCheckins[context.recentCheckins.length - 1] ?? null;
    const daysSinceLastCheckin = latestCheckin
      ? daysBetweenLocalDates(latestCheckin.local_date, todayLocalDate)
      : null;

    const [lastSignInLocalDate, resetPlanResult] = await Promise.all([
      getLastSignInLocalDateBefore(supabase, memberId, todayLocalDate),
      loadResetPlanCommitment(supabase, memberId, todayLocalDate),
    ]);

    const presence = classifyPresence({
      daysSinceLastCheckin,
      daysSinceLastSignIn: lastSignInLocalDate
        ? daysBetweenLocalDates(lastSignInLocalDate, todayLocalDate)
        : null,
    });

    // Today's already-recorded decision, if she has one. Read before the
    // remaining rules so an existing row can short-circuit the work: once
    // Root has committed to a priority for the day, recomputing the losing
    // rules changes nothing she can see.
    //
    // Yesterday's row is read alongside it, for the "Building on
    // yesterday..." presentation only. Same accessor, same table, one
    // extra date-scoped lookup on a request-memoized path. It is
    // deliberately NOT an input to selectPriority and cannot reach it:
    // what Root decided today is decided by today's evidence, and this
    // only asks whether the handover from yesterday is worth showing her.
    const [existing, yesterday] = await Promise.all([
      getDailyPriority(supabase, memberId, todayLocalDate),
      getDailyPriority(supabase, memberId, previousLocalDate(todayLocalDate)),
    ]);

    // The re-entry override clears "after she engages once", which is
    // exactly what a done or saved status on today's row records.
    const isReEntry = presence === 're_entry' && existing?.status !== 'done' && existing?.status !== 'saved';

    const [implicatedDriver, incompleteAction, statedGoalLabel] = await Promise.all([
      loadImplicatedDriver(supabase, memberId),
      loadIncompleteAction(supabase, memberId, resetPlanResult.draftPlanCreatedAt),
      loadStatedGoalLabel(supabase, memberId),
    ]);

    const inputs: PriorityInputs = {
      isReEntry,
      resetPlan: resetPlanResult.commitment,
      implicatedDriver,
      incompleteAction,
      todaysFocus: context.todaysFocus,
      // The final fallback, which always applies, so the hierarchy can
      // never come up empty and the pop-up always has something to carry.
      // checkinDoneToday comes from the caller, which already knows
      // whether today's Daily Reset exists.
      fallback: {
        checkinDoneToday: context.checkinDoneToday,
        totalCheckins: context.totalCheckins,
        statedGoalLabel,
      },
      hasRealHistory: context.recentCheckins.length > 0,
    };

    const fresh = selectPriority(inputs, todayLocalDate);

    // Today's already-recorded decision wins over a fresh one. The winning
    // rule genuinely changes during the day (marking a Reset Plan
    // commitment done is exactly what makes rule 1 stop applying), and
    // swapping the card's content out from under a member who just acted
    // on it would be wrong. So the stored row is authoritative for the
    // rule and the words; only the reason line is regenerated, and only
    // when the live hierarchy still agrees which rule is in play. When it
    // does not, there is no honest current reason and the card shows none.
    if (existing) {
      const shown: typeof fresh = {
        rule: existing.rule,
        priorityKey: existing.priorityKey,
        title: existing.title,
        reason: fresh.rule === existing.rule ? fresh.reason : null,
        help: existing.help,
        href: existing.href,
      };
      return {
        selected: shown,
        status: existing.status,
        localDate: todayLocalDate,
        // Compared against what she is actually being shown today, not
        // against the freshly recomputed winner, so the bridge can never
        // claim a change she cannot see on the card in front of her.
        bridge: buildPriorityBridge(yesterday, shown, todayLocalDate),
        isReEntry,
        welcomeLine: isReEntry ? RETURN_GREETING_TEXT : null,
      };
    }

    const record = await claimDailyPriority(supabase, memberId, todayLocalDate, fresh);

    // Fail closed. If the row could not be claimed, the card's three
    // buttons would have nothing to write to: Done and Save for later
    // would appear to work and silently do nothing on the next load. A
    // card that cannot keep its promises is worse than no card, so this
    // renders nothing at all instead. Same discipline as
    // tryMarkReturnGreetingShown, which never shows a greeting it cannot
    // confirm it owns.
    if (!record) return null;

    return {
      selected: fresh,
      status: record.status,
      localDate: todayLocalDate,
      bridge: buildPriorityBridge(yesterday, fresh, todayLocalDate),
      isReEntry,
      // Root's one established return sentence, never a second welcome
      // authored by this feature. See lib/return-greeting/absence.ts for
      // why the card speaks the Root Presence System's own words here.
      welcomeLine: isReEntry ? RETURN_GREETING_TEXT : null,
    };
  } catch (error) {
    console.error('buildPriorityView failed', error);
    return null;
  }
}
