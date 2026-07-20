'use client';

import { BODY_REGION_OPTIONS } from '@/lib/exercise-library/bodyRegions';

export type ExerciseFilterState = {
  category: string;
  muscle: string;
  bodyRegion: string;
  equipment: string;
  level: string;
  force: string;
  mechanic: string;
  hasVideo: boolean;
};

export const EMPTY_EXERCISE_FILTERS: ExerciseFilterState = {
  category: '',
  muscle: '',
  bodyRegion: '',
  equipment: '',
  level: '',
  force: '',
  mechanic: '',
  hasVideo: false,
};

const CATEGORY_OPTIONS = [
  'strength',
  'yoga',
  'mobility',
  'physical_therapy',
  'stretching',
  'pilates',
  'calisthenics',
  'plyometrics',
  'conditioning',
  'olympic_weightlifting',
  'powerlifting',
  'strongman',
];
const LEVEL_OPTIONS = ['beginner', 'intermediate', 'advanced'];
const FORCE_OPTIONS = ['push', 'pull', 'static'];
const MECHANIC_OPTIONS = ['compound', 'isolation'];

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
        className="rounded-lg border border-[#1B3A2D]/15 bg-white px-2 py-1.5 text-sm text-[#1B3A2D]"
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
  muscleOptions,
  equipmentOptions,
}: {
  filters: ExerciseFilterState;
  onChange: (next: ExerciseFilterState) => void;
  muscleOptions: string[];
  equipmentOptions: string[];
}) {
  const toOptions = (values: string[]) =>
    values.map((v) => ({ value: v, label: v.replace(/_/g, ' ') }));

  return (
    <div className="grid grid-cols-2 gap-3 rounded-[20px] bg-white/70 p-4 sm:grid-cols-3 md:grid-cols-8">
      <FilterSelect
        label="Category"
        value={filters.category}
        options={toOptions(CATEGORY_OPTIONS)}
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
      <FilterSelect
        label="Force"
        value={filters.force}
        options={toOptions(FORCE_OPTIONS)}
        onChange={(v) => onChange({ ...filters, force: v })}
      />
      <FilterSelect
        label="Mechanic"
        value={filters.mechanic}
        options={toOptions(MECHANIC_OPTIONS)}
        onChange={(v) => onChange({ ...filters, mechanic: v })}
      />
      <label className="flex flex-col justify-end gap-1 text-xs font-medium text-[#6B7A72]">
        Has video
        <input
          type="checkbox"
          checked={filters.hasVideo}
          onChange={(e) => onChange({ ...filters, hasVideo: e.target.checked })}
          className="mt-1.5 h-4 w-4"
        />
      </label>
    </div>
  );
}
