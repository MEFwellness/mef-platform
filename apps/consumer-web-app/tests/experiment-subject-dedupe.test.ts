/**
 * The duplicate offer this closes, pinned against the REAL scoring and the
 * REAL copy rather than against a description of them.
 *
 * Production symptom (2026-09-07): Home's Active Experiments section showed
 * one member two 7-day offer cards for the same behavior, "take a genuine
 * 5-minute break in the mornings" and "take a real 5-minute break in the
 * mornings", each with its own "I'm in: start the 7 days" button. They came
 * from two different experiences, not from one experience firing twice: the
 * Readiness Pulse deliberately targets the Life Signal Check's own loudest
 * signal and inherits its hardest-time-of-day, so the collision is
 * systematic rather than accidental.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  signalSubjectKey,
  valueAreaSubjectKey,
  experienceSubjectKey,
  recommendationSubjectKey,
  resolveSubjectKey,
} from '../lib/lifestyle-experiments/subject';
import { suppressDuplicateOffers } from '../lib/lifestyle-experiments/offerDedupe';
import { suppressDuplicateOffers as suppressFromBarrel } from '../lib/lifestyle-experiments';
import { computeLscScoring } from '../lib/life-signal-check/scoring';
import { buildLscExperimentTheoryCopy } from '../lib/life-signal-check/copy';
import { computeRplScoring } from '../lib/readiness-pulse/scoring';
import { buildRplReadyNowExperimentCopy } from '../lib/readiness-pulse/copy';

/** The exact answers 8weeks2fab@gmail.com had in production: energy loudest and picked, mornings hardest. */
const LSC_ENERGY_MORNINGS = {
  lsc_q1: 'mornings',
  lsc_q2: 'mornings',
  lsc_q3: 'tired',
  lsc_q4: 'most_days',
  lsc_q5: 'rarely',
  lsc_q6: 'rarely',
  lsc_q7: 'rarely',
  lsc_q8: 'rarely',
  lsc_q9: 'rarely',
  lsc_q10: 'energy',
  lsc_q11: 'months',
};

const RPL_READY_NOW = {
  rpl_q1: 'first_real_try',
  rpl_q2: 'results_too_slow',
  rpl_q3: 'curious',
  rpl_q4: 'small_pockets',
  rpl_q5: 'adaptive',
  rpl_q6: 'schedule',
  rpl_q7: 'doable_good_days',
  rpl_q8: 'energy',
  rpl_q9: 'ready_now',
};

describe('the production duplicate, reproduced from the real scoring', () => {
  it('the Life Signal Check and the Readiness Pulse really do describe the same 5-minute break', () => {
    const lsc = computeLscScoring(LSC_ENERGY_MORNINGS, null);
    expect(lsc.chosenSignal).toBe('energy');
    expect(lsc.hardestTimeOfDay).toBe('mornings');

    const rpl = computeRplScoring(RPL_READY_NOW, {
      loudestSignal: lsc.loudestSignal,
      pattern: lsc.pattern,
      hardestTimeOfDay: lsc.hardestTimeOfDay,
    });

    // This is the root cause, asserted rather than described: the Readiness
    // Pulse's target IS the Life Signal Check's loudest signal.
    expect(rpl.targetSignal).toBe(lsc.loudestSignal);

    const lscBody = buildLscExperimentTheoryCopy(lsc).body;
    const rplBody = buildRplReadyNowExperimentCopy(rpl).body;
    expect(lscBody).toContain('take a genuine 5-minute break in the mornings');
    expect(rplBody).toContain('take a real 5-minute break in the mornings');
    expect(lscBody).not.toBe(rplBody);
  });

  it('both offers resolve to ONE subject, which is what lets Home tell they are duplicates', () => {
    const lsc = computeLscScoring(LSC_ENERGY_MORNINGS, null);
    const rpl = computeRplScoring(RPL_READY_NOW, {
      loudestSignal: lsc.loudestSignal,
      pattern: lsc.pattern,
      hardestTimeOfDay: lsc.hardestTimeOfDay,
    });
    expect(signalSubjectKey(rpl.targetSignal)).toBe(signalSubjectKey(lsc.chosenSignal));
  });

  it('the more recent offer survives and the older one is silently dropped', () => {
    const offers = [
      { key: 'cvs', subjectKey: valueAreaSubjectKey('purpose'), sourceCompletedAt: '2026-08-27T21:49:00Z' },
      { key: 'lsc', subjectKey: signalSubjectKey('energy'), sourceCompletedAt: '2026-08-27T21:50:55Z' },
      { key: 'rpl', subjectKey: signalSubjectKey('energy'), sourceCompletedAt: '2026-08-27T21:51:20Z' },
    ];

    const kept = suppressDuplicateOffers(offers, []);

    // The unrelated Purpose & Meaningful Work card is untouched, and exactly
    // one of the two Energy cards survives: the Readiness Pulse's, because
    // it is the one that read her readiness answer.
    expect(kept.map((o) => o.key)).toEqual(['cvs', 'rpl']);
  });
});

describe('suppressDuplicateOffers', () => {
  it('refuses silently: it returns the surviving offers rather than throwing or erroring', () => {
    const offers = [
      { key: 'lsc', subjectKey: signalSubjectKey('tension'), sourceCompletedAt: '2026-09-01T00:00:00Z' },
      { key: 'rpl', subjectKey: signalSubjectKey('tension'), sourceCompletedAt: '2026-09-02T00:00:00Z' },
    ];
    expect(() => suppressDuplicateOffers(offers, [])).not.toThrow();
    const kept = suppressDuplicateOffers(offers, []);
    expect(kept).toHaveLength(1);
    // The surviving offer is the same object, unmodified: nothing is
    // rewritten, merged or re-worded on the way through.
    expect(kept[0]).toBe(offers[1]);
  });

  it('leaves genuinely different experiments alone', () => {
    const offers = [
      { key: 'cvs', subjectKey: valueAreaSubjectKey('peace'), sourceCompletedAt: '2026-09-01T00:00:00Z' },
      { key: 'lsc', subjectKey: signalSubjectKey('tension'), sourceCompletedAt: '2026-09-02T00:00:00Z' },
      { key: 'rpl', subjectKey: experienceSubjectKey('readiness-pulse'), sourceCompletedAt: '2026-09-03T00:00:00Z' },
    ];
    expect(suppressDuplicateOffers(offers, [])).toHaveLength(3);
  });

  it("the Readiness Pulse's noticing patterns never collide with a real signal offer", () => {
    const stillDeciding = computeRplScoring({ ...RPL_READY_NOW, rpl_q9: 'still_deciding' }, null);
    expect(stillDeciding.finalPattern).toBe('still_deciding');

    const offers = [
      { key: 'lsc', subjectKey: signalSubjectKey('tension'), sourceCompletedAt: '2026-09-01T00:00:00Z' },
      { key: 'rpl', subjectKey: experienceSubjectKey('readiness-pulse'), sourceCompletedAt: '2026-09-02T00:00:00Z' },
    ];
    expect(suppressDuplicateOffers(offers, []).map((o) => o.key)).toEqual(['lsc', 'rpl']);
  });

  it('an offer for something already RUNNING is dropped, whichever experience is running it', () => {
    const offers = [
      { key: 'rpl', subjectKey: signalSubjectKey('tension'), sourceCompletedAt: '2026-09-06T00:00:00Z' },
      { key: 'cvs', subjectKey: valueAreaSubjectKey('peace'), sourceCompletedAt: '2026-09-06T00:00:00Z' },
    ];
    // The running experiment came from the Life Signal Check; the offer came
    // from the Readiness Pulse. The old per-experience guards could not see
    // across that boundary. This one does.
    const kept = suppressDuplicateOffers(offers, [signalSubjectKey('tension')]);
    expect(kept.map((o) => o.key)).toEqual(['cvs']);
  });

  it('an offer with no nameable subject is never suppressed', () => {
    const offers = [
      { key: 'a', subjectKey: null, sourceCompletedAt: '2026-09-01T00:00:00Z' },
      { key: 'b', subjectKey: null, sourceCompletedAt: '2026-09-02T00:00:00Z' },
    ];
    expect(suppressDuplicateOffers(offers, [null])).toHaveLength(2);
  });

  it('a tie keeps the earlier offer in input order, so the result never depends on Promise.all', () => {
    const offers = [
      { key: 'lsc', subjectKey: signalSubjectKey('mind'), sourceCompletedAt: '2026-09-02T00:00:00Z' },
      { key: 'rpl', subjectKey: signalSubjectKey('mind'), sourceCompletedAt: '2026-09-02T00:00:00Z' },
    ];
    expect(suppressDuplicateOffers(offers, []).map((o) => o.key)).toEqual(['lsc']);
    expect(suppressDuplicateOffers([...offers].reverse(), []).map((o) => o.key)).toEqual(['rpl']);
  });

  it('is reachable from the barrel, which is what Home imports', () => {
    expect(suppressFromBarrel).toBe(suppressDuplicateOffers);
  });
});

describe('resolveSubjectKey — rows written before migration 216', () => {
  const base = { subjectKey: null, sourceExperienceKey: null, recommendationId: null };

  it('recovers a Life Signal Check row from the title it already stores', () => {
    expect(resolveSubjectKey({ ...base, title: 'Tension', sourceExperienceKey: 'life-signal-check' })).toBe(
      signalSubjectKey('tension')
    );
  });

  it("recovers a Readiness Pulse row, including its 'small' variant, as the SAME subject", () => {
    expect(resolveSubjectKey({ ...base, title: 'Tension', sourceExperienceKey: 'readiness-pulse' })).toBe(
      signalSubjectKey('tension')
    );
    expect(resolveSubjectKey({ ...base, title: 'Tension (small)', sourceExperienceKey: 'readiness-pulse' })).toBe(
      signalSubjectKey('tension')
    );
  });

  it('recovers a Core Values Snapshot row from its value area label', () => {
    expect(
      resolveSubjectKey({ ...base, title: 'Purpose & Meaningful Work', sourceExperienceKey: 'core-values-snapshot' })
    ).toBe(valueAreaSubjectKey('purpose'));
  });

  it('falls back to the experience for a Readiness Pulse noticing row', () => {
    expect(resolveSubjectKey({ ...base, title: 'Daily Noticing', sourceExperienceKey: 'readiness-pulse' })).toBe(
      experienceSubjectKey('readiness-pulse')
    );
  });

  it('names a deep-dive row by its own experience', () => {
    expect(resolveSubjectKey({ ...base, title: 'One uninvited thing', sourceExperienceKey: 'being-seen' })).toBe(
      experienceSubjectKey('being-seen')
    );
  });

  it('names a Recommendation Engine row by its recommendation', () => {
    expect(resolveSubjectKey({ ...base, title: 'Morning walk', recommendationId: 'rec-1' })).toBe(
      recommendationSubjectKey('rec-1')
    );
  });

  it('prefers a stored subject_key over anything derived from the title', () => {
    expect(
      resolveSubjectKey({
        subjectKey: signalSubjectKey('sleep'),
        title: 'Tension',
        sourceExperienceKey: 'life-signal-check',
        recommendationId: null,
      })
    ).toBe(signalSubjectKey('sleep'));
  });

  it('returns null when there is genuinely nothing to name the subject with', () => {
    expect(resolveSubjectKey({ ...base, title: 'Something' })).toBeNull();
  });
});

describe("Home's Active Experiments section is really wired to the rule", () => {
  // ActiveExperimentsSection is an async server component pulling eleven
  // server actions, so it is not renderable here. What IS worth pinning is
  // that it has not quietly gone back to rendering each offer independently,
  // which is the exact shape of the original bug.
  const source = readFileSync(
    new URL('../components/dashboard/ActiveExperimentsSection.tsx', import.meta.url),
    'utf8'
  );

  it('passes its offers through suppressDuplicateOffers', () => {
    expect(source).toContain('suppressDuplicateOffers(');
  });

  it('feeds it the subjects of every running experiment, not just one experience', () => {
    expect(source).toContain('runningSubjectKeys');
    expect(source).toContain('resolveSubjectKey(e)');
  });

  it('renders the deduped offers, never the raw ones', () => {
    for (const raw of ['rawCvsOffer', 'rawLscOffer', 'rawRplOffer']) {
      // The raw value may only be read to build the candidate list and to be
      // handed to its own surviving-offer const, never rendered directly.
      expect(source).not.toContain(`{!cvsActive && ${raw}`);
      expect(source).not.toContain(`sessionId={${raw}.`);
    }
    expect(source).toContain("const cvsOffer = survivingOffers.has('cvs') ? rawCvsOffer : null;");
    expect(source).toContain("const lscOffer = survivingOffers.has('lsc') ? rawLscOffer : null;");
    expect(source).toContain("const rplOffer = survivingOffers.has('rpl') ? rawRplOffer : null;");
  });
});
