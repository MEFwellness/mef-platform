/**
 * DAY 7, composing the close from real rows, once.
 *
 * EVERY CLAIM TRACES TO A ROW. The completion branch is counted from
 * genuinely completed sessions, the focus's signal is Life Signal Check's
 * own chosen signal, its sizing is Readiness Pulse's own final pattern, and
 * the arrival callback needs a bound member_public_entry_origin with a
 * pattern on it. Where a row is missing the claim is ABSENT, and the one
 * place that absence could have been papered over (a focus with nothing to
 * focus on) is a named branch that says so out loud instead.
 *
 * NOTHING HERE IS CALLED FROM A RENDER. This is reached only from
 * ./closeData.ts's ensureTrialArcClose, which is reached only from the two
 * beacon-backed actions in app/actions/trialArcDelivery.ts: the receipt
 * fired by a mounted effect on the day 7 pop-up that genuinely displayed,
 * and the close screen's own open beacon.
 *
 * IT IS COMPOSED ONCE AND NEVER RECOMPUTED. The row is insert-if-absent, so
 * the close Prompt 6's continuation screen reads is exactly the one she read
 * on day 7, with the same focus and the same numbers, whatever has happened
 * since.
 *
 * WHY IT DOES NOT ASK THE ASSESSMENT REGISTRY. Completion here is read
 * through the unified runtime's own completed sessions, which is what the
 * results screens read and what ./recapCompose.ts already reads for day 6.
 * The registry's facts accessor answers a different question (may she open
 * this, on her plan), and that is a gate. This module needs "did she finish
 * it", which is a row.
 *
 * THE MEMBERSHIP DOOR IS AN ENVIRONMENT FACT, and it is read HERE rather
 * than in the renderer. Whether the page exists at all is decided at compose
 * time and stored as part of "which doors were shown", which is what Prompt
 * 6 needs to know. Whether the address still resolves is decided again at
 * render time, so a door whose page was later unset simply stops being
 * drawn rather than becoming a dead link on an old close.
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
import { getMemberOrigin } from '../public-entry/data';
import { membershipPricingUrl } from '../config/conversionLinks';
import type { Signal } from '../life-signal-check/constants';
import type { ReadinessPattern } from '../readiness-pulse/constants';
import { isPublicEntryPatternKey } from './recapTypes';
import { nextUnfinishedStep } from './recapCompose';
import { listTrialArcCheckinDates } from './data';
import type { TrialDay } from './day';
import { sanitizeClosePlan } from './closePlan';
import type {
  TrialArcCloseDoor,
  TrialArcCloseFocus,
  TrialArcClosePlan,
} from './closeTypes';

// ---------------------------------------------------------------------
// THE ASSEMBLER. Pure, synchronous and total.
//
// Every rule about what the close says lives here, over facts that were
// read somewhere else, so the whole decision is testable with fixtures and
// no database anywhere near it. The reader below is a dumb translation of
// rows into these facts and holds no rules of its own.
// ---------------------------------------------------------------------

/** Everything the assembler decides from. Rows already read, scorings already computed by the engines that own them. */
export interface TrialArcCloseFacts {
  /** Which day of her trial the close is being composed on. Day 7 in ordinary use. */
  dayNumber: number;
  /** Distinct days she logged a Daily Reset on, inside the trial window. */
  checkinDays: number;
  /** True when Core Values Snapshot is genuinely finished. */
  cvsDone: boolean;
  /** Life Signal Check's own chosen signal, or null when it is not finished. */
  lscSignal: Signal | null;
  /** Readiness Pulse's own final pattern, or null. */
  readinessPattern: ReadinessPattern | null;
  /** Her bound quiz arrival's pattern, or null when there is no arrival or it was never finished. */
  arrivalPatternKey: PublicEntryPatternKey | null;
  /** Whether a membership page is configured at all. False means the membership door is not offered, and the close stands on the conversation door alone. */
  membershipDoorAvailable: boolean;
}

/**
 * The one focus, chosen from her own rows.
 *
 * THE RULE IN ONE SENTENCE: a focus needs something loud to focus on, and
 * Life Signal Check is the only conversation that produces one. Readiness
 * Pulse sizes it; it cannot supply it. So a member who answered Readiness
 * Pulse but never took Life Signal Check gets the honest blank, not a focus
 * assembled out of how ready she says she is.
 */
export function selectCloseFocus(facts: TrialArcCloseFacts): TrialArcCloseFocus {
  if (facts.lscSignal) {
    return { kind: 'signal', signal: facts.lscSignal, readinessPattern: facts.readinessPattern };
  }
  return {
    kind: 'thin',
    nextStep: nextUnfinishedStep({
      cvs: facts.cvsDone,
      lsc: facts.lscSignal !== null,
      rpl: facts.readinessPattern !== null,
    }),
  };
}

/**
 * Which door leads.
 *
 * EMPHASIS, NEVER AVAILABILITY. Both doors are on the screen whenever both
 * exist. A member who has told me she is ready is led toward the thing she
 * said she is ready for; a member who is still deciding, or who said not
 * yet, or who never had that conversation, is led toward a person. Nothing
 * here removes a door from anybody.
 */
export function selectLeadDoor(facts: TrialArcCloseFacts): TrialArcCloseDoor {
  if (!facts.membershipDoorAvailable) return 'conversation';
  const ready =
    facts.readinessPattern === 'ready_now' || facts.readinessPattern === 'ready_if_small';
  return ready ? 'membership' : 'conversation';
}

export function assembleTrialArcClosePlan(facts: TrialArcCloseFacts): TrialArcClosePlan | null {
  const conversations = [facts.cvsDone, facts.lscSignal !== null, facts.readinessPattern !== null]
    .filter(Boolean).length;

  const doors: TrialArcCloseDoor[] = facts.membershipDoorAvailable
    ? ['conversation', 'membership']
    : ['conversation'];

  // Sanitized on the way in as well as on the way out, so a plan this build
  // composed is held to exactly the same vocabulary as one read back from a
  // row somebody wrote by hand.
  return sanitizeClosePlan({
    // THE WEEK IS "FULL" ONLY WHEN ALL THREE FREE CONVERSATIONS ARE DONE.
    // The seven day experiment is deliberately not part of this test: it is
    // an offer, a decline is a real answer, and a member who declined one
    // has not failed to complete anything.
    completion: conversations === 3 ? 'full' : 'partial',
    arrivalPatternKey: facts.arrivalPatternKey,
    focus: selectCloseFocus(facts),
    doors,
    leadDoor: selectLeadDoor(facts),
    counts: { trialDays: facts.dayNumber, checkinDays: facts.checkinDays, conversations },
  });
}

// ---------------------------------------------------------------------
// THE READER. Rows in, facts out, and no rules of its own.
// ---------------------------------------------------------------------

/** One completed session for a key, or null. Same accessor day 6's composer uses. */
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

export interface TrialArcCloseInputs {
  day: TrialDay;
}

/**
 * The plan for one member, from her own rows.
 *
 * Returns null only when the plan cannot be sanitized at all. A close over
 * an account that finished nothing is a valid plan with the thin focus on
 * it, and that is the honest state this screen is designed around, not a
 * failure.
 */
export async function composeTrialArcClosePlan(
  supabase: SupabaseClient,
  memberId: string,
  inputs: TrialArcCloseInputs
): Promise<TrialArcClosePlan | null> {
  const { day } = inputs;

  const [cvsAnswers, lscAnswers, rplAnswers, checkinDates, origin] = await Promise.all([
    latestAnswers(supabase, memberId, CVS_KEY),
    latestAnswers(supabase, memberId, LSC_KEY),
    latestAnswers(supabase, memberId, RPL_KEY),
    listTrialArcCheckinDates(supabase, memberId, day.startLocalDate, day.todayLocalDate),
    getMemberOrigin(supabase, memberId),
  ]);

  // Every scoring below is the SAME engine her own results screen ran, with
  // the same context, so the close cannot name a different loudest signal or
  // a different readiness than the screens she already read, and cannot
  // disagree with day 6's recap either.
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

  return assembleTrialArcClosePlan({
    dayNumber: day.dayNumber,
    checkinDays: new Set(checkinDates).size,
    cvsDone: cvsScoring !== null,
    lscSignal: lscScoring ? lscScoring.chosenSignal : null,
    readinessPattern: rplScoring ? rplScoring.finalPattern : null,
    arrivalPatternKey:
      origin && isPublicEntryPatternKey(origin.patternKey)
        ? (origin.patternKey as PublicEntryPatternKey)
        : null,
    membershipDoorAvailable: membershipPricingUrl() !== null,
  });
}
