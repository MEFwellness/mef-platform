'use client';

import { BODY_REGION_OPTIONS } from '@/lib/exercise-library/bodyRegions';

export type ExerciseFilterState = {
  category: string;
  muscle: string;
  bodyRegion: string;
  equipment: string;
  level: string;
};

export const EMPTY_EXERCISE_FILTERS: ExerciseFilterState = {
  category: '',
  muscle: '',
  bodyRegion: '',
  equipment: '',
  level: '',
};

/** Number of filters a member has actually set — drives the active-filter count badge. Search text is intentionally excluded; this counts refinements, not the query itself. */
export function countActiveFilters(filters: ExerciseFilterState): number {
  return Object.values(filters).filter((v) => v !== '').length;
}

const LEVEL_OPTIONS = ['beginner', 'intermediate', 'advanced'];

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-[#6B7A72]">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mef-focus-ring rounded-lg border border-[#1B3A2D]/15 bg-white px-2 py-1.5 text-base text-[#1B3A2D] transition hover:border-[#1B3A2D]/30"
      >
        <option value="">Any</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ExerciseFilters({
  filters,
  onChange,
  categoryOptions,
  muscleOptions,
  equipmentOptions,
}: {
  filters: ExerciseFilterState;
  onChange: (next: ExerciseFilterState) => void;
  categoryOptions: string[];
  muscleOptions: string[];
  equipmentOptions: string[];
}) {
  const toOptions = (values: string[]) =>
    values.map((v) => ({ value: v, label: v.replace(/_/g, ' ') }));
  const activeCount = countActiveFilters(filters);

  return (
    <div className="rounded-[20px] bg-white/70 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {activeCount > 0 && (
          <span className="rounded-full bg-[#F5B700]/20 px-2.5 py-1 text-xs font-semibold text-[#1B3A2D]">
            {activeCount} active
          </span>
        )}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_EXERCISE_FILTERS)}
            className="mef-press mef-focus-ring rounded-full px-2.5 py-1 text-xs font-semibold text-[#6B7A72] underline-offset-2 transition hover:text-[#1B3A2D] hover:underline"
          >
            Clear All
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        <FilterSelect
          label="Category"
          value={filters.category}
          options={toOptions(categoryOptions)}
          onChange={(v) => onChange({ ...filters, category: v })}
        />
        <FilterSelect
          label="Body Region"
          value={filters.bodyRegion}
          options={BODY_REGION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(v) => onChange({ ...filters, bodyRegion: v })}
        />
        <FilterSelect
          label="Muscle"
          value={filters.muscle}
          options={toOptions(muscleOptions)}
          onChange={(v) => onChange({ ...filters, muscle: v })}
        />
        <FilterSelect
          label="Equipment"
          value={filters.equipment}
          options={toOptions(equipmentOptions)}
          onChange={(v) => onChange({ ...filters, equipment: v })}
        />
        <FilterSelect
          label="Difficulty"
          value={filters.level}
          options={toOptions(LEVEL_OPTIONS)}
          onChange={(v) => onChange({ ...filters, level: v })}
        />
      </div>
    </div>
  );
}
