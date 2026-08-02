'use client';

/**
 * Progressive Reveal Engine (Prompt 3) — "multi-step cards": long content
 * broken into steps the member moves through one thought at a time,
 * entirely member-paced (a tap on the button advances, never a timer) so
 * there is nothing to skip in the Bible §5 sense — the member already
 * controls every beat. Each step fades in via the app's existing
 * `.mef-fade-in` idiom, which already degrades to an instant, unanimated
 * swap under `prefers-reduced-motion: reduce` via its own CSS rule in
 * app/globals.css, so no JS-level reduced-motion branch is needed here.
 */

import { useState, type ReactNode } from 'react';

export function StepCard({
  steps,
  nextLabel = 'Next',
  finalLabel,
  onFinish,
  className = '',
  buttonClassName = 'mef-focus-ring mt-6 flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110',
}: {
  steps: ReactNode[];
  /** Curiosity-language label for every step except the last (Bible §7 — never a bare "Continue" inside a Moment). */
  nextLabel?: string;
  /** Label for the final step's button. Defaults to `nextLabel` if not given. */
  finalLabel?: string;
  onFinish?: () => void;
  className?: string;
  buttonClassName?: string;
}) {
  const [index, setIndex] = useState(0);
  const isLast = index === steps.length - 1;

  function handleNext() {
    if (isLast) {
      onFinish?.();
      return;
    }
    setIndex((current) => Math.min(current + 1, steps.length - 1));
  }

  return (
    <div className={className}>
      <div key={index} className="mef-fade-in">
        {steps[index]}
      </div>

      {steps.length > 1 && (
        <div className="mt-5 flex items-center justify-center gap-1.5" aria-hidden="true">
          {steps.map((_, dotIndex) => (
            <span
              key={dotIndex}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                dotIndex === index ? 'w-4 bg-[#1B3A2D]' : 'w-1.5 bg-[#1B3A2D]/20'
              }`}
            />
          ))}
        </div>
      )}

      <button type="button" onClick={handleNext} className={buttonClassName}>
        {isLast ? (finalLabel ?? nextLabel) : nextLabel}
      </button>
    </div>
  );
}
