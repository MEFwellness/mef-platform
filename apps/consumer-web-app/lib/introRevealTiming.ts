/**
 * Pure timing helper for components/IntroReveal.tsx's line-by-line reveal,
 * deliberately kept in a plain (no 'use client') module. Real bug this
 * avoids: components/IntroReveal.tsx is a Client Component, and Next.js
 * treats every export of a 'use client' file — even a plain, non-React
 * function — as a client reference when a Server Component imports it.
 * FirstCheckInWelcome.tsx (a Server Component) calling this at module scope
 * threw "introRevealFollowUpDelayMs is not a function" at runtime, caught
 * during this session's own browser verification, once it needed the same
 * delay math to sequence content after an IntroReveal block it renders.
 */

export const INTRO_REVEAL_LINE_BASE_DELAY_MS = 500;
export const INTRO_REVEAL_LINE_STEP_MS = 550;

/** The delay (ms) at which content following IntroReveal's own lines — typically a CTA button — should itself fade in, so it lands only once every line has landed, however many lines a given screen passed in. */
export function introRevealFollowUpDelayMs(
  lineCount: number,
  lineBaseDelayMs: number = INTRO_REVEAL_LINE_BASE_DELAY_MS,
  lineStepMs: number = INTRO_REVEAL_LINE_STEP_MS
): number {
  return lineBaseDelayMs + lineCount * lineStepMs;
}
