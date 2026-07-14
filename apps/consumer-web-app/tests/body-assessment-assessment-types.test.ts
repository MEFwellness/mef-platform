import { describe, it, expect } from 'vitest';
import {
  ASSESSMENT_TYPE_CONFIG,
  ASSESSMENT_TYPE_ORDER,
  getAssessmentTypeConfig,
} from '../lib/body-assessment/assessmentTypes';
import {
  ALL_LANDMARK_KEYS,
  LANDMARK_CONFIG,
  landmarksByRegion,
} from '../lib/body-assessment/landmarks';
import type { BodyAssessmentType } from '@mef/shared-types-contracts';

const ALL_TYPES: BodyAssessmentType[] = [
  'static_posture',
  'walking_gait',
  'breathing_observation',
  'shoulder_mobility',
  'hip_hinge',
  'squat',
  'single_leg_balance',
  'reach',
  'rotation',
  'custom',
];

describe('ASSESSMENT_TYPE_CONFIG', () => {
  it('defines every assessment type the milestone lists, each with at least one capture step', () => {
    for (const type of ALL_TYPES) {
      const config = getAssessmentTypeConfig(type);
      expect(config).toBeTruthy();
      expect(config.captureSteps.length).toBeGreaterThan(0);
      expect(config.label.length).toBeGreaterThan(0);
      expect(config.estimatedMinutes).toBeGreaterThan(0);
    }
  });

  it('every capture step has at least one instruction line', () => {
    for (const type of ALL_TYPES) {
      for (const step of ASSESSMENT_TYPE_CONFIG[type].captureSteps) {
        expect(step.instructions.length).toBeGreaterThan(0);
      }
    }
  });

  it('video steps declare a duration; image steps do not need one', () => {
    for (const type of ALL_TYPES) {
      for (const step of ASSESSMENT_TYPE_CONFIG[type].captureSteps) {
        if (step.mediaType === 'video') {
          expect(step.durationSeconds).toBeGreaterThan(0);
        }
      }
    }
  });

  it('ASSESSMENT_TYPE_ORDER excludes the coach-defined custom type from the member-facing picker', () => {
    expect(ASSESSMENT_TYPE_ORDER).not.toContain('custom');
    expect(ASSESSMENT_TYPE_ORDER.length).toBe(ALL_TYPES.length - 1);
  });
});

describe('Body landmark model', () => {
  it('every landmark key has a label and a region', () => {
    for (const key of ALL_LANDMARK_KEYS) {
      expect(LANDMARK_CONFIG[key].label.length).toBeGreaterThan(0);
      expect(LANDMARK_CONFIG[key].region.length).toBeGreaterThan(0);
    }
  });

  it('groups every landmark into exactly one region with no loss', () => {
    const grouped = landmarksByRegion();
    const total = Object.values(grouped).reduce((sum, keys) => sum + keys.length, 0);
    expect(total).toBe(ALL_LANDMARK_KEYS.length);
  });

  it('covers the milestone-listed body regions: head, spine, shoulders/arms, trunk, hips/legs', () => {
    const grouped = landmarksByRegion();
    expect(Object.keys(grouped).sort()).toEqual(
      ['head', 'spine', 'upper_body', 'trunk', 'lower_body'].sort()
    );
    for (const keys of Object.values(grouped)) {
      expect(keys.length).toBeGreaterThan(0);
    }
  });
});
