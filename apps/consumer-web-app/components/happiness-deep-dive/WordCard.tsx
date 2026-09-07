'use client';

/**
 * One card carrying words a member wrote, on a Happiness deep-dive.
 *
 * SHARED, NOT OWNED BY ONE TEMPLATE. What You Put Down is the first
 * template to use it, and it is built to be the piece any later template
 * reaches for when it needs to hand her own sentence back to her as an
 * object she can move, mark or choose.
 *
 * THE TEXT IS HERS AND IS NEVER EDITED HERE. No truncation, no line clamp,
 * no ellipsis, no capitalisation and no added punctuation. A long line is
 * allowed to be long and wraps; the card grows. A card that shortened her
 * sentence to fit a row would be Root rewriting her in the one place the
 * whole point is that these are her words.
 *
 * FOUR TONES, AND EACH ONE MEANS SOMETHING SHE DID:
 *
 *   waiting   still in her hand, not yet placed.
 *   resting   placed, and nothing more said about it.
 *   marked    the one she named (the card that stings most to read back).
 *             A gold outline, which is a mark rather than a score.
 *   lifted    the one she took back off the shelf. Warm gold, raised, and
 *             under reduced motion exactly the same gold with no rise.
 *
 * REDUCED MOTION IS A STATE, NOT A SLOWER TRANSITION. `still` is what the
 * caller passes, and it makes the lifted card a static gold card: the same
 * colour, the same weight, arrived at without travelling. That is the
 * request answered rather than the request answered slowly.
 *
 * IT IS A BUTTON ONLY WHEN THERE IS SOMETHING TO DO. With no `onSelect` it
 * renders as plain content, so the closing screen and the coach's card are
 * not full of controls that do nothing.
 */

import { forwardRef, type CSSProperties } from 'react';
import { HDD_CARD_LIFT_MS } from '@/lib/happiness-deep-dive/interactive';

export type WordCardTone = 'waiting' | 'resting' | 'marked' | 'lifted';

const BASE =
  'block w-full rounded-2xl border px-4 py-3 text-left font-[family-name:var(--font-cormorant-garamond)] text-[19px] leading-[1.35] break-words';

const TONES: Record<WordCardTone, string> = {
  waiting: 'border-[#F5F0E4]/25 bg-[#F5F0E4]/[0.10] text-[#F5F0E4]',
  resting: 'border-[#F5F0E4]/15 bg-[#F5F0E4]/[0.07] text-[#F5F0E4]',
  marked: 'border-[#C4A050]/70 bg-[#C4A050]/[0.12] text-[#F5F0E4]',
  lifted:
    'border-[#C4A050] bg-[#C4A050]/[0.22] text-[#F5F0E4] shadow-[0_14px_34px_-10px_rgba(196,160,80,0.55)]',
};

export const WordCard = forwardRef<
  HTMLDivElement,
  {
    text: string;
    tone: WordCardTone;
    /** Present only when there is genuinely something to do. Makes the card a button. */
    onSelect?: (() => void) | undefined;
    /** What a screen reader hears before her words, e.g. "Choose". Required whenever onSelect is given. */
    actionLabel?: string | undefined;
    /** For a select-one group, so assistive technology knows which one is chosen. */
    pressed?: boolean | undefined;
    /** A small gold caption above her words, naming what she did with this card. */
    note?: string | undefined;
    disabled?: boolean | undefined;
    /** No transition, no rise: the finished state, arrived at without travelling. Reduced motion. */
    still?: boolean | undefined;
    style?: CSSProperties | undefined;
    className?: string | undefined;
  }
>(function WordCard(
  {
    text,
    tone,
    onSelect,
    actionLabel,
    pressed,
    note,
    disabled = false,
    still = false,
    style,
    className,
  },
  ref
) {
  // The rise belongs to the lifted tone and to nothing else, and it is a
  // rise rather than a bounce: six pixels, well inside the motion bible's
  // travel ceiling, so a card she lifted reads as being in her hand.
  const motionStyle: CSSProperties = still
    ? {}
    : {
        transform: tone === 'lifted' ? 'translateY(-6px)' : 'translateY(0)',
        transition: `transform ${HDD_CARD_LIFT_MS}ms var(--mef-ease-standard), background-color ${HDD_CARD_LIFT_MS}ms ease-out, border-color ${HDD_CARD_LIFT_MS}ms ease-out, box-shadow ${HDD_CARD_LIFT_MS}ms ease-out`,
      };

  const body = (
    <>
      {note && (
        <span className="mb-1.5 block font-[family-name:var(--font-dm-sans)] text-[10px] font-semibold uppercase tracking-wider text-[#C4A050]">
          {note}
        </span>
      )}
      {/*
        Her line, whole. whitespace-pre-wrap so a line she typed with its own
        spacing keeps it, and break-words so a very long single word wraps
        rather than pushing the shelf off a phone screen.
      */}
      <span className="block whitespace-pre-wrap break-words">{text}</span>
    </>
  );

  const shared = `${BASE} ${TONES[tone]} ${className ?? ''}`;

  if (!onSelect) {
    return (
      <div ref={ref} className={shared} style={{ ...motionStyle, ...style }} data-tone={tone}>
        {body}
      </div>
    );
  }

  return (
    <div ref={ref} style={{ ...motionStyle, ...style }} data-tone={tone}>
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-pressed={pressed}
        aria-label={actionLabel ? `${actionLabel}: ${text}` : undefined}
        className={`mef-focus-ring mef-press ${shared} transition-colors hover:border-[#C4A050]/60 disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {body}
      </button>
    </div>
  );
});
