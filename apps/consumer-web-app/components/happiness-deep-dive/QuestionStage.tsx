'use client';

/**
 * How a question arrives on every Happiness deep-dive.
 *
 * ONE COMPONENT, FIVE TEMPLATES. Owning Your Value, Where Your Joy Lives,
 * The Giving Ledger, The Weight of Yes and Being Seen all render their
 * prompts through this, so the treatment is a property of the experience
 * TYPE rather than copy inside one template. A sixth inherits it by using
 * it.
 *
 * THE QUESTION TYPES ITSELF, THEN THE BOX ARRIVES. Root asks in its own
 * voice, at a calm speaking pace, and only once the question is finished
 * does the writing box appear. She cannot type ahead of the question,
 * because the box does not exist yet: the children of this component are
 * not rendered until the prompt has landed, which is the difference between
 * a treatment and a decoration painted over a form.
 *
 * IT IS A PACE, NOT A WAIT. The rate and its cap live in
 * lib/happiness-deep-dive/motion.ts and are chosen so the longest prompt in
 * the family still finishes inside about three and a half seconds. A member
 * should never feel punished by this.
 *
 * ONE QUESTION MAY ASK HER TO SIT INSIDE A LENGTH OF TIME. `hold` is that:
 * a ring that fills over the named number of seconds between the question
 * finishing and the box arriving. It is part of the arrival, deliberately,
 * so there is one mechanism rather than a second gate bolted in front of
 * the box. See HoldRing.
 *
 * ALREADY SEEN THIS SITTING MEANS SHOWN COMPLETE. `instant` is what the
 * caller passes for a question she is landing back on: a resume, or a tap
 * on Back. Nothing re-types, nothing re-holds, and the box is there
 * immediately. Save and resume is unchanged by any of this.
 *
 * REDUCED MOTION IS THE SAME PATH AS ALREADY SEEN. Question complete, box
 * present, gentle fade, no timers, everything usable. It is read from the
 * one shared hook (lib/motion/useReducedMotion.ts) rather than a private
 * media query listener.
 *
 * THE SCREEN READER NEVER WAITS. The shared Typewriter renders the whole
 * prompt in a visually hidden duplicate from the first frame, so the
 * letter-by-letter reveal is a purely visual effect. The writing box is
 * genuinely absent until it is due, which is announced by its arrival
 * rather than by a hidden control.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useReducedMotion } from '@/lib/motion/useReducedMotion';
import { Typewriter } from '@/components/reveal/Typewriter';
import {
  HDD_WRITING_BOX_DELAY_MS,
  hddQuestionMsPerChar,
} from '@/lib/happiness-deep-dive/motion';
import { HoldRing } from './HoldRing';

export type QuestionHold = {
  seconds: number;
  /** What the ring says while it fills. Read by a screen reader; the ring itself is decorative. */
  label: string;
};

export function QuestionStage({
  counter,
  prompt,
  /** Identifies the question. A change resets the reveal, so two prompts never share one typed state. */
  revealKey,
  instant = false,
  hold = null,
  onRevealed,
  children,
}: {
  counter: string;
  prompt: string;
  revealKey: string;
  instant?: boolean;
  hold?: QuestionHold | null;
  /** Called once the writing box is on screen, so the caller can record that this question has now been seen this sitting. */
  onRevealed?: () => void;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const skip = instant || reducedMotion;

  // Three states, in order: the prompt is typing, the hold is running, the
  // box is here. `skip` starts at the end of that sequence.
  //
  // THE RESET IS DERIVED DURING RENDER, NOT DONE IN AN EFFECT, and the
  // `key` carried alongside is what makes that possible. An effect runs
  // AFTER the browser has been given a frame to paint, so a reset done
  // there would paint question five's writing box, and part of question
  // five's prompt, for one frame before clearing them. React re-renders
  // immediately when state is set during a render, so nothing wrong is ever
  // committed. This is the documented "adjusting state when a prop changes"
  // pattern rather than a trick.
  const [reveal, setReveal] = useState(() => ({ key: revealKey, typed: skip, ready: skip }));
  if (reveal.key !== revealKey) {
    setReveal({ key: revealKey, typed: skip, ready: skip });
  } else if (skip && !reveal.ready) {
    // Reduced motion is only known after the first client render, so a
    // sequence that had already started is finished rather than left
    // half typed.
    setReveal({ key: revealKey, typed: true, ready: true });
  }
  const typed = reveal.key === revealKey ? reveal.typed : skip;
  const ready = reveal.key === revealKey ? reveal.ready : skip;

  // The breath after the question, then the hold when this question has
  // one, then the box.
  useEffect(() => {
    if (!typed || ready) return undefined;
    const holdMs = hold && !skip ? Math.max(0, hold.seconds) * 1000 : 0;
    const timer = setTimeout(
      () =>
        setReveal((previous) =>
          previous.key === revealKey ? { ...previous, ready: true } : previous
        ),
      HDD_WRITING_BOX_DELAY_MS + holdMs
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed, ready, revealKey, skip]);

  useEffect(() => {
    if (ready) onRevealed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, revealKey]);

  return (
    <div className="relative mt-4">
      <p className="text-[11px] uppercase tracking-wider text-[#F5F0E4]/45">{counter}</p>

      <Typewriter
        as="h1"
        text={prompt}
        skip={skip}
        msPerChar={hddQuestionMsPerChar(prompt)}
        onDone={() =>
          setReveal((previous) =>
            previous.key === revealKey ? { ...previous, typed: true } : previous
          )
        }
        className="mt-2 block font-[family-name:var(--font-cormorant-garamond)] text-[28px] leading-snug text-[#F5F0E4]"
      />

      {/*
        THE RING, IN ITS TWO STATES.
        Filling, it holds the screen between the question and the box, and
        then it leaves with the box's arrival rather than sitting under it,
        because it was a beat and not a control.
        Still, it is what reduced motion and a question she is landing back
        on get: the same mark on the same screen, drawn complete, with
        nothing timed and nothing to wait for.
      */}
      {hold && (skip || (typed && !ready)) && (
        <div className="mt-6">
          <HoldRing seconds={hold.seconds} label={hold.label} still={skip} />
        </div>
      )}

      {ready && <div className={skip ? undefined : 'mef-fade-in'}>{children}</div>}
    </div>
  );
}
