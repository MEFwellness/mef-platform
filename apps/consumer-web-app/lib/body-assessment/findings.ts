/**
 * Standardized posture/movement finding model — display config only (no
 * detection logic). Every finding_type here is one of the eleven the
 * milestone lists; `relevantAssessmentTypes` is used by the results UI to
 * decide which findings are even plausible to show for a given assessment
 * (e.g. breathing_pattern only ever appears on a breathing_observation or
 * static_posture assessment, never a walking_gait one).
 */

import type {
  BodyAssessmentType,
  FindingSeverity,
  PostureFindingType,
} from '@mef/shared-types-contracts';

type FindingTypeConfig = {
  label: string;
  description: string;
  relevantAssessmentTypes: BodyAssessmentType[];
};

export const FINDING_TYPE_CONFIG: Record<PostureFindingType, FindingTypeConfig> = {
  forward_head: {
    label: 'Forward head posture',
    description: 'The head sits forward of the shoulders relative to a neutral vertical line.',
    relevantAssessmentTypes: ['static_posture', 'breathing_observation'],
  },
  rounded_shoulders: {
    label: 'Rounded shoulders',
    description: 'The shoulders sit forward of a neutral vertical line.',
    relevantAssessmentTypes: ['static_posture', 'shoulder_mobility'],
  },
  elevated_shoulder: {
    label: 'Elevated shoulder',
    description: 'One shoulder sits noticeably higher than the other.',
    relevantAssessmentTypes: ['static_posture', 'shoulder_mobility'],
  },
  pelvic_tilt: {
    label: 'Pelvic tilt',
    description: 'The pelvis is rotated forward or backward from a neutral position.',
    relevantAssessmentTypes: ['static_posture', 'hip_hinge', 'squat'],
  },
  thoracic_kyphosis: {
    label: 'Thoracic kyphosis',
    description: 'Increased forward curvature through the upper/mid back.',
    relevantAssessmentTypes: ['static_posture', 'breathing_observation'],
  },
  lumbar_posture: {
    label: 'Lumbar posture',
    description: 'The lower back curvature sits outside a neutral range.',
    relevantAssessmentTypes: ['static_posture', 'hip_hinge'],
  },
  knee_valgus: {
    label: 'Knee valgus',
    description: 'The knee(s) drift inward relative to the hip and ankle.',
    relevantAssessmentTypes: ['squat', 'single_leg_balance', 'walking_gait'],
  },
  foot_turnout: {
    label: 'Foot turnout',
    description: 'The foot/feet point outward beyond a neutral walking or standing angle.',
    relevantAssessmentTypes: ['static_posture', 'walking_gait', 'squat'],
  },
  weight_shift: {
    label: 'Weight shift',
    description: 'Body weight favors one side more than the other.',
    relevantAssessmentTypes: ['static_posture', 'single_leg_balance', 'walking_gait'],
  },
  breathing_pattern: {
    label: 'Breathing pattern',
    description: 'Observed breathing mechanics (chest-dominant vs. diaphragmatic, rate, symmetry).',
    relevantAssessmentTypes: ['breathing_observation'],
  },
  hip_asymmetry: {
    label: 'Hip asymmetry',
    description: 'The hips sit or move asymmetrically relative to each other.',
    relevantAssessmentTypes: ['static_posture', 'hip_hinge', 'walking_gait', 'single_leg_balance'],
  },
  lateral_trunk_asymmetry: {
    label: 'Lateral trunk asymmetry (screening indicator)',
    description:
      'A composite of visible external signals (shoulder/hip height, trunk and head lateral ' +
      'offset) suggesting possible left-right asymmetry — not a spinal curvature measurement. ' +
      'Screening indicator only; requires practitioner review to interpret.',
    relevantAssessmentTypes: ['static_posture'],
  },
  lower_crossed_pattern: {
    label: 'Possible lower-crossed postural pattern',
    description:
      'A composite of visible external signals (hip position relative to ankle, knee position, ' +
      'forward trunk displacement) that may contribute to a lower-crossed-style pattern — not a ' +
      'diagnosis of lower-crossed syndrome. Screening indicator only; requires practitioner review.',
    relevantAssessmentTypes: ['static_posture'],
  },
  sagittal_trunk_posture: {
    label: 'Sagittal posture pattern (external estimate)',
    description:
      'Head/neck and trunk inclination estimated from side-view external landmarks — this pose ' +
      'model cannot separate cervical, thoracic, and lumbar curvature individually from skin-' +
      'surface landmarks alone, so this is reported as one combined external alignment estimate, ' +
      'not a spinal curvature measurement.',
    relevantAssessmentTypes: ['static_posture'],
  },
  pelvic_drop_screening: {
    label: 'Pelvic-drop screening indicator',
    description:
      'Contralateral pelvic-line change measured during a guided single-leg stance — a screening ' +
      'indicator only, not a Trendelenburg diagnosis, which requires clinical examination.',
    relevantAssessmentTypes: ['single_leg_balance'],
  },
  custom: {
    label: 'Custom finding',
    description: 'A coach-defined observation not covered by a standard finding type.',
    relevantAssessmentTypes: [],
  },
};

export const ALL_FINDING_TYPES = Object.keys(FINDING_TYPE_CONFIG) as PostureFindingType[];

/** Ordinal severity — higher is worse. 'unknown' is deliberately excluded from ordering (see comparison.ts, which treats it as "cannot compare" rather than "better/worse"). */
export const SEVERITY_RANK: Record<Exclude<FindingSeverity, 'unknown'>, number> = {
  none: 0,
  mild: 1,
  moderate: 2,
  significant: 3,
};

export const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  none: 'None observed',
  mild: 'Mild',
  moderate: 'Moderate',
  significant: 'Significant',
  unknown: 'Not yet determined',
};

/** A finding at 'significant' severity with reasonable confidence is exactly the kind of concern the existing Safety layer should see — see app/actions/body-assessment.ts's use of evaluateConcern. */
export function isConcerningFinding(severity: FindingSeverity, confidence: number): boolean {
  return severity === 'significant' && confidence >= 0.6;
}
