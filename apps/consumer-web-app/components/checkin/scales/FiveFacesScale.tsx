'use client';

/**
 * Mood — five faces, frown through smile (a geometric curve, not a color,
 * conveys the direction).
 *
 * 2026-07-27 UX audit fix (batch 1, items 1+2): this used to fill the
 * selected card solid with a color pulled from MOOD_RAMP at that option's
 * index (cool muted sage -> warm gold) — both a full gold card surface on
 * the "Excellent" end (gold is an accent color in this brand, never a
 * whole filled surface) and a hue ramp that let a member read "which
 * answer the app approves of" from color alone, the same problem already
 * fixed on the stress scale (see CompressingRings.tsx). Fixed the same
 * way: the card surface never changes color, whether selected or not —
 * MOOD_ACCENT (warm gold, the one on-palette accent) appears only as a
 * ring around the selected card, the face icon's own stroke, and a
 * bolder label; magnitude/direction is carried by the smile curve
 * (already real, unaffected) and by each option's own accent-dot
 * opacity, never by which hue is shown. Forest green (the app's other
 * common "selected" solid fill, see shared.tsx's TapBleedTile) is
 * deliberately not used here either: Mood renders on the same
 * section-mode screen as Energy, whose own selected fill is already
 * solid forest green, and two simultaneously-selected cards reading as
 * the same color would recreate exactly the ambiguity CompressingRings'
 * own comment warns about. MOOD_RAMP itself is untouched in
 * lib/checkin-color-ramps.ts — still used by the check-in ending
 * screen's "Today, in one color" blend, out of scope here.
 *
 * Animation follow-up: the selected face now "comes alive" briefly on a
 * genuine new selection — a spring scale-up (`mef-mood-face-pop`,
 * app/globals.css) settling back to size, with the mouth curve itself
 * drawing into place (`mef-mood-face-draw`, a stroke-dashoffset reveal
 * using the `pathLength=1` trick so it works identically for all five
 * curves without per-curve length math). Motion only — none of the
 * selected state's own styling (gold ring, gold icon color, bold label)
 * changed. Fires only on an actual value change (tracked via a
 * previous-value ref in FiveFacesScale below), never on initial mount
 * with an already-answered value, so revisiting a completed screen
 * doesn't replay it. Skipped entirely under prefers-reduced-motion,
 * which still leaves the selected state (ring/icon/label) exactly as
 * before. The existing `triggerHaptic()` call on tap (below) already
 * covers this task's "light haptic on selection" requirement — untouched.
 */

import { useEffect, useRef, useState } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { SCALE_LABEL } from './shared';

const MOOD_ACCENT = '#C4A050';
const MIN_ACCENT_OPACITY = 0.3;

function FaceIcon({
  index,
  isSelected,
  animate,
}: {
  index: number;
  isSelected: boolean;
  animate: boolean;
}) {
  const curve = -6 + index * 3; // frown (-6) through smile (+6)
  const stroke = isSelected ? MOOD_ACCENT : '#1B3A2D';
  return (
    <svg
      viewBox="0 0 32 32"
      className={`h-6 w-6 ${animate ? 'mef-mood-face-pop' : ''}`}
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="13" fill="none" stroke={stroke} strokeWidth="2" opacity={0.85} />
      <circle cx="11.5" cy="13" r="1.5" fill={stroke} opacity={0.85} />
      <circle cx="20.5" cy="13" r="1.5" fill={stroke} opacity={0.85} />
      <path
        d={`M 10 20 Q 16 ${20 + curve} 22 20`}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        opacity={0.85}
        pathLength={animate ? 1 : undefined}
        className={animate ? 'mef-mood-face-draw' : ''}
      />
    </svg>
  );
}

export function FiveFacesScale({
  question,
  labels,
  value,
  onChange,
}: {
  question: string;
  labels: readonly string[];
  value: number | null;
  onChange: (value: number) => void;
}) {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  // Tracks the value that just changed TO (not the value already present
  // at mount) so the pop/draw animation fires only on a genuine new
  // selection — never when this screen is simply revisited with an
  // already-answered value.
  const previousValueRef = useRef(value);
  const [justSelectedValue, setJustSelectedValue] = useState<number | null>(null);
  useEffect(() => {
    if (previousValueRef.current !== value && value !== null) {
      setJustSelectedValue(value);
    }
    previousValueRef.current = value;
  }, [value]);

  return (
    <div>
      <p className={SCALE_LABEL}>{question}</p>
      <div className="mt-3 flex w-full items-stretch gap-1.5" role="group" aria-label={question}>
        {labels.map((word, index) => {
          const optionValue = index + 1;
          const isSelected = value === optionValue;
          const animate = !reducedMotion && isSelected && justSelectedValue === optionValue;
          // Magnitude via intensity, not hue: every option's accent dot is
          // the same gold, just fainter at the low end and fuller at the
          // high end — the same solution used on the stress scale.
          const accentOpacity =
            labels.length <= 1 ? 1 : MIN_ACCENT_OPACITY + (index / (labels.length - 1)) * (1 - MIN_ACCENT_OPACITY);
          return (
            <button
              key={word}
              type="button"
              onClick={() => {
                triggerHaptic();
                onChange(optionValue);
              }}
              aria-pressed={isSelected}
              aria-label={word}
              title={word}
              className={`mef-press flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl border-2 bg-white py-2.5 transition-all duration-200 ease-out ${
                isSelected
                  ? 'scale-105 border-[#C4A050] shadow-[0_4px_16px_-4px_rgba(196,160,80,0.45)]'
                  : 'border-[#1B3A2D]/10'
              }`}
            >
              <FaceIcon index={index} isSelected={isSelected} animate={animate} />
              <span
                className={`whitespace-normal break-words text-center text-[10px] leading-tight ${
                  isSelected ? 'font-bold text-[#1B3A2D]' : 'font-medium text-[#6B7A72]'
                }`}
              >
                {word}
              </span>
              <span
                aria-hidden="true"
                className="h-1 w-4 rounded-full"
                style={{ backgroundColor: MOOD_ACCENT, opacity: isSelected ? 0.6 : accentOpacity }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
