/**
 * DAY 6, "What This Week Showed", what it actually says.
 *
 * The companion file tests/trial-arc-recap-guard.test.ts is about the shape
 * of the thing: where the write happens, what the read path is allowed to
 * touch, what the vocabulary may not grow. This one is about the content:
 * the three tiers over real fixtures, the language ceiling, and the two
 * rules that are easiest to break by accident (a declined experiment
 * reappearing, and the callback firing without an arrival).
 *
 * EVERY CARD IS ASSERTED THROUGH THE REAL ASSEMBLER AND THE REAL RENDERER,
 * never against a hand-typed sentence. A copy change that made the recap
 * claim something is caught here because the assertions are about the
 * claim, not about the wording.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  assembleTrialArcRecapPlan,
  nextUnfinishedStep,
  selectRecapObservation,
  type TrialArcRecapFacts,
} from '@/lib/trial-arc/recapCompose';
import {
  renderTrialArcRecap,
  TRIAL_ARC_RECAP_KEPT,
  TRIAL_ARC_RECAP_TOMORROW,
} from '@/lib/trial-arc/recapCopy';
import { ALL_PRESSURE_VOCABULARY } from './helpers/pressureVocabulary';
import { sanitizeRecapPlan, RECAP_VOCABULARY } from '@/lib/trial-arc/recapPlan';
import { ensureTrialArcRecap } from '@/lib/trial-arc/recapData';
import { deriveTrialArcExperimentFacts } from '@/lib/trial-arc/experimentFacts';
import { FORBIDDEN_BELOW_SUPPORTED } from '@/lib/member-interpretation/language';
import { AREA_LABEL } from '@/lib/core-values-snapshot/constants';
import { SIGNAL_LABEL, SIGNALS, type Signal } from '@/lib/life-signal-check/constants';
import { READINESS_PATTERN_LABEL } from '@/lib/readiness-pulse/constants';
import { ENERGY_PATTERN_COPY } from '@/lib/public-entry/copy';
import type { LongitudinalSignal } from '@/lib/longitudinal-intelligence/types';
import type { RenderedTrialArcRecap, TrialArcRecapPlan } from '@/lib/trial-arc/recapTypes';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------

const SCORES: Record<Signal, number> = {
  energy: 3,
  sleep: 2,
  tension: 2,
  digestion: 1,
  body: 1,
  mind: 0,
};

function facts(overrides: Partial<TrialArcRecapFacts> = {}): TrialArcRecapFacts {
  return {
    dayNumber: 6,
    checkinDays: 0,
    cvs: null,
    lsc: null,
    rpl: null,
    arrivalPatternKey: null,
    goalKey: null,
    experiment: { started: false, active: false, declined: false, daysLogged: 0, durationDays: 0 },
    patternStates: [],
    ...overrides,
  };
}

/** Tier B: both conversations finished. */
function tierBFacts(overrides: Partial<TrialArcRecapFacts> = {}): TrialArcRecapFacts {
  return facts({
    cvs: { topValue: 'health' },
    lsc: { chosenSignal: 'energy', scores: SCORES },
    checkinDays: 2,
    ...overrides,
  });
}

/** Tier C: the whole free arc, plus check-ins. */
function tierCFacts(overrides: Partial<TrialArcRecapFacts> = {}): TrialArcRecapFacts {
  return tierBFacts({ rpl: { finalPattern: 'still_deciding' }, checkinDays: 3, ...overrides });
}

function signal(overrides: Partial<LongitudinalSignal> = {}): LongitudinalSignal {
  return {
    signalKey: 'checkin_metric::sleep',
    signalKind: 'checkin_metric',
    signalLabel: 'sleep',
    state: 'repeated_signal',
    tier: 2,
    occurrenceCount: 2,
    confidence: 0.6,
    firstObservedAt: '2026-09-01T00:00:00.000Z',
    lastObservedAt: '2026-09-04T00:00:00.000Z',
    evidenceSummary: {},
    ...overrides,
  };
}

function plan(input: TrialArcRecapFacts): TrialArcRecapPlan {
  const built = assembleTrialArcRecapPlan(input);
  expect(built).not.toBeNull();
  return built!;
}

function render(input: TrialArcRecapFacts): RenderedTrialArcRecap {
  return renderTrialArcRecap(plan(input));
}

/** Every word a member would read on one rendered recap, as one string. */
function allWords(recap: RenderedTrialArcRecap): string {
  return [
    recap.eyebrow,
    recap.heading,
    recap.intro,
    recap.noticing,
    recap.tomorrow,
    recap.cta?.label ?? '',
    ...recap.cards.flatMap((card) => [card.label, card.title ?? '', card.body]),
  ].join('\n');
}

const kinds = (recap: RenderedTrialArcRecap): string[] => recap.cards.map((card) => card.kind);

// ---------------------------------------------------------------------
// TASK C1, the language ceiling, and the em dash rule.
// ---------------------------------------------------------------------

describe('day 6 never speaks above the observation tier', () => {
  /**
   * Every recap this build can produce, over the fixtures that produce
   * them. If a new card kind is added without a case here it is not
   * covered, which is why the guard file separately asserts that every
   * declared card kind appears in this list.
   */
  const EVERY_SHAPE: Array<[string, TrialArcRecapFacts]> = [
    ['tier A, nothing at all', facts()],
    ['tier A, a stated goal', facts({ goalKey: 'sleep_better' })],
    ['tier A, one check-in', facts({ checkinDays: 1 })],
    ['tier A, an arrival only', facts({ arrivalPatternKey: 'depletion_pattern' })],
    ['tier B', tierBFacts()],
    [
      'tier B, an experiment running',
      tierBFacts({
        experiment: { started: true, active: true, declined: false, daysLogged: 2, durationDays: 7 },
      }),
    ],
    [
      'tier B, an experiment that ran',
      tierBFacts({
        experiment: { started: true, active: false, declined: false, daysLogged: 5, durationDays: 7 },
      }),
    ],
    ['tier C', tierCFacts()],
    ['tier C with an observation', tierCFacts({ patternStates: [signal()] })],
    [
      'tier C, a tier 1 observation',
      tierCFacts({ patternStates: [signal({ tier: 1, state: 'one_time_observation' })] }),
    ],
    [
      'tier C, not yet',
      tierCFacts({ rpl: { finalPattern: 'not_yet' }, arrivalPatternKey: 'overload_pattern' }),
    ],
  ];

  it.each(EVERY_SHAPE)('%s: says nothing a supported tier has not earned', (_name, input) => {
    const text = allWords(render(input)).toLowerCase();
    for (const term of FORBIDDEN_BELOW_SUPPORTED) {
      expect(new RegExp(`\\b${term}\\b`, 'i').test(text), `"${term}" appears`).toBe(false);
    }
  });

  it.each(EVERY_SHAPE)('%s: holds no em dash', (_name, input) => {
    expect(allWords(render(input))).not.toContain(String.fromCharCode(0x2014));
  });

  it.each(EVERY_SHAPE)('%s: promises tomorrow and nothing else', (_name, input) => {
    const recap = render(input);
    expect(recap.tomorrow).toBe(TRIAL_ARC_RECAP_TOMORROW);
    const text = allWords(recap).toLowerCase();
    // No membership language and no urgency anywhere on the screen.
    for (const word of ['membership', 'subscribe', 'upgrade', 'price', 'pricing', 'expire', 'hurry']) {
      expect(text.includes(word), `"${word}" appears`).toBe(false);
    }
    // And no countdown: the day number decides which recap she gets, it is
    // never spoken as a number of days remaining.
    expect(text).not.toMatch(/days? (left|remaining)/);
  });

  // -------------------------------------------------------------------
  // THE SAME STORED RECAP, RE-READ AFTER THE WEEK (2026-09-05, Prompt 6).
  //
  // The day 8 continuation screen shows her this exact recap at
  // /trial-ended/week. Two things must change and nothing else may: the
  // closing line stops promising a tomorrow that has already happened, and
  // tier A's button into an unfinished conversation is not drawn, because
  // that screen is behind the lock and the button would loop her straight
  // back to where she came from.
  // -------------------------------------------------------------------

  it.each(EVERY_SHAPE)('%s: after the week, promises nothing and draws no button', (_name, input) => {
    const kept = renderTrialArcRecap(plan(input), { surface: 'after_the_week' });
    expect(kept.tomorrow).toBe(TRIAL_ARC_RECAP_KEPT);
    expect(kept.tomorrow).not.toBe(TRIAL_ARC_RECAP_TOMORROW);
    expect(kept.cta).toBeNull();
  });

  it.each(EVERY_SHAPE)('%s: after the week, every other word is identical', (_name, input) => {
    const built = plan(input);
    const day6 = renderTrialArcRecap(built);
    const kept = renderTrialArcRecap(built, { surface: 'after_the_week' });
    expect(kept.tier).toBe(day6.tier);
    expect(kept.intro).toBe(day6.intro);
    expect(kept.noticing).toBe(day6.noticing);
    expect(kept.cards).toEqual(day6.cards);
  });

  it.each(EVERY_SHAPE)('%s: after the week, still carries no pressure of any kind', (_name, input) => {
    const text = allWords(renderTrialArcRecap(plan(input), { surface: 'after_the_week' })).toLowerCase();
    for (const term of ALL_PRESSURE_VOCABULARY) {
      expect(text.includes(term), `"${term}" appears`).toBe(false);
    }
    expect(allWords(renderTrialArcRecap(plan(input), { surface: 'after_the_week' }))).not.toContain(
      String.fromCharCode(0x2014)
    );
  });

  it('the default surface is day 6, so nothing about that screen changed', () => {
    const built = plan(tierBFacts());
    expect(renderTrialArcRecap(built)).toEqual(renderTrialArcRecap(built, {}));
    expect(renderTrialArcRecap(built).tomorrow).toBe(TRIAL_ARC_RECAP_TOMORROW);
  });
});

// ---------------------------------------------------------------------
// TASK C2 and C3, every card traces to a row, for all three tiers.
// ---------------------------------------------------------------------

describe('tier A, the thin data case', () => {
  it('an account with literally nothing gets no cards, and Root says so plainly', () => {
    const recap = render(facts());
    expect(recap.tier).toBe('A');
    expect(recap.cards).toHaveLength(0);
    expect(recap.intro).not.toContain('one thing you have told me');
    // It still points somewhere real.
    expect(recap.cta?.href).toBe('/assessments/core-values-snapshot');
  });

  it('never says "here is what we learned" over nothing', () => {
    const text = allWords(render(facts())).toLowerCase();
    expect(text).not.toContain('what we learned');
    expect(text).not.toContain('here is what we found');
  });

  it('one stated goal is one card, naming the goal she actually chose', () => {
    const recap = render(facts({ goalKey: 'sleep_better' }));
    expect(kinds(recap)).toEqual(['one_thing']);
    expect(recap.cards[0]!.body.toLowerCase()).toContain('sleep better');
    expect(recap.intro).toBe("We're just getting started. Here's the one thing you have told me so far.");
  });

  it('with no goal, a real check-in day is the one thing, and it names the count', () => {
    const recap = render(facts({ checkinDays: 2 }));
    expect(kinds(recap)).toEqual(['one_thing']);
    expect(recap.cards[0]!.body).toContain('2 days');
  });

  it('a goal outranks a check-in, and only one of the two is ever shown', () => {
    const recap = render(facts({ goalKey: 'reduce_stress', checkinDays: 4 }));
    expect(recap.cards.filter((c) => c.kind === 'one_thing')).toHaveLength(1);
    expect(recap.cards[0]!.body.toLowerCase()).toContain('reduce stress');
  });

  it('a goal key this build does not know produces no card rather than a blank one', () => {
    const recap = render(facts({ goalKey: 'not_a_real_goal' }));
    expect(recap.cards).toHaveLength(0);
  });

  it('the button points at the next unfinished free conversation, in order', () => {
    expect(nextUnfinishedStep({ cvs: false, lsc: false, rpl: false })).toBe('core_values_snapshot');
    expect(nextUnfinishedStep({ cvs: true, lsc: false, rpl: false })).toBe('life_signal_check');
    expect(nextUnfinishedStep({ cvs: true, lsc: true, rpl: false })).toBe('readiness_pulse');
    expect(nextUnfinishedStep({ cvs: true, lsc: true, rpl: true })).toBe('case');
  });

  it('a member who finished only Core Values Snapshot is still tier A, and is pointed at the other half', () => {
    const recap = render(facts({ cvs: { topValue: 'peace' }, goalKey: 'sleep_better' }));
    expect(recap.tier).toBe('A');
    expect(recap.cta?.href).toBe('/assessments/life-signal-check');
    // And her top value is NOT read back, because tier A is the one thing,
    // and a value with no body signal beside it is half a claim.
    expect(kinds(recap)).not.toContain('top_value');
  });
});

describe('tier B, both conversations finished', () => {
  it('is her top value, her loudest signal, and nothing invented', () => {
    const recap = render(tierBFacts());
    expect(recap.tier).toBe('B');
    expect(kinds(recap)).toEqual(['top_value', 'loudest_signal']);
    expect(recap.cards[0]!.title).toBe(AREA_LABEL.health);
    expect(recap.cards[1]!.title).toBe(SIGNAL_LABEL.energy);
  });

  it('draws her real loudness bars, all six, loudest first, hers marked', () => {
    const recap = render(tierBFacts());
    const bars = recap.cards[1]!.bars!;
    expect(bars).toHaveLength(SIGNALS.length);
    expect(bars.map((b) => b.score)).toEqual([3, 2, 2, 1, 1, 0]);
    expect(bars.filter((b) => b.isChosen).map((b) => b.signal)).toEqual(['energy']);
    // Every bar is her own score, not a normalized or re-scaled one.
    for (const bar of bars) expect(bar.score).toBe(SCORES[bar.signal]);
  });

  it('a running experiment is said to be running, with the days she actually logged', () => {
    const recap = render(
      tierBFacts({
        experiment: { started: true, active: true, declined: false, daysLogged: 3, durationDays: 7 },
      })
    );
    expect(kinds(recap)).toContain('experiment');
    const card = recap.cards.find((c) => c.kind === 'experiment')!;
    expect(card.body).toContain('3 days');
    expect(card.body).toContain('7 days');
  });

  it('an experiment that ran says so, and never calls an empty one a failure', () => {
    const recap = render(
      tierBFacts({
        experiment: { started: true, active: false, declined: false, daysLogged: 0, durationDays: 7 },
      })
    );
    const card = recap.cards.find((c) => c.kind === 'experiment')!;
    expect(card.body).toContain('real answer');
  });

  it('a member with no experiment at all gets no experiment card', () => {
    expect(kinds(render(tierBFacts()))).not.toContain('experiment');
  });

  it('readiness and observations belong to tier C, not to tier B', () => {
    const recap = render(tierBFacts({ patternStates: [signal()] }));
    expect(kinds(recap)).not.toContain('readiness');
    expect(kinds(recap)).not.toContain('checkin_observation');
  });
});

describe('tier C, the whole free arc plus check-ins', () => {
  it('adds her readiness, honoring Still Deciding as a stage', () => {
    const recap = render(tierCFacts());
    expect(recap.tier).toBe('C');
    const card = recap.cards.find((c) => c.kind === 'readiness')!;
    expect(card.title).toBe(READINESS_PATTERN_LABEL.still_deciding);
    expect(card.body).toContain('not a stall');
  });

  it('honors Not Yet without a sales beat or a correction', () => {
    const recap = render(tierCFacts({ rpl: { finalPattern: 'not_yet' } }));
    const card = recap.cards.find((c) => c.kind === 'readiness')!;
    expect(card.title).toBe(READINESS_PATTERN_LABEL.not_yet);
    expect(card.body.toLowerCase()).toContain('i believe you');
  });

  it('the whole free arc with no check-ins is tier B, not tier C', () => {
    expect(plan(tierCFacts({ checkinDays: 0 })).tier).toBe('B');
  });

  it('carries at most one observation, and only a real one', () => {
    const recap = render(
      tierCFacts({ patternStates: [signal(), signal({ signalKey: 'checkin_metric::energy' })] })
    );
    expect(recap.cards.filter((c) => c.kind === 'checkin_observation')).toHaveLength(1);
  });

  it('no observation that clears the bar means no observation card and no filler', () => {
    const recap = render(tierCFacts({ patternStates: [] }));
    expect(kinds(recap)).not.toContain('checkin_observation');
    // And nothing hedged is printed in its place.
    expect(allWords(recap).toLowerCase()).not.toContain('not enough information');
  });
});

describe('the observation bar itself', () => {
  it('refuses tier 3, because day 6 has not earned that vocabulary', () => {
    expect(selectRecapObservation([signal({ tier: 3, state: 'established_pattern' })])).toBeNull();
    expect(selectRecapObservation([signal({ tier: 3, state: 'improving' })])).toBeNull();
  });

  it('refuses the three fixed-phrase states and a resolved one', () => {
    for (const state of ['insufficient_data', 'stale', 'conflicting', 'resolved'] as const) {
      expect(selectRecapObservation([signal({ state, tier: 2 })]), state).toBeNull();
    }
  });

  it('refuses a signal that is not about her check-ins', () => {
    expect(
      selectRecapObservation([signal({ signalKey: 'registry::movement::energy_fatigue_pattern' })])
    ).toBeNull();
  });

  it('prefers the stronger tier, then the stronger confidence', () => {
    const chosen = selectRecapObservation([
      signal({ signalKey: 'checkin_metric::energy', tier: 1, state: 'one_time_observation', confidence: 0.9 }),
      signal({ signalKey: 'checkin_metric::sleep', tier: 2, confidence: 0.2 }),
    ]);
    expect(chosen?.signalKey).toBe('checkin_metric::sleep');
  });

  it('a tier 3 signal never reaches a stored plan even if a caller tries', () => {
    const sanitized = sanitizeRecapPlan({
      tier: 'C',
      cards: [{ kind: 'checkin_observation', signalKey: 'checkin_metric::sleep', state: 'improving', tier: 3 }],
      counts: { trialDays: 6, checkinDays: 3, conversations: 3 },
    });
    expect(sanitized?.cards).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// TASK C4, the fatigue callback.
// ---------------------------------------------------------------------

describe('the arrival callback', () => {
  it('does not exist without a bound quiz arrival', () => {
    expect(plan(tierCFacts()).fatigueCallback).toBe(false);
    expect(kinds(render(tierCFacts()))).not.toContain('fatigue_callback');
  });

  it('fires only on a real pattern, never on an arrival she did not finish', () => {
    // An unfinished arrival reaches the assembler as a null pattern key,
    // which is exactly what an origin row with no pattern_key produces.
    expect(plan(tierCFacts({ arrivalPatternKey: null })).fatigueCallback).toBe(false);
  });

  it('is first in the reveal order when it is there', () => {
    const recap = render(tierCFacts({ arrivalPatternKey: 'depletion_pattern' }));
    expect(kinds(recap)[0]).toBe('fatigue_callback');
  });

  it('references her real quiz result by name', () => {
    const recap = render(tierBFacts({ arrivalPatternKey: 'wind_down_deficit' }));
    expect(recap.cards[0]!.body).toContain(ENERGY_PATTERN_COPY.wind_down_deficit.title);
  });

  it('promises what is underneath only when there genuinely is something underneath', () => {
    const withWeek = render(tierBFacts({ arrivalPatternKey: 'depletion_pattern' }));
    expect(withWeek.cards[0]!.title).toBe("You came in tired. Here's what we found underneath it.");

    // Tier A: the arrival is all there is, so the same card refuses to
    // promise a finding it cannot show her.
    const thin = render(facts({ arrivalPatternKey: 'depletion_pattern' }));
    expect(thin.cards[0]!.title).toBe('You came in tired.');
    expect(thin.cards[0]!.body).toContain('Nothing has gone underneath it yet');
  });

  it('never says the arrival twice on a thin recap', () => {
    const recap = render(facts({ arrivalPatternKey: 'depletion_pattern' }));
    expect(kinds(recap)).toEqual(['fatigue_callback']);
  });

  it('a thin recap with an arrival AND a goal shows both, the callback first', () => {
    const recap = render(facts({ arrivalPatternKey: 'depletion_pattern', goalKey: 'sleep_better' }));
    expect(kinds(recap)).toEqual(['fatigue_callback', 'one_thing']);
  });

  it('the stored flag is derived from the cards, so the two can never disagree', () => {
    const lying = sanitizeRecapPlan({
      tier: 'B',
      fatigueCallback: true,
      cards: [{ kind: 'top_value', valueArea: 'peace' }],
      counts: { trialDays: 6, checkinDays: 1, conversations: 2 },
    });
    expect(lying?.fatigueCallback).toBe(false);
  });
});

// ---------------------------------------------------------------------
// TASK C8, a declined experiment is never mentioned.
// ---------------------------------------------------------------------

describe('a declined experiment', () => {
  const DECLINED = {
    started: true,
    active: false,
    declined: true,
    daysLogged: 4,
    durationDays: 7,
  };

  it('produces no card at all', () => {
    const recap = render(tierBFacts({ experiment: DECLINED }));
    expect(kinds(recap)).not.toContain('experiment');
  });

  it('and is not mentioned anywhere else on the screen', () => {
    const text = allWords(render(tierCFacts({ experiment: DECLINED }))).toLowerCase();
    for (const word of ['declined', 'decline', 'abandoned', 'you said no', 'passed on']) {
      expect(text.includes(word), `"${word}" appears`).toBe(false);
    }
  });

  it('there is no stored slug a decline could travel under', () => {
    const sanitized = sanitizeRecapPlan({
      tier: 'B',
      cards: [{ kind: 'experiment', state: 'declined', metrics: {} }],
      counts: { trialDays: 6, checkinDays: 0, conversations: 2 },
    });
    expect(sanitized?.cards).toHaveLength(0);
  });

  it('reads a decline the same way the arc itself does, from the one shared rule', () => {
    // Both shapes the app records: an offer shown and left, and an
    // experiment explicitly stopped.
    const left = deriveTrialArcExperimentFacts({
      experiments: [],
      offerSessionIds: new Set(['session-1']),
      offersReadable: true,
      now: new Date('2026-09-04T12:00:00Z'),
    });
    expect(left.declined).toBe(true);

    const stopped = deriveTrialArcExperimentFacts({
      experiments: [
        { status: 'abandoned', startDate: '2026-09-01', durationDays: 7, sourceSessionId: 's' },
      ],
      offerSessionIds: new Set(),
      offersReadable: true,
      now: new Date('2026-09-04T12:00:00Z'),
    });
    expect(stopped.declined).toBe(true);

    // And an unreadable dismissal read is a decline, never permission.
    const unreadable = deriveTrialArcExperimentFacts({
      experiments: [],
      offerSessionIds: new Set(),
      offersReadable: false,
      now: new Date('2026-09-04T12:00:00Z'),
    });
    expect(unreadable.declined).toBe(true);
  });

  it('starting one from the dashboard card after seeing the offer is not a decline', () => {
    const started = deriveTrialArcExperimentFacts({
      experiments: [
        { status: 'active', startDate: '2026-09-03', durationDays: 7, sourceSessionId: 'session-1' },
      ],
      offerSessionIds: new Set(['session-1']),
      offersReadable: true,
      now: new Date('2026-09-04T12:00:00Z'),
    });
    expect(started.declined).toBe(false);
    expect(started.active).toBe(true);
  });
});

// ---------------------------------------------------------------------
// The counted line.
// ---------------------------------------------------------------------

describe("Root's noticing", () => {
  it('always names the window it counted', () => {
    expect(render(tierCFacts({ checkinDays: 3, dayNumber: 6 })).noticing).toContain(
      '3 of your first 6 days'
    );
  });

  it('says nothing was logged without calling it a failure', () => {
    const line = render(tierBFacts({ checkinDays: 0 })).noticing;
    expect(line).toContain('have not logged a day in your first 6');
    expect(line.toLowerCase()).not.toContain('missed');
  });

  it('an empty week is said warmly and is still counted honestly', () => {
    const line = render(facts()).noticing;
    expect(line).toContain('6 days in');
    expect(line).toContain('not a failure');
  });

  it('counts the conversations she actually finished, and can never count four', () => {
    expect(render(tierCFacts()).noticing).toContain('3 of the three');
    const impossible = sanitizeRecapPlan({
      tier: 'C',
      cards: [],
      counts: { trialDays: 6, checkinDays: 1, conversations: 9 },
    });
    expect(impossible?.counts.conversations).toBe(3);
  });
});

// ---------------------------------------------------------------------
// TASK C5, written exactly once.
// ---------------------------------------------------------------------

describe('the recap is composed once and never recomputed', () => {
  /** A fake that reports one existing row and refuses every write. */
  function clientWithRecap(row: Record<string, unknown> | null) {
    const inserts: unknown[] = [];
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      maybeSingle: () => Promise.resolve({ data: row, error: null }),
    };
    const client = {
      from: () => ({
        ...chain,
        insert: (values: unknown) => {
          inserts.push(values);
          return Promise.resolve({ error: null });
        },
        update: () => chain,
      }),
    } as unknown as SupabaseClient;
    return { client, inserts };
  }

  const STORED = {
    tier: 'B',
    fatigue_callback: false,
    plan: plan(tierBFacts()),
    day_number: 6,
    composed_local_date: '2026-09-09',
    composed_at: '2026-09-09T13:00:00.000Z',
    opened_at: null,
  };

  it('does not run the composer at all when a recap already exists', async () => {
    const compose = vi.fn(async () => plan(tierCFacts()));
    const { client, inserts } = clientWithRecap(STORED);

    const result = await ensureTrialArcRecap(client, 'member-1', {
      dayNumber: 6,
      composedLocalDate: '2026-09-10',
      compose,
    });

    expect(compose).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
    expect(result.created).toBe(false);
    // And what comes back is the STORED plan, not today's.
    expect(result.record?.tier).toBe('B');
  });

  it('composes exactly once for a member who has none yet', async () => {
    const compose = vi.fn(async () => plan(tierBFacts()));
    let row: Record<string, unknown> | null = null;
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve({ data: row, error: null }),
    };
    const client = {
      from: () => ({
        ...chain,
        insert: (values: Record<string, unknown>) => {
          row = {
            tier: values.tier,
            fatigue_callback: values.fatigue_callback,
            plan: values.plan,
            day_number: values.day_number,
            composed_local_date: values.composed_local_date,
            composed_at: '2026-09-09T13:00:00.000Z',
            opened_at: null,
          };
          return Promise.resolve({ error: null });
        },
      }),
    } as unknown as SupabaseClient;

    const first = await ensureTrialArcRecap(client, 'member-1', {
      dayNumber: 6,
      composedLocalDate: '2026-09-09',
      compose,
    });
    expect(first.created).toBe(true);
    expect(compose).toHaveBeenCalledTimes(1);

    const second = await ensureTrialArcRecap(client, 'member-1', {
      dayNumber: 6,
      composedLocalDate: '2026-09-09',
      compose,
    });
    expect(compose).toHaveBeenCalledTimes(1);
    expect(second.created).toBe(false);
  });

  it('the stored tier and callback flag are written from the plan itself', async () => {
    const composed = plan(tierBFacts({ arrivalPatternKey: 'depletion_pattern' }));
    const inserted: Record<string, unknown>[] = [];
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    };
    const client = {
      from: () => ({
        ...chain,
        insert: (values: Record<string, unknown>) => {
          inserted.push(values);
          return Promise.resolve({ error: null });
        },
      }),
    } as unknown as SupabaseClient;

    await ensureTrialArcRecap(client, 'member-1', {
      dayNumber: 6,
      composedLocalDate: '2026-09-09',
      compose: async () => composed,
    });

    expect(inserted[0]!.tier).toBe(composed.tier);
    expect(inserted[0]!.fatigue_callback).toBe(composed.fatigueCallback);
  });
});

// ---------------------------------------------------------------------
// The plan holds slugs and numbers, and cannot hold a sentence.
// ---------------------------------------------------------------------

describe('the stored vocabulary', () => {
  it('every metric key is an allowlisted one, and an unknown key is dropped', () => {
    const sanitized = sanitizeRecapPlan({
      tier: 'B',
      cards: [
        {
          kind: 'experiment',
          state: 'ran',
          metrics: { daysLogged: 3, sleepScore: 82, note: 'she said she slept badly' },
        },
      ],
      counts: { trialDays: 6, checkinDays: 1, conversations: 2 },
    });
    const card = sanitized!.cards[0] as { metrics: Record<string, number> };
    expect(Object.keys(card.metrics)).toEqual(['daysLogged']);
  });

  it('a card kind this build does not know is dropped rather than rendered', () => {
    const sanitized = sanitizeRecapPlan({
      tier: 'B',
      cards: [{ kind: 'free_text', body: 'anything at all' }],
      counts: {},
    });
    expect(sanitized?.cards).toHaveLength(0);
  });

  it('partial loudness scores draw no bars rather than a chart over a guess', () => {
    const sanitized = sanitizeRecapPlan({
      tier: 'B',
      cards: [{ kind: 'loudest_signal', signal: 'energy', signalScores: { energy: 3, sleep: 1 } }],
      counts: {},
    });
    expect(sanitized?.cards).toHaveLength(0);
  });

  it('the vocabulary lists hold identifiers, never anything with a space in it', () => {
    for (const list of Object.values(RECAP_VOCABULARY)) {
      for (const value of list) expect(/\s/.test(value), value).toBe(false);
    }
  });
});
