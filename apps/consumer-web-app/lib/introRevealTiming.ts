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
