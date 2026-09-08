// @vitest-environment jsdom
/**
 * THE PINNED SEARCH, DRIVEN RATHER THAN DESCRIBED (2026-09-06).
 *
 * Every other assertion about this build is either pure (does
 * searchDetailPage return the right row) or static (does the page render
 * that card's id). Neither one proves the part a coach actually
 * experiences: typing, tapping a result, and arriving somewhere.
 *
 * So this file mounts the real components into a real DOM and clicks the
 * real buttons. Two journeys, both named in the brief:
 *
 *   TYPING A SECTION WORD AND TAPPING THE RESULT opens that section and
 *     scrolls to it. Opening is the part that cannot be skipped: a folded
 *     section renders nothing, and scrollIntoView on an element that is
 *     not in the document is a silent no-op, so a version that scrolled
 *     first and opened second would look correct in the source and do
 *     nothing on a phone.
 *   TYPING A QUESTIONNAIRE NAME AND TAPPING THE RESULT opens Assessments
 *     and Findings and scrolls to that questionnaire's OWN ROW in the
 *     Assessment Status block, marked so a coach can see which of the
 *     nineteen she chose. The block is the real one, with the real
 *     registry behind it. Rewritten on 2026-09-08: it used to pre-fill a
 *     search field inside an Assign panel that no longer exists.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

const { DetailPageSearch } = await import('@/app/coach/clients/[id]/detail/DetailPageSearch');
const { DetailSection } = await import('@/app/coach/clients/[id]/detail/DetailSection');
const { AssessmentStatusBlock } =
  await import('@/app/coach/clients/[id]/detail/AssessmentStatusBlock');
const { listAssignableTemplates } = await import('@/lib/assignments/assignableCatalog');
const { assignmentNameRecord } = await import('@/lib/assignments/experienceNames');
const { groupAssessmentsByStatus, assessmentRowElementId } =
  await import('@/lib/coach-detail/assessmentStatus');
const { WYJL_LABEL } = await import('@/lib/where-your-joy-lives/copy');
const { DetailDeepLink } = await import('@/app/coach/clients/[id]/detail/DetailDeepLink');
const { resetDetailBusForTests } = await import('@/lib/coach-detail/detailBus');

const TEMPLATES = listAssignableTemplates();
/** A client who has been sent nothing, so every row is in Not Yet Assigned. */
const GROUPS = groupAssessmentsByStatus(TEMPLATES, [], assignmentNameRecord());

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root;
let scrolledInto: Element[];

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // A request nobody took is deliberately held, so one case must not
  // inherit the previous one's.
  resetDetailBusForTests();
  scrolledInto = [];
  // jsdom implements no scrolling at all, so this both stands in for it
  // and records which element was actually asked for.
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolledInto.push(this);
  };
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 0) as unknown as number) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) =>
      clearTimeout(id)) as typeof cancelAnimationFrame;
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/**
 * Waits for the thing itself, not for a clock.
 *
 * The open, the mount and the scroll are one requestAnimationFrame apart,
 * and a single fixed pause is a machine-speed bet: a run with a production
 * build compiling beside it failed exactly one of these once, on timing,
 * against code that was correct. So each step polls its own condition and
 * gives up only after a generous ceiling.
 */
async function waitFor(condition: () => boolean, what = 'the condition'): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let met = false;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    try {
      met = condition();
    } catch {
      met = false;
    }
    if (met) return;
  }
  throw new Error(`Timed out waiting for ${what}`);
}

/** A few frames, for the cases that assert something did NOT happen. */
async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

/** Types into a controlled React input the way a keyboard does. */
function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function pageSearchInput(): HTMLInputElement {
  const field = container.querySelector<HTMLInputElement>('[data-detail-page-search="true"] input');
  expect(field, 'the pinned search field is on the page').not.toBeNull();
  return field!;
}

/**
 * A result row addressed by which GROUP it is in, never by its copy alone.
 *
 * "joy" legitimately matches twice: the Where Your Joy Lives CARD under
 * On this page, and the Where Your Joy Lives QUESTIONNAIRE under
 * Questionnaires. A locator that took the first text match would have
 * silently tested the wrong one of the two and still reported a pass,
 * which is exactly the mistake the 2026-09-06 note about addressing a card
 * by its accessible name is about.
 */
function pageResultLabelled(text: string): HTMLButtonElement {
  const buttons = [
    ...container.querySelectorAll<HTMLButtonElement>('[aria-label="Search results"] button'),
  ].filter((button) => !button.dataset.questionnaireResult);
  const found = buttons.find((button) => button.textContent?.includes(text));
  expect(found, `a page result mentioning "${text}"`).toBeDefined();
  return found!;
}

function questionnaireResultLabelled(text: string): HTMLButtonElement {
  const buttons = [...container.querySelectorAll<HTMLButtonElement>('[data-questionnaire-result]')];
  const found = buttons.find((button) => button.textContent?.includes(text));
  expect(found, `a questionnaire result mentioning "${text}"`).toBeDefined();
  return found!;
}

describe('typing a section word and tapping the result', () => {
  function mountPage() {
    act(() => {
      root.render(
        <>
          <DetailPageSearch assignableTemplates={TEMPLATES} />
          <DetailSection
            id="detail-section-progress"
            title="Progress and History"
            digest={{ text: 'Checked in on 5 of the last 7 days', dot: 'green' }}
          >
            <p id="detail-card-checkin-history">Check-in History lives here</p>
          </DetailSection>
        </>
      );
    });
  }

  it('shows nothing until she types', () => {
    mountPage();
    expect(container.querySelector('[aria-label="Search results"]')).toBeNull();
  });

  it('groups what it finds under On this page', () => {
    mountPage();
    typeInto(pageSearchInput(), 'progress');
    expect(container.textContent).toContain('On this page');
    expect(container.textContent).toContain('Progress and History');
  });

  it('the section is closed before the tap, and its contents are not in the document', () => {
    mountPage();
    expect(container.textContent).not.toContain('Check-in History lives here');
    expect(container.querySelector('[aria-expanded="true"]')).toBeNull();
  });

  it('the tap opens that section and its contents appear', async () => {
    mountPage();
    typeInto(pageSearchInput(), 'progress');
    click(pageResultLabelled('Progress and History'));
    await waitFor(
      () => container.textContent.includes('Check-in History lives here'),
      'the section to open'
    );
    expect(container.querySelector('[aria-expanded="true"]')).not.toBeNull();
  });

  it('and then scrolls to it, after it exists rather than before', async () => {
    mountPage();
    typeInto(pageSearchInput(), 'progress');
    click(pageResultLabelled('Progress and History'));
    await waitFor(() => scrolledInto.length === 1, 'the scroll');
    expect((scrolledInto[0] as HTMLElement).id).toBe('detail-section-progress');
  });

  it('a card result scrolls to the card, not to the top of its section', async () => {
    mountPage();
    typeInto(pageSearchInput(), 'check-in history');
    click(pageResultLabelled('Check-in History'));
    await waitFor(() => scrolledInto.length === 1, 'the scroll');
    expect(container.textContent).toContain('Check-in History lives here');
    expect((scrolledInto[0] as HTMLElement).id).toBe('detail-card-checkin-history');
  });

  it('tapping the header itself folds it back up', async () => {
    mountPage();
    typeInto(pageSearchInput(), 'progress');
    click(pageResultLabelled('Progress and History'));
    await waitFor(
      () => container.textContent.includes('Check-in History lives here'),
      'the section to open'
    );
    click(container.querySelector('button[aria-expanded="true"]')!);
    await settle();
    expect(container.textContent).not.toContain('Check-in History lives here');
  });

  it('says one honest line when nothing matches', () => {
    mountPage();
    typeInto(pageSearchInput(), 'zzzznothinghere');
    expect(container.textContent).toContain('Nothing on this page matches that.');
  });
});

describe('typing a questionnaire name and tapping the result', () => {
  function mountPage() {
    act(() => {
      root.render(
        <>
          <DetailPageSearch assignableTemplates={TEMPLATES} />
          <DetailSection
            id="detail-section-assessments"
            title="Assessments and Findings"
            digest={{ text: '19 not yet assigned', dot: 'grey' }}
          >
            <div id="detail-card-assessment-status">
              <AssessmentStatusBlock clientId="member-1" groups={GROUPS} />
            </div>
          </DetailSection>
        </>
      );
    });
  }

  function joyRow(): HTMLElement {
    const row = container.querySelector<HTMLElement>(
      '[data-assessment-row="where-your-joy-lives"]'
    );
    expect(row, "Where Your Joy Lives' own row").not.toBeNull();
    return row!;
  }

  it('offers the questionnaire under its own plain label', () => {
    mountPage();
    typeInto(pageSearchInput(), 'joy');
    expect(container.textContent).toContain('Questionnaires');
    expect(container.textContent).toContain(WYJL_LABEL);
  });

  it('the tap opens Assessments and Findings and scrolls to that row itself', async () => {
    mountPage();
    typeInto(pageSearchInput(), 'joy');
    click(questionnaireResultLabelled(WYJL_LABEL));
    await waitFor(() => scrolledInto.length === 1, 'the scroll');
    expect(container.querySelector('section[aria-label="Assessment Status"]')).not.toBeNull();
    expect((scrolledInto[0] as HTMLElement).id).toBe(
      assessmentRowElementId('where-your-joy-lives')
    );
  });

  /**
   * The block is inside a folded section, so its subscriber does not exist
   * at the instant the request is made. The bus holds the request until it
   * mounts, which is the whole reason it holds anything.
   */
  it('and marks that row, so a coach can see which of nineteen she chose', async () => {
    mountPage();
    typeInto(pageSearchInput(), 'joy');
    click(questionnaireResultLabelled(WYJL_LABEL));
    await waitFor(() => joyRow().className.includes('bg-[#F5B700]/15'), 'the row to be marked');
    const others = [...container.querySelectorAll<HTMLElement>('[data-assessment-row]')].filter(
      (row) => row.dataset.assessmentRow !== 'where-your-joy-lives'
    );
    expect(others.length).toBeGreaterThan(0);
    for (const row of others) {
      expect(row.className).not.toContain('bg-[#F5B700]/15');
    }
  });

  it('the other eighteen rows are still on screen, because the grouping is the point', async () => {
    mountPage();
    typeInto(pageSearchInput(), 'joy');
    click(questionnaireResultLabelled(WYJL_LABEL));
    await waitFor(() => scrolledInto.length === 1, 'the scroll');
    expect(container.querySelectorAll('[data-assessment-row]').length).toBe(TEMPLATES.length);
  });

  it('an area word works here too, and still lands on the row', async () => {
    mountPage();
    typeInto(pageSearchInput(), 'happiness');
    click(questionnaireResultLabelled(WYJL_LABEL));
    await waitFor(() => scrolledInto.length === 1, 'the scroll');
    expect((scrolledInto[0] as HTMLElement).id).toBe(
      assessmentRowElementId('where-your-joy-lives')
    );
  });
});

/**
 * THE DEEP LINK THAT FIRES BEFORE ANYONE IS LISTENING.
 *
 * DetailDeepLink sits ABOVE the sections in the tree, and React runs
 * effects in tree order, so its "open App Controls" request is made before
 * App Controls has added its own listener. A plain dispatch reached nobody
 * and an arriving #member-visibility landed on a folded page, which is a
 * failure with no error, no warning and nothing on screen to explain it.
 * The bus holds an unclaimed request for exactly this reason.
 */
describe('an arriving hash opens the section that holds it', () => {
  function mountPage() {
    act(() => {
      root.render(
        <>
          <DetailDeepLink />
          <DetailSection
            id="detail-section-app-controls"
            title="App Controls"
            digest={{ text: 'Water tracking on', dot: 'grey' }}
          >
            <p id="member-visibility">What her app contains</p>
          </DetailSection>
        </>
      );
    });
  }

  it('#member-visibility from the coach brief opens App Controls and scrolls to the panel', async () => {
    window.location.hash = '#member-visibility';
    mountPage();
    await waitFor(() => scrolledInto.length === 1, 'the deep link to land');
    expect(container.textContent).toContain('What her app contains');
    expect((scrolledInto[0] as HTMLElement).id).toBe('member-visibility');
  });

  it('no hash at all leaves every section folded', async () => {
    window.location.hash = '';
    mountPage();
    await settle();
    expect(container.textContent).not.toContain('What her app contains');
    expect(scrolledInto).toHaveLength(0);
  });

  it('a hash nothing on the page owns is ignored rather than guessed at', async () => {
    window.location.hash = '#not-a-real-anchor';
    mountPage();
    await settle();
    expect(container.textContent).not.toContain('What her app contains');
    expect(scrolledInto).toHaveLength(0);
  });

  it('a held request is taken once, so folding and reopening does not replay the jump', async () => {
    window.location.hash = '#member-visibility';
    mountPage();
    await waitFor(() => scrolledInto.length === 1, 'the deep link to land');
    click(container.querySelector('button[aria-expanded="true"]')!);
    await settle();
    expect(container.textContent).not.toContain('What her app contains');
    expect(scrolledInto).toHaveLength(1);
  });
});
