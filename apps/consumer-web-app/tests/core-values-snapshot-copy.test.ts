import { describe, it, expect } from 'vitest';
import { computeCvsScoring } from '../lib/core-values-snapshot/scoring';
import { buildWhatRootLearned, buildS1Observation } from '../lib/core-values-snapshot/copy';
import { buildCvsNarrativeDrafts } from '../lib/core-values-snapshot/narrative';
import type { SessionAnswers } from '../lib/assessment-runtime/types';

/**
 * Guards a real accuracy bug (2026-08-01): the Split branch's copy said a
 * value "hadn't come up once before" that Q11 pick — a claim about the
 * member's whole set of answers — when the check behind it only ever
 * looked at the four single-select "what matters" questions (Q1-Q4).
 * Every branch's copy must only claim what its own scoring actually
 * verified, never something broader.
 */

const OLD_SPLIT_PHRASE = "hadn't come up once before";
const OLD_CLEAR_GAP_PHRASES = ['four different questions, four different angles', "you didn't hesitate"];
const OLD_ALIGNED_PHRASES = ['came up again and again', 'unusually consistent'];
const OLD_SLIPPING_PHRASE = 'kept surfacing, from every angle';

describe('Split branch copy — real reported bug repro', () => {
  it('the exact production answer set that triggered the false claim now produces an accurate, scoped statement', () => {
    // Real answers pulled from production session c10ab8be-... (2026-08-01):
    // Q1/Q2 relationships, Q3 health, Q4 peace — freedom never appears in
    // Q1-Q4 — then Q11 picks freedom. The member correctly recalled having
    // answered a real question about freedom (Q9, "Fun and play") earlier
    // in the flow, which the old "hadn't come up once before" copy denied.
    const answers: SessionAnswers = {
      cvs_q1: 'relationships',
      cvs_q2: 'relationships',
      cvs_q3: 'health',
      cvs_q4: 'peace',
      cvs_q5: 2,
      cvs_q6: 3,
      cvs_q7: 4,
      cvs_q8: 4,
      cvs_q9: 2, // "Fun and play" (freedom) really was answered before Q11
      cvs_q10: 2,
      cvs_q11: 'freedom',
      cvs_q12: 'peace',
    };
    const scoring = computeCvsScoring(answers);
    expect(scoring.branch).toBe('split');
    expect(scoring.q11Pick).toBe('freedom');

    const text = buildWhatRootLearned(scoring);
    expect(text).not.toContain(OLD_SPLIT_PHRASE);
    // The new claim is scoped to the four "what matters" questions specifically.
    expect(text).toContain('four different times what matters most to you');
    expect(text).toContain('Freedom & Play');
    expect(text).toContain('never came up as your answer');
  });

  it('property: whenever split fires, the copy never claims a full-session absence — only that the four Q1-Q4 questions never landed on that answer, which is always true by construction', () => {
    const scenarios: SessionAnswers[] = [
      {
        cvs_q1: 'health', cvs_q2: 'health', cvs_q3: 'health', cvs_q4: 'health',
        cvs_q5: 3, cvs_q6: 3, cvs_q7: 3, cvs_q8: 3, cvs_q9: 3, cvs_q10: 3,
        cvs_q11: 'freedom', cvs_q12: 'health',
      },
      {
        cvs_q1: 'purpose', cvs_q2: 'growth', cvs_q3: 'purpose', cvs_q4: 'growth',
        cvs_q5: 1, cvs_q6: 1, cvs_q7: 5, cvs_q8: 5, cvs_q9: 5, cvs_q10: 1,
        cvs_q11: 'peace', cvs_q12: 'growth',
      },
    ];
    for (const answers of scenarios) {
      const scoring = computeCvsScoring(answers);
      expect(scoring.branch).toBe('split');
      // split === true IS the verified fact that Q11's pick scored zero
      // across Q1-Q4 (scoring.ts's own definition) — the exact thing the
      // copy's "never came up as your answer" line is now scoped to.
      expect(scoring.split).toBe(true);
      const text = buildWhatRootLearned(scoring);
      expect(text).not.toContain(OLD_SPLIT_PHRASE);
    }
  });
});

describe('clear_gap / aligned / slipping copy — no unverified repetition or consistency claims', () => {
  it('a topValue reached mostly via Q11/Q12 boosts (only 1 of 4 gut questions, and not Q4) never gets an unverified "kept showing up" / "you didn\'t hesitate" claim', () => {
    // Q1=health(1), Q2=growth(1), Q3=purpose(1), Q4=freedom(2). health only
    // ever appears once in Q1-Q4 (Q1), and Q4 itself points to freedom, not
    // health — yet health becomes topValue purely via Q11(+2)/Q12(+1).
    const a: SessionAnswers = {
      cvs_q1: 'health', cvs_q2: 'growth', cvs_q3: 'purpose', cvs_q4: 'freedom',
      cvs_q5: 2, cvs_q6: 2, cvs_q7: 2, cvs_q8: 2, cvs_q9: 2, cvs_q10: 2,
      cvs_q11: 'health', cvs_q12: 'health',
    };
    const scoring = computeCvsScoring(a);
    expect(scoring.split).toBe(false); // health had nonzero Q1-Q4 support (Q1), so this is a real gap branch, not split
    expect(scoring.topValue).toBe('health');
    expect(scoring.q4Answer).toBe('freedom'); // Q4 did NOT point to the eventual top value
    expect(scoring.branch).toBe('clear_gap'); // attention[health] (cvs_q5) = 2

    const text = buildWhatRootLearned(scoring);
    for (const phrase of OLD_CLEAR_GAP_PHRASES) expect(text).not.toContain(phrase);
    expect(text).toContain('came out on top');
  });

  it('slipping: topValue reached mostly via boosts never gets the "kept surfacing, from every angle" claim', () => {
    // Same shape as the clear_gap case above but attention[health] = 3 -> slipping.
    const a: SessionAnswers = {
      cvs_q1: 'health', cvs_q2: 'growth', cvs_q3: 'purpose', cvs_q4: 'freedom',
      cvs_q5: 3, cvs_q6: 2, cvs_q7: 2, cvs_q8: 2, cvs_q9: 2, cvs_q10: 2,
      cvs_q11: 'health', cvs_q12: 'health',
    };
    const scoring = computeCvsScoring(a);
    expect(scoring.branch).toBe('slipping');
    const text = buildWhatRootLearned(scoring);
    expect(text).not.toContain(OLD_SLIPPING_PHRASE);
    expect(text).toContain('what matters most to you');
  });

  it('aligned: runner-up genuinely getting less attention keeps the "getting less" line, and never claims unverified consistency', () => {
    const a: SessionAnswers = {
      cvs_q1: 'purpose', cvs_q2: 'purpose', cvs_q3: 'purpose', cvs_q4: 'purpose',
      cvs_q5: 1, cvs_q6: 3, cvs_q7: 1, cvs_q8: 5, cvs_q9: 1, cvs_q10: 1,
      cvs_q11: 'purpose', cvs_q12: 'purpose',
    };
    const scoring = computeCvsScoring(a);
    expect(scoring.branch).toBe('aligned');
    expect(scoring.attention[scoring.runnerUpValue]).toBeLessThan(scoring.attention[scoring.topValue]);
    const text = buildWhatRootLearned(scoring);
    expect(text).toContain("and it's getting less");
    for (const phrase of OLD_ALIGNED_PHRASES) expect(text).not.toContain(phrase);
  });

  it('aligned: runner-up NOT actually getting less attention drops the false "getting less" claim', () => {
    const a: SessionAnswers = {
      cvs_q1: 'purpose', cvs_q2: 'purpose', cvs_q3: 'purpose', cvs_q4: 'purpose',
      cvs_q5: 5, cvs_q6: 5, cvs_q7: 1, cvs_q8: 5, cvs_q9: 1, cvs_q10: 1,
      cvs_q11: 'purpose', cvs_q12: 'purpose',
    };
    const scoring = computeCvsScoring(a);
    expect(scoring.branch).toBe('aligned');
    expect(scoring.attention[scoring.runnerUpValue]).toBeGreaterThanOrEqual(scoring.attention[scoring.topValue]);
    const text = buildWhatRootLearned(scoring);
    expect(text).not.toContain("and it's getting less");
  });
});

describe('attention claims never invent a "last two weeks" question that was never asked (real reported bug, 2026-08-01)', () => {
  // The Screen 2 sliders (cvs_q5-cvs_q10) each only ever ask a short label
  // ("Rest and stillness") on a 1-5 scale — "the last two weeks" appears
  // exactly once, in the section intro shown above the whole battery
  // (CVS_SCREEN2_INTRO), never restated per question. Root's copy used to
  // say "when I asked about your last two weeks, X got a Y out of 5" as if
  // that exact question had been asked, which overclaims what any single
  // slider actually said.
  const OLD_TIMEFRAME_PHRASES = ['about your last two weeks', 'your actual last two weeks', 'your last two weeks say'];

  it('clear_gap never claims a "last two weeks" question and stays scoped to the real attention rating', () => {
    const a: SessionAnswers = {
      cvs_q1: 'health', cvs_q2: 'growth', cvs_q3: 'purpose', cvs_q4: 'freedom',
      cvs_q5: 2, cvs_q6: 2, cvs_q7: 2, cvs_q8: 2, cvs_q9: 2, cvs_q10: 2,
      cvs_q11: 'health', cvs_q12: 'health',
    };
    const scoring = computeCvsScoring(a);
    expect(scoring.branch).toBe('clear_gap');
    const text = buildWhatRootLearned(scoring);
    for (const phrase of OLD_TIMEFRAME_PHRASES) expect(text).not.toContain(phrase);
    expect(text).toContain('how much attention it\'s actually been getting');
    expect(text).toContain(`${scoring.attention[scoring.topValue]} out of 5`);
  });

  it('aligned never claims a "last two weeks" question and stays scoped to the real attention rating', () => {
    const a: SessionAnswers = {
      cvs_q1: 'purpose', cvs_q2: 'purpose', cvs_q3: 'purpose', cvs_q4: 'purpose',
      cvs_q5: 1, cvs_q6: 3, cvs_q7: 1, cvs_q8: 5, cvs_q9: 1, cvs_q10: 1,
      cvs_q11: 'purpose', cvs_q12: 'purpose',
    };
    const scoring = computeCvsScoring(a);
    expect(scoring.branch).toBe('aligned');
    const text = buildWhatRootLearned(scoring);
    for (const phrase of OLD_TIMEFRAME_PHRASES) expect(text).not.toContain(phrase);
    expect(text).toContain('how much attention it\'s actually getting');
  });

  it('the S1 guilt-area observation never claims a "last two weeks" question either', () => {
    const a: SessionAnswers = {
      cvs_q1: 'relationships', cvs_q2: 'relationships', cvs_q3: 'health', cvs_q4: 'relationships',
      cvs_q5: 4, cvs_q6: 3, cvs_q7: 2, cvs_q8: 2, cvs_q9: 2, cvs_q10: 2,
      cvs_q11: 'relationships', cvs_q12: 'relationships',
    };
    const scoring = computeCvsScoring(a);
    expect(scoring.guiltArea).toBe('health');
    expect(scoring.attention.health).toBeGreaterThanOrEqual(4);
    const text = buildS1Observation(scoring);
    for (const phrase of OLD_TIMEFRAME_PHRASES) expect(text).not.toContain(phrase);
    expect(text).toContain('the attention you said');
  });
});

describe('"What Root Knows So Far" narrative draft — no unverified repetition/closeness claims', () => {
  it('the top-value summary never claims a specific question count or "close second" that was not verified', () => {
    const a: SessionAnswers = {
      cvs_q1: 'health', cvs_q2: 'relationships', cvs_q3: 'relationships', cvs_q4: 'relationships',
      cvs_q5: 2, cvs_q6: 2, cvs_q7: 2, cvs_q8: 2, cvs_q9: 2, cvs_q10: 2,
      cvs_q11: 'relationships', cvs_q12: 'health',
    };
    const scoring = computeCvsScoring(a);
    const drafts = buildCvsNarrativeDrafts('session-1', scoring);
    const topDraft = drafts.find((d) => d.category === 'primary_priorities')!;
    expect(topDraft.summary).not.toContain('came up across four independent questions');
    expect(topDraft.summary).not.toContain('close second');
  });
});
