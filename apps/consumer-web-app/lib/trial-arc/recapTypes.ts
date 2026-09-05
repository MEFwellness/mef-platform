/**
 * DAY 6, "WHAT THIS WEEK SHOWED": the vocabulary.
 *
 * THE ONE STRUCTURAL RULE OF THIS SCREEN, and it is borrowed whole from
 * lib/weekly-review/types.ts and lib/weekly-reflection/recap.ts: a stored
 * recap holds a PLAN, never prose. Which cards were earned, which slugs
 * from which closed set each one names, and which numbers. ./recapCopy.ts
 * turns that into sentences at read time, deterministically, so not one
 * member-facing word is ever written to the database.
 *
 * WHY IT MATTERS HERE MORE THAN USUAL. Prompt 6 shows this same recap on
 * the post-trial continuation screen, where her trial has ended and the
 * assessment registry's own gates would answer "no" to almost everything.
 * A stored plan plus a pure renderer is what lets that screen render her
 * week without asking a single gate a single question. ./recapCopy.ts
 * imports no database client, no membership module and no assessment
 * registry, and tests/trial-arc-recap-guard.test.ts fails the build if that
 * ever stops being true.
 *
 * THE LANGUAGE CEILING. Day 6 is the sixth day of an account's life. It is
 * below every threshold in lib/member-interpretation/config.ts: below the
 * seven logged days that let anything be called a strength or a problem,
 * below the five check-in days that make a signal "supported", and below
 * the twenty one day span lib/longitudinal-intelligence/signalState.ts
 * requires before a chain is "established". So nothing on this screen may
 * be called a pattern, a strength or a problem, and the one observation the
 * recap may carry is capped at the three-tier language module's tier 2
 * ("this has shown up more than once"), never its tier 3, whose own openers
 * contain the word pattern. That cap is applied at SELECTION and again at
 * SANITIZE, so there is no state in which a tier 3 signal is sitting on a
 * stored plan waiting for a renderer to remember to hide it.
 *
 * NO CLAIM WITHOUT A ROW. Every card kind below is earned by something that
 * genuinely exists: a completed session, a started experiment, a published
 * signal, a bound arrival, a stated goal. There is no card that can be
 * composed out of nothing, which is what makes "this is built from your own
 * answers" a fact about the code rather than a promise in the copy.
 */

import type { PublicEntryPatternKey } from '@mef/shared-types-contracts';
import { VALUE_AREAS, type ValueArea } from '../core-values-snapshot/constants';
import { SIGNALS, type Signal } from '../life-signal-check/constants';
import type { ReadinessPattern } from '../readiness-pulse/constants';
import type { SignalState } from '../longitudinal-intelligence/types';
import { WELCOME_GOALS } from '../welcome/goals';
import { ENERGY_PATTERN_COPY } from '../public-entry/copy';

/**
 * The three tiers, thin data first.
 *
 *   A  She has not finished both of the week's two conversations. The recap
 *      carries the one real thing she has told Root, and points at the next
 *      unfinished free experience.
 *   B  Core Values Snapshot and Life Signal Check are both genuinely
 *      complete.
 *   C  B, plus Readiness Pulse, plus at least one Daily Reset inside the
 *      trial week.
 *
 * A is first in this file and first in the code because it is the ordinary
 * case on day six of a free trial, not the fallback.
 */
export const TRIAL_ARC_RECAP_TIERS = ['A', 'B', 'C'] as const;
export type TrialArcRecapTier = (typeof TRIAL_ARC_RECAP_TIERS)[number];

export function isTrialArcRecapTier(value: unknown): value is TrialArcRecapTier {
  return typeof value === 'string' && (TRIAL_ARC_RECAP_TIERS as readonly string[]).includes(value);
}

/**
 * Every card the recap can hold, and every one is a read of something that
 * already happened.
 *
 *   fatigue_callback      Her bound arrival through Where Your Energy Goes.
 *                         First in the reveal order when it is present.
 *   one_thing             Tier A only: the single real thing she has told
 *                         Root, from whichever source genuinely has one.
 *   top_value             Core Values Snapshot's own top value.
 *   loudest_signal        Life Signal Check's own chosen signal, with her
 *                         six real loudness scores behind it.
 *   experiment            A seven day experiment that is running or that
 *                         ran. A DECLINED experiment has no card: see
 *                         ./recapCompose.ts.
 *   readiness             Readiness Pulse's own final pattern, including
 *                         Still Deciding and Not Yet, which are stages and
 *                         not failures.
 *   checkin_observation   One published member_pattern_states row, at its
 *                         own tier, capped at tier 2.
 */
export const TRIAL_ARC_RECAP_CARD_KINDS = [
  'fatigue_callback',
  'one_thing',
  'top_value',
  'loudest_signal',
  'experiment',
  'readiness',
  'checkin_observation',
] as const;

export type TrialArcRecapCardKind = (typeof TRIAL_ARC_RECAP_CARD_KINDS)[number];

export function isTrialArcRecapCardKind(value: unknown): value is TrialArcRecapCardKind {
  return (
    typeof value === 'string' && (TRIAL_ARC_RECAP_CARD_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Where the one Tier A card came from. A closed set, because "the one thing
 * you have told me" has to be traceable to a specific row and not to a
 * feeling about her account.
 *
 *   arrival   member_public_entry_origin, with a pattern on it.
 *   goal      member_goal_selections, her stated reason for being here.
 *   checkin   daily_checkins_current, inside the trial week.
 */
export const TRIAL_ARC_ONE_THING_SOURCES = ['arrival', 'goal', 'checkin'] as const;
export type TrialArcOneThingSource = (typeof TRIAL_ARC_ONE_THING_SOURCES)[number];

export function isTrialArcOneThingSource(value: unknown): value is TrialArcOneThingSource {
  return (
    typeof value === 'string' && (TRIAL_ARC_ONE_THING_SOURCES as readonly string[]).includes(value)
  );
}

/** An experiment is either running right now or it has run. There is no third state a member is told about, and there is deliberately no slug here for a decline. */
export const TRIAL_ARC_EXPERIMENT_STATES = ['running', 'ran'] as const;
export type TrialArcExperimentState = (typeof TRIAL_ARC_EXPERIMENT_STATES)[number];

export function isTrialArcExperimentState(value: unknown): value is TrialArcExperimentState {
  return (
    typeof value === 'string' && (TRIAL_ARC_EXPERIMENT_STATES as readonly string[]).includes(value)
  );
}

/**
 * Where a Tier A recap's button goes: the next free experience she has not
 * finished.
 *
 * Its own small set rather than TRIAL_ARC_STEPS, because that vocabulary is
 * about what the PACING days point at (and stops at the experiment), while
 * this is about the free arc's three conversations. 'case' is the honest
 * destination when nothing is unfinished, which a Tier A recap cannot
 * normally reach and which is here so the type is total.
 */
export const TRIAL_ARC_RECAP_NEXT_STEPS = [
  'core_values_snapshot',
  'life_signal_check',
  'readiness_pulse',
  'case',
] as const;

export type TrialArcRecapNextStep = (typeof TRIAL_ARC_RECAP_NEXT_STEPS)[number];

export function isTrialArcRecapNextStep(value: unknown): value is TrialArcRecapNextStep {
  return (
    typeof value === 'string' && (TRIAL_ARC_RECAP_NEXT_STEPS as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------
// The cards, as stored.
// ---------------------------------------------------------------------

/**
 * One card's inputs. Slugs from closed sets declared in this codebase, and
 * finite numbers. There is no free string field on any variant, which is
 * what stops a sentence ever arriving in one.
 */
export type TrialArcRecapCard =
  | { kind: 'fatigue_callback'; patternKey: PublicEntryPatternKey }
  | {
      kind: 'one_thing';
      source: TrialArcOneThingSource;
      /** Set only when `source` is 'arrival'. */
      patternKey: PublicEntryPatternKey | null;
      /** A WELCOME_GOALS key. Set only when `source` is 'goal'. */
      goalKey: string | null;
      /** `checkinDays` when `source` is 'checkin'. Empty otherwise. */
      metrics: Record<string, number>;
    }
  | { kind: 'top_value'; valueArea: ValueArea }
  | {
      kind: 'loudest_signal';
      /** Question 10's pick, which is the signal her own results screen called hers. */
      signal: Signal;
      /** Her real 0 to 3 loudness score per signal, exactly as Life Signal Check scored them. */
      signalScores: Record<Signal, number>;
    }
  | {
      kind: 'experiment';
      state: TrialArcExperimentState;
      /** `daysLogged` and `durationDays`. */
      metrics: Record<string, number>;
    }
  | { kind: 'readiness'; readinessPattern: ReadinessPattern }
  | {
      kind: 'checkin_observation';
      /** member_pattern_states' own key, 'checkin_metric::sleep'. */
      signalKey: string;
      state: SignalState;
      /** Capped at 2. See this file's header. */
      tier: 1 | 2;
    };

/**
 * What the whole week counted, and the window it counted over.
 *
 * A COUNTED CLAIM NAMES ITS WINDOW, so `trialDays` travels with
 * `checkinDays` and the rendered sentence says both. `conversations` is how
 * many of the three free conversations are genuinely finished.
 */
export type TrialArcRecapCounts = {
  trialDays: number;
  checkinDays: number;
  conversations: number;
};

/**
 * Everything a recap row stores. Frozen when it is first composed, and
 * never recomputed: see ./recapData.ts.
 */
export type TrialArcRecapPlan = {
  tier: TrialArcRecapTier;
  /** True when the fatigue callback card is present. Carried explicitly because Prompt 6 wants to ask that question without walking the cards. Derived from the cards at write time, in one place, so the two can never disagree. */
  fatigueCallback: boolean;
  /** In reveal order. The fatigue callback, when present, is always first. */
  cards: TrialArcRecapCard[];
  counts: TrialArcRecapCounts;
  /** Where a Tier A recap's button goes. Null on Tier B and Tier C, which ask for nothing. */
  nextStep: TrialArcRecapNextStep | null;
};

/** One stored recap, as read back from member_trial_arc_recaps. */
export type TrialArcRecapRecord = {
  tier: TrialArcRecapTier;
  fatigueCallback: boolean;
  plan: TrialArcRecapPlan;
  dayNumber: number;
  composedLocalDate: string;
  composedAt: string;
  /** When the recap screen genuinely displayed. Null means she was offered it and never opened it, which is a fact Prompt 6 needs to be able to say honestly. */
  openedAt: string | null;
};

// ---------------------------------------------------------------------
// The rendered recap, built from the plan and never stored.
// ---------------------------------------------------------------------

export type RenderedRecapCard = {
  kind: TrialArcRecapCardKind;
  /** The small label above the card. */
  label: string;
  /** The card's own heading, or null where the label is the heading. */
  title: string | null;
  body: string;
  /** The six loudness bars, on the one card that has them. */
  bars: { signal: Signal; label: string; score: number; isChosen: boolean }[] | null;
};

export type RenderedTrialArcRecap = {
  tier: TrialArcRecapTier;
  eyebrow: string;
  heading: string;
  /** The opening line, in the tier's own voice. */
  intro: string;
  cards: RenderedRecapCard[];
  /** Root's noticing, the one typewriter line. Always a counted claim that names its window. */
  noticing: string;
  /** The close. It promises day 7 and nothing else. */
  tomorrow: string;
  /** Tier A's button into the next unfinished free experience. Null on B and C. */
  cta: { label: string; href: string } | null;
};

// ---------------------------------------------------------------------
// The label lookups the renderer uses. Declared here so ./recapCopy.ts can
// stay a pure function of the plan.
// ---------------------------------------------------------------------

/** Every WELCOME_GOALS key, as a set, so a stored goal slug can be validated without importing the whole array twice. */
export const WELCOME_GOAL_KEY_SET: ReadonlySet<string> = new Set(WELCOME_GOALS.map((g) => g.key));

/** The label a member reads for a goal key, or null for a key this build does not know. */
export function goalLabelFor(goalKey: string): string | null {
  return WELCOME_GOALS.find((goal) => goal.key === goalKey)?.label ?? null;
}

/** Every public entry pattern key, as a set. */
export const PUBLIC_ENTRY_PATTERN_KEY_SET: ReadonlySet<string> = new Set(
  Object.keys(ENERGY_PATTERN_COPY)
);

export function isPublicEntryPatternKey(value: unknown): value is PublicEntryPatternKey {
  return typeof value === 'string' && PUBLIC_ENTRY_PATTERN_KEY_SET.has(value);
}

export function isValueArea(value: unknown): value is ValueArea {
  return typeof value === 'string' && (VALUE_AREAS as readonly string[]).includes(value);
}

export function isSignal(value: unknown): value is Signal {
  return typeof value === 'string' && (SIGNALS as readonly string[]).includes(value);
}
