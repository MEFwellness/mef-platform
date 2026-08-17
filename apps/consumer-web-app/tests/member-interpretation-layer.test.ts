/**
 * The Member Interpretation Layer — the rules, each pinned by a test that
 * fails if the behaviour comes back.
 *
 * Every test here corresponds to one thing AUDIT-ADAPTIVE-REVEAL.md caught
 * on a real screen. Nothing here re-tests the systems underneath: the
 * registry still owns what a finding is, the priority engine still owns
 * what the focus is, and lib/wellness/status.ts still owns what a raw value
 * means. These assert what the layer concludes from them.
 */
import { describe, it, expect } from 'vitest';
import type { RegistryEntry } from '@mef/shared-types-contracts';
import {
  CHECKIN_DAYS_FOR_SUPPORTED,
  EVENTS_FOR_EMERGING_PATTERN,
  MIN_LOGGED_DAYS_FOR_STRENGTH_OR_PROBLEM,
  TIER_LABEL,
} from '../lib/member-interpretation/config';
import {
  computeEvidenceTier,
  distinctCheckinDays,
  distinctMemberEvents,
  highestTier,
  isSupportedOrBetter,
} from '../lib/member-interpretation/tiers';
import {
  FORBIDDEN_BELOW_SUPPORTED,
  enforceTierLanguage,
  forbiddenTermsIn,
  violatesTierLanguage,
} from '../lib/member-interpretation/language';
import { assignDomains, crossReferenceNote } from '../lib/member-interpretation/domainMap';
import {
  buildCanonicalFindings,
  dedupeBySourceAnswer,
  sourceKeyFor,
  verdictFor,
} from '../lib/member-interpretation/findings';
import { buildDomainInterpretations, deriveState } from '../lib/member-interpretation/domains';
import { computeDataFloor } from '../lib/member-interpretation/dataFloor';
import { findingStatement, domainStatement } from '../lib/member-interpretation/copy';
import { checkinEvidenceForCode, type InterpretationCheckin } from '../lib/member-interpretation/evidence';
import { toMemberFocus } from '../lib/member-interpretation/focus';
import { QUIET_DOMAIN_STATES, type CanonicalFinding, type EvidenceItem } from '../lib/member-interpretation/types';
import { COACHING_DOMAINS } from '../lib/investigation-engine/domains';

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

function entry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'entry-1',
    member_id: 'member-1',
    entry_kind: 'finding',
    domain: 'movement',
    code: 'pain_hips',
    label: 'Discomfort: hips',
    severity: 'mild',
    numeric_value: null,
    unit: null,
    confidence: 0.45,
    narrative: 'Ongoing discomfort in the hips reported on the latest onboarding submission.',
    evidence_refs: [{ type: 'onboarding_submission', id: 'sub-1' }],
    source_feature: 'onboarding_baseline_finding',
    source_record_id: 'sub-1',
    status: 'active',
    trend_status: null,
    member_visible: true,
    coach_context: null,
    coach_reviewed_by: null,
    coach_reviewed_at: null,
    supersedes_id: null,
    superseded_by_id: null,
    recorded_at: '2026-08-04T00:00:00.000Z',
    created_at: '2026-08-04T00:00:00.000Z',
    updated_at: '2026-08-04T00:00:00.000Z',
    ...overrides,
  };
}

function checkin(overrides: Partial<InterpretationCheckin> = {}): InterpretationCheckin {
  return {
    id: 'checkin-1',
    local_date: '2026-08-10',
    sleep_quality: 3,
    movement_today: 'none',
    energy_level: 3,
    pain_discomfort_level: 3,
    digestion_rating: 3,
    stress_level: 4,
    mood_level: 3,
    ...overrides,
  };
}

function memberEvidence(kind: EvidenceItem['kind'], localDate: string | null, ref: string): EvidenceItem {
  return { kind, ref, label: 'x', localDate };
}

function finding(overrides: Partial<CanonicalFinding> = {}): CanonicalFinding {
  return {
    id: 'movement::pain_hips',
    sourceKey: 'movement::pain_hips',
    label: 'Discomfort: hips',
    statement: 'x',
    tier: 'early_indication',
    tierLabel: TIER_LABEL.early_indication,
    evidence: [],
    verdict: 'noted',
    severity: 'mild',
    primaryDomain: 'pain_structural_integrity',
    alsoRelevantDomains: ['movement_physical_capacity'],
    crossReferenceNote: 'Also shown under Movement & Physical Capacity.',
    memberVisible: true,
    registryEntryId: 'entry-1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// Rule: one source answer can never produce two independent findings
// ---------------------------------------------------------------------

describe('one source answer, one canonical finding', () => {
  it('collapses two rows describing the same answer into one, keeping the newest', () => {
    const older = entry({ id: 'old', recorded_at: '2026-08-01T00:00:00.000Z' });
    const newer = entry({ id: 'new', recorded_at: '2026-08-09T00:00:00.000Z' });

    const { canonical, merged } = dedupeBySourceAnswer([older, newer]);

    expect(canonical).toHaveLength(1);
    expect(canonical[0]!.id).toBe('new');
    expect(merged).toEqual([{ keptId: 'new', mergedId: 'old', sourceKey: 'movement::pain_hips' }]);
  });

  it('is stable whichever order the rows arrive in', () => {
    const older = entry({ id: 'old', recorded_at: '2026-08-01T00:00:00.000Z' });
    const newer = entry({ id: 'new', recorded_at: '2026-08-09T00:00:00.000Z' });

    expect(dedupeBySourceAnswer([older, newer]).canonical[0]!.id).toBe(
      dedupeBySourceAnswer([newer, older]).canonical[0]!.id
    );
  });

  it('does not merge two genuinely different answers', () => {
    const hips = entry({ id: 'a', code: 'pain_hips' });
    const back = entry({ id: 'b', code: 'pain_lower_back' });
    expect(dedupeBySourceAnswer([hips, back]).canonical).toHaveLength(2);
  });

  it('keys on the answer, not on the row id or the producer', () => {
    const fromOnboarding = entry({ id: 'a', source_feature: 'onboarding_baseline_finding' });
    const fromQuestionnaire = entry({
      id: 'b',
      source_feature: 'questionnaire_category_finding',
      recorded_at: '2026-08-11T00:00:00.000Z',
    });
    expect(sourceKeyFor(fromOnboarding)).toBe(sourceKeyFor(fromQuestionnaire));
    expect(dedupeBySourceAnswer([fromOnboarding, fromQuestionnaire]).canonical).toHaveLength(1);
  });

  /**
   * The audit's own example, end to end. The hip discomfort slider used to
   * appear as three findings on the Root Map, under Recovery & Energy
   * Regulation, Movement & Physical Capacity and Pain & Structural
   * Integrity, with nothing saying they were the same answer.
   */
  it('the hip discomfort slider is one finding on one card, cross referenced', () => {
    const findings = buildCanonicalFindings({ entries: [entry()], checkins: [] });
    expect(findings).toHaveLength(1);

    const hip = findings[0]!;
    expect(hip.primaryDomain).toBe('pain_structural_integrity');
    expect(hip.alsoRelevantDomains).toEqual(['movement_physical_capacity']);
    expect(hip.crossReferenceNote).toBe('Also shown under Movement & Physical Capacity.');

    const domains = buildDomainInterpretations({
      findings,
      loggedDaysByDomain: {},
      suppressed: false,
    });

    const renderedInFull = domains.flatMap((d) => d.findings);
    expect(renderedInFull).toHaveLength(1);
    expect(renderedInFull[0]!.id).toBe('movement::pain_hips');

    const pain = domains.find((d) => d.domain === 'pain_structural_integrity')!;
    const movement = domains.find((d) => d.domain === 'movement_physical_capacity')!;
    const recovery = domains.find((d) => d.domain === 'recovery_energy_regulation')!;
    expect(pain.findings.map((f) => f.id)).toEqual(['movement::pain_hips']);
    expect(movement.findings).toHaveLength(0);
    expect(movement.crossReferenced.map((f) => f.id)).toEqual(['movement::pain_hips']);
    expect(recovery.findings).toHaveLength(0);
    expect(recovery.crossReferenced).toHaveLength(0);
  });

  it('stress is one finding, sleep is one finding', () => {
    const findings = buildCanonicalFindings({
      entries: [
        entry({ id: 's', domain: 'stress', code: 'elevated_stress', label: 'Elevated Stress' }),
        entry({ id: 'z', domain: 'sleep', code: 'poor_sleep_quality', label: 'Poor Sleep Quality' }),
      ],
      checkins: [],
    });
    expect(findings).toHaveLength(2);
    const domains = buildDomainInterpretations({
      findings,
      loggedDaysByDomain: {},
      suppressed: false,
    });
    expect(domains.flatMap((d) => d.findings)).toHaveLength(2);
  });

  it('a finding never cross references its own primary domain', () => {
    for (const code of ['pain_hips', 'elevated_stress', 'low_energy', 'digestive_complaints']) {
      const { primary, alsoRelevant } = assignDomains('movement', code);
      expect(alsoRelevant).not.toContain(primary);
    }
  });

  it('renders no cross reference note when there is nothing to cross reference', () => {
    expect(crossReferenceNote([])).toBeNull();
  });
});

// ---------------------------------------------------------------------
// Rule: tiers cannot rise from background runs
// ---------------------------------------------------------------------

describe('a tier can only rise on member evidence or coach confirmation', () => {
  it('a single intake answer is an early indication and nothing more', () => {
    expect(computeEvidenceTier([memberEvidence('intake_answer', '2026-08-01', 'a')], null)).toBe(
      'early_indication'
    );
  });

  it('any number of background computations leaves the tier at the floor', () => {
    const hundredRuns = Array.from({ length: 100 }, (_, i) =>
      memberEvidence('background_computation', `2026-06-${String((i % 28) + 1).padStart(2, '0')}`, `run-${i}`)
    );
    expect(computeEvidenceTier(hundredRuns, null)).toBe('early_indication');
    expect(distinctMemberEvents(hundredRuns)).toBe(0);
    expect(distinctCheckinDays(hundredRuns)).toBe(0);
  });

  /**
   * This is the exact shape of the old HIGH CONFIDENCE bug: one real member
   * answer, then a cron running every day for a fortnight. The old formula
   * maxed its history term after five runs. This one does not move.
   */
  it('one member answer plus a fortnight of cron runs is still an early indication', () => {
    const evidence = [
      memberEvidence('intake_answer', '2026-08-01', 'sub-1'),
      ...Array.from({ length: 14 }, (_, i) =>
        memberEvidence('background_computation', `2026-08-${String(i + 2).padStart(2, '0')}`, `snap-${i}`)
      ),
    ];
    expect(computeEvidenceTier(evidence, null)).toBe('early_indication');
  });

  it('two distinct member events reach emerging, one does not', () => {
    const one = [memberEvidence('intake_answer', '2026-08-01', 'a')];
    const two = [...one, memberEvidence('assessment_result', '2026-08-05', 'b')];
    expect(EVENTS_FOR_EMERGING_PATTERN).toBe(2);
    expect(computeEvidenceTier(one, null)).toBe('early_indication');
    expect(computeEvidenceTier(two, null)).toBe('emerging_pattern');
  });

  it('two events on the same day from the same source count once', () => {
    const sameDay = [
      memberEvidence('intake_answer', '2026-08-01', 'a'),
      memberEvidence('intake_answer', '2026-08-01', 'b'),
    ];
    expect(distinctMemberEvents(sameDay)).toBe(1);
    expect(computeEvidenceTier(sameDay, null)).toBe('early_indication');
  });

  it('the supported tier needs check-in days specifically, not any evidence', () => {
    const manyAssessments = Array.from({ length: 10 }, (_, i) =>
      memberEvidence('assessment_result', `2026-08-0${(i % 9) + 1}`, `a-${i}`)
    );
    expect(computeEvidenceTier(manyAssessments, null)).toBe('emerging_pattern');

    const enoughCheckins = Array.from({ length: CHECKIN_DAYS_FOR_SUPPORTED }, (_, i) =>
      memberEvidence('checkin_day', `2026-08-0${i + 1}`, `c-${i}`)
    );
    expect(computeEvidenceTier(enoughCheckins, null)).toBe('supported_by_checkins');
  });

  it('one day short of the threshold is not supported', () => {
    const almost = Array.from({ length: CHECKIN_DAYS_FOR_SUPPORTED - 1 }, (_, i) =>
      memberEvidence('checkin_day', `2026-08-0${i + 1}`, `c-${i}`)
    );
    expect(computeEvidenceTier(almost, null)).toBe('emerging_pattern');
  });

  it('the same check-in day logged twice counts once', () => {
    const repeated = Array.from({ length: 12 }, (_, i) =>
      memberEvidence('checkin_day', '2026-08-01', `c-${i}`)
    );
    expect(distinctCheckinDays(repeated)).toBe(1);
    expect(computeEvidenceTier(repeated, null)).toBe('early_indication');
  });

  it('coach verification outranks everything, and only a timestamp can grant it', () => {
    expect(computeEvidenceTier([], '2026-08-17T10:00:00.000Z')).toBe('coach_verified');
    expect(computeEvidenceTier([], null)).toBe('early_indication');
  });

  it('only check-in days the member logged in the concerning band count as evidence', () => {
    const goodDay = checkin({ id: 'good', local_date: '2026-08-01', stress_level: 1 });
    const hardDay = checkin({ id: 'hard', local_date: '2026-08-02', stress_level: 5 });
    const evidence = checkinEvidenceForCode('elevated_stress', [goodDay, hardDay]);
    expect(evidence.map((e) => e.ref)).toEqual(['hard']);
  });

  it('a code with no daily question can never be established by check-ins', () => {
    expect(checkinEvidenceForCode('detoxification_load_concern', [checkin()])).toEqual([]);
  });

  it('a finding built from real repeated check-ins reaches the supported tier', () => {
    const checkins = Array.from({ length: CHECKIN_DAYS_FOR_SUPPORTED }, (_, i) =>
      checkin({ id: `c-${i}`, local_date: `2026-08-0${i + 1}`, stress_level: 5 })
    );
    const findings = buildCanonicalFindings({
      entries: [entry({ domain: 'stress', code: 'elevated_stress', label: 'Elevated Stress' })],
      checkins,
    });
    expect(findings[0]!.tier).toBe('supported_by_checkins');
    expect(findings[0]!.tierLabel).toBe('Supported by repeated check-ins');
  });

  it('highestTier takes the best, never an average', () => {
    expect(highestTier(['early_indication', 'supported_by_checkins', 'emerging_pattern'])).toBe(
      'supported_by_checkins'
    );
    expect(highestTier([])).toBeNull();
  });

  it('there are exactly four tier labels and none of them is a number', () => {
    const labels = Object.values(TIER_LABEL);
    expect(labels).toHaveLength(4);
    for (const label of labels) {
      expect(label).not.toMatch(/\d/);
      expect(label).not.toContain('%');
    }
  });
});

// ---------------------------------------------------------------------
// Rule: forbidden words cannot render below their tier
// ---------------------------------------------------------------------

describe('language must match tier', () => {
  it('flags pattern, strength, corroborated and confirmed below the supported tier', () => {
    for (const word of ['pattern', 'strength', 'corroborated', 'confirmed']) {
      expect(violatesTierLanguage(`This is a ${word} in your data.`, 'early_indication')).toBe(true);
      expect(violatesTierLanguage(`This is a ${word} in your data.`, 'emerging_pattern')).toBe(true);
    }
  });

  it('allows them at and above the supported tier', () => {
    for (const word of FORBIDDEN_BELOW_SUPPORTED) {
      expect(forbiddenTermsIn(`x ${word} y`, 'supported_by_checkins')).toEqual([]);
      expect(forbiddenTermsIn(`x ${word} y`, 'coach_verified')).toEqual([]);
    }
  });

  it('replaces offending copy with an honest sentence rather than deleting the finding', () => {
    const replaced = enforceTierLanguage(
      'A consistent pattern is emerging here.',
      'early_indication',
      'Elevated Stress'
    );
    expect(violatesTierLanguage(replaced, 'early_indication')).toBe(false);
    expect(replaced).toContain('Elevated Stress');
  });

  it('leaves compliant copy exactly as written', () => {
    const clean = 'Elevated Stress came up in your intake answers.';
    expect(enforceTierLanguage(clean, 'early_indication', 'Elevated Stress')).toBe(clean);
  });

  /**
   * The primary mechanism, not the backstop: every statement the layer
   * itself authors, at every tier, for every verdict, is compliant by
   * construction.
   */
  it('every authored finding statement is compliant at its own tier', () => {
    const tiers = ['early_indication', 'emerging_pattern', 'supported_by_checkins', 'coach_verified'] as const;
    const verdicts = ['needs_attention', 'worth_watching', 'noted', 'improving', 'resolved'] as const;
    const evidenceSets: EvidenceItem[][] = [
      [],
      [memberEvidence('intake_answer', '2026-08-01', 'a')],
      [memberEvidence('checkin_day', '2026-08-01', 'a'), memberEvidence('checkin_day', '2026-08-02', 'b')],
    ];

    for (const tier of tiers) {
      for (const verdict of verdicts) {
        for (const evidence of evidenceSets) {
          const statement = findingStatement({ label: 'Elevated Stress', tier, verdict, evidence });
          expect(forbiddenTermsIn(statement, tier)).toEqual([]);
          expect(statement).not.toContain('—');
        }
      }
    }
  });

  it('a single assessment result is never called a pattern', () => {
    const statement = findingStatement({
      label: 'Poor Sleep Quality',
      tier: 'early_indication',
      verdict: 'worth_watching',
      evidence: [memberEvidence('assessment_result', '2026-08-01', 'a')],
    });
    expect(statement.toLowerCase()).not.toContain('pattern');
    expect(statement).toContain('One signal so far');
  });

  it('no authored domain statement uses an em dash', () => {
    for (const info of COACHING_DOMAINS) {
      for (const state of [
        'needs_attention',
        'worth_watching',
        'acknowledged',
        'nothing_flagged_yet',
        'too_early',
        'no_data_yet',
        'not_covered',
        'paused_for_coach',
      ] as const) {
        const text = domainStatement({
          domain: info.domain,
          state,
          findingCount: 2,
          loggedDays: 3,
          windowDays: 21,
        });
        expect(text).not.toContain('—');
        expect(text.length).toBeGreaterThan(0);
      }
    }
  });

  it('isSupportedOrBetter draws the line in exactly one place', () => {
    expect(isSupportedOrBetter('early_indication')).toBe(false);
    expect(isSupportedOrBetter('emerging_pattern')).toBe(false);
    expect(isSupportedOrBetter('supported_by_checkins')).toBe(true);
    expect(isSupportedOrBetter('coach_verified')).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Rule: the data floor
// ---------------------------------------------------------------------

describe('the data floor', () => {
  it('three logged days is below the floor', () => {
    const floor = computeDataFloor(3);
    expect(floor.met).toBe(false);
    expect(floor.loggedDays).toBe(3);
    expect(floor.requiredDays).toBe(MIN_LOGGED_DAYS_FOR_STRENGTH_OR_PROBLEM);
  });

  it('says it is early and expected, in the Case View voice, rather than staying silent', () => {
    const floor = computeDataFloor(3);
    expect(floor.statement).toContain('3 logged days');
    expect(floor.statement).toContain('expected, not a problem');
    expect(floor.statement).not.toContain('—');
  });

  it('is met at the threshold and above', () => {
    expect(computeDataFloor(MIN_LOGGED_DAYS_FOR_STRENGTH_OR_PROBLEM).met).toBe(true);
    expect(computeDataFloor(MIN_LOGGED_DAYS_FOR_STRENGTH_OR_PROBLEM - 1).met).toBe(false);
  });

  it('never claims a strength below the floor', () => {
    expect(computeDataFloor(3).statement.toLowerCase()).not.toMatch(/is a real strength/);
  });
});

// ---------------------------------------------------------------------
// Rule: active findings block quiet verdicts
// ---------------------------------------------------------------------

describe('a domain with active findings can never read as quiet', () => {
  const severities = ['mild', 'moderate', 'significant', 'unknown'] as const;

  it('holds for every domain and every finding severity', () => {
    for (const info of COACHING_DOMAINS) {
      for (const severity of severities) {
        const state = deriveState({
          isUninstrumented: info.isUninstrumented,
          suppressed: false,
          findings: [finding({ severity, verdict: severity === 'significant' ? 'needs_attention' : 'noted' })],
          loggedDays: 0,
        });
        // An uninstrumented domain has no findings routed to it in practice,
        // and says so honestly; every other domain must acknowledge.
        if (info.isUninstrumented) {
          expect(state).toBe('not_covered');
        } else {
          expect(QUIET_DOMAIN_STATES.has(state)).toBe(false);
        }
      }
    }
  });

  /**
   * The Pain & Structural Integrity case the trust cleanup deliberately left
   * for this build: three of twenty-one days logged, two active mild
   * discomfort findings, and the card read "LOOKING STEADY. Nothing specific
   * needed here right now."
   */
  it('pain and structural integrity acknowledges two mild findings instead of looking steady', () => {
    const domains = buildDomainInterpretations({
      findings: [
        finding({ id: 'movement::pain_hips', sourceKey: 'movement::pain_hips', label: 'Discomfort: hips' }),
        finding({
          id: 'movement::pain_lower_back',
          sourceKey: 'movement::pain_lower_back',
          label: 'Discomfort: lower back',
        }),
      ],
      loggedDaysByDomain: { pain_structural_integrity: 3 },
      suppressed: false,
    });

    const pain = domains.find((d) => d.domain === 'pain_structural_integrity')!;
    expect(pain.state).toBe('acknowledged');
    expect(pain.statement.toLowerCase()).not.toContain('steady');
    expect(pain.statement.toLowerCase()).not.toContain('nothing specific needed');
    expect(pain.statement).toContain('2 things');
  });

  it('zero logged days and no findings says nothing has been logged, not that it is fine', () => {
    const domains = buildDomainInterpretations({
      findings: [],
      loggedDaysByDomain: { movement_physical_capacity: 0 },
      suppressed: false,
    });
    const movement = domains.find((d) => d.domain === 'movement_physical_capacity')!;
    expect(movement.state).toBe('no_data_yet');
    expect(movement.statement.toLowerCase()).not.toContain('steady');
    expect(movement.statement).toContain('Nothing has been logged here yet');
  });

  it('a resolved finding does not keep a domain out of a quiet state', () => {
    const state = deriveState({
      isUninstrumented: false,
      suppressed: false,
      findings: [finding({ verdict: 'resolved' })],
      loggedDays: 10,
    });
    expect(state).toBe('nothing_flagged_yet');
  });

  it('safety suppression outranks everything, including active findings', () => {
    const state = deriveState({
      isUninstrumented: false,
      suppressed: true,
      findings: [finding({ verdict: 'needs_attention' })],
      loggedDays: 10,
    });
    expect(state).toBe('paused_for_coach');
  });

  it('every one of the twelve domains gets exactly one state', () => {
    const domains = buildDomainInterpretations({
      findings: [],
      loggedDaysByDomain: {},
      suppressed: false,
    });
    expect(domains).toHaveLength(COACHING_DOMAINS.length);
    expect(new Set(domains.map((d) => d.domain)).size).toBe(COACHING_DOMAINS.length);
  });
});

// ---------------------------------------------------------------------
// Rule: severity 'none' is not improvement
// ---------------------------------------------------------------------

describe('verdicts', () => {
  it('a producer that found nothing is resolved, never improving', () => {
    expect(verdictFor(entry({ severity: 'none', trend_status: null }))).toBe('resolved');
  });

  it('improving requires a real computed trend', () => {
    expect(verdictFor(entry({ severity: 'mild', trend_status: 'improving' }))).toBe('improving');
    expect(verdictFor(entry({ severity: 'mild', trend_status: null }))).toBe('noted');
  });

  it('significant asks for attention, moderate is worth watching', () => {
    expect(verdictFor(entry({ severity: 'significant' }))).toBe('needs_attention');
    expect(verdictFor(entry({ severity: 'moderate' }))).toBe('worth_watching');
  });
});

// ---------------------------------------------------------------------
// Rule: one focus, read from the priority engine and nowhere else
// ---------------------------------------------------------------------

describe('the one focus', () => {
  it('is null when the engine has no view, rather than falling back to a second source', () => {
    expect(toMemberFocus(null)).toBeNull();
  });

  it('passes the engine title through verbatim and never re-words it', () => {
    const focus = toMemberFocus({
      selected: {
        rule: 'daily_reset',
        priorityKey: null,
        title: 'Take a few minutes for your Daily Reset.',
        reason: 'You have not checked in yet today.',
        help: 'h',
        href: '/checkin',
        actionType: 'reset',
        threadKey: 'daily_reset::-',
        approach: 0,
        evidence: {},
      },
      status: 'active',
      localDate: '2026-08-17',
      bridge: null,
      isReEntry: false,
      welcomeLine: null,
    });

    expect(focus).toEqual({
      title: 'Take a few minutes for your Daily Reset.',
      reason: 'You have not checked in yet today.',
      rule: 'daily_reset',
      status: 'active',
      href: '/checkin',
    });
  });
});
