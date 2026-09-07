/**
 * The shared motion treatment for the Happiness deep-dives, in numbers.
 *
 * ONE TREATMENT, FIVE TEMPLATES. Owning Your Value, Where Your Joy Lives,
 * The Giving Ledger, The Weight of Yes and Being Seen all render their
 * question flow and their closing through the components in
 * components/happiness-deep-dive/, and those components read every duration
 * from this file. A sixth template inherits it by using the same
 * components, which is the point: there is no per-template copy of any of
 * this and no per-template number to keep in step.
 *
 * PLAIN MODULE, NO 'use client', for the reason lib/introRevealTiming.ts
 * documents: Next treats every export of a 'use client' file as a client
 * reference, so a Server Component or a test importing this math from a
 * component file would break at runtime. The math lives here, the
 * behaviour lives in the components.
 *
 * THE PHILOSOPHY THESE NUMBERS SERVE. Motion that slows her down and makes
 * the pause, never motion that entertains. Every duration below was chosen
 * against one question: does this give her a beat to think, or does it make
 * her wait? A member should never feel punished by the animation.
 *
 * WHY THE QUESTION RATE IS NOT THE INTRO RATE. The intro typewriter runs at
 * 45ms a character (lib/introRevealTiming.ts), which is right for a short
 * headline of two or three words. These prompts run to forty words, and 45
 * milliseconds a character would leave a member watching a sentence crawl
 * for eight seconds before she could write. So a question types at a
 * reading pace instead, and the whole prompt is capped: a long question
 * types faster per character rather than taking longer overall. The
 * mechanism is the same shared Typewriter either way, given a different
 * rate.
 *
 * REDUCED MOTION IS NOT A SLOWER VERSION OF THIS, it is none of it. When
 * the device asks for reduced motion, every component here shows its
 * finished state immediately with a gentle fade and nothing is timed at
 * all. That branch lives in the components; the numbers below are simply
 * never read on it.
 */

/**
 * How fast a question types, at a calm speaking pace.
 *
 * Roughly 45 characters a second, which is close to how fast a person
 * reads a sentence out loud. Deliberately faster than the intro headline's
 * 45ms, for the reason in this file's header.
 */
export const HDD_QUESTION_MS_PER_CHAR = 22;

/**
 * The longest any question may spend typing, however long it is.
 *
 * A cap rather than a rate, so the nine prompts of a template all finish
 * within about the same beat and the longest one is not the slowest thing
 * in the sitting.
 */
export const HDD_QUESTION_MAX_TYPING_MS = 3400;

/** The breath between the question finishing and the writing box arriving. */
export const HDD_WRITING_BOX_DELAY_MS = 340;

/** How long the writing box takes to fade in once it is due. */
export const HDD_WRITING_BOX_FADE_MS = 450;

/** How fast a section title types on the chapter card. Slower than a question: it is one short phrase and it is the whole screen. */
export const HDD_CHAPTER_MS_PER_CHAR = 90;

/** The longest a chapter title may spend typing. */
export const HDD_CHAPTER_MAX_TYPING_MS = 1500;

/** The dark hold after the chapter title has finished, before the first question of that screen. */
export const HDD_CHAPTER_SETTLE_MS = 620;

/** The shortest a chapter beat may be, so a two word title still reads as a held beat rather than a flicker. */
export const HDD_CHAPTER_MIN_BEAT_MS = 1800;

/** The quiet after she taps Finish, before anything at all appears on the closing. */
export const HDD_CLOSING_QUIET_MS = 900;

/** The step between one line of her own words and the next, on the closing. */
export const HDD_CLOSING_LINE_STEP_MS = 620;

/** How long a closing line takes to fade in once it is due. */
export const HDD_CLOSING_LINE_FADE_MS = 700;

/** The real pause between the last of her own words and the one fixed line beneath them. */
export const HDD_CLOSING_FIXED_LINE_PAUSE_MS = 1500;

/** The step between the fixed line landing and whatever the template says after it. */
export const HDD_CLOSING_TAIL_PAUSE_MS = 700;

/** How long the ring takes to fill on a question that asks her to sit inside a length of time. */
export const HDD_HOLD_RING_DEFAULT_SECONDS = 5;

/**
 * The per-character rate this exact prompt types at.
 *
 * The cap is applied here rather than by shortening the prompt, so a long
 * question types faster and never takes longer than
 * HDD_QUESTION_MAX_TYPING_MS overall. An empty prompt has no rate to
 * compute, and returns the base rate rather than dividing by zero.
 */
export function hddQuestionMsPerChar(prompt: string): number {
  const length = prompt.length;
  if (length <= 0) return HDD_QUESTION_MS_PER_CHAR;
  return Math.min(HDD_QUESTION_MS_PER_CHAR, HDD_QUESTION_MAX_TYPING_MS / length);
}

/** How long this prompt spends typing, start to finish. Never more than the cap. */
export function hddQuestionTypingMs(prompt: string): number {
  return Math.round(hddQuestionMsPerChar(prompt) * prompt.length);
}

/** The per-character rate a chapter title types at, capped the same way. */
export function hddChapterMsPerChar(title: string): number {
  const length = title.length;
  if (length <= 0) return HDD_CHAPTER_MS_PER_CHAR;
  return Math.min(HDD_CHAPTER_MS_PER_CHAR, HDD_CHAPTER_MAX_TYPING_MS / length);
}

/**
 * The whole chapter beat: the title typing, then the dark hold.
 *
 * Floored at HDD_CHAPTER_MIN_BEAT_MS so a short title still holds the
 * screen. About two seconds for every title any of the five templates
 * carries, which is what the treatment asks for.
 */
export function hddChapterBeatMs(title: string): number {
  const typing = Math.round(hddChapterMsPerChar(title) * title.length);
  return Math.max(HDD_CHAPTER_MIN_BEAT_MS, typing + HDD_CHAPTER_SETTLE_MS);
}

/**
 * When the writing box is due on a question, measured from the moment the
 * question arrives on screen.
 *
 * `holdSeconds` is the one question in the family that asks her to sit
 * inside a length of time before she writes about it. It is added AFTER the
 * question has finished typing, because the point is to sit with the
 * question, not with a half typed one.
 */
export function hddWritingBoxDelayMs(prompt: string, holdSeconds = 0): number {
  return hddQuestionTypingMs(prompt) + HDD_WRITING_BOX_DELAY_MS + Math.max(0, holdSeconds) * 1000;
}

/**
 * When each line of her own words is due on the closing, measured from the
 * moment the closing screen appears.
 *
 * Index 0 lands after the quiet, and every line after it steps by
 * HDD_CLOSING_LINE_STEP_MS.
 */
export function hddClosingLineDelayMs(index: number): number {
  return HDD_CLOSING_QUIET_MS + Math.max(0, index) * HDD_CLOSING_LINE_STEP_MS;
}

/**
 * When the one fixed line beneath her words is due.
 *
 * After the LAST of her lines has landed AND had a real pause, so it never
 * arrives on top of her own sentence.
 */
export function hddClosingFixedLineDelayMs(lineCount: number): number {
  const lastLine = hddClosingLineDelayMs(Math.max(0, lineCount - 1));
  return lastLine + HDD_CLOSING_LINE_FADE_MS + HDD_CLOSING_FIXED_LINE_PAUSE_MS;
}

/**
 * When the template's own words after the centerpiece are due: the heading,
 * the body, and the button that carries her onward.
 *
 * A centerpiece with no fixed line (Owning Your Value keeps its Root line
 * outside the figure) still gets the same tail pause, so the two shapes
 * arrive at the same rhythm.
 */
export function hddClosingTailDelayMs(lineCount: number, hasFixedLine: boolean): number {
  const base = hasFixedLine
    ? hddClosingFixedLineDelayMs(lineCount) + HDD_CLOSING_LINE_FADE_MS
    : hddClosingLineDelayMs(Math.max(0, lineCount - 1)) + HDD_CLOSING_LINE_FADE_MS;
  return base + HDD_CLOSING_TAIL_PAUSE_MS;
}

/**
 * Her stored answer, split into the lines the closing fades in one at a
 * time.
 *
 * HER WORDS ARE NOT EDITED. This splits on the line breaks she typed and
 * nothing else: no sentence splitting, no trimming, no re-wrapping and no
 * punctuation added. Rejoining the result with a newline gives back exactly
 * the string that was stored, which is what lets the closing render her
 * text verbatim while still revealing it a line at a time.
 *
 * A single line answer, which is what most of these are, is one line. That
 * is the honest result: there is nothing to stagger, and inventing breaks
 * inside her sentence to make the animation richer would be editing her.
 */
export function hddClosingLines(text: string): string[] {
  return text.split('\n');
}
