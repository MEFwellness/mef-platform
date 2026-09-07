'use client';

/**
 * Two cards, side by side, and one tap.
 *
 * SHARED, NOT OWNED BY ONE TEMPLATE. Your Own Company is the first template
 * to use it, four times on its own and five more times inside a rapid
 * round. It is built to be the piece any later template reaches for when it
 * wants a commitment made in half a second before it asks for a paragraph.
 *
 * IT SETS UP WRITING, IT DOES NOT REPLACE IT. That is the standing rule for
 * every interactive element in this family (lib/happiness-deep-dive/
 * interactive.ts). The pick is quick and light. The weight lands in the
 * written half the caller renders after it, and this component has no
 * opinion about that half beyond telling the caller a pick has happened.
 *
 * TWO REAL BUTTONS, AND NOTHING ELSE. No drag, no swipe, no timer that
 * chooses for her and no third option. Tab reaches both, Enter and Space
 * work, and a screen reader hears the standing question as the group's name
 * and each card's words as its own. Which one is chosen is announced
 * through aria-checked on a radiogroup, because that is exactly what this
 * is: one answer, two mutually exclusive options.
 *
 * SHE MAY CHANGE IT. Tapping the other card moves the pick. There is no
 * confirmation step, because a first instinct that cannot be corrected is a
 * trap rather than a question.
 *
 * NOTHING IS SCORED. Neither card is the right one, neither is drawn as
 * better, and the two are given identical weight, colour and size. The only
 * difference after a tap is which one is lit.
 *
 * REDUCED MOTION IS A STATE, NOT A SLOWER TRANSITION. `still` removes the
 * lift and the colour transition entirely: the chosen card is simply the
 * chosen card, arrived at without travelling.
 */

import type { HddInstinctSide } from '@/lib/happiness-deep-dive/interactive';
import { HDD_INSTINCT_PICK_MS } from '@/lib/happiness-deep-dive/interactive';

const BASE =
  'mef-focus-ring mef-press flex min-h-[112px] w-full items-center justify-center rounded-2xl border px-4 py-5 text-center font-[family-name:var(--font-cormorant-garamond)] text-[19px] leading-[1.3] break-words';

export function InstinctPair({
  /** The standing question both cards answer. Rendered here as the group's accessible name only: the caller prints it. */
  question,
  a,
  b,
  value,
  onPick,
  disabled = false,
  still = false,
}: {
  question: string;
  /** The words on the left card. Hers to read, never truncated. */
  a: string;
  /** The words on the right card. */
  b: string;
  /** Which side she has picked, or null before she has. */
  value: HddInstinctSide | null;
  onPick: (side: HddInstinctSide) => void;
  disabled?: boolean;
  /** Reduced motion: the chosen state with nothing left to animate. */
  still?: boolean;
}) {
  const style = still
    ? undefined
    : {
        transition: `background-color ${HDD_INSTINCT_PICK_MS}ms ease-out, border-color ${HDD_INSTINCT_PICK_MS}ms ease-out, box-shadow ${HDD_INSTINCT_PICK_MS}ms ease-out`,
      };

  function card(side: HddInstinctSide, text: string) {
    const chosen = value === side;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={chosen}
        disabled={disabled}
        onClick={() => onPick(side)}
        style={style}
        data-instinct-side={side}
        data-chosen={chosen ? 'true' : 'false'}
        className={`${BASE} ${
          chosen
            ? 'border-[#C4A050] bg-[#C4A050]/[0.20] text-[#F5F0E4] shadow-[0_14px_34px_-12px_rgba(196,160,80,0.55)]'
            : 'border-[#F5F0E4]/25 bg-[#F5F0E4]/[0.08] text-[#F5F0E4] hover:border-[#C4A050]/55'
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {/*
          Her card's words, whole. break-words so a long option wraps rather
          than pushing the pair off a 320 pixel phone, and no clamp, because
          shortening an option would change what she is choosing between.
        */}
        <span className="block break-words">{text}</span>
      </button>
    );
  }

  return (
    <div role="radiogroup" aria-label={question} className="grid grid-cols-2 gap-3">
      {card('a', a)}
      {card('b', b)}
    </div>
  );
}
