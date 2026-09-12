// @vitest-environment jsdom

/**
 * HER RESULTS SCREEN, AFTER THE REVERSAL.
 *
 * This experience shipped on 2026-09-12 with a member view that had no
 * field a number could sit in, and a guard asserting the serialised
 * payload held no digit at all. That rule was deliberately reversed: she
 * is shown her own total, the scale it sits on and the traditional
 * reference threshold. This file is what the reversal is worth, and it is
 * written so every claim would FAIL against the old screen rather than
 * passing vacuously against either.
 *
 * WHAT IT CHECKS, AND WHY EACH ONE EARNS ITS PLACE:
 *
 *   THE SCORE IS HERS. The number rendered is the number scored from the
 *     answers, formatted "total / maximum", not a percentage and not a
 *     band.
 *   THE THRESHOLD LINE TURNS AT TWENTY THREE, checked at twenty two,
 *     twenty three and twenty four, because AT the figure counts as above
 *     it and an off by one there would mislabel every borderline sitting.
 *   THE MARKER IS WHERE THE NUMBER SAYS. The bar is drawn from inline
 *     percentages, so they are read back off the real DOM.
 *   THE STRONGEST SIGNALS ARE HER HIGHEST ANSWERS, in order, at most four,
 *     with ties broken by the instrument's own order, and the section
 *     still stands when fewer than three qualify.
 *   NO EM DASH ANYWHERE SHE READS.
 *   THE PRIMARY BUTTON OPENS A ROOT CONVERSATION, and the context that
 *     conversation is seeded with carries this sitting and obeys the
 *     standing interpretation rules.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  BPC_ITEMS,
  BPC_MAX_SCORE,
  BPC_REFERENCE_THRESHOLD,
  scoreBpcAnswers,
  type BpcAnswers,
} from '../lib/breathing-check-in/instrument';
import {
  BPC_MEMBER_ITEM_NAMES,
  BPC_STRONGEST_MAX,
  BPC_STRONGEST_MIN_POINTS,
  bpcStrongestSignals,
  buildBpcMemberView,
} from '../lib/breathing-check-in/signals';
import {
  BPC_CONVERSATION_ENTRY,
  BPC_CONVERSATION_OPENER,
  BPC_COPY,
  BPC_RESULTS_PRIMARY_HREF,
} from '../lib/breathing-check-in/copy';
import { buildBpcConversationSeed } from '../lib/breathing-check-in/conversationEntry';
import { BreathingCheckInResults } from '../components/breathing-check-in/BreathingCheckInResults';

const EM_DASH = '—';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let host: HTMLDivElement;
let root: Root;

/**
 * A sitting worth exactly `target` points, built from real answers.
 *
 * NOT A HAND TYPED RESULTS OBJECT. Every number this file asserts comes
 * from scoreBpcAnswers over answers the instrument would accept, so a
 * change to the point map fails these tests rather than sliding past them.
 * Four point answers are laid down first, then a remainder, so a target
 * near the threshold is reached with a realistic mixed sitting.
 */
function sittingWorth(target: number): { answers: BpcAnswers; total: number } {
  const answers: BpcAnswers = {};
  let left = target;
  for (const item of BPC_ITEMS) {
    if (left <= 0) break;
    const points = Math.min(4, left);
    answers[item.itemId] = (['never', 'rarely', 'sometimes', 'often', 'very_often'] as const)[
      points
    ]!;
    left -= points;
  }
  return { answers, total: scoreBpcAnswers(answers).totalScore };
}

function viewFor(answers: BpcAnswers) {
  return buildBpcMemberView(scoreBpcAnswers(answers));
}

function everyItem(valueKey: string): BpcAnswers {
  return Object.fromEntries(BPC_ITEMS.map((item) => [item.itemId, valueKey]));
}

function render(answers: BpcAnswers): HTMLDivElement {
  act(() => {
    root.render(<BreathingCheckInResults view={viewFor(answers)} onHome={() => {}} />);
  });
  return host;
}

function textOf(answers: BpcAnswers): string {
  return render(answers).textContent ?? '';
}

describe('her results screen shows her own score', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  // -----------------------------------------------------------------
  // 1. THE SCORE BLOCK.
  // -----------------------------------------------------------------

  it('prints the total out of the maximum, and it is the real scored total', () => {
    const { answers, total } = sittingWorth(27);
    expect(total).toBe(27);

    const text = textOf(answers);
    // Rendered as two nodes ("27" and " / 64"), so the assertion is on the
    // pair rather than on one string that happens to be split by markup.
    expect(text).toContain('27');
    expect(text).toContain(`/ ${BPC_MAX_SCORE}`);
  });

  it('leads with the label she reads above the number', () => {
    expect(textOf(everyItem('often'))).toContain(BPC_COPY.resultsTitle);
  });

  it('reports the score her answers actually produced, not a fixture', () => {
    // Sixteen "Very often" is sixty four; sixteen "Rarely" is sixteen.
    expect(textOf(everyItem('very_often'))).toContain('64');
    expect(textOf(everyItem('rarely'))).toContain('16');
  });

  // -----------------------------------------------------------------
  // 2. THE THRESHOLD LINE, AT THE BOUNDARY.
  // -----------------------------------------------------------------

  it('turns at the reference figure: twenty two is below, twenty three and twenty four are above', () => {
    expect(BPC_REFERENCE_THRESHOLD).toBe(23);

    const below = sittingWorth(22);
    expect(below.total).toBe(22);
    expect(viewFor(below.answers).aboveThreshold).toBe(false);
    expect(textOf(below.answers)).toContain(BPC_COPY.resultsBelowThresholdLine);

    const at = sittingWorth(23);
    expect(at.total).toBe(23);
    expect(viewFor(at.answers).aboveThreshold).toBe(true);
    expect(textOf(at.answers)).toContain(BPC_COPY.resultsAboveThresholdLine);

    const above = sittingWorth(24);
    expect(above.total).toBe(24);
    expect(viewFor(above.answers).aboveThreshold).toBe(true);
    expect(textOf(above.answers)).toContain(BPC_COPY.resultsAboveThresholdLine);
  });

  it('says only one of the two lines, never both', () => {
    for (const target of [0, 22, 23, 24, 64]) {
      const { answers } = sittingWorth(target);
      const text = textOf(answers);
      const above = text.includes(BPC_COPY.resultsAboveThresholdLine);
      const below = text.includes(BPC_COPY.resultsBelowThresholdLine);
      expect(above !== below, `total ${target}`).toBe(true);
    }
  });

  it('pairs the meaning paragraph with the same side of the figure', () => {
    expect(textOf(sittingWorth(23).answers)).toContain(BPC_COPY.resultsMeaningAbove);
    expect(textOf(sittingWorth(22).answers)).toContain(BPC_COPY.resultsMeaningBelow);
    expect(textOf(sittingWorth(22).answers)).not.toContain(BPC_COPY.resultsMeaningAbove);
  });

  it('always prints the sentence saying what the score is not', () => {
    for (const target of [0, 22, 23, 64]) {
      expect(textOf(sittingWorth(target).answers)).toContain(BPC_COPY.resultsScoreDisclaimer);
    }
  });

  // -----------------------------------------------------------------
  // 3. THE SCALE.
  // -----------------------------------------------------------------

  /** Every inline `left:` percentage on the drawn bar, in document order. */
  function leftPercents(element: HTMLElement): number[] {
    return Array.from(element.querySelectorAll<HTMLElement>('[style*="left"]'))
      .map((node) => Number.parseFloat(node.style.left))
      .filter((value) => Number.isFinite(value));
  }

  it('positions her marker at her own share of the scale', () => {
    const { answers } = sittingWorth(32);
    const element = render(answers);
    // Thirty two of sixty four is exactly half.
    expect(leftPercents(element)).toContain(50);
  });

  it('marks the reference figure at its own share, on every sitting', () => {
    const expected = (BPC_REFERENCE_THRESHOLD / BPC_MAX_SCORE) * 100;
    for (const target of [0, 23, 64]) {
      const element = render(sittingWorth(target).answers);
      const marks = leftPercents(element).map((value) => Math.round(value * 100) / 100);
      expect(marks, `total ${target}`).toContain(Math.round(expected * 100) / 100);
    }
  });

  it('names both landmarks in words, and the two ends of the scale', () => {
    const text = textOf(sittingWorth(27).answers);
    expect(text).toContain(`${BPC_COPY.resultsScaleThresholdLabel}: ${BPC_REFERENCE_THRESHOLD}`);
    expect(text).toContain(`${BPC_COPY.resultsScaleYourScoreLabel}: 27`);
    expect(text).toContain('0');
    expect(text).toContain(String(BPC_MAX_SCORE));
  });

  it('keeps a nought and a maximum marker on the rail rather than off it', () => {
    for (const target of [0, 64]) {
      const marks = leftPercents(render(sittingWorth(target).answers));
      for (const mark of marks) {
        expect(mark, `total ${target}`).toBeGreaterThanOrEqual(0);
        expect(mark, `total ${target}`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('invents no severity band and paints nothing in a warning colour', () => {
    const element = render(sittingWorth(60).answers);
    const markup = element.innerHTML.toLowerCase();

    // No Tailwind warning palette anywhere on the screen. Written as the
    // palette PREFIX ("red-", "amber-") rather than the bare word, because
    // "red" is a substring of "rounded" and a bare scan would fail on the
    // rail's own border radius rather than on a colour.
    for (const token of ['red-', 'amber-', 'orange-', 'rose-', 'yellow-', 'bg-red', 'text-red']) {
      expect(markup, token).not.toContain(token);
    }

    // And no severity vocabulary in what she reads.
    const text = (element.textContent ?? '').toLowerCase();
    for (const word of ['severe', 'moderate', 'mild', 'danger', 'warning', 'abnormal', 'normal']) {
      expect(text, word).not.toContain(word);
    }
  });

  // -----------------------------------------------------------------
  // 4. HER STRONGEST SIGNALS.
  // -----------------------------------------------------------------

  it('lists the highest answers, strongest first, at most four of them', () => {
    const answers: BpcAnswers = {
      chest_pain: 'often', // 3
      feeling_tense: 'very_often', // 4
      blurred_vision: 'never',
      dizzy_spells: 'sometimes',
      short_of_breath: 'very_often', // 4
      tight_chest: 'often', // 3
      palpitations: 'often', // 3
      feelings_of_anxiety: 'often', // 3
    };

    const strongest = bpcStrongestSignals(scoreBpcAnswers(answers));
    expect(strongest).toHaveLength(BPC_STRONGEST_MAX);
    // Fours before threes, and inside each tier the instrument's own order:
    // feeling_tense is item 2, short_of_breath is item 7; chest_pain is
    // item 1, tight_chest is item 8.
    expect(strongest.map((signal) => signal.itemId)).toEqual([
      'feeling_tense',
      'short_of_breath',
      'chest_pain',
      'tight_chest',
    ]);
    expect(strongest.map((signal) => signal.frequencyLabel)).toEqual([
      'Very often',
      'Very often',
      'Often',
      'Often',
    ]);
  });

  it('draws each one as a plain name and her own frequency word', () => {
    const text = textOf({ tight_chest: 'often', feeling_tense: 'very_often' });
    expect(text).toContain(BPC_COPY.resultsStrongestHeading);
    expect(text).toContain('Tightness in the chest');
    expect(text).toContain('Often');
    expect(text).toContain('Feeling tense');
    expect(text).toContain('Very often');
    // The validated stimulus stays on the question screen. The results
    // screen says it in ordinary language.
    expect(text).not.toContain('Tight feelings in chest');
  });

  it('takes nothing at "Sometimes" or below, which is what makes it a short list', () => {
    expect(BPC_STRONGEST_MIN_POINTS).toBe(3);
    const strongest = bpcStrongestSignals(scoreBpcAnswers(everyItem('sometimes')));
    expect(strongest).toHaveLength(0);
  });

  it('adjusts the intro when only two qualify', () => {
    const text = textOf({ chest_pain: 'often', feeling_tense: 'very_often' });
    expect(text).toContain(BPC_COPY.resultsStrongestIntroTwo);
    expect(text).not.toContain(BPC_COPY.resultsStrongestIntro);
  });

  it('adjusts the intro when only one qualifies', () => {
    const text = textOf({ chest_pain: 'very_often' });
    expect(text).toContain(BPC_COPY.resultsStrongestIntroOne);
  });

  it('still stands, and says so plainly, when nothing qualifies', () => {
    const text = textOf(everyItem('sometimes'));
    expect(text).toContain(BPC_COPY.resultsStrongestHeading);
    expect(text).toContain(BPC_COPY.resultsStrongestEmpty);
  });

  it('uses the full intro from three upward', () => {
    const text = textOf({
      chest_pain: 'often',
      feeling_tense: 'often',
      short_of_breath: 'often',
    });
    expect(text).toContain(BPC_COPY.resultsStrongestIntro);
  });

  it('has a plain name for every one of the sixteen, so none can reach her unnamed', () => {
    for (const item of BPC_ITEMS) {
      expect(BPC_MEMBER_ITEM_NAMES[item.itemId], item.itemId).toBeTruthy();
    }
    expect(Object.keys(BPC_MEMBER_ITEM_NAMES).sort()).toEqual(
      BPC_ITEMS.map((item) => item.itemId).sort()
    );
  });

  // -----------------------------------------------------------------
  // 5. THE ROOTED RESET LAYER, STILL THERE, NOW BELOW.
  // -----------------------------------------------------------------

  it('keeps the three named areas, under their new heading, below the strongest signals', () => {
    const text = textOf(everyItem('often'));
    expect(text).toContain(BPC_COPY.resultsSignalsHeading);
    expect(text).toContain('Breathing sensations');
    expect(text).toContain('Tension signals');
    expect(text).toContain('Body sensations');
    expect(text.indexOf(BPC_COPY.resultsStrongestHeading)).toBeLessThan(
      text.indexOf(BPC_COPY.resultsSignalsHeading)
    );
  });

  it('puts the score above everything else on the screen', () => {
    const text = textOf(sittingWorth(27).answers);
    const scoreAt = text.indexOf(BPC_COPY.resultsTitle);
    expect(scoreAt).toBeGreaterThanOrEqual(0);
    expect(scoreAt).toBeLessThan(text.indexOf(BPC_COPY.resultsMeaningHeading));
    expect(text.indexOf(BPC_COPY.resultsMeaningHeading)).toBeLessThan(
      text.indexOf(BPC_COPY.resultsStrongestHeading)
    );
  });

  // -----------------------------------------------------------------
  // 6. THE BUTTONS, AND THE COPY RULES.
  // -----------------------------------------------------------------

  it('keeps both buttons and the footer line', () => {
    const text = textOf(everyItem('often'));
    expect(text).toContain(BPC_COPY.resultsPrimaryCta);
    expect(text).toContain(BPC_COPY.resultsSecondaryCta);
    expect(text).toContain(BPC_COPY.resultsCoachNote);
    expect(text).toContain(BPC_COPY.resultsDisclaimer);
  });

  it('carries no em dash on any reading she can land on', () => {
    for (const target of [0, 1, 22, 23, 24, 40, 64]) {
      expect(textOf(sittingWorth(target).answers), `total ${target}`).not.toContain(EM_DASH);
    }
    expect(textOf(everyItem('sometimes'))).not.toContain(EM_DASH);
  });

  it('names no clinical vocabulary beyond the reference threshold', () => {
    const text = textOf(sittingWorth(50).answers).toLowerCase();
    for (const word of [
      'nijmegen',
      'questionnaire',
      'hyperventilation',
      'dysfunctional breathing',
      'syndrome',
      'symptom',
    ]) {
      expect(text, word).not.toContain(word);
    }
    // "disorder" appears exactly once, inside the sentence that refuses a
    // diagnosis, and nowhere else.
    expect(text.split('disorder')).toHaveLength(2);
    expect(text).toContain('this is not a diagnosis of a breathing disorder');
  });
});

// ---------------------------------------------------------------------

describe('the primary button opens a Root conversation about this sitting', () => {
  it('points at the conversation route, carrying its own entry point', () => {
    expect(BPC_RESULTS_PRIMARY_HREF).toBe(`/conversation?entry=${BPC_CONVERSATION_ENTRY}`);
    expect(BPC_CONVERSATION_ENTRY).toBe('breathing_check_in');
  });

  it('carries no score in the link, so a pasted one cannot describe a sitting that is not hers', () => {
    expect(BPC_RESULTS_PRIMARY_HREF).not.toMatch(/\d/);
  });

  it('opens with a line about the check-in she has just finished', () => {
    const seed = buildBpcConversationSeed(viewFor(sittingWorth(27).answers));
    expect(seed?.opener).toBe(BPC_CONVERSATION_OPENER);
    expect(seed?.opener).toContain('Breathing Pattern Check-In');
    expect(seed?.opener).not.toContain(EM_DASH);
  });

  it('hands Root this sitting: the total, the reference figure and the strongest answers', () => {
    const answers: BpcAnswers = {
      tight_chest: 'very_often',
      feeling_tense: 'often',
      short_of_breath: 'often',
      palpitations: 'often',
      chest_pain: 'sometimes',
    };
    const seed = buildBpcConversationSeed(viewFor(answers));
    const total = scoreBpcAnswers(answers).totalScore;

    expect(seed?.entryContext).toContain(`${total} out of ${BPC_MAX_SCORE}`);
    expect(seed?.entryContext).toContain(String(BPC_REFERENCE_THRESHOLD));
    expect(seed?.entryContext).toContain('Tightness in the chest (Very often)');
    expect(seed?.entryContext).toContain('Feeling tense (Often)');
    // "Sometimes" is not one of her strongest, on either side.
    expect(seed?.entryContext).not.toContain('Pain in the chest');
  });

  it('says which side of the reference figure she fell, in the context too', () => {
    expect(buildBpcConversationSeed(viewFor(sittingWorth(23).answers))?.entryContext).toContain(
      'at or above the traditional reference threshold'
    );
    expect(buildBpcConversationSeed(viewFor(sittingWorth(22).answers))?.entryContext).toContain(
      'below the traditional reference threshold'
    );
  });

  it('tells Root the standing interpretation rules, on top of the system prompt', () => {
    const context = buildBpcConversationSeed(viewFor(sittingWorth(40).answers))?.entryContext ?? '';
    expect(context).toContain('Never name the underlying instrument');
    expect(context).toContain('never diagnose anything');
    expect(context).toContain('no clinical vocabulary');
    expect(context).toContain('one clear next step at a time');
    expect(context).not.toContain('Nijmegen');
    expect(context).not.toContain(EM_DASH);
  });

  it('says plainly when nothing came back high, rather than listing nothing at all', () => {
    const context =
      buildBpcConversationSeed(viewFor(everyItem('sometimes')))?.entryContext ?? '';
    expect(context).toContain('No single answer came back at the higher end of the scale.');
  });

  it('seeds nothing at all when there is no finished sitting to talk about', () => {
    expect(buildBpcConversationSeed(null)).toBeNull();
  });
});
