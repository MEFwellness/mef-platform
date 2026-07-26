'use client';

/**
 * Generic renderer for a driver_probe_questions row (migration 106/109) —
 * draws the right buttons from a question's response_type/options instead
 * of each question needing its own hand-built block in the check-in
 * screens, which is what made growing the bank from 7 rows to 88 (see
 * migration 109) practical without a matching wall of new JSX. Replaces
 * the bespoke blocks CheckinForm.tsx/EveningReflectionForm.tsx used to
 * hand-write per question_key.
 *
 * Styling is copied verbatim from those two forms' own pill buttons (the
 * same rounded-full / active-scale-105 pattern) so nothing looks
 * different to a member than it did before this component existed.
 */

import type { DriverProbeQuestion, ProbeOption } from '@/lib/daily-checkin-adaptive/types';

export type ProbeAnswerValue = string | number | boolean;

// The two helpers below are only ever called from the single_select
// branch, whose options are always a string or a {value,label} object —
// never a bare number (that shape is scale/count's, handled separately).
function optionValue(option: Exclude<ProbeOption, number>): string {
  return typeof option === 'string' ? option : option.value;
}

/** Falls back to a title-cased version of the raw snake_case value for the two pre-existing single_select rows (bowel_movement_status, pain_location, pain_aggravating_factor) that still store plain strings rather than {value,label} objects. */
function optionLabel(option: Exclude<ProbeOption, number>): string {
  if (typeof option !== 'string') return option.label;
  return option
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const PILL_BASE =
  'rounded-full border px-3.5 py-2 text-[13px] font-medium transition-all duration-200 ease-out active:scale-95';
const PILL_SELECTED =
  'scale-105 border-[#1B3A2D] bg-[#1B3A2D] text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)]';
const PILL_UNSELECTED =
  'border-[#1B3A2D]/10 bg-white text-[#6B7A72] hover:scale-[1.03] hover:border-[#1B3A2D]/25 hover:text-[#1B3A2D]';

function Pill({
  label,
  isSelected,
  onClick,
}: {
  label: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={`${PILL_BASE} ${isSelected ? PILL_SELECTED : PILL_UNSELECTED}`}
    >
      {label}
    </button>
  );
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
  return (
    <div>
      <p className="text-[13px] leading-relaxed text-[#6B7A72]">{question.prompt}</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={question.prompt}>
        {question.responseType === 'boolean' &&
          ([
            { value: true, label: 'Yes' },
            { value: false, label: 'No' },
          ] as const).map((option) => (
            <Pill
              key={String(option.value)}
              label={option.label}
              isSelected={value === option.value}
              onClick={() => onChange(option.value)}
            />
          ))}

        {(question.responseType === 'scale' || question.responseType === 'count') &&
          question.options.map((option) => {
            const numericValue = typeof option === 'number' ? option : Number(option);
            return (
              <Pill
                key={numericValue}
                label={String(numericValue)}
                isSelected={value === numericValue}
                onClick={() => onChange(numericValue)}
              />
            );
          })}

        {question.responseType === 'single_select' &&
          question.options.map((option) => {
            const optValue = optionValue(option as Exclude<ProbeOption, number>);
            return (
              <Pill
                key={optValue}
                label={optionLabel(option as Exclude<ProbeOption, number>)}
                isSelected={value === optValue}
                onClick={() => onChange(optValue)}
              />
            );
          })}
      </div>
    </div>
  );
}
