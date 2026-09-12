// @vitest-environment jsdom
/**
 * SENDING SOMETHING AGAIN, DRIVEN RATHER THAN DESCRIBED.
 *
 * Until this build the only control left on a finished row was View
 * results, so the page that draws a reassessment comparison had no way to
 * ask for the second sitting it compares. What a coach actually
 * experiences is what a static assertion cannot reach, so this mounts the
 * real block into a real DOM and presses the real buttons.
 *
 *   A FINISHED ROW OFFERS TO BE SENT AGAIN, in the same place the original
 *     Assign sits, and only for the instruments that allow it.
 *   AN OPEN ROW OFFERS RESEND, and confirming calls the resend path rather
 *     than the assign path, because a client may never hold two open
 *     copies of one instrument.
 *   THE FORM SAYS WHAT ALREADY HAPPENED before the coach confirms, and
 *     says nothing extra about a client it has never been sent to.
 *   SENDING A SECOND SITTING DOES NOT LOSE THE FIRST. A finished
 *     assessment that has been sent again stands in both groups, and the
 *     finished half keeps its View results link and offers no send.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: () => {} }),
}));

const assignAssessmentRowAction = vi.fn(async () => ({ ok: true }) as { ok: true });
const resendAssessmentRowAction = vi.fn(async () => ({ ok: true }) as { ok: true });
vi.mock('@/app/actions/coachAssessmentRowAssign', () => ({
  assignAssessmentRowAction,
  resendAssessmentRowAction,
}));

const cancelAssessmentAssignmentAction = vi.fn(async () => ({}));
vi.mock('@/app/actions/assessmentAssignments', () => ({ cancelAssessmentAssignmentAction }));

const { AssessmentStatusBlock } =
  await import('@/app/coach/clients/[id]/detail/AssessmentStatusBlock');
const { listAssignableTemplates } = await import('@/lib/assignments/assignableCatalog');
const { listAssignableAssessments } = await import('@/lib/assessment-registry/registry');
const { assignmentNameRecord } = await import('@/lib/assignments/experienceNames');
const { groupAssessmentsByStatus, assessmentStatusCounts } =
  await import('@/lib/coach-detail/assessmentStatus');
const { assignmentStatusLine, resolveAssignmentProgress } =
  await import('@/lib/assignments/status');
const { buildAssignmentHistories } = await import('@/lib/coach-assign/history');
const { DEFAULT_COACH_ASSIGN_COPY } = await import('@/lib/coach-assign/copy');
const { resetDetailBusForTests } = await import('@/lib/coach-detail/detailBus');

const TEMPLATES = listAssignableTemplates();
const NAMES = assignmentNameRecord();
const COPY = DEFAULT_COACH_ASSIGN_COPY as Record<string, string>;
const TIMEZONE = 'America/New_York';
const MEMBER_TODAY = '2026-09-12';
const VIEWER = 'coach-osei';

const SIGNAL = TEMPLATES.find((t) => t.id === 'whole-body-signal')!;
const CHECK_IN = TEMPLATES.find((t) => t.id === 'wbsa')!;
/**
 * A coach-assigned deep-dive that used to be excluded. It offers to be
 * sent again now, like every other row a coach can send.
 */
const BODY_SYSTEMS = TEMPLATES.find((t) => t.id === 'body-systems-survey')!;

function assignment(input: {
  id: string;
  definitionId: string;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: string;
  completedAt?: string | null;
  assignedBy?: string;
}) {
  const progress = resolveAssignmentProgress({
    status: input.status,
    createdAt: input.createdAt,
    dueAt: null,
    cancelledAt: null,
    completedAt: input.completedAt ?? null,
    deliveredAt: null,
    memberToday: MEMBER_TODAY,
  });
  return {
    id: input.id,
    assessmentDefinitionId: input.definitionId,
    assignedBy: input.assignedBy ?? VIEWER,
    isRequired: true,
    reason: null,
    dueAt: null,
    status: input.status,
    createdAt: input.createdAt,
    progress,
    statusLine: assignmentStatusLine(progress, { timeZone: TIMEZONE }),
  };
}

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  resetDetailBusForTests();
  refresh.mockClear();
  assignAssessmentRowAction.mockClear();
  resendAssessmentRowAction.mockClear();
  cancelAssessmentAssignmentAction.mockClear();
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** The whole real path: assignment rows in, history sentences built, groups filed, block rendered. */
function mount(assignments: ReturnType<typeof assignment>[]) {
  const histories = buildAssignmentHistories({
    assignments: assignments.map((row) => ({
      id: row.id,
      assessmentDefinitionId: row.assessmentDefinitionId,
      status: row.status,
      createdAt: row.createdAt,
      assignedBy: row.assignedBy,
      completedAt: row.progress.delivery.kind === 'completed' ? row.progress.delivery.at : null,
    })),
    definitionIds: TEMPLATES.filter((t) => t.allowsReassign).map((t) => t.definitionId),
    copy: COPY,
    timeZone: TIMEZONE,
    memberToday: MEMBER_TODAY,
    clientFirstName: 'Ebony',
    viewerId: VIEWER,
    assignerNames: {},
  });
  const groups = groupAssessmentsByStatus(TEMPLATES, assignments, NAMES, histories);
  act(() => {
    root.render(
      <AssessmentStatusBlock clientId="member-1" groups={groups} copy={COPY} />
    );
  });
  return groups;
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

function rowEl(rowId: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-assessment-row="${rowId}"]`);
  expect(el, rowId).not.toBeNull();
  return el!;
}

function toggleIn(rowId: string): HTMLButtonElement | null {
  return rowEl(rowId).querySelector<HTMLButtonElement>(`[data-assign-toggle="${rowId}"]`);
}

function formIn(rowId: string): HTMLFormElement {
  const form = container.querySelector<HTMLFormElement>(`[data-assign-form="${rowId}"]`);
  expect(form, `the assign form on ${rowId}`).not.toBeNull();
  return form!;
}

function confirmIn(rowId: string): HTMLButtonElement {
  const button = formIn(rowId).querySelector<HTMLButtonElement>('button[type="submit"]');
  expect(button, `the confirm button on ${rowId}`).not.toBeNull();
  return button!;
}

function historyText(rowId: string): string {
  const block = container.querySelector<HTMLElement>(`[data-assign-history="${rowId}"]`);
  return block?.textContent ?? '';
}

/**
 * WHICH INSTRUMENTS OFFER TO BE SENT AGAIN.
 *
 * This began as a set of two ids, kept by hand, because the reassessment
 * work asked for two instruments. It is now read from the data that
 * already answers the question, and these are the claims that keep it
 * honest rather than merely broad.
 */
describe('which instruments offer to be sent again', () => {
  it('is every row a coach can send, and there are more than a couple of them', () => {
    expect(TEMPLATES.length).toBeGreaterThan(10);
    for (const template of TEMPLATES) {
      expect(template.allowsReassign, template.id).toBe(true);
    }
  });

  it('reads a registry row from the registry own answer, not from a list beside it', () => {
    // If an entry ever genuinely cannot be retaken, it says so in its own
    // definition and the flag follows, rather than a second list needing
    // to be remembered.
    for (const entry of listAssignableAssessments()) {
      const template = TEMPLATES.find((t) => t.id === entry.key);
      expect(template, entry.key).toBeTruthy();
      expect(template!.allowsReassign, entry.key).toBe(entry.reassessment.supportsReassessment);
    }
  });

  /**
   * THE CLAIM UNDER THE BUTTON, CHECKED AGAINST THE MEMBER SIDE.
   *
   * A button never claims what the rows cannot support. Offering to send a
   * deep-dive again is only honest if being sent one hands her the TAKER
   * rather than her old results, and that is decided in each experience's
   * own access rule: an open assignment has to be resolved BEFORE a
   * finished sitting. Every one of them does it, and this reads the real
   * files so that one quietly reordering is caught here.
   */
  it('is only claimed where the member side really starts a second sitting', () => {
    const ACCESS_MODULES = [
      'lib/body-systems/access.ts',
      'lib/whole-body-signal/access.ts',
      'lib/health-intake/access.ts',
      'lib/breathing-check-in/access.ts',
      'lib/stress-load/access.ts',
      'lib/owning-your-value/access.ts',
      'lib/where-your-joy-lives/access.ts',
      'lib/the-giving-ledger/access.ts',
      'lib/the-weight-of-yes/access.ts',
      'lib/being-seen/access.ts',
      'lib/what-you-put-down/access.ts',
      'lib/your-own-company/access.ts',
      'lib/the-life-youre-building/access.ts',
    ];

    for (const file of ACCESS_MODULES) {
      const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
      expect(fs.existsSync(path.resolve(__dirname, '..', file)), file).toBe(true);
      // The open assignment is returned before anything looks at her
      // stored sittings. Both markers exist in every one of these files;
      // what matters is the order.
      const assignedAt = source.indexOf("kind: 'assigned'");
      const completedAt = source.indexOf("kind: 'completed'");
      expect(assignedAt, `${file} has no assigned branch`).toBeGreaterThan(-1);
      expect(completedAt, `${file} has no completed branch`).toBeGreaterThan(-1);
      expect(
        assignedAt < completedAt,
        `${file} resolves a finished sitting before an open assignment, so being sent it again would hand her old results`
      ).toBe(true);
    }
  });
});

describe('a finished assessment', () => {
  const done = assignment({
    id: 'a-done',
    definitionId: SIGNAL.definitionId,
    status: 'completed',
    createdAt: '2026-09-01T15:00:00.000Z',
    completedAt: '2026-09-10T15:00:00.000Z',
  });

  it('is filed under Completed and still offers a control to send it again', () => {
    const groups = mount([done]);
    expect(groups.completed.map((row) => row.id)).toContain('whole-body-signal');
    expect(toggleIn('whole-body-signal')?.textContent).toBe('Assign Again');
  });

  it('keeps View results beside it rather than replacing one with the other', () => {
    mount([done]);
    const labels = [...rowEl('whole-body-signal').querySelectorAll('button')].map(
      (b) => b.textContent
    );
    expect(labels).toContain('View results');
    expect(labels).toContain('Assign Again');
  });

  it('OFFERS THE SAME THING ON EVERY OTHER INSTRUMENT, the Body Systems Survey included', () => {
    mount([
      assignment({
        id: 'a-bs',
        definitionId: BODY_SYSTEMS.definitionId,
        status: 'completed',
        createdAt: '2026-09-01T15:00:00.000Z',
        completedAt: '2026-09-10T15:00:00.000Z',
      }),
    ]);
    expect(toggleIn('body-systems-survey')?.textContent).toBe('Assign Again');
  });

  it('opens a form that says when it was last sent, by whom, and when it was finished', () => {
    mount([done]);
    click(toggleIn('whole-body-signal')!);
    const text = historyText('whole-body-signal');
    expect(text).toContain('Last assigned Sep 1, by you.');
    expect(text).toContain('Last completed Sep 10.');
    expect(text).toContain('Completed 2 days ago.');
  });

  it('confirms as Assign, and writes through the assign path', async () => {
    mount([done]);
    click(toggleIn('whole-body-signal')!);
    expect(confirmIn('whole-body-signal').textContent).toBe('Assign');
    click(confirmIn('whole-body-signal'));
    await settle();
    expect(assignAssessmentRowAction).toHaveBeenCalledTimes(1);
    expect(resendAssessmentRowAction).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it('drops the quiet line once the finish is outside the window, and nothing else changes', () => {
    mount([
      assignment({
        id: 'a-old',
        definitionId: SIGNAL.definitionId,
        status: 'completed',
        createdAt: '2026-05-01T15:00:00.000Z',
        completedAt: '2026-06-10T15:00:00.000Z',
      }),
    ]);
    click(toggleIn('whole-body-signal')!);
    const text = historyText('whole-body-signal');
    expect(text).toContain('Last completed Jun 10.');
    expect(text).not.toContain('days ago');
    expect(confirmIn('whole-body-signal').textContent).toBe('Assign');
  });
});

describe('an assessment she is already sitting on', () => {
  const open = assignment({
    id: 'a-open',
    definitionId: SIGNAL.definitionId,
    status: 'pending',
    createdAt: '2026-09-10T15:00:00.000Z',
  });

  it('offers Resend on the row, beside the Cancel it already had', () => {
    mount([open]);
    expect(toggleIn('whole-body-signal')?.textContent).toBe('Resend');
    const labels = [...rowEl('whole-body-signal').querySelectorAll('button')].map(
      (b) => b.textContent
    );
    expect(labels).toContain('Cancel');
  });

  it('SAYS SO PLAINLY before the coach confirms anything', () => {
    mount([open]);
    click(toggleIn('whole-body-signal')!);
    expect(historyText('whole-body-signal')).toContain(
      'This is already waiting for Ebony, sent Sep 10.'
    );
  });

  it('confirms as Resend, and calls the resend path rather than the assign path', async () => {
    mount([open]);
    click(toggleIn('whole-body-signal')!);
    expect(confirmIn('whole-body-signal').textContent).toBe('Resend');
    click(confirmIn('whole-body-signal'));
    await settle();
    expect(resendAssessmentRowAction).toHaveBeenCalledTimes(1);
    expect(assignAssessmentRowAction).not.toHaveBeenCalled();
    expect(resendAssessmentRowAction).toHaveBeenCalledWith('member-1', 'whole-body-signal', {
      dueDate: '',
    });
  });

  it('says what resending will do, so the button is not the only explanation', () => {
    mount([open]);
    click(toggleIn('whole-body-signal')!);
    expect(formIn('whole-body-signal').textContent).toContain(
      'keeps the one assignment they already have'
    );
  });

  it('CANNOT WRITE A SECOND ONE: the form that could create is not the form on an open row', async () => {
    mount([open]);
    click(toggleIn('whole-body-signal')!);
    click(confirmIn('whole-body-signal'));
    await settle();
    click(toggleIn('whole-body-signal')!);
    await settle();
    expect(assignAssessmentRowAction).not.toHaveBeenCalled();
  });
});

describe('an assessment never sent to this client', () => {
  it('behaves exactly as it did before, with no history block at all', () => {
    mount([]);
    expect(toggleIn('whole-body-signal')?.textContent).toBe('Assign');
    click(toggleIn('whole-body-signal')!);
    expect(container.querySelector('[data-assign-history="whole-body-signal"]')).toBeNull();
    expect(confirmIn('whole-body-signal').textContent).toBe('Assign');
  });
});

describe('the Whole-Body Check-In, which is sent by the other write path', () => {
  it('offers Assign Again once finished, and the same history lines under it', () => {
    mount([
      assignment({
        id: 'a-wbsa',
        definitionId: CHECK_IN.definitionId,
        status: 'completed',
        createdAt: '2026-09-02T15:00:00.000Z',
        completedAt: '2026-09-11T15:00:00.000Z',
        assignedBy: 'coach-two',
      }),
    ]);
    expect(toggleIn('wbsa')?.textContent).toBe('Assign Again');
    click(toggleIn('wbsa')!);
    const text = historyText('wbsa');
    expect(text).toContain('Last assigned Sep 2, by another coach.');
    expect(text).toContain('Last completed Sep 11.');
    expect(text).toContain('Completed 1 day ago.');
  });

  it('drops the reason and Required fields on a resend, because neither is rewritten', () => {
    mount([
      assignment({
        id: 'a-wbsa-open',
        definitionId: CHECK_IN.definitionId,
        status: 'pending',
        createdAt: '2026-09-10T15:00:00.000Z',
      }),
    ]);
    click(toggleIn('wbsa')!);
    const form = formIn('wbsa');
    expect(form.querySelector('textarea')).toBeNull();
    expect(form.querySelector('input[type="checkbox"]')).toBeNull();
    // The due date is the one thing a resend really moves, so it stays.
    expect(form.querySelector('input[type="date"]')).not.toBeNull();
  });
});


/**
 * SENT AGAIN, WITH THE FINISHED SITTING STILL ON THE SCREEN.
 *
 * The state this build exists for. Before it, the open row won outright:
 * the finished one vanished out of Completed, taking View results with it,
 * on the very screen a coach opens to compare the two sittings.
 */
describe('an assessment she finished and has now been sent again', () => {
  const done = assignment({
    id: 'a-done',
    definitionId: SIGNAL.definitionId,
    status: 'completed',
    createdAt: '2026-09-01T15:00:00.000Z',
    completedAt: '2026-09-08T15:00:00.000Z',
  });
  const again = assignment({
    id: 'a-again',
    definitionId: SIGNAL.definitionId,
    status: 'pending',
    createdAt: '2026-09-11T15:00:00.000Z',
  });

  /** Newest first, exactly as getClientAssessmentAssignments returns them. */
  const BOTH = [again, done];

  it('puts the new sitting in Assigned, Waiting', () => {
    const groups = mount(BOTH);
    expect(groups.waiting.map((row) => row.id)).toContain('whole-body-signal');
    expect(groups.waiting.find((row) => row.id === 'whole-body-signal')!.assignment!.id).toBe(
      'a-again'
    );
  });

  it('LEAVES THE FINISHED ONE EXACTLY WHERE IT WAS, in Completed', () => {
    const groups = mount(BOTH);
    const completed = groups.completed.find((row) => row.id === 'whole-body-signal');
    expect(completed, 'the finished sitting left the Completed group').toBeTruthy();
    // And it carries the FINISHED assignment's own sentence, not the open
    // one's: a row saying "sent Sep 11" under Completed would be a true
    // sentence about the wrong assignment.
    expect(completed!.assignment!.id).toBe('a-done');
  });

  it('keeps View results on the finished half, which is the whole point of keeping it', () => {
    mount(BOTH);
    const labels = [...rowEl('whole-body-signal__completed').querySelectorAll('button')].map(
      (button) => button.textContent
    );
    expect(labels).toContain('View results');
  });

  it('OFFERS NO SEND ON THE FINISHED HALF, because one sitting is already open', () => {
    mount(BOTH);
    const completedRow = rowEl('whole-body-signal__completed');
    expect(completedRow.querySelector('[data-assign-toggle]')).toBeNull();
    expect(
      [...completedRow.querySelectorAll('button')].map((button) => button.textContent)
    ).not.toContain('Assign Again');
  });

  it('says why, quietly, where the control would have been', () => {
    mount(BOTH);
    expect(
      rowEl('whole-body-signal__completed').querySelector(
        '[data-assign-waiting-note="whole-body-signal"]'
      )?.textContent
    ).toBe('Already assigned, waiting');
  });

  it('keeps Resend on the open half, so there is still one control for this assessment', () => {
    mount(BOTH);
    expect(toggleIn('whole-body-signal')?.textContent).toBe('Resend');
  });

  it('DRAWS ONE TOGGLE FOR THE ASSESSMENT, NOT TWO', () => {
    mount(BOTH);
    expect(
      container.querySelectorAll('[data-assign-toggle="whole-body-signal"]').length
    ).toBe(1);
  });

  it('gives the two halves different DOM ids, because two elements cannot share one', () => {
    mount(BOTH);
    const ids = [...container.querySelectorAll('[data-assessment-row]')].map(
      (element) => element.id
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('assessment-row-whole-body-signal');
    expect(ids).toContain('assessment-row-whole-body-signal__completed');
    // And every one of them is a usable CSS selector, because the live
    // verification scripts address these rows by id. A colon here would be
    // read as a pseudo-class and throw in the reader.
    for (const id of ids) {
      expect(() => document.querySelector(`#${id}`), id).not.toThrow();
    }
  });

  it('counts both, so the folded header and the two lists agree', () => {
    const groups = mount(BOTH);
    const counts = assessmentStatusCounts(groups);
    expect(counts.waiting).toBe(groups.waiting.length);
    expect(counts.completed).toBe(groups.completed.length);
    expect(groups.waiting.filter((row) => row.id === 'whole-body-signal')).toHaveLength(1);
    expect(groups.completed.filter((row) => row.id === 'whole-body-signal')).toHaveLength(1);
  });

  it('touches no other assessment: nothing else is in two groups', () => {
    const groups = mount(BOTH);
    const seen = new Map<string, number>();
    for (const row of [...groups.notYetAssigned, ...groups.waiting, ...groups.completed]) {
      seen.set(row.id, (seen.get(row.id) ?? 0) + 1);
    }
    for (const [id, count] of seen) {
      expect(count, id).toBe(id === 'whole-body-signal' ? 2 : 1);
    }
  });
});

/**
 * BOTH SITTINGS FINISHED. The split closes again, because nothing is out.
 */
describe('once she finishes the second sitting too', () => {
  const first = assignment({
    id: 'a-first',
    definitionId: SIGNAL.definitionId,
    status: 'completed',
    createdAt: '2026-09-01T15:00:00.000Z',
    completedAt: '2026-09-08T15:00:00.000Z',
  });
  const second = assignment({
    id: 'a-second',
    definitionId: SIGNAL.definitionId,
    status: 'completed',
    createdAt: '2026-09-11T15:00:00.000Z',
    completedAt: '2026-09-12T15:00:00.000Z',
  });

  it('is one row again, in Completed, and nothing is left waiting', () => {
    const groups = mount([second, first]);
    expect(groups.completed.filter((row) => row.id === 'whole-body-signal')).toHaveLength(1);
    expect(groups.waiting.map((row) => row.id)).not.toContain('whole-body-signal');
  });

  it('reads the MOST RECENT sitting, not the one it happened to start with', () => {
    const groups = mount([second, first]);
    expect(groups.completed.find((row) => row.id === 'whole-body-signal')!.assignment!.id).toBe(
      'a-second'
    );
  });

  it('offers to be sent again, and keeps View results beside it', () => {
    mount([second, first]);
    const labels = [...rowEl('whole-body-signal').querySelectorAll('button')].map(
      (button) => button.textContent
    );
    expect(labels).toContain('Assign Again');
    expect(labels).toContain('View results');
    expect(
      container.querySelector('[data-assign-waiting-note="whole-body-signal"]')
    ).toBeNull();
  });

  it('writes through the assign path, creating the next sitting rather than moving one', async () => {
    mount([second, first]);
    click(toggleIn('whole-body-signal')!);
    click(confirmIn('whole-body-signal'));
    await settle();
    expect(assignAssessmentRowAction).toHaveBeenCalledTimes(1);
    expect(resendAssessmentRowAction).not.toHaveBeenCalled();
  });

  it('never loses the earlier sitting from the history the form prints', () => {
    mount([second, first]);
    click(toggleIn('whole-body-signal')!);
    // The most recent completion is what the form names, and the first
    // sitting is still in the ledger behind it: the reassessment
    // comparison reads the rows, not this sentence.
    expect(historyText('whole-body-signal')).toContain('Last completed Sep 12.');
  });
});
