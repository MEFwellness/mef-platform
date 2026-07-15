/**
 * Modular per-assessment-type configuration — the single place that
 * decides which capture steps a guided assessment walks a member through.
 * Adding a future custom assessment type means adding one entry here (plus
 * the type value to BodyAssessmentType in shared-types-contracts); the
 * wizard (app/assessment/new/AssessmentWizard.tsx), the camera component,
 * and the review/results pages all read this config generically and never
 * hardcode a per-type branch.
 */

import type {
  BodyAssessmentCaptureType,
  BodyAssessmentMediaType,
  BodyAssessmentType,
} from '@mef/shared-types-contracts';

export type CaptureStepConfig = {
  captureType: BodyAssessmentCaptureType;
  mediaType: BodyAssessmentMediaType;
  title: string;
  /** Short guidance lines shown one at a time before/during capture — "Stand six feet away," "Turn sideways," etc. */
  instructions: string[];
  /** Video steps only — how long to record before auto-stopping. */
  durationSeconds?: number;
  /** Single-leg-balance's movement step only — CameraCapture.tsx runs pose tracking during recording and computes a pelvic-drop screening estimate (lib/body-assessment/pelvicDropScreening.ts) from the hip-line angle over the hold. See that file's docblock for what this passive analysis does and doesn't cover relative to a fully guided trial. */
  tracksPelvicDrop?: boolean;
};

export type AssessmentTypeConfig = {
  type: BodyAssessmentType;
  label: string;
  description: string;
  estimatedMinutes: number;
  captureSteps: CaptureStepConfig[];
};

const FRONT_STEP: CaptureStepConfig = {
  captureType: 'front',
  mediaType: 'image',
  title: 'Front View',
  instructions: [
    'Stand about six feet from the camera.',
    'Face the camera directly, feet hip-width apart.',
    'Let your arms relax naturally at your sides.',
    'Hold still — we’ll capture in a moment.',
  ],
};

const LEFT_SIDE_STEP: CaptureStepConfig = {
  captureType: 'left_side',
  mediaType: 'image',
  title: 'Left Side View',
  instructions: [
    'Turn so your left side faces the camera.',
    'Look straight ahead, not at the camera.',
    'Keep your arms relaxed at your sides.',
    'Hold still — we’ll capture in a moment.',
  ],
};

const RIGHT_SIDE_STEP: CaptureStepConfig = {
  captureType: 'right_side',
  mediaType: 'image',
  title: 'Right Side View',
  instructions: [
    'Turn so your right side faces the camera.',
    'Look straight ahead, not at the camera.',
    'Keep your arms relaxed at your sides.',
    'Hold still — we’ll capture in a moment.',
  ],
};

const BACK_STEP: CaptureStepConfig = {
  captureType: 'back',
  mediaType: 'image',
  title: 'Back View',
  instructions: [
    'Turn so your back faces the camera.',
    'Feet hip-width apart, arms relaxed.',
    'Hold still — we’ll capture in a moment.',
  ],
};

const WALKING_STEP: CaptureStepConfig = {
  captureType: 'walking',
  mediaType: 'video',
  title: 'Walking Assessment',
  instructions: [
    'Step back so your full walking path is visible.',
    'Walk naturally away from the camera, then turn and walk back.',
    'Walk at your normal, everyday pace — nothing exaggerated.',
  ],
  durationSeconds: 12,
};

const BREATHING_STEP: CaptureStepConfig = {
  captureType: 'front',
  mediaType: 'video',
  title: 'Breathing Observation',
  instructions: [
    'Stand facing the camera so your chest and shoulders are visible.',
    'Breathe normally — there’s no need to change your breathing.',
    'Stay still for the full recording.',
  ],
  durationSeconds: 15,
};

const SHOULDER_MOBILITY_STEP: CaptureStepConfig = {
  captureType: 'movement',
  mediaType: 'video',
  title: 'Shoulder Mobility',
  instructions: [
    'Face the camera with your whole upper body visible.',
    'Raise both arms overhead as far as comfortable.',
    'Lower them slowly back down.',
  ],
  durationSeconds: 10,
};

const HIP_HINGE_STEP: CaptureStepConfig = {
  captureType: 'movement',
  mediaType: 'video',
  title: 'Hip Hinge',
  instructions: [
    'Turn so your side faces the camera, full body visible.',
    'Hinge forward at your hips as if reaching for something low, keeping a soft bend in the knees.',
    'Return to standing slowly.',
  ],
  durationSeconds: 10,
};

const SQUAT_STEP: CaptureStepConfig = {
  captureType: 'movement',
  mediaType: 'video',
  title: 'Squat',
  instructions: [
    'Face the camera with your whole body visible.',
    'Squat down at a comfortable depth, then stand back up.',
    'Repeat two or three times at a natural pace.',
  ],
  durationSeconds: 12,
};

const SINGLE_LEG_BALANCE_STEP: CaptureStepConfig = {
  captureType: 'movement',
  mediaType: 'video',
  title: 'Single-Leg Balance',
  instructions: [
    'Face the camera with your whole body visible.',
    'Lift one foot slightly off the ground and hold your balance.',
    'Switch to the other leg when ready.',
  ],
  durationSeconds: 20,
  tracksPelvicDrop: true,
};

const REACH_STEP: CaptureStepConfig = {
  captureType: 'movement',
  mediaType: 'video',
  title: 'Reach',
  instructions: [
    'Face the camera with your whole body visible.',
    'Reach one arm forward and up as far as comfortable.',
    'Return to your starting position and repeat with the other arm.',
  ],
  durationSeconds: 12,
};

const ROTATION_STEP: CaptureStepConfig = {
  captureType: 'movement',
  mediaType: 'video',
  title: 'Rotation',
  instructions: [
    'Face the camera with your whole body visible.',
    'Rotate your upper body gently to one side, then the other.',
    'Keep your hips facing forward as you turn.',
  ],
  durationSeconds: 12,
};

export const ASSESSMENT_TYPE_CONFIG: Record<BodyAssessmentType, AssessmentTypeConfig> = {
  static_posture: {
    type: 'static_posture',
    label: 'Static Posture',
    description: 'A four-angle standing posture assessment — front, both sides, and back.',
    estimatedMinutes: 4,
    captureSteps: [FRONT_STEP, LEFT_SIDE_STEP, RIGHT_SIDE_STEP, BACK_STEP],
  },
  walking_gait: {
    type: 'walking_gait',
    label: 'Walking Gait',
    description: 'A short walking video to observe stride, symmetry, and rhythm.',
    estimatedMinutes: 3,
    captureSteps: [WALKING_STEP],
  },
  breathing_observation: {
    type: 'breathing_observation',
    label: 'Breathing Observation',
    description: 'A brief resting video to observe natural breathing pattern.',
    estimatedMinutes: 2,
    captureSteps: [BREATHING_STEP],
  },
  shoulder_mobility: {
    type: 'shoulder_mobility',
    label: 'Shoulder Mobility',
    description: 'An overhead-reach movement to observe shoulder range of motion.',
    estimatedMinutes: 3,
    captureSteps: [FRONT_STEP, SHOULDER_MOBILITY_STEP],
  },
  hip_hinge: {
    type: 'hip_hinge',
    label: 'Hip Hinge',
    description: 'A hip-hinge movement to observe spine and hip mechanics.',
    estimatedMinutes: 3,
    captureSteps: [LEFT_SIDE_STEP, HIP_HINGE_STEP],
  },
  squat: {
    type: 'squat',
    label: 'Squat',
    description: 'A bodyweight squat to observe knee, hip, and ankle mechanics.',
    estimatedMinutes: 3,
    captureSteps: [FRONT_STEP, SQUAT_STEP],
  },
  single_leg_balance: {
    type: 'single_leg_balance',
    label: 'Single-Leg Balance',
    description: 'A balance hold on each leg to observe stability and control.',
    estimatedMinutes: 3,
    captureSteps: [FRONT_STEP, SINGLE_LEG_BALANCE_STEP],
  },
  reach: {
    type: 'reach',
    label: 'Reach',
    description: 'A forward-and-overhead reach to observe shoulder and thoracic mobility.',
    estimatedMinutes: 3,
    captureSteps: [FRONT_STEP, REACH_STEP],
  },
  rotation: {
    type: 'rotation',
    label: 'Rotation',
    description: 'A gentle trunk rotation to observe thoracic and hip mobility.',
    estimatedMinutes: 3,
    captureSteps: [FRONT_STEP, ROTATION_STEP],
  },
  custom: {
    type: 'custom',
    label: 'Custom Assessment',
    description: 'A coach-defined assessment — capture steps are configured per assignment.',
    estimatedMinutes: 5,
    captureSteps: [FRONT_STEP],
  },
};

export const ASSESSMENT_TYPE_ORDER: BodyAssessmentType[] = [
  'static_posture',
  'walking_gait',
  'breathing_observation',
  'shoulder_mobility',
  'hip_hinge',
  'squat',
  'single_leg_balance',
  'reach',
  'rotation',
];

export function getAssessmentTypeConfig(type: BodyAssessmentType): AssessmentTypeConfig {
  return ASSESSMENT_TYPE_CONFIG[type];
}
