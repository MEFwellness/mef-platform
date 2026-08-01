'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { Sparkles } from 'lucide-react';
import {
  generateWorkoutDraftAction,
  saveGeneratedWorkoutDraftAction,
} from '@/app/actions/your-move-generation';
import type { GeneratedWorkoutDraft } from '@/lib/your-move/generation';
import type { ProgramDifficulty } from '@mef/shared-types-contracts';
import { DraftSectionEditor, withLocalIds, stripLocalIds, type DraftSectionWithId } from './DraftSectionEditor';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const INPUT =
  'w-full rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-base text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none';
const FIELD_LABEL = 'flex flex-col gap-1 text-xs font-medium text-[#6B7A72]';
const CHIP_BASE = 'rounded-full px-3.5 py-1.5 text-xs font-medium transition';

type DraftSection = DraftSectionWithId;

export function GenerateWorkoutFlow({
  muscleOptions,
  equipmentOptions,
  difficultyOptions,
}: {
  muscleOptions: string[];
  equipmentOptions: string[];
  difficultyOptions: string[];
}) {
  const router = useRouter();
  const [muscleGroups, setMuscleGroups] = useState<string[]>([]);
  const [equipment, setEquipment] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [logId, setLogId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [draftDifficulty, setDraftDifficulty] = useState<ProgramDifficulty | null>(null);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);
  const [coachNotes, setCoachNotes] = useState('');
  const [sections, setSections] = useState<DraftSection[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function toggleMuscle(muscle: string) {
    setMuscleGroups((prev) => (prev.includes(muscle) ? prev.filter((m) => m !== muscle) : [...prev, muscle]));
  }

  function loadDraft(draft: GeneratedWorkoutDraft, newLogId: string) {
    setLogId(newLogId);
    setName(draft.name);
    setDraftDifficulty(draft.difficulty);
    setEstimatedMinutes(draft.estimatedDurationMinutes);
    setCoachNotes('');
    setSections(withLocalIds(draft.sections));
  }

  async function handleGenerate() {
    if (muscleGroups.length === 0) {
      setGenerateError('Choose at least one muscle group.');
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    const result = await generateWorkoutDraftAction({
      muscleGroups,
      equipment: equipment || undefined,
      difficulty: difficulty || undefined,
    });
    setGenerating(false);
    if (!('draft' in result)) {
      setGenerateError(result.error ?? 'Could not generate a workout. Nothing was created.');
      return;
    }
    loadDraft(result.draft, result.logId);
  }

  async function handleSave() {
    if (!name.trim()) {
      setSaveError('Give this workout a name.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    const result = await saveGeneratedWorkoutDraftAction({
      name: name.trim(),
      difficulty: draftDifficulty,
      estimatedDurationMinutes: estimatedMinutes,
      coachNotes: coachNotes.trim() || undefined,
      sections: stripLocalIds(sections).map((section) => ({
        name: section.name,
        sectionType: section.sectionType,
        exercises: section.exercises,
      })),
      logId: logId ?? undefined,
    });
    setSaving(false);
    if (!('id' in result)) {
      setSaveError(result.error ?? 'Could not save this workout. Please try again.');
      return;
    }
    router.push(`/coach/programs/${result.id}` as Route);
  }

  if (sections.length === 0) {
    return (
      <div className={`${CARD} space-y-4 p-6`}>
        <div>
          <p className="mb-1.5 text-xs font-medium text-[#6B7A72]">Muscle Group(s)</p>
          <div className="flex flex-wrap gap-1.5">
            {muscleOptions.map((muscle) => (
              <button
                key={muscle}
                type="button"
                onClick={() => toggleMuscle(muscle)}
                className={`${CHIP_BASE} ${
                  muscleGroups.includes(muscle)
                    ? 'bg-[#1B3A2D] text-white'
                    : 'bg-[#FAFAF8] text-[#6B7A72] hover:bg-[#1B3A2D]/5'
                }`}
              >
                {muscle.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={FIELD_LABEL}>
            Equipment
            <select value={equipment} onChange={(e) => setEquipment(e.target.value)} className={INPUT}>
              <option value="">Any</option>
              {equipmentOptions.map((o) => (
                <option key={o} value={o}>
                  {o.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className={FIELD_LABEL}>
            Difficulty
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={INPUT}>
              <option value="">Any</option>
              {difficultyOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        </div>

        {generateError && <p className="text-sm text-red-700">{generateError}</p>}

        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[#1B3A2D] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {generating ? 'Generating…' : 'Generate Workout'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className={`${CARD} space-y-3 p-6`}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">Draft: Edit Before Saving</p>
        <label className={FIELD_LABEL}>
          Workout Name
          <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={FIELD_LABEL}>
            Difficulty
            <select
              value={draftDifficulty ?? ''}
              onChange={(e) => setDraftDifficulty((e.target.value || null) as ProgramDifficulty | null)}
              className={INPUT}
            >
              <option value="">-</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
          <label className={FIELD_LABEL}>
            Estimated Duration (minutes)
            <input
              type="number"
              min={0}
              value={estimatedMinutes ?? ''}
              onChange={(e) => setEstimatedMinutes(e.target.value ? Number(e.target.value) : null)}
              className={INPUT}
            />
          </label>
        </div>
        <label className={FIELD_LABEL}>
          Coach Notes (member-visible)
          <textarea
            value={coachNotes}
            onChange={(e) => setCoachNotes(e.target.value)}
            rows={2}
            className={`${INPUT} resize-none`}
          />
        </label>
      </section>

      <DraftSectionEditor sections={sections} onChange={setSections} />

      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-[28px] bg-[#1B3A2D] p-4 shadow-[0_10px_28px_-6px_rgba(27,58,45,0.4)]">
        <p className="text-xs text-white/80">
          {sections.reduce((sum, s) => sum + s.exercises.length, 0)} exercises across {sections.length} section
          {sections.length === 1 ? '' : 's'}
        </p>
        <div className="flex items-center gap-3">
          {saveError && <p className="text-xs text-red-300">{saveError}</p>}
          <button
            type="button"
            onClick={() => setSections([])}
            className="rounded-full px-4 py-2 text-sm font-medium text-white/80 hover:text-white"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-[#F5B700] px-5 py-2 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save to Program Library'}
          </button>
        </div>
      </div>
    </div>
  );
}
