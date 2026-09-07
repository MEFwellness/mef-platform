'use client';

/**
 * The second half of a question that opened with something she did, typed
 * in Root's voice the way the first half was.
 *
 * WHY THIS EXISTS AND IS NOT JUST A PARAGRAPH. On a template whose
 * signature is the instinct pick, the written question is the half that
 * carries the weight, and it arrives AFTER she has committed. Printing it
 * as a plain paragraph the moment she taps would make the pick feel like a
 * form field she had filled in. Typed, at the same pace as the question
 * above it, it reads as Root answering her pick with the real question.
 *
 * IT IS THE SAME TREATMENT, NOT A SECOND ONE. Same shared Typewriter, same
 * rate from lib/happiness-deep-dive/motion.ts, same breath before the
 * writing box, same reduced-motion rule. QuestionStage is this plus the
 * counter and the h1; this is deliberately neither, because a screen never
 * carries two question numbers and never carries two first-level headings.
 *
 * THE BOX DOES NOT EXIST UNTIL THE PROMPT HAS LANDED, exactly as it does
 * not on the first half. She cannot type ahead of a question she has not
 * been asked.
 *
 * ALREADY SEEN THIS SITTING MEANS SHOWN COMPLETE. `instant` is what the
 * caller passes for a question she is landing back on: a resume, or a tap
 * on Back. Nothing re-types and the box is there immediately.
 *
 * REDUCED MOTION IS THE SAME PATH AS ALREADY SEEN. Prompt complete, box
 * present, no timers, everything usable, read from the one shared hook.
 *
 * THE SCREEN READER NEVER WAITS. The shared Typewriter renders the whole
 * prompt in a visually hidden duplicate from the first frame, so the
 * letter-by-letter reveal is a purely visual effect.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useReducedMotion } from '@/lib/motion/useReducedMotion';
import { Typewriter } from '@/components/reveal/Typewriter';
import {
  HDD_WRITING_BOX_DELAY_MS,
  hddQuestionMsPerChar,
} from '@/lib/happiness-deep-dive/motion';

export function FollowUpPrompt({
  prompt,
  /** Identifies this prompt. A change resets the reveal, so two prompts never share one typed state. */
  revealKey,
  instant = false,
  onRevealed,
  children,
}: {
  prompt: string;
  revealKey: string;
  instant?: boolean;
  /** Called once the writing box is on screen, so the caller can record that this half has now been seen. */
  onRevealed?: () => void;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const skip = instant || reducedMotion;

  // THE RESET IS DERIVED DURING RENDER, NOT DONE IN AN EFFECT, for the
  // reason QuestionStage's own header gives: an effect runs after the
  // browser has been given a frame, so a reset done there would paint the
  // previous prompt's finished state for one frame.
  const [reveal, setReveal] = useState(() => ({ key: revealKey, typed: skip, ready: skip }));
  if (reveal.key !== revealKey) {
    setReveal({ key: revealKey, typed: skip, ready: skip });
  } else if (skip && !reveal.ready) {
    // Reduced motion is only known after the first client render, so a
    // sequence that had already started is finished rather than left half
    // typed.
    setReveal({ key: revealKey, typed: true, ready: true });
  }
  const typed = reveal.key === revealKey ? reveal.typed : skip;
  const ready = reveal.key === revealKey ? reveal.ready : skip;

  useEffect(() => {
    if (!typed || ready) return undefined;
    const timer = setTimeout(
      () =>
        setReveal((previous) =>
          previous.key === revealKey ? { ...previous, ready: true } : previous
        ),
      HDD_WRITING_BOX_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [typed, ready, revealKey]);

  useEffect(() => {
    if (ready) onRevealed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, revealKey]);

  return (
    <div>
      <Typewriter
        as="p"
        text={prompt}
        skip={skip}
        msPerChar={hddQuestionMsPerChar(prompt)}
        onDone={() =>
          setReveal((previous) =>
            previous.key === revealKey ? { ...previous, typed: true } : previous
          )
        }
        className="block font-[family-name:var(--font-cormorant-garamond)] text-[22px] leading-snug text-[#F5F0E4]"
      />

      {ready && <div className={skip ? 'mt-3' : 'mef-fade-in mt-3'}>{children}</div>}
    </div>
  );
}
