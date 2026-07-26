'use client';

/** "boolean" — two large pills, side by side. Thin wrapper over the unified ShortOptionRow tile so boolean questions share the exact same selected-state language as every other generic control. */

import { ShortOptionRow } from './ShortOptionRow';

export function BooleanPills({
  question,
  value,
  onChange,
  yesLabel = 'Yes',
  noLabel = 'No',
}: {
  question: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  return (
    <ShortOptionRow
      question={question}
      options={[
        { value: 'yes', label: yesLabel },
        { value: 'no', label: noLabel },
      ]}
      value={value === null ? null : value ? 'yes' : 'no'}
      onChange={(v) => onChange(v === 'yes')}
    />
  );
}
