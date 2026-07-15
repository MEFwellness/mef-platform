/**
 * Maps MediaPipe's 33-point BlazePose topology onto this app's
 * BodyLandmarkKey model (packages/shared-types-contracts/src/
 * body-assessment.types.ts) for storage in body_landmark_sets. Only
 * includes keys that have a real, direct, or well-defined derived
 * correspondence — cervical_spine, left/right_scapula, thorax, rib_cage,
 * thoracic_spine, and lumbar_spine are deliberately OMITTED: BlazePose
 * has no landmark for any of them, and writing a fabricated position
 * would misrepresent a guess as a detection. `left_hand`/`right_hand` use
 * the index-finger MCP point as the closest available proxy (not a true
 * hand-center landmark) — documented here, not hidden. `pelvis` is
 * derived as the hip midpoint, not a direct BlazePose point. `head` uses
 * the nose, the closest single BlazePose point to "head" — not the
 * crown/apex the key's label describes.
 */

import type { BodyLandmarkKey, BodyLandmarkPoint, BodyLandmarkVisibility } from '@mef/shared-types-contracts';
import { POSE_LANDMARK_INDEX, type RawPoseLandmark } from './poseTypes';

const CONFIDENT_VISIBILITY = 0.5;
const OCCLUDED_VISIBILITY = 0.2;

function visibilityLabel(v: number): BodyLandmarkVisibility {
  if (v >= CONFIDENT_VISIBILITY) return 'visible';
  if (v >= OCCLUDED_VISIBILITY) return 'estimated';
  return 'occluded';
}

function toPoint(key: BodyLandmarkKey, raw: RawPoseLandmark): BodyLandmarkPoint {
  const visibility = raw.visibility ?? 1;
  return {
    key,
    x: raw.x,
    y: raw.y,
    ...(raw.z !== undefined ? { z: raw.z } : {}),
    confidence: visibility,
    visibility: visibilityLabel(visibility),
  };
}

export function toBodyLandmarkPoints(points: RawPoseLandmark[]): BodyLandmarkPoint[] {
  const idx = POSE_LANDMARK_INDEX;
  const get = (i: number) => points[i];
  const out: BodyLandmarkPoint[] = [];

  const direct: [BodyLandmarkKey, number][] = [
    ['left_eye', idx.leftEye],
    ['right_eye', idx.rightEye],
    ['left_ear', idx.leftEar],
    ['right_ear', idx.rightEar],
    ['left_shoulder', idx.leftShoulder],
    ['right_shoulder', idx.rightShoulder],
    ['left_elbow', idx.leftElbow],
    ['right_elbow', idx.rightElbow],
    ['left_wrist', idx.leftWrist],
    ['right_wrist', idx.rightWrist],
    ['left_hand', idx.leftIndex],
    ['right_hand', idx.rightIndex],
    ['left_hip', idx.leftHip],
    ['right_hip', idx.rightHip],
    ['left_knee', idx.leftKnee],
    ['right_knee', idx.rightKnee],
    ['left_ankle', idx.leftAnkle],
    ['right_ankle', idx.rightAnkle],
    ['left_foot', idx.leftFootIndex],
    ['right_foot', idx.rightFootIndex],
    ['head', idx.nose],
  ];

  for (const [key, i] of direct) {
    const raw = get(i);
    if (raw) out.push(toPoint(key, raw));
  }

  const leftHip = get(idx.leftHip);
  const rightHip = get(idx.rightHip);
  if (leftHip && rightHip) {
    const visibility = Math.min(leftHip.visibility ?? 1, rightHip.visibility ?? 1);
    out.push({
      key: 'pelvis',
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2,
      confidence: visibility,
      visibility: visibilityLabel(visibility),
    });
  }

  return out;
}
