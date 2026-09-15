/**
 * THE FIVE INGESTION ADAPTERS.
 *
 * Every `build` is pure, so every case below is a literal sitting and a
 * literal library, with no database anywhere. What is worth proving is the
 * set of things a mapping layer can quietly get wrong:
 *
 *   1. IT MAPS WHAT SHE ANSWERED, AND ONLY THAT. An unmapped key writes
 *      nothing, a skipped answer writes nothing, and no adapter has a
 *      fallback that could invent a name.
 *   2. THE SOURCE AND THE EXACT RESPONSE SURVIVE. Every draft names its
 *      source, its sitting, the question inside it and the words the
 *      member was actually answering.
 *   3. RE-INGESTION IS SAFE. One completed sitting produces one stable
 *      fingerprint per thing, and a different sitting produces a different
 *      one, which is what makes the library append over time rather than
 *      idempotent per signal.
 *   4. A SETTLED SIGNAL CAN CLOSE ITSELF OUT. A quiet answer writes a row
 *      when she has reported that signal before, and nothing when she has
 *      not.
 *   5. NO ZONE LOGIC CROSSES FROM THE SIGNAL ASSESSMENT. Its adapter reads
 *      sections and there is no path from it to a Zone.
 */

import { describe, it, expect } from 'vitest';
import {
  buildBodySystemsSignals,
  type BodySystemsAdapterInput,
} from '@/lib/cross-system-signals/adapters/bodySystems';
import {
  buildWholeBodySignalSignals,
  type WholeBodySignalAdapterInput,
} from '@/lib/cross-system-signals/adapters/wholeBodySignal';
import {
  buildBreathingSignals,
  BPC_NOTABLE_MIN_POINTS,
  type BreathingAdapterInput,
} from '@/lib/cross-system-signals/adapters/breathingCheckIn';
import {
  buildBodyAssessmentSignals,
  sideFromFinding,
  type BodyAssessmentAdapterInput,
} from '@/lib/cross-system-signals/adapters/bodyAssessment';
import {
  buildDailyCheckInSignals,
  type DailyCheckInAdapterInput,
} from '@/lib/cross-system-signals/adapters/dailyCheckIn';
import { SIGNAL_ADAPTERS, SIGNAL_ADAPTER_REGISTRY } from '@/lib/cross-system-signals/adapters';
import { buildRegistry, fingerprint } from '@/lib/cross-system-signals/registry';
import type { BodyAssessmentFinding } from '@mef/shared-types-contracts';
import { TEST_LIBRARY } from './cross-system-signal-library-fixture';

const CONTEXT = { library: TEST_LIBRARY, capturedOn: '2026-09-15', knownSlugs: new Set<string>() };

function withKnown(...slugs: string[]) {
  return { ...CONTEXT, knownSlugs: new Set(slugs) };
}

// ---------------------------------------------------------------------
// The registry itself
// ---------------------------------------------------------------------

describe('the adapter registry', () => {
  it('holds all five sources, each exactly once', () => {
    expect(SIGNAL_ADAPTER_REGISTRY.size).toBe(5);
    expect([...SIGNAL_ADAPTER_REGISTRY.keys()].sort()).toEqual([
      'body_assessment',
      'body_systems_survey',
      'breathing_pattern_check_in',
      'daily_check_in',
      'whole_body_signal',
    ]);
  });

  it('refuses two adapters claiming one source, rather than silently keeping the last', () => {
    const one = SIGNAL_ADAPTERS[0]!;
    expect(() => buildRegistry([one, one])).toThrow(/claim the source/);
  });

  it('every adapter carries a description, so a backfill can say what it ran', () => {
    for (const adapter of SIGNAL_ADAPTERS) {
      expect(adapter.description.length).toBeGreaterThan(10);
    }
  });

  it('a fingerprint names the source, the sitting and the thing, and nothing else', () => {
    expect(fingerprint('body_systems_survey', 'sit-1', 'question:D1')).toBe(
      'body_systems_survey:sit-1:question:D1'
    );
  });
});

// ---------------------------------------------------------------------
// 1. Rooted Reset Body Systems Survey
// ---------------------------------------------------------------------

const BSS_SECTIONS = [
  {
    sectionKey: 'digestion',
    position: 1,
    displayName: 'Digestion',
    memberIntroLine: '',
    topAttentionLine: '',
    registryDomain: 'digestive',
    registryCode: 'body_systems_digestion',
  },
  {
    sectionKey: 'kidney',
    position: 2,
    displayName: 'Kidney and Bladder',
    memberIntroLine: '',
    topAttentionLine: '',
    registryDomain: 'renal',
    registryCode: 'body_systems_kidney',
  },
];

const BSS_QUESTIONS = [
  {
    questionRef: 'D1',
    sectionKey: 'digestion',
    position: 1,
    prompt: 'I feel bloated after eating.',
    branch: 'all' as const,
    allowsDna: false,
    dnaLabel: null,
  },
  {
    questionRef: 'K2',
    sectionKey: 'kidney',
    position: 1,
    prompt: 'I urinate more often than feels normal.',
    branch: 'all' as const,
    allowsDna: false,
    dnaLabel: null,
  },
  {
    questionRef: 'M7',
    sectionKey: 'muscles',
    position: 1,
    prompt: 'My lower back aches.',
    branch: 'all' as const,
    allowsDna: false,
    dnaLabel: null,
  },
  {
    questionRef: 'D9',
    sectionKey: 'digestion',
    position: 2,
    prompt: 'I feel nauseous.',
    branch: 'all' as const,
    allowsDna: true,
    dnaLabel: 'Does not apply to me',
  },
];

const BSS_SCALE = [
  { valueKey: 'never', position: 1, label: 'Never', points: 0, isElevated: false },
  { valueKey: 'rarely', position: 2, label: 'Rarely', points: 1, isElevated: false },
  { valueKey: 'sometimes', position: 3, label: 'Sometimes', points: 3, isElevated: false },
  { valueKey: 'often', position: 4, label: 'Often', points: 6, isElevated: true },
  { valueKey: 'almost_always', position: 5, label: 'Almost always', points: 8, isElevated: true },
];

const BSS_BANDS = [
  {
    bandKey: 'quiet',
    position: 1,
    minPercent: 0,
    maxPercent: 15,
    colorKey: 'green' as const,
    memberLabel: 'Quiet',
    memberStatusLine: '',
  },
  {
    bandKey: 'showing_up',
    position: 2,
    minPercent: 15,
    maxPercent: 35,
    colorKey: 'yellow' as const,
    memberLabel: 'Showing up',
    memberStatusLine: '',
  },
  {
    bandKey: 'speaking_loudly',
    position: 3,
    minPercent: 35,
    maxPercent: null,
    colorKey: 'red' as const,
    memberLabel: 'Speaking loudly',
    memberStatusLine: '',
  },
];

function bssInput(over: Partial<BodySystemsAdapterInput> = {}): BodySystemsAdapterInput {
  return {
    sittingId: 'bss-1',
    completedAt: '2026-09-15T14:00:00.000Z',
    answers: { D1: 'often', K2: 'sometimes', M7: 'almost_always', D9: 'dna' },
    results: {
      branch: 'a',
      sections: [
        {
          sectionKey: 'digestion',
          points: 14,
          possible: 40,
          percent: 35,
          bandKey: 'speaking_loudly',
          answeredCount: 4,
          dnaCount: 1,
        },
        {
          sectionKey: 'kidney',
          points: 3,
          possible: 40,
          percent: 8,
          bandKey: 'quiet',
          answeredCount: 4,
          dnaCount: 0,
        },
      ],
    },
    sections: BSS_SECTIONS,
    questions: BSS_QUESTIONS,
    scale: BSS_SCALE,
    bands: BSS_BANDS,
    ...over,
  };
}

describe('the Body Systems Survey adapter', () => {
  it('carries every section band across, including the quiet one', () => {
    const drafts = buildBodySystemsSignals(bssInput(), CONTEXT);
    const sections = drafts.filter((draft) => draft.valueKind === 'band');
    expect(sections.map((draft) => draft.signalSlug).sort()).toEqual([
      'bss-system-digestion',
      'bss-system-kidney',
    ]);
    // The quiet one is the half that matters: without it, last month's
    // alarm would stand forever with nothing able to close it.
    const quiet = sections.find((draft) => draft.signalSlug === 'bss-system-kidney')!;
    expect(quiet.valueLabel).toBe('Quiet');
    expect(quiet.valueNumeric).toBe(8);
  });

  it('carries an elevated individual answer, with the exact question she read', () => {
    const drafts = buildBodySystemsSignals(bssInput(), CONTEXT);
    const bloating = drafts.find((draft) => draft.signalSlug === 'bloating-after-eating')!;
    expect(bloating.valueKind).toBe('scale');
    expect(bloating.valueLabel).toBe('Often');
    expect(bloating.valueNumeric).toBe(6);
    expect(bloating.sourceQuestionRef).toBe('D1');
    expect(bloating.sourceQuestionPrompt).toBe('I feel bloated after eating.');
    expect(bloating.sourceSessionId).toBe('bss-1');
    expect(bloating.sourceLabel).toBe('Rooted Reset Body Systems Survey');
  });

  it('leaves a merely Sometimes answer alone when she has never reported it', () => {
    const drafts = buildBodySystemsSignals(bssInput(), CONTEXT);
    expect(drafts.some((draft) => draft.signalSlug === 'frequent-urination')).toBe(false);
  });

  it('carries that same Sometimes answer once she has reported it before, so it can settle', () => {
    const drafts = buildBodySystemsSignals(bssInput(), withKnown('frequent-urination'));
    const row = drafts.find((draft) => draft.signalSlug === 'frequent-urination')!;
    expect(row.valueLabel).toBe('Sometimes');
  });

  it('skips a Does not apply to me tap rather than scoring it as anything', () => {
    const drafts = buildBodySystemsSignals(bssInput(), withKnown('bloating-after-eating'));
    expect(drafts.some((draft) => draft.sourceQuestionRef === 'D9')).toBe(false);
  });

  it('skips a question nobody has mapped, rather than inventing a name for it', () => {
    const input = bssInput({
      answers: { UNMAPPED: 'often' },
      questions: [
        {
          questionRef: 'UNMAPPED',
          sectionKey: 'digestion',
          position: 9,
          prompt: 'Something nobody wired up.',
          branch: 'all',
          allowsDna: false,
          dnaLabel: null,
        },
      ],
      results: null,
    });
    expect(buildBodySystemsSignals(input, CONTEXT)).toEqual([]);
  });

  it('prefers the dictionary row body area over the name default', () => {
    const drafts = buildBodySystemsSignals(bssInput(), CONTEXT);
    const back = drafts.find((draft) => draft.signalSlug === 'low-back-ache')!;
    expect(back.bodyAreaKey).toBe('low_back');
  });

  it('gives one sitting one fingerprint per thing, and a second sitting different ones', () => {
    const first = buildBodySystemsSignals(bssInput(), CONTEXT);
    const again = buildBodySystemsSignals(bssInput(), CONTEXT);
    expect(again.map((d) => d.ingestFingerprint)).toEqual(first.map((d) => d.ingestFingerprint));

    const second = buildBodySystemsSignals(bssInput({ sittingId: 'bss-2' }), CONTEXT);
    for (const print of second.map((d) => d.ingestFingerprint)) {
      expect(first.map((d) => d.ingestFingerprint)).not.toContain(print);
    }
  });

  it('dates every draft on the day the caller resolved from her own timezone', () => {
    for (const draft of buildBodySystemsSignals(bssInput(), CONTEXT)) {
      expect(draft.capturedOn).toBe('2026-09-15');
      expect(draft.capturedAt).toBe('2026-09-15T14:00:00.000Z');
    }
  });
});

// ---------------------------------------------------------------------
// 2. Rooted Reset Whole-Body Signal Assessment
// ---------------------------------------------------------------------

function wbsInput(over: Partial<WholeBodySignalAdapterInput> = {}): WholeBodySignalAdapterInput {
  return {
    sittingId: 'wbs-1',
    completedAt: '2026-09-14T10:00:00.000Z',
    sections: [
      {
        sectionKey: 'digestive_flow',
        points: 20,
        possible: 40,
        percent: 50,
        bandKey: 'speaking_loudly',
        answeredCount: 10,
        pntaCount: 0,
      },
      {
        sectionKey: 'body_clock',
        points: 5,
        possible: 40,
        percent: 13,
        bandKey: 'quiet',
        answeredCount: 10,
        pntaCount: 0,
      },
    ],
    sectionContent: [
      {
        sectionKey: 'digestive_flow',
        position: 3,
        displayName: 'Digestive Flow',
        memberTransitionLine: '',
        memberAreaPhrase: '',
        motionCue: '',
      },
    ],
    bands: [
      {
        bandKey: 'speaking_loudly',
        position: 3,
        minPercent: 50,
        maxPercent: 75,
        memberLabel: 'Speaking Loudly',
        memberLine: '',
        memberIntensityWord: 'Moderate',
        coachColor: 'orange',
      },
    ],
    ...over,
  };
}

describe('the Whole-Body Signal Assessment adapter', () => {
  it('carries a mapped section percentage across as a band signal', () => {
    const drafts = buildWholeBodySignalSignals(wbsInput(), CONTEXT);
    expect(drafts).toHaveLength(1);
    const row = drafts[0]!;
    expect(row.signalSlug).toBe('wbs-section-digestive-flow');
    expect(row.valueKind).toBe('band');
    expect(row.valueLabel).toBe('Speaking Loudly');
    expect(row.valueNumeric).toBe(50);
    expect(row.sourceLabel).toBe('Rooted Reset Whole-Body Signal Assessment');
  });

  it('skips a section nobody mapped rather than guessing a name for it', () => {
    const drafts = buildWholeBodySignalSignals(wbsInput(), CONTEXT);
    expect(drafts.some((draft) => draft.sourceQuestionRef === 'body_clock')).toBe(false);
  });

  it('has no Zone in its input shape at all, which is the fence rather than a promise', () => {
    const input = wbsInput();
    expect(Object.keys(input).sort()).toEqual([
      'bands',
      'completedAt',
      'sectionContent',
      'sections',
      'sittingId',
    ]);
    const serialised = JSON.stringify(buildWholeBodySignalSignals(input, CONTEXT)).toLowerCase();
    for (const banned of ['zone', 'chakra', 'organ', 'gland']) {
      expect(serialised).not.toContain(banned);
    }
  });
});

// ---------------------------------------------------------------------
// 3. Breathing Pattern Check-In
// ---------------------------------------------------------------------

function bpcInput(over: Partial<BreathingAdapterInput> = {}): BreathingAdapterInput {
  return {
    sittingId: 'bpc-1',
    completedAt: '2026-09-13T09:00:00.000Z',
    answers: { tight_chest: 'often', cold_hands_feet: 'rarely' },
    results: {
      totalScore: 24,
      maxScore: 64,
      answeredCount: 16,
      itemScores: { tight_chest: 3, cold_hands_feet: 1 },
    },
    ...over,
  };
}

describe('the Breathing Pattern Check-In adapter', () => {
  it('derives the notable line from the scale itself rather than from a typed number', () => {
    // The five responses are worth 0 to 4, so the second highest is 3.
    expect(BPC_NOTABLE_MIN_POINTS).toBe(3);
  });

  it('carries the total as its own signal, out of the instrument own maximum', () => {
    const total = buildBreathingSignals(bpcInput(), CONTEXT).find(
      (draft) => draft.signalSlug === 'breathing-pattern-total'
    )!;
    expect(total.valueKind).toBe('score');
    expect(total.valueLabel).toBe('24 of 64');
    expect(total.valueNumeric).toBe(24);
  });

  it('carries a notable item and leaves a quiet one she has never reported', () => {
    const drafts = buildBreathingSignals(bpcInput(), CONTEXT);
    expect(drafts.some((draft) => draft.signalSlug === 'chest-tightness')).toBe(true);
    expect(drafts.some((draft) => draft.signalSlug === 'cold-hands-or-feet')).toBe(false);
  });

  it('carries the quiet one once she has reported it before', () => {
    const drafts = buildBreathingSignals(bpcInput(), withKnown('cold-hands-or-feet'));
    const row = drafts.find((draft) => draft.signalSlug === 'cold-hands-or-feet')!;
    expect(row.valueLabel).toBe('Rarely');
  });

  it('keeps the validated stimulus verbatim, so the original answer can always be shown', () => {
    const row = buildBreathingSignals(bpcInput(), CONTEXT).find(
      (draft) => draft.signalSlug === 'chest-tightness'
    )!;
    expect(row.sourceQuestionPrompt).toBe('Tight feelings in chest');
    expect(row.sourceQuestionRef).toBe('tight_chest');
  });

  /**
   * THE WHOLE REASON THE LIBRARY IS SHARED. Two instruments ask about the
   * same thing in their own words, and the dictionary lands both on one
   * standardized name, so the coach reads ONE signal with a timeline
   * across both rather than two near duplicates that never meet.
   */
  it('lands on the same standardized name as the Body Systems Survey does', () => {
    const fromBreathing = buildBreathingSignals(
      bpcInput({ answers: { cold_hands_feet: 'often' }, results: {
        totalScore: 3, maxScore: 64, answeredCount: 1, itemScores: { cold_hands_feet: 3 },
      } }),
      CONTEXT
    ).find((draft) => draft.signalSlug === 'cold-hands-or-feet')!;

    const fromSurvey = buildBodySystemsSignals(
      bssInput({
        answers: { T2: 'often' },
        results: null,
        questions: [
          {
            questionRef: 'T2',
            sectionKey: 'thyroid',
            position: 2,
            prompt: 'My hands or feet are cold.',
            branch: 'all',
            allowsDna: false,
            dnaLabel: null,
          },
        ],
      }),
      CONTEXT
    ).find((draft) => draft.signalSlug === 'cold-hands-or-feet')!;

    expect(fromBreathing.signalSlug).toBe(fromSurvey.signalSlug);
    expect(fromBreathing.signalName).toBe('Cold hands or feet');
    expect(fromSurvey.signalName).toBe('Cold hands or feet');
    // And the two rows still say which instrument each came from, and what
    // each one actually asked.
    expect(fromBreathing.sourceLabel).toBe('Breathing Pattern Check-In');
    expect(fromSurvey.sourceLabel).toBe('Rooted Reset Body Systems Survey');
    expect(fromBreathing.sourceQuestionPrompt).toBe('Cold hands or feet');
    expect(fromSurvey.sourceQuestionPrompt).toBe('My hands or feet are cold.');
  });
});

// ---------------------------------------------------------------------
// 4. The camera posture and movement assessment
// ---------------------------------------------------------------------

function finding(over: Partial<BodyAssessmentFinding> = {}): BodyAssessmentFinding {
  return {
    id: 'find-1',
    assessment_id: 'cap-1',
    member_id: 'member-1',
    finding_type: 'hip_asymmetry',
    side: 'right',
    severity: 'moderate',
    confidence: 0.8,
    narrative: 'The right hip sits higher than the left.',
    evidence: [],
    provider_name: 'mediapipe',
    status: 'pending_review',
    coach_reviewed_by: null,
    coach_reviewed_at: null,
    coach_override_notes: null,
    supersedes_id: null,
    superseded_by_id: null,
    threshold_config_version: null,
    raw_value: null,
    unit: null,
    side_diff: null,
    created_at: '2026-09-12T09:00:00.000Z',
    updated_at: '2026-09-12T09:00:00.000Z',
    ...over,
  };
}

function captureInput(findings: BodyAssessmentFinding[]): BodyAssessmentAdapterInput {
  return {
    assessmentId: 'cap-1',
    assessmentTypeLabel: 'static_posture',
    completedAt: '2026-09-12T09:05:00.000Z',
    findings,
  };
}

describe('the posture and movement adapter', () => {
  it('carries an active finding with its side and its severity', () => {
    const drafts = buildBodyAssessmentSignals(captureInput([finding()]), CONTEXT);
    expect(drafts).toHaveLength(1);
    const row = drafts[0]!;
    expect(row.signalSlug).toBe('uneven-hips');
    expect(row.side).toBe('right');
    expect(row.valueKind).toBe('severity');
    expect(row.valueLabel).toBe('Moderate');
    expect(row.valueNumeric).toBe(2);
    expect(row.sourceRecordId).toBe('find-1');
    expect(row.sourceQuestionPrompt).toBe('The right hip sits higher than the left.');
  });

  it('translates the findings table bilateral into this library both', () => {
    expect(sideFromFinding('bilateral')).toBe('both');
    expect(sideFromFinding('left')).toBe('left');
    expect(sideFromFinding('not_applicable')).toBe('not_applicable');
  });

  it('writes nothing for a dismissed finding, because a dismissal is the coach saying it is not there', () => {
    expect(buildBodyAssessmentSignals(captureInput([finding({ status: 'dismissed' })]), CONTEXT)).toEqual(
      []
    );
    expect(
      buildBodyAssessmentSignals(captureInput([finding({ status: 'superseded' })]), CONTEXT)
    ).toEqual([]);
  });

  it('writes nothing for a none or an unknown severity', () => {
    expect(buildBodyAssessmentSignals(captureInput([finding({ severity: 'none' })]), CONTEXT)).toEqual(
      []
    );
    expect(
      buildBodyAssessmentSignals(captureInput([finding({ severity: 'unknown' })]), CONTEXT)
    ).toEqual([]);
  });

  it('writes nothing for a custom finding, which by definition has no standardized name', () => {
    expect(
      buildBodyAssessmentSignals(captureInput([finding({ finding_type: 'custom' })]), CONTEXT)
    ).toEqual([]);
  });

  it('keeps a left and a right row for one finding type apart, by fingerprinting the finding', () => {
    const drafts = buildBodyAssessmentSignals(
      captureInput([
        finding({ id: 'find-left', side: 'left' }),
        finding({ id: 'find-right', side: 'right' }),
      ]),
      CONTEXT
    );
    expect(drafts).toHaveLength(2);
    expect(new Set(drafts.map((draft) => draft.ingestFingerprint)).size).toBe(2);
  });
});

// ---------------------------------------------------------------------
// 5. The Daily Check-In
// ---------------------------------------------------------------------

function checkinInput(over: Partial<DailyCheckInAdapterInput> = {}): DailyCheckInAdapterInput {
  return {
    checkinId: 'chk-1',
    localDate: '2026-09-11',
    recordedAt: '2026-09-11T13:00:00.000Z',
    painDiscomfortLevel: 3,
    ...over,
  };
}

describe('the Daily Check-In adapter', () => {
  it('carries a reported level, with the day the check-in itself already resolved', () => {
    const drafts = buildDailyCheckInSignals(checkinInput(), CONTEXT);
    expect(drafts).toHaveLength(1);
    const row = drafts[0]!;
    expect(row.signalSlug).toBe('daily-pain-or-discomfort');
    expect(row.valueLabel).toBe('3 of 5');
    expect(row.valueNumeric).toBe(3);
    // Her own local_date, not the context's, because the row is the
    // authority on which day it belongs to.
    expect(row.capturedOn).toBe('2026-09-11');
  });

  it('writes nothing at a nought, which is her saying there is nothing to report', () => {
    expect(buildDailyCheckInSignals(checkinInput({ painDiscomfortLevel: 0 }), CONTEXT)).toEqual([]);
  });

  it('writes nothing when she skipped the question', () => {
    expect(buildDailyCheckInSignals(checkinInput({ painDiscomfortLevel: null }), CONTEXT)).toEqual(
      []
    );
  });
});

// ---------------------------------------------------------------------
// Everything, at once
// ---------------------------------------------------------------------

describe('every adapter, whatever it is looking at', () => {
  const ALL = [
    ...buildBodySystemsSignals(bssInput(), CONTEXT),
    ...buildWholeBodySignalSignals(wbsInput(), CONTEXT),
    ...buildBreathingSignals(bpcInput(), CONTEXT),
    ...buildBodyAssessmentSignals(captureInput([finding()]), CONTEXT),
    ...buildDailyCheckInSignals(checkinInput(), CONTEXT),
  ];

  it('produced something from every one of the five', () => {
    expect(ALL.length).toBeGreaterThan(5);
  });

  it('names a source, a source label and a sitting on every single draft', () => {
    for (const draft of ALL) {
      expect(draft.sourceKey.length).toBeGreaterThan(0);
      expect(draft.sourceLabel.length).toBeGreaterThan(0);
      expect(draft.sourceSessionId).toBeTruthy();
    }
  });

  it('never writes a slug or a category the library does not hold', () => {
    for (const draft of ALL) {
      expect(TEST_LIBRARY.names.has(draft.signalSlug), draft.signalSlug).toBe(true);
      expect(TEST_LIBRARY.categories.has(draft.categoryKey), draft.categoryKey).toBe(true);
      if (draft.bodyAreaKey) {
        expect(TEST_LIBRARY.bodyAreas.has(draft.bodyAreaKey), draft.bodyAreaKey).toBe(true);
      }
    }
  });

  it('gives every draft a value a coach can read, never a bare slug', () => {
    for (const draft of ALL) {
      expect(draft.valueLabel.trim().length).toBeGreaterThan(0);
      expect(draft.valueLabel).not.toBe(draft.valueKey);
    }
  });

  it('gives every draft a distinct fingerprint, so nothing silently overwrites anything', () => {
    expect(new Set(ALL.map((draft) => draft.ingestFingerprint)).size).toBe(ALL.length);
  });

  it('carries no em dash, because a coach reads every one of these labels', () => {
    for (const draft of ALL) {
      expect(`${draft.signalName}${draft.valueLabel}${draft.sourceQuestionPrompt ?? ''}`).not.toContain(
        '—'
      );
    }
  });
});
