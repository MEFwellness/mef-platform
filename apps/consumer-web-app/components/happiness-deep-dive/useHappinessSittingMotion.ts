'use client';

/**
 * The state behind the shared Happiness deep-dive treatment: which
 * questions she has already watched arrive this sitting, and whether a
 * chapter beat is playing right now.
 *
 * ONE HOOK, FIVE TEMPLATES, so the rules below are the same rules
 * everywhere rather than five nearly identical copies of a Set and a
 * timeout.
 *
 * WHAT COUNTS AS "ALREADY SEEN". Two things, and only two:
 *
 *   she wrote it        every question carrying an answer in the draft she
 *                       arrived with. She has read those, so re-typing them
 *                       on a Back tap would be Root repeating itself.
 *   she landed on it    the question a resume puts her on. Save and resume
 *                       lands her on the question she stopped at with its
 *                       text already complete, which is what re-entry
 *                       should feel like: picking a pen back up, not being
 *                       read to again.
 *
 * Everything else types. Forward through a sitting, every question she has
 * not met arrives in Root's voice.
 *
 * THE CHAPTER BEAT PLAYS ON A TAP, NEVER ON A MOUNT. It is started by the
 * caller when she crosses into a screen by tapping Begin or Continue, so
 * opening the app on question five lands on question five rather than in
 * the middle of a title card for a screen she is already halfway through.
 *
 * REDUCED MOTION NEVER STARTS A BEAT AT ALL. A held dark pause with nothing
 * moving is a delay, not a treatment, so `playChapter` is a no-op and the
 * caller's next screen simply appears. That decision is made here, once,
 * rather than by each template remembering to ask.
 *
 * NOTHING HERE IS PERSISTED. It is the shape of one sitting, in memory, and
 * a genuinely new page load is a genuinely new sitting. The draft is what
 * survives, and it survives in the database.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from '@/lib/motion/useReducedMotion';

export type HappinessSittingMotion = {
  /** The section title currently holding the screen, or null when no beat is playing. */
  chapterTitle: string | null;
  /** Start a beat for a screen she is crossing into. A no-op under reduced motion. */
  playChapter: (title: string) => void;
  /** End the current beat. Passed straight to ChapterCard's onDone. */
  endChapter: () => void;
  /** True when this question should be shown complete, with no typing and no hold. */
  hasSeen: (key: string) => boolean;
  /** Record that this question has now arrived. Called by QuestionStage once its writing box is on screen. */
  markSeen: (key: string) => void;
};

export function useHappinessSittingMotion(initialSeenKeys: string[]): HappinessSittingMotion {
  const reducedMotion = useReducedMotion();
  // A ref, not state: marking a question seen must not re-render the screen
  // she is writing on, and nothing reads it except the next arrival.
  const seen = useRef<Set<string>>(new Set(initialSeenKeys));
  const [chapterTitle, setChapterTitle] = useState<string | null>(null);

  const playChapter = useCallback(
    (title: string) => {
      if (reducedMotion) return;
      setChapterTitle(title);
    },
    [reducedMotion]
  );

  const endChapter = useCallback(() => setChapterTitle(null), []);

  const hasSeen = useCallback((key: string) => seen.current.has(key), []);
  const markSeen = useCallback((key: string) => {
    seen.current.add(key);
  }, []);

  return useMemo(
    () => ({ chapterTitle, playChapter, endChapter, hasSeen, markSeen }),
    [chapterTitle, playChapter, endChapter, hasSeen, markSeen]
  );
}

/**
 * The questions that are already "seen" the moment a sitting opens.
 *
 * Pure, and separate from the hook, so a template can compute it from its
 * own draft shape and so it is testable without rendering anything.
 */
export function initialSeenKeys(
  answeredKeys: string[],
  landingKey: string | null
): string[] {
  return landingKey ? [...answeredKeys, landingKey] : [...answeredKeys];
}
