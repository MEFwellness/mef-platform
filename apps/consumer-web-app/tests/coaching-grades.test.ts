/**
 * Adaptive Coaching Direction Part 3 — the grading math, the decay, and the
 * two sentences the Weekly Root Review is allowed to say about a grade.
 *
 * No database. Every test below is a ledger fixture in and a grade out, or
 * a plan in and a sentence out, which is the whole point of keeping both
 * layers pure.
 *
 * The four fixtures the brief names each get a named block: landing,
 * landed-but-flat, dead, and thin.
 */

import { describe, it, expect } from 'vitest';
import {
  ACTED_MINIMUM_FOR_LANDING,
  COMPARED_METRICS,
  DEAD_GRADE_DECAY_DAYS,
  GRADE_LOOKBACK_DAYS,
  MOVED_RELATIVE_CHANGE,
  UNACTED_MINIMUM_FOR_DEAD,
  daysSinceLastDelivered,
  effectiveVerdict,
  gradeDecisions,
  isDecayedDeadGrade,
  metricMoved,
  readComparison,
  seenCount,
  verdictFor,
} from '@/lib/coaching-direction/grading';
import type { GradeableDecision } from '@/lib/coaching-direction/grading';
import {
  comparisonCandidates,
  countValue,
  groupForGrading,
  MAX_COMPARISONS_PER_PASS,
} from '@/lib/coaching-direction/gradesService';
import type { LedgerRowForGrading } from '@/lib/coaching-direction/gradesData';
import type { MemberWindowComparison, WindowMetrics } from '@/lib/analytics-service/types';
import { renderReview, renderGradeAdjusting, renderGradeWorked } from '@/lib/weekly-review/copy';
import { sanitizeGrade, sanitizeGrades } from '@/lib/weekly-review/plan';
import type { ReviewGrade, ReviewPlan } from '@/lib/weekly-review/types';

const TODAY = '2026-08-12';

// ---------------------------------------------------------------------
// Fixture helpers.
// ---------------------------------------------------------------------

function decision(overrides: Partial<GradeableDecision> = {}): GradeableDecision {
  return {
    localDate: '2026-08-01',
    actionType: 'reset',
    threadKey: 'behavioral_friction::daily_reset_incomplete',
    memberResponse: 'ignored',
    comparisonOutcome: null,
    ...overrides,
  };
}

/** `count` decisions on consecutive days ending `endingOn`, oldest first. */
function run(
  count: number,
  overrides: Partial<GradeableDecision>,
  endingOn = '2026-08-10'
): GradeableDecision[] {
  const end = new Date(`${endingOn}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(end);
    day.setUTCDate(day.getUTCDate() - (count - 1 - index));
    return decision({ ...overrides, localDate: day.toISOString().slice(0, 10) });
  });
}

/**
 * A run long enough and wide enough to clear the friction service's own
 * 'moderate' evidence bar (4 observations across 10 days), so a test about
 * a VERDICT is not silently also a test about thinness.
 */
function nonThinRun(
  count: number,
  overrides: Partial<GradeableDecision>
): GradeableDecision[] {
  const rows = run(count, overrides, '2026-08-10');
  // Push the first one back so the span is comfortably over 10 days.
  return [{ ...rows[0]!, localDate: '2026-07-20' }, ...rows.slice(1)];
}

// =====================================================================
// The four fixtures the brief names.
// =====================================================================

describe('fixture: LANDING — acted on, and behavior moved', () => {
  const grade = gradeDecisions(
    'action_type',
    'reset',
    'reset',
    nonThinRun(5, { memberResponse: 'done', comparisonOutcome: 'moved' })
  );

  it('is graded landing', () => {
    expect(grade.verdict).toBe('landing');
  });

  it('counts what the ledger actually held', () => {
    expect(grade.deliveredCount).toBe(5);
    expect(grade.actedCount).toBe(5);
    expect(grade.ignoredCount).toBe(0);
    expect(grade.comparedCount).toBe(5);
    expect(grade.movedCount).toBe(5);
  });

  it('is not thin, so it is a grade the rest of the build may act on', () => {
    expect(grade.evidenceLevel).not.toBe('thin');
  });

  it('needs the acted minimum, not one good morning', () => {
    const single = gradeDecisions(
      'action_type',
      'reset',
      'reset',
      nonThinRun(ACTED_MINIMUM_FOR_LANDING - 1, {
        memberResponse: 'done',
        comparisonOutcome: 'moved',
      })
    );
    expect(single.verdict).not.toBe('landing');
  });
});

describe('fixture: LANDED BUT FLAT — acted on, comparisons ran, nothing moved', () => {
  const grade = gradeDecisions(
    'action_type',
    'reflection',
    'reflection',
    nonThinRun(5, { actionType: 'reflection', memberResponse: 'help', comparisonOutcome: 'flat' })
  );

  it('is graded landed_no_change, not landing and not dead', () => {
    expect(grade.verdict).toBe('landed_no_change');
  });

  it('counts "help" as acting, because the smaller step is the action working', () => {
    expect(grade.actedCount).toBe(5);
  });

  it('records that comparisons genuinely ran and none of them moved', () => {
    expect(grade.comparedCount).toBe(5);
    expect(grade.movedCount).toBe(0);
  });

  it('stays neutral rather than landed_no_change when no comparison has completed yet', () => {
    const pending = gradeDecisions(
      'action_type',
      'reflection',
      'reflection',
      nonThinRun(5, { actionType: 'reflection', memberResponse: 'done', comparisonOutcome: null })
    );
    // She acted, and nothing has been measured. "Landed but nothing moved"
    // would be a claim about a measurement that has not happened.
    expect(pending.verdict).toBe('neutral');
    expect(pending.comparedCount).toBe(0);
  });
});

describe('fixture: DEAD — it reached her repeatedly and she took none of it up', () => {
  const grade = gradeDecisions(
    'action_type',
    'nutrition',
    'nutrition',
    nonThinRun(6, { actionType: 'nutrition', memberResponse: 'ignored' })
  );

  it('is graded dead', () => {
    expect(grade.verdict).toBe('dead');
  });

  it('needs the unacted minimum before it is dead rather than a bad week', () => {
    const few = gradeDecisions(
      'action_type',
      'nutrition',
      'nutrition',
      nonThinRun(UNACTED_MINIMUM_FOR_DEAD - 1, {
        actionType: 'nutrition',
        memberResponse: 'ignored',
      })
    );
    expect(few.verdict).not.toBe('dead');
  });

  it('is never dead once she has acted at all', () => {
    const mixed = gradeDecisions('action_type', 'nutrition', 'nutrition', [
      ...nonThinRun(6, { actionType: 'nutrition', memberResponse: 'ignored' }),
      decision({ actionType: 'nutrition', memberResponse: 'done', localDate: '2026-08-11' }),
    ]);
    expect(mixed.verdict).not.toBe('dead');
  });

  /**
   * The sharpest rule in the file, and the one the brief's own wording
   * would have got wrong. The brief defines its "ignored count" as later
   * plus ignored plus not_seen, and that aggregate IS stored. But a day the
   * card never reached her screen is not evidence about the card, per Part
   * 1's own reasoning, so the DEAD verdict is computed from what she could
   * actually have responded to. Both facts exist; neither is inferred from
   * the other.
   */
  it('never calls an approach dead on days that never reached her screen', () => {
    const away = gradeDecisions(
      'action_type',
      'nutrition',
      'nutrition',
      nonThinRun(10, { actionType: 'nutrition', memberResponse: 'not_seen' })
    );
    expect(away.verdict).toBe('neutral');
    expect(away.notSeenCount).toBe(10);
    // Stored as the brief defines it, all the same.
    expect(away.ignoredCount).toBe(10);
    expect(seenCount(nonThinRun(10, { memberResponse: 'not_seen' }))).toBe(0);
  });

  it("counts 'later' toward dead, because setting something aside repeatedly is still not taking it up", () => {
    const saved = gradeDecisions(
      'action_type',
      'nutrition',
      'nutrition',
      nonThinRun(6, { actionType: 'nutrition', memberResponse: 'later' })
    );
    expect(saved.verdict).toBe('dead');
  });
});

describe('fixture: THIN — a real grade, labelled thin, acted on by nothing', () => {
  const grade = gradeDecisions('action_type', 'reset', 'reset', [
    decision({ memberResponse: 'done', localDate: '2026-08-10', comparisonOutcome: 'moved' }),
    decision({ memberResponse: 'done', localDate: '2026-08-11', comparisonOutcome: 'moved' }),
  ]);

  it('is labelled thin rather than dressed up as a finding', () => {
    expect(grade.evidenceLevel).toBe('thin');
  });

  it('still records its counts honestly, because the counts are true', () => {
    expect(grade.actedCount).toBe(2);
    expect(grade.movedCount).toBe(2);
  });

  it('an empty ledger produces a neutral, thin grade rather than nothing', () => {
    const empty = gradeDecisions('action_type', 'reset', 'reset', []);
    expect(empty.verdict).toBe('neutral');
    expect(empty.evidenceLevel).toBe('thin');
    expect(empty.spanDays).toBe(0);
    expect(empty.lastDeliveredLocalDate).toBeNull();
  });
});

// =====================================================================
// The verdict ladder itself.
// =====================================================================

describe('verdictFor is a ladder, and acting always outranks not acting', () => {
  it('prefers landing over landed_no_change when both would apply', () => {
    expect(verdictFor({ acted: 5, unactedSeen: 0, compared: 5, moved: 1 })).toBe('landing');
  });

  it('never returns dead for a member who acted, however many days she let pass', () => {
    expect(verdictFor({ acted: 2, unactedSeen: 40, compared: 1, moved: 0 })).toBe(
      'landed_no_change'
    );
  });

  it('returns neutral when there is not enough either way', () => {
    expect(verdictFor({ acted: 1, unactedSeen: 1, compared: 0, moved: 0 })).toBe('neutral');
  });
});

// =====================================================================
// Reading a comparison.
// =====================================================================

function windowMetrics(overrides: Partial<WindowMetrics> = {}): WindowMetrics {
  return {
    window: { start: '2026-07-01', end: '2026-07-14' },
    activeDays: 6,
    activeDayRate: 43,
    signIns: 8,
    dailyResetStarted: 6,
    dailyResetCompleted: 5,
    dailyResetCompletionRate: 83,
    totalEvents: 40,
    averageDaysBetweenVisits: 2,
    featureUse: [],
    ...overrides,
  } as WindowMetrics;
}

function comparison(overrides: Partial<MemberWindowComparison> = {}): MemberWindowComparison {
  return {
    memberId: 'member-1',
    inScope: true,
    referenceDate: '2026-07-15',
    windowDays: 14,
    includeTestAccounts: true,
    afterWindowComplete: true,
    daysOfAfterWindowElapsed: 14,
    before: windowMetrics(),
    after: windowMetrics(),
    ...overrides,
  };
}

describe('reading one before/after comparison', () => {
  it('refuses to answer at all until the after window has finished elapsing', () => {
    expect(
      readComparison(comparison({ afterWindowComplete: false, daysOfAfterWindowElapsed: 6 }))
    ).toBeNull();
  });

  it('reports out_of_scope rather than retrying forever', () => {
    expect(readComparison(comparison({ inScope: false }))).toBe('out_of_scope');
  });

  it('is flat when nothing moved past the threshold', () => {
    expect(readComparison(comparison({ after: windowMetrics({ activeDays: 7 }) }))).toBe('flat');
  });

  it('is moved when one behavioral metric moved past the threshold', () => {
    expect(readComparison(comparison({ after: windowMetrics({ activeDays: 10 }) }))).toBe('moved');
  });

  it('is direction-agnostic, because the primitive it reads never says whether a change was good', () => {
    expect(readComparison(comparison({ after: windowMetrics({ activeDays: 1 }) }))).toBe('moved');
  });

  it('only reads the four behavioral metrics it declares', () => {
    // totalEvents is deliberately not on the list: it is derived from the
    // others, so counting it would count the same movement twice.
    expect([...COMPARED_METRICS]).not.toContain('totalEvents');
    expect(readComparison(comparison({ after: windowMetrics({ totalEvents: 400 }) }))).toBe('flat');
  });

  it('treats zero to something, and something to zero, as movement', () => {
    expect(metricMoved(0, 3)).toBe(true);
    expect(metricMoved(3, 0)).toBe(true);
    expect(metricMoved(0, 0)).toBe(false);
  });

  it('applies the declared relative threshold rather than any change at all', () => {
    const before = 10;
    expect(metricMoved(before, before * (1 + MOVED_RELATIVE_CHANGE))).toBe(false);
    expect(metricMoved(before, before * (1 + MOVED_RELATIVE_CHANGE) + 0.01)).toBe(true);
  });

  it('says nothing when either side is missing', () => {
    expect(metricMoved(null, 4)).toBe(false);
    expect(metricMoved(4, null)).toBe(false);
  });
});

// =====================================================================
// The 21 day decay.
// =====================================================================

describe('a dead grade decays back to neutral at 21 days', () => {
  const dead = { verdict: 'dead' as const, lastDeliveredLocalDate: '2026-07-22' };

  it('is still dead the day before the threshold', () => {
    const dayBefore = '2026-08-11'; // 20 days after 2026-07-22
    expect(daysSinceLastDelivered(dead, dayBefore)).toBe(DEAD_GRADE_DECAY_DAYS - 1);
    expect(isDecayedDeadGrade(dead, dayBefore)).toBe(false);
    expect(effectiveVerdict(dead, dayBefore)).toBe('dead');
  });

  it('returns to neutral exactly at the threshold', () => {
    const onThreshold = '2026-08-12'; // 21 days after 2026-07-22
    expect(daysSinceLastDelivered(dead, onThreshold)).toBe(DEAD_GRADE_DECAY_DAYS);
    expect(isDecayedDeadGrade(dead, onThreshold)).toBe(true);
    expect(effectiveVerdict(dead, onThreshold)).toBe('neutral');
  });

  it('never decays a verdict that is not dead', () => {
    const landing = { verdict: 'landing' as const, lastDeliveredLocalDate: '2020-01-01' };
    expect(isDecayedDeadGrade(landing, TODAY)).toBe(false);
    expect(effectiveVerdict(landing, TODAY)).toBe('landing');
  });

  it('never decays a grade that was never delivered, since there is no clock to run', () => {
    const never = { verdict: 'dead' as const, lastDeliveredLocalDate: null };
    expect(daysSinceLastDelivered(never, TODAY)).toBeNull();
    expect(isDecayedDeadGrade(never, TODAY)).toBe(false);
  });
});

// =====================================================================
// The pass itself: grouping, and staying cheap.
// =====================================================================

describe('the grading pass groups both scopes and stays cheap', () => {
  const rows: GradeableDecision[] = [
    decision({ actionType: 'reset', threadKey: 'a::1', memberResponse: 'done' }),
    decision({ actionType: 'reset', threadKey: 'b::2', memberResponse: 'ignored' }),
    decision({ actionType: 'nutrition', threadKey: 'c::3', memberResponse: 'ignored' }),
  ];

  it('produces one grade per action type and one per thread', () => {
    const grades = groupForGrading(rows);
    expect(grades.filter((g) => g.scope === 'action_type').map((g) => g.key).sort()).toEqual([
      'nutrition',
      'reset',
    ]);
    expect(grades.filter((g) => g.scope === 'thread').map((g) => g.key).sort()).toEqual([
      'a::1',
      'b::2',
      'c::3',
    ]);
  });

  it('never invents a grade for an action type that was never delivered', () => {
    const grades = groupForGrading(rows);
    expect(grades.some((g) => g.key === 'reflection')).toBe(false);
  });

  function ledgerRow(overrides: Partial<LedgerRowForGrading>): LedgerRowForGrading {
    return {
      ...decision(),
      comparisonReferenceDate: '2026-07-01',
      comparisonWindowDays: 14,
      comparisonAfterCompleteOn: '2026-07-15',
      ...overrides,
    };
  }

  it('only spends a comparison on a decision she actually acted on', () => {
    const candidates = comparisonCandidates(
      [
        ledgerRow({ memberResponse: 'done' }),
        ledgerRow({ memberResponse: 'help' }),
        ledgerRow({ memberResponse: 'ignored' }),
        ledgerRow({ memberResponse: 'later' }),
        ledgerRow({ memberResponse: 'not_seen' }),
        ledgerRow({ memberResponse: null }),
      ],
      TODAY
    );
    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => c.memberResponse === 'done' || c.memberResponse === 'help')).toBe(
      true
    );
  });

  it('never recomputes an outcome that is already cached', () => {
    const candidates = comparisonCandidates(
      [ledgerRow({ memberResponse: 'done', comparisonOutcome: 'flat' })],
      TODAY
    );
    expect(candidates).toHaveLength(0);
  });

  it('never spends one on a window that has not finished elapsing', () => {
    const candidates = comparisonCandidates(
      [ledgerRow({ memberResponse: 'done', comparisonAfterCompleteOn: '2026-09-01' })],
      TODAY
    );
    expect(candidates).toHaveLength(0);
  });

  it('caps how many run in one pass, so a member returning after months is not made to wait', () => {
    const many = Array.from({ length: 40 }, () => ledgerRow({ memberResponse: 'done' }));
    expect(comparisonCandidates(many, TODAY)).toHaveLength(MAX_COMPARISONS_PER_PASS);
  });

  it('bounds how far back a pass reads at all', () => {
    expect(GRADE_LOOKBACK_DAYS).toBeGreaterThan(0);
    expect(GRADE_LOOKBACK_DAYS).toBeLessThanOrEqual(180);
  });
});

describe('countValue writes a count as digits an analytics payload can carry', () => {
  it('is digits only', () => {
    for (const value of [0, 1, 42, 12.9, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(countValue(value)).toMatch(/^\d+$/);
    }
  });

  it('never reports a negative or fractional count', () => {
    expect(countValue(-5)).toBe('0');
    expect(countValue(12.9)).toBe('12');
  });
});

// =====================================================================
// The Weekly Root Review's two grade sentences.
// =====================================================================

function reviewGrade(overrides: Partial<ReviewGrade> = {}): ReviewGrade {
  return {
    actionType: 'reset',
    verdict: 'landing',
    evidence: 'strong',
    metrics: { delivered: 10, acted: 8, moved: 3, daysSinceLastDelivered: 1 },
    ...overrides,
  };
}

function fullPlan(grades?: ReviewGrade[]): ReviewPlan {
  return {
    shape: 'full',
    observations: [
      {
        kind: 'reset_consistency',
        tier: 1,
        signalKey: null,
        state: null,
        metrics: { thisWeekResets: 5, priorWeekResets: 3 },
      },
      {
        kind: 'action_engagement',
        tier: 1,
        signalKey: null,
        state: null,
        metrics: { delivered: 6, acted: 4, ignored: 2, notSeen: 0 },
      },
    ],
    worked: [{ kind: 'reset_days', actionType: null, metrics: { thisWeekResets: 5 } }],
    focus: {
      weekStart: '2026-08-10',
      actionType: 'reset',
      threadKey: null,
      reason: 'engagement_strong',
      sourceEvidence: {},
    },
    questionKeys: [],
    ...(grades ? { grades } : {}),
  };
}

describe('WHAT WORKED speaks a landing grade', () => {
  it('adds a sentence naming what she has taken up and that her fortnight looked different', () => {
    const review = renderReview(fullPlan([reviewGrade()]), '2026-08-10', {}, false);
    const sentence = review.worked.at(-1)!;
    expect(sentence).toContain('the small daily reset kind of thing');
    expect(sentence).toContain('different');
  });

  it('never claims the change was an improvement, because the primitive behind it never says so', () => {
    const sentence = renderGradeWorked(reviewGrade())!;
    expect(sentence).not.toMatch(/better|improved|improvement|worse/i);
  });

  it('comes after this week, because this week is the news and the grade is the context', () => {
    const review = renderReview(fullPlan([reviewGrade()]), '2026-08-10', {}, false);
    expect(review.worked).toHaveLength(2);
    expect(review.worked[0]).toContain('Daily Reset');
  });

  it('says nothing for any verdict that is not landing', () => {
    expect(renderGradeWorked(reviewGrade({ verdict: 'dead' }))).toBeNull();
    expect(renderGradeWorked(reviewGrade({ verdict: 'landed_no_change' }))).toBeNull();
  });

  it('says nothing when the grade carries no acted count to state', () => {
    expect(renderGradeWorked(reviewGrade({ metrics: { delivered: 4 } }))).toBeNull();
  });
});

describe('WHAT ROOT IS ADJUSTING speaks a dead grade, as retiring or retrying', () => {
  const dead = reviewGrade({
    actionType: 'nutrition',
    verdict: 'dead',
    metrics: { delivered: 8, acted: 0, daysSinceLastDelivered: 2 },
  });

  it('says Root is setting the approach down while the grade is still live', () => {
    const sentence = renderGradeAdjusting(dead)!;
    expect(sentence).toContain('stop leading with');
    expect(sentence).toContain('the food and water kind of thing');
  });

  it('says Root is going to offer it once more past the 21 day decay', () => {
    const decayed = reviewGrade({
      actionType: 'nutrition',
      verdict: 'dead',
      metrics: { delivered: 8, acted: 0, daysSinceLastDelivered: DEAD_GRADE_DECAY_DAYS },
    });
    const sentence = renderGradeAdjusting(decayed)!;
    expect(sentence).toContain('once more');
    expect(sentence).not.toContain('stop leading with');
  });

  it('is appended to the existing sentence rather than becoming a section of its own', () => {
    const withGrade = renderReview(fullPlan([dead]), '2026-08-10', {}, false);
    const without = renderReview(fullPlan(), '2026-08-10', {}, false);
    expect(withGrade.adjusting.startsWith(without.adjusting)).toBe(true);
    expect(withGrade.adjusting.length).toBeGreaterThan(without.adjusting.length);
  });

  it('says nothing for any verdict that is not dead', () => {
    expect(renderGradeAdjusting(reviewGrade({ verdict: 'landing' }))).toBeNull();
  });

  it('never names how many times she did not respond', () => {
    const sentence = renderGradeAdjusting(dead)!;
    expect(sentence).not.toMatch(/\d/);
  });
});

describe('the earned language tier, and thin evidence saying nothing at all', () => {
  it('hedges at moderate evidence and does not at strong', () => {
    const moderate = renderGradeWorked(reviewGrade({ evidence: 'moderate' }))!;
    const strong = renderGradeWorked(reviewGrade({ evidence: 'strong' }))!;
    expect(moderate).toContain('so far');
    expect(strong).not.toContain('so far');
    expect(moderate).not.toBe(strong);
  });

  /**
   * The gate the brief names, and it is enforced at the STORAGE layer
   * rather than at render time. A thin grade cannot sit on a plan, so
   * there is no state in which one could reach a member's screen.
   */
  it('refuses to store a thin grade at all', () => {
    expect(sanitizeGrade({ ...reviewGrade(), evidence: 'thin' })).toBeNull();
    expect(sanitizeGrades([{ ...reviewGrade(), evidence: 'thin' }])).toEqual([]);
  });

  it('refuses to store a neutral verdict, which has no honest sentence', () => {
    expect(sanitizeGrade({ ...reviewGrade(), verdict: 'neutral' })).toBeNull();
  });

  it('renders a review with no grades exactly as Part 2 did', () => {
    const review = renderReview(fullPlan(), '2026-08-10', {}, false);
    expect(review.worked).toHaveLength(1);
    expect(review.adjusting).not.toContain('stop leading with');
    expect(review.adjusting).not.toContain('once more');
  });

  it('never speaks a grade on a thin review, which has already said Root does not have enough', () => {
    const thin: ReviewPlan = { ...fullPlan([reviewGrade()]), shape: 'thin' };
    const review = renderReview(thin, '2026-08-10', {}, false);
    expect(review.worked).toEqual([]);
    expect(review.adjusting).not.toContain('the small daily reset kind of thing');
  });
});

describe('the grade sentences obey the copy rules', () => {
  const sentences = [
    renderGradeWorked(reviewGrade({ evidence: 'moderate' }))!,
    renderGradeWorked(reviewGrade({ evidence: 'strong' }))!,
    renderGradeAdjusting(
      reviewGrade({ verdict: 'dead', metrics: { delivered: 8, daysSinceLastDelivered: 1 } })
    )!,
    renderGradeAdjusting(
      reviewGrade({
        verdict: 'dead',
        metrics: { delivered: 8, daysSinceLastDelivered: DEAD_GRADE_DECAY_DAYS },
      })
    )!,
  ];

  it('contains no em dash anywhere', () => {
    for (const sentence of sentences) expect(sentence).not.toContain('—');
  });

  it('never scolds and never instructs', () => {
    for (const sentence of sentences) {
      expect(sentence).not.toMatch(/you should|you need to|you failed|missed|streak/i);
    }
  });

  it('states an absence as what Root has, never as what she did not do', () => {
    const retiring = renderGradeAdjusting(
      reviewGrade({ verdict: 'dead', metrics: { delivered: 8, daysSinceLastDelivered: 1 } })
    )!;
    expect(retiring).toContain('Root');
    expect(retiring).not.toMatch(/you (did not|didn't|never)/i);
  });

  it('is non-empty and ends in a full stop', () => {
    for (const sentence of sentences) {
      expect(sentence.trim().length).toBeGreaterThan(0);
      expect(sentence.trim().endsWith('.')).toBe(true);
    }
  });
});
