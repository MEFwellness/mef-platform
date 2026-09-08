'use client';

/**
 * A line with a word at each end, and her mark somewhere on it.
 *
 * SHARED, NOT OWNED BY ONE TEMPLATE. What You Put Down is the first
 * template to use it, on the question that asks how far away a version of
 * herself feels.
 *
 * IT SETS UP WRITING, IT DOES NOT REPLACE IT. That is the standing rule for
 * every interactive element in this family (lib/happiness-deep-dive/
 * interactive.ts). She commits to a position first, and only then is she
 * asked why she put it there. The commitment is what makes the writing
 * specific.
 *
 * IT IS A REAL RANGE INPUT UNDERNEATH. The drawn line, the filled half and
 * the mark are painted on top of a native <input type="range">, which is
 * what makes this work with a finger, a mouse, a stylus, a keyboard's arrow
 * keys and a screen reader without any of that being reimplemented. The
 * painted layer is aria-hidden and never receives a tap.
 *
 * SHE HAS TO PLACE IT. Until she does, the mark sits at the middle at half
 * strength and the caption says so, because a slider that arrives already
 * answered has collected a default rather than a decision. `value` is null
 * until she places it, and the caller is what decides what happens next.
 *
 * A TAP THAT LANDS WHERE THE MARK ALREADY IS STILL COUNTS AS PLACING IT.
 * This was found on production, on the live site, and it is the reason
 * there are three handlers below rather than one. A range input fires
 * `change` only when its VALUE changes, so a member who felt exactly
 * halfway and tapped the middle of an unplaced line, whose mark is drawn at
 * 50, moved nothing: no event, no commit, no written half, and a screen
 * that appeared not to have noticed her. The same hole sits at each end,
 * where an arrow key cannot move the value any further. So the current
 * value is committed on the way out of the gesture as well
 * (`onPointerUp`, `onKeyUp`), which is idempotent: committing the value it
 * already has changes nothing except that "she has placed it" becomes true.
 *
 * THE READOUT IS WORDS, NOT A NUMBER. She reads "closer to A stranger",
 * never "78 percent", because a number here would look like a score and
 * this experience scores nothing. The words come from
 * hddPolePositionInWords, which the coach's card reads too, so a member and
 * her coach are always looking at the same sentence.
 *
 * REDUCED MOTION removes the travel from the fill and the mark. They are
 * simply where she put them.
 */

import { useId, useState } from 'react';
import { hddPolePositionInWords } from '@/lib/happiness-deep-dive/interactive';

export function PoleSlider({
  value,
  onChange,
  poles,
  label,
  unsetLabel,
  still = false,
  disabled = false,
}: {
  /** 0 is the near pole, 100 is the far pole. Null until she has placed it. */
  value: number | null;
  onChange: (value: number) => void;
  poles: { near: string; far: string };
  /** The accessible name of the control. The visible question is the QuestionStage's. */
  label: string;
  /** What the caption says before she has placed it. */
  unsetLabel: string;
  /** Reduced motion: no travel on the fill or the mark. */
  still?: boolean;
  disabled?: boolean;
}) {
  const inputId = useId();
  const [focusVisible, setFocusVisible] = useState(false);
  const position = value ?? 50;
  const words = value === null ? unsetLabel : hddPolePositionInWords(value, poles);
  const move = still ? undefined : 'left 220ms ease-out, width 220ms ease-out';

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <span className="text-[13px] font-semibold uppercase tracking-wider text-[#F5F0E4]/55">
          {poles.near}
        </span>
        <span className="text-right text-[13px] font-semibold uppercase tracking-wider text-[#F5F0E4]/55">
          {poles.far}
        </span>
      </div>

      <div className="relative mt-3 h-12">
        {/*
          The control itself, invisible and on top. It is a real range
          input, so every input method already works on it and nothing here
          reimplements dragging, arrow keys or a screen reader's own slider
          announcement.
        */}
        <input
          id={inputId}
          type="range"
          min={0}
          max={100}
          step={1}
          value={position}
          disabled={disabled}
          aria-label={label}
          aria-valuetext={words}
          onChange={(event) => onChange(Number(event.target.value))}
          // The two gestures that can END without the value having moved.
          // See this file's header: without these, the exact middle of an
          // unplaced line is a dead spot.
          onPointerUp={(event) => onChange(Number(event.currentTarget.value))}
          onKeyUp={(event) => onChange(Number(event.currentTarget.value))}
          onBlur={() => setFocusVisible(false)}
          onFocus={(event) => {
            // The ring belongs on the painted mark, which is not a sibling
            // of this input, so Tailwind's peer variants cannot reach it.
            // :focus-visible is asked directly instead, and a browser that
            // does not know the selector gets the ring rather than nothing.
            let visible = true;
            try {
              visible = event.target.matches(':focus-visible');
            } catch {
              visible = true;
            }
            setFocusVisible(visible);
          }}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />

        {/* The drawn line. Decorative: the input above it is the control. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2"
        >
          <span className="block h-px w-full rounded-full bg-[#F5F0E4]/25" />
          <span
            className="absolute top-1/2 block h-px -translate-y-1/2 rounded-full bg-[#C4A050]"
            style={{ width: `${position}%`, transition: move }}
          />
          <span
            className={`absolute top-1/2 block h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-[#1B3A2D] ${
              value === null ? 'border-[#F5F0E4]/40' : 'border-[#C4A050] shadow-[0_0_0_5px_rgba(196,160,80,0.16)]'
            } ${focusVisible ? 'ring-2 ring-[#C4A050] ring-offset-2 ring-offset-[#1B3A2D]' : ''}`}
            style={{ left: `${position}%`, transition: move }}
          />
        </div>
      </div>

      <p
        className={`mt-1 text-center text-[15px] leading-relaxed ${
          value === null ? 'text-[#F5F0E4]/50' : 'text-[#C4A050]'
        }`}
      >
        {words}
      </p>
    </div>
  );
}
