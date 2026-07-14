import { describe, it, expect } from 'vitest';
import { classifyConcern } from '../lib/safety/classifier';

describe('classifyConcern — routine wellness (no false escalation)', () => {
  it('classifies ordinary check-in language as STANDARD_COACHING', () => {
    const result = classifyConcern({
      text: 'I slept great last night and my energy has been really good this week.',
    });
    expect(result.classificationLevel).toBe('standard_coaching');
    expect(result.urgency).toBe('none');
    expect(result.coachingAllowed).toBe(true);
    expect(result.coachReviewRequired).toBe(false);
    expect(result.acknowledgmentRequired).toBe(false);
    expect(result.restrictedTopics).toEqual([]);
  });

  it('classifies empty/null input as STANDARD_COACHING', () => {
    expect(classifyConcern({ text: null }).classificationLevel).toBe('standard_coaching');
    expect(classifyConcern({}).classificationLevel).toBe('standard_coaching');
  });

  it('does not escalate ordinary mentions of "pain" or "stress" without severity language', () => {
    const result = classifyConcern({
      text: 'My lower back pain has been about the same, and work stress is normal.',
    });
    expect(result.classificationLevel).toBe('standard_coaching');
  });
});

describe('classifyConcern — COACHING_WITH_CAUTION', () => {
  it('flags a newly-reported concern with no higher-severity language as COACHING_WITH_CAUTION', () => {
    const result = classifyConcern({
      text: 'Something has felt a little different this week.',
      newOrWorseningConcern: true,
    });
    expect(result.classificationLevel).toBe('coaching_with_caution');
    expect(result.coachingAllowed).toBe(true);
    expect(result.coachReviewRequired).toBe(false);
  });
});

describe('classifyConcern — MEDICAL_EVALUATION_RECOMMENDED', () => {
  it('recommends evaluation for a diagnosis request while allowing safe coaching to continue', () => {
    const result = classifyConcern({ text: 'Do I have a thyroid problem?' });
    expect(result.classificationLevel).toBe('medical_evaluation_recommended');
    expect(result.coachingAllowed).toBe(true);
    expect(result.coachReviewRequired).toBe(false);
    expect(result.restrictedTopics).toEqual(['diagnosis']);
  });

  it('recommends evaluation for an out-of-scope medical request', () => {
    const result = classifyConcern({ text: 'Can you write me a prescription for this?' });
    expect(result.classificationLevel).toBe('medical_evaluation_recommended');
    expect(result.restrictedTopics).toEqual(['out_of_scope_medical']);
  });
});

describe('classifyConcern — COACH_REVIEW_REQUIRED (diagnosis/medication blocking with topic-specific restriction)', () => {
  it('blocks medication guidance specifically while leaving unrelated topics unrestricted', () => {
    const result = classifyConcern({
      text: 'Should I stop taking my medication? Also, my sleep routine has been great lately.',
    });
    expect(result.classificationLevel).toBe('coach_review_required');
    expect(result.coachingAllowed).toBe(true); // limited, not stopped entirely
    expect(result.coachReviewRequired).toBe(true);
    expect(result.acknowledgmentRequired).toBe(true);
    expect(result.restrictedTopics).toEqual(['medication']);
    expect(result.restrictedTopics).not.toContain('sleep');
  });

  it('flags severe or rapidly worsening pain for coach review', () => {
    const result = classifyConcern({ text: 'My pain has been unbearable pain the last two days.' });
    expect(result.classificationLevel).toBe('coach_review_required');
    expect(result.restrictedTopics).toEqual(['pain_severity']);
  });

  it('flags eating-disorder risk signals for coach review', () => {
    const result = classifyConcern({
      text: "I've been starving myself and I'm terrified of gaining weight.",
    });
    expect(result.classificationLevel).toBe('coach_review_required');
    expect(result.restrictedTopics).toEqual(['eating_disorder']);
  });
});

describe('classifyConcern — SAFETY_RESPONSE_ONLY (urgent symptom + crisis handling)', () => {
  it('stops normal coaching for chest pain / breathing concerns', () => {
    const result = classifyConcern({ text: "I am having chest pain and I can't breathe well." });
    expect(result.classificationLevel).toBe('safety_response_only');
    expect(result.urgency).toBe('critical');
    expect(result.coachingAllowed).toBe(false);
    expect(result.coachReviewRequired).toBe(true);
    expect(result.acknowledgmentRequired).toBe(true);
    expect(result.escalationAction).toBe('urgent_follow_up');
  });

  it('stops normal coaching for fainting / loss of consciousness', () => {
    const result = classifyConcern({ text: 'I fainted this morning after standing up.' });
    expect(result.classificationLevel).toBe('safety_response_only');
  });

  it('stops normal coaching for neurological warning signs', () => {
    const result = classifyConcern({
      text: 'I had sudden weakness on one side and slurred speech.',
    });
    expect(result.classificationLevel).toBe('safety_response_only');
  });

  it('stops normal coaching for self-harm / crisis language with the most urgent escalation', () => {
    const result = classifyConcern({
      text: "I don't want to be here anymore and I've been thinking about suicide.",
    });
    expect(result.classificationLevel).toBe('safety_response_only');
    expect(result.urgency).toBe('critical');
    expect(result.escalationAction).toBe('urgent_follow_up');
    expect(result.reasoningCodes).toContain('SELF_HARM_LANGUAGE_DETECTED');
  });

  it('stops normal coaching for pregnancy-related warning signs', () => {
    const result = classifyConcern({ text: 'I am pregnant and bleeding heavily right now.' });
    expect(result.classificationLevel).toBe('safety_response_only');
  });
});

describe('classifyConcern — topic-specific restriction across multiple simultaneous concerns', () => {
  it('accumulates restricted topics from every matched category without cross-contaminating unrelated ones', () => {
    const result = classifyConcern({
      text: 'Should I stop taking my medication? Also do I have diabetes?',
    });
    // Both medication_questions (coach_review_required) and diagnosis_requests
    // (medical_evaluation_recommended) matched; the more severe one
    // (coach_review_required) drives the headline classification, but both
    // topics are recorded as restricted, not just the winning one.
    expect(result.classificationLevel).toBe('coach_review_required');
    expect(result.restrictedTopics.sort()).toEqual(['diagnosis', 'medication']);
    expect(result.concernCategories.sort()).toEqual(['diagnosis_requests', 'medication_questions']);
  });
});

describe('classifyConcern — determinism', () => {
  it('never produces chain-of-thought — only short reasoning codes', () => {
    const result = classifyConcern({ text: 'I am having chest pain.' });
    for (const code of result.reasoningCodes) {
      expect(code).toMatch(/^[A-Z_]+$/);
      expect(code.length).toBeLessThan(60);
    }
  });

  it('is a pure function — identical input always produces identical output', () => {
    const input = { text: 'Should I stop taking my medication?' };
    const a = classifyConcern(input);
    const b = classifyConcern(input);
    expect(a).toEqual(b);
  });
});
