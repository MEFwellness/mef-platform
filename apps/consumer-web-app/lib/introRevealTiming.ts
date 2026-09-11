/**
 * Pure timing helpers for components/IntroReveal.tsx's typewriter-then-
 * lines reveal, deliberately kept in a plain (no 'use client') module.
 * Real bug this avoids: components/IntroReveal.tsx is a Client Component,
 * and Next.js treats every export of a 'use client' file — even a plain,
 * non-React function — as a client reference when a Server Component
 * imports it. FirstCheckInWelcome.tsx (a Server Component) calling this at
 * module scope threw "introRevealFollowUpDelayMs is not a function" at
 * runtime, caught during an earlier session's own browser verification,
 * once it needed the same delay math to sequence content after an
 * IntroReveal block it renders.
 *
 * Same per-character rate (45ms) and idiom as the existing typewriter on
 * app/welcome/WelcomeFlow.tsx's Page 2 (Story) — reused, not reinvented.
 */

export const INTRO_REVEAL_MS_PER_CHAR = 45;
export const INTRO_REVEAL_TYPEWRITER_SETTLE_MS = 300;
export const INTRO_REVEAL_LINE_STEP_MS = 400;

/** How long the headline itself takes to finish typing out, one character at a time. */
export function introRevealTypewriterMs(title: string): number {
  return title.length * INTRO_REVEAL_MS_PER_CHAR;
}

/** The delay (ms) at which content following IntroReveal's own reveal — a button IntroReveal doesn't own itself, a journey card, a caption — should appear, so it always lands only once the real headline has finished typing and every body line has landed, however long the headline or however many lines a given screen passed in. */
export function introRevealFollowUpDelayMs(title: string, lineCount: number): number {
  return introRevealTypewriterMs(title) + INTRO_REVEAL_TYPEWRITER_SETTLE_MS + lineCount * INTRO_REVEAL_LINE_STEP_MS;
}

/**
 * THE BRISK PACE, FOR A SCREEN THAT STANDS BETWEEN A MEMBER AND A TASK.
 * (2026-09-11)
 *
 * The standard pace above is written for a welcome: a headline typing at
 * 45ms a character, a 300ms settle, and body lines 400ms apart. For "MEF
 * Body Systems Survey" and four lines of copy that puts the Begin button
 * on screen at about 2.9 seconds, and a member who has opened a survey
 * she has decided to take is not being welcomed, she is being delayed.
 *
 * These are the same three numbers, roughly a third of the length, which
 * puts the whole reveal under a second: the headline is still visibly
 * typed rather than faded, the lines still arrive one after another
 * rather than together, and nothing is ever ahead of a reader.
 *
 * Opt in per screen with IntroReveal's `pace="brisk"`. Every existing
 * call site omits it and keeps the standard pace exactly.
 */
export const INTRO_REVEAL_BRISK_MS_PER_CHAR = 18;
export const INTRO_REVEAL_BRISK_SETTLE_MS = 120;
export const INTRO_REVEAL_BRISK_LINE_STEP_MS = 110;

export type IntroRevealPace = 'standard' | 'brisk';

/** The three timing numbers for a pace, so a caller reads one thing rather than three constants. */
export function introRevealPacing(pace: IntroRevealPace = 'standard'): {
  msPerChar: number;
  settleMs: number;
  lineStepMs: number;
} {
  return pace === 'brisk'
    ? {
        msPerChar: INTRO_REVEAL_BRISK_MS_PER_CHAR,
        settleMs: INTRO_REVEAL_BRISK_SETTLE_MS,
        lineStepMs: INTRO_REVEAL_BRISK_LINE_STEP_MS,
      }
    : {
        msPerChar: INTRO_REVEAL_MS_PER_CHAR,
        settleMs: INTRO_REVEAL_TYPEWRITER_SETTLE_MS,
        lineStepMs: INTRO_REVEAL_LINE_STEP_MS,
      };
}
