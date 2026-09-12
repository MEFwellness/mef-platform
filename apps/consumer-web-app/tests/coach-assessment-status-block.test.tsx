// @vitest-environment jsdom
/**
 * THE ASSESSMENT STATUS BLOCK, DRIVEN RATHER THAN DESCRIBED (2026-09-08).
 *
 * Assessments and Findings used to open on its findings, with the list of
 * assessments at the very bottom of a long scroll and every unassigned
 * deep-dive drawn as a full card repeating one sentence about how nothing
 * is offered until you send it. The section now opens on three groups of
 * compact rows, and the send happens on the row.
 *
 * The parts a coach actually experiences are the parts a static assertion
 * cannot reach, so this file mounts the real component into a real DOM and
 * presses the real buttons:
 *
 *   OPENING A ROW'S FORM CLOSES THE ONE THAT WAS OPEN. Two half-filled
 *     assign forms on one list is two ways to be halfway through sending
 *     something, and it is the state a coach would notice last.
 *   THE FORM SENDS WHAT IT COLLECTED, AND ONLY WHAT THE ROW CAN HOLD. A
 *     registry questionnaire stores a reason, a Required flag and a due
 *     date. A deep-dive stores neither reason nor flag, so its form draws
 *     neither, and the server drops them either way.
 *   AN ASSIGNED ROW MOVES. The page re-renders from the server after the
 *     write, so the proof is that the same component handed the groups
 *     that write produces draws the row in Waiting and the counts change.
 *   A COMPLETED ROW GOES TO ITS RESULTS through the same bus the pinned
 *     search uses, so it opens the owning section first rather than
 *     scrolling to something that renders nothing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: () => {} }),
}));

const assignAssessmentRowAction = vi.fn(async () => ({ ok: true }) as { ok: true });
// The block imports both write paths, so the mock carries both. Sending
// again is driven in tests/coach-reassignment.test.tsx.
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
const { assignmentNameRecord } = await import('@/lib/assignments/experienceNames');
const { groupAssessmentsByStatus, assessmentStatusCounts } =
  await import('@/lib/coach-detail/assessmentStatus');
const { assignmentStatusLine, resolveAssignmentProgress } =
  await import('@/lib/assignments/status');
const { resetDetailBusForTests, useDetailSectionRequests } =
  await import('@/lib/coach-detail/detailBus');
const { WYJL_LABEL } = await import('@/lib/where-your-joy-lives/copy');

const TEMPLATES = listAssignableTemplates();
const NAMES = assignmentNameRecord();
const TIMEZONE = 'America/New_York';
const MEMBER_TODAY = '2026-09-08';

/** A row written by the real server helpers, so nothing here hand-writes a status sentence. */
function assignment(input: {
  id: string;
  definitionId: string;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: string;
  dueAt?: string | null;
  completedAt?: string | null;
}) {
  const progress = resolveAssignmentProgress({
    status: input.status,
    createdAt: input.createdAt,
    dueAt: input.dueAt ?? null,
    cancelledAt: null,
    completedAt: input.completedAt ?? null,
    deliveredAt: null,
    memberToday: MEMBER_TODAY,
  });
  return {
    id: input.id,
    assessmentDefinitionId: input.definitionId,
    isRequired: true,
    reason: null,
    dueAt: input.dueAt ?? null,
    status: input.status,
    createdAt: input.createdAt,
    progress,
    statusLine: assignmentStatusLine(progress, { timeZone: TIMEZONE }),
  };
}

const BASELINE = TEMPLATES.find((t) => t.id === 'onboarding-health-history')!;
const JOY = TEMPLATES.find((t) => t.id === 'where-your-joy-lives')!;
const WBSA = TEMPLATES.find((t) => t.id === 'wbsa')!;

const WAITING_ROW = assignment({
  id: 'a-waiting',
  definitionId: WBSA.definitionId,
  status: 'pending',
  createdAt: '2026-09-06T12:00:00.000Z',
  dueAt: '2026-09-12T00:00:00.000Z',
});
const DONE_ROW = assignment({
  id: 'a-done',
  definitionId: BASELINE.definitionId,
  status: 'completed',
  createdAt: '2026-09-01T12:00:00.000Z',
  completedAt: '2026-09-03T18:00:00.000Z',
});

const SEEDED = [WAITING_ROW, DONE_ROW];

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
  assignAssessmentRowAction.mockResolvedValue({ ok: true });
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

function mount(assignments = SEEDED) {
  const groups = groupAssessmentsByStatus(TEMPLATES, assignments, NAMES);
  act(() => {
    root.render(<AssessmentStatusBlock clientId="member-1" groups={groups} />);
  });
  return groups;
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function setValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

function groupEl(key: 'notYetAssigned' | 'waiting' | 'completed'): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-assessment-group="${key}"]`);
  expect(el, key).not.toBeNull();
  return el!;
}

function rowEl(rowId: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-assessment-row="${rowId}"]`);
  expect(el, rowId).not.toBeNull();
  return el!;
}

function assignButtonIn(rowId: string): HTMLButtonElement {
  const button = [...rowEl(rowId).querySelectorAll('button')].find(
    (b) => b.textContent === 'Assign' || b.textContent === 'Close'
  );
  expect(button, `the Assign toggle on ${rowId}`).toBeDefined();
  return button as HTMLButtonElement;
}

describe('the three groups, in order, counting what they hold', () => {
  it('renders Not Yet Assigned, then Assigned Waiting, then Completed', () => {
    mount();
    const markers = [...container.querySelectorAll<HTMLElement>('[data-assessment-group]')].map(
      (el) => el.dataset.assessmentGroup
    );
    expect(markers).toEqual(['notYetAssigned', 'waiting', 'completed']);
  });

  it('each header prints the number of rows actually under it', () => {
    const groups = mount();
    const counts = assessmentStatusCounts(groups);
    expect(groupEl('notYetAssigned').textContent).toContain(`(${counts.notYetAssigned})`);
    expect(groupEl('waiting').textContent).toContain(`(${counts.waiting})`);
    expect(groupEl('completed').textContent).toContain(`(${counts.completed})`);
    expect(groupEl('waiting').querySelectorAll('[data-assessment-row]')).toHaveLength(
      counts.waiting
    );
    expect(groupEl('completed').querySelectorAll('[data-assessment-row]')).toHaveLength(
      counts.completed
    );
    expect(groupEl('notYetAssigned').querySelectorAll('[data-assessment-row]')).toHaveLength(
      counts.notYetAssigned
    );
  });

  it('the seeded rows land in the groups their assignments put them in', () => {
    mount();
    expect(groupEl('waiting').textContent).toContain(WBSA.displayName);
    expect(groupEl('completed').textContent).toContain(BASELINE.displayName);
    expect(groupEl('notYetAssigned').textContent).toContain(WYJL_LABEL);
  });

  it('a waiting row carries the server sentence and whether it was required', () => {
    mount();
    const row = rowEl(WBSA.id);
    expect(row.textContent).toContain(WAITING_ROW.statusLine);
    expect(row.textContent).toContain('Required.');
  });

  it('a completed row carries the day it was finished, written by the server', () => {
    mount();
    expect(rowEl(BASELINE.id).textContent).toContain(DONE_ROW.statusLine);
    expect(DONE_ROW.statusLine).toContain('Completed');
  });

  it('says the not-yet-assigned context once, not once per row', () => {
    mount();
    const matches =
      (container.textContent ?? '').split('is offered to them until you send it').length - 1;
    expect(matches).toBe(1);
  });
});

describe('the inline assign form belongs to its row', () => {
  it('there is no form until she taps Assign', () => {
    mount();
    expect(container.querySelector('[data-assign-form]')).toBeNull();
  });

  it('tapping Assign opens the form under that row and nowhere else', () => {
    mount();
    click(assignButtonIn('four-doctors'));
    const forms = container.querySelectorAll('[data-assign-form]');
    expect(forms).toHaveLength(1);
    expect(rowEl('four-doctors').contains(forms[0]!)).toBe(true);
  });

  it('opening another row closes the first, so only one is ever half filled in', () => {
    mount();
    click(assignButtonIn('four-doctors'));
    setValue(
      container.querySelector<HTMLTextAreaElement>('[data-assign-form] textarea')!,
      'because of her shoulder'
    );
    click(assignButtonIn('short-haq'));
    const forms = container.querySelectorAll('[data-assign-form]');
    expect(forms).toHaveLength(1);
    expect(forms[0]!.getAttribute('data-assign-form')).toBe('short-haq');
    expect(container.textContent).not.toContain('because of her shoulder');
  });

  it('tapping the same row again closes it', () => {
    mount();
    click(assignButtonIn('four-doctors'));
    expect(container.querySelectorAll('[data-assign-form]')).toHaveLength(1);
    click(assignButtonIn('four-doctors'));
    expect(container.querySelectorAll('[data-assign-form]')).toHaveLength(0);
  });

  /**
   * The fields come from the row, never from the copy. A deep-dive is
   * written as required with no reason by its own action, so a form that
   * collected either would be collecting something the write throws away.
   */
  it('a registry questionnaire offers a reason, a Required toggle and a due date', () => {
    mount();
    click(assignButtonIn('four-doctors'));
    const form = container.querySelector('[data-assign-form]')!;
    expect(form.querySelector('textarea')).not.toBeNull();
    expect(form.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(form.querySelector('input[type="date"]')).not.toBeNull();
  });

  it('a deep-dive offers a due date only, and says why', () => {
    mount();
    click(assignButtonIn('where-your-joy-lives'));
    const form = container.querySelector('[data-assign-form]')!;
    expect(form.querySelector('textarea')).toBeNull();
    expect(form.querySelector('input[type="checkbox"]')).toBeNull();
    expect(form.querySelector('input[type="date"]')).not.toBeNull();
    expect(form.textContent).toContain('always sent as required');
  });
});

describe('sending one', () => {
  function submitOpenForm() {
    const form = container.querySelector<HTMLFormElement>('[data-assign-form]')!;
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  }

  it('sends the row id and the fields she filled in', async () => {
    mount();
    click(assignButtonIn('four-doctors'));
    setValue(
      container.querySelector<HTMLTextAreaElement>('[data-assign-form] textarea')!,
      'to open the nutrition conversation'
    );
    setValue(
      container.querySelector<HTMLInputElement>('[data-assign-form] input[type="date"]')!,
      '2026-09-20'
    );
    submitOpenForm();
    await settle();
    expect(assignAssessmentRowAction).toHaveBeenCalledWith('member-1', 'four-doctors', {
      isRequired: true,
      reason: 'to open the nutrition conversation',
      dueDate: '2026-09-20',
    });
  });

  it('sends an empty due date rather than inventing one when she leaves it blank', async () => {
    mount();
    click(assignButtonIn('four-doctors'));
    submitOpenForm();
    await settle();
    expect(assignAssessmentRowAction).toHaveBeenCalledWith('member-1', 'four-doctors', {
      isRequired: true,
      reason: '',
      dueDate: '',
    });
  });

  it('carries the Required toggle through when she turns it off', async () => {
    mount();
    click(assignButtonIn('four-doctors'));
    const checkbox = container.querySelector<HTMLInputElement>(
      '[data-assign-form] input[type="checkbox"]'
    )!;
    act(() => {
      checkbox.click();
    });
    submitOpenForm();
    await settle();
    expect((assignAssessmentRowAction.mock.calls[0] as unknown[])[2]).toMatchObject({
      isRequired: false,
    });
  });

  it('sends a deep-dive through the same one call, with no reason and no flag of its own', async () => {
    mount();
    click(assignButtonIn('where-your-joy-lives'));
    setValue(
      container.querySelector<HTMLInputElement>('[data-assign-form] input[type="date"]')!,
      '2026-09-15'
    );
    submitOpenForm();
    await settle();
    expect(assignAssessmentRowAction).toHaveBeenCalledWith('member-1', 'where-your-joy-lives', {
      isRequired: true,
      reason: '',
      dueDate: '2026-09-15',
    });
  });

  it('closes the form and asks the page for the truth again', async () => {
    mount();
    click(assignButtonIn('four-doctors'));
    submitOpenForm();
    await settle();
    expect(container.querySelector('[data-assign-form]')).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  /**
   * The move itself. The row's group is decided on the server from the
   * assignment rows, so the honest proof is that the same component handed
   * the groups THAT WRITE PRODUCES draws it in Waiting with the counts one
   * higher and one lower.
   */
  it('the row moves to Waiting and both counts change', () => {
    const before = mount();
    expect(before.notYetAssigned.some((r) => r.id === JOY.id)).toBe(true);
    expect(groupEl('waiting').textContent).not.toContain(WYJL_LABEL);

    const justSent = assignment({
      id: 'a-new',
      definitionId: JOY.definitionId,
      status: 'pending',
      createdAt: '2026-09-08T12:00:00.000Z',
      dueAt: '2026-09-15T00:00:00.000Z',
    });
    const after = mount([...SEEDED, justSent]);

    expect(after.waiting.some((r) => r.id === JOY.id)).toBe(true);
    expect(after.notYetAssigned.some((r) => r.id === JOY.id)).toBe(false);
    expect(assessmentStatusCounts(after).waiting).toBe(assessmentStatusCounts(before).waiting + 1);
    expect(assessmentStatusCounts(after).notYetAssigned).toBe(
      assessmentStatusCounts(before).notYetAssigned - 1
    );
    expect(groupEl('waiting').textContent).toContain(WYJL_LABEL);
    expect(rowEl(JOY.id).textContent).toContain(justSent.statusLine);
  });

  it('a refused write says so on the row and sends her nowhere', async () => {
    mount();
    assignAssessmentRowAction.mockResolvedValue({
      ok: false,
      error: 'That assessment cannot be sent from here.',
    } as never);
    click(assignButtonIn('four-doctors'));
    submitOpenForm();
    await settle();
    expect(container.textContent).toContain('That assessment cannot be sent from here.');
    expect(container.querySelector('[data-assign-form]')).not.toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('a completed row goes to its results', () => {
  /** A listener standing in for the section that would open, so the request is observable. */
  function SectionSpy({ onOpen }: { onOpen: (anchorId: string) => void }) {
    useDetailSectionRequests('detail-section-progress', onOpen);
    return null;
  }

  it('asks the owning section to open and scroll, rather than jumping to a folded anchor', () => {
    const opened: string[] = [];
    const groups = groupAssessmentsByStatus(TEMPLATES, SEEDED, NAMES);
    act(() => {
      root.render(
        <>
          <SectionSpy onOpen={(anchorId) => opened.push(anchorId)} />
          <AssessmentStatusBlock clientId="member-1" groups={groups} />
        </>
      );
    });
    const link = [...rowEl(BASELINE.id).querySelectorAll('button')].find(
      (b) => b.textContent === 'View results'
    );
    expect(link, 'the View results control').toBeDefined();
    click(link!);
    // The Baseline Assessment card lives in Progress and History, not in
    // this section, which is exactly why this goes through the bus.
    expect(opened).toEqual(['detail-card-baseline']);
  });

  it('a completed row with no card of its own offers no link at all', () => {
    const orphan = assignment({
      id: 'a-orphan',
      definitionId: TEMPLATES.find((t) => t.id === 'short-haq')!.definitionId,
      status: 'completed',
      createdAt: '2026-09-01T12:00:00.000Z',
      completedAt: '2026-09-02T12:00:00.000Z',
    });
    mount([orphan]);
    expect(rowEl('short-haq').textContent).toContain(orphan.statusLine);
    expect(rowEl('short-haq').textContent).not.toContain('View results');
  });
});

describe('a waiting row can still be withdrawn', () => {
  it('Cancel calls the one existing action and asks the page for the truth again', async () => {
    mount();
    const cancel = [...rowEl(WBSA.id).querySelectorAll('button')].find(
      (b) => b.textContent === 'Cancel'
    );
    expect(cancel).toBeDefined();
    click(cancel!);
    await settle();
    expect(cancelAssessmentAssignmentAction).toHaveBeenCalledWith('a-waiting');
    expect(refresh).toHaveBeenCalled();
  });
});

describe('no em dash anywhere a coach reads', () => {
  it('not in any of the three groups, and not in an open form', () => {
    mount();
    click(assignButtonIn('four-doctors'));
    expect(container.textContent).not.toContain('—');
    click(assignButtonIn('where-your-joy-lives'));
    expect(container.textContent).not.toContain('—');
  });
});
