/**
 * Rooted Reset trust cleanup (2026-08-17) — the five visible trust-breakers
 * from AUDIT-ADAPTIVE-REVEAL.md, each pinned by a test that fails if the
 * behaviour comes back.
 *
 * These are guards, not a re-test of the systems underneath. Nothing here
 * re-derives a score, a severity or a confidence value: each test asserts
 * one thing about what a member can be shown.
 *
 * The source-text assertions (fix 1 and fix 4) read real files off disk in
 * the same style as tests/internal-movement-tools-staff-only.test.ts's tree
 * walk. They exist because the fix in both cases is an absence, and an
 * absence is exactly what an ordinary unit test cannot notice going away.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DailyCheckin } from '@mef/shared-types-contracts';
import type { CoachingFocusDecision } from '../lib/brain/types';
import type { MorningBriefSignals } from '../lib/coaching-engine/types';
import { composeMorningBrief } from '../lib/coaching-engine/morningBrief';
import { onlyCurrentCoachingFocus, isDailyCoachingFocus } from '../lib/recommendation-engine/lifecycle';
import type { MemberRecommendationRow } from '../lib/recommendation-engine/types';
import { splitObservationsAndPatterns } from '../lib/longitudinal-intelligence/picture';
import type { LongitudinalSignal, SignalState } from '../lib/longitudinal-intelligence/types';
import { buildFindingCardViewModel } from '../lib/root-map/cardViewModel';
import type { RootMapDomainView } from '../lib/root-map/types';
import { buildMemberFacingNoticing } from '../lib/intelligence-engine/memberFacingNoticing';
import type { RegistryEntry } from '@mef/shared-types-contracts';

const ROOT = path.resolve(__dirname, '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf-8');
}

function exists(relativePath: string): boolean {
  return fs.existsSync(path.join(ROOT, relativePath));
}

// ---------------------------------------------------------------------------
// Fix 1 — a logged food is data, never a standing finding
// ---------------------------------------------------------------------------

describe('a food a member logs never becomes a Root Map finding', () => {
  it('has no registry adapter for packaged food scans or meal comparisons', () => {
    expect(exists('lib/registry/adapters/foodProducts.ts')).toBe(false);
    expect(exists('lib/registry/adapters/foodLens.ts')).toBe(false);
  });

  it('does not write a registry entry anywhere in the packaged-food analysis pipeline', () => {
    const source = read('lib/food-products/analyze.ts');
    expect(source).not.toContain('registry/adapters');
    expect(source).not.toContain('insertRegistryEntry');
  });

  it('does not write a registry entry anywhere in the Food Lens comparison pipeline', () => {
    const source = read('app/actions/food-lens.ts');
    expect(source).not.toContain('registry/adapters');
    expect(source).not.toContain('insertRegistryEntry');
  });

  /**
   * The specific leak: `narrativeFor` interpolated the product name the
   * member typed straight into a finding narrative. No surviving adapter
   * may take a free-text name as an argument at all.
   */
  it('leaves no registry adapter that takes a member-supplied name', () => {
    const dir = path.join(ROOT, 'lib/registry/adapters');
    for (const entry of fs.readdirSync(dir)) {
      const source = fs.readFileSync(path.join(dir, entry), 'utf-8');
      expect(source, `${entry} accepts a productName argument`).not.toMatch(/productName/);
    }
  });
});

// ---------------------------------------------------------------------------
// Fix 2 — exactly one current coaching focus
// ---------------------------------------------------------------------------

function recommendationRow(overrides: Partial<MemberRecommendationRow> = {}): MemberRecommendationRow {
  return {
    id: 'row-1',
    memberId: 'u1',
    recommendationId: 'daily_coaching_daily_habit_today-s-coaching-focus-stress',
    category: 'daily_habit',
    sourceDomain: 'daily_coaching',
    title: "Today's coaching focus: Stress",
    explanation: 'Your recent check-ins point to stress as today’s most useful place to focus.',
    whyThisWasSelected: 'This traces back to a pattern worth watching in your recent activity.',
    supportingFindings: [],
    confidence: 0.9,
    priority: 'medium',
    recommendedDuration: 'daily',
    reassessmentTrigger: null,
    completionTracking: true,
    status: 'shown',
    createdAt: '2026-08-15T08:00:00.000Z',
    updatedAt: '2026-08-15T08:00:00.000Z',
    completedAt: null,
    ignoredAt: null,
    ignoredReason: null,
    ...overrides,
  };
}

describe('the Recommendations screen can only ever show one coaching focus', () => {
  it('recognises a coaching focus row by the domain it was written under, not by its title', () => {
    expect(isDailyCoachingFocus(recommendationRow())).toBe(true);
    expect(isDailyCoachingFocus(recommendationRow({ sourceDomain: 'sleep' }))).toBe(false);
  });

  /** The exact live case: a Stress focus and a Hydration focus, both 'shown', both reading "today". */
  it('keeps only the newest of two focus rows', () => {
    const older = recommendationRow({ id: 'stress', createdAt: '2026-08-15T08:00:00.000Z' });
    const newer = recommendationRow({
      id: 'hydration',
      recommendationId: 'daily_coaching_daily_habit_today-s-coaching-focus-hydration',
      title: "Today's coaching focus: Hydration",
      createdAt: '2026-08-17T08:00:00.000Z',
    });

    const kept = onlyCurrentCoachingFocus([newer, older]);

    expect(kept).toHaveLength(1);
    expect(kept[0]!.id).toBe('hydration');
  });

  it('holds no matter what order the rows arrive in', () => {
    const older = recommendationRow({ id: 'stress', createdAt: '2026-08-15T08:00:00.000Z' });
    const newer = recommendationRow({ id: 'hydration', createdAt: '2026-08-17T08:00:00.000Z' });

    expect(onlyCurrentCoachingFocus([older, newer]).map((r) => r.id)).toEqual(['hydration']);
    expect(onlyCurrentCoachingFocus([newer, older]).map((r) => r.id)).toEqual(['hydration']);
  });

  it('never drops a recommendation that is not a coaching focus', () => {
    const focusOld = recommendationRow({ id: 'focus-old', createdAt: '2026-08-15T08:00:00.000Z' });
    const focusNew = recommendationRow({ id: 'focus-new', createdAt: '2026-08-17T08:00:00.000Z' });
    const sleep = recommendationRow({
      id: 'sleep',
      sourceDomain: 'sleep',
      category: 'sleep_optimization',
      title: 'Protect your wind-down',
      createdAt: '2026-08-10T08:00:00.000Z',
    });
    const movement = recommendationRow({
      id: 'movement',
      sourceDomain: 'movement',
      category: 'movement_focus',
      title: 'A short walk counts',
      createdAt: '2026-08-16T08:00:00.000Z',
    });

    const kept = onlyCurrentCoachingFocus([focusNew, movement, focusOld, sleep]);

    expect(kept.map((r) => r.id)).toEqual(['focus-new', 'movement', 'sleep']);
  });

  it('leaves a single focus, and a list with no focus at all, completely alone', () => {
    const one = [recommendationRow()];
    expect(onlyCurrentCoachingFocus(one)).toEqual(one);

    const none = [recommendationRow({ sourceDomain: 'sleep' })];
    expect(onlyCurrentCoachingFocus(none)).toEqual(none);
  });

  it('retires by superseding, which is a real lifecycle state and not a member decision', () => {
    // 'ignored' means the member said it wasn't helpful and outcomeHistory
    // reads it as real negative feedback. The engine must never write that
    // on her behalf just to clear a stale row.
    const migration = fs.readFileSync(
      path.join(ROOT, '../../supabase/migrations/00000000000164_recommendation_superseded_status.sql'),
      'utf-8'
    );
    expect(migration).toContain("'superseded'");

    const data = read('lib/recommendation-engine/data.ts');
    expect(data).toContain("status: 'superseded'");
    expect(data).not.toContain('.delete()');
  });
});

// ---------------------------------------------------------------------------
// Fix 3 — a single mention is not a pattern
// ---------------------------------------------------------------------------

function signal(state: SignalState, key: string): LongitudinalSignal {
  return {
    signalKey: key,
    signalKind: 'registry_finding',
    signalLabel: key,
    state,
    tier: state === 'one_time_observation' ? 1 : 2,
    occurrenceCount: state === 'one_time_observation' ? 1 : 3,
    confidence: 0.5,
    firstObservedAt: '2026-08-01T00:00:00.000Z',
    lastObservedAt: '2026-08-17T00:00:00.000Z',
    evidenceSummary: {},
  };
}

describe('the Coaching Insights grouping', () => {
  it('keeps a one-time observation out of the pattern group entirely', () => {
    const split = splitObservationsAndPatterns([
      signal('one_time_observation', 'discomfort_hips'),
      signal('repeated_signal', 'sleep'),
      signal('emerging_pattern', 'stress'),
    ]);

    expect(split.singleObservations.map((s) => s.signalKey)).toEqual(['discomfort_hips']);
    expect(split.repeatedPatterns.map((s) => s.signalKey)).toEqual(['sleep', 'stress']);
  });

  it('puts nothing in the pattern group when everything was seen once', () => {
    const split = splitObservationsAndPatterns([
      signal('one_time_observation', 'discomfort_hips'),
      signal('one_time_observation', 'discomfort_lower_back'),
    ]);

    expect(split.repeatedPatterns).toHaveLength(0);
    expect(split.singleObservations).toHaveLength(2);
  });

  it('heads the two groups honestly on the Insights page, and uses no em dash', () => {
    const page = read('app/insights/page.tsx');
    expect(page).toContain("What We're Noticing So Far");
    expect(page).toContain("Patterns We're Beginning to Notice");
    expect(page).toContain('picture.singleObservations');

    const action = read('app/actions/longitudinalIntelligence.ts');
    expect(action).toContain('singleObservations');
  });
});

// ---------------------------------------------------------------------------
// Fix 4 — nothing on a member screen states a confidence level
// ---------------------------------------------------------------------------

/** Every phrase that told a member how sure the app was. None may render on any of these files. */
const CONFIDENCE_CLAIMS = [
  'High confidence',
  'HIGH CONFIDENCE',
  'Moderate confidence',
  'Low confidence',
  'Building confidence',
  '% confidence',
  '% confident',
];

const MEMBER_SURFACES_THAT_CLAIMED_CONFIDENCE = [
  'components/dashboard/HomeHero.tsx',
  'app/root-score/page.tsx',
  'components/RootScoreDomainRow.tsx',
  'components/food-lens/DetectedItemsList.tsx',
  'components/food-lens/MacroBalanceMeter.tsx',
  'components/food-lens/PatternComparisonCard.tsx',
  'components/food-lens/LabelConfirmForm.tsx',
];

describe('the confidence display', () => {
  for (const file of MEMBER_SURFACES_THAT_CLAIMED_CONFIDENCE) {
    it(`states no confidence level in ${file}`, () => {
      // Comments explaining what was removed are allowed and are the point;
      // strip them before looking for anything that could render.
      const renderable = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

      for (const claim of CONFIDENCE_CLAIMS) {
        expect(renderable, `${file} still renders "${claim}"`).not.toContain(claim);
      }
    });
  }

  /**
   * Prompt 2 rebuilds this. It cannot rebuild what was deleted, so the
   * calculation has to still be here and still be running.
   */
  it('leaves the underlying calculation intact for the rebuild', () => {
    expect(exists('lib/scoring/confidence.ts')).toBe(true);
    expect(read('lib/scoring/confidence.ts')).toContain('computeRootConfidence');
    expect(read('lib/scoring/domains.ts')).toContain('confidence');
  });
});

// ---------------------------------------------------------------------------
// Fix 5a — no claim about today before a check-in today
// ---------------------------------------------------------------------------

function checkin(overrides: Partial<DailyCheckin> = {}): DailyCheckin {
  return {
    id: 'c1',
    user_id: 'u1',
    recorded_at: '2026-08-16T08:00:00.000Z',
    local_date: '2026-08-16',
    timezone: 'America/New_York',
    checkin_version: 1,
    edited_at: null,
    mood_level: 3,
    sleep_quality: 3,
    sleep_duration: '7-8h',
    sleep_observation_period_start: null,
    sleep_observation_period_end: null,
    energy_level: 3,
    stress_level: 3,
    water_cups: 6,
    digestion_rating: 3,
    pain_discomfort_level: 0,
    movement_today: 'moderate',
    new_or_worsening_concern: false,
    optional_notes: null,
    actual_bedtime: null,
    actual_wake_time: null,
    night_waking_count: null,
    night_sweats: null,
    morning_soreness: null,
    bowel_movement_status: null,
    created_at: '2026-08-16T08:00:00.000Z',
    ...overrides,
  };
}

function decision(): CoachingFocusDecision {
  return {
    localDate: '2026-08-17',
    focus: 'stress',
    focusLabel: 'Stress',
    reason: 'recent_checkins',
    reasonText: 'Your recent check-ins point to stress.',
    mode: 'encourage',
    challengeLevel: 'standard',
    riskLevel: 'none',
    isCelebration: false,
    encouragement: 'One small thing today is enough.',
    coachInsight: null,
    wearableBrief: null,
    wearableSnapshot: null,
    generatedAt: '2026-08-17T08:00:00.000Z',
  };
}

function briefSignals(overrides: Partial<MorningBriefSignals> = {}): MorningBriefSignals {
  return {
    firstName: 'Ebony',
    localDate: '2026-08-17',
    decision: decision(),
    recentCheckins: [checkin()],
    activeHabits: [],
    habitLogsToday: {},
    currentStreak: 0,
    activeTrendInsights: [],
    continuitySentence: null,
    returnGreeting: null,
    memoryCallback: null,
    ...overrides,
  };
}

describe("Root's Daily Brief on a day with no check-in yet", () => {
  /** The exact live wording that was wrong: "Your stress was moderate today" with her last check-in the day before. */
  it('makes no claim about today from yesterday’s check-in', () => {
    const brief = composeMorningBrief(briefSignals());

    expect(brief.stressSummary).not.toContain('today');
    expect(brief.sleepSummary).not.toContain('last night');
  });

  it('labels yesterday’s reading as yesterday rather than withholding it', () => {
    const brief = composeMorningBrief(briefSignals());

    expect(brief.stressSummary).toBe('Yesterday you logged moderate stress.');
    expect(brief.sleepSummary).toBe('Yesterday you logged only fair sleep.');
  });

  it('says "at your last check-in" rather than naming a gap it cannot name honestly', () => {
    const brief = composeMorningBrief(
      briefSignals({ recentCheckins: [checkin({ local_date: '2026-08-11' })] })
    );

    expect(brief.stressSummary).toBe('You logged moderate stress at your last check-in.');
  });

  it('still speaks in the present tense once she has checked in today', () => {
    const brief = composeMorningBrief(
      briefSignals({ recentCheckins: [checkin({ local_date: '2026-08-17' })] })
    );

    expect(brief.stressSummary).toBe('Your stress was moderate today.');
    expect(brief.sleepSummary).toBe('Your sleep was only fair last night.');
  });

  it('says nothing at all when there is no check-in to speak from', () => {
    const brief = composeMorningBrief(briefSignals({ recentCheckins: [] }));

    expect(brief.stressSummary).toBeNull();
    expect(brief.sleepSummary).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fix 5b — zero logged data is never a positive verdict
// ---------------------------------------------------------------------------

function domainView(overrides: Partial<RootMapDomainView> = {}): RootMapDomainView {
  return {
    domain: 'movement_physical_capacity',
    label: 'Movement & Physical Capacity',
    definition: 'How you move.',
    memberDescription: 'How you move.',
    isUninstrumented: false,
    stage: 'optimization',
    confidence: { label: 'moderate', score: 0.5, dataPoints: 2 } as RootMapDomainView['confidence'],
    priority: 'quiet',
    whatWeUnderstand: ['Ongoing discomfort in the hips.'],
    whatWereStillLearning: "We're building a clearer picture here as more information comes in.",
    currentRecommendation: 'Looking steady',
    nextSuggestedStep: 'Nothing specific needed here right now.',
    patterns: [],
    ...overrides,
  };
}

describe('a Root Map domain with nothing logged behind it', () => {
  /** The exact live card: "0 of 21 days logged" and "LOOKING STEADY / Nothing specific needed here right now." */
  it('does not call itself steady', () => {
    const view = buildFindingCardViewModel(domainView(), { count: 0, windowDays: 21 });

    expect(view.nextStep?.title).not.toBe('Looking steady');
    expect(view.nextStep?.body).not.toContain('Nothing specific needed');
  });

  it('says plainly that there is nothing logged instead', () => {
    const view = buildFindingCardViewModel(domainView(), { count: 0, windowDays: 21 });

    expect(view.nextStep?.title).toBe('Nothing logged here yet');
    expect(view.nextStep?.body).toContain('no logged days');
  });

  it('leaves the verdict alone as soon as there is a single logged day', () => {
    const view = buildFindingCardViewModel(domainView(), { count: 1, windowDays: 21 });

    expect(view.nextStep?.title).toBe('Looking steady');
  });

  /** Null coverage means "no per-day source exists for this domain at all", which is not a real zero and must not be treated as one. */
  it('leaves the verdict alone for a domain with no trackable per-day source', () => {
    const view = buildFindingCardViewModel(domainView(), null);

    expect(view.nextStep?.title).toBe('Looking steady');
  });

  it('never overrides a domain that is genuinely asking for attention', () => {
    const view = buildFindingCardViewModel(
      domainView({
        priority: 'needs_attention_now',
        currentRecommendation: 'Worth focused attention soon',
        nextSuggestedStep: 'Your coach will likely bring this up.',
      }),
      { count: 0, windowDays: 21 }
    );

    expect(view.nextStep?.title).toBe('Worth focused attention soon');
  });
});

function registryFinding(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'r1',
    member_id: 'u1',
    entry_kind: 'finding',
    domain: 'nutrition',
    code: 'packaged_food_analysis',
    label: 'Packaged food scan',
    severity: 'none',
    numeric_value: null,
    unit: null,
    confidence: 0.5,
    narrative: 'A scan.',
    evidence_refs: [],
    source_feature: 'food_analysis_result',
    source_record_id: 's1',
    status: 'active',
    trend_status: null,
    member_visible: true,
    coach_context: null,
    coach_reviewed_by: null,
    coach_reviewed_at: null,
    supersedes_id: null,
    superseded_by_id: null,
    recorded_at: '2026-08-17T00:00:00.000Z',
    created_at: '2026-08-17T00:00:00.000Z',
    updated_at: '2026-08-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('"What’s Improving"', () => {
  /** "Packaged food scan has been improving." off one scan, from severity 'none'. */
  it('does not read a producer finding nothing as the member improving', () => {
    const view = buildMemberFacingNoticing([registryFinding({ severity: 'none' })]);

    expect(view.improving).toHaveLength(0);
  });

  it('still reports a real computed improving trend', () => {
    const view = buildMemberFacingNoticing([
      registryFinding({ severity: 'mild', trend_status: 'improving', label: 'Poor Sleep Quality' }),
    ]);

    expect(view.improving).toEqual(['Poor Sleep Quality has been improving.']);
  });
});

// ---------------------------------------------------------------------------
// Copy rule — no em dashes in anything this pass wrote
// ---------------------------------------------------------------------------

describe('the copy rule for everything written in this pass', () => {
  const MEMBER_COPY_TOUCHED_HERE = [
    'lib/root-map/cardViewModel.ts',
    'lib/coaching-engine/morningBrief.ts',
    'components/food-lens/DetectedItemsList.tsx',
    'components/food-lens/LabelConfirmForm.tsx',
  ];

  for (const file of MEMBER_COPY_TOUCHED_HERE) {
    it(`uses no em dash in any string ${file} can render`, () => {
      const source = read(file);
      const strings = source.match(/'[^'\n]*'|"[^"\n]*"|`[^`\n]*`/g) ?? [];
      for (const literal of strings) {
        expect(literal, `${file} has an em dash in ${literal}`).not.toContain('—');
      }
    });
  }
});
