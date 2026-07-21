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
  imageOnly: boolean;
  hideNoMedia: boolean;
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
  imageOnly: false,
  hideNoMedia: false,
};

/** Number of filters a member has actually set — drives the active-filter count badge. Search text is intentionally excluded; this counts refinements, not the query itself. */
export function countActiveFilters(filters: ExerciseFilterState): number {
  return Object.values(filters).filter((v) => v !== '' && v !== false).length;
}

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
        className="mef-focus-ring rounded-lg border border-[#1B3A2D]/15 bg-white px-2 py-1.5 text-sm text-[#1B3A2D] transition hover:border-[#1B3A2D]/30"
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

function MediaToggle({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`mef-focus-ring min-h-10 rounded-full border px-3.5 py-2 text-xs font-medium transition ${
        active
          ? 'border-[#1B3A2D] bg-[#1B3A2D] text-white'
          : 'border-[#1B3A2D]/15 bg-white text-[#6B7A72] hover:border-[#1B3A2D]/40'
      }`}
    >
      {label}
    </button>
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
  const activeCount = countActiveFilters(filters);

  return (
    <div className="rounded-[20px] bg-white/70 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <MediaToggle
          label="Video Only"
          active={filters.hasVideo}
          onToggle={() => onChange({ ...filters, hasVideo: !filters.hasVideo })}
        />
        <MediaToggle
          label="Image Only"
          active={filters.imageOnly}
          onToggle={() => onChange({ ...filters, imageOnly: !filters.imageOnly })}
        />
        <MediaToggle
          label="Hide No Media"
          active={filters.hideNoMedia}
          onToggle={() => onChange({ ...filters, hideNoMedia: !filters.hideNoMedia })}
        />

        <div className="ml-auto flex items-center gap-2">
          {activeCount > 0 && (
            <span className="rounded-full bg-[#F5B700]/20 px-2.5 py-1 text-xs font-semibold text-[#1B3A2D]">
              {activeCount} active
            </span>
          )}
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => onChange(EMPTY_EXERCISE_FILTERS)}
              className="mef-focus-ring rounded-full px-2.5 py-1 text-xs font-semibold text-[#6B7A72] underline-offset-2 transition hover:text-[#1B3A2D] hover:underline"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
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
      </div>
    </div>
  );
}
