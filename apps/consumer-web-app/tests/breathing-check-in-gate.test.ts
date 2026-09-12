/**
 * The gate, the walk, the resume model, the migration, and every place
 * this experience had to be registered.
 *
 * THE REGISTRATION HALF IS THE POINT OF THIS FILE. A coach assigned
 * experience in this app is not one feature folder, it is a folder plus
 * eleven entries in shared lists, and every one of them is a place a build
 * can be complete and the thing still invisible: the assignable catalog, the
 * shared name map, the assign dispatcher, the pop-up key, the protected
 * pop-up kinds, the pop-up branch, the Home card, the staff redirect list,
 * the analytics surface list, the coach page's table of contents and its
 * results anchor. Each one is asserted below.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveBpcAccess } from '../lib/breathing-check-in/access';
import {
  bpcCompletionIndex,
  bpcProgressPercent,
  buildBpcSteps,
  clampBpcStepIndex,
  resumeBpcStepIndex,
} from '../lib/breathing-check-in/steps';
import { BPC_ITEMS, type BpcAnswers } from '../lib/breathing-check-in/instrument';
import { breathingCheckInPopupMessageKey } from '../lib/root-popup-messages/data';
import { PROTECTED_POPUP_KINDS } from '../lib/root-popup-messages/oneKnock';
import { listAssignableTemplates } from '../lib/assignments/assignableCatalog';
import { assignmentNameFor } from '../lib/assignments/experienceNames';
import { ASSESSMENT_RESULT_ANCHORS } from '../lib/coach-detail/assessmentStatus';
import { DETAIL_SECTIONS } from '../lib/coach-detail/sections';
import { MEMBER_ONLY_PREFIXES } from '../lib/auth/staffRouting';
import { PRODUCT_SURFACES } from '../lib/analytics/surfaces';
import {
  BPC_AREA,
  BPC_DEFAULT_DUE_IN_DAYS,
  BPC_DEFINITION_ID,
  BPC_KEY,
  BPC_LABEL,
  BPC_ROUTE,
  BPC_TABLE,
} from '../lib/breathing-check-in/constants';
import type { BpcSessionRecord } from '../lib/breathing-check-in/data';

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = path.resolve(
  ROOT,
  '../../supabase/migrations/00000000000231_breathing_pattern_check_in.sql'
);

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

const assignment = { id: 'a1', createdAt: '2026-09-01T00:00:00.000Z', reason: null, dueAt: null };
const session = { id: 's1', completedAt: '2026-09-02T00:00:00.000Z' } as BpcSessionRecord;

// ---------------------------------------------------------------------

describe('the assignment is the whole gate', () => {
  it('offers it to a member with an open assignment', () => {
    expect(
      resolveBpcAccess({
        assignmentRead: { ok: true, assignment },
        sessionRead: { ok: true, records: [] },
      })
    ).toEqual({ kind: 'assigned', assignment });
  });

  it('offers nothing to a member who was never assigned it', () => {
    expect(
      resolveBpcAccess({
        assignmentRead: { ok: true, assignment: null },
        sessionRead: { ok: true, records: [] },
      }).kind
    ).toBe('none');
  });

  it('gives a finished member her own reading back rather than turning her away', () => {
    expect(
      resolveBpcAccess({
        assignmentRead: { ok: true, assignment: null },
        sessionRead: { ok: true, records: [session] },
      })
    ).toEqual({ kind: 'completed', session });
  });

  it('FAILS SHUT when a read did not work', () => {
    expect(
      resolveBpcAccess({
        assignmentRead: { ok: false, assignment: null },
        sessionRead: { ok: true, records: [session] },
      }).kind
    ).toBe('none');
    expect(
      resolveBpcAccess({
        assignmentRead: { ok: true, assignment: null },
        sessionRead: { ok: false, records: [] },
      }).kind
    ).toBe('none');
  });
});

// ---------------------------------------------------------------------

describe('the walk', () => {
  const steps = buildBpcSteps();

  it('is sixteen questions, three pauses and one completion', () => {
    expect(steps.filter((s) => s.kind === 'question')).toHaveLength(16);
    expect(steps.filter((s) => s.kind === 'milestone')).toHaveLength(3);
    expect(steps.filter((s) => s.kind === 'completion')).toHaveLength(1);
    expect(steps).toHaveLength(20);
  });

  it('puts the pauses after questions four, eight and twelve and nowhere else', () => {
    const positions = steps
      .map((step, index) => ({ step, index }))
      .filter(({ step }) => step.kind === 'milestone')
      .map(({ index }) => {
        const before = steps[index - 1]!;
        return before.kind === 'question' ? before.questionNumber : -1;
      });
    expect(positions).toEqual([4, 8, 12]);
  });

  it('never ends on a pause: the last thing before completion is a question', () => {
    const last = steps[steps.length - 2]!;
    expect(last.kind).toBe('question');
  });

  it('numbers every question one to sixteen out of sixteen', () => {
    const numbers = steps
      .filter((s): s is Extract<typeof s, { kind: 'question' }> => s.kind === 'question')
      .map((s) => s.questionNumber);
    expect(numbers).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });
});

describe('resume', () => {
  const steps = buildBpcSteps();

  it('starts a fresh sitting on the first question', () => {
    expect(resumeBpcStepIndex(steps, {})).toBe(0);
    expect(steps[0]!.kind).toBe('question');
  });

  it('lands on the first question she has not answered', () => {
    const answers: BpcAnswers = Object.fromEntries(
      BPC_ITEMS.slice(0, 3).map((item) => [item.itemId, 'never'])
    );
    const index = resumeBpcStepIndex(steps, answers);
    const step = steps[index]!;
    expect(step.kind).toBe('question');
    expect(step.kind === 'question' && step.item.itemId).toBe(BPC_ITEMS[3]!.itemId);
  });

  /**
   * THE ONE THIS EXISTS TO PREVENT. Question four is followed by a pause,
   * so a member who answered exactly four and left would land on an
   * encouragement screen with no question on it, which reads as having
   * lost her place.
   */
  it('never resumes onto a pause, even when she stopped exactly on one', () => {
    for (const stoppedAfter of [4, 8, 12]) {
      const answers: BpcAnswers = Object.fromEntries(
        BPC_ITEMS.slice(0, stoppedAfter).map((item) => [item.itemId, 'never'])
      );
      const step = steps[resumeBpcStepIndex(steps, answers)]!;
      expect(step.kind, `stopped after ${stoppedAfter}`).toBe('question');
    }
  });

  it('lands on the completion screen when all sixteen are answered', () => {
    const answers: BpcAnswers = Object.fromEntries(
      BPC_ITEMS.map((item) => [item.itemId, 'never'])
    );
    expect(resumeBpcStepIndex(steps, answers)).toBe(bpcCompletionIndex(steps));
    expect(steps[bpcCompletionIndex(steps)]!.kind).toBe('completion');
  });

  it('skips a hole in the middle rather than carrying her past it', () => {
    // Everything except question two.
    const answers: BpcAnswers = Object.fromEntries(
      BPC_ITEMS.filter((item) => item.position !== 2).map((item) => [item.itemId, 'often'])
    );
    const step = steps[resumeBpcStepIndex(steps, answers)]!;
    expect(step.kind === 'question' && step.questionNumber).toBe(2);
  });

  it('pulls an impossible stored index back into the walk rather than rendering nothing', () => {
    expect(clampBpcStepIndex(steps, -4)).toBe(0);
    expect(clampBpcStepIndex(steps, 9999)).toBe(bpcCompletionIndex(steps));
    expect(clampBpcStepIndex(steps, 'four')).toBe(0);
    expect(clampBpcStepIndex(steps, null)).toBe(0);
  });
});

describe('the progress line counts answers, not screens', () => {
  it('is nought before she starts and a hundred when she is done', () => {
    expect(bpcProgressPercent({})).toBe(0);
    expect(
      bpcProgressPercent(Object.fromEntries(BPC_ITEMS.map((i) => [i.itemId, 'never'])))
    ).toBe(100);
  });

  it('does not move on a pause, because a pause is not an answer', () => {
    const afterFour: BpcAnswers = Object.fromEntries(
      BPC_ITEMS.slice(0, 4).map((i) => [i.itemId, 'never'])
    );
    // 4 of 16. The pause between question four and question five cannot
    // change this number, because it is computed from her answers.
    expect(bpcProgressPercent(afterFour)).toBe(25);
  });

  it('ignores a stored value the instrument does not hold', () => {
    expect(bpcProgressPercent({ chest_pain: 'constantly' })).toBe(0);
  });
});

// ---------------------------------------------------------------------

describe('every shared list it had to be registered in', () => {
  it('has its own pop-up key, scoped to the assignment, with its own prefix', () => {
    expect(breathingCheckInPopupMessageKey('abc')).toBe('breathing_check_in:abc');
    // A DISTINCT PREFIX from the other coach assigned instruments, and it
    // has to be: a member can have several open at once, and a shared
    // prefix would let one dismissal silence another's invitation.
    expect(breathingCheckInPopupMessageKey('abc')).not.toContain('health_intake');
    expect(breathingCheckInPopupMessageKey('abc')).not.toContain('whole_body_signal');
  });

  it('is a protected pop-up kind, so a coach assignment is never delayed by the offer rule', () => {
    expect(PROTECTED_POPUP_KINDS).toContain('breathing_check_in_assigned');
  });

  it('appears in the coach assignable list, under its own area, sent by its own action', () => {
    const row = listAssignableTemplates().find((t) => t.id === BPC_KEY);
    expect(row).toBeTruthy();
    expect(row!.definitionId).toBe(BPC_DEFINITION_ID);
    expect(row!.displayName).toBe(BPC_LABEL);
    expect(row!.areaLabel).toBe(BPC_AREA);
    // Null means "its own action sends it", which is the dispatcher's
    // contract for every coach assigned experience.
    expect(row!.assignKey).toBeNull();
  });

  it('is named by the shared map rather than falling back to the generic word', () => {
    expect(assignmentNameFor(BPC_DEFINITION_ID)).toBe(BPC_LABEL);
    expect(assignmentNameFor(BPC_DEFINITION_ID)).not.toBe('Assessment');
  });

  /**
   * A coach picking this from the list is only really able to send it if
   * the dispatcher knows the row id. An entry in the catalog with no entry
   * in the dispatcher is a button that refuses.
   */
  it('is wired into the assign dispatcher under the same row id the catalog gives it', () => {
    const source = read('app/actions/coachAssessmentRowAssign.ts');
    expect(source).toContain(`'${BPC_KEY}': assignBreathingCheckInAction`);
    expect(source).toContain("from './breathingCheckInCoach'");
  });

  it('has a card on the coach page, indexed in the pinned search and anchored to a real id', () => {
    const anchor = ASSESSMENT_RESULT_ANCHORS[BPC_KEY];
    expect(anchor).toBe('detail-card-breathing-check-in');

    const indexed = DETAIL_SECTIONS.flatMap((section) => section.cards).find(
      (card) => card.id === anchor
    );
    expect(indexed, 'the anchor is not in the table of contents').toBeTruthy();
    expect(indexed!.title).toBe(BPC_LABEL);

    // And the page really renders that id, so a search result cannot land
    // on nothing.
    expect(read('app/coach/clients/[id]/detail/page.tsx')).toContain(`id="${anchor}"`);
  });

  it('redirects staff off the member route', () => {
    expect(MEMBER_ONLY_PREFIXES).toContain(BPC_ROUTE);
  });

  it('is a known analytics surface, and the route it names really exists', () => {
    expect(PRODUCT_SURFACES).toContain('breathing_check_in');
    expect(fs.existsSync(path.join(ROOT, 'app/breathing-check-in/page.tsx'))).toBe(true);
  });

  it('has a pop-up branch that checks its own due-ness and falls through', () => {
    const source = read('app/actions/rootPopupMessages.ts');
    const start = source.indexOf('const breathingCheckIn = await getMyBreathingCheckIn();');
    expect(start, 'no branch in the chain').toBeGreaterThan(-1);
    const branch = source.slice(start, start + 900);
    // THE ONE RULE OF THIS CHAIN: a branch that returned a candidate the
    // outer due-check then threw away would silence everything below it.
    expect(branch).toContain('isRecurringMessageDue(messageKey)');
    expect(branch).toContain("kind: 'breathing_check_in_assigned'");
  });

  it('has a Home card that stands while the assignment is open, and is given the assignment id', () => {
    const source = read('app/dashboard/page.tsx');
    expect(source).toContain('<BreathingCheckInEntry');
    expect(source).toContain("breathingCheckIn?.status === 'pending'");
    expect(source).toContain("breathingCheckIn?.status === 'in_progress'");
    // The card carries the delivery receipt, which is why it needs the id.
    expect(source).toContain('assignmentId={breathingCheckIn.assignmentId}');
  });

  it('gives an assignment the same seven day default every other one on the ledger has', () => {
    expect(BPC_DEFAULT_DUE_IN_DAYS).toBe(7);
  });
});

// ---------------------------------------------------------------------

describe('the migration', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');

  it('uses the same fixed definition id the code does, so every environment agrees', () => {
    expect(sql).toContain(BPC_DEFINITION_ID);
    expect(sql).toContain(`'${BPC_KEY}'`);
    // The catalog row carries the MEMBER facing name and no other.
    expect(sql).toContain(`'${BPC_LABEL}'`);
    expect(sql.toLowerCase()).not.toContain('nijmegen');
  });

  it('creates the one table the code reads and writes', () => {
    expect(sql).toContain(`create table ${BPC_TABLE}`);
  });

  it('makes the assignment the gate in the database too', () => {
    // A member with no pending assignment of her own cannot write a sitting
    // at all, whatever a screen or a hand made POST says.
    expect(sql).toContain('member_insert_own_breathing_check_in');
    expect(sql).toContain("and a.status = 'pending'");
  });

  it('makes completion write once, so a finished sitting can never be rewritten', () => {
    expect(sql).toContain('member_update_own_unfinished_breathing_check_in');
    expect(sql).toContain('using (member_id = auth.uid() and completed_at is null)');
  });

  it('lets a coach read and NEVER write, because these are her answers about her own body', () => {
    expect(sql).toContain('coach_read_assigned_breathing_check_in');
    expect(sql).not.toMatch(/create policy coach_\w*write\w*_breathing/);
  });

  it('keeps one sitting per assignment, so a retake is a new row rather than an overwrite', () => {
    expect(sql).toContain('member_breathing_check_in_one_per_assignment');
  });

  it('joins the attempt ledger so migration 144 can close the assignment out', () => {
    expect(sql).toContain(`'${BPC_TABLE}'`);
    expect(sql).toContain('sync_assessment_attempt_from_breathing_check_in');
  });
});
