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
import { hasEverCompleted, type MemberAssessmentFacts } from '../assessment-registry/status';
import type { AssessmentDefinition, AssessmentKey } from '../assessment-registry/types';
import {
  getLastSignInLocalDateBefore,
  claimDailyPriority,
  getDailyPriority,
  redecideDailyPriority,
} from './data';
import { selectCoachingAction, type AdaptationContext } from './select';
import { buildPriorityBridge, previousLocalDate } from './transition';
import { listCoachingThreads, getCoachingDecision } from '../coaching-direction/data';
import { listThreadCooldowns } from '../coaching-direction/escalationData';
import { actionTypeGradeMap } from '../coaching-direction/gradesData';
import { loadCoachingGrades } from '../coaching-direction/gradesService';
import {
  FRICTION_OPTIONS,
  FRICTION_QUESTION,
  FRICTION_NOTE_PLACEHOLDER,
} from '../coaching-direction/friction';
import { listThreadFriction, markFrictionAsked } from '../coaching-direction/frictionData';
import {
  loadBehavioralFriction,
  loadMovementInput,
  loadUnresolvedSafetyFlag,
  selectQualifiedPattern,
  selectQualifiedPatternTies,
} from '../coaching-direction/signals';
import {
  notifyCoachOfSafetyFlag,
  persistCoachingDecision,
  resolveOutstandingOutcomes,
} from '../coaching-direction/service';
import { getWeekFocus } from '../weekly-review/data';
import { weekStartFor } from '../weekly-review/week';
import { PRIORITY_LADDER, PRIORITY_OVERRIDES } from './types';
import type {
  PriorityFrictionQuestion,
  BehavioralFrictionInput,
  ImplicatedDriverInput,
  IncompleteActionInput,
  PriorityInputs,
  PriorityRule,
  PriorityView,
  QualifiedPatternInput,
  ResetPlanCommitmentInput,
  TodaysFocusInput,
} from './types';

/**
 * Where each rule sits on the ladder, derived from PRIORITY_LADDER itself
 * rather than restated, so the lazy friction load below can ask "did the
 * first pass get as far as rule 5" without hard-coding an order that lives
 * somewhere else. The two overrides are not on the ladder and are given an
 * index of -1: they are above everything, which is the correct answer to
 * "did the walk reach friction" (it did not).
 */
const LADDER_INDEX: Record<PriorityRule, number> = (() => {
  const index = Object.fromEntries(
    PRIORITY_LADDER.map((rule, position) => [rule, position])
  ) as Record<PriorityRule, number>;
  for (const override of PRIORITY_OVERRIDES) index[override] = -1;
  return index;
})();

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
async function loadFindingRules(
  supabase: SupabaseClient,
  memberId: string
): Promise<{
  implicatedDriver: ImplicatedDriverInput | null;
  /** The rest of the same likelyInvolved bucket, equally ranked. Read only by the week-focus tie-break. */
  implicatedDriverAlternates: ImplicatedDriverInput[];
  qualifiedPattern: QualifiedPatternInput | null;
  /** Tier 3 findings identical to the winner on confidence AND observation count. Same contract. */
  qualifiedPatternAlternates: QualifiedPatternInput[];
}> {
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

  // Built once and used by BOTH halves of rule 4. The earned-findings list
  // is the input to the driver's reason line and to the tier 3 rule that
  // sits directly below it, and computing it twice in one render would be
  // a second chance for the two to disagree about the same data.
  const findings = buildFindings([...patternStates.values()], candidatePairs, memberGoalKeys);
  const qualifiedPattern = selectQualifiedPattern(findings);
  const qualifiedPatternAlternates = selectQualifiedPatternTies(findings);

  const empty = {
    implicatedDriver: null,
    implicatedDriverAlternates: [],
    qualifiedPattern,
    qualifiedPatternAlternates,
  };

  const winner = panel.likelyInvolved[0];
  if (!winner) return empty;

  /**
   * One entry in the bucket, turned into rule 2's input.
   *
   * The reason sentence is the strongest earned finding among the pairs
   * that actually implicated THIS driver. Null when none of them is one of
   * her goal-relevant earned findings, in which case the card shows no
   * reason line at all rather than substituting a weaker or unrelated
   * sentence. That logic was already here for the winner; it is now a
   * function so the alternates get it too, rather than a second, simpler
   * version of it.
   */
  const toInput = (driverId: string): ImplicatedDriverInput | null => {
    const driver = drivers.find((d) => d.id === driverId);
    if (!driver) return null;

    const implicatingPairs = driverStates.get(driverId)?.evidenceSummary?.implicatingPairs as
      | string[]
      | undefined;

    const findingSentence =
      findings
        .filter((f) => implicatingPairs?.includes(f.pairKey))
        .sort((a, b) => b.tier - a.tier || b.confidence - a.confidence)[0]?.memberSentence ?? null;

    return {
      driverId: driver.id,
      domainKey: driver.domainKey,
      label: driver.label,
      whatItObserves: driver.whatItObserves,
      findingSentence,
    };
  };

  const implicatedDriver = toInput(winner.driverId);
  if (!implicatedDriver) return empty;

  // Every OTHER driver in the same likelyInvolved bucket. By that panel's
  // own definition they are all implicated and all goal-relevant, so they
  // sit on the same rung as the winner and rule 2 has always picked between
  // them by array order alone.
  const implicatedDriverAlternates = panel.likelyInvolved
    .slice(1)
    .map((entry) => toInput(entry.driverId))
    .filter((input): input is ImplicatedDriverInput => input !== null);

  return {
    implicatedDriver,
    implicatedDriverAlternates,
    qualifiedPattern,
    qualifiedPatternAlternates,
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
/**
 * The assessment rule 3 may legitimately ask her to pick up: one she has
 * an open draft of and has NEVER finished. Lowest displayOrder wins, which
 * is the registry's own idea of what comes first.
 *
 * COMPLETION IS PERMANENT (2026-08-27). This used to be a bare
 * `completionStatus === 'in_progress'`, which is ALSO true for an
 * assessment she finished and then had a draft opened on top of, because
 * `assessment_status_by_member` lets a draft outrank a completion. So the
 * day's one priority became "Pick up Core Values Snapshot where you left
 * off" for a member who had answered all twelve of its questions the night
 * before. Pure and exported so that stays under test without a database.
 */
export function pickResumableAssessment(
  facts: Map<AssessmentKey, MemberAssessmentFacts>
): AssessmentDefinition | null {
  return (
    listAssessmentRegistryEntries().find((entry) => {
      const entryFacts = facts.get(entry.key);
      if (!entryFacts) return false;
      return entryFacts.completionStatus === 'in_progress' && !hasEverCompleted(entryFacts);
    }) ?? null
  );
}

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
  const entry = pickResumableAssessment(facts);
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

    // Close the books on every past decision that never got an outcome,
    // before anything reads a thread counter. Gated on today having no row
    // yet, which makes this the FIRST render of a new day and exactly one
    // pass per day. Without the gate it would re-run on every page view
    // for no benefit; without it happening at all, "ignored three days
    // running" could never become true, because a day with no response is
    // only knowable once that day is over.
    if (!existing) {
      await resolveOutstandingOutcomes(supabase, memberId, todayLocalDate);
    }

    // The re-entry override clears "after she engages once", which is
    // exactly what a done or saved status on today's row records.
    const isReEntry = presence === 're_entry' && existing?.status !== 'done' && existing?.status !== 'saved';

    const [
      findingRules,
      incompleteAction,
      statedGoalLabel,
      safetyFlag,
      rawThreads,
      cooldowns,
      grades,
      movement,
      friction,
    ] = await Promise.all([
      loadFindingRules(supabase, memberId),
      loadIncompleteAction(supabase, memberId, resetPlanResult.draftPlanCreatedAt),
      loadStatedGoalLabel(supabase, memberId),
      loadUnresolvedSafetyFlag(supabase, memberId),
      listCoachingThreads(supabase, memberId),
      // Part 3's two additive reads. Both live in their own fail-closed
      // queries rather than in the thread/decision column lists Part 1
      // selects on this same path, so before migration 152 exists both come
      // back empty and this whole engine is byte-identical to Part 2. See
      // lib/coaching-direction/escalationData.ts's header.
      listThreadCooldowns(supabase, memberId),
      loadCoachingGrades(supabase, memberId),
      // Root Movement (migrations 153 and 154). Its own fail-closed loader,
      // so an environment without the tables returns null and this engine is
      // byte-identical to the build before the movement flip. See
      // lib/coaching-direction/signals.ts's loadMovementInput.
      loadMovementInput(supabase, memberId, todayLocalDate),
      // The friction question's own fail-closed read (migration 166). Before
      // that migration exists this returns `available: false`, which makes
      // the engine decline to ask and leaves it byte-identical to the build
      // before the question existed. See lib/coaching-direction/frictionData.ts.
      listThreadFriction(supabase, memberId),
    ]);

    // The post-resolution cooldown merged onto the thread state the pure
    // engine reads. A thread with no cooldown row is left exactly as
    // listCoachingThreads returned it.
    const threads = new Map(
      [...rawThreads.entries()].map(([key, thread]) => [
        key,
        { ...thread, escalationCooldownUntil: cooldowns.get(key) ?? null },
      ])
    );

    const inputs: PriorityInputs = {
      safetyFlag,
      isReEntry,
      resetPlan: resetPlanResult.commitment,
      implicatedDriver: findingRules.implicatedDriver,
      implicatedDriverAlternates: findingRules.implicatedDriverAlternates,
      qualifiedPattern: findingRules.qualifiedPattern,
      qualifiedPatternAlternates: findingRules.qualifiedPatternAlternates,
      incompleteAction,
      // Loaded lazily below, only if the first pass gets far enough down
      // the ladder for it to matter.
      behavioralFriction: null,
      todaysFocus: context.todaysFocus,
      movement,
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

    // Yesterday's decision, reduced to the one fact the follow-on
    // guardrail is allowed to see: did she finish it. Read from the
    // outcome ledger rather than from yesterday's priority row, because
    // the ledger is where a response genuinely lives.
    const yesterdayDecision = await getCoachingDecision(
      supabase,
      memberId,
      previousLocalDate(todayLocalDate)
    );

    // This week's focus, from the Weekly Root Review (Part 2). Read, never
    // written, here: the review composes it once a week and this is the one
    // consumer. It reaches the engine as a TIE-BREAKER between candidates on
    // the same rung and can do nothing else, which is a property of
    // lib/weekly-review/focus.ts's reorder rather than a promise made here.
    //
    // A null focus (no review yet, an older week, a member who has never had
    // one) leaves the engine byte-identical to Part 1.
    const weekFocus = await getWeekFocus(supabase, memberId, weekStartFor(todayLocalDate));

    const adaptation: AdaptationContext = {
      threads,
      completedYesterdayThreadKey:
        yesterdayDecision?.memberResponse === 'done' ? yesterdayDecision.threadKey : null,
      weekFocus,
      // Action-type scope only. The accessor is what enforces that, rather
      // than a filter here: see lib/coaching-direction/preference.ts on why
      // a thread-scoped grade must not reach the within-rung reorder.
      grades: actionTypeGradeMap(grades),
      // What she has already told Root got in the way, and whether an answer
      // could be stored at all.
      friction: friction.byThread,
      frictionAvailable: friction.available,
    };

    let decision = selectCoachingAction(inputs, todayLocalDate, adaptation);

    // Rule 5 is loaded LAZILY, in a second pass, and only when the first
    // pass actually reached its slot on the ladder. The friction signals
    // service is five queries through a separate client; running them on
    // a day when a Reset Plan commitment was always going to win would be
    // pure cost for a result nothing reads.
    //
    // The second pass is a full re-run rather than a patch, so the winner
    // is decided by one function on one complete input set. Determinism
    // is the whole reason this engine is a pure function.
    const frictionWouldHaveMattered =
      LADDER_INDEX[decision.selected.rule] >= LADDER_INDEX.behavioral_friction;
    const existingIsFriction = existing?.rule === 'behavioral_friction';

    if (frictionWouldHaveMattered || existingIsFriction) {
      const behavioralFriction: BehavioralFrictionInput | null = await loadBehavioralFriction(
        supabase,
        memberId,
        todayLocalDate
      );
      if (behavioralFriction) {
        decision = selectCoachingAction(
          { ...inputs, behavioralFriction },
          todayLocalDate,
          adaptation
        );
      }
    }

    const fresh = decision.selected;

    // Today's already-recorded decision wins over a fresh one. The winning
    // rule genuinely changes during the day (marking a Reset Plan
    // commitment done is exactly what makes rule 1 stop applying), and
    // swapping the card's content out from under a member who just acted
    // on it would be wrong. So the stored row is authoritative for the
    // rule and the words; only the reason line is regenerated, and only
    // when the live hierarchy still agrees which rule is in play. When it
    // does not, there is no honest current reason and the card shows none.
    // The question, when one is live. Built once here from the engine's own
    // verdict so both branches below render the identical object.
    const frictionQuestion: PriorityFrictionQuestion | null = decision.askFriction
      ? {
          threadKey: decision.askFriction.threadKey,
          question: FRICTION_QUESTION,
          options: FRICTION_OPTIONS,
          notePlaceholder: FRICTION_NOTE_PLACEHOLDER,
        }
      : null;

    if (existing) {
      // THE DAY'S PRIORITY WAITS FOR THE DAILY RESET (2026-08-27).
      //
      // Today's stored decision is authoritative, and that is still the
      // rule. There is exactly one exception, and it is the common
      // morning: the card is shown the moment she opens Home, which is
      // usually before she has checked in, so Root decided her whole day
      // without today's answers in front of it. `redecideDailyPriority`
      // allows a single revision, and only when the first decision really
      // was made before the check-in, the check-in now exists, and she has
      // not already acted on the card. Its own UPDATE carries those
      // conditions, so two concurrent renders cannot both revise, and
      // `redecided_at` is what makes it once rather than a loop.
      const revised =
        existing.decidedBeforeCheckin && context.checkinDoneToday && existing.redecidedAt === null
          ? await redecideDailyPriority(supabase, memberId, todayLocalDate, fresh)
          : null;

      // The revision, if one happened, wrote the fresh decision, so the
      // ledger has to hear about the same thing the card is now showing.
      if (revised) {
        await persistCoachingDecision(supabase, memberId, {
          selected: fresh,
          threadChanges: decision.threadChanges,
          isFollowOn: decision.isFollowOn,
          localDate: todayLocalDate,
        });
      }

      const authoritative = revised ?? existing;
      const shown: typeof fresh = {
        ...fresh,
        rule: authoritative.rule,
        priorityKey: authoritative.priorityKey,
        title: authoritative.title,
        reason: fresh.rule === authoritative.rule ? fresh.reason : null,
        help: authoritative.help,
        href: authoritative.href,
      };
      return {
        selected: shown,
        status: authoritative.status,
        localDate: todayLocalDate,
        // Compared against what she is actually being shown today, not
        // against the freshly recomputed winner, so the bridge can never
        // claim a change she cannot see on the card in front of her.
        bridge: buildPriorityBridge(yesterday, shown, todayLocalDate),
        isReEntry,
        welcomeLine: isReEntry ? RETURN_GREETING_TEXT : null,
        frictionQuestion,
      };
    }

    // Recorded on the claim: whether Root had seen today's Daily Reset when
    // it decided. That single fact is what lets the branch above revise
    // once, later in the day, without ever having to guess from timestamps.
    const record = await claimDailyPriority(
      supabase,
      memberId,
      todayLocalDate,
      fresh,
      !context.checkinDoneToday
    );

    // Fail closed. If the row could not be claimed, the card's three
    // buttons would have nothing to write to: Done and Save for later
    // would appear to work and silently do nothing on the next load. A
    // card that cannot keep its promises is worse than no card, so this
    // renders nothing at all instead. Same discipline as
    // tryMarkReturnGreetingShown, which never shows a greeting it cannot
    // confirm it owns.
    if (!record) return null;

    // The ledger row, the thread row, and any approach change or
    // escalation the engine asked for. Written only on the render that
    // genuinely claimed the day, so one decision produces one ledger row.
    await persistCoachingDecision(supabase, memberId, {
      selected: fresh,
      threadChanges: decision.threadChanges,
      isFollowOn: decision.isFollowOn,
      localDate: todayLocalDate,
    });

    // The safety override's coach notification. Deduped on the
    // classification id inside the alert layer, so a flag that stays open
    // for a week raises one alert, not seven.
    if (fresh.rule === 'safety' && safetyFlag) {
      await notifyCoachOfSafetyFlag(supabase, memberId, safetyFlag.safetyClassificationId);
    }

    // Record that the question genuinely reached her, on the same decision
    // row `persistCoachingDecision` just wrote. Best-effort: if this fails,
    // the question simply gets asked again tomorrow rather than the render
    // breaking.
    if (decision.askFriction) {
      await markFrictionAsked(supabase, memberId, todayLocalDate);
    }

    return {
      selected: fresh,
      status: record.status,
      localDate: todayLocalDate,
      bridge: buildPriorityBridge(yesterday, fresh, todayLocalDate),
      isReEntry,
      frictionQuestion,
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
