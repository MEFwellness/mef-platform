/**
 * THE TRIAL ARC. What Root says during the trial week, and when she says
 * nothing.
 *
 * This module is the only place that decides whether a trial arc message
 * exists for a member on a visit. The pop-up chain asks it one question and
 * renders the answer; it holds no rules of its own.
 *
 * WHAT IT IS AND IS NOT ALLOWED TO DO
 *
 * NOTHING HERE WRITES. Not a row, not a flag, not a timestamp, not a claim.
 * Every answer is derived from rows that already exist, on every visit. The
 * only writes anywhere in this feature are the delivery receipt, fired by a
 * mounted effect on a pop-up that genuinely displayed, and the CTA stamp,
 * fired by the button she pressed. This function is called from a server
 * render, and a render never decides anything.
 *
 * ELIGIBILITY IS NOT RE-ASKED HERE. lib/trial-arc/eligibility.ts is the one
 * place that answers who the arc talks to, and this module calls it rather
 * than re-testing any of its six rules. A coaching client can structurally
 * never reach a line of copy in this file, because the first thing below
 * refuses on anything that is not eligible.
 *
 * IT COSTS NOTHING WHILE THE ARC IS OFF. `trialArcLaunchInstant()` is
 * checked before any read at all, which is the same rule 1 eligibility
 * checks first, arrived at without a round trip. While TRIAL_ARC_LAUNCH is
 * null, and it ships null, this branch of the pop-up chain adds zero
 * queries to Home for every member in the system.
 *
 * ROOT PRESENCE WINS, ALWAYS. If the return greeting is delivering on this
 * visit, the arc is silent on this visit, whatever day it is and whatever
 * state she is in. Two systems welcoming somebody at once is the exact
 * incoherence lib/return-greeting/absence.ts was written to prevent, and
 * the arc is the newer of the two, so it yields. This is a read, never a
 * claim: the greeting's own atomic claim still belongs to the Morning
 * Brief, and nothing here can take it or spend it.
 *
 * ONE MESSAGE PER DAY, THROUGH MACHINERY THAT ALREADY EXISTS. The message
 * key carries the day number, so the pop-up chain's existing one-time-ever
 * dismissal rule applied to a day-scoped key IS the once-per-day rule, the
 * same way the Priority Card's date-scoped key already works. There is no
 * second dismissal system and no schedule.
 *
 * DAYS 6 AND 7 ARE NOT BUILT HERE. `resolveTrialArcVisit` computes the day
 * number for all seven and the delivery table stores all seven, so the
 * recap and the close can be added by a later prompt without touching the
 * clock, the receipt, or the closer. This file returns null for them,
 * explicitly, rather than by falling off the end of a day map.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { CVS_KEY } from '../core-values-snapshot/constants';
import { LSC_KEY } from '../life-signal-check/constants';
import { getMemberAssessmentFacts } from '../assessment-registry/facts';
import { hasEverCompleted } from '../assessment-registry/status';
import { listMyLifestyleExperiments, deriveEffectiveStatus } from '../lifestyle-experiments';
import { listExperimentOfferDismissals } from '../root-popup-messages/data';
import { classifyPresence } from '../return-greeting/absence';
import { getMemberOrigin } from '../public-entry/data';
import { ENERGY_PATTERN_COPY } from '../public-entry/copy';
import { daysBetweenLocalDates } from '../feed/dateMath';
import { localDateStringFor } from '../time/localDate';
import { TRIAL_ARC_LAUNCH, isTrialArcTestAccount, trialArcLaunchInstant } from './config';
import { resolveTrialArcEligibility } from './eligibility';
import {
  TRIAL_ARC_LAST_PACING_DAY,
  TRIAL_ARC_ROUTES,
  isPacingDay,
  trialArcPopupMessageKey,
  type TrialArcStep,
} from './constants';
import {
  TRIAL_ARC_DAY_1,
  TRIAL_ARC_DAY_2_ON_PACE,
  TRIAL_ARC_WELCOME,
  TRIAL_ARC_TOWARD_CASE,
  TRIAL_ARC_TOWARD_CVS,
  TRIAL_ARC_TOWARD_LSC,
  trialArcEchoCopy,
  trialArcExperimentCopy,
  trialArcReEntryCopy,
  trialArcSideBySideCopy,
  type TrialArcMessageCopy,
} from './copy';
import {
  listTrialArcCheckinDates,
  listTrialArcDeliveries,
  listTrialArcExperimentLogDates,
} from './data';
import { resolveTrialDay, type TrialDay } from './day';
import { decidePaceState, trialArcClosure, type TrialArcPaceState } from './state';
import { resolveTrialArcConnection, type TrialArcConnection } from './connection';
import { resolveExperimentOfferHref } from './experimentOffer';
import { lastReturnGreetingForGap, morningBriefExistsToday } from './presence';

export { dayNumberFor, resolveTrialDay } from './day';

/**
 * Everything one visit's decision was made from, handed back with the
 * answer so a caller logging a refusal, or a verification script, does not
 * have to ask the database the same questions again.
 */
export interface TrialArcFacts {
  dayNumber: number;
  todayLocalDate: string;
  timeZone: string;
  cvsCompletedLocalDate: string | null;
  lscCompletedLocalDate: string | null;
  experimentStartedLocalDate: string | null;
  experimentActive: boolean;
  /** Which experience's experiment page to point at, or null when she has finished neither conversation. */
  experimentHref: string | null;
  experimentDeclined: boolean;
  /** True when she arrived through Where Your Energy Goes, which is what makes day 1 belong to the welcome rather than to a pop-up of its own. */
  hasPublicEntryOrigin: boolean;
  /** The pattern her nine public answers resolved to, or null when she never finished them. The day 1 welcome branches on it rather than inventing something to have noticed. */
  publicEntryPatternTitle: string | null;
  activeLocalDates: string[];
  paceState: TrialArcPaceState;
  pacingClosed: boolean;
  stalledMessageSent: boolean;
  presenceDelivering: boolean;
  connection: TrialArcConnection | null;
}

export interface TrialArcVisit {
  memberId: string;
  messageKey: string;
  facts: TrialArcFacts;
}

/**
 * Which surface delivers a trial arc message.
 *
 * 'popup' is the arc's own entry in the Root pop-up chain. Day 1 for a
 * member who arrived through Where Your Energy Goes is delivered by the
 * public entry welcome instead: she is owed a sentence about what she
 * already told us before anything is asked of her, and Root saying that and
 * then immediately saying the same first step again would be two messages
 * on one morning. It is still the arc's day 1 message, with the arc's key
 * and the arc's receipt, riding a surface that was going to speak anyway.
 */
export type TrialArcSurface = 'popup' | 'public_entry_welcome';

/** The message, ready to render, plus what the receipt has to record about it. */
export interface TrialArcMessage {
  messageKey: string;
  dayNumber: number;
  paceState: TrialArcPaceState;
  copy: TrialArcMessageCopy;
  surface: TrialArcSurface;
}

/**
 * Why the arc is saying nothing. Never shown to a member: this is for a log
 * line, a test and the verification script.
 */
export type TrialArcSilence =
  | 'not_launched'
  | 'not_eligible'
  | 'no_trial_day'
  | 'outside_pacing_days'
  | 'root_presence_is_greeting'
  | 'pacing_closed'
  | 'ahead_of_the_week'
  | 'experiment_running'
  | 'experiment_declined'
  | 'stalled_message_already_sent';

/**
 * One visit's whole answer.
 *
 * `eligible` is reported separately from `message`, and the public entry
 * welcome is the reason. An account the arc is genuinely launched for is
 * inside a paced week whether or not there is anything to say today, and
 * the welcome has to know that: for an arc member, day 1 IS the welcome,
 * and from day 2 onward the arc is what speaks to her. `eligible: false`
 * means nothing about this build applies to her and every surface behaves
 * exactly as it did before it existed.
 */
export interface TrialArcDecision {
  eligible: boolean;
  dayNumber: number | null;
  message: TrialArcMessage | null;
  /** Why there is no message. Null when there is one. Never shown to a member. */
  reason: TrialArcSilence | null;
  facts: TrialArcFacts | null;
}

/**
 * The whole answer for one member on one visit.
 *
 * Ordered so the cheapest refusals happen first: the launch constant, then
 * eligibility, then the day number, then the reads only a member genuinely
 * inside the pacing days ever pays for.
 */
export async function resolveTrialArcDecision(
  supabase: SupabaseClient,
  memberId: string,
  options: {
    now?: Date;
    lastSignInAt?: string | null;
    launch?: string | null;
    /** The raw TRIAL_ARC_TEST_ACCOUNT_IDS value. Defaults to the server environment. Passed explicitly only by tests and by the live verification runner. */
    testAccounts?: string | undefined;
  } = {}
): Promise<TrialArcDecision> {
  // Rule 1 of eligibility, reached without a query. See this file's header.
  //
  // `options.launch` is the same escape hatch decideTrialArcEligibility
  // already carries, and for the same two callers: a test, and the live
  // verification runner, which has to be able to see the arc genuinely
  // compose a message from real production rows while the shipped constant
  // is still null. Nothing in the application ever passes it, so the app
  // always reads the constant, and a launch handed in here still has to get
  // past all six eligibility rules on its own.
  const launch = options.launch === undefined ? TRIAL_ARC_LAUNCH : options.launch;
  // The named test rig is the one account that gets past a null launch, and
  // it gets past it here as well as inside eligibility, so the zero-query
  // short circuit stays true for everybody else. The check is synchronous
  // and reads a server environment variable that is empty by default, so
  // this still costs no round trip for any real member.
  if (trialArcLaunchInstant(launch) === null && !isTrialArcTestAccount(memberId, options.testAccounts)) {
    return silentDecision(false, null, 'not_launched');
  }

  const now = options.now ?? new Date();

  const eligibility = await resolveTrialArcEligibility(supabase, memberId, {
    now,
    launch,
    ...(options.testAccounts !== undefined ? { testAccounts: options.testAccounts } : {}),
  });
  if (!eligibility.eligible) return silentDecision(false, null, 'not_eligible');

  const day = await resolveTrialDay(supabase, memberId, now);
  if (!day) return silentDecision(false, null, 'no_trial_day');

  // Days 6 and 7 are a later prompt's, and a day past the end of the week is
  // nobody's. Stated as an explicit refusal rather than as an absent entry
  // in a map, so adding the recap and the close is a change to this line and
  // not an accident. She is still `eligible`: the arc is her week, it simply
  // has nothing built to say on this day yet.
  if (day.dayNumber < 1 || day.dayNumber > TRIAL_ARC_LAST_PACING_DAY) {
    return silentDecision(true, day.dayNumber, 'outside_pacing_days');
  }

  const facts = await gatherTrialArcFacts(supabase, memberId, day, now, options.lastSignInAt ?? null);
  const outcome = decideTrialArcMessage(facts);

  return {
    eligible: true,
    dayNumber: day.dayNumber,
    message: outcome.speaks ? outcome.message : null,
    reason: outcome.speaks ? null : outcome.reason,
    facts,
  };
}

function silentDecision(
  eligible: boolean,
  dayNumber: number | null,
  reason: TrialArcSilence
): TrialArcDecision {
  return { eligible, dayNumber, message: null, reason, facts: null };
}

/**
 * What the public entry welcome needs to know about the arc.
 *
 * THREE ANSWERS, AND THE MIDDLE ONE IS THE POINT.
 *
 *   null       The arc is not launched for this account. The welcome
 *              behaves exactly as it always has, pointing at the Baseline
 *              Assessment, and nothing in this build touches it.
 *   'day_one'  Today is her first day and she arrived through Where Your
 *              Energy Goes. The welcome carries the arc's day 1 message.
 *   'retired'  The arc is live for her and today is not that day. The
 *              welcome stands down.
 *
 * WHY 'retired' EXISTS. The welcome's own closer is "she has no Baseline
 * Assessment yet", and it is due again on every login until she has one.
 * For an arc member that would win the single pop-up slot on day 2, day 3,
 * day 4 and day 5 as well, and the arc would never say a word. So for an
 * account the arc owns, the welcome is her day 1 message and only that:
 * once day 1 is behind her, the week is what speaks. She keeps every other
 * route into the Baseline Assessment (the Questionnaires screen, the free
 * arc invitation, the Priority Card), and no account outside the arc is
 * affected in any way.
 */
export type PublicEntryArcHandover =
  | { kind: 'day_one'; message: TrialArcMessage }
  | { kind: 'retired' }
  | null;

export function publicEntryArcHandover(decision: TrialArcDecision): PublicEntryArcHandover {
  if (!decision.eligible) return null;
  if (decision.message && decision.message.surface === 'public_entry_welcome') {
    return { kind: 'day_one', message: decision.message };
  }
  return { kind: 'retired' };
}

/**
 * The reads. Everything a decision needs, in as few round trips as the
 * questions allow, and every one of them through the module that already
 * owns that table.
 */
async function gatherTrialArcFacts(
  supabase: SupabaseClient,
  memberId: string,
  day: TrialDay,
  now: Date,
  lastSignInAt: string | null
): Promise<TrialArcFacts> {
  const windowStart = day.startLocalDate;

  const [
    assessmentFacts,
    experiments,
    offerDismissals,
    deliveryResult,
    checkinDates,
    experimentLogDates,
    origin,
  ] = await Promise.all([
    getMemberAssessmentFacts(supabase, memberId),
    listMyLifestyleExperiments(supabase, memberId),
    listExperimentOfferDismissals(supabase, memberId),
    listTrialArcDeliveries(supabase, memberId),
    listTrialArcCheckinDates(supabase, memberId, windowStart, day.todayLocalDate),
    listTrialArcExperimentLogDates(supabase, memberId, windowStart, day.todayLocalDate),
    // Through the module that owns the table, not a query of its own, so the
    // arc and the welcome can never disagree about how she arrived.
    getMemberOrigin(supabase, memberId),
  ]);

  const cvsFacts = assessmentFacts.get(CVS_KEY);
  const lscFacts = assessmentFacts.get(LSC_KEY);
  const cvsCompletedAt = cvsFacts && hasEverCompleted(cvsFacts) ? cvsFacts.latestCompletedAt : null;
  const lscCompletedAt = lscFacts && hasEverCompleted(lscFacts) ? lscFacts.latestCompletedAt : null;

  const cvsCompletedLocalDate = cvsCompletedAt ? localDateStringFor(cvsCompletedAt, day.timeZone) : null;
  const lscCompletedLocalDate = lscCompletedAt ? localDateStringFor(lscCompletedAt, day.timeZone) : null;

  // An experiment's start_date is already a plain calendar date, chosen on
  // the day she started it, so it needs no conversion.
  const startedDates = experiments.map((experiment) => experiment.startDate).sort();
  const experimentStartedLocalDate = startedDates[startedDates.length - 1] ?? null;
  const experimentActive = experiments.some(
    (experiment) => deriveEffectiveStatus(experiment, now) === 'active'
  );

  // A DECLINE, IN THE TWO SHAPES THE APP ACTUALLY RECORDS ONE. She was shown
  // the seven day offer and left without starting it (a dismissal row on an
  // offer key with no experiment started from that same session), or she
  // started one and explicitly stopped it (status 'abandoned'). Nothing else
  // counts, and a failed read of the dismissals counts as a decline rather
  // than as permission: the wrong direction here is re-pitching to somebody
  // who already said no.
  const startedSessionIds = new Set(
    experiments.map((experiment) => experiment.sourceSessionId).filter((id): id is string => id !== null)
  );
  const declinedAnOffer = [...offerDismissals.sessionIds].some((id) => !startedSessionIds.has(id));
  const experimentDeclined =
    !offerDismissals.ok ||
    declinedAnOffer ||
    experiments.some((experiment) => experiment.status === 'abandoned');

  const activeLocalDates = [
    ...checkinDates,
    ...experimentLogDates,
    ...(cvsCompletedLocalDate ? [cvsCompletedLocalDate] : []),
    ...(lscCompletedLocalDate ? [lscCompletedLocalDate] : []),
    ...(experimentStartedLocalDate ? [experimentStartedLocalDate] : []),
  ];

  const deliveries = deliveryResult.deliveries;
  const newest = [...deliveries].sort((a, b) => b.dayNumber - a.dayNumber)[0] ?? null;

  const stepCompletedLocalDate = (step: TrialArcStep): string | null => {
    switch (step) {
      case 'core_values_snapshot':
        return cvsCompletedLocalDate;
      case 'life_signal_check':
        return lscCompletedLocalDate;
      case 'experiment':
        return experimentStartedLocalDate;
      case 'none':
        return null;
    }
  };

  const closure = trialArcClosure(deliveries, stepCompletedLocalDate);

  const paceState = decidePaceState({
    dayNumber: day.dayNumber,
    cvsCompleted: cvsCompletedLocalDate !== null,
    lscCompleted: lscCompletedLocalDate !== null,
    experimentStarted: experimentStartedLocalDate !== null,
    experimentActive,
    experimentDeclined,
    lastPointedStep: newest?.pointedStep ?? null,
    activeLocalDates,
    todayLocalDate: day.todayLocalDate,
  });

  const presenceDelivering = await isRootPresenceDelivering(supabase, memberId, {
    checkinDates,
    todayLocalDate: day.todayLocalDate,
    timeZone: day.timeZone,
    lastSignInAt,
    now,
  });

  // Where her experiment is actually offered, which is her own results
  // screen rather than the page called /experiment. Resolved only for a
  // member who has genuinely finished one of the two conversations, so a
  // member on day 1 with nothing behind her pays for none of it.
  const experimentHref =
    cvsCompletedLocalDate || lscCompletedLocalDate
      ? await resolveExperimentOfferHref(supabase, memberId, {
          cvs: cvsCompletedLocalDate !== null,
          lsc: lscCompletedLocalDate !== null,
        })
      : null;

  // The day 5 connection is the only branch that needs her actual scored
  // answers, so it is the only branch that pays for reading them.
  const connection =
    day.dayNumber === 5 && cvsCompletedLocalDate !== null && lscCompletedLocalDate !== null
      ? await resolveTrialArcConnection(supabase, memberId)
      : null;

  return {
    dayNumber: day.dayNumber,
    todayLocalDate: day.todayLocalDate,
    timeZone: day.timeZone,
    cvsCompletedLocalDate,
    lscCompletedLocalDate,
    experimentStartedLocalDate,
    experimentActive,
    experimentHref,
    experimentDeclined,
    hasPublicEntryOrigin: origin !== null,
    publicEntryPatternTitle: origin?.patternKey ? ENERGY_PATTERN_COPY[origin.patternKey].title : null,
    activeLocalDates,
    paceState,
    pacingClosed: closure.pacingClosed,
    stalledMessageSent: closure.stalledMessageSent,
    presenceDelivering,
    connection,
  };
}

/**
 * IS ROOT PRESENCE ITSELF GREETING HER ON THIS VISIT.
 *
 * A READ, NEVER A CLAIM. The greeting's one-per-gap-episode claim is an
 * atomic write owned by the Morning Brief (lib/coaching-engine/service.ts).
 * If this function claimed it, the arc would consume the greeting and she
 * would be silently robbed of the sentence it was checking for. So this
 * looks at the same two facts the claim looks at and answers "is one about
 * to be spent, or was one spent today", without touching the row.
 *
 * THE THRESHOLDS ARE NOT RESTATED HERE. `classifyPresence` is the single
 * place the check-in gap and the sign-in absence thresholds are compared,
 * and it is what this calls. The arc adds no third absence measurement.
 *
 * A GAP ALREADY GREETED ON AN EARLIER DAY IS NOT DELIVERING NOW. The
 * greeting fires once per gap episode. Treating the whole gap as "presence
 * is speaking" would silence the arc's own warm re-entry line for every day
 * of a gap after the first, which is the opposite of what a member coming
 * back needs.
 *
 * AND NEITHER IS A GREETING THAT IS NEVER COMING (2026-09-04, found by
 * driving this collision on the live site). The claim happens in exactly one
 * place: the moment today's Morning Brief is CREATED. If that brief already
 * exists, nothing will claim the greeting today, and an arc that went quiet
 * on the strength of an unclaimed row would leave her with neither message
 * on every visit for the rest of the gap. So an unclaimed greeting only
 * silences the arc on the visit that is actually going to write the brief.
 */
async function isRootPresenceDelivering(
  supabase: SupabaseClient,
  memberId: string,
  input: {
    checkinDates: readonly string[];
    todayLocalDate: string;
    timeZone: string;
    lastSignInAt: string | null;
    now: Date;
  }
): Promise<boolean> {
  const sorted = [...input.checkinDates].sort();
  const lastCheckin = sorted[sorted.length - 1] ?? null;
  const daysSinceLastCheckin = lastCheckin
    ? daysBetweenLocalDates(lastCheckin, input.todayLocalDate)
    : null;

  // Her sign-in absence is deliberately reported as null rather than
  // measured. Re-entry needs seven whole days with no sign-in at all, and
  // this function is only ever reached inside the first five days of an
  // account's life, so the state cannot arise. Measuring it would be a
  // second query for an answer that is fixed by arithmetic.
  const presence = classifyPresence({ daysSinceLastCheckin, daysSinceLastSignIn: null });
  if (presence === 'present') return false;
  if (presence === 're_entry') return true;

  if (!lastCheckin) return false;
  const greeted = await lastReturnGreetingForGap(supabase, memberId, lastCheckin);
  // A row stamped today: it already delivered, on this visit.
  if (greeted) return localDateStringFor(greeted, input.timeZone) === input.todayLocalDate;
  // No row: it is delivering only if today's brief is still to be written,
  // because writing it is the one thing that ever claims the greeting.
  return !(await morningBriefExistsToday(supabase, memberId, input.todayLocalDate));
}

/**
 * The decision itself, over facts already in hand. Pure, synchronous and
 * total, so the whole day map is testable with no database.
 */
export function decideTrialArcMessage(
  facts: TrialArcFacts
): { speaks: true; message: TrialArcMessage } | { speaks: false; reason: TrialArcSilence } {
  const { dayNumber } = facts;

  // Root Presence wins, on any day and in any state. Never stack.
  if (facts.presenceDelivering) return silent('root_presence_is_greeting');

  // The closer. Three delivered messages she neither acted on nor answered
  // with the step they pointed at, and the pacing stops for good. Checked
  // before the day branches so no day can slip past it.
  if (isPacingDay(dayNumber) && facts.pacingClosed) return silent('pacing_closed');

  if (facts.paceState === 'STALLED') {
    // One warm re-entry message in a trial week, not one per stalled day.
    if (facts.stalledMessageSent) return silent('stalled_message_already_sent');
    return speak(facts, trialArcReEntryCopy(nextStepCopy(facts)));
  }

  // AHEAD is silence on every pacing day except day 5. Somebody running
  // ahead of the week does not need to be told what the week is, but the
  // day 5 connection is not pacing: it is the one thing the week was for.
  if (facts.paceState === 'AHEAD' && dayNumber !== 5) return silent('ahead_of_the_week');

  switch (dayNumber) {
    case 1:
      // Day 1 belongs to the public entry welcome for anybody who arrived
      // through Where Your Energy Goes. It is still this message, with this
      // key and this receipt: only the surface is different, because Root
      // was going to speak to her on that screen anyway and saying the same
      // first step twice on one morning would be worse than saying it once
      // properly. A direct signup gets the arc's own pop-up.
      return facts.hasPublicEntryOrigin
        ? speak(facts, welcomeCopy(facts), 'public_entry_welcome')
        : speak(facts, TRIAL_ARC_DAY_1);

    case 2:
      // ON_PACE on day 2 means the step day 1 pointed at is finished, which
      // is Core Values Snapshot. The branch reads the completion itself
      // rather than the state name, so a member who was never shown a day 1
      // message is still never pointed past a conversation she has not had.
      return speak(
        facts,
        facts.cvsCompletedLocalDate ? TRIAL_ARC_DAY_2_ON_PACE : TRIAL_ARC_TOWARD_CVS
      );

    case 3:
    case 4: {
      // The experiment days. Silent while one is running: she is already
      // doing the thing these days exist to offer.
      if (facts.experimentActive) return silent('experiment_running');
      // And silent when she has already said no. The arc respects a decline
      // and never re-pitches what she declined.
      if (facts.experimentDeclined) return silent('experiment_declined');
      if (facts.experimentHref) return speak(facts, trialArcExperimentCopy(facts.experimentHref));
      // No experiment is available to her because she has not finished a
      // conversation yet, so the honest thing to point at is the next one.
      return speak(facts, nextStepCopy(facts));
    }

    case 5: {
      // The connection. Only ever from real scored rows, and only when both
      // halves exist. Anything short of that nudges toward the missing half
      // rather than inventing the finding.
      if (!facts.cvsCompletedLocalDate) return speak(facts, TRIAL_ARC_TOWARD_CVS);
      if (!facts.lscCompletedLocalDate) return speak(facts, TRIAL_ARC_TOWARD_LSC);
      if (!facts.connection) return speak(facts, TRIAL_ARC_TOWARD_LSC);
      return speak(
        facts,
        facts.connection.echoFired
          ? trialArcEchoCopy(facts.connection.valueLabel, facts.connection.signalLabel)
          : trialArcSideBySideCopy(facts.connection.valueLabel, facts.connection.signalLabel)
      );
    }

    default:
      return silent('outside_pacing_days');
  }
}

/** The next real step for this member, whatever day it is. Used by the re-entry line and by an experiment day she has not reached yet. */
function nextStepCopy(facts: TrialArcFacts): TrialArcMessageCopy {
  if (!facts.cvsCompletedLocalDate) return TRIAL_ARC_TOWARD_CVS;
  if (!facts.lscCompletedLocalDate) return TRIAL_ARC_TOWARD_LSC;
  if (facts.experimentHref && !facts.experimentActive && !facts.experimentDeclined) {
    return trialArcExperimentCopy(facts.experimentHref);
  }
  // Everything the week asks for is finished, or the one thing left was
  // declined. Pointing at Core Values Snapshot here would tell a member who
  // finished it on Monday that it is still her first step, so the honest
  // destination is her case: the thing all of this was for.
  return TRIAL_ARC_TOWARD_CASE;
}

function speak(
  facts: TrialArcFacts,
  copy: TrialArcMessageCopy,
  surface: TrialArcSurface = 'popup'
): { speaks: true; message: TrialArcMessage } {
  return {
    speaks: true,
    message: {
      messageKey: trialArcPopupMessageKey(facts.dayNumber),
      dayNumber: facts.dayNumber,
      paceState: facts.paceState,
      copy,
      surface,
    },
  };
}

/**
 * The arc framed welcome, composed here rather than in the client, so the
 * branch on "did she finish the nine questions" is made once, beside the
 * row it is made from.
 */
function welcomeCopy(facts: TrialArcFacts): TrialArcMessageCopy {
  return {
    eyebrow: TRIAL_ARC_WELCOME.eyebrow,
    title: TRIAL_ARC_WELCOME.title,
    body: facts.publicEntryPatternTitle
      ? TRIAL_ARC_WELCOME.bodyWithPattern(facts.publicEntryPatternTitle)
      : TRIAL_ARC_WELCOME.bodyWithoutPattern,
    ctaLabel: TRIAL_ARC_WELCOME.ctaLabel,
    href: TRIAL_ARC_WELCOME.href,
    step: TRIAL_ARC_WELCOME.step,
  };
}

function silent(reason: TrialArcSilence): { speaks: false; reason: TrialArcSilence } {
  return { speaks: false, reason };
}
