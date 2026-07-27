'use client';

/**
 * Generic renderer for a driver_probe_questions row (migration 106/109) —
 * draws the right visual treatment from a question's responseType,
 * never a hand-built block per question. Daily Check-In redesign v2:
 * single_select's row-vs-stacked-rows choice is now driven purely by
 * label length (MAX_INLINE_LABEL_LENGTH) rather than a displayStyle
 * override — "never truncate" is a hard rule, not a style preference a
 * coach-set override should be able to opt out of. displayStyle (migration
 * 112) still resolves the count/scale/boolean defaults, for any future
 * bespoke treatment a coach-set override might request.
 */

import type { DriverProbeQuestion, ProbeOption } from '@/lib/daily-checkin-adaptive/types';
import { BooleanPills } from './scales/BooleanPills';
import { DotsCount } from './scales/DotsCount';
import { ShortOptionRow } from './scales/ShortOptionRow';
import { StackedOptionRows } from './scales/StackedOptionRows';
import { MAX_INLINE_LABEL_LENGTH } from './scales/shared';

export type ProbeAnswerValue = string | number | boolean;

/**
 * UX audit fix: every other five-point scale in either flow labels both
 * ends in words (mood, energy, stress, sleep quality, pain severity) —
 * a bare 1-5 `scale`-type probe question had none, since its options are
 * stored as plain numbers (the coach question-bank editor's own number-
 * list input has no field for endpoint wording — see
 * QuestionEditorForm.tsx's `parseNumberOptions`, which would silently
 * discard anything embedded in `options` on the next coach edit anyway).
 * Rather than fight that editor's data model, endpoint anchors for known
 * questions live here, keyed by questionKey — a coach-authored `scale`
 * question with no entry here still renders exactly as before (bare
 * numbers), so this is additive, not a behavior change for the other two
 * scale-type questions (`morning_soreness`/`digestion_rating` are both
 * specially-handled elsewhere and never reach this component anyway).
 */
export const SCALE_ANCHOR_LABELS: Record<string, { low: string; high: string }> = {
  'checkin_probe.morning_grogginess': { low: 'Not groggy', high: 'Very groggy' },
};

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

/**
 * The "never truncate" rule (task requirement 3), as a pure decision:
 * any option over MAX_INLINE_LABEL_LENGTH forces the whole question onto
 * full-width stacked rows rather than a single-line segment that would
 * otherwise clip, shrink, or ellipsize. Exported so this exact decision
 * is unit-testable without a rendering harness (this repo's vitest.config
 * runs a plain 'node' environment, no jsdom/RTL).
 */
export function resolveSingleSelectLayout(options: readonly { label: string }[]): 'row' | 'stacked' {
  return options.some((option) => option.label.length > MAX_INLINE_LABEL_LENGTH) ? 'stacked' : 'row';
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
    const anchors = SCALE_ANCHOR_LABELS[question.questionKey];
    return (
      <div>
        <ShortOptionRow
          question={question.prompt}
          options={numericOptions.map((n) => ({ value: n, label: String(n) }))}
          value={typeof value === 'number' ? value : null}
          onChange={onChange}
        />
        {anchors && (
          <div className="mt-1.5 flex justify-between text-[11px] text-[#6B7A72]">
            <span>{anchors.low}</span>
            <span>{anchors.high}</span>
          </div>
        )}
      </div>
    );
  }

  // single_select — row-vs-stacked is decided purely by label length so
  // no option is ever truncated, regardless of displayStyle.
  if (question.responseType === 'single_select') {
    const options = question.options.map((option) => {
      const opt = option as Exclude<ProbeOption, number>;
      return { value: optionValue(opt), label: optionLabel(opt) };
    });
    const Row = resolveSingleSelectLayout(options) === 'stacked' ? StackedOptionRows : ShortOptionRow;
    return (
      <Row
        question={question.prompt}
        options={options}
        value={typeof value === 'string' ? value : null}
        onChange={onChange}
      />
    );
  }

  return null;
}
