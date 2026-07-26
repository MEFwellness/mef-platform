/**
 * Unit tests for the Coaching Insights page's own presentation layer
 * (lib/longitudinal-intelligence/picture.ts) — added while fixing four
 * display bugs on /insights: bare tier sentences with no subject, an
 * unnamed/unlinked "Next Best Step," and the empty-state contradiction.
 * describeSignalForMember/copy.ts and the Root Router's classification are
 * both reused unmodified; this only tests the composition on top of them.
 */
import { describe, it, expect } from 'vitest';
import { describeSignalAsPictureItem, nextBestStepView } from '../lib/longitudinal-intelligence/picture';
import type { LongitudinalSignal } from '../lib/longitudinal-intelligence/types';
import type { RootRouterOutcomeView } from '../lib/investigation-engine/routerOutcome';

function signal(overrides: Partial<LongitudinalSignal> = {}): LongitudinalSignal {
  return {
    signalKey: 'checkin_metric::sleep',
    signalKind: 'checkin_metric',
    signalLabel: 'sleep',
    state: 'one_time_observation',
    tier: 1,
    occurrenceCount: 1,
    confidence: 0.6,
    firstObservedAt: '2026-07-20T00:00:00Z',
    lastObservedAt: '2026-07-20T00:00:00Z',
    evidenceSummary: {},
    ...overrides,
  };
}

describe('describeSignalAsPictureItem', () => {
  it('names the subject for a check-in-metric signal, whose raw signalLabel is just a metric key', () => {
    const item = describeSignalAsPictureItem(signal({ signalKind: 'checkin_metric', signalLabel: 'sleep' }));
    expect(item).not.toBeNull();
    expect(item!.subject.toLowerCase()).toContain('sleep');
    expect(item!.sentence.length).toBeGreaterThan(0);
  });

  it('names the subject for a registry-finding signal using its own human label', () => {
    const item = describeSignalAsPictureItem(
      signal({ signalKind: 'registry_finding', signalLabel: 'Elevated stress', signalKey: 'registry::stress::elevated_stress' })
    );
    expect(item).not.toBeNull();
    expect(item!.subject).toBe('Elevated stress');
  });

  it('drops the line entirely when there is no nameable subject, rather than rendering one with a hole in it', () => {
    const item = describeSignalAsPictureItem(
      signal({ signalKind: 'checkin_metric', signalLabel: 'not_a_real_metric_key' })
    );
    expect(item).toBeNull();
  });

  it('every returned item pairs a real subject with the unmodified describeSignalForMember sentence', () => {
    const s = signal({ state: 'insufficient_data', tier: null });
    const item = describeSignalAsPictureItem(s);
    expect(item).not.toBeNull();
    expect(item!.sentence).toMatch(/don't have enough/i);
  });
});

function routerOutcome(overrides: Partial<RootRouterOutcomeView> = {}): RootRouterOutcomeView {
  return {
    outcome: 'no_action_needed',
    memberMessage: 'Nothing urgent right now — things look steady.',
    investigation: null,
    ...overrides,
  };
}

describe('nextBestStepView', () => {
  it('names and links the investigation when a focused_investigation outcome carries one', () => {
    const view = nextBestStepView(
      routerOutcome({
        outcome: 'focused_investigation',
        memberMessage: "There's a specific area worth exploring further with a short assessment.",
        investigation: { key: 'wbsa', displayName: 'Whole-Body Systems Assessment', reason: 'recommended_next', route: '/assessments/wbsa' },
      })
    );
    expect(view).not.toBeNull();
    expect(view!.investigation).toEqual({ displayName: 'Whole-Body Systems Assessment', route: '/assessments/wbsa' });
  });

  it('suppresses the card entirely if a focused_investigation outcome has no investigation attached', () => {
    const view = nextBestStepView(routerOutcome({ outcome: 'focused_investigation', investigation: null }));
    expect(view).toBeNull();
  });

  it('suppresses the card entirely if a reassessment outcome has no investigation attached', () => {
    const view = nextBestStepView(routerOutcome({ outcome: 'reassessment', investigation: null }));
    expect(view).toBeNull();
  });

  it('shows generic, self-contained outcome messages with no investigation and no suppression', () => {
    const view = nextBestStepView(routerOutcome({ outcome: 'lifestyle_experiment', memberMessage: 'A small change could help.' }));
    expect(view).toEqual({ message: 'A small change could help.', investigation: null });
  });
});
