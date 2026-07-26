'use client';

/**
 * Generic renderer for a driver_probe_questions row (migration 106/109) —
 * draws the right visual treatment from a question's
 * responseType/displayStyle instead of each question needing its own
 * hand-built block in the check-in screens. Daily Check-In redesign
 * (migration 112): the treatment itself now comes from
 * resolveDisplayStyle (responseType, with an optional displayStyle
 * override) rather than always being the same pill row — a coach-added
 * question with no displayStyle set still renders a sensible default.
 */

import type { DriverProbeQuestion, ProbeOption } from '@/lib/daily-checkin-adaptive/types';
import { resolveDisplayStyle } from '@/lib/daily-checkin-adaptive/displayStyle';
import { BooleanPills } from './scales/BooleanPills';
import { DotsCount } from './scales/DotsCount';
import { SegmentedControl } from './scales/SegmentedControl';
import { PillRow } from './scales/PillRow';

export type ProbeAnswerValue = string | number | boolean;

function optionValue(option: Exclude<ProbeOption, number>): string {
  return typeof option === 'string' ? option : option.value;
}

/** Falls back to a title-cased version of the raw snake_case value for any single_select row that still stores plain strings rather than {value,label} objects. */
function optionLabel(option: Exclude<ProbeOption, number>): string {
  if (typeof option !== 'string') return option.label;
  return option
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function DriverProbeField({
  question,
  value,
  onChange,
}: {
  question: DriverProbeQuestion;
  value: ProbeAnswerValue | null;
  onChange: (value: ProbeAnswerValue) => void;
}) {
  const displayStyle = resolveDisplayStyle(question);

  if (question.responseType === 'boolean') {
    return (
      <BooleanPills
        question={question.prompt}
        value={typeof value === 'boolean' ? value : null}
        onChange={onChange}
      />
    );
  }

  if (question.responseType === 'count') {
    const numericOptions = question.options.map((option) => (typeof option === 'number' ? option : Number(option)));
    return (
      <DotsCount
        question={question.prompt}
        options={numericOptions}
        value={typeof value === 'number' ? value : null}
        onChange={onChange}
      />
    );
  }

  if (question.responseType === 'scale') {
    const numericOptions = question.options.map((option) => (typeof option === 'number' ? option : Number(option)));
    return (
      <SegmentedControl
        question={question.prompt}
        options={numericOptions.map((n) => ({ value: n, label: String(n) }))}
        value={typeof value === 'number' ? value : null}
        onChange={onChange}
      />
    );
  }

  // single_select — 'pill_row' is the only style this responseType
  // resolves to today (see displayStyle.ts), but the switch stays
  // explicit rather than an unconditional fallthrough so a future
  // single_select-specific treatment has an obvious place to slot in.
  if (question.responseType === 'single_select') {
    const options = question.options.map((option) => {
      const opt = option as Exclude<ProbeOption, number>;
      return { value: optionValue(opt), label: optionLabel(opt) };
    });
    if (displayStyle === 'segmented') {
      return (
        <SegmentedControl
          question={question.prompt}
          options={options}
          value={typeof value === 'string' ? value : null}
          onChange={onChange}
        />
      );
    }
    return (
      <PillRow
        question={question.prompt}
        options={options}
        value={typeof value === 'string' ? value : null}
        onChange={onChange}
      />
    );
  }

  return null;
}
