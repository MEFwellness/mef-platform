// @vitest-environment jsdom
/**
 * The intake, driven rather than described.
 *
 * WHAT IS BEING CLAIMED, and why none of it can be proved by reading the
 * source:
 *
 *   CONTINUE IS THE DELIBERATE STEP. A screen holding anything other than
 *     one binary gate draws a Continue and does not move until it is
 *     pressed, and a gate screen draws no Continue at all and moves by
 *     itself after its settle.
 *   A CLOSED BRANCH IS CONFIRMED FIRST, in a sentence naming the real
 *     count, and declining it leaves every entry exactly where it was.
 *   AN ENTRY LIST STARTS EMPTY. Nobody is shown six blank rows; one button
 *     opens one form, saving prints one summary card, and editing reopens
 *     that card's own entry.
 *   THE THREE CARDS AT THE END HOLD ONLY WHAT SHE ANSWERED.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const pushed: string[] = [];
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: () => {},
    push: (href: string) => {
      pushed.push(href);
    },
  }),
}));

const submit = vi.fn(async (answers: unknown) => {
  const { buildMemberSummary } = await import('../lib/health-intake/memberSummary');
  const { sanitizeAnswers } = await import('../lib/health-intake/sanitize');
  return {
    ok: true as const,
    sessionId: 'session-1',
    view: buildMemberSummary(sanitizeAnswers(answers), { safetyTriggered: false }),
  };
});
vi.mock('@/app/actions/healthIntake', () => ({
  submitHealthIntakeAction: (answers: unknown) => submit(answers),
}));

const { HealthIntakeExperience } = await import(
  '../components/health-intake/HealthIntakeExperience'
);
const { buildSteps, fieldIsRequired } = await import('../lib/health-intake/steps');
const { allScreens } = await import('../lib/health-intake/questions');
const { itemsForFollowUp, screenIsShown } = await import('../lib/health-intake/branching');
const { formatHeight } = await import('../lib/health-intake/sanitize');
const { HLI_COPY } = await import('../lib/health-intake/copy');
const { buildMemberSummary } = await import('../lib/health-intake/memberSummary');
import type {
  IntakeAnswers,
  IntakeAnswerValue,
  IntakeField,
} from '../lib/health-intake/types';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

/** Reduced motion ON, so the gate settle is zero and the tests never sleep. */
function setReducedMotion(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
}

/** Every draft the taker posted, in order, so the stored position is checkable. */
type PostedDraft = { answers: IntakeAnswers; stepIndex: number };
const drafts: PostedDraft[] = [];

let container: HTMLDivElement;
let root: Root;

describe('the Health & Lifestyle Intake, on a real screen', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    pushed.length = 0;
    submit.mockClear();
    setReducedMotion(true);
    Object.defineProperty(window, 'scrollTo', { writable: true, configurable: true, value: vi.fn() });
    drafts.length = 0;
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      configurable: true,
      value: vi.fn(async (_url: unknown, init?: { body?: string }) => {
        if (init?.body) drafts.push(JSON.parse(init.body) as PostedDraft);
        return new Response(JSON.stringify({ ok: true }));
      }),
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function mount(options: {
    status?: 'pending' | 'in_progress' | 'completed';
    resumeAnswers?: IntakeAnswers;
    resumeStepIndex?: number;
    prefillName?: string;
  }) {
    act(() => {
      root.render(
        <HealthIntakeExperience
          status={options.status ?? 'in_progress'}
          resumeAnswers={options.resumeAnswers ?? {}}
          resumeStepIndex={options.resumeStepIndex ?? 0}
          prefillName={options.prefillName ?? ''}
          maxDate="2026-09-12"
          completedView={null}
        />
      );
    });
  }

  function text(): string {
    return container.textContent ?? '';
  }

  function buttons(): HTMLButtonElement[] {
    return Array.from(container.querySelectorAll('button'));
  }

  function button(label: string): HTMLButtonElement {
    const found = buttons().find((entry) => entry.textContent?.trim() === label);
    if (!found) {
      throw new Error(
        `no button labelled "${label}". Present: ${buttons()
          .map((entry) => entry.textContent?.trim())
          .join(' | ')}`
      );
    }
    return found;
  }

  function hasButton(label: string): boolean {
    return buttons().some((entry) => entry.textContent?.trim() === label);
  }

  /**
   * Presses a real button and then lets the gate settle run.
   *
   * A binary gate is the one control in this instrument that advances by
   * itself, and it does it from a timer. Reduced motion is on for every
   * test here so that timer is zero, but a zero timer is still a macrotask,
   * so the flush below is what makes "her tap moved the screen" observable
   * rather than a race.
   */
  async function press(label: string) {
    await act(async () => {
      button(label).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
  }

  /**
   * A member who has genuinely walked as far as one screen.
   *
   * WHY IT IS BUILT RATHER THAN TYPED. The taker never lets a stored index
   * carry a member past a screen that still needs her, which is the whole
   * point of resumeStepIndex, so "open the app on chapter six" is only
   * reachable by holding the answers of a member who really got there.
   * This fills every REQUIRED field on every screen before the target with
   * a real, valid value taken from the content itself, and leaves
   * everything optional blank, exactly as a member who skipped it would.
   */
  function walkedTo(screenId: string | null, extra: IntakeAnswers = {}): IntakeAnswers {
    const answers: IntakeAnswers = { ...extra };
    for (const screen of allScreens()) {
      if (screen.id === screenId) break;
      if (!screenIsShown(screen, answers)) continue;
      for (const field of screen.fields) {
        if (!fieldIsRequired(field)) continue;
        if (answers[field.id] !== undefined) continue;
        const value = sampleAnswer(field, answers);
        if (value !== null) answers[field.id] = value;
      }
    }
    return answers;
  }

  /** A valid answer to one field, taken from the field's own definition. */
  function sampleAnswer(field: IntakeField, answers: IntakeAnswers): IntakeAnswerValue | null {
    switch (field.kind) {
      case 'gate':
        return 'no';
      case 'single_select':
        return field.options[0]!.value;
      case 'multi_select':
        return [field.options[0]!.value];
      case 'scale_ten':
        return 5;
      case 'time':
        return '03:00';
      case 'date':
        return '1986-04-02';
      case 'height':
        return formatHeight(5, 7);
      case 'short_text':
      case 'long_text':
        return 'Something';
      case 'entry_list': {
        const entry: Record<string, string> = {};
        for (const entryField of field.entryFields) {
          if (entryField.optional === true) continue;
          entry[entryField.id] =
            entryField.kind === 'select'
              ? entryField.options[0]!.value
              : entryField.kind === 'year'
                ? '2019'
                : 'Something';
        }
        return [entry];
      }
      case 'per_item': {
        const map: Record<string, string> = {};
        for (const item of itemsForFollowUp(field, answers)) {
          map[item] = field.options[0]!.value;
        }
        return Object.keys(map).length > 0 ? map : null;
      }
      default:
        return null;
    }
  }

  /** Mounts a member who has walked as far as one screen, past the resume card. */
  async function openAt(screenId: string | null, extra: IntakeAnswers = {}) {
    const answers = walkedTo(screenId, extra);
    mount({ resumeAnswers: answers, resumeStepIndex: 9999 });
    if (hasButton(HLI_COPY.resumeCta)) await press(HLI_COPY.resumeCta);
  }

  async function pressBack() {
    const back = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${HLI_COPY.backLabel}"]`
    );
    expect(back, 'there is no way back from this screen').not.toBeNull();
    await act(async () => {
      back!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  /**
   * Walks BACK to a screen she has already answered.
   *
   * This is the only honest way to reach one. The taker never lets a stored
   * index carry a member past a screen that still needs her, and a screen
   * she has already answered does not need her, so "open the app on a
   * question she already answered" is not a state that exists. Going back
   * to it is, and it is exactly the path a member takes when she changes
   * her mind, which is what these tests are about.
   */
  async function backUntil(snippet: string, limit = 14) {
    for (let step = 0; step < limit && !text().includes(snippet); step += 1) {
      await pressBack();
    }
    expect(text()).toContain(snippet);
  }

  // -------------------------------------------------------------------

  it('opens on the approved invitation and its three reassurance points', () => {
    mount({ status: 'pending' });
    expect(text()).toContain(HLI_COPY.reassuranceOne);
    expect(text()).toContain(HLI_COPY.reassuranceTwo);
    expect(text()).toContain(HLI_COPY.reassuranceThree);
    expect(hasButton(HLI_COPY.introButton)).toBe(true);
  });

  it('moves from the invitation into chapter one, counted 01 of 11', async () => {
    mount({ status: 'pending' });
    await press(HLI_COPY.introButton);
    expect(text()).toContain('01 of 11');
    expect(text()).toContain('About you');
  });

  it('offers to pick up where she left off when she has already started', () => {
    mount({ status: 'in_progress', resumeAnswers: { full_name: 'Ebony' }, resumeStepIndex: 2 });
    expect(text()).toContain(HLI_COPY.resumeTitle);
    expect(hasButton(HLI_COPY.resumeCta)).toBe(true);
  });

  it('puts her own name in the box, editable, and never over something she typed', () => {
    mount({ status: 'pending', prefillName: 'Ebony Carter' });
    act(() => {
      button(HLI_COPY.introButton).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      button(HLI_COPY.continueLabel).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const input = container.querySelector<HTMLInputElement>('input[type="text"]');
    expect(input?.value).toBe('Ebony Carter');

    // She had already typed something else. The prefill must not win.
    act(() => root.unmount());
    root = createRoot(container);
    mount({
      status: 'in_progress',
      prefillName: 'Ebony Carter',
      resumeAnswers: { full_name: 'Eb' },
      resumeStepIndex: 1,
    });
    act(() => {
      button(HLI_COPY.resumeCta).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe('Eb');
  });

  describe('Continue is the deliberate step', () => {
    it('a gate screen draws no Continue and advances on her tap', async () => {
      await openAt('background_medications_gate');
      expect(text()).toContain('Are you currently taking any prescription medications?');
      expect(hasButton(HLI_COPY.continueLabel)).toBe(false);
      await press('No');
      expect(text()).not.toContain('Are you currently taking any prescription medications?');
    });

    it('a Yes on that gate opens the list, and the list waits for Continue', async () => {
      await openAt('background_medications_gate');
      await press('Yes');
      expect(text()).toContain('What are you taking?');
      // Nothing added yet, so Continue is present and refused.
      expect(hasButton(HLI_COPY.continueLabel)).toBe(true);
      expect(button(HLI_COPY.continueLabel).disabled).toBe(true);
    });

    it('a multi-select never advances on a tap, however many she chooses', async () => {
      await openAt('brings_you_concerns');
      expect(text()).toContain('What would you most like help with right now?');
      await press('Energy');
      await press('Sleep');
      // Still the same screen. Only Continue leaves it.
      expect(text()).toContain('What would you most like help with right now?');
      expect(button(HLI_COPY.continueLabel).disabled).toBe(false);
      await press(HLI_COPY.continueLabel);
      expect(text()).toContain('When did you first begin noticing this?');
    });

    it('a scale never advances on a tap either', async () => {
      await openAt('stress_level');
      expect(text()).toContain('How would you describe your current stress load?');
      const mark = container.querySelector<HTMLButtonElement>('button[aria-label="8 out of 10"]')!;
      await act(async () => {
        mark.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(text()).toContain('How would you describe your current stress load?');
      expect(text()).toContain('out of 10');
    });
  });

  describe('an entry list starts empty and grows one at a time', () => {
    it('shows one button, not six blank rows', async () => {
      await openAt('background_medications_gate');
      await press('Yes');
      expect(text()).toContain(HLI_COPY.entryEmptyHint);
      expect(container.querySelectorAll('input[type="text"]')).toHaveLength(0);
      expect(hasButton('Add a medication')).toBe(true);
    });

    it('adds one, prints it as a summary card, and offers to add another', async () => {
      await openAt('background_medications_gate');
      await press('Yes');
      await press('Add a medication');
      const name = container.querySelector<HTMLInputElement>('input[type="text"]')!;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )!.set!;
        setter.call(name, 'Levothyroxine');
        name.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await press(HLI_COPY.saveEntryLabel);
      expect(text()).toContain('Levothyroxine');
      expect(hasButton('Add another medication')).toBe(true);
      expect(button(HLI_COPY.continueLabel).disabled).toBe(false);
    });

    it('reopens the card she asked to edit, holding what she wrote', async () => {
      await openAt('background_medications', {
        medications_gate: 'yes',
        medications: [{ medication_name: 'Levothyroxine', medication_reason: 'Thyroid' }],
      });
      await backUntil('What are you taking?');
      await press(HLI_COPY.editLabel);
      const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="text"]'));
      expect(inputs[0]!.value).toBe('Levothyroxine');
      expect(inputs[1]!.value).toBe('Thyroid');
    });
  });

  describe('flipping a gate asks first, and says exactly what it costs', () => {
    const answers: IntakeAnswers = {
      medications_gate: 'yes',
      medications: [{ medication_name: 'Levothyroxine' }, { medication_name: 'Sertraline' }],
    };

    it('names the real count and does not move until she answers', async () => {
      await openAt('background_medications_gate', answers);
      await backUntil('Are you currently taking any prescription medications?');
      await press('No');
      expect(text()).toContain(HLI_COPY.confirmTitle);
      expect(text()).toContain('This will remove the 2 medications you added.');
      // Still on the gate screen.
      expect(text()).toContain('Are you currently taking any prescription medications?');
    });

    it('keeps everything when she declines', async () => {
      await openAt('background_medications_gate', answers);
      await backUntil('Are you currently taking any prescription medications?');
      await press('No');
      await press(HLI_COPY.confirmKeep);
      expect(text()).not.toContain(HLI_COPY.confirmTitle);
      // Her Yes is still her answer, so the next screen is still her list.
      expect(text()).toContain('Are you currently taking any prescription medications?');
      const yes = button('Yes');
      expect(yes.getAttribute('aria-checked')).toBe('true');
    });

    it('removes them and moves on when she confirms', async () => {
      await openAt('background_medications_gate', answers);
      await backUntil('Are you currently taking any prescription medications?');
      await press('No');
      await press(HLI_COPY.confirmRemove);
      expect(text()).not.toContain(HLI_COPY.confirmTitle);
      // The list screen no longer exists, so she is past it.
      expect(text()).not.toContain('What are you taking?');
      expect(text()).not.toContain('Levothyroxine');
    });
  });

  it('asks nothing when the change costs nothing', async () => {
    await openAt('background_medications_gate', { medications_gate: 'yes' });
    await backUntil('Are you currently taking any prescription medications?');
    await press('No');
    expect(text()).not.toContain(HLI_COPY.confirmTitle);
  });

  describe('the completion screen', () => {
    const answers: IntakeAnswers = {
      primary_concerns: ['sleep', 'energy'],
      stress_level: 8,
      symptoms: ['fatigue'],
      symptom_frequency: { fatigue: 'often' },
      symptom_duration: { fatigue: 'several_weeks' },
    };

    it('shows only what she answered, and never an empty card', async () => {
      await openAt(null, answers);
      expect(text()).toContain(HLI_COPY.completionTitle);
      await press(HLI_COPY.completionSubmitCta);
      expect(submit).toHaveBeenCalledTimes(1);

      expect(text()).toContain(HLI_COPY.completionCardOneTitle);
      expect(text()).toContain('Sleep');
      expect(text()).toContain('Energy');
      expect(text()).toContain('Stress load 8 out of 10');
      expect(text()).toContain(HLI_COPY.completionCardThreeBody);
      // Nothing she did not report.
      expect(text()).not.toContain('Digestion');
      expect(text()).not.toContain('medication');
      expect(hasButton(HLI_COPY.completionCta)).toBe(true);
    });

    it('says nothing about a score, a band or a colour', async () => {
      await openAt(null, answers);
      await press(HLI_COPY.completionSubmitCta);
      expect(text().toLowerCase()).not.toContain('score');
      expect(text().toLowerCase()).not.toContain('your result');
    });

    it('Done leaves for Home, and it is the only way out of it', async () => {
      await openAt(null, answers);
      await press(HLI_COPY.completionSubmitCta);
      await press(HLI_COPY.completionCta);
      expect(pushed).toEqual(['/dashboard']);
    });
  });

  describe('what is written down as her position', () => {
    /*
      THE SCREEN SHE IS MOVING TO, NOT THE ONE SHE IS ON. The draft the
      taker keeps is refreshed while rendering, so a save fired in the same
      tick as the move still held the old index and the server stored a
      position one screen behind her for the whole sitting. Found on
      production, 2026-09-12: she left on a question and came back to the
      chapter header above it.
    */
    it('a Continue stores the index of the screen she just arrived on', async () => {
      const answers = walkedTo('brings_you_concerns');
      mount({ resumeAnswers: answers, resumeStepIndex: 9999 });
      await press(HLI_COPY.resumeCta);

      const before = buildSteps(answers).findIndex(
        (step) => step.kind === 'screen' && step.screenId === 'brings_you_concerns'
      );
      await press('Energy');
      await press(HLI_COPY.continueLabel);

      const last = drafts[drafts.length - 1];
      expect(last, 'nothing was posted at all').toBeTruthy();
      expect(last!.stepIndex).toBe(before + 1);
    });

    it('a gate stores the index its own advance lands on', async () => {
      await openAt('background_medications_gate');
      const before = buildSteps(walkedTo('background_medications_gate')).findIndex(
        (step) => step.kind === 'screen' && step.screenId === 'background_medications_gate'
      );
      drafts.length = 0;
      await press('No');
      const last = drafts[drafts.length - 1];
      expect(last, 'a gate posted nothing').toBeTruthy();
      expect(last!.stepIndex).toBe(before + 1);
    });
  });

  it('tells a member who already finished it that there is nothing to fill in', () => {
    act(() => {
      root.render(
        <HealthIntakeExperience
          status="completed"
          resumeAnswers={{}}
          resumeStepIndex={0}
          prefillName=""
          maxDate="2026-09-12"
          completedView={buildMemberSummary(
            { primary_concerns: ['energy'] },
            { safetyTriggered: false }
          )}
        />
      );
    });
    expect(text()).toContain(HLI_COPY.alreadyDoneTitle);
    expect(text()).toContain('Energy');
  });
});
