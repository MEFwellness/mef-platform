'use client';

/**
 * "Building on yesterday..." — the adaptation moment.
 *
 * The one animation in this build that carries real information rather
 * than easing a state change: it shows a member that today's priority
 * exists BECAUSE of what she finished yesterday. Everything it displays
 * is a fact from `member_daily_priorities` (see
 * lib/priority/transition.ts for the three conditions), so it can never
 * congratulate her for something she did not do, and it never runs when
 * Root did not actually adapt.
 *
 * One component for all three surfaces. `tone` is the only difference
 * between the light inline card and the dark Root pop-up: the beats, the
 * timing, the copy and the order are identical everywhere, which is the
 * brief's requirement and the reason this is not written twice.
 *
 * Reduced motion is handled by the caller (usePriorityCardMotion sets
 * the 'all' phase, which renders yesterday, the bridge line and today's
 * priority together as plain sequential text) plus each class's own
 * `@media` rule in app/globals.css. There is no timing in this file.
 */

import { CheckCircle2 } from 'lucide-react';
import { revealStep } from '@/lib/motion/revealStep';
import {
  PRIORITY_BRIDGE_TEXT,
  PRIORITY_BRIDGE_YESTERDAY_LABEL,
  PRIORITY_DONE_TEXT,
} from '@/lib/priority/copy';

type Tone = 'light' | 'dark';

const TONE = {
  light: {
    label: 'text-[#6B7A72]',
    check: 'text-green-600',
    title: 'text-[#1B3A2D]/70',
    bridge: 'text-[#1B3A2D]',
    rule: 'bg-[#1B3A2D]/10',
  },
  dark: {
    label: 'text-[#C4A050]',
    check: 'text-[#C4A050]',
    title: 'text-[#F5F0E4]/70',
    bridge: 'text-[#F5F0E4]',
    rule: 'bg-[#F5F0E4]/15',
  },
} as const satisfies Record<Tone, Record<string, string>>;

export function PriorityBridge({
  yesterdayTitle,
  showsLine,
  receding,
  tone,
}: {
  yesterdayTitle: string;
  /** The bridge line has landed. */
  showsLine: boolean;
  /** The whole block is stepping back, on its way out. */
  receding: boolean;
  tone: Tone;
}) {
  const palette = TONE[tone];

  return (
    <div className={`relative ${receding ? 'mef-recede' : ''}`}>
      {/* Yesterday, resolved. Opacity only, no travel: this is a recap of
          something already finished, and giving it movement would make it
          compete with today's priority for the entrance it is about to
          hand over to. */}
      <div className="mef-fade-in">
        <div className={`flex items-center gap-2 ${palette.label}`}>
          <CheckCircle2 className={`h-4 w-4 ${palette.check}`} strokeWidth={1.75} aria-hidden="true" />
          <p className="text-xs font-semibold uppercase tracking-wider">
            {PRIORITY_BRIDGE_YESTERDAY_LABEL}
          </p>
        </div>
        {/* Muted rather than struck through: nothing else in this product
            crosses a member's own words out, and the green check plus the
            accomplished wording below already say "finished" in the
            language Today already uses. */}
        <p className={`mt-2 text-[15px] leading-relaxed ${palette.title}`}>{yesterdayTitle}</p>
        {/* The resolved meaning, for a member who is not seeing the check. */}
        <p className="sr-only">{PRIORITY_DONE_TEXT}</p>
      </div>

      {/* The bridge itself, in Root's own serif voice — the same typeface
          the return greeting uses, because this is Root speaking rather
          than the card labelling something. */}
      {showsLine && (
        <div {...revealStep(0, 'mt-4')}>
          <div className={`h-px w-10 ${palette.rule}`} aria-hidden="true" />
          <p
            className={`mt-3 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-snug ${palette.bridge}`}
          >
            {PRIORITY_BRIDGE_TEXT}
          </p>
        </div>
      )}
    </div>
  );
}
