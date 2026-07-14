/**
 * The internal body landmark model — display labels and region grouping
 * for every BodyLandmarkKey (packages/shared-types-contracts/src/
 * body-assessment.types.ts). Pure data, no detection logic: this is the
 * "capable of storing future landmarks" structure the milestone asks for,
 * used today only to render an empty/placeholder skeleton in the results
 * UI and to validate a future provider's output shape.
 */

import type { BodyLandmarkKey } from '@mef/shared-types-contracts';

export type LandmarkRegion = 'head' | 'spine' | 'upper_body' | 'trunk' | 'lower_body';

export const LANDMARK_REGION_LABEL: Record<LandmarkRegion, string> = {
  head: 'Head & Cervical',
  spine: 'Spine',
  upper_body: 'Shoulders & Arms',
  trunk: 'Trunk',
  lower_body: 'Hips & Legs',
};

type LandmarkConfig = { label: string; region: LandmarkRegion };

export const LANDMARK_CONFIG: Record<BodyLandmarkKey, LandmarkConfig> = {
  head: { label: 'Head (crown/apex)', region: 'head' },
  left_eye: { label: 'Left eye', region: 'head' },
  right_eye: { label: 'Right eye', region: 'head' },
  left_ear: { label: 'Left ear', region: 'head' },
  right_ear: { label: 'Right ear', region: 'head' },
  cervical_spine: { label: 'Cervical spine', region: 'spine' },
  left_shoulder: { label: 'Left shoulder', region: 'upper_body' },
  right_shoulder: { label: 'Right shoulder', region: 'upper_body' },
  left_scapula: { label: 'Left scapula', region: 'upper_body' },
  right_scapula: { label: 'Right scapula', region: 'upper_body' },
  thorax: { label: 'Thorax', region: 'trunk' },
  rib_cage: { label: 'Rib cage', region: 'trunk' },
  thoracic_spine: { label: 'Thoracic spine', region: 'spine' },
  lumbar_spine: { label: 'Lumbar spine', region: 'spine' },
  pelvis: { label: 'Pelvis', region: 'trunk' },
  left_hip: { label: 'Left hip', region: 'lower_body' },
  right_hip: { label: 'Right hip', region: 'lower_body' },
  left_elbow: { label: 'Left elbow', region: 'upper_body' },
  right_elbow: { label: 'Right elbow', region: 'upper_body' },
  left_wrist: { label: 'Left wrist', region: 'upper_body' },
  right_wrist: { label: 'Right wrist', region: 'upper_body' },
  left_hand: { label: 'Left hand', region: 'upper_body' },
  right_hand: { label: 'Right hand', region: 'upper_body' },
  left_knee: { label: 'Left knee', region: 'lower_body' },
  right_knee: { label: 'Right knee', region: 'lower_body' },
  left_ankle: { label: 'Left ankle', region: 'lower_body' },
  right_ankle: { label: 'Right ankle', region: 'lower_body' },
  left_foot: { label: 'Left foot', region: 'lower_body' },
  right_foot: { label: 'Right foot', region: 'lower_body' },
};

export const ALL_LANDMARK_KEYS = Object.keys(LANDMARK_CONFIG) as BodyLandmarkKey[];

export function landmarksByRegion(): Record<LandmarkRegion, BodyLandmarkKey[]> {
  const grouped = {} as Record<LandmarkRegion, BodyLandmarkKey[]>;
  for (const key of ALL_LANDMARK_KEYS) {
    const region = LANDMARK_CONFIG[key].region;
    grouped[region] = grouped[region] ?? [];
    grouped[region].push(key);
  }
  return grouped;
}
