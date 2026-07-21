'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { ChevronDown, ChevronUp, Copy, GripVertical, Plus, Trash2, Dumbbell } from 'lucide-react';
import {
  updateProgramTemplateMetaAction,
  saveProgramTemplateContentAction,
} from '@/app/actions/coach-programs';
import type {
  TemplateMetaInput,
  TemplateContentSectionInput,
} from '@/lib/coach-program-builder/templates';
import { TagListInput } from './TagListInput';
import { ExercisePickerModal, type PickedExercise } from './ExercisePickerModal';
import type {
  CoachProgramTemplateWithContent,
  ExercisePrescriptionFields,
  ProgramDifficulty,
  ProgramSectionType,
} from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const INPUT =
  'w-full rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-base text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none';
const FIELD_LABEL = 'flex flex-col gap-1 text-xs font-medium text-[#6B7A72]';

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
  return `local-${Date.now()}-${localIdCounter}`;
}

const DEFAULT_PRESCRIPTION: ExercisePrescriptionFields = {
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
};

type BuilderExercise = ExercisePrescriptionFields & {
  localId: string;
  provider: string;
  externalId: string;
  exerciseName: string;
};

type BuilderSection = {
  localId: string;
  name: string;
  sectionType: ProgramSectionType;
  exercises: BuilderExercise[];
};

function contentToBuilderSections(
  template: CoachProgramTemplateWithContent | null
): BuilderSection[] {
  if (!template) return [];
  return template.sections.map((section) => ({
    localId: nextLocalId(),
    name: section.name,
    sectionType: section.section_type,
    exercises: section.exercises.map((exercise) => ({
      localId: nextLocalId(),
      provider: exercise.provider,
      externalId: exercise.external_id,
      exerciseName: exercise.exercise_name,
      sets: exercise.sets,
      reps: exercise.reps,
      rep_range_low: exercise.rep_range_low,
      rep_range_high: exercise.rep_range_high,
      time_seconds: exercise.time_seconds,
      distance_meters: exercise.distance_meters,
      rest_seconds: exercise.rest_seconds,
      tempo: exercise.tempo,
      rpe: exercise.rpe,
      load: exercise.load,
      load_unit: exercise.load_unit,
      resistance: exercise.resistance,
      band_color: exercise.band_color,
      side: exercise.side,
      unilateral: exercise.unilateral,
      hold_duration_seconds: exercise.hold_duration_seconds,
      frequency: exercise.frequency,
      priority: exercise.priority,
      is_required: exercise.is_required,
      notes: exercise.notes,
      coaching_cues: exercise.coaching_cues,
      pain_modification_notes: exercise.pain_modification_notes,
      alternate_exercises: exercise.alternate_exercises,
    })),
  }));
}

function ExerciseDetailFields({
  exercise,
  onChange,
}: {
  exercise: BuilderExercise;
  onChange: (patch: Partial<BuilderExercise>) => void;
}) {
  function numberField(value: number | null): string {
    return value === null ? '' : String(value);
  }
  function parseNumber(raw: string): number | null {
    if (raw.trim() === '') return null;
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[#1B3A2D]/5 pt-3 sm:grid-cols-3 md:grid-cols-4">
      <label className={FIELD_LABEL}>
        Sets
        <input
          type="number"
          min={0}
          value={numberField(exercise.sets)}
          onChange={(e) => onChange({ sets: parseNumber(e.target.value) })}
          className={INPUT}
        />
      </label>
      <label className={FIELD_LABEL}>
        Reps
        <input
          value={exercise.reps ?? ''}
          onChange={(e) => onChange({ reps: e.target.value || null })}
          placeholder="e.g. 12"
          className={INPUT}
        />
      </label>
      <label className={FIELD_LABEL}>
        Rep Range Low
        <input
          type="number"
          min={0}
          value={numberField(exercise.rep_range_low)}
          onChange={(e) => onChange({ rep_range_low: parseNumber(e.target.value) })}
          className={INPUT}
        />
      </label>
      <label className={FIELD_LABEL}>
        Rep Range High
        <input
          type="number"
          min={0}
          value={numberField(exercise.rep_range_high)}
          onChange={(e) => onChange({ rep_range_high: parseNumber(e.target.value) })}
          className={INPUT}
        />
      </label>
      <label className={FIELD_LABEL}>
        Time (seconds)
        <input
          type="number"
          min={0}
          value={numberField(exercise.time_seconds)}
          onChange={(e) => onChange({ time_seconds: parseNumber(e.target.value) })}
          className={INPUT}
        />
      </label>
      <label className={FIELD_LABEL}>
        Distance (meters)
        <input
          type="number"
          min={0}
          value={numberField(exercise.distance_meters)}
          onChange={(e) => onChange({ distance_meters: parseNumber(e.target.value) })}
          className={INPUT}
        />
      </label>
      <label className={FIELD_LABEL}>
        Rest (seconds)
        <input
          type="number"
          min={0}
          value={numberField(exercise.rest_seconds)}
          onChange={(e) => onChange({ rest_seconds: parseNumber(e.target.value) })}
          className={INPUT}
        />
      </label>
      <label className={FIELD_LABEL}>
        Tempo
        <input
          value={exercise.tempo ?? ''}
          onChange={(e) => onChange({ tempo: e.target.value || null })}
          placeholder="e.g. 2-0-2"
          className={INPUT}
        />
      </label>
      <label className={FIELD_LABEL}>
        RPE
        <input
          type="number"
          min={0}
          max={10}
          step={0.5}
          value={numberField(exercise.rpe)}
          onChange={(e) => onChange({ rpe: parseNumber(e.target.value) })}
          className={INPUT}
        />
      </label>
      <label className={FIELD_LABEL}>
        Load
        <input
          value={exercise.load ?? ''}
          onChange={(e) => onChange({ load: e.target.value || null })}
          placeholder="e.g. 135"
          className={INPUT}
        />
      </label>
      <label className={FIELD_LABEL}>
        Load Unit
        <select
          value={exercise.load_unit ?? ''}
          onChange={(e) => onChange({ load_unit: (e.target.value || null) as never })}
          className={INPUT}
        >
          <option value="">—</option>
          <option value="lbs">lbs</option>
          <option value="kg">kg</option>
          <option value="bodyweight">Bodyweight</option>
          <option value="band">Band</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className={FIELD_LABEL}>
        Resistance
        <input
          value={exercise.resistance ?? ''}
          onChange={(e) => onChange({ resistance: e.target.value || null })}
          className={INPUT}
        />
      </label>
      <label className={FIELD_LABEL}>
        Band Color
        <input
          value={exercise.band_color ?? ''}
          onChange={(e) => onChange({ band_color: e.target.value || null })}
          className={INPUT}
        />
      </label>
      <label className={FIELD_LABEL}>
        Side
        <select
          value={exercise.side ?? ''}
          onChange={(e) => onChange({ side: (e.target.value || null) as never })}
          className={INPUT}
        >
          <option value="">—</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
          <option value="both">Both</option>
          <option value="alternating">Alternating</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs font-medium text-[#6B7A72]">
        <input
          type="checkbox"
          checked={exercise.unilateral}
          onChange={(e) => onChange({ unilateral: e.target.checked })}
          className="h-4 w-4 rounded border-[#1B3A2D]/20"
        />
        Unilateral
      </label>
      <label className={FIELD_LABEL}>
        Hold Duration (seconds)
        <input
          type="number"
          min={0}
          value={numberField(exercise.hold_duration_seconds)}
          onChange={(e) => onChange({ hold_duration_seconds: parseNumber(e.target.value) })}
          className={INPUT}
        />
      </label>
      <label className={FIELD_LABEL}>
        Frequency
        <input
          value={exercise.frequency ?? ''}
          onChange={(e) => onChange({ frequency: e.target.value || null })}
          placeholder="e.g. 3x/week"
          className={INPUT}
        />
      </label>
      <label className={FIELD_LABEL}>
        Priority
        <select
          value={exercise.priority}
          onChange={(e) => onChange({ priority: e.target.value as never })}
          className={INPUT}
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs font-medium text-[#6B7A72]">
        <input
          type="checkbox"
          checked={exercise.is_required}
          onChange={(e) => onChange({ is_required: e.target.checked })}
          className="h-4 w-4 rounded border-[#1B3A2D]/20"
        />
        Required
      </label>

      <label className={`${FIELD_LABEL} col-span-2 sm:col-span-3 md:col-span-4`}>
        Coaching Cues
        <textarea
          value={exercise.coaching_cues ?? ''}
          onChange={(e) => onChange({ coaching_cues: e.target.value || null })}
          rows={2}
          className={`${INPUT} resize-none`}
        />
      </label>
      <label className={`${FIELD_LABEL} col-span-2 sm:col-span-3 md:col-span-4`}>
        Pain Modification Notes
        <textarea
          value={exercise.pain_modification_notes ?? ''}
          onChange={(e) => onChange({ pain_modification_notes: e.target.value || null })}
          rows={2}
          className={`${INPUT} resize-none`}
        />
      </label>
      <label className={`${FIELD_LABEL} col-span-2 sm:col-span-3 md:col-span-4`}>
        Notes
        <textarea
          value={exercise.notes ?? ''}
          onChange={(e) => onChange({ notes: e.target.value || null })}
          rows={2}
          className={`${INPUT} resize-none`}
        />
      </label>
    </div>
  );
}

export function ProgramBuilder({
  templateId,
  initialTemplate,
  clientId,
  backHref,
}: {
  templateId: string;
  initialTemplate: CoachProgramTemplateWithContent;
  clientId?: string | undefined;
  backHref: string;
}) {
  const router = useRouter();

  const [meta, setMeta] = useState<TemplateMetaInput>({
    name: initialTemplate.name,
    description: initialTemplate.description,
    goal: initialTemplate.goal,
    difficulty: initialTemplate.difficulty,
    estimatedDurationMinutes: initialTemplate.estimated_duration_minutes,
    equipment: initialTemplate.equipment,
    programTags: initialTemplate.program_tags,
    correctiveTags: initialTemplate.corrective_tags,
    movementTags: initialTemplate.movement_tags,
    targetMuscles: initialTemplate.target_muscles,
    coachNotes: initialTemplate.coach_notes,
    internalNotes: initialTemplate.internal_notes,
    memberInstructions: initialTemplate.member_instructions,
  });
  const [sections, setSections] = useState<BuilderSection[]>(() =>
    contentToBuilderSections(initialTemplate)
  );
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);
  const [pickerTargetSection, setPickerTargetSection] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [draggedSection, setDraggedSection] = useState<string | null>(null);
  const [draggedExercise, setDraggedExercise] = useState<{
    sectionId: string;
    exerciseId: string;
  } | null>(null);

  const totalExercises = useMemo(
    () => sections.reduce((sum, s) => sum + s.exercises.length, 0),
    [sections]
  );

  function addSection() {
    setSections((prev) => [
      ...prev,
      { localId: nextLocalId(), name: 'New Section', sectionType: 'custom', exercises: [] },
    ]);
  }

  function updateSection(sectionId: string, patch: Partial<BuilderSection>) {
    setSections((prev) => prev.map((s) => (s.localId === sectionId ? { ...s, ...patch } : s)));
  }

  function removeSection(sectionId: string) {
    setSections((prev) => prev.filter((s) => s.localId !== sectionId));
  }

  function reorderSections(targetSectionId: string) {
    if (!draggedSection || draggedSection === targetSectionId) return;
    setSections((prev) => {
      const dragged = prev.find((s) => s.localId === draggedSection);
      if (!dragged) return prev;
      const withoutDragged = prev.filter((s) => s.localId !== draggedSection);
      const targetIndex = withoutDragged.findIndex((s) => s.localId === targetSectionId);
      if (targetIndex === -1) return prev;
      const next = [...withoutDragged];
      next.splice(targetIndex, 0, dragged);
      return next;
    });
    setDraggedSection(null);
  }

  function addExercise(sectionId: string, picked: PickedExercise) {
    setSections((prev) =>
      prev.map((s) =>
        s.localId === sectionId
          ? {
              ...s,
              exercises: [
                ...s.exercises,
                {
                  ...DEFAULT_PRESCRIPTION,
                  localId: nextLocalId(),
                  provider: picked.provider,
                  externalId: picked.externalId,
                  exerciseName: picked.name,
                },
              ],
            }
          : s
      )
    );
    setPickerTargetSection(null);
  }

  function updateExercise(sectionId: string, exerciseId: string, patch: Partial<BuilderExercise>) {
    setSections((prev) =>
      prev.map((s) =>
        s.localId === sectionId
          ? {
              ...s,
              exercises: s.exercises.map((ex) =>
                ex.localId === exerciseId ? { ...ex, ...patch } : ex
              ),
            }
          : s
      )
    );
  }

  function removeExercise(sectionId: string, exerciseId: string) {
    setSections((prev) =>
      prev.map((s) =>
        s.localId === sectionId
          ? { ...s, exercises: s.exercises.filter((ex) => ex.localId !== exerciseId) }
          : s
      )
    );
  }

  function duplicateExercise(sectionId: string, exerciseId: string) {
    setSections((prev) =>
      prev.map((s) => {
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

  function moveExerciseToTarget(targetSectionId: string, targetExerciseId: string | null) {
    if (!draggedExercise) return;
    setSections((prev) => {
      let moving: BuilderExercise | null = null;
      const withoutDragged = prev.map((s) => {
        if (s.localId !== draggedExercise.sectionId) return s;
        const found = s.exercises.find((ex) => ex.localId === draggedExercise.exerciseId);
        if (found) moving = found;
        return {
          ...s,
          exercises: s.exercises.filter((ex) => ex.localId !== draggedExercise.exerciseId),
        };
      });
      if (!moving) return prev;

      return withoutDragged.map((s) => {
        if (s.localId !== targetSectionId) return s;
        const insertIndex = targetExerciseId
          ? s.exercises.findIndex((ex) => ex.localId === targetExerciseId)
          : s.exercises.length;
        const next = [...s.exercises];
        next.splice(insertIndex === -1 ? next.length : insertIndex, 0, moving as BuilderExercise);
        return { ...s, exercises: next };
      });
    });
    setDraggedExercise(null);
  }

  async function handleSave() {
    if (!meta.name.trim()) {
      setError('Give this program a name.');
      return;
    }
    setSaving(true);
    setError(null);

    const metaResult = await updateProgramTemplateMetaAction(templateId, meta);
    if (metaResult.error) {
      setError(metaResult.error);
      setSaving(false);
      return;
    }

    const contentInput: TemplateContentSectionInput[] = sections.map((section) => ({
      name: section.name,
      sectionType: section.sectionType,
      exercises: section.exercises.map((exercise) => ({
        provider: exercise.provider,
        externalId: exercise.externalId,
        exerciseName: exercise.exerciseName,
        sets: exercise.sets,
        reps: exercise.reps,
        rep_range_low: exercise.rep_range_low,
        rep_range_high: exercise.rep_range_high,
        time_seconds: exercise.time_seconds,
        distance_meters: exercise.distance_meters,
        rest_seconds: exercise.rest_seconds,
        tempo: exercise.tempo,
        rpe: exercise.rpe,
        load: exercise.load,
        load_unit: exercise.load_unit,
        resistance: exercise.resistance,
        band_color: exercise.band_color,
        side: exercise.side,
        unilateral: exercise.unilateral,
        hold_duration_seconds: exercise.hold_duration_seconds,
        frequency: exercise.frequency,
        priority: exercise.priority,
        is_required: exercise.is_required,
        notes: exercise.notes,
        coaching_cues: exercise.coaching_cues,
        pain_modification_notes: exercise.pain_modification_notes,
        alternate_exercises: exercise.alternate_exercises,
      })),
    }));

    const contentResult = await saveProgramTemplateContentAction(templateId, contentInput);
    setSaving(false);
    if (contentResult.error) {
      setError(contentResult.error);
      return;
    }
    setSavedAt(Date.now());
    router.refresh();
  }

  const difficultyOptions: { value: ProgramDifficulty; label: string }[] = [
    { value: 'beginner', label: 'Beginner' },
    { value: 'intermediate', label: 'Intermediate' },
    { value: 'advanced', label: 'Advanced' },
  ];

  return (
    <div className="space-y-5">
      {/* Template meta */}
      <section className={`${CARD} p-6`}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
          Program Details
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={FIELD_LABEL}>
            Program Name
            <input
              value={meta.name}
              onChange={(e) => setMeta({ ...meta, name: e.target.value })}
              className={INPUT}
            />
          </label>
          <label className={FIELD_LABEL}>
            Goal
            <input
              value={meta.goal ?? ''}
              onChange={(e) => setMeta({ ...meta, goal: e.target.value || null })}
              className={INPUT}
            />
          </label>
          <label className={FIELD_LABEL}>
            Difficulty
            <select
              value={meta.difficulty ?? ''}
              onChange={(e) => setMeta({ ...meta, difficulty: (e.target.value || null) as never })}
              className={INPUT}
            >
              <option value="">—</option>
              {difficultyOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className={FIELD_LABEL}>
            Estimated Duration (minutes)
            <input
              type="number"
              min={0}
              value={meta.estimatedDurationMinutes ?? ''}
              onChange={(e) =>
                setMeta({
                  ...meta,
                  estimatedDurationMinutes: e.target.value ? Number(e.target.value) : null,
                })
              }
              className={INPUT}
            />
          </label>
          <label className={`${FIELD_LABEL} sm:col-span-2`}>
            Description
            <textarea
              value={meta.description ?? ''}
              onChange={(e) => setMeta({ ...meta, description: e.target.value || null })}
              rows={2}
              className={`${INPUT} resize-none`}
            />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TagListInput
            label="Equipment"
            values={meta.equipment}
            onChange={(v) => setMeta({ ...meta, equipment: v })}
          />
          <TagListInput
            label="Program Tags"
            values={meta.programTags}
            onChange={(v) => setMeta({ ...meta, programTags: v })}
          />
          <TagListInput
            label="Corrective Tags"
            values={meta.correctiveTags}
            onChange={(v) => setMeta({ ...meta, correctiveTags: v })}
          />
          <TagListInput
            label="Movement Tags"
            values={meta.movementTags}
            onChange={(v) => setMeta({ ...meta, movementTags: v })}
          />
          <TagListInput
            label="Target Muscles"
            values={meta.targetMuscles}
            onChange={(v) => setMeta({ ...meta, targetMuscles: v })}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3">
          <label className={FIELD_LABEL}>
            Member Instructions
            <textarea
              value={meta.memberInstructions ?? ''}
              onChange={(e) => setMeta({ ...meta, memberInstructions: e.target.value || null })}
              rows={2}
              className={`${INPUT} resize-none`}
            />
          </label>
          <label className={FIELD_LABEL}>
            Coach Notes (member-visible)
            <textarea
              value={meta.coachNotes ?? ''}
              onChange={(e) => setMeta({ ...meta, coachNotes: e.target.value || null })}
              rows={2}
              className={`${INPUT} resize-none`}
            />
          </label>
          <label className={FIELD_LABEL}>
            Internal Notes (coach-only)
            <textarea
              value={meta.internalNotes ?? ''}
              onChange={(e) => setMeta({ ...meta, internalNotes: e.target.value || null })}
              rows={2}
              className={`${INPUT} resize-none`}
            />
          </label>
        </div>
      </section>

      {/* Sections */}
      <div className="space-y-4">
        {sections.map((section) => (
          <section
            key={section.localId}
            className={`${CARD} p-5`}
            draggable
            onDragStart={() => setDraggedSection(section.localId)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              reorderSections(section.localId);
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <GripVertical
                className="h-4 w-4 cursor-grab text-[#6B7A72]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <input
                value={section.name}
                onChange={(e) => updateSection(section.localId, { name: e.target.value })}
                className="min-w-[8rem] flex-1 rounded-xl border border-transparent bg-transparent px-2 py-1 text-base font-semibold text-[#1B3A2D] hover:border-[#1B3A2D]/10 focus:border-[#F5B700] focus:outline-none"
              />
              <select
                value={section.sectionType}
                onChange={(e) =>
                  updateSection(section.localId, {
                    sectionType: e.target.value as ProgramSectionType,
                  })
                }
                className="rounded-xl border border-[#1B3A2D]/10 bg-[#FAFAF8] px-2.5 py-1.5 text-base text-[#1B3A2D]"
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
                <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            <div
              className="mt-3 space-y-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                moveExerciseToTarget(section.localId, null);
              }}
            >
              {section.exercises.length === 0 && (
                <p className="rounded-2xl border border-dashed border-[#1B3A2D]/15 p-4 text-center text-xs text-[#6B7A72]">
                  No exercises yet. Add one below.
                </p>
              )}
              {section.exercises.map((exercise) => {
                const expanded = expandedExerciseId === exercise.localId;
                return (
                  <div
                    key={exercise.localId}
                    draggable
                    onDragStart={() =>
                      setDraggedExercise({
                        sectionId: section.localId,
                        exerciseId: exercise.localId,
                      })
                    }
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      moveExerciseToTarget(section.localId, exercise.localId);
                    }}
                    className="rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3"
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical
                        className="h-4 w-4 shrink-0 cursor-grab text-[#6B7A72]"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        onClick={() => setExpandedExerciseId(expanded ? null : exercise.localId)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span className="truncate text-sm font-medium text-[#1B3A2D]">
                          {exercise.exerciseName}
                        </span>
                        <span className="shrink-0 text-xs text-[#6B7A72]">
                          {[
                            exercise.sets ? `${exercise.sets} sets` : null,
                            exercise.reps ? `${exercise.reps} reps` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        {!exercise.is_required && (
                          <span className="shrink-0 rounded-full bg-[#1B3A2D]/[0.06] px-2 py-0.5 text-[10px] font-medium uppercase text-[#6B7A72]">
                            Optional
                          </span>
                        )}
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                            exercise.priority === 'high'
                              ? 'bg-[#F5B700]/20 text-[#854D0E]'
                              : 'bg-[#1B3A2D]/[0.06] text-[#6B7A72]'
                          }`}
                        >
                          {exercise.priority}
                        </span>
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
                      <button
                        type="button"
                        onClick={() => setExpandedExerciseId(expanded ? null : exercise.localId)}
                        aria-label={expanded ? 'Collapse' : 'Expand'}
                        className="shrink-0 rounded-full p-1.5 text-[#6B7A72] hover:bg-[#1B3A2D]/5 hover:text-[#1B3A2D]"
                      >
                        {expanded ? (
                          <ChevronUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                        )}
                      </button>
                    </div>

                    {expanded && (
                      <ExerciseDetailFields
                        exercise={exercise}
                        onChange={(patch) =>
                          updateExercise(section.localId, exercise.localId, patch)
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setPickerTargetSection(section.localId)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#1B3A2D]/20 py-2.5 text-sm font-medium text-[#1B3A2D] transition hover:border-[#1B3A2D]/40 hover:bg-[#EFF6F1]"
            >
              <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Add Exercise
            </button>
          </section>
        ))}
      </div>

      <button
        type="button"
        onClick={addSection}
        className="flex w-full items-center justify-center gap-1.5 rounded-[28px] border border-dashed border-[#1B3A2D]/20 bg-white/60 py-3.5 text-sm font-medium text-[#1B3A2D] transition hover:border-[#1B3A2D]/40"
      >
        <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        Add Section
      </button>

      {/* Save bar */}
      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-[28px] bg-[#1B3A2D] p-4 shadow-[0_10px_28px_-6px_rgba(27,58,45,0.4)]">
        <div className="flex items-center gap-2 text-white/80">
          <Dumbbell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-xs">
            {sections.length} section{sections.length === 1 ? '' : 's'} · {totalExercises} exercise
            {totalExercises === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {error && <p className="text-xs text-red-300">{error}</p>}
          {!error && savedAt && <p className="text-xs text-white/70">Saved</p>}
          <button
            type="button"
            onClick={() => router.push(backHref as Route)}
            className="rounded-full px-4 py-2 text-sm font-medium text-white/80 hover:text-white"
          >
            Done
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-[#F5B700] px-5 py-2 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Program'}
          </button>
        </div>
      </div>

      {pickerTargetSection && (
        <ExercisePickerModal
          clientId={clientId}
          onPick={(picked) => addExercise(pickerTargetSection, picked)}
          onClose={() => setPickerTargetSection(null)}
        />
      )}
    </div>
  );
}
