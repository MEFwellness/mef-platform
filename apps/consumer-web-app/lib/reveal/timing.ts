/**
 * Progressive Reveal Engine (Prompt 3) — reading-time pacing math.
 * Deliberately layered on top of lib/introRevealTiming.ts's real, shipped
 * typewriter rate (45ms/char, proven on Welcome's Page 2 and every
 * IntroReveal screen since) rather than inventing a second rate — same
 * "grounded in real code" discipline docs/motion-experience-bible.md's
 * own Prompts 1-2 already established. Kept as a plain, non-'use client'
 * module (see lib/introRevealTiming.ts's own header comment for the exact
 * Next.js Server Component / Client Component export bug this convention
 * avoids).
 *
 * Per Bible §5's "Reading-speed rule": a whole block that fades in at once
 * (rather than typing out) must stay on screen, uninterrupted, for at
 * least wordCount / 3 seconds (~180 words/minute) before any auto-advance
 * is even eligible to fire. `readingFloorMs` is that floor, in ms.
 */

export {
  INTRO_REVEAL_LINE_STEP_MS as REVEAL_LINE_STEP_MS,
  INTRO_REVEAL_MS_PER_CHAR as REVEAL_MS_PER_CHAR,
  INTRO_REVEAL_TYPEWRITER_SETTLE_MS as REVEAL_PAUSE_MS,
} from '@/lib/introRevealTiming';

const READING_WORDS_PER_SECOND = 3;

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Bible §5: the minimum time (ms) a block of real prose must stay on screen before any auto-advance is even eligible to fire. Never a gate on manual/tap-to-skip advancement — only on a timer. */
export function readingFloorMs(text: string): number {
  return Math.round((countWords(text) / READING_WORDS_PER_SECOND) * 1000);
}
