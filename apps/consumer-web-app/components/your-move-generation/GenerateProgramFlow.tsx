'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import {
  generateProgramDraftAction,
  saveGeneratedProgramDraftAction,
} from '@/app/actions/your-move-generation';
import type { GeneratedProgramDraft } from '@/lib/your-move/generation';
import type { ProgramDifficulty } from '@mef/shared-types-contracts';
import { DraftSectionEditor, withLocalIds, stripLocalIds, type DraftSectionWithId } from './DraftSectionEditor';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const INPUT =
  'w-full rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-base text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none';
const FIELD_LABEL = 'flex flex-col gap-1 text-xs font-medium text-[#6B7A72]';

const GOAL_OPTIONS: { value: string; label: string }[] = [
  { value: 'muscle_building', label: 'Muscle Building' },
  { value: 'weight_loss', label: 'Weight Loss' },
  { value: 'strength', label: 'Strength' },
  { value: 'endurance', label: 'Endurance' },
];

type DraftSection = DraftSectionWithId;
type DayDraft = {
  localId: string;
  dayLabel: string;
  muscleGroups: string[];
  coachNotes: string;
  sections: DraftSection[];
};

let dayIdCounter = 0;
function nextDayId(): string {
  dayIdCounter += 1;
  return `day-${Date.now()}-${dayIdCounter}`;
}

export function GenerateProgramFlow({ difficultyOptions }: { difficultyOptions: string[] }) {
  const router = useRouter();
  const [goal, setGoal] = useState(GOAL_OPTIONS[0]!.value);
  const [weeks, setWeeks] = useState(4);
  const [difficulty, setDifficulty] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [logId, setLogId] = useState<string | null>(null);
  const [programName, setProgramName] = useState('');
  const [draftGoal, setDraftGoal] = useState('');
  const [draftDifficulty, setDraftDifficulty] = useState<ProgramDifficulty | null>(null);
  const [draftWeeks, setDraftWeeks] = useState(4);
  const [split, setSplit] = useState('');
  const [days, setDays] = useState<DayDraft[]>([]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function loadDraft(draft: GeneratedProgramDraft, newLogId: string) {
    setLogId(newLogId);
    setProgramName(draft.programName);
    setDraftGoal(draft.goal);
    setDraftDifficulty(draft.difficulty);
    setDraftWeeks(draft.weeks);
    setSplit(draft.split);
    const mappedDays = draft.days.map((day) => ({
      localId: nextDayId(),
      dayLabel: day.dayLabel,
      muscleGroups: day.muscleGroups,
      coachNotes: '',
      sections: withLocalIds(day.sections),
    }));
    setDays(mappedDays);
    setExpandedDay(mappedDays[0]?.localId ?? null);
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    const result = await generateProgramDraftAction({
      goal,
      weeks,
      difficulty: difficulty || undefined,
    });
    setGenerating(false);
    if (!('draft' in result)) {
      setGenerateError(result.error ?? 'Could not generate a program. Nothing was created.');
      return;
    }
    loadDraft(result.draft, result.logId);
  }

  function updateDay(dayId: string, patch: Partial<DayDraft>) {
    setDays((prev) => prev.map((d) => (d.localId === dayId ? { ...d, ...patch } : d)));
  }

  async function handleSave() {
    if (!programName.trim()) {
      setSaveError('Give this program a name.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    const result = await saveGeneratedProgramDraftAction({
      programName: programName.trim(),
      goal: draftGoal,
      difficulty: draftDifficulty,
      days: days.map((day) => ({
        dayLabel: day.dayLabel,
        coachNotes: day.coachNotes.trim() || undefined,
        sections: stripLocalIds(day.sections).map((section) => ({
          name: section.name,
          sectionType: section.sectionType,
          exercises: section.exercises,
        })),
      })),
      logId: logId ?? undefined,
    });
    setSaving(false);
    if (!('ids' in result)) {
      setSaveError(result.error ?? 'Could not save this program. Please try again.');
      return;
    }
    router.push('/coach/programs' as Route);
  }

  if (days.length === 0) {
    return (
      <div className={`${CARD} space-y-4 p-6`}>
        <div>
          <p className="mb-1.5 text-xs font-medium text-[#6B7A72]">Goal</p>
          <div className="flex flex-wrap gap-1.5">
            {GOAL_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setGoal(o.value)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                  goal === o.value ? 'bg-[#1B3A2D] text-white' : 'bg-[#FAFAF8] text-[#6B7A72] hover:bg-[#1B3A2D]/5'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={FIELD_LABEL}>
            Number of Weeks
            <input
              type="number"
              min={1}
              max={52}
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value) || 1)}
              className={INPUT}
            />
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

        <p className="text-xs text-[#6B7A72]">
          Your Move builds one repeating weekly split — this program repeats it for {weeks} week{weeks === 1 ? '' : 's'}
          once saved and assigned.
        </p>

        {generateError && <p className="text-sm text-red-700">{generateError}</p>}

        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[#1B3A2D] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {generating ? 'Generating…' : 'Generate Program'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className={`${CARD} space-y-3 p-6`}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">Draft — Edit Before Saving</p>
        <label className={FIELD_LABEL}>
          Program Name
          <input value={programName} onChange={(e) => setProgramName(e.target.value)} className={INPUT} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={FIELD_LABEL}>
            Difficulty
            <select
              value={draftDifficulty ?? ''}
              onChange={(e) => setDraftDifficulty((e.target.value || null) as ProgramDifficulty | null)}
              className={INPUT}
            >
              <option value="">—</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
          <label className={FIELD_LABEL}>
            Weeks
            <input
              type="number"
              min={1}
              max={52}
              value={draftWeeks}
              onChange={(e) => setDraftWeeks(Number(e.target.value) || 1)}
              className={INPUT}
            />
          </label>
        </div>
        <p className="text-xs text-[#6B7A72]">
          {split} · {days.length} day{days.length === 1 ? '' : 's'}/week, repeats for {draftWeeks} week
          {draftWeeks === 1 ? '' : 's'} once assigned. Each day below saves as its own program in the Program
          Library — assign each on its own days of the week using the existing assign flow.
        </p>
      </section>

      {days.map((day) => {
        const expanded = expandedDay === day.localId;
        const exerciseCount = day.sections.reduce((sum, s) => sum + s.exercises.length, 0);
        return (
          <section key={day.localId} className={`${CARD} p-5`}>
            <button
              type="button"
              onClick={() => setExpandedDay(expanded ? null : day.localId)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className="min-w-0">
                <input
                  value={day.dayLabel}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateDay(day.localId, { dayLabel: e.target.value })}
                  className="w-full truncate rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-base font-semibold text-[#1B3A2D] hover:border-[#1B3A2D]/10 focus:border-[#F5B700] focus:outline-none"
                />
                <p className="mt-0.5 truncate px-1 text-xs text-[#6B7A72]">
                  {day.muscleGroups.map((m) => m.replace(/_/g, ' ')).join(', ')} · {exerciseCount} exercises
                </p>
              </div>
              {expanded ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-[#6B7A72]" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-[#6B7A72]" strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>

            {expanded && (
              <div className="mt-4 space-y-3">
                <label className={FIELD_LABEL}>
                  Coach Notes for this day (member-visible)
                  <textarea
                    value={day.coachNotes}
                    onChange={(e) => updateDay(day.localId, { coachNotes: e.target.value })}
                    rows={2}
                    className={`${INPUT} resize-none`}
                  />
                </label>
                <DraftSectionEditor
                  sections={day.sections}
                  onChange={(next) => updateDay(day.localId, { sections: next })}
                />
              </div>
            )}
          </section>
        );
      })}

      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-[28px] bg-[#1B3A2D] p-4 shadow-[0_10px_28px_-6px_rgba(27,58,45,0.4)]">
        <p className="text-xs text-white/80">
          {days.length} day{days.length === 1 ? '' : 's'} in this program
        </p>
        <div className="flex items-center gap-3">
          {saveError && <p className="text-xs text-red-300">{saveError}</p>}
          <button
            type="button"
            onClick={() => setDays([])}
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
