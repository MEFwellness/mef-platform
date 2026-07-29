'use client';

/**
 * Compact two-column chip grid for a multi-select question whose option
 * labels are all short enough to sit inline — unlike MultiOptionRows'
 * full-width stacked rows (built for labels too long to share a line),
 * this fits a ten-option set entirely on screen without scrolling.
 * Reuses the same TapBleedTile selected-state language every other
 * option control in this folder uses, and MultiOptionRows' own
 * toggleMultiSelectValue for add/remove + exclusivity — no separate
 * toggle logic invented for this layout.
 */

import { SCALE_LABEL, TapBleedTile } from './shared';
import { toggleMultiSelectValue } from './MultiOptionRows';

export function MultiSelectChipGrid<T extends string>({
  question,
  options,
  value,
  onChange,
  exclusiveValue,
}: {
  question: string;
  options: readonly { value: T; label: string }[];
  value: readonly T[];
  onChange: (value: T[]) => void;
  /** The one option value that clears every other selection (and is itself cleared by picking any other) — 'none' if omitted, matching MultiOptionRows' existing convention. */
  exclusiveValue?: T;
}) {
  return (
    <div>
      <p className={SCALE_LABEL}>{question}</p>
      <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={question}>
        {options.map((option) => (
          <TapBleedTile
            key={String(option.value)}
            label={option.label}
            isSelected={value.includes(option.value)}
            onSelect={() =>
              onChange(toggleMultiSelectValue(value, option.value, exclusiveValue ? String(exclusiveValue) : undefined))
            }
          />
        ))}
      </div>
    </div>
  );
}
