/**
 * The experiment: built from HER answer, never from a technique Root
 * picked, and always with a version for a difficult day.
 *
 * The failure this guards is the easy one to ship by accident: a generic
 * five minute breathing exercise offered to a member who told you, one
 * screen earlier, that what actually restores her is music. The brief calls
 * that out by name, so it is asserted over every one of Q9's options rather
 * than over the one in the fixture.
 */

import { describe, it, expect } from 'vitest';
import { buildStressLoadExperiment } from '@/lib/stress-load/experiment';
import { STRESS_LOAD_EXPERIMENT_DURATION_DAYS } from '@/lib/stress-load/constants';
import { RECOVERY_SOURCE_OPTIONS, OTHER_VALUE } from '@/lib/stress-load/questions';
import { fullAnswers } from './stress-load-questions.test';

function withRecovery(selected: string[], otherText: string | null = null) {
  return fullAnswers({ recovery_sources: { selected, otherText } });
}

describe('every one of her options produces a real, distinct five minutes', () => {
  const canonical = RECOVERY_SOURCE_OPTIONS.filter((option) => option.value !== OTHER_VALUE);

  it('covers all ten named options', () => {
    for (const option of canonical) {
      const offer = buildStressLoadExperiment(withRecovery([option.value]));
      expect(offer, option.value).not.toBeNull();
      expect(offer!.sourceValue).toBe(option.value);
      expect(offer!.action.length).toBeGreaterThan(30);
      expect(offer!.durationDays).toBe(STRESS_LOAD_EXPERIMENT_DURATION_DAYS);
    }
  });

  it('and no two of them are the same protocol', () => {
    const protocols = canonical.map(
      (option) => buildStressLoadExperiment(withRecovery([option.value]))!.protocol
    );
    expect(new Set(protocols).size).toBe(protocols.length);
  });

  it('every one carries a difficult-day version, inside the stored protocol', () => {
    for (const option of canonical) {
      const offer = buildStressLoadExperiment(withRecovery([option.value]))!;
      expect(offer.hardDay).toContain('On a difficult day');
      expect(offer.hardDay).toContain('still counts');
      expect(offer.protocol).toContain(offer.action);
      expect(offer.protocol).toContain(offer.hardDay);
    }
  });

  it('no member-facing or coach-facing string in any of them carries an em dash', () => {
    for (const option of RECOVERY_SOURCE_OPTIONS) {
      const offer = buildStressLoadExperiment(withRecovery([option.value], 'a long bath'));
      if (!offer) continue;
      for (const value of [offer.title, offer.action, offer.hardDay, offer.protocol]) {
        expect(value).not.toContain('—');
      }
    }
  });
});

describe('which one she is offered', () => {
  it('is the first thing she picked, not the first thing on the list', () => {
    const offer = buildStressLoadExperiment(withRecovery(['music', 'sleep', 'outside']))!;
    expect(offer.sourceValue).toBe('music');
    expect(offer.action).toContain('music');
  });

  it('changes when her order changes, which is what makes it her answer', () => {
    const first = buildStressLoadExperiment(withRecovery(['music', 'sleep']))!;
    const second = buildStressLoadExperiment(withRecovery(['sleep', 'music']))!;
    expect(first.sourceValue).not.toBe(second.sourceValue);
  });

  it('uses her own words when "Other" is what she picked first', () => {
    const offer = buildStressLoadExperiment(withRecovery([OTHER_VALUE, 'music'], 'a long bath'))!;
    expect(offer.sourceValue).toBe(OTHER_VALUE);
    expect(offer.action).toContain('a long bath');
    expect(offer.hardDay).toContain('a long bath');
  });

  it('returns nothing rather than guessing when there is nothing to build from', () => {
    expect(buildStressLoadExperiment(withRecovery([]))).toBeNull();
    expect(buildStressLoadExperiment(withRecovery([OTHER_VALUE], '   '))).toBeNull();
  });
});

describe('the cap is the existing one', () => {
  it('the action goes through the shared lifestyle_experiments machinery and its own cap', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const source = readFileSync(
      path.join(path.resolve(__dirname, '..'), 'app/actions/stressLoad.ts'),
      'utf8'
    );
    expect(source).toContain('countActiveExperiments');
    expect(source).toContain('MAX_ACTIVE_EXPERIMENTS');
    expect(source).toContain('startLifestyleExperiment');
    // The offer is rebuilt server side from the stored sitting, so a
    // hand-built request cannot supply its own protocol.
    expect(source).toContain('buildStressLoadExperiment(session.answers)');
  });
});
