'use client';

/**
 * The beat between two screens of a Happiness deep-dive.
 *
 * A DARK HELD SCREEN WITH ONE THING ON IT, like a chapter card in a film:
 * the section title, appearing letter by letter, and then a hold before the
 * first question of that screen begins. About two seconds either way, from
 * lib/happiness-deep-dive/motion.ts.
 *
 * WHAT IT IS FOR. The three screens of these templates are three different
 * subjects, and moving from one to the next used to be indistinguishable
 * from moving from question four to question five. This makes the change of
 * subject something she feels rather than something she could have read in
 * a small gold eyebrow, and it gives her a breath between two pieces of
 * writing.
 *
 * IT PLAYS ON ARRIVAL, NEVER ON RE-ENTRY. The caller starts it when she
 * crosses into a screen by tapping, so opening the app on question five
 * lands her on question five and not in the middle of a title card. See
 * useHappinessSittingMotion.
 *
 * IT IS NOT A LOADING STATE AND NOTHING IS WAITING BEHIND IT. Her draft is
 * already saved by the time it plays, and it finishes on its own timer.
 *
 * REDUCED MOTION SKIPS IT ENTIRELY rather than showing a still title card
 * for two seconds, because a held pause with nothing moving is a delay
 * rather than a treatment. The caller decides that (it never starts the
 * beat), and this component asserts nothing about it.
 *
 * A screen reader is given the title once, through the shared Typewriter's
 * own visually hidden duplicate.
 */

import { useEffect } from 'react';
import { Typewriter } from '@/components/reveal/Typewriter';
import { hddChapterBeatMs, hddChapterMsPerChar } from '@/lib/happiness-deep-dive/motion';

export function ChapterCard({ title, onDone }: { title: string; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, hddChapterBeatMs(title));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  return (
    <div
      className="relative flex min-h-[300px] items-center justify-center px-4 py-16 text-center"
      data-hdd-chapter-card={title}
    >
      <Typewriter
        as="p"
        text={title}
        msPerChar={hddChapterMsPerChar(title)}
        className="font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-tight tracking-wide text-[#F5F0E4]"
      />
    </div>
  );
}
