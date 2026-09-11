'use client';

/**
 * Micro-Interactions (Prompt 6): the shared radio-row option button for
 * this taker family (the generic points-scored engine's scored
 * questions and its context-gate questions) — retrofits the app's one
 * selection language (a ripple that bleeds from the real tap point +
 * one haptic tick, per `TapBleedTile` in
 * components/checkin/scales/shared.tsx) onto the existing row layout via
 * the shared `useBleedTap` hook, rather than each caller re-deriving the
 * same button by hand.
 *
 * TONES, ADDED FOR THE 2026-09-11 QUESTIONNAIRE PASS. `tone` is the only
 * thing that decides how a row is coloured, and 'forest' is exactly what
 * every caller got before this existed, so the WBSA taker and the Core
 * Values Snapshot render byte for byte what they rendered yesterday.
 *
 *   'forest' is the original. Selected fills deep forest, text goes white.
 *   'gold-on-light' is the questionnaire pass. Selected fills muted warm
 *     gold with deep forest text and a checkmark; unselected is a layered
 *     green tint with a hairline border rather than a white box.
 *   'gold-on-forest' is that same statement inside the Body Systems
 *     Survey's deep forest panel, where the unselected layer is a lift of
 *     cream rather than a wash of green.
 *
 * A SELECTED ROW IS NOT JUST A COLOUR. It carries the tick, the weight and
 * the border as one change, because the complaint that started this pass
 * was that "the selected answer turns gold" was all the feedback there
 * was.
 */

import { Check } from 'lucide-react';
import { useBleedTap } from '@/lib/motion/useBleedTap';
import { triggerHaptic } from '@/lib/haptics';

export type OptionTone = 'forest' | 'gold-on-light' | 'gold-on-forest';

const TONES: Record<
  OptionTone,
  { fill: string; selected: string; unselected: string; hover: string; check: string }
> = {
  forest: {
    fill: '#1B3A2D',
    selected: 'border-transparent text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.35)]',
    unselected: 'border-[#1B3A2D]/10 bg-white text-[#1B3A2D]',
    hover: 'hover:border-[#1B3A2D]/30 hover:bg-[#FAFAF8]',
    check: 'text-current',
  },
  'gold-on-light': {
    fill: '#C4A050',
    selected:
      'border-[#B08F3E] font-semibold text-[#173025] shadow-[0_6px_18px_-10px_rgba(176,143,62,0.75)]',
    unselected: 'border-[#1B3A2D]/12 bg-[#F1F6F2] text-[#1B3A2D]',
    hover: 'hover:border-[#C4A050]/45 hover:bg-[#E9F1EB]',
    check: 'text-[#173025]',
  },
  'gold-on-forest': {
    fill: '#C4A050',
    selected: 'border-[#D8BC7A] font-semibold text-[#173025]',
    unselected: 'border-[#F5F0E4]/14 bg-[#F5F0E4]/[0.055] text-[#F5F0E4]',
    hover: 'hover:border-[#F5F0E4]/25 hover:bg-[#F5F0E4]/[0.11]',
    check: 'text-[#173025]',
  },
};

export function QuestionOptionButton({
  label,
  selected,
  onSelect,
  /** 'radio' (default) for single-select rows; 'toggle' for a
   * multi-select row, matching the original plain aria-pressed toggle
   * button semantics rather than a role="radio" one. */
  variant = 'radio',
  /** Defaults to the original forest treatment, so every caller that
   * predates this prop is unchanged. */
  tone = 'forest',
  /** The selected-state fill color. Left overridable for the Core Values
   * Snapshot, which picked its own gold before tones existed. */
  fillColor,
  /** Unselected hover classes — CVS's own gold-tinted hover differs from
   * the generic engine/WBSA default, kept overridable rather than
   * flattening every taker onto one hover treatment. */
  unselectedHoverClassName,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  variant?: 'radio' | 'toggle';
  tone?: OptionTone;
  fillColor?: string;
  unselectedHoverClassName?: string;
}) {
  const { onPointerDown, bleedStyle } = useBleedTap();
  const palette = TONES[tone];
  const fill = fillColor ?? palette.fill;
  const hover = unselectedHoverClassName ?? palette.hover;

  function handleClick() {
    triggerHaptic();
    onSelect();
  }

  const ariaProps =
    variant === 'radio' ? { role: 'radio' as const, 'aria-checked': selected } : { 'aria-pressed': selected };

  return (
    <button
      type="button"
      {...ariaProps}
      onPointerDown={onPointerDown}
      onClick={handleClick}
      style={bleedStyle}
      className={`mef-press relative isolate w-full overflow-hidden rounded-2xl border text-left text-[15px] font-medium transition ${
        selected ? palette.selected : `${palette.unselected} ${hover}`
      } ${selected ? 'mef-bleed-active' : ''} mef-focus-ring`}
    >
      <span aria-hidden="true" className="mef-bleed-fill" style={{ backgroundColor: fill }} />
      <span className="relative z-10 flex w-full items-center justify-between gap-3 px-5 py-4">
        <span>{label}</span>
        {selected && (
          <Check
            className={`mef-q-check-in h-5 w-5 shrink-0 ${palette.check}`}
            strokeWidth={2.25}
            aria-hidden="true"
          />
        )}
      </span>
    </button>
  );
}
