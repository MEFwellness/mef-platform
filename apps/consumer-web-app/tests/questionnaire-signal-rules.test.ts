/**
 * THE SURVEY SIGNAL RULE, NUMBER BY NUMBER.
 *
 * Every threshold is pinned here, so retuning one is a visible change to a
 * test rather than a quiet change to what a coach is shown. Every branch of
 * the rule is driven at its boundary, from literals, with no database.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ACTIVE_BASES,
  ACTIVE_MIN_POINTS,
  OTHER_SOURCE_WINDOW_DAYS,
  QUESTIONNAIRE_RULE_REVISION,
  SECTION_STRONGLY_ELEVATED_MIN_PERCENT,
  SUPPORTABLE_MIN_POINTS,
} from '@/lib/cross-system-signals/questionnaireRules';
import {
  applyQuestionnaireActivation,
  buildQuestionnaireFacts,
  buildSittingFacts,
  currentTriggerRows,
  decideAnswer,
  otherSourceSupport,
  type SurveySittingFacts,
} from '@/lib/cross-system-signals/questionnaireState';
import { evaluateTrigger, questionsInFiredAssociations } from '@/lib/body-systems/triggerEvaluation';
import { compareCaptured, evidenceStateOf, groupHistories } from '@/lib/cross-system-root/evidence';
import { buildResults } from '@/lib/body-systems/scoring';
import type { SignalRecord } from '@/lib/cross-system-signals/types';
import { BANDS, QUESTIONS, SCALE, SECTIONS } from './body-systems-fixture';
import { signal } from './cross-system-pattern-fixture';
import { SURVEY_TRIGGERS, answers } from './questionnaire-root-fixture';

const ROOT = path.resolve(__dirname, '..');

function facts(overrides: Partial<SurveySittingFacts> = {}): SurveySittingFacts {
  return {
    sittingId: 'sitting-1',
    completedAt: '2026-09-17T14:00:00.000Z',
    branch: 'b',
    sectionOf: new Map([['N4', 'brain']]),
    sectionPercent: new Map([['brain', 10]]),
    relatedEntries: new Map(),
    ...overrides,
  };
}

function surveyRow(overrides: Partial<SignalRecord> = {}): SignalRecord {
  return signal({
    signalSlug: 'headaches',
    signalName: 'Headaches',
    sourceKey: 'body_systems_survey',
    sourceLabel: 'Rooted Reset Body Systems Survey',
    sourceSessionId: 'sitting-1',
    sourceQuestionRef: 'N4',
    valueKind: 'scale',
    valueLabel: 'Sometimes',
    valueKey: 'sometimes',
    valueNumeric: 3,
    capturedOn: '2026-09-17',
    capturedAt: '2026-09-17T14:00:00.000Z',
    ...overrides,
  });
}

function decide(points: number, sitting: SurveySittingFacts | null = facts(), records: SignalRecord[] = []) {
  return decideAnswer({ points, questionRef: 'N4', signalSlug: 'headaches', sitting, sittingDay: '2026-09-17', records });
}

describe('the numbers, in one place', () => {
  it('pins every threshold', () => {
    expect(ACTIVE_MIN_POINTS).toBe(6);
    expect(SUPPORTABLE_MIN_POINTS).toBe(3);
    expect(SECTION_STRONGLY_ELEVATED_MIN_PERCENT).toBe(50);
    expect(OTHER_SOURCE_WINDOW_DAYS).toBe(30);
    expect(QUESTIONNAIRE_RULE_REVISION).toBe('body-systems-signal-rule-1');
  });

  it('matches the survey scale it is written against', () => {
    const points = Object.fromEntries(SCALE.map((option) => [option.valueKey, option.points]));
    expect(points).toEqual({ never: 0, rarely: 1, sometimes: 3, often: 6, almost_always: 8 });
  });

  it('no other file restates a threshold', () => {
    for (const file of [
      'lib/cross-system-signals/questionnaireState.ts',
      'lib/cross-system-signals/adapters/bodySystems.ts',
      'lib/cross-system-root/questionnaireEngine.ts',
      'lib/cross-system-root/noticedView.ts',
    ]) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(source, file).not.toMatch(/>=\s*(6|50)\b|<\s*3\b|>\s*30\b/);
    }
  });
});

describe('each answer on the scale, with nothing supporting it', () => {
  it.each([
    [8, 'often_or_more', true],
    [6, 'often_or_more', true],
    [3, 'sometimes_without_support', false],
    [1, 'rarely_or_never', false],
    [0, 'rarely_or_never', false],
  ])('%i points is %s', (points, basis, active) => {
    const decision = decide(points);
    expect(decision.basis).toBe(basis);
    expect(decision.active).toBe(active);
    expect(ACTIVE_BASES.has(decision.basis)).toBe(active);
  });

  it('Rarely and Never are never lifted, whatever supports them', () => {
    const loud = facts({
      sectionPercent: new Map([['brain', 100]]),
      relatedEntries: new Map([['N4', ['BR-1']]]),
    });
    const other = [signal({ signalSlug: 'headaches', sourceKey: 'member_reported', valueNumeric: null, capturedOn: '2026-09-16' })];
    expect(decide(1, loud, other).active).toBe(false);
    expect(decide(0, loud, other).active).toBe(false);
  });
});

describe('support condition 1: the section', () => {
  it('49 does not lift a Sometimes and 50 does', () => {
    expect(decide(3, facts({ sectionPercent: new Map([['brain', 49]]) })).active).toBe(false);
    const at = decide(3, facts({ sectionPercent: new Map([['brain', 50]]) }));
    expect(at.active).toBe(true);
    expect(at.basis).toBe('sometimes_section_elevated');
  });

  it('is the question\'s OWN section, not a loud neighbour', () => {
    const decision = decide(3, facts({ sectionPercent: new Map([['brain', 10], ['digestion', 90]]) }));
    expect(decision.active).toBe(false);
  });

  it('a section answered Sometimes throughout is in the survey\'s loudest band and still under 50', () => {
    const sheet = Object.fromEntries(Object.keys(answers({})).map((ref) => [ref, 'sometimes']));
    const results = buildResults({ sections: SECTIONS, questions: QUESTIONS, scale: SCALE, bands: BANDS, answers: sheet, branch: 'b' });
    for (const section of results.sections) {
      expect(section.bandKey).toBe('speaking_loudly');
      expect(section.percent).toBeLessThan(SECTION_STRONGLY_ELEVATED_MIN_PERCENT);
    }
  });
});

describe('support condition 2: another source', () => {
  const complaint = (capturedOn: string, valueNumeric: number | null = null, sourceKey = 'member_reported') =>
    signal({ signalSlug: 'headaches', sourceKey, sourceLabel: sourceKey === 'coach_entered' ? 'Coach entered' : 'Reported by the member', valueNumeric, capturedOn, capturedAt: `${capturedOn}T12:00:00.000Z` });

  it('counts a report 30 days either side of the sitting, and not 31', () => {
    expect(decide(3, facts(), [complaint('2026-08-18')]).active).toBe(true);
    expect(decide(3, facts(), [complaint('2026-10-17')]).active).toBe(true);
    expect(decide(3, facts(), [complaint('2026-08-17')]).active).toBe(false);
    expect(decide(3, facts(), [complaint('2026-10-18')]).active).toBe(false);
  });

  it('names every source that supports it', () => {
    const labels = otherSourceSupport(
      [complaint('2026-09-10'), complaint('2026-09-12', 3, 'coach_entered')],
      'headaches',
      '2026-09-17'
    );
    expect(labels).toEqual(['Coach entered', 'Reported by the member']);
  });

  it('a source whose own latest word in the window closed it lends nothing', () => {
    expect(decide(3, facts(), [complaint('2026-09-01'), complaint('2026-09-10', 0)]).active).toBe(false);
  });

  it('a different signal lends nothing, and the survey never supports itself', () => {
    expect(decide(3, facts(), [signal({ signalSlug: 'brain-fog', sourceKey: 'member_reported', valueNumeric: null, capturedOn: '2026-09-16' })]).active).toBe(false);
    expect(decide(3, facts(), [surveyRow({ valueNumeric: 8, sourceSessionId: 'sitting-0', capturedOn: '2026-09-10' })]).active).toBe(false);
  });
});

describe('support condition 3: a related survey association', () => {
  it('holds only for a question named in a held condition of a fired entry', () => {
    const decision = decide(3, facts({ relatedEntries: new Map([['N4', ['BR-1']]]) }));
    expect(decision.active).toBe(true);
    expect(decision.basis).toBe('sometimes_related_association');
    expect(decision.relatedEntryCodes).toEqual(['BR-1']);
  });

  it('a cluster that did not fire names nothing, and one that fired names all its questions', () => {
    const cluster = SURVEY_TRIGGERS.find(
      (row) => row.branch !== 'a' && (row.trigger.type === 'cluster' || row.trigger.type === 'min_elevated')
    )!;
    const trigger = cluster.trigger as { type: 'cluster'; questions: string[]; min: number };
    const quiet = answers({});
    expect(questionsInFiredAssociations({ scale: SCALE, bands: BANDS, answers: quiet, results: buildResults({ sections: SECTIONS, questions: QUESTIONS, scale: SCALE, bands: BANDS, answers: quiet, branch: 'b' }), branch: 'b' }, [cluster]).size).toBe(0);

    const loud = answers(Object.fromEntries(trigger.questions.slice(0, trigger.min).map((ref) => [ref, 'often'])));
    const results = buildResults({ sections: SECTIONS, questions: QUESTIONS, scale: SCALE, bands: BANDS, answers: loud, branch: 'b' });
    const outcome = evaluateTrigger({ scale: SCALE, bands: BANDS, answers: loud, results }, trigger);
    expect(outcome.held).toBe(true);
    expect(outcome.answerRefs).toEqual(trigger.questions.slice(0, trigger.min));
    const named = questionsInFiredAssociations({ scale: SCALE, bands: BANDS, answers: loud, results, branch: 'b' }, [cluster]);
    for (const ref of trigger.questions) expect(named.get(ref)).toEqual([cluster.entryCode]);
  });

  it('an entry for the other branch never lends support', () => {
    const branchA = SURVEY_TRIGGERS.find((row) => row.branch === 'a');
    if (!branchA) return;
    const loud = Object.fromEntries(Object.keys(answers({}, 'a')).map((ref) => [ref, 'almost_always']));
    const results = buildResults({ sections: SECTIONS, questions: QUESTIONS, scale: SCALE, bands: BANDS, answers: loud, branch: 'b' });
    expect(questionsInFiredAssociations({ scale: SCALE, bands: BANDS, answers: loud, results, branch: 'b' }, [branchA]).size).toBe(0);
  });
});

describe('only the newest sitting is current', () => {
  const older = surveyRow({ id: 'older', sourceSessionId: 'sitting-0', valueNumeric: 8, valueLabel: 'Almost always', capturedOn: '2026-09-01', capturedAt: '2026-09-01T14:00:00.000Z' });
  const newer = surveyRow({ id: 'newer', valueNumeric: 0, valueLabel: 'Never' });
  const bothFacts = buildQuestionnaireFacts([
    facts({ sittingId: 'sitting-0', completedAt: '2026-09-01T14:00:00.000Z' }),
    facts(),
  ]);

  it('marks an older sitting superseded, while remembering it was active on its day', () => {
    const judged = applyQuestionnaireActivation([older, newer], bothFacts);
    const oldVerdict = judged.find((row) => row.id === 'older')!.questionnaire!;
    expect(oldVerdict).toMatchObject({ activeAtCapture: true, superseded: true, current: false });
    expect(judged.find((row) => row.id === 'newer')!.questionnaire).toMatchObject({ current: false, superseded: false });
  });

  it('which reads as reported before, not current', () => {
    const judged = applyQuestionnaireActivation([older, newer], bothFacts);
    const [history] = groupHistories(judged);
    expect(evidenceStateOf(history!, '2026-09-17')).toBe('resolved');
  });

  it('works out the newest sitting from the rows when the sittings could not be read', () => {
    const rollup = (session: string, at: string) =>
      signal({ sourceKey: 'body_systems_survey', sourceSessionId: session, valueKind: 'band', capturedAt: at, capturedOn: at.slice(0, 10), signalSlug: 'bss-system-brain' });
    const judged = applyQuestionnaireActivation(
      [older, rollup('sitting-0', '2026-09-01T14:00:00.000Z'), rollup('sitting-1', '2026-09-17T14:00:00.000Z')],
      { sittings: new Map(), latestSittingId: null }
    );
    expect(judged[0]!.questionnaire!.superseded).toBe(true);
    // Rows that are not survey answers carry no verdict at all.
    expect(judged[1]!.questionnaire).toBeUndefined();
  });

  it('a row that is not a survey answer is returned untouched', () => {
    const complaint = signal({ sourceKey: 'member_reported' });
    expect(applyQuestionnaireActivation([complaint], bothFacts)[0]).toBe(complaint);
  });
});

describe('two questions, one signal, one sitting', () => {
  it('the loudest present answer is the latest word and the one trigger', () => {
    const t2 = surveyRow({ id: 't2', signalSlug: 'cold-hands-or-feet', sourceQuestionRef: 'T2', valueNumeric: 6, valueLabel: 'Often' });
    const h9 = surveyRow({ id: 'h9', signalSlug: 'cold-hands-or-feet', sourceQuestionRef: 'H9', valueNumeric: 0, valueLabel: 'Never' });
    const judged = applyQuestionnaireActivation([t2, h9], buildQuestionnaireFacts([facts()]));
    for (const order of [judged, [...judged].reverse()]) {
      const [history] = groupHistories(order);
      expect(history!.latest.id).toBe('t2');
      expect(evidenceStateOf(history!, '2026-09-17')).toBe('current');
      expect(currentTriggerRows(order, 'sitting-1').map((row) => row.id)).toEqual(['t2']);
    }
    expect(compareCaptured(judged[1]!, judged[0]!)).toBeLessThan(0);
  });
});

describe('questions she did not answer produce nothing', () => {
  it('Does not apply to me, an unanswered question and a question off her branch are never read', async () => {
    const { buildBodySystemsSignals } = await import('@/lib/cross-system-signals/adapters/bodySystems');
    const { REAL_LIBRARY, SURVEY_CONTENT } = await import('./questionnaire-root-fixture');
    const dnaQuestion = QUESTIONS.find((question) => question.allowsDna)!;
    const sheet = answers({ [dnaQuestion.questionRef]: 'dna', N4: 'almost_always' });
    delete sheet.D1;
    sheet.HA3 = 'almost_always'; // a branch a question, on a branch b sitting
    const results = buildResults({ sections: SECTIONS, questions: QUESTIONS, scale: SCALE, bands: BANDS, answers: sheet, branch: 'b' });
    const drafts = buildBodySystemsSignals(
      {
        sittingId: 'sitting-1',
        completedAt: '2026-09-17T14:00:00.000Z',
        answers: sheet,
        results,
        sections: SURVEY_CONTENT.sections,
        questions: QUESTIONS.filter((question) => question.branch !== 'a'),
        scale: SCALE,
        bands: BANDS,
      },
      { library: REAL_LIBRARY, capturedOn: '2026-09-17', knownSlugs: new Set(['bloating-after-eating', 'hot-flashes']) }
    );
    const refs = drafts.filter((draft) => draft.valueKind === 'scale').map((draft) => draft.sourceQuestionRef);
    expect(refs).toEqual(['N4']);
  });

  it('a sitting fact is built only from questions on her own branch', () => {
    const results = buildResults({ sections: SECTIONS, questions: QUESTIONS, scale: SCALE, bands: BANDS, answers: answers({}), branch: 'b' });
    const built = buildSittingFacts({ sittingId: 's', completedAt: 'x', branch: 'b', answers: answers({}), results, questions: QUESTIONS, scale: SCALE, bands: BANDS, associationTriggers: SURVEY_TRIGGERS });
    expect(built.sectionOf.has('HA1')).toBe(false);
    expect(built.sectionOf.has('HB1')).toBe(true);
  });
});
