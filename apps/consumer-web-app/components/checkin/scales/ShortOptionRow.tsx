'use client';

/** A single-row, equal-width segmented control — only ever used when every option's label is at or under MAX_INLINE_LABEL_LENGTH (task's "never truncate" rule), so a single line always fits without shrinking or clipping. */

import { SCALE_LABEL, TapBleedTile } from './shared';

export function ShortOptionRow<T extends string | number>({
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
      <div className="mt-3 flex w-full gap-2" role="group" aria-label={question}>
        {options.map((option) => (
          <div key={String(option.value)} className="min-w-0 flex-1">
            <TapBleedTile
              label={option.label}
              isSelected={value === option.value}
              onSelect={() => onChange(option.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
