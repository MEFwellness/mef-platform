import { describe, it, expect } from 'vitest';
import { computeRplScoring } from '../lib/readiness-pulse/scoring';
import {
  buildRplDivergenceLine,
  buildRplMembershipDoor,
  buildRplSetupLine,
  buildRplSurpriseLine,
  buildEvidenceEchoLine,
  rplNoticingDay7Text,
  rplExperimentIntroCopy,
} from '../lib/readiness-pulse/copy';
import type { SessionAnswers } from '../lib/assessment-runtime/types';

function baseAnswers(overrides: Partial<Record<string, string>> = {}): SessionAnswers {
  return {
    rpl_q1: 'a_few_tries',
    rpl_q2: 'motivation_faded',
    rpl_q3: 'curious',
    rpl_q4: 'room_if_protect',
    rpl_q5: 'direct',
    rpl_q6: 'schedule',
    rpl_q7: 'doable_good_days',
    rpl_q8: 'energy',
    rpl_q9: 'still_deciding',
    ...overrides,
  };
}

describe('buildRplDivergenceLine', () => {
  it('is null when the pick matches the derived pattern', () => {
    const scoring = computeRplScoring(baseAnswers({ rpl_q9: 'still_deciding' }), null);
    expect(buildRplDivergenceLine(scoring)).toBeNull();
  });

  it('honestly names both the derived pattern and the pick when they diverge, framed as starting full size when the pick reads more ready', () => {
    const scoring = computeRplScoring(
      baseAnswers({ rpl_q3: 'overdue', rpl_q4: 'genuinely_open', rpl_q7: 'easily_doable', rpl_q9: 'not_yet' }),
      null
    );
    const line = buildRplDivergenceLine(scoring);
    expect(line).toMatch(/ready now/i);
    expect(line).toMatch(/not yet/i);
    expect(line).not.toMatch(/—/);
  });
});

describe('buildRplSurpriseLine', () => {
  it('is null unless surpriseFires', () => {
    const scoring = computeRplScoring(baseAnswers({ rpl_q3: 'curious', rpl_q9: 'still_deciding' }), null);
    expect(buildRplSurpriseLine(scoring)).toBeNull();
  });

  it('holds both truths honestly on the overdue/not-yet contradiction', () => {
    const scoring = computeRplScoring(baseAnswers({ rpl_q3: 'overdue', rpl_q9: 'not_yet' }), null);
    const line = buildRplSurpriseLine(scoring);
    expect(line).toMatch(/overdue/i);
    expect(line).toMatch(/not yet/i);
  });
});

describe('buildRplMembershipDoor', () => {
  it('gives every ready/deciding pattern a real primary button', () => {
    for (const pattern of ['ready_now', 'ready_if_small', 'still_deciding'] as const) {
      expect(buildRplMembershipDoor(pattern).primaryButton).not.toBeNull();
    }
  });

  it('gives Not Yet no primary button at all, only the honest "I will be here" framing', () => {
    const door = buildRplMembershipDoor('not_yet');
    expect(door.primaryButton).toBeNull();
    expect(door.body).toMatch(/Noticing/);
  });

  it('never uses an em dash anywhere in the closing copy', () => {
    for (const pattern of ['ready_now', 'ready_if_small', 'still_deciding', 'not_yet'] as const) {
      const door = buildRplMembershipDoor(pattern);
      expect(door.heading).not.toMatch(/—/);
      expect(door.body).not.toMatch(/—/);
    }
    for (const pattern of ['ready_now', 'ready_if_small', 'still_deciding', 'not_yet'] as const) {
      expect(buildRplSetupLine(pattern)).not.toMatch(/—/);
    }
  });
});

describe('rplNoticingDay7Text', () => {
  it('gives the exact honest-zero-taps copy', () => {
    expect(rplNoticingDay7Text(0)).toMatch(/didn't log any moments this week/i);
  });

  it('gives the exact one-real-data-point copy for one or two taps', () => {
    expect(rplNoticingDay7Text(1)).toMatch(/one real moment is one real data point/i);
    expect(rplNoticingDay7Text(2)).toMatch(/one real moment is one real data point/i);
  });

  it('reflects the real count for three or more taps, never fabricated praise', () => {
    expect(rplNoticingDay7Text(5)).toMatch(/5 of seven days/);
    expect(rplNoticingDay7Text(3)).toMatch(/3 of seven days/);
  });
});

describe('buildEvidenceEchoLine', () => {
  it('uses only the real signal label and counts passed in, never invents numbers', () => {
    const line = buildEvidenceEchoLine({ signalLabel: 'Tension', yesCount: 4, windowDays: 5 });
    expect(line).toMatch(/Tension/);
    expect(line).toMatch(/4 of the last 5 days/);
  });
});

describe('rplExperimentIntroCopy', () => {
  it('gives every one of the four patterns a distinct, non-empty theory/body/button', () => {
    const patterns = [
      { q3: 'overdue', q4: 'genuinely_open', q7: 'easily_doable', q9: 'ready_now' as const },
      { q3: 'overdue', q4: 'genuinely_open', q7: 'even_that_heavy', q9: 'ready_if_small' as const },
      { q3: 'curious', q4: 'room_if_protect', q7: 'doable_good_days', q9: 'still_deciding' as const },
      { q3: 'a_little_scary', q4: 'almost_none', q7: 'even_that_heavy', q9: 'not_yet' as const },
    ];
    const seen = new Set<string>();
    for (const p of patterns) {
      const scoring = computeRplScoring(baseAnswers({ rpl_q3: p.q3, rpl_q4: p.q4, rpl_q7: p.q7, rpl_q9: p.q9 }), null);
      expect(scoring.finalPattern).toBe(p.q9);
      const intro = rplExperimentIntroCopy(scoring);
      expect(intro.heading.length).toBeGreaterThan(0);
      expect(intro.body.length).toBeGreaterThan(0);
      seen.add(intro.heading);
    }
    expect(seen.size).toBe(patterns.length);
  });

  it('the Ready If It\'s Small experiment is explicitly smaller (2 minutes) than Ready Now\'s (5 minutes)', () => {
    const readyNow = computeRplScoring(
      baseAnswers({ rpl_q3: 'overdue', rpl_q4: 'genuinely_open', rpl_q7: 'easily_doable', rpl_q9: 'ready_now' }),
      null
    );
    const readyIfSmall = computeRplScoring(
      baseAnswers({ rpl_q3: 'overdue', rpl_q4: 'genuinely_open', rpl_q7: 'even_that_heavy', rpl_q9: 'ready_if_small' }),
      null
    );
    expect(rplExperimentIntroCopy(readyNow).body).toMatch(/5[- ]minute/);
    expect(rplExperimentIntroCopy(readyIfSmall).body).toMatch(/2[- ]minute/i);
  });
});
