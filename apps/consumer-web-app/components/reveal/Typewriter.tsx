'use client';

/**
 * Progressive Reveal Engine (Prompt 3) — the one shared typewriter
 * primitive. Extracted from components/IntroReveal.tsx's own inline
 * char-by-char logic so there is a single implementation instead of two:
 * IntroReveal now renders this internally (unchanged external API), and
 * app/welcome/WelcomeFlow.tsx's Page 2 (Story) — the original hand-rolled
 * version this idiom was proven on — does too. Same 45ms/char rate as
 * both of those, via lib/reveal/timing.ts (itself re-exporting
 * lib/introRevealTiming.ts's real, shipped constant).
 *
 * A screen reader always gets the complete text immediately (a
 * visually-hidden duplicate); the visible, partially-typed text is
 * `aria-hidden`, so the letter-by-letter reveal is a purely visual
 * effect, never a comprehension delay for assistive tech.
 */

import { useEffect, useRef, useState, type ElementType } from 'react';
import { REVEAL_MS_PER_CHAR } from '@/lib/reveal/timing';

export function Typewriter({
  text,
  as: Tag = 'span',
  className = '',
  /** Render the finished state immediately with no animation — a revisit, reduced motion, or a member tapping to skip. */
  skip = false,
  onDone,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  skip?: boolean;
  onDone?: () => void;
}) {
  const [charCount, setCharCount] = useState(skip ? text.length : 0);
  const doneRef = useRef(false);

  useEffect(() => {
    if (skip) {
      setCharCount(text.length);
      if (!doneRef.current) {
        doneRef.current = true;
        onDone?.();
      }
      return undefined;
    }
    doneRef.current = false;
    setCharCount(0);
    let count = 0;
    const interval = setInterval(() => {
      count += 1;
      setCharCount(count);
      if (count >= text.length) {
        clearInterval(interval);
        if (!doneRef.current) {
          doneRef.current = true;
          onDone?.();
        }
      }
    }, REVEAL_MS_PER_CHAR);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, text]);

  return (
    <Tag className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {skip ? text : text.slice(0, charCount)}
        {!skip && charCount < text.length && <span className="mef-typewriter-caret" aria-hidden="true" />}
      </span>
    </Tag>
  );
}
