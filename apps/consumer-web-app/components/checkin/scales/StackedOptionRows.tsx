'use client';

/**
 * Full-width stacked rows, one per line, whole row tappable — the
 * replacement for any option set with a label over
 * MAX_INLINE_LABEL_LENGTH. Text wraps onto a second line if it needs
 * to; it is never clipped, ellipsised, or shrunk below body size (the
 * bug this redesign was specifically asked to fix: "Below av…",
 * "Overwhelmed…", "Dipped in th…", "Fully reco…").
 */

import { SCALE_LABEL, TapBleedTile } from './shared';

export function StackedOptionRows<T extends string | number>({
  question,
  options,
  value,
  onChange,
}: {
  question: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className={SCALE_LABEL}>{question}</p>
      <div className="mt-3 flex w-full flex-col gap-2" role="group" aria-label={question}>
        {options.map((option) => (
          <TapBleedTile
            key={String(option.value)}
            label={option.label}
            isSelected={value === option.value}
            onSelect={() => onChange(option.value)}
            fullWidth
          />
        ))}
      </div>
    </div>
  );
}
