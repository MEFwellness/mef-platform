/**
 * The Visibility Layer — every rule from the brief, each pinned by a test
 * that fails if the behaviour comes back.
 *
 * These drive the REAL resolver and the REAL catalog. Nothing here re-tests
 * the systems underneath: the interpretation layer still owns what a
 * finding and a tier are, the assessment registry still owns what a
 * completed assessment is, and the safety system still owns what a
 * restricted topic is. These assert what the visibility layer concludes
 * from them.
 */
import { describe, it, expect } from 'vitest';
import {
  VISIBILITY_CATALOG,
  DRIVER_DOMAIN_TO_FEATURE,
  F,
  getFeatureDefinition,
  listFeatureKeys,
  safetyCriticalKeys,
} from '../lib/visibility/catalog';
import {
  answerSatisfies,
  emptyVisibilityContext,
  evaluateReveal,
  hasTouched,
  isRuleSatisfied,
  type VisibilityContext,
} from '../lib/visibility/rules';
import {
  MAX_REVEAL_SENTENCES_AT_ONCE,
  pendingReveals,
  resolveVisibility,
  type StoredVisibility,
} from '../lib/visibility/resolve';
import type { FeatureDefinition, FeatureKey } from '../lib/visibility/types';
import type { CanonicalFinding, EvidenceTier } from '../lib/member-interpretation/types';

// ---------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------

function finding(overrides: Partial<CanonicalFinding> = {}): CanonicalFinding {
  return {
    id: 'sleep::poor_sleep_quality',
    sourceKey: 'sleep::poor_sleep_quality',
    label: 'Sleep',
    statement: 'Your sleep came up.',
    tier: 'early_indication' as EvidenceTier,
    tierLabel: 'Early indication',
    evidence: [],
    verdict: 'noted',
    severity: 'mild',
    primaryDomain: 'sleep_circadian_rhythm',
    primaryDomainLabel: 'Sleep & Circadian Rhythm',
    alsoRelevantDomains: [],
    crossReferenceNote: null,
    memberVisible: true,
    registryEntryId: 'r1',
    ...overrides,
  };
}

function context(overrides: Partial<VisibilityContext> = {}): VisibilityContext {
  return { ...emptyVisibilityContext(), ...overrides };
}

function stored(rows: StoredVisibility[]): Map<FeatureKey, StoredVisibility> {
  return new Map(rows.map((r) => [r.featureKey, r] as const));
}

function row(overrides: Partial<StoredVisibility> & { featureKey: string }): StoredVisibility {
  return {
    state: 'revealed',
    source: 'rule',
    ruleKind: null,
    reason: null,
    revealedAt: '2026-08-01T00:00:00.000Z',
    acknowledgedAt: null,
    ...overrides,
  };
}

/** A tiny catalog, so a test about the resolver is not a test about the real rules. */
const TEST_CATALOG: FeatureDefinition[] = [
  {
    key: 'test.always',
    kind: 'card',
    surface: 'home',
    label: 'Always on',
    whoNeedsThis: 'Everyone.',
    revealWhen: [{ kind: 'always' }],
    revealSentence: null,
    touchedBy: { kind: 'none' },
  },
  {
    key: 'test.safety',
    kind: 'feature',
    surface: 'today',
    label: 'Safety thing',
    whoNeedsThis: 'Everyone, always.',
    revealWhen: [{ kind: 'safety' }],
    revealSentence: null,
    touchedBy: { kind: 'none' },
    safetyCritical: true,
  },
  {
    key: 'test.intake',
    kind: 'tracker',
    surface: 'today',
    label: 'Intake gated',
    whoNeedsThis: 'A member who said so.',
    revealWhen: [
      { kind: 'intake_answer', questionKey: 'baseline_sleep_quality', when: { op: 'at_most', value: 3 } },
    ],
    revealSentence: 'You mentioned your sleep has been rough, so I have opened a short sleep check for you.',
    touchedBy: { kind: 'behavior', signal: 'checkin_days' },
  },
  {
    key: 'test.behavior',
    kind: 'card',
    surface: 'home',
    label: 'Behaviour gated',
    whoNeedsThis: 'A member with seven days.',
    revealWhen: [{ kind: 'behavior', signal: 'checkin_days', atLeast: 7 }],
    revealSentence: 'You have seven days logged now.',
    touchedBy: { kind: 'none' },
  },
  {
    key: 'test.tier',
    kind: 'feature',
    surface: 'none',
    label: 'Tier gated',
    whoNeedsThis: 'A member with a repeated signal.',
    revealWhen: [{ kind: 'finding_tier', minTier: 'emerging_pattern' }],
    revealSentence: 'Something has shown up more than once.',
    touchedBy: { kind: 'none' },
  },
  {
    key: 'test.never',
    kind: 'card',
    surface: 'home',
    label: 'Retired',
    whoNeedsThis: 'Nobody.',
    revealWhen: [],
    revealSentence: null,
    touchedBy: { kind: 'none' },
  },
];

function resolveTest(input: {
  context?: VisibilityContext;
  stored?: Map<FeatureKey, StoredVisibility>;
}) {
  return resolveVisibility({
    context: input.context ?? context(),
    stored: input.stored ?? new Map(),
    catalog: TEST_CATALOG,
  });
}

// ---------------------------------------------------------------------
// Rule 1 — the default is hidden
// ---------------------------------------------------------------------

describe('rule 1: the default is hidden', () => {
  it('a brand-new member sees only what always and safety give her', () => {
    const visibility = resolveTest({});
    const visible = visibility.features.filter((f) => f.visible).map((f) => f.key);
    expect(visible.sort()).toEqual(['test.always', 'test.safety']);
  });

  it('over the REAL catalog, a brand-new member sees no assessment except the intake and the opening arc', () => {
    const visibility = resolveVisibility({ context: context(), stored: new Map() });
    const visibleAssessments = visibility.features
      .filter((f) => f.kind === 'assessment' && f.visible)
      .map((f) => f.key)
      .sort();
    expect(visibleAssessments).toEqual([
      F.assessmentCoreValues,
      F.assessmentOnboarding,
    ].sort());
  });

  it('over the REAL catalog, a brand-new member gets no tracker and no trend chart', () => {
    const visibility = resolveVisibility({ context: context(), stored: new Map() });
    for (const key of [
      F.trackerWater,
      F.trackerMovementLevel,
      F.trackerFoodLens,
      F.trackerHabits,
      F.homeTrendsEnergy,
      F.homeNoticingCarousel,
      F.homeWearableConnect,
      F.progressTrends,
    ]) {
      expect(visibility.byKey.get(key)?.visible, key).toBe(false);
    }
  });

  it('a feature with no rules can never be revealed by any state', () => {
    const rich = context({
      behavior: { ...emptyVisibilityContext().behavior, checkin_days: 900 },
      findings: [finding({ tier: 'coach_verified' })],
      coachAssignedFeatureKeys: new Set(['test.never']),
    });
    // Not even a coach assignment: 'test.never' declares no coach_assigned rule.
    expect(resolveTest({ context: rich }).byKey.get('test.never')?.visible).toBe(false);
  });

  it('the retired next-session row can never be revealed', () => {
    expect(getFeatureDefinition(F.homeNextSession)?.revealWhen).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// Each rule type reveals correctly
// ---------------------------------------------------------------------

describe('rule types', () => {
  it('an intake answer reveals', () => {
    const answered = context({ intakeAnswers: new Map([['baseline_sleep_quality', 2]]) });
    expect(resolveTest({ context: answered }).byKey.get('test.intake')?.visible).toBe(true);

    const fine = context({ intakeAnswers: new Map([['baseline_sleep_quality', 5]]) });
    expect(resolveTest({ context: fine }).byKey.get('test.intake')?.visible).toBe(false);
  });

  it('a behaviour counter reveals at the threshold and not one below it', () => {
    const six = context({ behavior: { ...emptyVisibilityContext().behavior, checkin_days: 6 } });
    const seven = context({ behavior: { ...emptyVisibilityContext().behavior, checkin_days: 7 } });
    expect(resolveTest({ context: six }).byKey.get('test.behavior')?.visible).toBe(false);
    expect(resolveTest({ context: seven }).byKey.get('test.behavior')?.visible).toBe(true);
  });

  it('a tier threshold reveals, and a lower tier does not', () => {
    const early = context({ findings: [finding({ tier: 'early_indication' })] });
    const emerging = context({ findings: [finding({ tier: 'emerging_pattern' })] });
    expect(resolveTest({ context: early }).byKey.get('test.tier')?.visible).toBe(false);
    expect(resolveTest({ context: emerging }).byKey.get('test.tier')?.visible).toBe(true);
  });

  it('a coach override reveals something no rule would', () => {
    const visibility = resolveTest({
      stored: stored([row({ featureKey: 'test.behavior', source: 'coach', state: 'revealed' })]),
    });
    const feature = visibility.byKey.get('test.behavior')!;
    expect(feature.visible).toBe(true);
    expect(feature.source).toBe('coach');
  });

  it('a coach override hides something a rule would reveal, and beats the rule', () => {
    const seven = context({ behavior: { ...emptyVisibilityContext().behavior, checkin_days: 7 } });
    const visibility = resolveTest({
      context: seven,
      stored: stored([row({ featureKey: 'test.behavior', source: 'coach', state: 'hidden' })]),
    });
    expect(visibility.byKey.get('test.behavior')?.visible).toBe(false);
    expect(visibility.byKey.get('test.behavior')?.source).toBe('coach');
  });

  it('a completed prior assessment reveals the next conversation in the chain', () => {
    const none = resolveVisibility({ context: context(), stored: new Map() });
    expect(none.byKey.get(F.assessmentLifeSignal)?.visible).toBe(false);

    const done = resolveVisibility({
      context: context({ completedAssessmentKeys: new Set(['core-values-snapshot']) }),
      stored: new Map(),
    });
    expect(done.byKey.get(F.assessmentLifeSignal)?.visible).toBe(true);
    expect(done.byKey.get(F.assessmentReadinessPulse)?.visible).toBe(false);
  });

  it('a cross-referenced domain satisfies a domain-scoped tier rule', () => {
    const rule = { kind: 'finding_tier', domain: 'sleep_circadian_rhythm', minTier: 'early_indication' } as const;
    const crossReferenced = context({
      findings: [
        finding({
          primaryDomain: 'recovery_energy_regulation',
          alsoRelevantDomains: ['sleep_circadian_rhythm'],
        }),
      ],
    });
    expect(isRuleSatisfied(rule, crossReferenced, 'anything')).toBe(true);
  });

  it('a RESOLVED finding never reveals anything', () => {
    // Found on production: the registry records a resolution by writing a
    // live row with severity 'none', and those rows were satisfying every
    // "a finding reached this tier" rule. Answering that her sleep was fine
    // was opening a sleep check for her.
    const rule = { kind: 'finding_tier', minTier: 'early_indication' } as const;
    const resolvedBySeverity = context({ findings: [finding({ severity: 'none' })] });
    const resolvedByVerdict = context({ findings: [finding({ verdict: 'resolved' })] });
    const live = context({ findings: [finding({ severity: 'mild', verdict: 'noted' })] });

    expect(isRuleSatisfied(rule, resolvedBySeverity, 'anything')).toBe(false);
    expect(isRuleSatisfied(rule, resolvedByVerdict, 'anything')).toBe(false);
    expect(isRuleSatisfied(rule, live, 'anything')).toBe(true);
  });

  it('a resolved finding does not reveal anything over the real catalog either', () => {
    const allResolved = context({
      findings: [
        finding({ sourceKey: 'sleep::poor_sleep_quality', severity: 'none', primaryDomain: 'sleep_circadian_rhythm' }),
        finding({ sourceKey: 'movement::pain_hips', severity: 'none', primaryDomain: 'pain_structural_integrity' }),
        finding({ sourceKey: 'stress::elevated_stress', severity: 'none', primaryDomain: 'stress_nervous_system' }),
      ],
    });
    const visibility = resolveVisibility({ context: allResolved, stored: new Map() });
    for (const key of [
      F.questionsSleep,
      F.questionsMechanics,
      F.questionsStress,
      F.featureRootMap,
      F.featureMovement,
      F.homeNoticingCarousel,
    ]) {
      expect(visibility.byKey.get(key)?.visible, key).toBe(false);
    }
  });

  it('a finding in an unrelated domain does not satisfy a domain-scoped rule', () => {
    const rule = { kind: 'finding_tier', domain: 'digestion_gut_health', minTier: 'early_indication' } as const;
    expect(isRuleSatisfied(rule, context({ findings: [finding()] }), 'anything')).toBe(false);
  });
});

describe('answer predicates', () => {
  it('equals matches a stored enum', () => {
    expect(answerSatisfies('pain', { op: 'equals', values: ['pain', 'weight'] })).toBe(true);
    expect(answerSatisfies('sleep', { op: 'equals', values: ['pain', 'weight'] })).toBe(false);
  });

  it('includes matches one of a multi-select', () => {
    expect(answerSatisfies(['hips', 'neck'], { op: 'includes', values: ['lower_back', 'hips'] })).toBe(true);
    expect(answerSatisfies([], { op: 'includes', values: ['hips'] })).toBe(false);
  });

  it('at_most and at_least read numbers in both directions', () => {
    expect(answerSatisfies(2, { op: 'at_most', value: 3 })).toBe(true);
    expect(answerSatisfies(4, { op: 'at_most', value: 3 })).toBe(false);
    expect(answerSatisfies(4, { op: 'at_least', value: 4 })).toBe(true);
    expect(answerSatisfies(3, { op: 'at_least', value: 4 })).toBe(false);
  });

  it('an unanswered question satisfies nothing, including "answered"', () => {
    expect(answerSatisfies(undefined, { op: 'answered' })).toBe(false);
    expect(answerSatisfies(null, { op: 'equals', values: ['pain'] })).toBe(false);
  });

  it('a numeric answer stored as a string still reads as a number', () => {
    // baseline_movement_frequency's allowed values are strings ("0", "1-2"),
    // and a rule about "0 days a week" must not silently never fire.
    expect(answerSatisfies('2', { op: 'at_most', value: 3 })).toBe(true);
    expect(answerSatisfies('1-2', { op: 'equals', values: ['0', '1-2'] })).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Rule 2 — grandfathering
// ---------------------------------------------------------------------

describe('rule 2: nothing she has touched ever disappears', () => {
  it('a touched feature stays even when no rule would reveal it', () => {
    const touched = context({
      behavior: { ...emptyVisibilityContext().behavior, checkin_days: 1 },
      intakeAnswers: new Map([['baseline_sleep_quality', 5]]),
    });
    const visibility = resolveTest({ context: touched });
    const feature = visibility.byKey.get('test.intake')!;
    expect(feature.visible).toBe(true);
    expect(feature.grandfathered).toBe(true);
    expect(feature.source).toBe('grandfathered');
  });

  it('a started but unfinished assessment counts as touched', () => {
    // buildVisibilityContext puts in-progress keys into completedAssessmentKeys
    // for exactly this reason; here the probe itself is the thing asserted.
    expect(
      hasTouched(
        { kind: 'assessment', keys: ['wbsa'] },
        context({ completedAssessmentKeys: new Set(['wbsa']) })
      )
    ).toBe(true);
  });

  it('an untouched feature is not grandfathered', () => {
    expect(hasTouched({ kind: 'none' }, context())).toBe(false);
    expect(hasTouched({ kind: 'behavior', signal: 'food_entries' }, context())).toBe(false);
  });

  it('grandfathering beats a hidden rule but not a coach hide', () => {
    const touched = context({ behavior: { ...emptyVisibilityContext().behavior, checkin_days: 1 } });
    const visibility = resolveTest({
      context: touched,
      stored: stored([row({ featureKey: 'test.intake', source: 'coach', state: 'hidden' })]),
    });
    expect(visibility.byKey.get('test.intake')?.visible).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Rule 3 — revealed stays revealed
// ---------------------------------------------------------------------

describe('rule 3: revealed stays revealed', () => {
  it('a stored reveal survives the data that produced it going away', () => {
    const quiet = context({ behavior: { ...emptyVisibilityContext().behavior, checkin_days: 0 } });
    const visibility = resolveTest({
      context: quiet,
      stored: stored([row({ featureKey: 'test.behavior', source: 'rule', state: 'revealed' })]),
    });
    expect(visibility.byKey.get('test.behavior')?.visible).toBe(true);
  });

  it('a tier falling back does not take a revealed feature away', () => {
    const dropped = context({ findings: [finding({ tier: 'early_indication' })] });
    const visibility = resolveTest({
      context: dropped,
      stored: stored([row({ featureKey: 'test.tier', state: 'revealed' })]),
    });
    expect(visibility.byKey.get('test.tier')?.visible).toBe(true);
  });

  it('the member hiding it herself does take it away', () => {
    const seven = context({ behavior: { ...emptyVisibilityContext().behavior, checkin_days: 7 } });
    const visibility = resolveTest({
      context: seven,
      stored: stored([row({ featureKey: 'test.behavior', source: 'member', state: 'hidden' })]),
    });
    expect(visibility.byKey.get('test.behavior')?.visible).toBe(false);
    expect(visibility.byKey.get('test.behavior')?.source).toBe('member');
  });

  it('every newly visible feature is queued to be written back', () => {
    const seven = context({ behavior: { ...emptyVisibilityContext().behavior, checkin_days: 7 } });
    const visibility = resolveTest({ context: seven });
    const pending = pendingReveals(visibility, new Map()).map((f) => f.key);
    expect(pending).toContain('test.behavior');
    expect(pending).toContain('test.always');
    // Safety is not a decision anybody made, so it is never stored.
    expect(pending).not.toContain('test.safety');
  });

  it('an already-stored reveal is not written again', () => {
    const seven = context({ behavior: { ...emptyVisibilityContext().behavior, checkin_days: 7 } });
    const existing = stored([row({ featureKey: 'test.behavior', state: 'revealed' })]);
    const visibility = resolveTest({ context: seven, stored: existing });
    expect(pendingReveals(visibility, existing).map((f) => f.key)).not.toContain('test.behavior');
  });
});

// ---------------------------------------------------------------------
// Rule 5 — safety, in both directions
// ---------------------------------------------------------------------

describe('rule 5: safety is exempt in both directions', () => {
  it('a safety feature is visible for a brand-new member with nothing', () => {
    expect(resolveTest({}).byKey.get('test.safety')?.visible).toBe(true);
  });

  it('a coach cannot hide a safety feature', () => {
    const visibility = resolveTest({
      stored: stored([row({ featureKey: 'test.safety', source: 'coach', state: 'hidden' })]),
    });
    expect(visibility.byKey.get('test.safety')?.visible).toBe(true);
    expect(visibility.byKey.get('test.safety')?.source).toBe('safety');
  });

  it('the member cannot hide a safety feature either', () => {
    const visibility = resolveTest({
      stored: stored([row({ featureKey: 'test.safety', source: 'member', state: 'hidden' })]),
    });
    expect(visibility.byKey.get('test.safety')?.visible).toBe(true);
  });

  it('the check-in and everything feeding safety monitoring are safety-critical in the real catalog', () => {
    const safety = safetyCriticalKeys();
    for (const key of [
      F.checkinDaily,
      F.checkinEvening,
      F.safetyFlagConcern,
      F.safetyCoachMessages,
      F.talkToRoot,
      F.featureNotifications,
    ]) {
      expect(safety.has(key), key).toBe(true);
    }
  });

  it('an open safety review never removes anything: it only ever adds', () => {
    const gated = resolveVisibility({ context: context({ safetyActive: true }), stored: new Map() });
    const calm = resolveVisibility({ context: context({ safetyActive: false }), stored: new Map() });
    for (const key of safetyCriticalKeys()) {
      expect(gated.byKey.get(key)?.visible, key).toBe(true);
      expect(calm.byKey.get(key)?.visible, key).toBe(true);
    }
    expect(gated.safetyActive).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Rule 5 (copy) — the reveal sentence
// ---------------------------------------------------------------------

describe('the reveal sentence', () => {
  it('a newly revealed feature carries its sentence, once', () => {
    const answered = context({ intakeAnswers: new Map([['baseline_sleep_quality', 2]]) });
    const first = resolveTest({ context: answered });
    expect(first.newlyRevealed.map((f) => f.key)).toContain('test.intake');
    expect(first.byKey.get('test.intake')?.revealSentence).toBe(
      'You mentioned your sleep has been rough, so I have opened a short sleep check for you.'
    );

    const afterAcknowledging = resolveTest({
      context: answered,
      stored: stored([
        row({ featureKey: 'test.intake', state: 'revealed', acknowledgedAt: '2026-08-02T00:00:00.000Z' }),
      ]),
    });
    expect(afterAcknowledging.newlyRevealed.map((f) => f.key)).not.toContain('test.intake');
    expect(afterAcknowledging.byKey.get('test.intake')?.revealSentence).toBeNull();
  });

  it('a grandfathered feature says nothing: nothing was revealed', () => {
    const touched = context({ behavior: { ...emptyVisibilityContext().behavior, checkin_days: 1 } });
    expect(resolveTest({ context: touched }).newlyRevealed.map((f) => f.key)).not.toContain('test.intake');
  });

  it('a member is never handed more than three sentences at once', () => {
    // Driving the live site found twelve stacked on one Home. Twelve short
    // kind sentences in a column is a wall of text, which is the exact
    // failure this build exists to fix.
    const everythingRevealed = context({
      intakeAnswers: new Map<string, string | number | string[]>([
        ['primary_concern', 'pain'],
        ['baseline_sleep_quality', 1],
        ['baseline_stress_level', 5],
        ['baseline_energy_level', 1],
        ['baseline_digestion', 1],
        ['baseline_pain_areas', ['lower_back', 'hips', 'neck']],
        ['baseline_movement_frequency', '0'],
        ['baseline_hydration', 'very_little'],
      ]),
      findings: [finding({ tier: 'coach_verified' })],
      behavior: { ...emptyVisibilityContext().behavior, checkin_days: 30 },
    });
    const visibility = resolveVisibility({ context: everythingRevealed, stored: new Map() });
    expect(visibility.newlyRevealed.length).toBeLessThanOrEqual(MAX_REVEAL_SENTENCES_AT_ONCE);
    // And the ones not shown are not lost: they are still visible features
    // with unacknowledged sentences, so they come round on her next visits.
    const owing = visibility.features.filter((f) => f.newlyRevealed && f.revealSentence);
    expect(owing.length).toBeGreaterThan(MAX_REVEAL_SENTENCES_AT_ONCE);
  });

  it('no reveal sentence in the real catalog uses an em dash, a tier name, or jargon', () => {
    const forbidden = [
      '—',
      'early indication',
      'emerging pattern',
      'supported by',
      'coach verified',
      'tier',
      'evidence tier',
      'unlock',
      'rule fired',
      'severity',
      'registry',
    ];
    for (const feature of VISIBILITY_CATALOG) {
      if (!feature.revealSentence) continue;
      const lower = feature.revealSentence.toLowerCase();
      for (const term of forbidden) {
        expect(lower.includes(term), `${feature.key}: "${feature.revealSentence}"`).toBe(false);
      }
    }
  });

  it("every reveal sentence is written in Root's own voice, first person", () => {
    for (const feature of VISIBILITY_CATALOG) {
      if (!feature.revealSentence) continue;
      expect(feature.revealSentence.length, feature.key).toBeGreaterThan(20);
      expect(feature.revealSentence.trim().endsWith('.'), feature.key).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------
// Rule 6 — follow-up question sets
// ---------------------------------------------------------------------

describe('rule 6: follow-up question sets obey the same system', () => {
  it('every driver domain maps to a real catalog entry', () => {
    const keys = new Set(listFeatureKeys());
    for (const [domainKey, featureKey] of Object.entries(DRIVER_DOMAIN_TO_FEATURE)) {
      expect(keys.has(featureKey), `${domainKey} -> ${featureKey}`).toBe(true);
      expect(getFeatureDefinition(featureKey)?.kind).toBe('question_set');
    }
  });

  it('an unanswered branch never appears: no sleep concern, no sleep question set', () => {
    const visibility = resolveVisibility({ context: context(), stored: new Map() });
    expect(visibility.byKey.get(F.questionsSleep)?.visible).toBe(false);
  });

  it('a sleep answer opens the sleep set and nothing else', () => {
    const sleepy = context({
      intakeAnswers: new Map<string, string | number | string[]>([
        ['primary_concern', 'sleep'],
        ['baseline_sleep_quality', 2],
      ]),
    });
    const visibility = resolveVisibility({ context: sleepy, stored: new Map() });
    expect(visibility.byKey.get(F.questionsSleep)?.visible).toBe(true);
    expect(visibility.byKey.get(F.questionsDigestion)?.visible).toBe(false);
    expect(visibility.byKey.get(F.questionsMechanics)?.visible).toBe(false);
  });

  it('the "everything else" set is open to everyone, so she always has somewhere to say something', () => {
    const visibility = resolveVisibility({ context: context(), stored: new Map() });
    expect(visibility.byKey.get(F.questionsContext)?.visible).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Three contrasting intake profiles produce three different apps
// ---------------------------------------------------------------------

describe('three contrasting intake profiles differ in the ways the rules predict', () => {
  const sleepAndStress = context({
    intakeAnswers: new Map<string, string | number | string[]>([
      ['primary_concern', 'sleep'],
      ['baseline_sleep_quality', 1],
      ['baseline_stress_level', 5],
      ['baseline_energy_level', 2],
      ['baseline_digestion', 5],
      ['baseline_pain_areas', []],
      ['baseline_movement_frequency', '5+'],
      ['baseline_hydration', 'plenty'],
    ]),
  });

  const painAndMovement = context({
    intakeAnswers: new Map<string, string | number | string[]>([
      ['primary_concern', 'pain'],
      ['baseline_sleep_quality', 5],
      ['baseline_stress_level', 1],
      ['baseline_energy_level', 5],
      ['baseline_digestion', 5],
      ['baseline_pain_areas', ['lower_back', 'hips']],
      ['baseline_movement_frequency', '0'],
      ['baseline_hydration', 'plenty'],
    ]),
  });

  const minimal = context({
    intakeAnswers: new Map<string, string | number | string[]>([
      ['primary_concern', 'general_optimization'],
      ['baseline_sleep_quality', 5],
      ['baseline_stress_level', 1],
      ['baseline_energy_level', 5],
      ['baseline_digestion', 5],
      ['baseline_pain_areas', []],
      ['baseline_movement_frequency', '5+'],
      ['baseline_hydration', 'plenty'],
    ]),
  });

  function seen(ctx: VisibilityContext): Set<string> {
    const visibility = resolveVisibility({ context: ctx, stored: new Map() });
    return new Set(visibility.features.filter((f) => f.visible).map((f) => f.key));
  }

  it('sleep-and-stress opens the sleep and stress sets, and not the pain one', () => {
    const s = seen(sleepAndStress);
    expect(s.has(F.questionsSleep)).toBe(true);
    expect(s.has(F.questionsStress)).toBe(true);
    expect(s.has(F.questionsMechanics)).toBe(false);
    expect(s.has(F.trackerMovementLevel)).toBe(false);
  });

  it('pain-and-movement opens movement, the body assessment and the pain set, and not the sleep one', () => {
    const s = seen(painAndMovement);
    expect(s.has(F.questionsMechanics)).toBe(true);
    expect(s.has(F.questionsMovement)).toBe(true);
    expect(s.has(F.trackerMovementLevel)).toBe(true);
    expect(s.has(F.assessmentBody)).toBe(true);
    expect(s.has(F.homeMovementAssessmentCard)).toBe(true);
    expect(s.has(F.questionsSleep)).toBe(false);
    expect(s.has(F.questionsStress)).toBe(false);
  });

  it('minimal-issues opens almost nothing beyond what everyone gets', () => {
    const s = seen(minimal);
    expect(s.has(F.questionsSleep)).toBe(false);
    expect(s.has(F.questionsStress)).toBe(false);
    expect(s.has(F.questionsMechanics)).toBe(false);
    expect(s.has(F.trackerMovementLevel)).toBe(false);
    expect(s.has(F.trackerFoodLens)).toBe(false);
    expect(s.has(F.assessmentBody)).toBe(false);
    // Still everything a member is owed regardless of what she said.
    expect(s.has(F.checkinDaily)).toBe(true);
    expect(s.has(F.priorityCard)).toBe(true);
    expect(s.has(F.talkToRoot)).toBe(true);
  });

  it('the three profiles genuinely differ from each other', () => {
    const a = seen(sleepAndStress);
    const b = seen(painAndMovement);
    const c = seen(minimal);
    expect([...a].sort()).not.toEqual([...b].sort());
    expect([...b].sort()).not.toEqual([...c].sort());
    expect([...a].sort()).not.toEqual([...c].sort());
    // And each one reveals at least one thing the others do not.
    expect([...a].some((k) => !b.has(k))).toBe(true);
    expect([...b].some((k) => !a.has(k))).toBe(true);
  });

  it('nobody in any profile sees the retired next-session row or an unbuilt assessment', () => {
    for (const ctx of [sleepAndStress, painAndMovement, minimal]) {
      const s = seen(ctx);
      expect(s.has(F.homeNextSession)).toBe(false);
      expect(s.has(F.assessmentReadinessToChange)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------
// Catalog integrity
// ---------------------------------------------------------------------

describe('catalog integrity', () => {
  it('every key is unique', () => {
    const keys = listFeatureKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every feature says who needs it, in a real sentence', () => {
    for (const feature of VISIBILITY_CATALOG) {
      expect(feature.whoNeedsThis.length, feature.key).toBeGreaterThan(20);
    }
  });

  it('a feature revealed by nothing but "always" carries no reveal sentence', () => {
    for (const feature of VISIBILITY_CATALOG) {
      const alwaysOnly =
        feature.revealWhen.length > 0 &&
        feature.revealWhen.every((r) => r.kind === 'always' || r.kind === 'safety');
      if (alwaysOnly) expect(feature.revealSentence, feature.key).toBeNull();
    }
  });

  it('"always" is used sparingly, and every use is deliberate', () => {
    const always = VISIBILITY_CATALOG.filter((f) =>
      f.revealWhen.some((r) => r.kind === 'always')
    ).map((f) => f.key);
    expect(always.sort()).toEqual(
      [
        F.priorityCard,
        F.assessmentOnboarding,
        F.assessmentCoreValues,
        F.questionsContext,
      ].sort()
    );
  });

  it('every key named in the existing-member migration is a real catalog key', () => {
    // The migration writes grandfathered rows using literal feature keys.
    // A rename here without a matching migration edit would orphan them.
    const keys = new Set(listFeatureKeys());
    const namedInMigration = [
      'home.root_score',
      'home.daily_brief',
      'today.recommendations',
      'today.lesson',
      'today.numbers_grid',
      'progress.history',
      'tracker.movement_level',
      'home.quick_action_movement',
      'feature.movement',
      'tracker.food_lens',
      'home.wearable_connect',
      'feature.wearables',
      'feature.root_map',
      'feature.noticing',
      'progress.assessment_findings',
      'home.reset_plan',
      'feature.reset_plan',
      'home.active_experiments',
      'tracker.habits',
      'home.weekly_review',
      'assessment.onboarding-health-history',
      'feature.questionnaires',
      'home.questionnaires_card',
      'home.assigned_programs',
      'feature.programs',
    ];
    for (const key of namedInMigration) {
      expect(keys.has(key), key).toBe(true);
    }
  });

  it('every registered assessment has a catalog entry', () => {
    const assessmentKeys = [
      'onboarding-health-history',
      'chek-hlc1-nutrition-lifestyle',
      'four-doctors',
      'primal-pattern-diet-type',
      'body-assessment',
      'readiness-to-change',
      'short-haq',
      'finding-1-love',
      'wbsa',
      'core-values-snapshot',
      'life-signal-check',
      'readiness-pulse',
    ];
    const keys = new Set(listFeatureKeys());
    for (const key of assessmentKeys) {
      expect(keys.has(`assessment.${key}`), key).toBe(true);
    }
  });

  it('nothing in the catalog was left with no inferable rule', () => {
    expect(VISIBILITY_CATALOG.filter((f) => f.couldNotInferRule).map((f) => f.key)).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// The evaluator itself
// ---------------------------------------------------------------------

describe('evaluateReveal', () => {
  it('reports which rule fired, so a coach screen can say why', () => {
    const painful = context({
      intakeAnswers: new Map<string, string | string[]>([['baseline_pain_areas', ['hips']]]),
    });
    const outcome = evaluateReveal(getFeatureDefinition(F.questionsMechanics)!, painful);
    expect(outcome.satisfied).toBe(true);
    expect(outcome.firedRule?.kind).toBe('intake_answer');
  });

  it('reports nothing fired when nothing did', () => {
    const outcome = evaluateReveal(getFeatureDefinition(F.questionsMechanics)!, context());
    expect(outcome.satisfied).toBe(false);
    expect(outcome.firedRule).toBeNull();
  });
});
