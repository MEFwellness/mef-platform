import { describe, it, expect } from 'vitest';
import { buildInvestigationPanel } from '../lib/case-view/investigation';
import type { Driver, DriverGoalWeight, MemberDriverState } from '../lib/driver-library/types';
import type { CandidatePair } from '../lib/correlation-engine/types';

function driver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: 'STR-1',
    domainKey: 'STR',
    label: 'Perceived stress load',
    whatItObserves: 'Self-reported daily stress',
    wearableObservable: false,
    postureDerived: false,
    sortOrder: 1,
    active: true,
    ...overrides,
  };
}

function pair(overrides: Partial<CandidatePair> = {}): CandidatePair {
  return {
    pairKey: 'pain_stress',
    driverId: 'STR-1',
    outcomeVariable: 'checkin.pain',
    driverVariable: 'checkin.stress',
    label: 'Pain and perceived stress load',
    weight: 'high',
    goalKeys: ['reduce_pain'],
    ...overrides,
  };
}

const DOMAIN_LABELS = new Map([['STR', 'Stress and nervous system']]);

describe('buildInvestigationPanel', () => {
  it('groups an implicated driver under "likely involved"', () => {
    const panel = buildInvestigationPanel(
      [driver()],
      DOMAIN_LABELS,
      [{ driverId: 'STR-1', goalKey: 'reduce_pain', weight: 'high' }],
      ['reduce_pain'],
      new Map<string, MemberDriverState>([
        ['STR-1', { memberId: 'm1', driverId: 'STR-1', state: 'implicated', evidenceSummary: {}, updatedAt: '' }],
      ]),
      [pair()]
    );
    expect(panel.likelyInvolved.map((d) => d.driverId)).toEqual(['STR-1']);
    expect(panel.ruledOut).toEqual([]);
    expect(panel.beingLookedAt).toEqual([]);
  });

  it('keeps a ruled-out driver visible, in its own group — never dropped from the view', () => {
    const panel = buildInvestigationPanel(
      [driver()],
      DOMAIN_LABELS,
      [{ driverId: 'STR-1', goalKey: 'reduce_pain', weight: 'high' }],
      ['reduce_pain'],
      new Map<string, MemberDriverState>([
        ['STR-1', { memberId: 'm1', driverId: 'STR-1', state: 'ruled_out', evidenceSummary: {}, updatedAt: '' }],
      ]),
      [pair()]
    );
    expect(panel.ruledOut.map((d) => d.driverId)).toEqual(['STR-1']);
  });

  it('groups both "unknown" and "watching" drivers (with a pathway) under "currently being looked at"', () => {
    const drivers = [driver({ id: 'STR-1' }), driver({ id: 'STR-2', label: 'Breathing pattern' })];
    const pairs = [pair({ driverId: 'STR-1' }), pair({ pairKey: 'x', driverId: 'STR-2' })];
    const weights: DriverGoalWeight[] = [
      { driverId: 'STR-1', goalKey: 'reduce_pain', weight: 'high' },
      { driverId: 'STR-2', goalKey: 'reduce_pain', weight: 'medium' },
    ];
    const panel = buildInvestigationPanel(
      drivers,
      DOMAIN_LABELS,
      weights,
      ['reduce_pain'],
      new Map<string, MemberDriverState>([
        ['STR-2', { memberId: 'm1', driverId: 'STR-2', state: 'watching', evidenceSummary: {}, updatedAt: '' }],
      ]),
      pairs
    );
    expect(panel.beingLookedAt.map((d) => d.driverId).sort()).toEqual(['STR-1', 'STR-2']);
  });

  it('marks a goal-relevant driver with no candidate pair as "not yet trackable", never "being looked at"', () => {
    const panel = buildInvestigationPanel(
      [driver()],
      DOMAIN_LABELS,
      [{ driverId: 'STR-1', goalKey: 'reduce_pain', weight: 'high' }],
      ['reduce_pain'],
      new Map(),
      [] // no candidate pairs at all
    );
    expect(panel.notYetTrackable.map((d) => d.driverId)).toEqual(['STR-1']);
    expect(panel.beingLookedAt).toEqual([]);
  });

  it('excludes a driver irrelevant to her goals entirely', () => {
    const irrelevant = driver({ id: 'FUE-6', label: 'Alcohol', domainKey: 'FUE' });
    const panel = buildInvestigationPanel(
      [driver(), irrelevant],
      DOMAIN_LABELS,
      [{ driverId: 'STR-1', goalKey: 'reduce_pain', weight: 'high' }],
      ['reduce_pain'],
      new Map(),
      [pair()]
    );
    const allDriverIds = [...panel.beingLookedAt, ...panel.ruledOut, ...panel.likelyInvolved, ...panel.notYetTrackable].map(
      (d) => d.driverId
    );
    expect(allDriverIds).not.toContain('FUE-6');
  });

  it('treats every driver as relevant when she has no real weighting goal (broad sampling, Part 3)', () => {
    const panel = buildInvestigationPanel(
      [driver(), driver({ id: 'FUE-6', label: 'Alcohol', domainKey: 'FUE' })],
      DOMAIN_LABELS,
      [{ driverId: 'STR-1', goalKey: 'reduce_pain', weight: 'high' }],
      ['understand_my_body'],
      new Map(),
      [pair(), pair({ pairKey: 'y', driverId: 'FUE-6' })]
    );
    const allDriverIds = [...panel.beingLookedAt, ...panel.ruledOut, ...panel.likelyInvolved, ...panel.notYetTrackable].map(
      (d) => d.driverId
    );
    expect(allDriverIds.sort()).toEqual(['FUE-6', 'STR-1']);
  });
});
