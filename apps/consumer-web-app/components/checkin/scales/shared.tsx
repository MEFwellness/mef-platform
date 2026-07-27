'use client';

import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { triggerHaptic } from '@/lib/haptics';

export const SCALE_LABEL = 'text-[13px] leading-relaxed text-[#6B7A72]';

/** Any option label at or under this length is safe as a single-line segment; longer ones must become a full-width stacked row instead of ever being clipped (task's "never truncate" rule). */
export const MAX_INLINE_LABEL_LENGTH = 10;

/**
 * The one unified selected-state control this redesign uses everywhere
 * outside the bespoke hero visualizations (faces/rings/arcs/outline):
 * selected = solid fill (forest green by default), white label, subtle
 * lift; unselected = white card, soft border. The fill bleeds outward
 * from wherever she actually tapped rather than swapping instantly.
 *
 * 2026-07-27 UX fix ("Predict tomorrow" overlapping labels): the
 * non-fullWidth variant never had `w-full`, so this `<button>` sized
 * itself to its own text content instead of filling the `min-w-0
 * flex-1` column ShortOptionRow always wraps it in. A short label (a
 * single digit, "Yes"/"No") never showed it; a longer one-line label
 * ("Exhausted", "Moderate") rendered at its full natural width and
 * visually spilled into the next column, overlapping it — not a
 * truncation bug, an unconstrained-width one. `StackedOptionRows` (the
 * only other caller) already passes `fullWidth` on every tile, so
 * adding `w-full` unconditionally here is safe for both callers: the
 * button now always fills its parent, and `whitespace-normal
 * break-words` (already on the label span below) wraps onto a second
 * line inside that width instead of overflowing it.
 */
export function TapBleedTile({
  label,
  isSelected,
  onSelect,
  fullWidth = false,
  fillColor = '#1B3A2D',
  className = '',
}: {
  label: string;
  isSelected: boolean;
  onSelect: () => void;
  fullWidth?: boolean;
  fillColor?: string;
  className?: string;
}) {
  const [origin, setOrigin] = useState('50% 50%');

  function capturePointer(event: ReactPointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setOrigin(`${x}% ${y}%`);
  }

  function handleClick() {
    triggerHaptic();
    onSelect();
  }

  return (
    <button
      type="button"
      onPointerDown={capturePointer}
      onClick={handleClick}
      aria-pressed={isSelected}
      style={{ '--bleed-origin': origin } as React.CSSProperties}
      className={`mef-press relative isolate w-full overflow-hidden rounded-2xl border text-[14px] font-medium transition-all duration-200 ease-out ${
        fullWidth ? 'px-4 py-3.5 text-left' : 'px-3.5 py-2.5 text-center'
      } ${
        isSelected
          ? 'scale-[1.02] border-transparent text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.4)]'
          : 'border-[#1B3A2D]/10 bg-white text-[#1B3A2D]/75 hover:border-[#1B3A2D]/25'
      } ${isSelected ? 'mef-bleed-active' : ''} ${className}`}
    >
      <span
        aria-hidden="true"
        className="mef-bleed-fill"
        style={{ backgroundColor: fillColor }}
      />
      <span className="relative z-10 whitespace-normal break-words">{label}</span>
    </button>
  );
}
