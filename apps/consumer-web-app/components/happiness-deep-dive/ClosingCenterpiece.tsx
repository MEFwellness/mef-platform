'use client';

/**
 * The closing centerpiece of every Happiness deep-dive, and how it arrives.
 *
 * ONE COMPONENT, FIVE TEMPLATES, FIVE DIFFERENT SENTENCES. What each
 * template prints here is its own (one answer, or two side by side, with or
 * without a fixed line beneath), but the treatment is shared, so the moment
 * she has just written nine answers into looks and paces the same whichever
 * template she was sent.
 *
 * THE ARRIVAL, IN ORDER. She taps Finish and the screen goes QUIET first,
 * with nothing on it at all. Then her own words fade in, one line at a
 * time, in the serif face. Then, after a real pause, the one fixed line
 * arrives last. Every duration is in lib/happiness-deep-dive/motion.ts.
 *
 * THE PAUSE IS THE POINT. A closing that painted everything at once was a
 * results screen. Staged like this it is a held moment, and the fixed line
 * beneath her sentence reads as an answer to it rather than as a caption
 * printed with it.
 *
 * HER WORDS ARE NOT EDITED, INCLUDING BY THIS ANIMATION. The lines are her
 * own line breaks and nothing else (hddClosingLines), each one is a span
 * inside one pre-wrapped block, and the literal newlines between them are
 * still in the DOM. So the text a reader, a screen reader or a verification
 * script pulls off this element is character for character what she stored,
 * even mid-reveal. Nothing is trimmed, re-wrapped, capitalised or given
 * punctuation it did not have, and nothing is clamped or truncated: a long
 * sentence is allowed to be long.
 *
 * THE HELD-UNTIL-TAPPED GUARANTEE IS UNCHANGED BY ANY OF THIS. This is a
 * reveal inside a screen that is already standing. It does not navigate, it
 * does not advance, and it does not finish into anything: when it is done,
 * the closing is simply fully visible, exactly as it was before, waiting for
 * her tap.
 *
 * REDUCED MOTION, AND EVERY LATER VIEWING, ARRIVE COMPLETE. `instant` is
 * what the already-finished panel and the last screen pass, because the
 * staged arrival belongs to the moment she finishes and nothing is gained
 * by making her sit through it again on the way out.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useReducedMotion } from '@/lib/motion/useReducedMotion';
import {
  hddClosingFixedLineDelayMs,
  hddClosingLineDelayMs,
  hddClosingLines,
} from '@/lib/happiness-deep-dive/motion';

/** One block of her own writing, with the question or label it answers. */
export type ClosingEntry = {
  /** Small text above her words. A label naming whose words they are, or the prompt they answer. */
  caption?: string | undefined;
  /** Whether the caption is a gold uppercase label or the quiet grey wording of a question. */
  captionTone?: 'label' | 'prompt';
  /** Her answer, exactly as it is stored. */
  text: string;
};

/**
 * Reveals `children` once `delayMs` has passed, by mounting them rather
 * than by fading a present element.
 *
 * MOUNTING, NOT HIDING, on purpose. An element faded in by a CSS delay is
 * still in the tree the whole time: invisible, and on a closing screen that
 * carries a button, tappable. Nothing here is on screen before it is due.
 */
function useDue(delayMs: number, instant: boolean): boolean {
  const [due, setDue] = useState(instant);
  useEffect(() => {
    if (instant) {
      setDue(true);
      return undefined;
    }
    setDue(false);
    const timer = setTimeout(() => setDue(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, instant]);
  return due;
}

function Beat({
  delayMs,
  instant,
  className,
  children,
}: {
  delayMs: number;
  instant: boolean;
  className?: string | undefined;
  children: ReactNode;
}) {
  const due = useDue(delayMs, instant);
  if (!due) return null;
  return <div className={`${instant ? '' : 'mef-fade-in'} ${className ?? ''}`}>{children}</div>;
}

/**
 * Her own words, revealed a line at a time inside one pre-wrapped block.
 *
 * The spans and the newline text nodes between them mean the block's text
 * content is her stored string exactly, whatever is currently visible.
 *
 * THE PER-LINE DELAYS ARE RELATIVE TO THIS BLOCK'S OWN ARRIVAL, because the
 * Beat around it has already waited out everything before its first line.
 * Absolute delays here would be counted twice and the last line of a long
 * answer would arrive minutes late.
 */
function HerWords({
  text,
  className,
  startIndex,
  instant,
}: {
  text: string;
  className: string;
  startIndex: number;
  instant: boolean;
}) {
  const lines = hddClosingLines(text);
  const blockStart = hddClosingLineDelayMs(startIndex);
  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {lines.map((line, index) => (
        <span key={index}>
          {index > 0 ? '\n' : ''}
          <span
            className={instant ? undefined : 'mef-fade-in'}
            style={
              instant
                ? undefined
                : {
                    animationDelay: `${hddClosingLineDelayMs(startIndex + index) - blockStart}ms`,
                  }
            }
          >
            {line}
          </span>
        </span>
      ))}
    </p>
  );
}

export function ClosingCenterpiece({
  eyebrow,
  entries,
  layout = 'single',
  fixedLine,
  instant = false,
}: {
  /** A short gold label above her words. Names whose words they are and does nothing else. */
  eyebrow?: string | undefined;
  entries: ClosingEntry[];
  layout?: 'single' | 'pair';
  /** The one fixed sentence beneath. Omitted by a template that keeps its Root line outside the figure. */
  fixedLine?: string | undefined;
  instant?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const skip = instant || reducedMotion;

  // How many lines of her own writing there are in total, which is what the
  // fixed line has to wait behind.
  const lineCount = entries.reduce((total, entry) => total + hddClosingLines(entry.text).length, 0);
  const fixedLineDelay = hddClosingFixedLineDelayMs(lineCount);

  // Where each entry's lines start in that overall sequence, so two answers
  // side by side still read as one staged reveal rather than two races.
  let cursor = 0;
  const starts = entries.map((entry) => {
    const start = cursor;
    cursor += hddClosingLines(entry.text).length;
    return start;
  });

  const isPair = layout === 'pair';

  return (
    <figure
      className={`rounded-[24px] border border-[#C4A050]/35 bg-[#F5F0E4]/[0.05] px-6 py-8 ${
        isPair ? '' : 'text-center'
      }`}
    >
      {eyebrow && (
        <Beat delayMs={hddClosingLineDelayMs(0)} instant={skip}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
            {eyebrow}
          </p>
        </Beat>
      )}

      <div className={isPair ? 'grid gap-8 md:grid-cols-2 md:gap-7' : ''}>
        {entries.map((entry, index) => (
          <Beat
            key={index}
            delayMs={hddClosingLineDelayMs(starts[index] ?? 0)}
            instant={skip}
            className={!isPair && (eyebrow || index > 0) ? 'mt-4' : undefined}
          >
            {entry.caption && (
              <p
                className={
                  entry.captionTone === 'prompt'
                    ? 'text-[11px] leading-relaxed text-[#F5F0E4]/45'
                    : 'text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]'
                }
              >
                {entry.caption}
              </p>
            )}
            <HerWords
              text={entry.text}
              startIndex={starts[index] ?? 0}
              instant={skip}
              className={`font-[family-name:var(--font-cormorant-garamond)] text-[#F5F0E4] ${
                isPair ? 'text-[21px] leading-[1.4]' : 'text-[26px] leading-[1.35]'
              } ${entry.caption ? 'mt-3' : ''}`}
            />
          </Beat>
        ))}
      </div>

      <Beat delayMs={fixedLineDelay} instant={skip}>
        <span aria-hidden="true" className="mx-auto mt-8 block h-px w-12 bg-[#C4A050]/50" />
        {fixedLine && (
          <figcaption
            className={`mt-6 text-[15px] leading-relaxed text-[#C4A050] ${isPair ? 'text-center' : ''}`}
          >
            {fixedLine}
          </figcaption>
        )}
      </Beat>
    </figure>
  );
}

/**
 * Whatever a template says after the centerpiece: its heading, its body and
 * the button that carries her onward.
 *
 * It arrives LAST, after the fixed line has had its own pause, so the
 * closing reads in one direction: her words, then the one line beneath them,
 * then the way onward. The button is genuinely absent until then rather
 * than invisible and tappable.
 */
export function ClosingTail({
  delayMs,
  instant = false,
  children,
}: {
  delayMs: number;
  instant?: boolean;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const skip = instant || reducedMotion;
  const due = useDue(delayMs, skip);
  if (!due) return null;
  return <div className={skip ? undefined : 'mef-fade-in'}>{children}</div>;
}
