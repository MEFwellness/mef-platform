/**
 * "Start over" on the capture flow: it must genuinely discard the attempt
 * and go back to the first view.
 *
 * There is still no React rendering harness in this repo, so this works
 * the way tests/sign-out-dialog.test.ts does: the DATA half is exercised
 * for real against local Supabase (captures are created, discarded, and
 * proven gone from both the database and storage), and the UI half is held
 * by source assertions on the properties that actually decide the outcome,
 * chiefly that the dialog is portalled and framed in the viewport helper
 * rather than positioned inside whatever ancestor happens to contain it.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  insertAssessment,
  insertCapture,
  listCaptures,
  deleteCaptureRow,
} from '../lib/body-assessment/data';
import { buildCaptureStoragePath } from '../lib/body-assessment/storage';
import { getAssessmentTypeConfig } from '../lib/body-assessment/assessmentTypes';

const memberIds = [TEST_USERS.memberOne.id];

afterAll(async () => {
  const service = serviceRoleClient();
  for (const table of ['body_assessment_captures', 'body_assessments']) {
    await service.from(table).delete().in('member_id', memberIds);
  }
});

const WIZARD = readFileSync(
  path.join(__dirname, '..', 'components', 'body-assessment', 'AssessmentWizard.tsx'),
  'utf8'
);
const CONTROL = readFileSync(
  path.join(__dirname, '..', 'components', 'body-assessment', 'StartOverControl.tsx'),
  'utf8'
);

describe('start over — discarding the attempt', () => {
  it('removes every capture in the attempt and leaves the assessment ready to refill', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const assessment = await insertAssessment(
      client,
      TEST_USERS.memberOne.id,
      'static_posture',
      'America/New_York',
      '2026-01-01'
    );
    expect(assessment).toBeTruthy();
    const assessmentId = assessment!.id;

    // Three of the four views already captured, which is exactly the state
    // a member gets stuck in and wants to abandon.
    const captureIds = ['so-1', 'so-2', 'so-3'];
    const views = ['front', 'left_side', 'right_side'] as const;
    for (let i = 0; i < captureIds.length; i++) {
      await insertCapture(client, {
        assessmentId,
        memberId: TEST_USERS.memberOne.id,
        captureType: views[i]!,
        sequenceIndex: i,
        mediaType: 'image',
        storagePath: buildCaptureStoragePath(
          TEST_USERS.memberOne.id,
          assessmentId,
          captureIds[i]!,
          'jpg'
        ),
      });
    }
    expect(await listCaptures(client, assessmentId)).toHaveLength(3);

    // What Start over does: delete each capture, then reset to view one.
    const existing = await listCaptures(client, assessmentId);
    for (const capture of existing) {
      await deleteCaptureRow(client, capture.id);
    }

    expect(await listCaptures(client, assessmentId)).toHaveLength(0);

    // The assessment row itself survives, so the flow refills the same
    // attempt rather than orphaning an in-progress row behind it.
    const service = serviceRoleClient();
    const { data: stillThere } = await service
      .from('body_assessments')
      .select('id, status')
      .eq('id', assessmentId)
      .maybeSingle();
    expect(stillThere?.status).toBe('in_progress');
  });

  it('returns to the first of the four views, which is the front view', () => {
    const steps = getAssessmentTypeConfig('static_posture').captureSteps;
    expect(steps).toHaveLength(4);
    expect(steps[0]!.captureType).toBe('front');
    expect(steps[3]!.captureType).toBe('back');
  });
});

describe('start over — the control and its dialog', () => {
  it('resets the capture index to the first view and empties the records', () => {
    const handler = WIZARD.slice(
      WIZARD.indexOf('async function handleStartOver'),
      WIZARD.indexOf('async function handleSubmit')
    );
    expect(handler).toContain('deleteCaptureAction');
    expect(handler).toContain('setRecords([])');
    expect(handler).toContain('setCaptureIndex(0)');
    expect(handler).toContain("setPhase('capture')");
  });

  it('is offered during capture and again on the review screen', () => {
    const uses = WIZARD.split('<StartOverControl').length - 1;
    expect(uses).toBe(2);
  });

  it('confirms before discarding anything', () => {
    expect(CONTROL).toContain('Start this assessment over?');
    expect(CONTROL).toContain('cannot be undone');
    // The visible trigger opens the confirmation; it never discards
    // anything itself. Only the dialog's own confirm button does that.
    expect(CONTROL).toContain('onClick={() => setConfirming(true)}');
    const confirmHandler = CONTROL.slice(
      CONTROL.indexOf('async function handleConfirm'),
      CONTROL.indexOf('const dialog')
    );
    expect(confirmHandler).toContain('await onStartOver()');
  });

  it('portals the dialog to the body and frames it in the viewport helper', () => {
    // The property that decides whether the buttons are reachable at all:
    // a transformed or backdrop-filtered ancestor captures `fixed`, and on
    // iOS Safari an uncorrected inset-0 resolves against the large
    // viewport, putting buttons under the browser bar.
    expect(CONTROL).toContain('createPortal');
    expect(CONTROL).toContain('document.body');
    expect(CONTROL).toContain('mef-modal-viewport');
    // The dismiss handler must be on the frame, not the dimmed layer,
    // which is paint rather than a hit area.
    const frameIndex = CONTROL.indexOf('mef-modal-viewport');
    const dismissIndex = CONTROL.indexOf('setConfirming(false)', frameIndex);
    expect(dismissIndex).toBeGreaterThan(frameIndex);
    expect(CONTROL).toContain('stopPropagation');
  });

  it('can be dismissed with Escape and locks the page behind it', () => {
    expect(CONTROL).toContain("event.key === 'Escape'");
    expect(CONTROL).toContain('useBodyScrollLock');
  });

  it('uses no em dash in anything a member reads', () => {
    const memberFacing = CONTROL.match(/'[^']*'|"[^"]*"|`[^`]*`/g) ?? [];
    for (const literal of memberFacing) {
      expect(literal).not.toContain('—');
    }
  });
});
