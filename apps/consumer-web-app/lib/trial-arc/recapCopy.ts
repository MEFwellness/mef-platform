/**
 * DAY 6, every word "What This Week Showed" says, rendered from the stored
 * plan and from nothing else.
 *
 * THIS FILE READS NOTHING. No Supabase client, no membership module, no
 * assessment registry, no entitlement, no clock. It is a pure function of a
 * TrialArcRecapPlan, which is the property Prompt 6 depends on: the
 * post-trial continuation screen renders this same recap after her trial
 * has ended, when every gate in the app would answer no, and it does it
 * without asking any of them. tests/trial-arc-recap-guard.test.ts fails the
 * build if an import here ever suggests otherwise.
 *
 * ROOT'S VOICE, AT THE OBSERVATION TIER. Day 6 is the sixth day of an
 * account's life. Nothing here calls anything a pattern, a strength or a
 * problem, because nothing on day 6 has earned any of those words: see the
 * thresholds in lib/member-interpretation/config.ts, all of which sit above
 * this week. Gaps are worth paying attention to. They are never
 * explanations of why her life feels hard.
 *
 * NO EM DASHES. Commas, periods, colons and parentheses.
 *
 * NO COUNTDOWN AND NO MEMBERSHIP LANGUAGE. The close promises day 7 and
 * nothing else: no price, no plan, no urgency, no "your trial ends".
 *
 * EVERY LABEL COMES FROM THE MODULE THAT OWNS IT. AREA_LABEL, SIGNAL_LABEL,
 * READINESS_PATTERN_LABEL, WELLNESS_METRIC_LABEL, ENERGY_PATTERN_COPY and
 * the three-tier language module's own describeSignalForMember. One name
 * per thing, so a card here can never call something by a name the screen
 * she came from does not use.
 */

import { AREA_LABEL } from '../core-values-snapshot/constants';
import { SIGNAL_LABEL, SIGNALS } from '../life-signal-check/constants';
import { READINESS_PATTERN_LABEL } from '../readiness-pulse/constants';
import { buildRplSetupLine } from '../readiness-pulse/copy';
import { ENERGY_PATTERN_COPY } from '../public-entry/copy';
import { describeSignalForMember } from '../longitudinal-intelligence/copy';
import { metricKeyFromSignalKey } from '../longitudinal-intelligence/metricSignals';
import { WELLNESS_METRIC_LABEL } from '../wellness/wellness-index';
import { TRIAL_ARC_ROUTES } from './constants';
import {
  goalLabelFor,
  type RenderedRecapCard,
  type RenderedTrialArcRecap,
  type TrialArcRecapCard,
  type TrialArcRecapNextStep,
  type TrialArcRecapPlan,
} from './recapTypes';

export const TRIAL_ARC_RECAP_EYEBROW = 'From Root';
export const TRIAL_ARC_RECAP_HEADING = 'What this week showed';

/**
 * The close. Its function is fixed: it promises day 7 and nothing else.
 *
 * One sentence, no number of days anywhere in it, no membership, no
 * urgency. It is the only forward-looking line on the screen.
 */
export const TRIAL_ARC_RECAP_TOMORROW = 'Tomorrow I will show you where I would start.';

/** Where each Tier A next step goes, and what its button says. One route per step, from the shared route map wherever one exists. */
const NEXT_STEP: Record<TrialArcRecapNextStep, { label: string; href: string }> = {
  core_values_snapshot: {
    label: 'Start Core Values Snapshot',
    href: TRIAL_ARC_ROUTES.coreValuesSnapshot,
  },
  life_signal_check: { label: 'Start Life Signal Check', href: TRIAL_ARC_ROUTES.lifeSignalCheck },
  readiness_pulse: { label: 'Start Readiness Pulse', href: TRIAL_ARC_ROUTES.readinessPulse },
  case: { label: 'Open my case', href: TRIAL_ARC_ROUTES.caseView },
};

// ---------------------------------------------------------------------
// The opener.
// ---------------------------------------------------------------------

/**
 * The intro, in the tier's own voice.
 *
 * Tier A has two shapes and they are genuinely different messages. One
 * thing told is not the same as nothing told, and a member can tell.
 * Neither of them says "here is what we learned", because on Tier A there
 * is nothing that has been learned.
 */
function introFor(plan: TrialArcRecapPlan): string {
  if (plan.tier !== 'A') {
    return 'Six days of it, in your own answers. Nothing here is a conclusion, and nothing here is anything you did not tell me yourself.';
  }
  const hasSomething = plan.cards.length > 0;
  return hasSomething
    ? "We're just getting started. Here's the one thing you have told me so far."
    : 'So far the only thing I have is the account itself. Nothing is lost by that, and nothing has to be caught up on. Here is where I would begin.';
}

// ---------------------------------------------------------------------
// The cards.
// ---------------------------------------------------------------------

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/**
 * The fatigue callback, and the one honest branch in it.
 *
 * She arrived through Where Your Energy Goes, which is nine questions about
 * being tired, so "you came in tired" is a restatement of a row rather than
 * a guess. What follows it is NOT the same claim on every tier: on Tier B
 * and Tier C there genuinely is something underneath it, because she
 * finished the two conversations this week is built on. On Tier A there is
 * not, and promising to show her what was found underneath and then
 * showing her one card that is the arrival itself would be the exact
 * manufactured connection this build refuses.
 */
function fatigueCallbackCard(patternKey: keyof typeof ENERGY_PATTERN_COPY, tier: string): RenderedRecapCard {
  const patternTitle = ENERGY_PATTERN_COPY[patternKey].title;
  const underneath = tier !== 'A';
  return {
    kind: 'fatigue_callback',
    label: 'Where you came in',
    title: underneath
      ? "You came in tired. Here's what we found underneath it."
      : 'You came in tired.',
    body: underneath
      ? `Before you had an account, nine questions about your energy came back as "${patternTitle}". That was a first impression from a two minute quiz, not a measurement. Everything below is from your own answers since.`
      : `Before you had an account, nine questions about your energy came back as "${patternTitle}". That was a first impression from a two minute quiz, not a measurement, and it is still the only read I have. Nothing has gone underneath it yet.`,
    bars: null,
  };
}

function oneThingCard(card: Extract<TrialArcRecapCard, { kind: 'one_thing' }>): RenderedRecapCard | null {
  if (card.source === 'arrival' && card.patternKey) {
    return {
      kind: 'one_thing',
      label: 'The one thing so far',
      title: 'How you arrived',
      body: `Before you had an account, nine questions about your energy came back as "${ENERGY_PATTERN_COPY[card.patternKey].title}". That is a first impression from a two minute quiz, and I have kept it as exactly that.`,
      bars: null,
    };
  }

  if (card.source === 'goal' && card.goalKey) {
    const label = goalLabelFor(card.goalKey);
    if (!label) return null;
    return {
      kind: 'one_thing',
      label: 'The one thing so far',
      title: 'What brought you here',
      body: `You told me what you came for: ${label.toLowerCase()}. That is the thing everything else gets read against, and it is the only thing I have from you so far.`,
      bars: null,
    };
  }

  if (card.source === 'checkin') {
    const days = card.metrics.checkinDays ?? 0;
    if (days <= 0) return null;
    return {
      kind: 'one_thing',
      label: 'The one thing so far',
      title: 'You showed up',
      body: `You logged how you were doing on ${days} ${plural(days, 'day', 'days')} of your first week. That is a real answer, and it is the only one I have from you so far.`,
      bars: null,
    };
  }

  return null;
}

function topValueCard(valueArea: keyof typeof AREA_LABEL): RenderedRecapCard {
  return {
    kind: 'top_value',
    label: 'What matters most',
    title: AREA_LABEL[valueArea],
    body: `Of the six, ${AREA_LABEL[valueArea]} is the one you said you are trying to protect. Core Values Snapshot asked twelve ways round it, and this is where your answers landed.`,
    bars: null,
  };
}

/**
 * The loudest signal, with her real bars.
 *
 * The bars are the same visual her own Life Signal Check results screen
 * showed her (components/life-signal-check/LoudnessVisual.tsx), fed from
 * her real 0 to 3 scores, so the recap cannot draw a different chart from
 * the one she already read.
 */
function loudestSignalCard(
  card: Extract<TrialArcRecapCard, { kind: 'loudest_signal' }>
): RenderedRecapCard {
  const bars = [...SIGNALS]
    .sort((a, b) => card.signalScores[b] - card.signalScores[a])
    .map((signal) => ({
      signal,
      label: SIGNAL_LABEL[signal],
      score: card.signalScores[signal],
      isChosen: signal === card.signal,
    }));

  return {
    kind: 'loudest_signal',
    label: 'What your body said loudest',
    title: SIGNAL_LABEL[card.signal],
    body: `Life Signal Check scored six signals out of three each, from your own answers. ${SIGNAL_LABEL[card.signal]} is the one you and your answers came back to.`,
    bars,
  };
}

/**
 * The experiment, in its own honest state.
 *
 * There is no branch here for a declined experiment, and there is no slug
 * for one either. A decline is simply not mentioned: see
 * ./recapCompose.ts, which never builds this card in that case.
 */
function experimentCard(
  card: Extract<TrialArcRecapCard, { kind: 'experiment' }>
): RenderedRecapCard {
  const logged = card.metrics.daysLogged ?? 0;
  const duration = card.metrics.durationDays ?? 0;

  if (card.state === 'running') {
    return {
      kind: 'experiment',
      label: 'Your experiment',
      title: 'Running now',
      body:
        logged > 0
          ? `One small change, held for ${duration} days. You have logged it on ${logged} ${plural(logged, 'day', 'days')} so far.`
          : `One small change, held for ${duration} days. It is running, and there is nothing logged against it yet.`,
      bars: null,
    };
  }

  return {
    kind: 'experiment',
    label: 'Your experiment',
    title: 'It ran',
    body:
      logged > 0
        ? `You logged it on ${logged} ${plural(logged, 'day', 'days')}. That is what it was for: not a score, just an honest record of what actually happened.`
        : 'You started it. Nothing was logged against it, and that is a real answer about the week too.',
    bars: null,
  };
}

/**
 * Readiness, with Still Deciding and Not Yet honored as stages.
 *
 * The second sentence is Readiness Pulse's own setup line for her pattern
 * (lib/readiness-pulse/copy.ts's buildRplSetupLine), reused rather than
 * rewritten, so the recap says about her readiness exactly what her own
 * closing screen said.
 */
function readinessCard(
  card: Extract<TrialArcRecapCard, { kind: 'readiness' }>
): RenderedRecapCard {
  return {
    kind: 'readiness',
    label: 'Where you said you are',
    title: READINESS_PATTERN_LABEL[card.readinessPattern],
    body: buildRplSetupLine(card.readinessPattern),
    bars: null,
  };
}

/**
 * The one check-in observation, at the tier the publishing system assigned
 * it and never one above.
 *
 * The sentence is composed by lib/longitudinal-intelligence/copy.ts, the
 * three-tier language module itself, so this file never writes a sentence
 * about a signal. The recap only decides that this signal is the one worth
 * reading back, which ./recapCompose.ts already decided from her rows.
 */
function observationCard(
  card: Extract<TrialArcRecapCard, { kind: 'checkin_observation' }>
): RenderedRecapCard {
  const metric = metricKeyFromSignalKey(card.signalKey);
  const label = metric ? WELLNESS_METRIC_LABEL[metric] : 'This signal';
  return {
    kind: 'checkin_observation',
    label: 'Worth paying attention to',
    title: label,
    body: `${describeSignalForMember({ signalKey: card.signalKey, state: card.state, tier: card.tier })} It is not an explanation of anything yet, and I would rather say that than reach for one.`,
    bars: null,
  };
}

function renderCard(card: TrialArcRecapCard, tier: string): RenderedRecapCard | null {
  switch (card.kind) {
    case 'fatigue_callback':
      return fatigueCallbackCard(card.patternKey, tier);
    case 'one_thing':
      return oneThingCard(card);
    case 'top_value':
      return topValueCard(card.valueArea);
    case 'loudest_signal':
      return loudestSignalCard(card);
    case 'experiment':
      return experimentCard(card);
    case 'readiness':
      return readinessCard(card);
    case 'checkin_observation':
      return observationCard(card);
  }
}

// ---------------------------------------------------------------------
// Root's noticing.
// ---------------------------------------------------------------------

/**
 * The one typewriter line, and it is a counted claim that names its own
 * window.
 *
 * "You checked in on 2 of your first 6 days" can be read beside any other
 * count in the app without either of them being wrong, because it says out
 * loud which days it counted. It never says "so far" beside a different
 * number, which is the shape the 2026-08-27 sweep ruled out.
 */
export function recapNoticing(plan: TrialArcRecapPlan): string {
  const { trialDays, checkinDays, conversations } = plan.counts;

  if (checkinDays === 0 && conversations === 0) {
    return `${trialDays} days in, and the picture is still mostly blank. That is not a failure, it is just early.`;
  }

  const checkinClause =
    checkinDays === 0
      ? `You have not logged a day in your first ${trialDays}`
      : `You checked in on ${checkinDays} of your first ${trialDays} days`;

  const conversationClause =
    conversations === 0
      ? 'and none of the three free conversations is finished yet'
      : `and finished ${conversations} of the three free conversations`;

  return `${checkinClause}, ${conversationClause}. That is what all of this is built from.`;
}

// ---------------------------------------------------------------------
// The whole recap.
// ---------------------------------------------------------------------

/**
 * WHICH SCREEN IS ASKING.
 *
 *   'day_six'          The recap on the day it was composed, at /trial/week.
 *                      The default, and unchanged.
 *   'after_the_week'   The same stored recap, re-read from the day 8
 *                      continuation screen at /trial-ended/week.
 *
 * TWO THINGS DIFFER, AND BOTH OF THEM ARE ABOUT TELLING THE TRUTH ON THE
 * LATER DAY RATHER THAN ABOUT DESIGN.
 *
 *   The closing line. "Tomorrow I will show you where I would start" was
 *   true on day 6 and is not true on day 9. Rendering it anyway would be
 *   the screen promising something that already happened, or that is not
 *   coming.
 *
 *   The button. Tier A's next step points at a free conversation, and on
 *   day 8 those screens are behind the lock, so the button would send her
 *   somewhere that would immediately send her back. A dead loop is worse
 *   than no button, and the card's own words stand without it.
 *
 * NOTHING ELSE CHANGES. Every card, every count and the noticing line are
 * the ones her stored plan holds, rendered identically, because they were
 * true when they were composed and they are still true.
 */
export type TrialArcRecapSurface = 'day_six' | 'after_the_week';

/**
 * The close on the continuation screen. It looks backwards, because that is
 * the only honest direction from a week that is already finished, and it
 * promises nothing at all.
 */
export const TRIAL_ARC_RECAP_KEPT =
  'This week is yours. It reads the same today as it did the day I put it together.';

/**
 * The recap as words. Deterministic: the same plan always reads the same
 * way, this week and on the continuation screen two days later.
 */
export function renderTrialArcRecap(
  plan: TrialArcRecapPlan,
  options: { surface?: TrialArcRecapSurface } = {}
): RenderedTrialArcRecap {
  const cards = plan.cards
    .map((card) => renderCard(card, plan.tier))
    .filter((card): card is RenderedRecapCard => card !== null);

  const afterTheWeek = options.surface === 'after_the_week';

  return {
    tier: plan.tier,
    eyebrow: TRIAL_ARC_RECAP_EYEBROW,
    heading: TRIAL_ARC_RECAP_HEADING,
    intro: introFor(plan),
    cards,
    noticing: recapNoticing(plan),
    tomorrow: afterTheWeek ? TRIAL_ARC_RECAP_KEPT : TRIAL_ARC_RECAP_TOMORROW,
    cta: afterTheWeek || !plan.nextStep ? null : NEXT_STEP[plan.nextStep],
  };
}
