/**
 * The raw-value mapping, and the thing that makes it worth having.
 *
 * The audit counted roughly sixteen coach-screen spots printing a stored
 * enum straight into the page. The fix is not sixteen small edits, it is one
 * mapping file plus a failure mode: an unmapped value must break for the
 * person adding it, on their own machine, rather than leak to a coach months
 * later. That is what these tests pin.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ALL_VOCABULARIES,
  UnmappedDisplayValueError,
  displayName,
  humanizeRawValue,
  isDevelopmentLike,
  mappedValues,
} from '../lib/naming/displayNames';
import { concernCategoryLabel, CONCERN_CATEGORIES } from '../lib/safety/categories';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  setNodeEnv(ORIGINAL_NODE_ENV);
});

/**
 * `process.env` refuses a non-enumerable descriptor, so this assigns the
 * value directly and casts once rather than fighting the typing.
 */
function setNodeEnv(value: string | undefined): void {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

describe('the mapping fails loudly in development', () => {
  it('runs as development-like under vitest, so the throwing path is the one this repo exercises by default', () => {
    expect(isDevelopmentLike()).toBe(true);
  });

  it('throws on an unmapped value', () => {
    expect(() => displayName('safety_urgency', 'catastrophic')).toThrow(UnmappedDisplayValueError);
  });

  it('the error names the vocabulary, the value, and where to fix it', () => {
    try {
      displayName('coach_alert_type', 'brand_new_alert');
      throw new Error('should have thrown');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('brand_new_alert');
      expect(message).toContain('coach_alert_type');
      expect(message).toContain('lib/naming/displayNames.ts');
    }
  });

  it('does NOT throw in production, because a coach reading a humanized value beats a crashed page', () => {
    setNodeEnv('production');
    expect(displayName('safety_urgency', 'catastrophic')).toBe('Catastrophic');
  });

  it('returns a stated fallback for null, rather than an empty string or the word null', () => {
    expect(displayName('safety_urgency', null)).toBe('Not recorded');
    expect(displayName('safety_urgency', undefined, { fallback: 'Nothing yet' })).toBe('Nothing yet');
    expect(displayName('safety_urgency', '')).toBe('Not recorded');
  });
});

describe('coverage of the real stored vocabularies', () => {
  it('every vocabulary has at least one mapped value', () => {
    for (const vocabulary of ALL_VOCABULARIES) {
      expect(mappedValues(vocabulary).length, vocabulary).toBeGreaterThan(0);
    }
  });

  it('every safety urgency the type union allows is mapped', () => {
    for (const value of ['none', 'low', 'medium', 'high', 'critical']) {
      expect(() => displayName('safety_urgency', value)).not.toThrow();
    }
  });

  it('every safety classification level is mapped', () => {
    for (const value of [
      'standard_coaching',
      'coaching_with_caution',
      'medical_evaluation_recommended',
      'coach_review_required',
      'safety_response_only',
    ]) {
      expect(() => displayName('safety_classification_level', value)).not.toThrow();
    }
  });

  it('every safety review status is mapped', () => {
    for (const value of [
      'new',
      'reviewing',
      'approved_for_limited_coaching',
      'referred_out',
      'urgent_follow_up',
      'closed',
    ]) {
      expect(() => displayName('safety_review_status', value)).not.toThrow();
    }
  });

  it('every safety source feature is mapped', () => {
    for (const value of [
      'daily_checkin',
      'coach_note',
      'ai_recommendation',
      'daily_feed',
      'dynamic_coaching',
      'wellness_intelligence',
      'conversation_coach',
      'body_assessment',
      'member_wellness_event',
      'unified_assessment',
    ]) {
      expect(() => displayName('safety_source_feature', value)).not.toThrow();
    }
  });

  it('every registry domain is mapped, including the six with no coaching domain of their own', () => {
    for (const value of [
      'posture',
      'movement',
      'breathing',
      'questionnaire',
      'sleep',
      'stress',
      'nutrition',
      'wearable',
      'lab',
      'hormone',
      'digestive',
      'metabolic',
      'immune',
      'circulatory',
      'renal',
      'neurological',
      'dermatological',
    ]) {
      expect(() => displayName('registry_domain', value)).not.toThrow();
    }
  });

  it('every coach alert type is mapped', () => {
    for (const value of [
      'needs_review',
      'burnout_risk',
      'assessment_overdue',
      'no_checkin',
      'symptoms_worsening',
      'rapid_improvement',
      'plateau',
      'recurring_barriers',
      'repeated_safety_flags',
      'medical_evaluation_recommended',
      'assessment_finding_requires_attention',
    ]) {
      expect(() => displayName('coach_alert_type', value)).not.toThrow();
    }
  });

  it('no mapped name is itself a raw-looking identifier', () => {
    for (const vocabulary of ALL_VOCABULARIES) {
      for (const value of mappedValues(vocabulary)) {
        const name = displayName(vocabulary, value);
        expect(name, `${vocabulary}.${value}`).not.toMatch(/_/);
      }
    }
  });
});

describe('safety concern categories', () => {
  it('every category key resolves to its own written label, not its slug', () => {
    for (const category of CONCERN_CATEGORIES) {
      expect(concernCategoryLabel(category.key)).toBe(category.label);
      expect(concernCategoryLabel(category.key)).not.toBe(category.key);
    }
  });

  it('an unknown key is humanized rather than thrown, because a safety case must always render', () => {
    expect(concernCategoryLabel('some_retired_category')).toBe('Some retired category');
  });
});

describe('humanizeRawValue', () => {
  it('is a last resort, not a name', () => {
    expect(humanizeRawValue('self_harm_crisis')).toBe('Self harm crisis');
    expect(humanizeRawValue('coach-follow-up')).toBe('Coach follow up');
    expect(humanizeRawValue('')).toBe('Not recorded');
  });
});

describe('the sixteen leaking spots the audit found', () => {
  const ROOT = path.resolve(__dirname, '..');
  const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

  it('the safety review case screen names every stored value it shows', () => {
    const source = read('app/coach/review-queue/[id]/page.tsx');
    expect(source).toContain("displayName('safety_classification_level'");
    expect(source).toContain("displayName('safety_urgency'");
    expect(source).toContain("displayName('safety_source_feature'");
    expect(source).toContain('concernCategoryLabel(category)');
    // The raw renders are gone.
    expect(source).not.toContain('{entry.classification_level}');
    expect(source).not.toContain('{entry.urgency}');
    expect(source).not.toContain('{entry.source_feature}');
  });

  it('the review queue list no longer keeps a second copy of the status wording', () => {
    const source = read('app/coach/review-queue/page.tsx');
    expect(source).toContain("displayName('safety_review_status'");
    expect(source).not.toContain('const STATUS_LABEL');
  });

  it('the two intelligence panels name their severities and statuses', () => {
    const insights = read('app/coach/clients/[id]/IntelligencePanel.tsx');
    expect(insights).toContain("displayName('wellness_insight_severity'");
    expect(insights).toContain("displayName('wellness_insight_status'");

    const member = read('app/coach/clients/[id]/MemberIntelligencePanel.tsx');
    expect(member).toContain("displayName('coach_alert_type'");
    expect(member).toContain("displayName('coach_alert_status'");
    expect(member).toContain("displayName('recommendation_domain'");
  });

  it('the remaining panels the audit listed all read through the mapping', () => {
    expect(read('app/coach/clients/[id]/CoachWorkspacePanel.tsx')).toContain(
      "displayName('coaching_topic_source_state'"
    );
    expect(read('app/coach/clients/[id]/MovementProfilePanel.tsx')).toContain(
      "displayName('movement_profile_review_status'"
    );
    expect(read('app/coach/clients/[id]/RootMapPanel.tsx')).toContain(
      "displayName('reassessment_trigger_source'"
    );
    expect(read('app/coach/clients/[id]/entries/page.tsx')).toContain(
      "displayName('member_submission_kind'"
    );
    expect(read('app/coach/corrective-programs/[memberId]/page.tsx')).toContain(
      "displayName('posture_finding_severity'"
    );
    expect(
      read('app/coach/clients/[id]/body-assessments/[assessmentId]/RightPanel/AIAssistantSection.tsx')
    ).toContain("displayName('posture_finding_severity'");
  });

  it('the body assessment adapter no longer writes a raw enum as a member-visible label', () => {
    const source = read('lib/registry/adapters/bodyAssessment.ts');
    expect(source).toContain('findingDisplayName(domain, finding.finding_type)');
    // The raw render is gone. Matched as `label:` followed by the replace
    // call, so the explanatory comment above it does not count as a hit.
    expect(source).not.toMatch(/label:\s*finding\.finding_type\.replace/);
  });

  it('the intake adapter no longer quotes a raw status into member copy', () => {
    const source = read('lib/registry/adapters/onboarding.ts');
    expect(source).not.toContain("reported as '${status}'");
  });
});
