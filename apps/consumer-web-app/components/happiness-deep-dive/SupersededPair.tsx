'use client';

/**
 * Two sentences she wrote, stacked, where the second one takes the place of
 * the first.
 *
 * SHARED, NOT OWNED BY ONE TEMPLATE. Your Own Company is the first template
 * to use it, on its closing: the line her inner voice says on repeat, and
 * the rewrite of it in the kindest voice she has ever been spoken to in.
 *
 * WHAT THE MOTION SAYS, AND IT IS THE ONLY THING IT SAYS. The first
 * sentence is there first and alone. The second arrives, and as it does the
 * first FADES BACK: it stays legible, it is not removed and it is not
 * struck through, because she wrote it and it is still true that she wrote
 * it. It simply stops being the loudest thing on the screen. That is a
 * statement about which one is in front of her now, not a claim about which
 * one is correct, and the caller's own fixed line is where any claim
 * belongs.
 *
 * BOTH ARE HERS AND NEITHER IS EDITED. No quotation marks are added, no
 * capitalisation corrected, nothing trimmed to fit, no clamp and no
 * ellipsis. Both are pre-wrapped, so the text a reader, a screen reader or a
 * verification script pulls off either block is character for character
 * what was stored.
 *
 * REDUCED MOTION IS NOT A SLOWER VERSION OF THIS, it is none of it. Both
 * sentences are simply present from the first frame, with the second one
 * visually primary by exactly the same means: the same sizes, the same
 * colours, the same order. Nothing fades, nothing is timed, and no
 * information is carried by the transition that is not carried by the
 * finished state.
 *
 * IT ANIMATES NOTHING BY ITSELF. `arrived` is the caller's, so this sits
 * inside the shared closing's own staged reveal rather than starting a
 * second race beside it.
 */

import { useEffect, useState } from 'react';
import { useReducedMotion } from '@/lib/motion/useReducedMotion';
import { HDD_SUPERSEDED_FADE_MS } from '@/lib/happiness-deep-dive/interactive';

export function SupersededPair({
  /** The small label above the first sentence. Names what it is, and nothing more. */
  firstCaption,
  first,
  /** The small label above the second. */
  secondCaption,
  second,
  /** Show both, finished, with nothing timed. Reduced motion, and every later viewing. */
  instant = false,
}: {
  firstCaption: string;
  first: string;
  secondCaption: string;
  second: string;
  instant?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const skip = instant || reducedMotion;
  const [arrived, setArrived] = useState(skip);

  useEffect(() => {
    if (skip) {
      setArrived(true);
      return undefined;
    }
    setArrived(false);
    const timer = setTimeout(() => setArrived(true), HDD_SUPERSEDED_FADE_MS);
    return () => clearTimeout(timer);
  }, [skip]);

  const fade = skip ? undefined : { transition: `opacity ${HDD_SUPERSEDED_FADE_MS}ms ease-out` };

  return (
    <div>
      <div style={fade} className={arrived ? 'opacity-45' : 'opacity-100'}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#F5F0E4]/45">
          {firstCaption}
        </p>
        <p
          data-superseded="first"
          className="mt-2 whitespace-pre-wrap break-words font-[family-name:var(--font-cormorant-garamond)] text-[20px] leading-[1.4] text-[#F5F0E4]"
        >
          {first}
        </p>
      </div>

      {/*
        Genuinely absent until it is due rather than present and invisible,
        so nothing sits on the screen ahead of its own arrival.
      */}
      {arrived && (
        <div className={`mt-6 ${skip ? '' : 'mef-fade-in'}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
            {secondCaption}
          </p>
          <p
            data-superseded="second"
            className="mt-2 whitespace-pre-wrap break-words font-[family-name:var(--font-cormorant-garamond)] text-[26px] leading-[1.35] text-[#F5F0E4]"
          >
            {second}
          </p>
        </div>
      )}
    </div>
  );
}
