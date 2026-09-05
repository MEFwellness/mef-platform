/**
 * DAY 6, composing the plan from real rows, once.
 *
 * EVERY CARD TRACES TO A ROW. There is no branch in this file that can
 * produce a card out of nothing: a top value needs a completed Core Values
 * Snapshot session, a loudest signal needs a completed Life Signal Check
 * session, an experiment card needs a lifestyle_experiments row, an
 * observation needs a published member_pattern_states row, the fatigue
 * callback needs a bound member_public_entry_origin with a pattern on it,
 * and the Tier A card needs one of exactly three named sources. Where a row
 * is missing, the card is ABSENT. Nothing is hedged, nothing is filled in,
 * and there is no "closest match".
 *
 * THIN DATA FIRST. Tier A is the ordinary case for a free trial account on
 * its sixth day, so it is the first thing decided and the shape everything
 * else is an addition to.
 *
 * NOTHING HERE IS CALLED FROM A RENDER. This is reached only from
 * ./recapData.ts's ensureTrialArcRecap, which is reached only from the two
 * beacon-backed actions in app/actions/trialArcDelivery.ts: the receipt
 * fired by a mounted effect on the pop-up that genuinely displayed, and the
 * recap screen's own open beacon. A page or a layout that composed this
 * would write a recap for a screen nobody opened.
 *
 * IT IS COMPOSED ONCE AND NEVER RECOMPUTED. The row is insert-if-absent, so
 * the recap she reads on the continuation screen in Prompt 6 is exactly the
 * one she read on day 6, with the same numbers, whatever has happened since.
 *
 * WHY IT DOES NOT ASK THE ASSESSMENT REGISTRY. Completion here is read
 * through the unified runtime's own completed sessions, which is what the
 * results screens read and what lib/trial-arc/connection.ts already reads
 * for day 5. The registry's facts accessor answers a different question
 * (may she open this, on her plan), and that is a gate. This module needs
 * "did she finish it", which is a row.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublicEntryPatternKey } from '@mef/shared-types-contracts';
import { getUnifiedAssessmentDefinitionByKey } from '../assessment-foundation/repository';
import { findLatestCompletedSession, getSessionById } from '../assessment-runtime';
import type { SessionAnswers } from '../assessment-runtime/types';
import { CVS_KEY } from '../core-values-snapshot/constants';
import { computeCvsScoring } from '../core-values-snapshot/scoring';
import { LSC_KEY } from '../life-signal-check/constants';
import { computeLscScoring } from '../life-signal-check/scoring';
import { RPL_KEY } from '../readiness-pulse/constants';
import { computeRplScoring } from '../readiness-pulse/scoring';
import type { LscContextForRpl } from '../readiness-pulse/types';
import { listMyLifestyleExperiments } from '../lifestyle-experiments';
import { listExperimentOfferDismissals } from '../root-popup-messages/data';
import { listMemberPatternStates } from '../longitudinal-intelligence/data';
import type { LongitudinalSignal } from '../longitudinal-intelligence/types';
import { metricKeyFromSignalKey } from '../longitudinal-intelligence/metricSignals';
import { fetchLatestMemberGoalSelection } from '../member-goals/data';
import { getMemberOrigin } from '../public-entry/data';
import type { ValueArea } from '../core-values-snapshot/constants';
import type { Signal } from '../life-signal-check/constants';
import type { ReadinessPattern } from '../readiness-pulse/constants';
import { WELCOME_GOAL_KEY_SET, isPublicEntryPatternKey } from './recapTypes';
import type {
  TrialArcRecapCard,
  TrialArcRecapNextStep,
  TrialArcRecapPlan,
  TrialArcRecapTier,
} from './recapTypes';
import { sanitizeRecapPlan } from './recapPlan';
import { deriveTrialArcExperimentFacts } from './experimentFacts';
import { listTrialArcCheckinDates, listTrialArcExperimentLogDates } from './data';
import type { TrialDay } from './day';

/**
 * The states a published signal may be read back in on day 6, and the tier
 * ceiling.
 *
 * TIER 3 IS REFUSED OUTRIGHT rather than rendered more modestly. The
 * three-tier language module's own tier 3 openers contain the word pattern
 * ("A consistent pattern is emerging"), and day 6 sits far below
 * lib/longitudinal-intelligence/signalState.ts's own twenty one day span
 * for an established chain. A signal that somehow arrived at tier 3 inside
 * a six day old account is not something this screen has any business
 * reading back, so it is dropped and the card is simply absent.
 */
const OBSERVATION_MAX_TIER = 2;

const OBSERVABLE_STATES = new Set([
  'one_time_observation',
  'repeated_signal',
  'improving',
  'worsening',
  'stable',
]);

/**
 * The one check-in observation, or null.
 *
 * Only check-in metric signals, because the recap's own counted line is
 * about her Daily Resets and a registry finding from a questionnaire is not
 * something this week showed. Strongest tier first, then strongest
 * confidence, which is the same ordering lib/weekly-reflection/recap.ts
 * already uses for the same rows.
 */
export function selectRecapObservation(
  patternStates: readonly LongitudinalSignal[]
): Extract<TrialArcRecapCard, { kind: 'checkin_observation' }> | null {
  const eligible = patternStates
    .filter((signal) => metricKeyFromSignalKey(signal.signalKey) !== null)
    .filter((signal) => OBSERVABLE_STATES.has(signal.state))
    .filter((signal) => signal.tier === 1 || signal.tier === OBSERVATION_MAX_TIER)
    .sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0) || b.confidence - a.confidence);

  const best = eligible[0];
  if (!best || (best.tier !== 1 && best.tier !== 2)) return null;
  return {
    kind: 'checkin_observation',
    signalKey: best.signalKey,
    state: best.state,
    tier: best.tier,
  };
}

/** What the free arc's next unfinished conversation is, for a Tier A recap's button. */
export function nextUnfinishedStep(done: {
  cvs: boolean;
  lsc: boolean;
  rpl: boolean;
}): TrialArcRecapNextStep {
  if (!done.cvs) return 'core_values_snapshot';
  if (!done.lsc) return 'life_signal_check';
  if (!done.rpl) return 'readiness_pulse';
  return 'case';
}

/** One completed session for a key, already scored by the engine that owns it, or null. */
async function latestAnswers(
  supabase: SupabaseClient,
  memberId: string,
  key: string
): Promise<SessionAnswers | null> {
  const definition = await getUnifiedAssessmentDefinitionByKey(supabase, key);
  if (!definition) return null;
  const latest = await findLatestCompletedSession(supabase, memberId, definition.id);
  if (!latest) return null;
  const session = await getSessionById(supabase, latest.id);
  return session ? session.answers : null;
}

// ---------------------------------------------------------------------
// THE ASSEMBLER. Pure, synchronous and total.
//
// Every rule about which cards a recap holds lives here, over facts that
// were read somewhere else, so the whole three-tier decision is testable
// with fixtures and no database anywhere near it. The reader below is a
// dumb translation of rows into these facts and holds no rules of its own.
// ---------------------------------------------------------------------

/** Her seven day experiment, as the recap needs to see it. */
export interface TrialArcRecapExperimentFacts {
  started: boolean;
  active: boolean;
  declined: boolean;
  /** Distinct days logged against it, inside its own span. */
  daysLogged: number;
  durationDays: number;
}

/** Everything the assembler decides from. Rows already read, scorings already computed by the engines that own them. */
export interface TrialArcRecapFacts {
  /** Which day of her trial the recap is being composed on. */
  dayNumber: number;
  /** Distinct days she logged a Daily Reset on, inside the trial window. */
  checkinDays: number;
  /** Core Values Snapshot's own answer, or null when it is not finished. */
  cvs: { topValue: ValueArea } | null;
  /** Life Signal Check's own answer, or null. `scores` is her real 0 to 3 per signal. */
  lsc: { chosenSignal: Signal; scores: Record<Signal, number> } | null;
  /** Readiness Pulse's own final pattern, or null. */
  rpl: { finalPattern: ReadinessPattern } | null;
  /** Her bound quiz arrival's pattern, or null when there is no arrival or it was never finished. */
  arrivalPatternKey: PublicEntryPatternKey | null;
  /** Her stated reason for being here, as a WELCOME_GOALS key, or null. */
  goalKey: string | null;
  experiment: TrialArcRecapExperimentFacts;
  /** member_pattern_states, already classified and already tiered elsewhere. Never re-tiered here. */
  patternStates: readonly LongitudinalSignal[];
}

export function assembleTrialArcRecapPlan(facts: TrialArcRecapFacts): TrialArcRecapPlan | null {
  const done = { cvs: facts.cvs !== null, lsc: facts.lsc !== null, rpl: facts.rpl !== null };
  const conversations = [done.cvs, done.lsc, done.rpl].filter(Boolean).length;

  // The tier. Thin data first, and each step up needs the one below it.
  const tier: TrialArcRecapTier =
    done.cvs && done.lsc ? (done.rpl && facts.checkinDays > 0 ? 'C' : 'B') : 'A';

  const cards: TrialArcRecapCard[] = [];

  // THE FATIGUE CALLBACK, FIRST IN THE REVEAL ORDER, and only when a bound
  // quiz arrival with a real result exists. An origin row whose pattern_key
  // is null means she started Where Your Energy Goes and never finished it,
  // so there is no quiz result to reference and no callback.
  if (facts.arrivalPatternKey) {
    cards.push({ kind: 'fatigue_callback', patternKey: facts.arrivalPatternKey });
  }

  if (tier === 'A') {
    // ONE CARD, FROM THE ONE SOURCE THAT GENUINELY HAS SOMETHING, and never
    // the arrival twice: when the callback above is already carrying it,
    // the one thing card falls through to the next real source rather than
    // repeating the same sentence in two boxes. If the arrival is the only
    // thing that exists, the callback IS the one thing, which is why this
    // can legitimately add nothing.
    if (facts.goalKey && WELCOME_GOAL_KEY_SET.has(facts.goalKey)) {
      cards.push({
        kind: 'one_thing',
        source: 'goal',
        patternKey: null,
        goalKey: facts.goalKey,
        metrics: {},
      });
    } else if (facts.checkinDays > 0) {
      cards.push({
        kind: 'one_thing',
        source: 'checkin',
        patternKey: null,
        goalKey: null,
        metrics: { checkinDays: facts.checkinDays },
      });
    }
    // Anything else adds no card, deliberately. An arrival she never
    // finished carries no result to tell her back, and an account with
    // nothing on it at all gets the plain, warm sentence the screen has for
    // exactly that, never "here is what we learned" over nothing.
  } else {
    // Tier B and Tier C. Both conversations are genuinely finished, so both
    // cards are real reads rather than branches.
    if (facts.cvs) cards.push({ kind: 'top_value', valueArea: facts.cvs.topValue });
    if (facts.lsc) {
      cards.push({
        kind: 'loudest_signal',
        signal: facts.lsc.chosenSignal,
        signalScores: facts.lsc.scores,
      });
    }

    // THE EXPERIMENT, IN ITS OWN HONEST STATE, AND NEVER A DECLINE. A
    // declined experiment produces no card at all: the arc respects a
    // decline and does not put it back on a screen as a thing she did not
    // do. There is deliberately no slug for one either, so there is no
    // shape a decline could be stored in and then hidden at render time.
    if (facts.experiment.started && !facts.experiment.declined) {
      cards.push({
        kind: 'experiment',
        state: facts.experiment.active ? 'running' : 'ran',
        metrics: {
          daysLogged: facts.experiment.daysLogged,
          durationDays: facts.experiment.durationDays,
        },
      });
    }

    if (tier === 'C') {
      if (facts.rpl) cards.push({ kind: 'readiness', readinessPattern: facts.rpl.finalPattern });
      const observation = selectRecapObservation(facts.patternStates);
      // No observation clears the bar, no observation card, no filler.
      if (observation) cards.push(observation);
    }
  }

  // Sanitized on the way in as well as on the way out, so a card this build
  // composed is held to exactly the same vocabulary as one read back from a
  // row somebody wrote by hand.
  return sanitizeRecapPlan({
    tier,
    fatigueCallback: facts.arrivalPatternKey !== null,
    cards,
    counts: { trialDays: facts.dayNumber, checkinDays: facts.checkinDays, conversations },
    nextStep: tier === 'A' ? nextUnfinishedStep(done) : null,
  });
}

// ---------------------------------------------------------------------
// THE READER. Rows in, facts out, and no rules of its own.
// ---------------------------------------------------------------------

export interface TrialArcRecapInputs {
  day: TrialDay;
  now: Date;
}

/**
 * The plan for one member, from her own rows.
 *
 * Returns null only when the plan cannot be sanitized at all. A Tier A
 * recap over an account with literally nothing on it is a valid plan with
 * no cards, and that is the honest, warm state the screen is designed
 * around, not a failure.
 */
export async function composeTrialArcRecapPlan(
  supabase: SupabaseClient,
  memberId: string,
  inputs: TrialArcRecapInputs
): Promise<TrialArcRecapPlan | null> {
  const { day, now } = inputs;

  const [cvsAnswers, lscAnswers, rplAnswers, experiments, offerDismissals, checkinDates, origin, goal, patternStates] =
    await Promise.all([
      latestAnswers(supabase, memberId, CVS_KEY),
      latestAnswers(supabase, memberId, LSC_KEY),
      latestAnswers(supabase, memberId, RPL_KEY),
      listMyLifestyleExperiments(supabase, memberId),
      listExperimentOfferDismissals(supabase, memberId),
      listTrialArcCheckinDates(supabase, memberId, day.startLocalDate, day.todayLocalDate),
      getMemberOrigin(supabase, memberId),
      fetchLatestMemberGoalSelection(supabase, memberId),
      listMemberPatternStates(supabase, memberId),
    ]);

  // Every scoring below is the SAME engine her own results screen ran, with
  // the same context, so the recap cannot name a different top value or a
  // different loudest signal than the screen she already read.
  const cvsScoring = cvsAnswers ? computeCvsScoring(cvsAnswers) : null;
  const lscScoring = lscAnswers
    ? computeLscScoring(
        lscAnswers,
        cvsScoring ? { topValue: cvsScoring.topValue, branch: cvsScoring.branch } : null
      )
    : null;
  const lscContext: LscContextForRpl | null = lscScoring
    ? {
        loudestSignal: lscScoring.loudestSignal,
        pattern: lscScoring.pattern,
        hardestTimeOfDay: lscScoring.hardestTimeOfDay,
      }
    : null;
  const rplScoring = rplAnswers ? computeRplScoring(rplAnswers, lscContext) : null;

  const experimentFacts = deriveTrialArcExperimentFacts({
    experiments,
    offerSessionIds: offerDismissals.sessionIds,
    offersReadable: offerDismissals.ok,
    now,
  });

  // Days logged against the experiment's own span, and only asked for when
  // there is a span to ask about. cvs_experiment_daily_logs holds every
  // experience's daily taps, so this counts distinct DAYS in that window
  // rather than rows.
  const experimentLogDates =
    experimentFacts.started && !experimentFacts.declined && experimentFacts.startedLocalDate
      ? await listTrialArcExperimentLogDates(
          supabase,
          memberId,
          experimentFacts.startedLocalDate,
          day.todayLocalDate
        )
      : [];

  return assembleTrialArcRecapPlan({
    dayNumber: day.dayNumber,
    checkinDays: new Set(checkinDates).size,
    cvs: cvsScoring ? { topValue: cvsScoring.topValue } : null,
    lsc: lscScoring ? { chosenSignal: lscScoring.chosenSignal, scores: lscScoring.scores } : null,
    rpl: rplScoring ? { finalPattern: rplScoring.finalPattern } : null,
    arrivalPatternKey:
      origin && isPublicEntryPatternKey(origin.patternKey)
        ? (origin.patternKey as PublicEntryPatternKey)
        : null,
    goalKey:
      goal?.primaryGoal && WELCOME_GOAL_KEY_SET.has(goal.primaryGoal)
        ? goal.primaryGoal
        : (goal?.goals ?? []).find((key) => WELCOME_GOAL_KEY_SET.has(key)) ?? null,
    experiment: {
      started: experimentFacts.started,
      active: experimentFacts.active,
      declined: experimentFacts.declined,
      daysLogged: new Set(experimentLogDates).size,
      durationDays: experimentFacts.durationDays ?? 0,
    },
    patternStates: [...patternStates.values()],
  });
}
