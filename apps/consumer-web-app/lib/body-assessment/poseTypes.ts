/**
 * Minimal pose-landmark shape this app depends on — deliberately just the
 * fields @mediapipe/tasks-vision's PoseLandmarker output already has
 * (x/y normalized [0,1] to the video frame, origin top-left; visibility
 * [0,1] confidence that the point is both present and unoccluded) so
 * lib/body-assessment/poseValidation.ts never imports the mediapipe
 * package directly and stays unit-testable with plain fixture objects.
 */
export type RawPoseLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

/** BlazePose's 33-point topology, index-mapped once here so nothing else in the app hardcodes magic indices. */
export const POSE_LANDMARK_INDEX = {
  nose: 0,
  leftEyeInner: 1,
  leftEye: 2,
  leftEyeOuter: 3,
  rightEyeInner: 4,
  rightEye: 5,
  rightEyeOuter: 6,
  leftEar: 7,
  rightEar: 8,
  mouthLeft: 9,
  mouthRight: 10,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;

export type NamedPoseLandmarks = Record<keyof typeof POSE_LANDMARK_INDEX, RawPoseLandmark>;

/** Only the points every validation check below actually reads — narrower than the full 33 so callers can't accidentally rely on an unchecked one. */
export type CorePoseLandmarks = {
  nose: RawPoseLandmark;
  leftEye: RawPoseLandmark;
  rightEye: RawPoseLandmark;
  leftEar: RawPoseLandmark;
  rightEar: RawPoseLandmark;
  leftShoulder: RawPoseLandmark;
  rightShoulder: RawPoseLandmark;
  leftHip: RawPoseLandmark;
  rightHip: RawPoseLandmark;
  leftKnee: RawPoseLandmark;
  rightKnee: RawPoseLandmark;
  leftAnkle: RawPoseLandmark;
  rightAnkle: RawPoseLandmark;
};

export function toCoreLandmarks(points: RawPoseLandmark[]): CorePoseLandmarks | null {
  const idx = POSE_LANDMARK_INDEX;
  const get = (i: number): RawPoseLandmark | undefined => points[i];
  const nose = get(idx.nose);
  const leftEye = get(idx.leftEye);
  const rightEye = get(idx.rightEye);
  const leftEar = get(idx.leftEar);
  const rightEar = get(idx.rightEar);
  const leftShoulder = get(idx.leftShoulder);
  const rightShoulder = get(idx.rightShoulder);
  const leftHip = get(idx.leftHip);
  const rightHip = get(idx.rightHip);
  const leftKnee = get(idx.leftKnee);
  const rightKnee = get(idx.rightKnee);
  const leftAnkle = get(idx.leftAnkle);
  const rightAnkle = get(idx.rightAnkle);
  if (
    !nose ||
    !leftEye ||
    !rightEye ||
    !leftEar ||
    !rightEar ||
    !leftShoulder ||
    !rightShoulder ||
    !leftHip ||
    !rightHip ||
    !leftKnee ||
    !rightKnee ||
    !leftAnkle ||
    !rightAnkle
  ) {
    return null;
  }
  return {
    nose,
    leftEye,
    rightEye,
    leftEar,
    rightEar,
    leftShoulder,
    rightShoulder,
    leftHip,
    rightHip,
    leftKnee,
    rightKnee,
    leftAnkle,
    rightAnkle,
  };
}
