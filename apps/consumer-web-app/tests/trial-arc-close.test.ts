/**
 * DAY 7, "Your 7-Day Reset", what it actually says.
 *
 * The companion file tests/trial-arc-close-guard.test.ts is about the shape
 * of the thing: where the write happens, what the read path may touch, that
 * the offer survives the closer, and that no component reads a conversion
 * URL from anywhere but the shared config. This one is about the content:
 * the two completion branches, the focus over every readiness pattern and
 * the thin-data refusal, the doors and their emphasis, and the vocabulary
 * ceiling.
 *
 * EVERY CLAIM IS ASSERTED THROUGH THE REAL ASSEMBLER AND THE REAL RENDERER,
 * never against a hand-typed sentence. A copy change that made the close
 * pressure her, or claim a focus it could not trace, is caught here because
 * the assertions are about the claim, not about the wording.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  assembleTrialArcClosePlan,
  selectCloseFocus,
  selectLeadDoor,
  type TrialArcCloseFacts,
} from '@/lib/trial-arc/closeCompose';
import {
  renderTrialArcClose,
  TRIAL_ARC_CLOSE_HEADING,
  TRIAL_ARC_CLOSE_FULL_LINE,
  TRIAL_ARC_CLOSE_PARTIAL_LINE,
} from '@/lib/trial-arc/closeCopy';
import { sanitizeClosePlan, CLOSE_VOCABULARY } from '@/lib/trial-arc/closePlan';
import { ensureTrialArcClose, markTrialArcCloseDoor } from '@/lib/trial-arc/closeData';
import { FORBIDDEN_BELOW_SUPPORTED } from '@/lib/member-interpretation/language';
import { SIGNALS, SIGNAL_LABEL, type Signal } from '@/lib/life-signal-check/constants';
import { ENERGY_PATTERN_COPY } from '@/lib/public-entry/copy';
import type { ReadinessPattern } from '@/lib/readiness-pulse/constants';
import type { RenderedTrialArcClose, TrialArcClosePlan } from '@/lib/trial-arc/closeTypes';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------

const LINKS = {
  discoveryCallUrl: 'https://calendly.example/discovery',
  membershipPricingUrl: 'https://pages.example/membership',
};

/** The world in which no membership page has been configured. */
const LINKS_NO_PRICING = {
  discoveryCallUrl: 'https://calendly.example/discovery',
  membershipPricingUrl: null,
};

const READINESS: readonly ReadinessPattern[] = [
  'ready_now',
  'ready_if_small',
  'still_deciding',
  'not_yet',
];

function facts(overrides: Partial<TrialArcCloseFacts> = {}): TrialArcCloseFacts {
  return {
    dayNumber: 7,
    checkinDays: 0,
    cvsDone: false,
    lscSignal: null,
    readinessPattern: null,
    arrivalPatternKey: null,
    membershipDoorAvailable: true,
    ...overrides,
  };
}

/** The whole free arc finished. */
function fullFacts(overrides: Partial<TrialArcCloseFacts> = {}): TrialArcCloseFacts {
  return facts({
    cvsDone: true,
    lscSignal: 'energy',
    readinessPattern: 'ready_now',
    checkinDays: 3,
    ...overrides,
  });
}

function plan(input: TrialArcCloseFacts): TrialArcClosePlan {
  const built = assembleTrialArcClosePlan(input);
  expect(built).not.toBeNull();
  return built!;
}

function render(
  input: TrialArcCloseFacts,
  links: { discoveryCallUrl: string; membershipPricingUrl: string | null } = LINKS
): RenderedTrialArcClose {
  return renderTrialArcClose(plan(input), links);
}

/** Every word a member would read on one rendered close, as one string. */
function allWords(close: RenderedTrialArcClose): string {
  return [
    close.eyebrow,
    close.heading,
    close.completionLine,
    close.completionBody,
    close.arrivalLine ?? '',
    close.focus.label,
    close.focus.title,
    close.focus.body,
    close.focus.nextStep ?? '',
    close.focus.cta?.label ?? '',
    close.doorsIntro,
    ...close.doors.flatMap((door) => [door.label, door.body]),
    close.exitLabel,
  ].join('\n');
}

// ---------------------------------------------------------------------
// TASK C2, no access-ending, countdown or urgency vocabulary.
// ---------------------------------------------------------------------

/**
 * Every shape this build can render, over the fixtures that produce them.
 *
 * The guard file separately asserts that every readiness pattern and both
 * focus kinds appear in this list, so a new branch with no fixture cannot
 * be uncovered while every test still passes.
 */
const EVERY_SHAPE: Array<[string, TrialArcCloseFacts]> = [
  ['nothing at all', facts()],
  ['a value snapshot only', facts({ cvsDone: true })],
  ['a signal, no readiness', facts({ cvsDone: true, lscSignal: 'sleep' })],
  ['readiness but no signal, which is still thin', facts({ readinessPattern: 'ready_now' })],
  ...READINESS.map(
    (pattern): [string, TrialArcCloseFacts] => [
      `the whole arc, ${pattern}`,
      fullFacts({ readinessPattern: pattern }),
    ]
  ),
  ['the whole arc with an arrival', fullFacts({ arrivalPatternKey: 'depletion_pattern' })],
  ['thin with an arrival', facts({ arrivalPatternKey: 'overload_pattern' })],
  ['no membership page configured', fullFacts({ membershipDoorAvailable: false })],
  ...SIGNALS.map(
    (signal): [string, TrialArcCloseFacts] => [
      `the whole arc, ${signal} loudest`,
      fullFacts({ lscSignal: signal }),
    ]
  ),
];

/**
 * THE ACCESS-ENDING BAN, ENFORCED THE WAY THE EM DASH CHECK IS: as a scan of
 * every string this build can render, not as a promise in a comment.
 *
 * Day 8 handling is a later prompt. Nothing on this screen may say or imply
 * that access is expiring, so there is no countdown, no number of days
 * remaining, no expiry, no deadline and no urgency of any kind.
 *
 * "7-Day Reset" is the screen's own name and names the week she has just
 * had, which is why the banned entries below are all about a FUTURE end
 * rather than about the digit seven.
 */
const ACCESS_ENDING_VOCABULARY = [
  'days left',
  'days remaining',
  'day left',
  'last day',
  'final day',
  'last chance',
  'expires',
  'expiring',
  'expired',
  'expiry',
  'ends today',
  'ends tomorrow',
  'trial ends',
  'trial is ending',
  'week ends',
  'access ends',
  'lose access',
  'losing access',
  'runs out',
  'running out',
  'before it is gone',
  "before it's gone",
  'act now',
  'hurry',
  'deadline',
  'countdown',
  'limited time',
  'while you still can',
  'one more day',
  'time is up',
];

describe('the close never says access is ending', () => {
  it.each(EVERY_SHAPE)('%s: carries no access-ending or urgency vocabulary', (_name, input) => {
    const text = allWords(render(input)).toLowerCase();
    for (const term of ACCESS_ENDING_VOCABULARY) {
      expect(text.includes(term), `"${term}" appears`).toBe(false);
    }
  });

  it.each(EVERY_SHAPE)('%s: names no number of days beyond the week itself', (_name, input) => {
    const text = allWords(render(input)).toLowerCase();
    // "7-day reset" is the screen's name and "one week" is the week she had.
    // Anything that reads as a remaining count is not.
    expect(text).not.toMatch(/\d+\s+days?\s+(left|to go|remain)/);
    expect(text).not.toMatch(/only\s+\d+\s+day/);
  });

  it.each(EVERY_SHAPE)('%s: says nothing a supported tier has not earned', (_name, input) => {
    const text = allWords(render(input)).toLowerCase();
    for (const term of FORBIDDEN_BELOW_SUPPORTED) {
      expect(new RegExp(`\\b${term}\\b`, 'i').test(text), `"${term}" appears`).toBe(false);
    }
    // Not on that list, and named explicitly by this build's own brief.
    expect(/\bproblems?\b/.test(text), '"problem" appears').toBe(false);
  });

  it.each(EVERY_SHAPE)('%s: holds no em dash', (_name, input) => {
    expect(allWords(render(input))).not.toContain(String.fromCharCode(0x2014));
  });

  it.each(EVERY_SHAPE)('%s: is always titled by its own name', (_name, input) => {
    expect(render(input).heading).toBe(TRIAL_ARC_CLOSE_HEADING);
  });
});

// ---------------------------------------------------------------------
// TASK A1, the completion beat.
// ---------------------------------------------------------------------

describe('the completion beat', () => {
  it('is full only when all three free conversations are genuinely finished', () => {
    expect(plan(fullFacts()).completion).toBe('full');
    expect(plan(fullFacts({ readinessPattern: null })).completion).toBe('partial');
    expect(plan(fullFacts({ lscSignal: null })).completion).toBe('partial');
    expect(plan(fullFacts({ cvsDone: false })).completion).toBe('partial');
    expect(plan(facts()).completion).toBe('partial');
  });

  it('acknowledges a full week without congratulating her for opening an app', () => {
    const close = render(fullFacts());
    expect(close.completionLine).toBe(TRIAL_ARC_CLOSE_FULL_LINE);
    expect(close.completionBody.toLowerCase()).toContain('real attention');
    expect(close.completionLine).not.toContain('!');
  });

  it('a partial week gets the shape the brief names, and never shame', () => {
    const close = render(facts());
    expect(close.completionLine).toBe(TRIAL_ARC_CLOSE_PARTIAL_LINE);
    expect(close.completionLine).toContain('opened the door');
    expect(close.completionLine).toContain('where it gets specific');
  });

  it('a partial week never counts what she did not do', () => {
    for (const input of [facts(), facts({ cvsDone: true }), facts({ cvsDone: true, lscSignal: 'mind' })]) {
      const text = allWords(render(input)).toLowerCase();
      for (const shape of ['you only', 'you did not finish', 'you missed', 'incomplete', 'unfinished', 'of the three']) {
        expect(text.includes(shape), `"${shape}" appears`).toBe(false);
      }
      expect(text).not.toMatch(/\d\s+of\s+3\b/);
    }
  });
});

// ---------------------------------------------------------------------
// TASK A2, the focus, and the honest refusal.
// ---------------------------------------------------------------------

describe('the focus traces to real rows', () => {
  it('needs Life Signal Check, which is the only conversation that produces a loudest signal', () => {
    expect(selectCloseFocus(facts({ lscSignal: 'tension' })).kind).toBe('signal');
    // Readiness alone cannot supply a focus. It can only size one.
    expect(selectCloseFocus(facts({ readinessPattern: 'ready_now' })).kind).toBe('thin');
    expect(selectCloseFocus(facts({ cvsDone: true })).kind).toBe('thin');
  });

  it.each(SIGNALS)('names %s by the label her own results screen used', (signal: Signal) => {
    const close = render(fullFacts({ lscSignal: signal }));
    expect(close.focus.title).toBe(SIGNAL_LABEL[signal]);
    expect(close.focus.cta).toBeNull();
  });

  it.each(READINESS)('sizes the next step from her own answer: %s', (pattern) => {
    const close = render(fullFacts({ readinessPattern: pattern }));
    const stored = plan(fullFacts({ readinessPattern: pattern })).focus;
    expect(stored.kind === 'signal' && stored.readinessPattern).toBe(pattern);
    expect(close.focus.nextStep).toBeTruthy();
  });

  it('Ready Now is not shrunk and Ready If It Is Small is, which is the whole difference', () => {
    expect(render(fullFacts({ readinessPattern: 'ready_now' })).focus.nextStep).toContain(
      'One real change'
    );
    expect(render(fullFacts({ readinessPattern: 'ready_if_small' })).focus.nextStep).toContain(
      'small on purpose'
    );
  });

  it('a signal with no readiness says so rather than guessing at a size', () => {
    const close = render(facts({ cvsDone: true, lscSignal: 'sleep' }));
    expect(close.focus.title).toBe(SIGNAL_LABEL.sleep);
    expect(close.focus.nextStep).toContain('Readiness Pulse');
    expect(close.focus.nextStep).toContain('size this with you than put a number on it myself');
  });

  it('thin data refuses to pick, in the shape the brief names, and points somewhere real', () => {
    const close = render(facts());
    expect(close.focus.body).toContain('what is loudest for you');
    expect(close.focus.nextStep).toBeNull();
    expect(close.focus.cta?.href).toBe('/assessments/core-values-snapshot');

    const halfWay = render(facts({ cvsDone: true }));
    expect(halfWay.focus.cta?.href).toBe('/assessments/life-signal-check');
  });

  it('and never names a signal it could not read', () => {
    const text = allWords(render(facts())).toLowerCase();
    for (const signal of SIGNALS) {
      // The thin branch may not claim any of the six is hers.
      expect(text.includes(`${SIGNAL_LABEL[signal].toLowerCase()} is the one you`)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------
// TASK C6, Still Deciding and Not Yet are never pressured.
// ---------------------------------------------------------------------

describe('Still Deciding and Not Yet', () => {
  const UNPRESSURED: readonly ReadinessPattern[] = ['still_deciding', 'not_yet'];

  it.each(UNPRESSURED)('%s: is given an observation, never an instruction', (pattern) => {
    const close = render(fullFacts({ readinessPattern: pattern }));
    expect(close.focus.nextStep!.toLowerCase()).toContain('notic');
    // Nothing asked of her, and nothing scheduled.
    for (const shape of ['you should', 'you need to', 'make sure', 'commit to', 'start today', 'do this']) {
      expect(close.focus.nextStep!.toLowerCase().includes(shape), shape).toBe(false);
    }
  });

  it.each(UNPRESSURED)('%s: keeps Readiness Pulse own position rather than walking it back', (pattern) => {
    const line = render(fullFacts({ readinessPattern: pattern })).focus.nextStep!;
    if (pattern === 'still_deciding') expect(line).toContain('a stage rather than a stall');
    else expect(line).toContain('I believe you');
  });

  it.each(UNPRESSURED)('%s: is led toward a person, not a price', (pattern) => {
    const close = render(fullFacts({ readinessPattern: pattern }));
    expect(close.doors[0]!.door).toBe('conversation');
    expect(close.doors[0]!.primary).toBe(true);
  });

  it.each(UNPRESSURED)('%s: still gets both doors, because emphasis is not availability', (pattern) => {
    expect(render(fullFacts({ readinessPattern: pattern })).doors.map((d) => d.door)).toEqual([
      'conversation',
      'membership',
    ]);
  });

  it.each(UNPRESSURED)('%s: carries no urgency anywhere on the screen', (pattern) => {
    const text = allWords(render(fullFacts({ readinessPattern: pattern }))).toLowerCase();
    for (const term of [...ACCESS_ENDING_VOCABULARY, 'ready when you', "don't wait", 'do not wait']) {
      expect(text.includes(term), `"${term}" appears`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------
// TASK A3, the doors.
// ---------------------------------------------------------------------

describe('the doors', () => {
  it('lead with membership for a member who said she is ready', () => {
    expect(selectLeadDoor(fullFacts({ readinessPattern: 'ready_now' }))).toBe('membership');
    expect(selectLeadDoor(fullFacts({ readinessPattern: 'ready_if_small' }))).toBe('membership');
  });

  it('lead with the conversation for everybody else, including a member with no readiness', () => {
    expect(selectLeadDoor(fullFacts({ readinessPattern: 'still_deciding' }))).toBe('conversation');
    expect(selectLeadDoor(fullFacts({ readinessPattern: 'not_yet' }))).toBe('conversation');
    expect(selectLeadDoor(facts())).toBe('conversation');
  });

  it('are both on the screen for everybody, whichever one leads', () => {
    for (const pattern of READINESS) {
      const doors = render(fullFacts({ readinessPattern: pattern })).doors;
      expect(new Set(doors.map((d) => d.door))).toEqual(new Set(['conversation', 'membership']));
      expect(doors.filter((d) => d.primary)).toHaveLength(1);
    }
  });

  it('put the leading door first and open the real addresses', () => {
    const ready = render(fullFacts({ readinessPattern: 'ready_now' }));
    expect(ready.doors[0]!.door).toBe('membership');
    expect(ready.doors[0]!.href).toBe(LINKS.membershipPricingUrl);
    expect(ready.doors[1]!.href).toBe(LINKS.discoveryCallUrl);
  });

  it('the conversation door is always the same booking address the lead agent routes to', () => {
    const close = render(facts());
    const conversation = close.doors.find((d) => d.door === 'conversation')!;
    expect(conversation.href).toBe(LINKS.discoveryCallUrl);
    expect(conversation.label).toBe('Talk with Osei');
  });

  it('say out loud that neither one is required', () => {
    expect(render(facts()).doorsIntro).toContain('not required');
  });

  it('are invitations, never exits or ultimatums', () => {
    for (const input of [fullFacts(), facts()]) {
      const text = allWords(render(input)).toLowerCase();
      for (const term of ['cancel', 'downgrade', 'goodbye', 'last chance', 'final offer', 'special offer', 'discount']) {
        expect(text.includes(term), `"${term}" appears`).toBe(false);
      }
    }
  });

  it('always leave the quiet exit on the screen', () => {
    for (const input of [fullFacts(), facts(), fullFacts({ membershipDoorAvailable: false })]) {
      expect(render(input).exitLabel).toBe('Back to Home');
    }
  });
});

// ---------------------------------------------------------------------
// TASK B3, an unset membership URL renders no door and no placeholder.
// ---------------------------------------------------------------------

describe('an unconfigured membership page', () => {
  it('is not offered at compose time, and the stored plan says so', () => {
    const stored = plan(fullFacts({ membershipDoorAvailable: false }));
    expect(stored.doors).toEqual(['conversation']);
    expect(stored.leadDoor).toBe('conversation');
  });

  it('renders one real door and nothing else, even for a member who said she is ready', () => {
    const close = render(fullFacts({ readinessPattern: 'ready_now', membershipDoorAvailable: false }));
    expect(close.doors).toHaveLength(1);
    expect(close.doors[0]!.door).toBe('conversation');
    // The only door on the screen reads as the leading one, never as an
    // afterthought beside a door that is not there.
    expect(close.doors[0]!.primary).toBe(true);
  });

  it('draws no placeholder href and no placeholder text anywhere', () => {
    const close = render(fullFacts({ membershipDoorAvailable: false }));
    for (const door of close.doors) {
      expect(door.href).toMatch(/^https?:\/\//);
      expect(door.href).not.toContain('#');
    }
    const text = allWords(close);
    expect(text).not.toContain('#PRICING_LINK');
    expect(text.toLowerCase()).not.toContain('not linked here yet');
    expect(text.toLowerCase()).not.toContain('coming soon');
  });

  it('drops the door at render time too, when the page was unset after the close was composed', () => {
    // The plan offered both doors. The address is gone. The honest render is
    // one door, not a link that does not move.
    const close = renderTrialArcClose(plan(fullFacts({ readinessPattern: 'ready_now' })), LINKS_NO_PRICING);
    expect(close.doors.map((d) => d.door)).toEqual(['conversation']);
    expect(close.doors[0]!.primary).toBe(true);
  });

  it('the close still works with the conversation door alone', () => {
    const close = render(facts({ membershipDoorAvailable: false }));
    expect(close.completionLine).toBeTruthy();
    expect(close.focus.body).toBeTruthy();
    expect(close.doors).toHaveLength(1);
    expect(close.exitLabel).toBe('Back to Home');
  });
});

// ---------------------------------------------------------------------
// The arrival callback.
// ---------------------------------------------------------------------

describe('a fatigue entrant', () => {
  it('gets no callback without a bound arrival', () => {
    expect(render(fullFacts()).arrivalLine).toBeNull();
    expect(plan(fullFacts()).arrivalPatternKey).toBeNull();
  });

  it('is referenced by her real stored quiz result, by name', () => {
    const close = render(fullFacts({ arrivalPatternKey: 'wind_down_deficit' }));
    expect(close.arrivalLine).toContain(ENERGY_PATTERN_COPY.wind_down_deficit.title);
    expect(close.arrivalLine).toContain('You came in tired');
  });

  it('promises what the week found only when the week genuinely found something', () => {
    const withFocus = render(fullFacts({ arrivalPatternKey: 'depletion_pattern' }));
    expect(withFocus.arrivalLine).toContain('Here is what the week found underneath it');

    // Thin data: there is nothing underneath, and it says so instead.
    const thin = render(facts({ arrivalPatternKey: 'depletion_pattern' }));
    expect(thin.arrivalLine).toContain('still the only read I have');
    expect(thin.arrivalLine).not.toContain('found underneath');
  });

  it('never calls the quiz a measurement', () => {
    const close = render(fullFacts({ arrivalPatternKey: 'overload_pattern' }));
    expect(close.arrivalLine).toContain('not a measurement');
  });
});

// ---------------------------------------------------------------------
// TASK C5, composed once, rendered from storage, never recomputed.
// ---------------------------------------------------------------------

describe('the close is written exactly once', () => {
  function clientWithClose(row: Record<string, unknown> | null) {
    const inserts: Record<string, unknown>[] = [];
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      maybeSingle: () => Promise.resolve({ data: row, error: null }),
    };
    const client = {
      from: () => ({
        ...chain,
        insert: (values: Record<string, unknown>) => {
          inserts.push(values);
          return Promise.resolve({ error: null });
        },
        update: () => chain,
      }),
    } as unknown as SupabaseClient;
    return { client, inserts };
  }

  const STORED = {
    completion: 'full',
    focus_kind: 'signal',
    lead_door: 'membership',
    plan: plan(fullFacts()),
    day_number: 7,
    composed_local_date: '2026-09-10',
    composed_at: '2026-09-10T13:00:00.000Z',
    opened_at: null,
    door_tapped: null,
    door_tapped_at: null,
  };

  it('does not run the composer at all when a close already exists', async () => {
    const compose = vi.fn(async () => plan(facts()));
    const { client, inserts } = clientWithClose(STORED);

    const result = await ensureTrialArcClose(client, 'member-1', {
      dayNumber: 7,
      composedLocalDate: '2026-09-11',
      compose,
    });

    expect(compose).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
    expect(result.created).toBe(false);
    // And what comes back is the STORED plan, not today's.
    expect(result.record?.completion).toBe('full');
    expect(result.record?.leadDoor).toBe('membership');
  });

  it('composes exactly once for a member who has none yet', async () => {
    const compose = vi.fn(async () => plan(fullFacts()));
    let row: Record<string, unknown> | null = null;
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      maybeSingle: () => Promise.resolve({ data: row, error: null }),
    };
    const client = {
      from: () => ({
        ...chain,
        insert: (values: Record<string, unknown>) => {
          row = {
            completion: values.completion,
            focus_kind: values.focus_kind,
            lead_door: values.lead_door,
            plan: values.plan,
            day_number: values.day_number,
            composed_local_date: values.composed_local_date,
            composed_at: '2026-09-10T13:00:00.000Z',
            opened_at: null,
            door_tapped: null,
            door_tapped_at: null,
          };
          return Promise.resolve({ error: null });
        },
      }),
    } as unknown as SupabaseClient;

    const first = await ensureTrialArcClose(client, 'member-1', {
      dayNumber: 7,
      composedLocalDate: '2026-09-10',
      compose,
    });
    expect(first.created).toBe(true);
    expect(compose).toHaveBeenCalledTimes(1);

    const second = await ensureTrialArcClose(client, 'member-1', {
      dayNumber: 7,
      composedLocalDate: '2026-09-10',
      compose,
    });
    expect(compose).toHaveBeenCalledTimes(1);
    expect(second.created).toBe(false);
  });

  it('the stored columns are written from the plan itself, so they cannot disagree with it', async () => {
    const composed = plan(fullFacts({ readinessPattern: 'not_yet' }));
    const inserted: Record<string, unknown>[] = [];
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
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

    await ensureTrialArcClose(client, 'member-1', {
      dayNumber: 7,
      composedLocalDate: '2026-09-10',
      compose: async () => composed,
    });

    expect(inserted[0]!.completion).toBe(composed.completion);
    expect(inserted[0]!.focus_kind).toBe(composed.focus.kind);
    expect(inserted[0]!.lead_door).toBe(composed.leadDoor);
  });

  it('renders identically from the stored plan, with no recomputation', () => {
    const composed = plan(fullFacts({ arrivalPatternKey: 'depletion_pattern' }));
    // Round tripped through the sanitizer, which is what a database read
    // does to it, then rendered twice.
    const readBack = sanitizeClosePlan(JSON.parse(JSON.stringify(composed)))!;
    expect(readBack).toEqual(composed);
    expect(renderTrialArcClose(readBack, LINKS)).toEqual(renderTrialArcClose(composed, LINKS));
  });
});

// ---------------------------------------------------------------------
// TASK C4, the doors record what she did, and the quiet exit is honest.
// ---------------------------------------------------------------------

describe('what she did with the close', () => {
  function clientWithDoor(stored: Record<string, unknown>) {
    const updates: Record<string, unknown>[] = [];
    let row = stored;
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      maybeSingle: () => Promise.resolve({ data: row, error: null }),
    };
    const client = {
      from: () => ({
        ...chain,
        update: (values: Record<string, unknown>) => {
          updates.push(values);
          if (row.door_tapped === null) row = { ...row, ...values };
          return chain;
        },
      }),
    } as unknown as SupabaseClient;
    return { client, updates, current: () => row };
  }

  const OPEN_CLOSE = {
    completion: 'full',
    focus_kind: 'signal',
    lead_door: 'membership',
    plan: plan(fullFacts()),
    day_number: 7,
    composed_local_date: '2026-09-10',
    composed_at: '2026-09-10T13:00:00.000Z',
    opened_at: '2026-09-10T13:01:00.000Z',
    door_tapped: null as string | null,
    door_tapped_at: null as string | null,
  };

  it('records the door she actually took', async () => {
    const { client } = clientWithDoor({ ...OPEN_CLOSE });
    expect(await markTrialArcCloseDoor(client, 'member-1', 'conversation')).toBe('conversation');
  });

  it('records the quiet exit as a decision, not as an absence', async () => {
    const { client, current } = clientWithDoor({ ...OPEN_CLOSE });
    expect(await markTrialArcCloseDoor(client, 'member-1', 'home')).toBe('home');
    expect(current().door_tapped_at).toBeTruthy();
  });

  it('the first choice wins, so coming back later never rewrites what she decided', async () => {
    const { client } = clientWithDoor({ ...OPEN_CLOSE, door_tapped: 'home', door_tapped_at: 'x' });
    expect(await markTrialArcCloseDoor(client, 'member-1', 'membership')).toBe('home');
  });

  it('refuses a door that was never on her close', async () => {
    const oneDoor = plan(fullFacts({ membershipDoorAvailable: false }));
    const { client, updates } = clientWithDoor({ ...OPEN_CLOSE, plan: oneDoor, lead_door: 'conversation' });
    expect(await markTrialArcCloseDoor(client, 'member-1', 'membership')).toBeNull();
    expect(updates).toHaveLength(0);
  });

  it('writes nothing at all when she has no close', async () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    };
    const updates: unknown[] = [];
    const client = {
      from: () => ({ ...chain, update: (v: unknown) => { updates.push(v); return chain; } }),
    } as unknown as SupabaseClient;
    expect(await markTrialArcCloseDoor(client, 'member-1', 'home')).toBeNull();
    expect(updates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// The plan holds slugs, and cannot hold a sentence or a URL.
// ---------------------------------------------------------------------

describe('the stored vocabulary', () => {
  it('a completion this build does not know makes the whole plan unreadable', () => {
    expect(sanitizeClosePlan({ completion: 'mostly', doors: ['conversation'] })).toBeNull();
  });

  it('a focus kind it does not know falls back to the honest blank, never to a signal', () => {
    const sanitized = sanitizeClosePlan({
      completion: 'partial',
      focus: { kind: 'invented', signal: 'energy' },
      doors: ['conversation'],
      leadDoor: 'conversation',
    })!;
    expect(sanitized.focus).toEqual({ kind: 'thin', nextStep: 'core_values_snapshot' });
  });

  it('a signal focus with no readable signal falls back rather than rendering a blank subject', () => {
    const sanitized = sanitizeClosePlan({
      completion: 'full',
      focus: { kind: 'signal', signal: 'vibes', readinessPattern: 'ready_now' },
      doors: ['conversation'],
    })!;
    expect(sanitized.focus.kind).toBe('thin');
  });

  it('an unknown readiness is dropped to null rather than kept, and the focus survives', () => {
    const sanitized = sanitizeClosePlan({
      completion: 'full',
      focus: { kind: 'signal', signal: 'sleep', readinessPattern: 'feeling_it' },
      doors: ['conversation'],
    })!;
    expect(sanitized.focus).toEqual({ kind: 'signal', signal: 'sleep', readinessPattern: null });
  });

  it('a door it does not know is dropped, and a plan left with none keeps the conversation', () => {
    const sanitized = sanitizeClosePlan({
      completion: 'full',
      doors: ['discount_code', 'membership'],
      leadDoor: 'discount_code',
    })!;
    expect(sanitized.doors).toEqual(['membership']);
    // The lead has to be a door that is actually on the screen.
    expect(sanitized.leadDoor).toBe('membership');

    const empty = sanitizeClosePlan({ completion: 'partial', doors: [] })!;
    expect(empty.doors).toEqual(['conversation']);
  });

  it('there is no field a URL or a sentence could be stored in', () => {
    const sanitized = sanitizeClosePlan({
      completion: 'full',
      focus: { kind: 'signal', signal: 'energy', readinessPattern: 'ready_now' },
      doors: ['conversation'],
      leadDoor: 'conversation',
      href: 'https://example.com/anything',
      body: 'a sentence somebody wrote by hand',
      counts: { trialDays: 7, checkinDays: 2, conversations: 3 },
    })!;
    expect(JSON.stringify(sanitized)).not.toContain('https://');
    expect(JSON.stringify(sanitized)).not.toContain('a sentence somebody wrote');
  });

  it('the counted claim can never exceed the three free conversations', () => {
    const sanitized = sanitizeClosePlan({
      completion: 'full',
      doors: ['conversation'],
      counts: { trialDays: 7, checkinDays: 2, conversations: 9 },
    })!;
    expect(sanitized.counts.conversations).toBe(3);
  });

  it('the vocabulary lists hold identifiers, never anything with a space in it', () => {
    for (const list of Object.values(CLOSE_VOCABULARY)) {
      for (const value of list) expect(/\s/.test(value), value).toBe(false);
    }
  });
});
