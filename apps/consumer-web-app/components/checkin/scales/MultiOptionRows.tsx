'use client';

/**
 * Full-width stacked rows for a `multi_select` question — more than one
 * option can be selected at once, toggled independently, using the same
 * TapBleedTile selected-state visual every other option row in this
 * folder uses (no new selected/unselected treatment invented here).
 *
 * "None" exclusivity (item 2, craving question): any option whose value
 * is literally 'none' (case-insensitive) is treated as mutually exclusive
 * with every other option in the same question — selecting it clears
 * every other selection, and selecting any other option clears it. This
 * lives here (not hardcoded to the craving question) so any future
 * multi_select question with a "none of these" option gets the same
 * behavior for free, matching the onboarding adaptive engine's own
 * multi_select "none" convention (app/onboarding/OnboardingForm.tsx).
 *
 * 2026-07-29: generalized to an overridable `exclusiveValue` (default
 * still 'none', so every existing caller's behavior is byte-identical)
 * so the body-location chip grid (components/checkin/scales/
 * MultiSelectChipGrid.tsx) can reuse this exact same toggle logic for
 * its own "Widespread" exclusivity rather than re-implementing it.
 */

import { SCALE_LABEL, TapBleedTile } from './shared';

const NONE_VALUE = 'none';

export function toggleMultiSelectValue<T extends string | number>(
  current: readonly T[],
  option: T,
  exclusiveValue: string = NONE_VALUE
): T[] {
  const optionIsExclusive = String(option).toLowerCase() === exclusiveValue.toLowerCase();
  const isSelected = current.includes(option);

  if (isSelected) {
    return current.filter((v) => v !== option);
  }
  if (optionIsExclusive) {
    return [option];
  }
  return [...current.filter((v) => String(v).toLowerCase() !== exclusiveValue.toLowerCase()), option];
}

export function MultiOptionRows<T extends string | number>({
  question,
  options,
  value,
  onChange,
}: {
  question: string;
  options: readonly { value: T; label: string }[];
  value: readonly T[];
  onChange: (value: T[]) => void;
}) {
  return (
    <div>
      <p className={SCALE_LABEL}>{question}</p>
      <div className="mt-3 flex w-full flex-col gap-2" role="group" aria-label={question}>
        {options.map((option) => (
          <TapBleedTile
            key={String(option.value)}
            label={option.label}
            isSelected={value.includes(option.value)}
            onSelect={() => onChange(toggleMultiSelectValue(value, option.value))}
            fullWidth
          />
        ))}
      </div>
    </div>
  );
}
