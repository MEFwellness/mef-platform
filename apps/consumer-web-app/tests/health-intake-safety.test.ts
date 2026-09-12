/**
 * The six safety rules, at their exact edges, plus what the member and the
 * coach are each told.
 *
 * WHY EVERY BOUNDARY. A rule that fires on everything is noise a coach
 * stops reading, and a rule that fires on nothing is the failure the whole
 * module exists to prevent. So each one is tested on both sides of the
 * condition that decides it, and each one is named in the test title, so
 * the set of things this app treats as worth a clinician's attention is
 * readable without opening the source.
 */

import { describe, it, expect } from 'vitest';
import { evaluateIntakeSafety, freeTextForClassifier, hasSafetySignal } from '@/lib/health-intake/safety';
import { HLI_COPY, FORBIDDEN_DIAGNOSIS_OPENINGS } from '@/lib/health-intake/copy';
import { buildMemberSummary } from '@/lib/health-intake/memberSummary';
import { followUpLine } from '@/lib/health-intake/coachView';
import { classifyConcern } from '@/lib/safety/classifier';
import { CONCERN_CATEGORIES, getConcernCategory } from '@/lib/safety/categories';
import { SAFETY_POLICY_VERSION } from '@/lib/safety/policy';
import type { IntakeAnswers } from '@/lib/health-intake/types';

function keys(answers: IntakeAnswers): string[] {
  return evaluateIntakeSafety(answers).map((signal) => signal.ruleKey);
}

describe('rule 1: any reported bleeding', () => {
  it('fires at any frequency, which is deliberate', () => {
    expect(keys({ symptoms: ['bleeding'] })).toContain('reported_bleeding');
    expect(
      keys({ symptoms: ['bleeding'], symptom_frequency: { bleeding: 'occasionally' } })
    ).toContain('reported_bleeding');
  });

  it('does not fire when she did not report it', () => {
    expect(keys({ symptoms: ['fatigue'] })).not.toContain('reported_bleeding');
    expect(keys({})).not.toContain('reported_bleeding');
  });

  it('prints her own frequency back, and nothing about what it means', () => {
    const signal = evaluateIntakeSafety({
      symptoms: ['bleeding'],
      symptom_frequency: { bleeding: 'most_days' },
    })[0]!;
    expect(signal.coachLine).toBe('Bleeding reported, most days.');
    expect(signal.coachLine.toLowerCase()).not.toContain('cause');
  });
});

describe('rule 2: shortness of breath, most days or getting worse', () => {
  it('fires on most days', () => {
    expect(
      keys({
        symptoms: ['shortness_of_breath'],
        symptom_frequency: { shortness_of_breath: 'most_days' },
      })
    ).toContain('breathing_difficulty');
  });

  it('fires on getting worse', () => {
    expect(
      keys({
        symptoms: ['shortness_of_breath'],
        symptom_worsening: { shortness_of_breath: 'yes' },
      })
    ).toContain('breathing_difficulty');
  });

  it('does not fire on an occasional one that is not getting worse', () => {
    expect(
      keys({
        symptoms: ['shortness_of_breath'],
        symptom_frequency: { shortness_of_breath: 'occasionally' },
        symptom_worsening: { shortness_of_breath: 'no' },
      })
    ).not.toContain('breathing_difficulty');
  });
});

describe('rule 3: weight loss she did not intend', () => {
  it('fires on lost plus no', () => {
    expect(keys({ weight_change: 'lost', weight_intentional: 'no' })).toContain(
      'unintentional_weight_loss'
    );
  });

  it('fires on lost plus not sure', () => {
    expect(keys({ weight_change: 'lost', weight_intentional: 'not_sure' })).toContain(
      'unintentional_weight_loss'
    );
  });

  it('does not fire on weight she meant to lose', () => {
    expect(keys({ weight_change: 'lost', weight_intentional: 'yes' })).not.toContain(
      'unintentional_weight_loss'
    );
    expect(keys({ weight_change: 'lost', weight_intentional: 'partly' })).not.toContain(
      'unintentional_weight_loss'
    );
  });

  it('does not fire on weight gained or fluctuating', () => {
    expect(keys({ weight_change: 'gained', weight_intentional: 'no' })).not.toContain(
      'unintentional_weight_loss'
    );
    expect(keys({ weight_change: 'fluctuating', weight_intentional: 'no' })).not.toContain(
      'unintentional_weight_loss'
    );
  });
});

describe('rule 4: a fever that has not gone away', () => {
  it('fires on most days', () => {
    expect(keys({ symptoms: ['fever'], symptom_frequency: { fever: 'most_days' } })).toContain(
      'persistent_fever'
    );
  });

  it('fires at several weeks and everything longer', () => {
    for (const duration of ['several_weeks', 'several_months', 'longer']) {
      expect(keys({ symptoms: ['fever'], symptom_duration: { fever: duration } })).toContain(
        'persistent_fever'
      );
    }
  });

  it('does not fire on a recent, occasional one', () => {
    expect(
      keys({
        symptoms: ['fever'],
        symptom_frequency: { fever: 'occasionally' },
        symptom_duration: { fever: 'recently' },
      })
    ).not.toContain('persistent_fever');
  });
});

describe('rule 5: a new change in a major sense', () => {
  it('fires on vision, hearing, smell or taste when it started recently', () => {
    for (const sense of ['vision', 'hearing', 'smell', 'taste']) {
      expect(
        keys({ senses_gate: 'yes', senses_areas: [sense], senses_duration: { [sense]: 'recently' } })
      ).toContain('new_sensory_change');
    }
  });

  it('does not fire on one she has had for months', () => {
    expect(
      keys({
        senses_gate: 'yes',
        senses_areas: ['vision'],
        senses_duration: { vision: 'several_months' },
      })
    ).not.toContain('new_sensory_change');
  });

  it('does not fire on hot and cold sensitivity, which is a thing to coach around', () => {
    expect(
      keys({
        senses_gate: 'yes',
        senses_areas: ['temperature'],
        senses_duration: { temperature: 'recently' },
      })
    ).not.toContain('new_sensory_change');
  });
});

describe('rule 6: ongoing dizziness, or headaches getting worse', () => {
  it('fires on dizziness most days', () => {
    expect(
      keys({ symptoms: ['dizziness'], symptom_frequency: { dizziness: 'most_days' } })
    ).toContain('neurological_change');
  });

  it('fires on dizziness getting worse', () => {
    expect(keys({ symptoms: ['dizziness'], symptom_worsening: { dizziness: 'yes' } })).toContain(
      'neurological_change'
    );
  });

  it('fires on headaches getting worse', () => {
    expect(keys({ symptoms: ['headaches'], symptom_worsening: { headaches: 'yes' } })).toContain(
      'neurological_change'
    );
  });

  it('does not fire on occasional headaches that are not getting worse', () => {
    expect(
      keys({
        symptoms: ['headaches'],
        symptom_frequency: { headaches: 'occasionally' },
        symptom_worsening: { headaches: 'no' },
      })
    ).not.toContain('neurological_change');
  });
});

describe('a member with nothing to flag is flagged nothing', () => {
  it('fires no rule at all on an ordinary intake', () => {
    const ordinary: IntakeAnswers = {
      primary_concerns: ['energy', 'sleep'],
      stress_level: 6,
      symptoms: ['fatigue', 'sleep_difficulty'],
      symptom_frequency: { fatigue: 'often', sleep_difficulty: 'often' },
      weight_change: 'none',
    };
    expect(evaluateIntakeSafety(ordinary)).toHaveLength(0);
    expect(hasSafetySignal(ordinary)).toBe(false);
    expect(followUpLine([])).toBe('No immediate safety flag');
  });
});

describe('what the member is told, and what she is not', () => {
  it('is one calm sentence about talking to a professional', () => {
    expect(HLI_COPY.safetyBody).toBe(
      'Some symptoms are best discussed directly with a qualified healthcare professional. Consider checking in with your healthcare provider, particularly if this is new, severe, or worsening.'
    );
  });

  it('never begins with a diagnosis', () => {
    for (const opening of FORBIDDEN_DIAGNOSIS_OPENINGS) {
      expect(HLI_COPY.safetyBody.startsWith(opening)).toBe(false);
      expect(HLI_COPY.safetyTitle.startsWith(opening)).toBe(false);
    }
    expect(HLI_COPY.safetyBody.toLowerCase()).not.toContain('you have');
    expect(HLI_COPY.safetyBody.toLowerCase()).not.toContain('this means');
    expect(HLI_COPY.safetyBody.toLowerCase()).not.toContain('caused by');
    expect(HLI_COPY.safetyBody.toLowerCase()).not.toContain('likely');
  });

  it('appears once on the completion screen and names no answer of hers', () => {
    const answers: IntakeAnswers = { symptoms: ['bleeding'], primary_concerns: ['energy'] };
    const summary = buildMemberSummary(answers, { safetyTriggered: true });
    expect(summary.safety).toEqual({ title: HLI_COPY.safetyTitle, body: HLI_COPY.safetyBody });
    // It says nothing about which answer produced it.
    expect(summary.safety!.body.toLowerCase()).not.toContain('bleeding');
  });

  it('is absent entirely when no rule fired', () => {
    expect(buildMemberSummary({}, { safetyTriggered: false }).safety).toBeNull();
  });
});

describe('the escalation reuses the one pipeline, and adds to it rather than replacing it', () => {
  it('the intake category is structural only, so text can never reach it', () => {
    const category = getConcernCategory('health_intake_follow_up');
    expect(category.keywords).toEqual([]);
    expect(category.coachReviewRequired).toBe(true);
    expect(category.escalationAction).toBe('coach_review_queue');
    // Nothing a member types classifies as this.
    for (const sentence of [
      'health intake follow up',
      'I have been bleeding',
      'my knee hurts',
      'chest pain',
    ]) {
      expect(classifyConcern({ text: sentence }).concernCategories).not.toContain(
        'health_intake_follow_up'
      );
    }
  });

  it('naming it explicitly opens a coach review case', () => {
    const result = classifyConcern({
      text: 'Unexplained bleeding, reported on a health and lifestyle intake.',
      structuralCategories: ['health_intake_follow_up'],
    });
    expect(result.concernCategories).toContain('health_intake_follow_up');
    expect(result.coachReviewRequired).toBe(true);
  });

  it('a more severe keyword still wins the headline, because structural categories add', () => {
    const result = classifyConcern({
      text: 'Shortness of breath, happening most days or getting worse.',
      structuralCategories: ['health_intake_follow_up'],
    });
    expect(result.primaryCategory).toBe('chest_pain_breathing');
    expect(result.concernCategories).toContain('health_intake_follow_up');
  });

  it('leaves every existing caller behaving exactly as it did', () => {
    // No structural categories named: the classifier is the function it was.
    expect(classifyConcern({ text: 'I feel fine' }).primaryCategory).toBe('routine_wellness');
    expect(classifyConcern({ text: 'chest pain' }).primaryCategory).toBe('chest_pain_breathing');
    expect(classifyConcern({ newOrWorseningConcern: true }).primaryCategory).toBe(
      'borderline_wellness_concern'
    );
    // And the policy version is untouched, because nothing an existing
    // caller can produce has changed.
    expect(SAFETY_POLICY_VERSION).toBe('safety-policy-v1');
  });

  it('the new category is filed below the urgent ones and above the questions', () => {
    const order = CONCERN_CATEGORIES.map((category) => category.key);
    expect(order.indexOf('health_intake_follow_up')).toBeGreaterThan(
      order.indexOf('severe_worsening_pain')
    );
    expect(order.indexOf('health_intake_follow_up')).toBeLessThan(
      order.indexOf('borderline_wellness_concern')
    );
  });
});

describe('her own words still go through the keyword classifier', () => {
  it('gathers every free text box and nothing else', () => {
    const answers: IntakeAnswers = {
      concern_context: 'It started after I changed jobs',
      recent_illness: 'A chest infection in March',
      full_name: 'Ebony',
    };
    const text = freeTextForClassifier(answers);
    expect(text).toContain('changed jobs');
    expect(text).toContain('chest infection');
    expect(text).not.toContain('Ebony');
  });

  it('is empty for a member who typed nothing, so nothing is classified', () => {
    expect(freeTextForClassifier({ symptoms: ['fatigue'] })).toBe('');
  });
});
