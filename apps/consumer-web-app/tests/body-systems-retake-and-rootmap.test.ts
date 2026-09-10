/**
 * The retake intelligence, and the eleven Root Map rows.
 */

import { describe, it, expect } from 'vitest';
import {
  BANDS,
  LIBRARY,
  QUESTIONS,
  SCALE,
  SECTIONS,
  answerAll,
} from './body-systems-fixture';
import { buildResults } from '../lib/body-systems/scoring';
import { compareSections, comparePatterns, directionFor } from '../lib/body-systems/retake';
import { buildCoachReadingView } from '../lib/body-systems/coachView';
import { buildMemberResultsView } from '../lib/body-systems/memberView';
import { fireAssociations } from '../lib/body-systems/associations';
import {
  buildBodySystemsRegistryDrafts,
  severityForBandPosition,
} from '../lib/body-systems/rootMap';
import { FINDING_DISPLAY_NAMES } from '../lib/naming/findingNames';
import { assignDomains } from '../lib/member-interpretation/domainMap';
import { meetsNamingStandard } from '../lib/naming/standard';
import type { RegistryDomain } from '@mef/shared-types-contracts';

const base = { sections: SECTIONS, questions: QUESTIONS, scale: SCALE, bands: BANDS };

function resultsFor(answers: Record<string, string>) {
  return buildResults({ ...base, answers, branch: 'a' });
}

describe('the member compare view', () => {
  it('says quieter, unchanged or louder per section', () => {
    const previous = resultsFor(answerAll('a', 'often'));
    const current = resultsFor(answerAll('a', 'rarely'));
    const comparisons = compareSections({ current, previous, minDelta: 1 });
    expect(comparisons).toHaveLength(11);
    for (const comparison of comparisons) {
      expect(comparison.direction).toBe('quieter');
      expect(comparison.previousPercent).toBe(75);
      expect(comparison.currentPercent).toBe(13);
    }
  });

  it('says nothing at all on a first sitting', () => {
    const current = resultsFor(answerAll('a', 'often'));
    for (const comparison of compareSections({ current, previous: null })) {
      expect(comparison.direction).toBeNull();
      expect(comparison.previousPercent).toBeNull();
    }
    const view = buildMemberResultsView({
      sections: SECTIONS,
      bands: BANDS,
      results: current,
      previousResults: null,
      minDeltaPercent: 1,
    });
    expect(view.isRetake).toBe(false);
    expect(view.bars.every((bar) => bar.comparison === null)).toBe(true);
  });

  it('holds the threshold it was given', () => {
    expect(directionFor(40, 38, 1)).toBe('louder');
    expect(directionFor(40, 38, 5)).toBe('unchanged');
    expect(directionFor(38, 40, 5)).toBe('unchanged');
    expect(directionFor(30, 40, 5)).toBe('quieter');
  });

  it('keeps the current sitting order rather than reordering itself', () => {
    const previous = resultsFor(answerAll('a', 'never'));
    const answers = answerAll('a', 'never');
    answers.D1 = 'almost_always';
    const current = resultsFor(answers);
    const comparisons = compareSections({ current, previous, minDelta: 1 });
    expect(comparisons.map((c) => c.sectionKey)).toEqual(current.sections.map((s) => s.sectionKey));
  });
});

describe('the coach pattern comparison', () => {
  function firedFor(answers: Record<string, string>) {
    const results = resultsFor(answers);
    return {
      results,
      fired: fireAssociations({ ...base, answers, results, branch: 'a', library: LIBRARY }),
    };
  }

  it('calls a pattern that has gone away resolved', () => {
    const before = answerAll('a', 'never');
    before.M4 = 'almost_always'; // M-2, cramp and mineral
    const after = answerAll('a', 'never');

    const previous = firedFor(before);
    const current = firedFor(after);
    const changes = comparePatterns({
      current: current.fired,
      previous: previous.fired,
      sectionComparisons: compareSections({
        current: current.results,
        previous: previous.results,
        minDelta: 1,
      }),
    });
    expect(changes.find((c) => c.entryCode === 'M-2')?.change).toBe('resolved');
  });

  it('calls a pattern that has just appeared louder', () => {
    const before = answerAll('a', 'never');
    const after = answerAll('a', 'never');
    after.M4 = 'almost_always';

    const previous = firedFor(before);
    const current = firedFor(after);
    const changes = comparePatterns({
      current: current.fired,
      previous: previous.fired,
      sectionComparisons: compareSections({
        current: current.results,
        previous: previous.results,
        minDelta: 1,
      }),
    });
    expect(changes.find((c) => c.entryCode === 'M-2')?.change).toBe('louder');
  });

  it('calls a standing pattern quieter when its own section quietened', () => {
    const before = answerAll('a', 'never');
    for (const ref of ['M4', 'M5', 'M6', 'M7']) before[ref] = 'almost_always';
    const after = answerAll('a', 'never');
    after.M4 = 'often';

    const previous = firedFor(before);
    const current = firedFor(after);
    const changes = comparePatterns({
      current: current.fired,
      previous: previous.fired,
      sectionComparisons: compareSections({
        current: current.results,
        previous: previous.results,
        minDelta: 1,
      }),
    });
    expect(changes.find((c) => c.entryCode === 'M-2')?.change).toBe('quieter');
  });

  it('says joined by new related signals when something new turned up beside it', () => {
    const before = answerAll('a', 'never');
    before.M4 = 'almost_always'; // M-2 only
    const after = answerAll('a', 'never');
    after.M4 = 'almost_always';
    for (const ref of ['M1', 'M2', 'M8']) after[ref] = 'almost_always'; // adds M-1

    const previous = firedFor(before);
    const current = firedFor(after);
    const changes = comparePatterns({
      current: current.fired,
      previous: previous.fired,
      sectionComparisons: compareSections({
        current: current.results,
        previous: previous.results,
        minDelta: 1,
      }),
    });
    expect(changes.find((c) => c.entryCode === 'M-2')?.change).toBe(
      'joined_by_new_related_signals'
    );
    expect(changes.find((c) => c.entryCode === 'M-1')?.change).toBe('louder');
  });

  it('is present on the coach view only when there is a previous sitting', () => {
    const answers = answerAll('a', 'often');
    const results = resultsFor(answers);
    const shared = {
      ...base,
      redFlags: [],
      safetyLevels: [],
      library: LIBRARY,
      answers,
      redFlagAnswers: {},
      results,
      branch: 'a' as const,
      minDeltaPercent: 1,
    };
    expect(buildCoachReadingView({ ...shared, previous: null }).patternChanges).toBeNull();
    expect(
      buildCoachReadingView({
        ...shared,
        previous: { answers, results, branch: 'a' },
      }).patternChanges
    ).not.toBeNull();
  });
});

describe('the Root Map feed', () => {
  const results = resultsFor(answerAll('a', 'often'));
  const drafts = buildBodySystemsRegistryDrafts({
    sections: SECTIONS,
    bands: BANDS,
    results,
    sessionId: 'session-1',
    recordedAt: '2026-09-10T00:00:00.000Z',
  });

  it('writes one row per section, every time, including the quiet ones', () => {
    const quiet = buildBodySystemsRegistryDrafts({
      sections: SECTIONS,
      bands: BANDS,
      results: resultsFor(answerAll('a', 'never')),
      sessionId: 'session-2',
      recordedAt: '2026-09-10T00:00:00.000Z',
    });
    // Publishing only the loud ones would leave last month's alarm standing
    // with nothing able to close it.
    expect(drafts).toHaveLength(11);
    expect(quiet).toHaveLength(11);
  });

  it('writes them in the sections own order, not in loudness order', () => {
    expect(drafts.map((draft) => draft.code)).toEqual(
      SECTIONS.slice().sort((a, b) => a.position - b.position).map((s) => s.registryCode)
    );
  });

  it('maps the three bands to three severities, loudest to significant', () => {
    expect(severityForBandPosition(3, 3)).toBe('significant');
    expect(severityForBandPosition(2, 3)).toBe('moderate');
    expect(severityForBandPosition(1, 3)).toBe('mild');
    // Never 'none', which would read to a member as "this has settled down
    // since we first noticed it" on her very first sitting.
    expect(
      buildBodySystemsRegistryDrafts({
        sections: SECTIONS,
        bands: BANDS,
        results: resultsFor(answerAll('a', 'never')),
        sessionId: 's',
        recordedAt: '2026-09-10T00:00:00.000Z',
      }).every((draft) => draft.severity !== 'none')
    ).toBe(true);
  });

  it('carries the whole sitting on one instant, so eleven rows read as one sitting', () => {
    expect(new Set(drafts.map((draft) => draft.recorded_at)).size).toBe(1);
  });

  it('names every finding through the Naming Standard, never after an organ', () => {
    for (const draft of drafts) {
      const mapped = FINDING_DISPLAY_NAMES[`${draft.domain}::${draft.code}`];
      expect(mapped, `${draft.code} has no name in findingNames.ts`).toBeTruthy();
      expect(draft.label).toBe(mapped);
      expect(meetsNamingStandard(draft.label), `${draft.label} breaks the Naming Standard`).toBe(
        true
      );
    }
  });

  it('files each section on exactly one Coaching Domain card', () => {
    const byCode = new Map(drafts.map((draft) => [draft.code, draft.domain]));
    const expected: Record<string, string> = {
      body_systems_digestion: 'digestion_gut_health',
      body_systems_blood_sugar: 'nutrition_metabolic_health',
      body_systems_liver: 'nutrition_metabolic_health',
      body_systems_adrenals: 'stress_nervous_system',
      body_systems_thyroid: 'nutrition_metabolic_health',
      body_systems_heart: 'movement_physical_capacity',
      body_systems_immune: 'recovery_energy_regulation',
      body_systems_kidney: 'recovery_energy_regulation',
      body_systems_muscles: 'pain_structural_integrity',
      body_systems_brain: 'emotional_resilience_mood',
      body_systems_hormonal: 'recovery_energy_regulation',
    };
    for (const [code, domain] of Object.entries(expected)) {
      const assignment = assignDomains(byCode.get(code) as RegistryDomain, code);
      expect(assignment.primary, `${code} landed on the wrong card`).toBe(domain);
      // A cross reference either way would put one section's answer on
      // another section's card.
      expect(assignment.alsoRelevant).toEqual([]);
    }
  });

  it('names its numbers in the coach note, so a coach can see how a band was reached', () => {
    const digestion = drafts.find((draft) => draft.code === 'body_systems_digestion');
    expect(digestion?.coach_context).toContain('Digestion at 75% (Speaking loudly)');
    expect(digestion?.coach_context).toContain('across 10 answered questions');
  });

  it('counts a Does not apply to me answer out loud in the note', () => {
    const answers = answerAll('a', 'often');
    answers.L2 = 'dna';
    const withDna = buildBodySystemsRegistryDrafts({
      sections: SECTIONS,
      bands: BANDS,
      results: resultsFor(answers),
      sessionId: 's',
      recordedAt: '2026-09-10T00:00:00.000Z',
    });
    const liver = withDna.find((draft) => draft.code === 'body_systems_liver');
    expect(liver?.coach_context).toContain('1 marked as not applying and left out of the total');
  });
});
