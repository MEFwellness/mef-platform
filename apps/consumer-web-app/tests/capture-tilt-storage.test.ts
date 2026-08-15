/**
 * Proves the camera-setup values a capture stores (migration 103's
 * roll_degrees / pitch_degrees / hip_mid_y_ratio / subject_frame_height_ratio
 * / orientation_source) still write correctly now that roll and pitch are
 * derived from where gravity points rather than read straight off a raw
 * Euler angle.
 *
 * This matters beyond "the insert works": those stored values are what a
 * later re-assessment is guided to replicate, so if the numbers changed
 * meaning silently, two assessments of the same person would stop being
 * comparable. Runs against real local Supabase and real row-level
 * security, the same approach as tests/body-assessment-integration.test.ts.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { insertAssessment, insertCapture, listCaptures } from '../lib/body-assessment/data';
import { buildCaptureStoragePath } from '../lib/body-assessment/storage';
import {
  deviceTiltAngles,
  evaluateCameraTilt,
  ROLL_TOLERANCE_DEGREES,
  PITCH_TOLERANCE_DEGREES,
} from '../lib/body-assessment/cameraTilt';

const memberIds = [TEST_USERS.memberOne.id];

afterAll(async () => {
  const service = serviceRoleClient();
  for (const table of ['body_assessment_captures', 'body_assessments']) {
    await service.from(table).delete().in('member_id', memberIds);
  }
});

async function newAssessment() {
  const client = await signInAs(TEST_USERS.memberOne);
  const assessment = await insertAssessment(
    client,
    TEST_USERS.memberOne.id,
    'static_posture',
    'America/New_York',
    '2026-01-01'
  );
  expect(assessment).toBeTruthy();
  return { client, assessmentId: assessment!.id };
}

describe('camera setup values — what reaches the database', () => {
  it('stores the derived roll and pitch, not the raw sensor angles', async () => {
    const { client, assessmentId } = await newAssessment();

    // A real propped phone: leaning back 4 degrees and panned 25 degrees
    // off dead ahead. The pan is the case the old code mistook for roll.
    const beta = 86;
    const gamma = -25;
    const angles = deviceTiltAngles(beta, gamma)!;
    expect(evaluateCameraTilt(angles).ok).toBe(true);

    await insertCapture(client, {
      assessmentId,
      memberId: TEST_USERS.memberOne.id,
      captureType: 'front',
      sequenceIndex: 0,
      mediaType: 'image',
      storagePath: buildCaptureStoragePath(TEST_USERS.memberOne.id, assessmentId, 'tilt-1', 'jpg'),
      rollDegrees: angles.rollDegrees,
      pitchDegrees: angles.pitchDegrees,
      hipMidYRatio: 0.5,
      subjectFrameHeightRatio: 0.72,
      orientationSource: 'sensor',
      cameraTilt: { gamma, beta },
    });

    const [stored] = await listCaptures(client, assessmentId);
    expect(Number(stored!.roll_degrees)).toBeCloseTo(angles.rollDegrees, 6);
    expect(Number(stored!.pitch_degrees)).toBeCloseTo(angles.pitchDegrees, 6);
    expect(stored!.orientation_source).toBe('sensor');
    expect(Number(stored!.hip_mid_y_ratio)).toBeCloseTo(0.5, 6);
    expect(Number(stored!.subject_frame_height_ratio)).toBeCloseTo(0.72, 6);

    // The raw reading is still kept alongside, so a stored capture can be
    // re-derived if the geometry is ever revised again.
    expect(stored!.camera_tilt).toEqual({ gamma, beta });

    // What actually landed. A phone that is both leaning back AND panned
    // does pick up a small genuine roll from the combination, about 1.7
    // degrees here, so this is not zero and should not be: that is real
    // geometry, not an artifact. The point is the scale. The old code
    // read this same phone as 25 degrees of roll and rejected it; the
    // real figure sits comfortably inside the 3 degree tolerance.
    expect(Math.abs(Number(stored!.roll_degrees))).toBeCloseTo(1.69, 2);
    expect(Math.abs(Number(stored!.roll_degrees))).toBeLessThan(ROLL_TOLERANCE_DEGREES);
    // Likewise the lean is 3.6 rather than exactly 4, because the pan
    // tilts the axis the lean is measured about.
    expect(Number(stored!.pitch_degrees)).toBeCloseTo(-3.62, 2);
  });

  it('stores a genuinely rolled phone as its real roll rather than as 90 degrees', async () => {
    const { client, assessmentId } = await newAssessment();

    // The attitude that used to report gamma = 90 for a 2 degree problem.
    const angles = deviceTiltAngles(88, 90)!;

    await insertCapture(client, {
      assessmentId,
      memberId: TEST_USERS.memberOne.id,
      captureType: 'front',
      sequenceIndex: 0,
      mediaType: 'image',
      storagePath: buildCaptureStoragePath(TEST_USERS.memberOne.id, assessmentId, 'tilt-2', 'jpg'),
      rollDegrees: angles.rollDegrees,
      pitchDegrees: angles.pitchDegrees,
      orientationSource: 'sensor',
    });

    const [stored] = await listCaptures(client, assessmentId);
    expect(Math.abs(Number(stored!.roll_degrees))).toBeCloseTo(2, 6);
    expect(Math.abs(Number(stored!.roll_degrees))).toBeLessThan(ROLL_TOLERANCE_DEGREES);
  });

  it('still stores nothing for a manual-fallback capture, which has no real numbers', async () => {
    const { client, assessmentId } = await newAssessment();

    await insertCapture(client, {
      assessmentId,
      memberId: TEST_USERS.memberOne.id,
      captureType: 'front',
      sequenceIndex: 0,
      mediaType: 'image',
      storagePath: buildCaptureStoragePath(TEST_USERS.memberOne.id, assessmentId, 'tilt-3', 'jpg'),
      hipMidYRatio: 0.5,
      subjectFrameHeightRatio: 0.7,
      orientationSource: 'manual_fallback',
    });

    const [stored] = await listCaptures(client, assessmentId);
    expect(stored!.roll_degrees).toBeNull();
    expect(stored!.pitch_degrees).toBeNull();
    expect(stored!.orientation_source).toBe('manual_fallback');
    // The landmark-derived setup values are still recorded either way.
    expect(Number(stored!.hip_mid_y_ratio)).toBeCloseTo(0.5, 6);
  });

  it('keeps the reproducibility match tolerance in step with the live gate', async () => {
    // A re-assessment is matched against the stored setup using the SAME
    // constants the live gate enforces, so loosening the gate loosened the
    // matching automatically. Pinned here so the two cannot drift apart.
    const stored = deviceTiltAngles(86, -25)!;
    const laterAttempt = deviceTiltAngles(89, 10)!;

    expect(Math.abs(laterAttempt.rollDegrees - stored.rollDegrees)).toBeLessThanOrEqual(
      ROLL_TOLERANCE_DEGREES
    );
    expect(Math.abs(laterAttempt.pitchDegrees - stored.pitchDegrees)).toBeLessThanOrEqual(
      PITCH_TOLERANCE_DEGREES
    );
  });
});

describe('manual facing confirmation — what reaches the database', () => {
  it('stores the flag when the member confirmed their own orientation', async () => {
    const { client, assessmentId } = await newAssessment();

    await insertCapture(client, {
      assessmentId,
      memberId: TEST_USERS.memberOne.id,
      captureType: 'back',
      sequenceIndex: 0,
      mediaType: 'image',
      storagePath: buildCaptureStoragePath(TEST_USERS.memberOne.id, assessmentId, 'facing-1', 'jpg'),
      facingManuallyConfirmed: true,
    });

    const [stored] = await listCaptures(client, assessmentId);
    expect(stored!.capture_type).toBe('back');
    expect(stored!.facing_manually_confirmed).toBe(true);
  });

  it('leaves the flag unset on the normal path, where facing was detected', async () => {
    const { client, assessmentId } = await newAssessment();

    await insertCapture(client, {
      assessmentId,
      memberId: TEST_USERS.memberOne.id,
      captureType: 'back',
      sequenceIndex: 0,
      mediaType: 'image',
      storagePath: buildCaptureStoragePath(TEST_USERS.memberOne.id, assessmentId, 'facing-2', 'jpg'),
    });

    const [stored] = await listCaptures(client, assessmentId);
    // Null, not false: a row that never had the column set is
    // distinguishable from one that explicitly recorded "not confirmed".
    expect(stored!.facing_manually_confirmed).toBeNull();
  });
});
