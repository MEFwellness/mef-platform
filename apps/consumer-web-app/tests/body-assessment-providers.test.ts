import { describe, it, expect, afterEach } from 'vitest';
import {
  BODY_ASSESSMENT_PROVIDER_NAMES,
  getBodyAssessmentProvider,
  registerBodyAssessmentProvider,
  resolveConfiguredBodyAssessmentProvider,
} from '../lib/body-assessment/providers/registry';
import type {
  BodyAssessmentProvider,
  BodyAssessmentAnalysisRequest,
  BodyAssessmentAnalysisResult,
} from '../lib/body-assessment/providers/types';

describe('BODY_ASSESSMENT_PROVIDER_NAMES', () => {
  it('includes every provider family the milestone names', () => {
    expect([...BODY_ASSESSMENT_PROVIDER_NAMES].sort()).toEqual(
      [
        'openai_vision',
        'anthropic_vision',
        'google_gemini',
        'movenet',
        'mediapipe',
        'custom_model',
      ].sort()
    );
  });
});

describe('getBodyAssessmentProvider — unconfigured stubs', () => {
  it('every default provider throws a clear "not configured" error rather than fabricating output', async () => {
    for (const name of BODY_ASSESSMENT_PROVIDER_NAMES) {
      const provider = getBodyAssessmentProvider(name);
      await expect(
        provider.analyzeAssessment({
          assessmentId: 'a1',
          memberId: 'm1',
          assessmentType: 'static_posture',
          captures: [],
        })
      ).rejects.toThrow(/not configured/i);
    }
  });
});

describe('registerBodyAssessmentProvider — the provider-swap seam', () => {
  afterEach(() => {
    // Restore an unconfigured-equivalent stub for 'custom_model' so this
    // test can't leak a fake provider into another test in this same file.
    registerBodyAssessmentProvider('custom_model', {
      name: 'custom_model',
      async analyzeAssessment() {
        throw new Error('custom_model is not configured.');
      },
    });
  });

  it('business logic gets the swapped-in implementation with zero code changes elsewhere', async () => {
    const fakeResult: BodyAssessmentAnalysisResult = {
      provider: 'custom_model',
      model: 'test-model-v1',
      landmarkSets: [],
      findings: [],
    };
    const fakeProvider: BodyAssessmentProvider = {
      name: 'custom_model',
      async analyzeAssessment(_req: BodyAssessmentAnalysisRequest) {
        return fakeResult;
      },
    };

    registerBodyAssessmentProvider('custom_model', fakeProvider);
    const result = await getBodyAssessmentProvider('custom_model').analyzeAssessment({
      assessmentId: 'a1',
      memberId: 'm1',
      assessmentType: 'static_posture',
      captures: [],
    });
    expect(result).toEqual(fakeResult);
  });
});

describe('resolveConfiguredBodyAssessmentProvider', () => {
  const originalEnv = process.env.BODY_ASSESSMENT_PROVIDER;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.BODY_ASSESSMENT_PROVIDER;
    else process.env.BODY_ASSESSMENT_PROVIDER = originalEnv;
  });

  it('returns null when the env var is unset — the expected state for this milestone', () => {
    delete process.env.BODY_ASSESSMENT_PROVIDER;
    expect(resolveConfiguredBodyAssessmentProvider()).toBeNull();
  });

  it('returns null for an unrecognized provider name rather than trusting arbitrary input', () => {
    process.env.BODY_ASSESSMENT_PROVIDER = 'not_a_real_provider';
    expect(resolveConfiguredBodyAssessmentProvider()).toBeNull();
  });

  it('returns the provider name when it matches a known provider', () => {
    process.env.BODY_ASSESSMENT_PROVIDER = 'mediapipe';
    expect(resolveConfiguredBodyAssessmentProvider()).toBe('mediapipe');
  });
});
