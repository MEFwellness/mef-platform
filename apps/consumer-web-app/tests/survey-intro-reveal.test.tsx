// @vitest-environment jsdom
/**
 * THE SURVEY INTRO CARD MOVES AGAIN, AND IT IS OVER IN UNDER A SECOND.
 * (2026-09-11)
 *
 * Reported from a phone: the "MEF Body Systems Survey" screen, the one
 * with the Begin button, read as plain static text. It was, and the reason
 * is worth keeping written down, because nothing was broken. IntroReveal's
 * app-wide standard is to play its reveal ONCE per device and hand out the
 * finished state on every later visit, so for anybody who had ever opened
 * this survey before there was no reveal left to see. That is the right
 * rule for a welcome and the wrong one for the screen standing between a
 * member and a task she has come back to do.
 *
 * Two opt-in properties, and every other call site keeps exactly what it
 * had:
 *
 *   `replay`   plays it on every visit instead of once per device.
 *   `pace`     'brisk' is about a third of the standard length, which is
 *              what makes replaying it affordable rather than tiresome.
 *
 * Reduced motion is not overridable from a call site and still skips the
 * whole thing, and the copy is untouched: this file holds all three.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  introRevealPacing,
  introRevealTypewriterMs,
  INTRO_REVEAL_MS_PER_CHAR,
  INTRO_REVEAL_LINE_STEP_MS,
  INTRO_REVEAL_TYPEWRITER_SETTLE_MS,
} from '../lib/introRevealTiming';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** The real headline, and the real number of body lines, on that screen. */
const TITLE = 'MEF Body Systems Survey';
const LINES = 4;

function buttonArrivesAt(pace: 'standard' | 'brisk'): number {
  const { msPerChar, settleMs, lineStepMs } = introRevealPacing(pace);
  return TITLE.length * msPerChar + settleMs + LINES * lineStepMs;
}

describe('the brisk pace', () => {
  it('leaves the standard pace exactly as it was', () => {
    const standard = introRevealPacing('standard');
    expect(standard.msPerChar).toBe(INTRO_REVEAL_MS_PER_CHAR);
    expect(standard.settleMs).toBe(INTRO_REVEAL_TYPEWRITER_SETTLE_MS);
    expect(standard.lineStepMs).toBe(INTRO_REVEAL_LINE_STEP_MS);
    expect(introRevealPacing()).toEqual(standard);
    // And the long-standing helper still answers for the standard pace,
    // because every existing caller reads it.
    expect(introRevealTypewriterMs(TITLE)).toBe(TITLE.length * INTRO_REVEAL_MS_PER_CHAR);
  });

  it('puts the whole reveal, Begin included, inside one second', () => {
    expect(buttonArrivesAt('brisk')).toBeLessThan(1000);
  });

  it('is genuinely faster than what she was waiting through before', () => {
    expect(buttonArrivesAt('standard')).toBeGreaterThan(2500);
    expect(buttonArrivesAt('brisk')).toBeLessThan(buttonArrivesAt('standard') / 2.5);
  });

  it('still types the headline rather than flashing it, and still staggers the lines', () => {
    const brisk = introRevealPacing('brisk');
    expect(brisk.msPerChar).toBeGreaterThan(0);
    expect(brisk.lineStepMs).toBeGreaterThan(0);
  });
});

describe('the survey intro asks for it, and nothing else does', () => {
  const survey = read('components/body-systems/BodySystemsExperience.tsx');

  it('is opted in on that one screen', () => {
    expect(survey).toContain('pace="brisk"');
    expect(survey).toMatch(/\breplay\b/);
  });

  it('keeps the copy exactly as it was, from the same four stored keys', () => {
    for (const key of [
      'member.intro_title',
      'member.intro_line_1',
      'member.intro_line_2',
      'member.intro_line_3',
      'member.intro_line_4',
      'member.intro_button',
    ]) {
      expect(survey).toContain(key);
    }
  });

  it('leaves every other IntroReveal screen on the standard pace, played once', () => {
    const callers = fs
      .readdirSync(path.join(ROOT, 'components'), { recursive: true, encoding: 'utf8' })
      .filter((f) => typeof f === 'string' && /\.tsx$/.test(f))
      .map((f) => path.join('components', f))
      .filter((f) => f !== 'components/IntroReveal.tsx')
      .filter((f) => read(f).includes('<IntroReveal'));
    expect(callers.length).toBeGreaterThan(5);
    for (const caller of callers) {
      if (caller.endsWith('BodySystemsExperience.tsx')) continue;
      const source = read(caller);
      expect(source).not.toContain('pace="brisk"');
      expect(source).not.toMatch(/<IntroReveal[\s\S]{0,2000}?\breplay\b[\s\S]{0,50}?\/?>/);
    }
  });
});

describe('reduced motion is still not something a call site can override', () => {
  const component = read('components/IntroReveal.tsx');

  it('is checked before the replay flag, and wins', () => {
    expect(component).toContain('const skip = reducedMotion || (!replay && seenBefore === true)');
  });

  it('renders the finished state with no animation when it is set', () => {
    // `skip` is what every branch below reads: the typewriter is handed
    // the whole string, the lines carry no delay, the button carries no
    // delay. One flag, checked in one place.
    expect(component).toContain('skip={skip}');
    expect(component).toContain('style={skip ? undefined :');
  });
});
