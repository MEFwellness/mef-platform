'use client';

/**
 * Micro-Interactions (Prompt 6): the shared radio-row option button for
 * this taker family (the generic points-scored engine's scored
 * questions and its context-gate questions) — retrofits the app's one
 * selection language (a ripple that bleeds from the real tap point +
 * one haptic tick, per `TapBleedTile` in
 * components/checkin/scales/shared.tsx) onto the existing row layout via
 * the shared `useBleedTap` hook, rather than each caller re-deriving the
 * same button by hand. Selected/unselected colors are unchanged.
 */

import { Check } from 'lucide-react';
import { useBleedTap } from '@/lib/motion/useBleedTap';
import { triggerHaptic } from '@/lib/haptics';

export function QuestionOptionButton({
  label,
  selected,
  onSelect,
  /** 'radio' (default) for single-select rows; 'toggle' for a
   * multi-select row, matching the original plain aria-pressed toggle
   * button semantics rather than a role="radio" one. */
  variant = 'radio',
  /** The selected-state fill color — each taker keeps its own existing
   * choice (forest green here, CVS_GOLD elsewhere), this only adds the
   * ripple-origin + haptic mechanics on top of it. */
  fillColor = '#1B3A2D',
  /** Unselected hover classes — CVS's own gold-tinted hover differs from
   * the generic engine/WBSA default, kept overridable rather than
   * flattening every taker onto one hover treatment. */
  unselectedHoverClassName = 'hover:border-[#1B3A2D]/30 hover:bg-[#FAFAF8]',
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  variant?: 'radio' | 'toggle';
  fillColor?: string;
  unselectedHoverClassName?: string;
}) {
  const { onPointerDown, bleedStyle } = useBleedTap();

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
        selected
          ? 'border-transparent text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.35)]'
          : `border-[#1B3A2D]/10 bg-white text-[#1B3A2D] ${unselectedHoverClassName}`
      } ${selected ? 'mef-bleed-active' : ''} mef-focus-ring`}
    >
      <span aria-hidden="true" className="mef-bleed-fill" style={{ backgroundColor: fillColor }} />
      <span className="relative z-10 flex w-full items-center justify-between gap-3 px-5 py-4">
        <span>{label}</span>
        {selected && <Check className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden="true" />}
      </span>
    </button>
  );
}
