// @vitest-environment jsdom

/**
 * The Health Appraisal as a member walks it, driven through the real
 * component: the intro, the definitions that reopen from every question
 * screen, the Part and Section header and "Part X of 10" across all ten
 * Parts, Continue and Back, changing an answer, the section beat, the
 * Dysglycemia-L intro, resume position, the body map and the completion.
 *
 * The approved wording is quoted here a second time, so a reworded constant
 * in lib/haq/copy.ts fails rather than shipping.
 *
 * What the database does with an answer, a mark or a completion is proved
 * against the real database in tests/haq-member-integration.test.ts. Here
 * the saves are the requests the screen sends.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const pushed: string[] = [];
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: () => {},
    back: () => {},
    push: (href: string) => {
      pushed.push(href);
    },
  }),
}));

const completeHaqAction = vi.fn(async () => ({ ok: true as const }));
vi.mock('@/app/actions/haq', () => ({
  beginHaqAction: async () => {},
  completeHaqAction: (...args: unknown[]) =>
    (completeHaqAction as unknown as (...a: unknown[]) => Promise<{ ok: true }>)(...args),
}));

// React 18 in this test runner cannot render a Server Action as a form's
// action. The real form is covered by every other take flow; here it is the
// button she presses.
vi.mock('@/components/assessments/BeginAssessmentForm', () => ({
  BeginAssessmentForm: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

const { HaqExperience } = await import('../components/haq/HaqExperience');
const {
  buildHaqScreens,
  haqBodyMapIndex,
  haqProgressPercent,
  resumeHaqScreenIndex,
  sanitizeHaqAnswers,
} = await import('../lib/haq/walk');
const { HAQ_QUESTIONS, HAQ_SECTIONS, HAQ_RESPONSE_OPTIONS } = await import('../lib/haq/questionBank');
const copy = await import('../lib/haq/copy');
const { haqBodyRegions, findHaqBodyRegion, HAQ_BODY_ISSUE_TYPES } = await import('../lib/haq/bodyMap');
const { SECTION_TRANSITION_MS } = await import('../components/questionnaire/SectionTransition');

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// ---------------------------------------------------------------------
// The approved wording, a second copy.
// ---------------------------------------------------------------------

const APPROVED_FRAMING =
  'Think about how you have felt over the last four months. Choose the response that best describes how often you have experienced each symptom.';
const APPROVED_DEFINITIONS = [
  'NEVER OR RARELY. You do not normally experience this, or it happens very rarely.',
  'SOMETIMES. It comes and goes occasionally.',
  'OFTEN. You experience it regularly or several times per week.',
  'VERY OFTEN. You experience it very frequently, approximately four or more times per week, daily, or as part of a regular recurring pattern.',
];
const APPROVED_BODY_MAP =
  'Use the body map to show any areas where you currently experience pain, swelling, discomfort, or noticeable changes in skin color or texture.';
const APPROVED_COMPLETION = 'Health Appraisal complete. Thank you for taking the time.';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// ---------------------------------------------------------------------
// Harness.
// ---------------------------------------------------------------------

type Sent = { url: string; body: Record<string, unknown> };
const sent: Sent[] = [];
let nextMarkId = 0;

function installFetch() {
  sent.length = 0;
  Object.defineProperty(globalThis, 'fetch', {
    writable: true,
    configurable: true,
    value: async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      sent.push({ url, body });
      if (url === '/api/haq/body-map' && body.action === 'add') {
        nextMarkId += 1;
        return {
          ok: true,
          json: async () => ({
            ok: true,
            mark: { id: `mark-${nextMarkId}`, location: body.location, side: body.side, issueType: body.issueType },
          }),
        };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });
}

function setReducedMotion(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

let root: Root;
let container: HTMLDivElement;
const screens = buildHaqScreens();

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, 'scrollTo', { writable: true, configurable: true, value: vi.fn() });
  setReducedMotion(true);
  installFetch();
  pushed.length = 0;
  completeHaqAction.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

type Answers = Record<string, 'never_or_rarely' | 'sometimes' | 'often' | 'very_often' | 'no' | 'yes'>;

function answersThrough(screenIndex: number): Answers {
  const out: Answers = {};
  for (const screen of screens.slice(0, screenIndex)) {
    for (const question of screen.questions) out[question.key] = HAQ_RESPONSE_OPTIONS[question.responseType][0]!.value;
  }
  return out;
}

function mount(props: {
  status: 'pending' | 'in_progress' | 'completed';
  answers?: Answers;
  screenIndex?: number;
  marks?: { id: string; location: string; side: 'front' | 'back'; issueType: 'pain' | 'swelling' | 'discomfort' | 'skin_change' }[];
}) {
  act(() => {
    root.render(
      <HaqExperience
        status={props.status}
        initialAnswers={props.answers ?? {}}
        initialMarks={props.marks ?? []}
        initialScreenIndex={props.screenIndex ?? 0}
      />
    );
  });
}

const text = () => container.textContent ?? '';
const bodyText = () => document.body.textContent ?? '';

function buttonByText(label: string, scope: ParentNode = container): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
  expect(found, `no "${label}" button`).toBeTruthy();
  return found as HTMLButtonElement;
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function questionBlocks(): HTMLLIElement[] {
  return Array.from(container.querySelectorAll('ol > li'));
}

async function answerScreen(optionIndex = 0) {
  for (const block of questionBlocks()) {
    const options = block.querySelectorAll('button[role="radio"]');
    await click(options[optionIndex]!);
  }
}

// ---------------------------------------------------------------------
// The walk, as arithmetic.
// ---------------------------------------------------------------------

describe('the walk: every question once, two or three a screen, never across a section', () => {
  it('covers all 260 questions exactly once, in order', () => {
    const keys = screens.flatMap((screen) => screen.questions.map((q) => q.key));
    expect(keys).toEqual(HAQ_QUESTIONS.map((q) => q.key));
    expect(new Set(keys).size).toBe(260);
  });

  it('keeps every screen inside one section and at two or three questions', () => {
    for (const screen of screens) {
      expect(screen.questions.every((q) => q.sectionId === screen.section.id)).toBe(true);
      expect(screen.questions.length).toBeGreaterThanOrEqual(2);
      expect(screen.questions.length).toBeLessThanOrEqual(3);
    }
  });

  it('numbers the ten Parts 1 to 10, in order, and the line only moves forward', () => {
    expect([...new Set(screens.map((s) => s.partNumber))]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    let last = -1;
    for (const screen of screens) {
      const percent = haqProgressPercent(screens, screen.index);
      expect(percent).toBeGreaterThanOrEqual(last);
      last = percent;
    }
    expect(haqProgressPercent(screens, haqBodyMapIndex(screens))).toBe(100);
  });

  it('resumes on the first screen holding an unanswered question, and on the body map once all are answered', () => {
    expect(resumeHaqScreenIndex(screens, {})).toBe(0);
    expect(resumeHaqScreenIndex(screens, answersThrough(7))).toBe(7);
    const partial = answersThrough(9);
    delete partial[screens[3]!.questions[1]!.key];
    expect(resumeHaqScreenIndex(screens, partial)).toBe(3);
    expect(resumeHaqScreenIndex(screens, answersThrough(screens.length))).toBe(haqBodyMapIndex(screens));
  });

  it('reads a stray value as unanswered, because missing is not zero and a stray value is not an answer', () => {
    const clean = sanitizeHaqAnswers({ haq_p1_a_q1: 'often', haq_p1_a_q2: 4, haq_p7_q31: 'often', nope: 'yes' });
    expect(clean).toEqual({ haq_p1_a_q1: 'often' });
  });
});

// ---------------------------------------------------------------------
// The intro.
// ---------------------------------------------------------------------

describe('the intro screen comes before question one', () => {
  it('shows the approved framing, the reassurance and the four definitions, and no question', () => {
    mount({ status: 'pending' });
    expect(copy.HAQ_INTRO_FRAMING).toBe(APPROVED_FRAMING);
    expect(text()).toContain(APPROVED_FRAMING);
    expect(text()).toContain('no right or wrong answers and nothing to calculate');
    const definitions = Array.from(container.querySelectorAll('[data-testid="haq-answer-definitions"] > div')).map(
      (row) => row.textContent?.replace('.', '. ')
    );
    expect(definitions).toEqual(APPROVED_DEFINITIONS);
    expect(buttonByText('Begin')).toBeTruthy();

    expect(text()).not.toContain(HAQ_QUESTIONS[0]!.prompt);
    expect(container.querySelectorAll('button[role="radio"]')).toHaveLength(0);
    // No count of questions, here or anywhere.
    expect(text()).not.toMatch(/260|questions? (left|remaining)/i);
  });

  it('is never shown again once an instance is open', () => {
    mount({ status: 'in_progress', screenIndex: 0 });
    expect(container.querySelector('[data-testid="haq-intro"]')).toBeNull();
    expect(text()).not.toContain(APPROVED_FRAMING);
    expect(text()).toContain(HAQ_QUESTIONS[0]!.prompt);
  });
});

describe('the definitions reopen from the help control on every question screen', () => {
  it.each([0, 40, screens.length - 1])('screen %i', async (screenIndex) => {
    mount({ status: 'in_progress', answers: answersThrough(screenIndex), screenIndex });
    const control = container.querySelector('[data-testid="haq-definitions-control"]');
    expect(control?.getAttribute('aria-label')).toBe('What the answers mean');
    expect(document.querySelector('[data-testid="haq-definitions-sheet"]')).toBeNull();

    await click(control!);
    const sheet = document.querySelector('[data-testid="haq-definitions-sheet"]');
    expect(sheet).not.toBeNull();
    for (const definition of APPROVED_DEFINITIONS) {
      const [term, ...rest] = definition.split('. ');
      expect(sheet!.textContent).toContain(`${term}.`);
      expect(sheet!.textContent).toContain(rest.join('. '));
    }

    await click(buttonByText('Got it', document.body));
    expect(document.querySelector('[data-testid="haq-definitions-sheet"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------
// Where she is.
// ---------------------------------------------------------------------

describe('the Part and Section header and "Part X of 10" on sampled screens across all ten Parts', () => {
  const samples = ROMAN.flatMap((_, part) => {
    const inPart = screens.filter((s) => s.partNumber === part + 1);
    return [inPart[0]!, inPart[inPart.length - 1]!];
  });

  it.each(samples.map((s) => [s.index, s.partNumber, s.section.title] as const))(
    'screen %i is Part %i, %s',
    (screenIndex, partNumber, sectionTitle) => {
      const screen = screens[screenIndex]!;
      mount({ status: 'in_progress', answers: answersThrough(screenIndex), screenIndex });

      const partHeading = container.querySelector('[data-testid="haq-part-heading"]')!.textContent;
      const expectedPart = `Part ${ROMAN[partNumber - 1]}`;
      expect(partHeading).toBe(
        screen.section.sectionLetter ? `${expectedPart}, Section ${screen.section.sectionLetter}` : expectedPart
      );
      expect(container.querySelector('[data-testid="haq-section-title"]')!.textContent).toBe(sectionTitle);
      expect(text()).toContain(`Part ${partNumber} of 10`);

      // Never a question count, never a remaining count.
      expect(text()).not.toMatch(/Question \d|Questions \d|of 260|remaining|left to go/);
      // The prompts on the screen are this screen's questions.
      expect(questionBlocks().map((b) => b.querySelector('h2')!.textContent)).toEqual(
        screen.questions.map((q) => q.prompt)
      );
    }
  );

  it('the Dysglycemia-L intro stands above that section on each of its screens, and nowhere else', () => {
    const dysglycemia = HAQ_SECTIONS.find((s) => s.id === 'haq_p4_a')!;
    for (const screen of [screens.find((s) => s.section.id === 'haq_p4_a')!, screens.filter((s) => s.section.id === 'haq_p4_a').pop()!, screens[0]!]) {
      act(() => root.unmount());
      root = createRoot(container);
      mount({ status: 'in_progress', answers: answersThrough(screen.index), screenIndex: screen.index });
      const intro = container.querySelector('[data-testid="haq-section-intro"]');
      if (screen.section.id === 'haq_p4_a') {
        expect(intro?.textContent).toBe(dysglycemia.intro);
        // Above the questions: it is in the header, which comes before the list.
        const header = container.querySelector('[data-testid="haq-screen-header"]')!;
        expect(header.contains(intro)).toBe(true);
      } else {
        expect(intro).toBeNull();
      }
    }
  });
});

// ---------------------------------------------------------------------
// Answering.
// ---------------------------------------------------------------------

describe('answering: tap only, Continue is the step, Back works, an answer can change', () => {
  it('saves each answer the moment it is tapped, and does not move until Continue', async () => {
    mount({ status: 'in_progress', screenIndex: 0 });
    const first = questionBlocks()[0]!;
    await click(first.querySelectorAll('button[role="radio"]')[2]!);

    expect(sent).toEqual([{ url: '/api/haq/answer', body: { questionKey: 'haq_p1_a_q1', value: 'often' } }]);
    expect(buttonByText('Continue').disabled).toBe(true);
    expect(text()).toContain('Choose an answer for each question to continue.');
    // Still the same screen: no auto advance.
    expect(questionBlocks()[0]!.querySelector('h2')!.textContent).toBe(HAQ_QUESTIONS[0]!.prompt);
  });

  it('changing an answer sends the new one, and the new one is the chosen one', async () => {
    mount({ status: 'in_progress', screenIndex: 0 });
    const block = questionBlocks()[0]!;
    await click(block.querySelectorAll('button[role="radio"]')[3]!);
    await click(block.querySelectorAll('button[role="radio"]')[1]!);

    expect(sent.map((s) => s.body.value)).toEqual(['very_often', 'sometimes']);
    const chosen = Array.from(block.querySelectorAll('button[role="radio"]')).filter(
      (b) => b.getAttribute('aria-checked') === 'true'
    );
    expect(chosen.map((b) => b.textContent)).toEqual(['Sometimes']);
  });

  it('Back returns one screen with her answers still chosen, and any of them can still be changed', async () => {
    mount({ status: 'in_progress', screenIndex: 0 });
    await answerScreen(1);
    await click(buttonByText('Continue'));
    expect(questionBlocks()[0]!.querySelector('h2')!.textContent).toBe(screens[1]!.questions[0]!.prompt);

    await click(buttonByText('Back'));
    expect(questionBlocks()[0]!.querySelector('h2')!.textContent).toBe(HAQ_QUESTIONS[0]!.prompt);
    for (const block of questionBlocks()) {
      expect(block.querySelector('button[aria-checked="true"]')?.textContent).toBe('Sometimes');
    }
    await click(questionBlocks()[0]!.querySelectorAll('button[role="radio"]')[0]!);
    expect(sent.at(-1)).toEqual({ url: '/api/haq/answer', body: { questionKey: 'haq_p1_a_q1', value: 'never_or_rarely' } });
  });

  it('answers are neutral: the same rows for every option, no numbers, one gold selection for all', async () => {
    mount({ status: 'in_progress', screenIndex: 0 });
    const options = Array.from(questionBlocks()[0]!.querySelectorAll('button[role="radio"]'));
    expect(options.map((o) => o.textContent)).toEqual(['Never or rarely', 'Sometimes', 'Often', 'Very often']);
    for (const option of options) expect(option.textContent).not.toMatch(/\d/);

    const selectedClasses: string[] = [];
    for (const index of [0, 3]) {
      await click(options[index]!);
      selectedClasses.push(options[index]!.className);
    }
    expect(selectedClasses[0]).toBe(selectedClasses[1]);
    const unchosen = options.filter((o) => o.getAttribute('aria-checked') !== 'true').map((o) => o.className);
    expect(new Set(unchosen).size).toBe(1);
  });

  it('a resumed instance opens on the screen the server named, in Part III, with earlier answers intact', async () => {
    const midPartThree = screens.filter((s) => s.partNumber === 3)[2]!;
    const answers = answersThrough(midPartThree.index);
    expect(resumeHaqScreenIndex(screens, answers)).toBe(midPartThree.index);

    mount({ status: 'in_progress', answers, screenIndex: midPartThree.index });
    expect(text()).toContain('Part 3 of 10');
    expect(container.querySelector('[data-testid="haq-section-title"]')!.textContent).toBe(midPartThree.section.title);
    expect(questionBlocks().map((b) => b.querySelector('h2')!.textContent)).toEqual(
      midPartThree.questions.map((q) => q.prompt)
    );

    await click(buttonByText('Back'));
    for (const block of questionBlocks()) {
      expect(block.querySelector('button[aria-checked="true"]')?.textContent).toBe('Never or rarely');
    }
  });

  it('Save and exit waits for her saves and leaves for the questionnaires', async () => {
    mount({ status: 'in_progress', screenIndex: 0 });
    await answerScreen(0);
    await click(buttonByText('Save and exit'));
    expect(pushed).toEqual(['/questionnaires']);
  });
});

describe('the section beat names the real sections', () => {
  it('"Gastric Function complete" then "Next: GI Inflammation", about a second and a quarter', async () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    const lastGastric = screens.filter((s) => s.section.id === 'haq_p1_a').pop()!;
    mount({ status: 'in_progress', answers: answersThrough(lastGastric.index + 1), screenIndex: lastGastric.index });

    await click(buttonByText('Continue'));
    const beat = container.querySelector('[data-testid="section-transition"]');
    expect(beat?.textContent).toContain('Gastric Function complete');
    expect(beat?.textContent).toContain('Next: GI Inflammation');
    expect(SECTION_TRANSITION_MS).toBeGreaterThanOrEqual(1000);
    expect(SECTION_TRANSITION_MS).toBeLessThanOrEqual(1500);

    await act(async () => {
      vi.advanceTimersByTime(SECTION_TRANSITION_MS);
    });
    expect(container.querySelector('[data-testid="section-transition"]')).toBeNull();
    expect(container.querySelector('[data-testid="haq-section-title"]')!.textContent).toBe('GI Inflammation');
  });

  it('crossing a Part names the next section too, and the last section leads to the body map', async () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    const lastColon = screens.filter((s) => s.section.id === 'haq_p1_d').pop()!;
    mount({ status: 'in_progress', answers: answersThrough(lastColon.index + 1), screenIndex: lastColon.index });
    await click(buttonByText('Continue'));
    expect(container.textContent).toContain('Colon complete');
    expect(container.textContent).toContain('Next: Liver / Gallbladder (Hepatobiliary Function)');

    act(() => root.unmount());
    root = createRoot(container);
    const last = screens[screens.length - 1]!;
    mount({ status: 'in_progress', answers: answersThrough(screens.length), screenIndex: last.index });
    await click(buttonByText('Continue'));
    expect(container.textContent).toContain('Cognition complete');
    expect(container.textContent).toContain('Next: Body map');
  });

  it('a member who asked for reduced motion is not made to wait for it', async () => {
    setReducedMotion(true);
    const lastGastric = screens.filter((s) => s.section.id === 'haq_p1_a').pop()!;
    mount({ status: 'in_progress', answers: answersThrough(lastGastric.index + 1), screenIndex: lastGastric.index });
    await click(buttonByText('Continue'));
    expect(container.querySelector('[data-testid="section-transition"]')).toBeNull();
    expect(container.querySelector('[data-testid="haq-section-title"]')!.textContent).toBe('GI Inflammation');
  });
});

// ---------------------------------------------------------------------
// The body map and completion.
// ---------------------------------------------------------------------

describe('the body map', () => {
  const bodyMapIndex = haqBodyMapIndex(screens);

  function region(location: string): Element {
    const found = container.querySelector(`[data-location="${location}"]`);
    expect(found, location).not.toBeNull();
    return found!;
  }

  async function mark(location: string, issueLabel: string) {
    await click(region(location));
    const sheet = document.querySelector('[data-testid="haq-body-category-sheet"]');
    expect(sheet).not.toBeNull();
    await click(buttonByText(issueLabel, sheet!));
  }

  it('shows the approved instruction and says it is optional', () => {
    mount({ status: 'in_progress', answers: answersThrough(screens.length), screenIndex: bodyMapIndex });
    expect(copy.HAQ_BODY_MAP_INSTRUCTION).toBe(APPROVED_BODY_MAP);
    expect(text()).toContain(APPROVED_BODY_MAP);
    expect(text()).toContain('optional');
    expect(text()).toContain('Part 10 of 10');
  });

  it('marks areas on the front and the back with different categories, lists them, and removes one', async () => {
    mount({ status: 'in_progress', answers: answersThrough(screens.length), screenIndex: bodyMapIndex });

    await mark('left_knee', 'Swelling');
    await click(buttonByText('Back', container.querySelector('[role="group"][aria-label="Body view"]')!));
    await mark('lower_back', 'Pain');
    await mark('right_shoulder_back', 'Skin change');

    expect(sent.filter((s) => s.url === '/api/haq/body-map').map((s) => s.body)).toEqual([
      { action: 'add', location: 'left_knee', side: 'front', issueType: 'swelling' },
      { action: 'add', location: 'lower_back', side: 'back', issueType: 'pain' },
      { action: 'add', location: 'right_shoulder_back', side: 'back', issueType: 'skin_change' },
    ]);
    const listed = () => Array.from(container.querySelectorAll('[data-testid="haq-body-marks"] li')).map((li) => li.textContent);
    expect(listed()).toEqual([
      'Left knee (front)SwellingRemove',
      'Lower back (back)PainRemove',
      'Back of right shoulder (back)Skin changeRemove',
    ]);

    const second = container.querySelectorAll('[data-testid="haq-body-marks"] li')[1]!;
    await click(buttonByText('Remove', second));
    expect(sent.at(-1)!.body).toEqual({ action: 'remove', markId: 'mark-2' });
    expect(listed()).toEqual(['Left knee (front)SwellingRemove', 'Back of right shoulder (back)Skin changeRemove']);
  });

  it('completes with zero marks: nothing about the map ever blocks it', async () => {
    mount({ status: 'in_progress', answers: answersThrough(screens.length), screenIndex: bodyMapIndex });
    expect(container.querySelectorAll('[data-testid="haq-body-marks"] li')).toHaveLength(0);
    const finish = buttonByText('Complete');
    expect(finish.disabled).toBe(false);
    await click(finish);
    expect(completeHaqAction).toHaveBeenCalledTimes(1);
    expect(text()).toContain(APPROVED_COMPLETION);
    expect(text()).toContain('Your coach can now see your responses.');
  });

  it('left and right are her own: the same side of the picture is her right on the front and her left on the back', () => {
    const front = haqBodyRegions('front');
    const back = haqBodyRegions('back');
    const pictureLeftShoulderFront = front.find((r) => r.shape.kind === 'ellipse' && r.shape.cx === 64 && r.shape.cy === 88)!;
    const pictureLeftShoulderBack = back.find((r) => r.shape.kind === 'ellipse' && r.shape.cx === 64 && r.shape.cy === 88)!;
    expect(pictureLeftShoulderFront.location).toBe('right_shoulder');
    expect(pictureLeftShoulderBack.location).toBe('left_shoulder_back');
    for (const view of ['front', 'back'] as const) {
      const locations = haqBodyRegions(view).map((r) => r.location);
      expect(new Set(locations).size).toBe(locations.length);
      for (const location of locations) expect(findHaqBodyRegion(view, location)).toBeTruthy();
    }
    expect(HAQ_BODY_ISSUE_TYPES.map((i) => i.label)).toEqual(['Pain', 'Swelling', 'Discomfort', 'Skin change']);
  });
});

describe('completion', () => {
  it('a finished instance shows the calm confirmation, and no result, colour or number', () => {
    mount({ status: 'completed' });
    expect(copy.HAQ_COMPLETION_STATEMENT).toBe(APPROVED_COMPLETION);
    const completion = container.querySelector('[data-testid="haq-completion"]')!;
    expect(completion.textContent).toContain(APPROVED_COMPLETION);
    expect(completion.textContent).toContain('Your coach can now see your responses.');
    expect(completion.textContent).not.toMatch(/\d/);
    expect(completion.textContent).not.toMatch(/Doing Well|Needs Attention|High Attention|green|yellow|red\b/i);
  });
});

const EM_DASH = String.fromCharCode(0x2014);

describe('no em dash in anything the member reads', () => {
  it('copy, section titles, intros, questions, answers and body map labels', () => {
    const strings: string[] = [
      ...(Object.values(copy) as unknown[]).filter((value): value is string => typeof value === 'string'),
      ...copy.HAQ_ANSWER_DEFINITIONS.flatMap((d) => [d.term, d.meaning]),
      ...HAQ_SECTIONS.flatMap((s) => [s.title, s.intro ?? '', s.partLabel]),
      ...HAQ_QUESTIONS.map((q) => q.prompt),
      ...Object.values(HAQ_RESPONSE_OPTIONS).flatMap((options) => options.map((o) => o.label)),
      ...(['front', 'back'] as const).flatMap((view) => haqBodyRegions(view).map((r) => r.label)),
      copy.haqSectionCompleteHeading('X'),
      copy.haqNextLine('X'),
    ];
    for (const value of strings) expect(value, value).not.toContain(EM_DASH);
    mount({ status: 'pending' });
    expect(bodyText()).not.toContain(EM_DASH);
  });
});
