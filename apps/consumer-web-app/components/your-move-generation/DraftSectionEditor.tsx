'use client';

import { useState } from 'react';
import { GripVertical, Plus, Trash2, Copy, Repeat } from 'lucide-react';
import {
  ExercisePickerModal,
  type PickedExercise,
} from '@/components/coach-program-builder/ExercisePickerModal';
import type { ProgramSectionType } from '@mef/shared-types-contracts';
import type { GeneratedDraftExercise, GeneratedDraftSection } from '@/lib/your-move/generation';

const CARD = 'rounded-[24px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const INPUT =
  'w-full rounded-xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-2.5 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none';
const FIELD_LABEL = 'flex flex-col gap-1 text-[11px] font-medium text-[#6B7A72]';

const SECTION_TYPE_OPTIONS: { value: ProgramSectionType; label: string }[] = [
  { value: 'warm_up', label: 'Warm Up' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'activation', label: 'Activation' },
  { value: 'corrective', label: 'Corrective Exercise' },
  { value: 'strength', label: 'Strength' },
  { value: 'conditioning', label: 'Conditioning' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'core', label: 'Core' },
  { value: 'cooldown', label: 'Cooldown' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'custom', label: 'Custom' },
];

let localIdCounter = 0;
function nextLocalId(): string {
  localIdCounter += 1;
  return `draft-local-${Date.now()}-${localIdCounter}`;
}

export type DraftExerciseWithId = GeneratedDraftExercise & { localId: string };
export type DraftSectionWithId = {
  localId: string;
  name: string;
  sectionType: ProgramSectionType;
  exercises: DraftExerciseWithId[];
};

/** Stamps local ids onto a freshly-generated draft's sections so this editor can key/reorder them — call once when a draft first arrives. */
export function withLocalIds(sections: GeneratedDraftSection[]): DraftSectionWithId[] {
  return sections.map((section) => ({
    ...section,
    localId: nextLocalId(),
    exercises: section.exercises.map((exercise) => ({ ...exercise, localId: nextLocalId() })),
  }));
}

type SectionState = DraftSectionWithId;

export function stripLocalIds(sections: SectionState[]): GeneratedDraftSection[] {
  return sections.map(({ localId: _s, exercises, ...section }) => ({
    ...section,
    exercises: exercises.map(({ localId: _e, ...exercise }) => exercise),
  }));
}

/**
 * The generated-draft counterpart to ProgramBuilder.tsx's section/exercise
 * tree editor — deliberately lighter (sets/reps/rest/notes only, not the
 * full 20-field prescription form) since a coach can always open the
 * saved template in the full Program Builder afterward for deeper
 * editing. Reuses ExercisePickerModal exactly as ProgramBuilder does, for
 * both "add an exercise" and "swap this exercise."
 */
export function DraftSectionEditor({
  sections,
  onChange,
}: {
  sections: SectionState[];
  onChange: (next: SectionState[]) => void;
}) {
  const [pickerTarget, setPickerTarget] = useState<
    { sectionId: string; mode: 'add' } | { sectionId: string; exerciseId: string; mode: 'swap' } | null
  >(null);

  function updateSection(sectionId: string, patch: Partial<SectionState>) {
    onChange(sections.map((s) => (s.localId === sectionId ? { ...s, ...patch } : s)));
  }

  function removeSection(sectionId: string) {
    onChange(sections.filter((s) => s.localId !== sectionId));
  }

  function addSection() {
    onChange([
      ...sections,
      { localId: nextLocalId(), name: 'New Section', sectionType: 'custom', exercises: [] },
    ]);
  }

  function updateExercise(sectionId: string, exerciseId: string, patch: Partial<DraftExerciseWithId>) {
    onChange(
      sections.map((s) =>
        s.localId === sectionId
          ? { ...s, exercises: s.exercises.map((ex) => (ex.localId === exerciseId ? { ...ex, ...patch } : ex)) }
          : s
      )
    );
  }

  function removeExercise(sectionId: string, exerciseId: string) {
    onChange(
      sections.map((s) =>
        s.localId === sectionId ? { ...s, exercises: s.exercises.filter((ex) => ex.localId !== exerciseId) } : s
      )
    );
  }

  function duplicateExercise(sectionId: string, exerciseId: string) {
    onChange(
      sections.map((s) => {
        if (s.localId !== sectionId) return s;
        const index = s.exercises.findIndex((ex) => ex.localId === exerciseId);
        if (index === -1) return s;
        const copy = { ...s.exercises[index]!, localId: nextLocalId() };
        const next = [...s.exercises];
        next.splice(index + 1, 0, copy);
        return { ...s, exercises: next };
      })
    );
  }

  function addExercise(sectionId: string, picked: PickedExercise) {
    onChange(
      sections.map((s) =>
        s.localId === sectionId
          ? {
              ...s,
              exercises: [
                ...s.exercises,
                {
                  localId: nextLocalId(),
                  provider: 'your_move',
                  externalId: picked.externalId,
                  exerciseName: picked.name,
                  sets: null,
                  reps: null,
                  rep_range_low: null,
                  rep_range_high: null,
                  time_seconds: null,
                  distance_meters: null,
                  rest_seconds: null,
                  tempo: null,
                  rpe: null,
                  load: null,
                  load_unit: null,
                  resistance: null,
                  band_color: null,
                  side: null,
                  unilateral: false,
                  hold_duration_seconds: null,
                  frequency: null,
                  priority: 'medium',
                  is_required: true,
                  notes: null,
                  coaching_cues: null,
                  pain_modification_notes: null,
                  alternate_exercises: {},
                },
              ],
            }
          : s
      )
    );
    setPickerTarget(null);
  }

  function swapExercise(sectionId: string, exerciseId: string, picked: PickedExercise) {
    updateExercise(sectionId, exerciseId, {
      externalId: picked.externalId,
      exerciseName: picked.name,
    });
    setPickerTarget(null);
  }

  function numberField(value: number | null): string {
    return value === null ? '' : String(value);
  }
  function parseNumber(raw: string): number | null {
    if (raw.trim() === '') return null;
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
  }

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <section key={section.localId} className={`${CARD} p-4`}>
          <div className="flex flex-wrap items-center gap-2">
            <GripVertical className="h-4 w-4 text-[#6B7A72]" strokeWidth={1.75} aria-hidden="true" />
            <input
              value={section.name}
              onChange={(e) => updateSection(section.localId, { name: e.target.value })}
              className="min-w-[6rem] flex-1 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold text-[#1B3A2D] hover:border-[#1B3A2D]/10 focus:border-[#F5B700] focus:outline-none"
            />
            <select
              value={section.sectionType}
              onChange={(e) => updateSection(section.localId, { sectionType: e.target.value as ProgramSectionType })}
              className="rounded-lg border border-[#1B3A2D]/10 bg-[#FAFAF8] px-2 py-1 text-xs text-[#1B3A2D]"
            >
              {SECTION_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeSection(section.localId)}
              aria-label="Remove section"
              className="rounded-full p-1.5 text-[#6B7A72] hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>

          <div className="mt-2.5 space-y-2">
            {section.exercises.length === 0 && (
              <p className="rounded-xl border border-dashed border-[#1B3A2D]/15 p-3 text-center text-xs text-[#6B7A72]">
                No exercises in this section.
              </p>
            )}
            {section.exercises.map((exercise) => (
              <div key={exercise.localId} className="rounded-xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-3.5 w-3.5 shrink-0 text-[#6B7A72]" strokeWidth={1.75} aria-hidden="true" />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-[#1B3A2D]">
                    {exercise.exerciseName}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPickerTarget({ sectionId: section.localId, exerciseId: exercise.localId, mode: 'swap' })}
                    aria-label="Swap exercise"
                    className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-[#1B3A2D] hover:bg-[#1B3A2D]/5"
                  >
                    <Repeat className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    Swap
                  </button>
                  <button
                    type="button"
                    onClick={() => duplicateExercise(section.localId, exercise.localId)}
                    aria-label="Duplicate exercise"
                    className="shrink-0 rounded-full p-1.5 text-[#6B7A72] hover:bg-[#1B3A2D]/5 hover:text-[#1B3A2D]"
                  >
                    <Copy className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeExercise(section.localId, exercise.localId)}
                    aria-label="Remove exercise"
                    className="shrink-0 rounded-full p-1.5 text-[#6B7A72] hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2">
                  <label className={FIELD_LABEL}>
                    Sets
                    <input
                      type="number"
                      min={0}
                      value={numberField(exercise.sets)}
                      onChange={(e) => updateExercise(section.localId, exercise.localId, { sets: parseNumber(e.target.value) })}
                      className={INPUT}
                    />
                  </label>
                  <label className={FIELD_LABEL}>
                    Reps
                    <input
                      value={exercise.reps ?? ''}
                      onChange={(e) => updateExercise(section.localId, exercise.localId, { reps: e.target.value || null })}
                      placeholder="e.g. 10-12"
                      className={INPUT}
                    />
                  </label>
                  <label className={FIELD_LABEL}>
                    Rest (sec)
                    <input
                      type="number"
                      min={0}
                      value={numberField(exercise.rest_seconds)}
                      onChange={(e) =>
                        updateExercise(section.localId, exercise.localId, { rest_seconds: parseNumber(e.target.value) })
                      }
                      className={INPUT}
                    />
                  </label>
                </div>
                <label className={`${FIELD_LABEL} mt-2`}>
                  Notes for this exercise
                  <textarea
                    value={exercise.notes ?? ''}
                    onChange={(e) => updateExercise(section.localId, exercise.localId, { notes: e.target.value || null })}
                    rows={1}
                    placeholder="Optional coach notes"
                    className={`${INPUT} resize-none`}
                  />
                </label>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setPickerTarget({ sectionId: section.localId, mode: 'add' })}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#1B3A2D]/20 py-2 text-xs font-medium text-[#1B3A2D] transition hover:border-[#1B3A2D]/40 hover:bg-[#EFF6F1]"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            Add Exercise
          </button>
        </section>
      ))}

      <button
        type="button"
        onClick={addSection}
        className="flex w-full items-center justify-center gap-1.5 rounded-[20px] border border-dashed border-[#1B3A2D]/20 bg-white/60 py-2.5 text-xs font-medium text-[#1B3A2D] transition hover:border-[#1B3A2D]/40"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        Add Section
      </button>

      {pickerTarget && pickerTarget.mode === 'add' && (
        <ExercisePickerModal
          onPick={(picked) => addExercise(pickerTarget.sectionId, picked)}
          onClose={() => setPickerTarget(null)}
        />
      )}
      {pickerTarget && pickerTarget.mode === 'swap' && (
        <ExercisePickerModal
          onPick={(picked) => swapExercise(pickerTarget.sectionId, pickerTarget.exerciseId, picked)}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </div>
  );
}
