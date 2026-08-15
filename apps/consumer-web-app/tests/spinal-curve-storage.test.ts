/**
 * Proves the silhouette spinal curve angles (migration 160) actually land
 * on the capture row, against real local Supabase and real RLS — same
 * approach as tests/body-assessment-integration.test.ts, which explains why
 * these go through lib/body-assessment/data.ts rather than the server
 * actions (the actions use cookies() from next/headers, which throws
 * outside a request scope).
 *
 * The two guarantees that matter here:
 *   - a side view with a good outline stores both angles, both
 *     confidences, and the mask-quality trail,
 *   - a capture with no side view stores nothing new and is otherwise
 *     completely unaffected, which is what makes this migration additive
 *     rather than a change to how captures work.
 */
import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import sharp from 'sharp';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { insertAssessment, insertCapture, listCaptures } from '../lib/body-assessment/data';
import { buildCaptureStoragePath } from '../lib/body-assessment/storage';
import {
  measureSpinalCurve,
  type SegmentationMask,
  type SpinalCurveAnchors,
} from '../lib/body-assessment/spinalCurve';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'spinal-curve');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const FIXTURE_META = require(path.join(FIXTURE_DIR, 'anchors.json')) as {
  anchors: SpinalCurveAnchors;
};

async function loadMask(name: string): Promise<SegmentationMask> {
  const { data, info } = await sharp(path.join(FIXTURE_DIR, `${name}.png`))
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

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

describe('spinal curve measurement — what reaches the database', () => {
  it('stores both angles, both confidences, and the quality trail for a readable side view', async () => {
    const { client, assessmentId } = await newAssessment();
    const measured = measureSpinalCurve(await loadMask('upright'), FIXTURE_META.anchors);
    expect(measured.thoracicAngleDegrees).not.toBeNull();

    await insertCapture(client, {
      assessmentId,
      memberId: TEST_USERS.memberOne.id,
      captureType: 'left_side',
      sequenceIndex: 0,
      mediaType: 'image',
      storagePath: buildCaptureStoragePath(TEST_USERS.memberOne.id, assessmentId, 'curve-1', 'jpg'),
      thoracicAngleDegrees: measured.thoracicAngleDegrees,
      thoracicAngleConfidence: measured.thoracicConfidence,
      lumbarAngleDegrees: measured.lumbarAngleDegrees,
      lumbarAngleConfidence: measured.lumbarConfidence,
      spinalCurveQuality: {
        ...measured.maskQuality!,
        methodVersion: measured.methodVersion,
        rejectionReason: measured.rejectionReason,
      },
    });

    const [stored] = await listCaptures(client, assessmentId);
    expect(Number(stored!.thoracic_angle_degrees)).toBe(measured.thoracicAngleDegrees);
    expect(Number(stored!.lumbar_angle_degrees)).toBe(measured.lumbarAngleDegrees);
    expect(Number(stored!.thoracic_angle_confidence)).toBe(measured.thoracicConfidence);
    expect(Number(stored!.lumbar_angle_confidence)).toBe(measured.lumbarConfidence);
    expect(stored!.spinal_curve_quality!.methodVersion).toBe(measured.methodVersion);
    expect(stored!.spinal_curve_quality!.backSide).toBe('left');
    expect(stored!.spinal_curve_quality!.rejectionReason).toBeNull();
  });

  it('stores no angle but keeps the reason when the outline was not clear enough', async () => {
    const { client, assessmentId } = await newAssessment();
    const measured = measureSpinalCurve(await loadMask('loose-clothing'), FIXTURE_META.anchors);
    expect(measured.thoracicAngleDegrees).toBeNull();

    await insertCapture(client, {
      assessmentId,
      memberId: TEST_USERS.memberOne.id,
      captureType: 'right_side',
      sequenceIndex: 0,
      mediaType: 'image',
      storagePath: buildCaptureStoragePath(TEST_USERS.memberOne.id, assessmentId, 'curve-2', 'jpg'),
      // Exactly what the capture screen sends in this case: the angles are
      // withheld, the quality trail still goes.
      spinalCurveQuality: {
        ...measured.maskQuality!,
        methodVersion: measured.methodVersion,
        rejectionReason: measured.rejectionReason,
      },
    });

    const [stored] = await listCaptures(client, assessmentId);
    expect(stored!.thoracic_angle_degrees).toBeNull();
    expect(stored!.lumbar_angle_degrees).toBeNull();
    expect(stored!.spinal_curve_quality!.rejectionReason).toBeTruthy();
    expect(stored!.spinal_curve_quality!.edgeRoughnessPx).toBeGreaterThan(4);
  });

  it('stores nothing new, and breaks nothing, for a capture with no side view', async () => {
    const { client, assessmentId } = await newAssessment();

    const front = await insertCapture(client, {
      assessmentId,
      memberId: TEST_USERS.memberOne.id,
      captureType: 'front',
      sequenceIndex: 0,
      mediaType: 'image',
      storagePath: buildCaptureStoragePath(TEST_USERS.memberOne.id, assessmentId, 'curve-3', 'jpg'),
      width: 720,
      height: 1280,
    });
    expect(front).toBeTruthy();

    const [stored] = await listCaptures(client, assessmentId);
    expect(stored!.thoracic_angle_degrees).toBeNull();
    expect(stored!.thoracic_angle_confidence).toBeNull();
    expect(stored!.lumbar_angle_degrees).toBeNull();
    expect(stored!.lumbar_angle_confidence).toBeNull();
    expect(stored!.spinal_curve_quality).toBeNull();
    // Everything a capture already recorded still records.
    expect(stored!.capture_type).toBe('front');
    expect(stored!.width).toBe(720);
    expect(stored!.height).toBe(1280);
    expect(stored!.storage_bucket).toBe('body-assessment-media');
  });
});
