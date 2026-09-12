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
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
const { listAssignableTemplates, REASSIGNABLE_ROW_IDS } =
  await import('@/lib/assignments/assignableCatalog');
const { assignmentNameRecord } = await import('@/lib/assignments/experienceNames');
const { groupAssessmentsByStatus } = await import('@/lib/coach-detail/assessmentStatus');
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
/** Deliberately not reassignable: this build moved nothing for it. */
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

describe('which instruments offer to be sent again', () => {
  it('is exactly the two this build was asked for', () => {
    expect([...REASSIGNABLE_ROW_IDS].sort()).toEqual(['wbsa', 'whole-body-signal']);
  });

  it('and every other template is untouched, the Body Systems Survey included', () => {
    for (const template of TEMPLATES) {
      if (template.id === 'whole-body-signal' || template.id === 'wbsa') {
        expect(template.allowsReassign, template.id).toBe(true);
      } else {
        expect(template.allowsReassign, template.id).toBe(false);
      }
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

  it('OFFERS NOTHING OF THE KIND on an instrument this build did not touch', () => {
    mount([
      assignment({
        id: 'a-bs',
        definitionId: BODY_SYSTEMS.definitionId,
        status: 'completed',
        createdAt: '2026-09-01T15:00:00.000Z',
        completedAt: '2026-09-10T15:00:00.000Z',
      }),
    ]);
    expect(toggleIn('body-systems-survey')).toBeNull();
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
