'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { ChevronLeft, Plus, X, RefreshCw, ShieldAlert, VideoOff } from 'lucide-react';
import type {
  CoachProgramTemplateWithContent,
  ProgramSectionType,
} from '@mef/shared-types-contracts';
import type { BlueprintKey, CorrectiveSeverity, SessionBlockType } from '@/lib/corrective-engine/types';
import { CORRECTIVE_BLUEPRINTS } from '@/lib/corrective-engine/blueprints';
import { blockPrescription } from '@/lib/corrective-engine/dosing';
import { readSeverityTag } from '@/lib/corrective-engine/types';
import { formatPrescriptionLine } from '@/lib/coach-program-builder/prescription';
import {
  saveProgramTemplateContentAction,
  updateProgramTemplateMetaAction,
} from '@/app/actions/coach-programs';
import {
  regenerateCorrectiveDraftAction,
  approveCorrectiveDraftAction,
  discardCorrectiveDraftAction,
  getCorrectiveSlotGapsAction,
} from '@/app/actions/corrective-programs';
import { describeBlockGap, type SlotCoverageGap } from '@/lib/corrective-engine/coverage';
import type { TemplateContentSectionInput, TemplateMetaInput } from '@/lib/coach-program-builder/templates';
import {
  CorrectiveExercisePickerModal,
  type CorrectivePickedExercise,
} from './CorrectiveExercisePickerModal';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const BLOCK_BY_SECTION_TYPE: Record<string, SessionBlockType> = {
  corrective: 'release',
  mobility: 'mobility',
  activation: 'stability',
  strength: 'strength',
  core: 'core',
};

const BLOCK_LABEL: Record<SessionBlockType, string> = {
  release: 'Release',
  mobility: 'Mobility',
  stability: 'Stability',
  strength: 'Strength',
  core: 'Core',
};

/**
 * The prescription as the coach edits it: strings, because these are text
 * inputs and an empty input is a real state a number cannot hold. They are
 * parsed back to numbers on save, and a field left blank is written as
 * null rather than as zero.
 */
type EditablePrescription = {
  sets: string;
  reps: string;
  holdSeconds: string;
  tempo: string;
  restSeconds: string;
};

/** The five fields a coach edits, in the order they are read aloud. Hold and reps are both offered because a block uses one or the other, and a coach changing a stability exercise into a hold should not need a developer. */
const PRESCRIPTION_FIELDS: {
  field: keyof EditablePrescription;
  label: string;
  inputMode: 'numeric' | 'text';
}[] = [
  { field: 'sets', label: 'Sets', inputMode: 'numeric' },
  { field: 'reps', label: 'Reps', inputMode: 'numeric' },
  { field: 'holdSeconds', label: 'Hold (s)', inputMode: 'numeric' },
  { field: 'tempo', label: 'Tempo', inputMode: 'text' },
  { field: 'restSeconds', label: 'Rest (s)', inputMode: 'numeric' },
];

type EditableExercise = {
  key: string;
  provider: string;
  externalId: string;
  exerciseName: string;
  coachingCues: string | null;
  selectionReasoning: string | null;
  isCoachOverride: boolean;
  prescription: EditablePrescription;
};

type EditableSectionRow = {
  sectionType: ProgramSectionType;
  block: SessionBlockType;
  name: string;
  blockReasoning: string | null;
  exercises: EditableExercise[];
};

type EditableSession = {
  templateId: string;
  label: string;
  coachNotes: string;
  sections: EditableSectionRow[];
};

function sessionLabelOf(template: CoachProgramTemplateWithContent): string {
  const match = template.name.match(/: (Session [A-Z])$/);
  return match?.[1] ?? template.name;
}

function numberField(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** A block's starting prescription, for an exercise a coach ADDS to a draft — the same table the generator read, at the same severity, so an added exercise and a generated one are dosed alike. */
function defaultPrescriptionFor(
  block: SessionBlockType,
  severity: CorrectiveSeverity
): EditablePrescription {
  const dose = blockPrescription(block, severity);
  return {
    sets: numberField(dose.sets),
    reps: dose.reps ?? '',
    holdSeconds: numberField(dose.hold_duration_seconds),
    tempo: dose.tempo ?? '',
    restSeconds: numberField(dose.rest_seconds),
  };
}

function toEditableSessions(templates: CoachProgramTemplateWithContent[]): EditableSession[] {
  return templates.map((template) => ({
    templateId: template.id,
    label: sessionLabelOf(template),
    coachNotes: template.coach_notes ?? '',
    sections: template.sections.map((section) => ({
      sectionType: section.section_type,
      block: BLOCK_BY_SECTION_TYPE[section.section_type] ?? 'strength',
      name: section.name,
      blockReasoning: section.block_reasoning,
      exercises: section.exercises.map((exercise) => ({
        key: `${exercise.id}`,
        provider: exercise.provider,
        externalId: exercise.external_id,
        exerciseName: exercise.exercise_name,
        coachingCues: exercise.coaching_cues,
        selectionReasoning: exercise.selection_reasoning,
        isCoachOverride: exercise.is_coach_override,
        prescription: {
          sets: numberField(exercise.sets),
          reps: exercise.reps ?? '',
          holdSeconds: numberField(exercise.hold_duration_seconds),
          tempo: exercise.tempo ?? '',
          restSeconds: numberField(exercise.rest_seconds),
        },
      })),
    })),
  }));
}

function toSectionsInput(session: EditableSession): TemplateContentSectionInput[] {
  return session.sections.map((section) => ({
    name: section.name,
    sectionType: section.sectionType,
    blockReasoning: section.blockReasoning,
    exercises: section.exercises.map((exercise) => {
      // Whatever the coach has in the fields right now, saved verbatim.
      // This used to write null for every one of them, which quietly
      // erased the generator's dosing on Save Draft and again on Approve.
      const reps = exercise.prescription.reps.trim();
      const repsNumber = toNumber(reps);
      return {
        provider: exercise.provider,
        externalId: exercise.externalId,
        exerciseName: exercise.exerciseName,
        selectionReasoning: exercise.selectionReasoning,
        isCoachOverride: exercise.isCoachOverride,
        sets: toNumber(exercise.prescription.sets),
        reps: reps === '' ? null : reps,
        rep_range_low: repsNumber,
        rep_range_high: repsNumber,
        time_seconds: null,
        distance_meters: null,
        rest_seconds: toNumber(exercise.prescription.restSeconds),
        tempo: exercise.prescription.tempo.trim() || null,
        rpe: null,
        load: null,
        load_unit: null,
        resistance: null,
        band_color: null,
        side: null,
        unilateral: false,
        hold_duration_seconds: toNumber(exercise.prescription.holdSeconds),
        frequency: null,
        priority: 'medium',
        is_required: true,
        notes: null,
        coaching_cues: exercise.coachingCues,
        pain_modification_notes: null,
        alternate_exercises: {},
      };
    }),
  }));
}

function metaFor(template: CoachProgramTemplateWithContent, coachNotes: string, programNotes: string): TemplateMetaInput {
  return {
    name: template.name,
    description: template.description,
    goal: template.goal,
    difficulty: template.difficulty,
    estimatedDurationMinutes: template.estimated_duration_minutes,
    equipment: template.equipment,
    programTags: template.program_tags,
    correctiveTags: template.corrective_tags,
    movementTags: template.movement_tags,
    targetMuscles: template.target_muscles,
    coachNotes: coachNotes.trim() || null,
    internalNotes: programNotes.trim() || null,
    memberInstructions: template.member_instructions,
  };
}

function nextMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const offset = day === 1 ? 7 : ((8 - day) % 7) || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() + offset);
  return monday.toISOString().slice(0, 10);
}

export function DraftReviewPanel({
  memberId,
  memberName,
  group,
}: {
  memberId: string;
  memberName: string;
  group: { programGroupTag: string; templates: CoachProgramTemplateWithContent[] };
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<EditableSession[]>(() => toEditableSessions(group.templates));
  const [programNotes, setProgramNotes] = useState(group.templates[0]?.internal_notes ?? '');
  const [picker, setPicker] = useState<{
    sessionIndex: number;
    sectionIndex: number;
    exerciseIndex: number | null; // null = adding, index = swapping that slot
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(nextMonday);

  const severity: CorrectiveSeverity = useMemo(
    () => readSeverityTag(group.templates[0]?.program_tags ?? []),
    [group.templates]
  );

  const blueprintKeys = useMemo(
    () => (group.templates[0]?.corrective_tags ?? []) as BlueprintKey[],
    [group.templates]
  );
  const equipment = useMemo(
    () => group.templates[0]?.equipment ?? [],
    [group.templates]
  );
  const equipmentKey = equipment.join('|');
  const blueprintNames = blueprintKeys
    .map((k) => CORRECTIVE_BLUEPRINTS[k]?.name ?? k)
    .join(' + ');

  // Which slots nothing could have filled. Loaded once, from the live
  // pool, so a block that is short says why instead of just being short.
  const [slotGaps, setSlotGaps] = useState<SlotCoverageGap[]>([]);
  useEffect(() => {
    let cancelled = false;
    getCorrectiveSlotGapsAction(blueprintKeys, equipmentKey.split('|').filter(Boolean)).then(
      (gaps) => {
        if (!cancelled) setSlotGaps(gaps);
      }
    );
    return () => {
      cancelled = true;
    };
    // equipmentKey rather than the array itself: a fresh array identity on
    // every render would re-run this on every keystroke in a notes field.
  }, [blueprintKeys, equipmentKey]);

  function updateExercises(
    sessionIndex: number,
    sectionIndex: number,
    updater: (exercises: EditableExercise[]) => EditableExercise[]
  ) {
    setSessions((current) =>
      current.map((session, sIdx) => {
        if (sIdx !== sessionIndex) return session;
        return {
          ...session,
          sections: session.sections.map((section, secIdx) =>
            secIdx !== sectionIndex ? section : { ...section, exercises: updater(section.exercises) }
          ),
        };
      })
    );
  }

  function removeExercise(sessionIndex: number, sectionIndex: number, exerciseIndex: number) {
    updateExercises(sessionIndex, sectionIndex, (exercises) =>
      exercises.filter((_, i) => i !== exerciseIndex)
    );
  }

  function updatePrescription(
    sessionIndex: number,
    sectionIndex: number,
    exerciseIndex: number,
    field: keyof EditablePrescription,
    value: string
  ) {
    updateExercises(sessionIndex, sectionIndex, (exercises) =>
      exercises.map((exercise, i) =>
        i !== exerciseIndex
          ? exercise
          : { ...exercise, prescription: { ...exercise.prescription, [field]: value } }
      )
    );
  }

  function applyPick(picked: CorrectivePickedExercise) {
    if (!picker) return;
    const { sessionIndex, sectionIndex, exerciseIndex } = picker;
    const block = sessions[sessionIndex]!.sections[sectionIndex]!.block;
    const existing = exerciseIndex === null
      ? null
      : sessions[sessionIndex]!.sections[sectionIndex]!.exercises[exerciseIndex] ?? null;
    const newExercise: EditableExercise = {
      key: `${picked.provider}:${picked.externalId}:${Date.now()}`,
      provider: picked.provider,
      externalId: picked.externalId,
      exerciseName: picked.name,
      coachingCues: picked.coachingCues,
      selectionReasoning: picked.isCoachOverride ? 'Coach override: picked from the full library.' : null,
      isCoachOverride: picked.isCoachOverride,
      // A swap keeps whatever dose was already on that slot, since the
      // coach was replacing the exercise and not the prescription. A new
      // exercise starts from this block's default at this severity.
      prescription: existing?.prescription ?? defaultPrescriptionFor(block, severity),
    };
    updateExercises(sessionIndex, sectionIndex, (exercises) => {
      if (exerciseIndex === null) return [...exercises, newExercise];
      return exercises.map((e, i) => (i === exerciseIndex ? newExercise : e));
    });
    setPicker(null);
  }

  async function saveAll(): Promise<boolean> {
    for (const session of sessions) {
      const contentResult = await saveProgramTemplateContentAction(session.templateId, toSectionsInput(session));
      if ('error' in contentResult) {
        setError(contentResult.error);
        return false;
      }
      const template = group.templates.find((t) => t.id === session.templateId);
      if (!template) continue;
      const metaResult = await updateProgramTemplateMetaAction(
        session.templateId,
        metaFor(template, session.coachNotes, programNotes)
      );
      if ('error' in metaResult) {
        setError(metaResult.error);
        return false;
      }
    }
    return true;
  }

  async function handleSaveDraft() {
    setError(null);
    setBusy('save');
    const ok = await saveAll();
    setBusy(null);
    if (ok) router.refresh();
  }

  async function handleRegenerate() {
    if (!confirm('This discards any unsaved edits and generates a new set of exercises for this whole program. Continue?')) {
      return;
    }
    setError(null);
    setBusy('regenerate');
    const result = await regenerateCorrectiveDraftAction(memberId, group.programGroupTag);
    setBusy(null);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDiscard() {
    if (!confirm('Discard this draft? This deletes it completely. It was never visible to the member.')) {
      return;
    }
    setError(null);
    setBusy('discard');
    const result = await discardCorrectiveDraftAction(memberId, group.programGroupTag);
    setBusy(null);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    router.push(`/coach/corrective-programs/${memberId}` as Route);
  }

  async function handleApprove() {
    setError(null);
    setBusy('approve');
    const saved = await saveAll();
    if (!saved) {
      setBusy(null);
      return;
    }
    const result = await approveCorrectiveDraftAction(memberId, group.programGroupTag, startDate);
    setBusy(null);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    router.push(`/coach/clients/${memberId}/programs` as Route);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => router.push(`/coach/corrective-programs/${memberId}` as Route)}
        className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        Back
      </button>

      <div className="mt-4">
        <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          {blueprintNames || 'Corrective Program'}
        </h1>
        <p className="mt-2 text-[15px] text-[#6B7A72]">
          4-week draft for {memberName} ({sessions.length}x/week). Not visible to {memberName} until
          you approve and assign it.
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6 space-y-6">
        {sessions.map((session, sessionIndex) => (
          <section key={session.templateId} className={`${CARD} p-6`}>
            <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
              {session.label}
            </p>

            <div className="mt-4 space-y-5">
              {session.sections.map((section, sectionIndex) => {
                const gapNotice = describeBlockGap(slotGaps, section.block);
                return (
                <div key={section.name}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#1B3A2D]">
                      {BLOCK_LABEL[section.block]}
                    </p>
                    <button
                      type="button"
                      onClick={() => setPicker({ sessionIndex, sectionIndex, exerciseIndex: null })}
                      className="flex items-center gap-1 rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-[11px] font-medium text-[#1B3A2D] hover:bg-[#1B3A2D]/[0.12]"
                    >
                      <Plus className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                      Add
                    </button>
                  </div>

                  {/* Why the block is short, when it is short because
                      nothing exists rather than because the engine chose
                      fewer. Never rendered when the block is fully
                      covered. */}
                  {gapNotice && (
                    <p className="mt-2 flex items-start gap-1.5 rounded-2xl bg-[#F5B700]/[0.08] px-3 py-2 text-[11px] leading-relaxed text-[#854D0E]">
                      <VideoOff
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      <span>{gapNotice}</span>
                    </p>
                  )}

                  {section.exercises.length === 0 ? (
                    <p className="mt-2 text-xs text-[#9AA79F]">No exercises in this block.</p>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      {section.exercises.map((exercise, exerciseIndex) => (
                        <div
                          key={exercise.key}
                          className="rounded-2xl bg-[#FAFAF8] px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="truncate text-sm font-medium text-[#1B3A2D]">
                                  {exercise.exerciseName}
                                </p>
                                {exercise.isCoachOverride && (
                                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                    <ShieldAlert className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                                    Coach override
                                  </span>
                                )}
                              </div>
                              {/* Exactly the sentence the member will be
                                  shown, from the same formatter her screen
                                  uses, so a coach approves what she reads. */}
                              <p className="mt-0.5 text-[11px] text-[#6B7A72]">
                                {formatPrescriptionLine({
                                  sets: toNumber(exercise.prescription.sets),
                                  reps: exercise.prescription.reps.trim() || null,
                                  hold_duration_seconds: toNumber(exercise.prescription.holdSeconds),
                                  tempo: exercise.prescription.tempo.trim() || null,
                                  rest_seconds: toNumber(exercise.prescription.restSeconds),
                                }) ?? 'No prescription set'}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setPicker({ sessionIndex, sectionIndex, exerciseIndex })}
                                className="rounded-full px-2.5 py-1 text-[11px] font-medium text-[#1B3A2D] hover:bg-[#1B3A2D]/[0.08]"
                              >
                                Swap
                              </button>
                              <button
                                type="button"
                                onClick={() => removeExercise(sessionIndex, sectionIndex, exerciseIndex)}
                                aria-label={`Remove ${exercise.exerciseName}`}
                                className="rounded-full p-1.5 text-[#6B7A72] hover:bg-red-50 hover:text-red-700"
                              >
                                <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                              </button>
                            </div>
                          </div>

                          {/* Editable before approval. Whatever is in these
                              five fields is what is written to the member's
                              frozen copy when the program is assigned. */}
                          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-5">
                            {PRESCRIPTION_FIELDS.map(({ field, label, inputMode }) => (
                              <label key={field} className="block">
                                <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#6B7A72]">
                                  {label}
                                </span>
                                <input
                                  type="text"
                                  inputMode={inputMode}
                                  value={exercise.prescription[field]}
                                  aria-label={`${label} for ${exercise.exerciseName}`}
                                  onChange={(e) =>
                                    updatePrescription(
                                      sessionIndex,
                                      sectionIndex,
                                      exerciseIndex,
                                      field,
                                      e.target.value
                                    )
                                  }
                                  className="mt-0.5 w-full rounded-xl border border-[#1B3A2D]/10 bg-white px-2.5 py-1.5 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
            </div>

            <label className="mt-5 block">
              <span className="text-xs font-medium text-[#6B7A72]">Coach notes for this session</span>
              <textarea
                value={session.coachNotes}
                onChange={(e) => {
                  const value = e.target.value;
                  setSessions((current) =>
                    current.map((s, i) => (i === sessionIndex ? { ...s, coachNotes: value } : s))
                  );
                }}
                rows={2}
                className="mt-1 w-full rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] px-4 py-2.5 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
              />
            </label>
          </section>
        ))}
      </div>

      <section className={`${CARD} mt-6 p-6`}>
        <label className="block">
          <span className="text-xs font-medium text-[#6B7A72]">Coach notes for this program</span>
          <textarea
            value={programNotes ?? ''}
            onChange={(e) => setProgramNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] px-4 py-2.5 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
        </label>

        <button
          type="button"
          onClick={handleRegenerate}
          disabled={busy !== null}
          className="mt-4 flex items-center gap-1.5 text-sm font-medium text-[#1B3A2D] hover:opacity-80 disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {busy === 'regenerate' ? 'Regenerating…' : 'Regenerate (new seed)'}
        </button>

        <div className="mt-5 flex items-center gap-3">
          <label className="text-xs font-medium text-[#6B7A72]">Start date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-full border border-[#1B3A2D]/10 bg-white px-3 py-1.5 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
        </div>

        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={busy !== null}
            className="flex-1 rounded-full bg-[#1B3A2D]/[0.08] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#1B3A2D]/[0.14] disabled:opacity-50"
          >
            {busy === 'save' ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            disabled={busy !== null}
            className="flex-1 rounded-full border border-red-200 px-6 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
          >
            {busy === 'discard' ? 'Discarding…' : 'Discard'}
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={busy !== null}
            className="flex-1 rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy === 'approve' ? 'Assigning…' : 'Approve & Assign'}
          </button>
        </div>
      </section>

      {picker && (
        <CorrectiveExercisePickerModal
          blueprintKeys={blueprintKeys}
          block={sessions[picker.sessionIndex]!.sections[picker.sectionIndex]!.block}
          equipment={equipment}
          excludeExternalIds={sessions[picker.sessionIndex]!.sections[picker.sectionIndex]!.exercises
            .filter((_, i) => i !== picker.exerciseIndex)
            .map((e) => e.externalId)}
          onPick={applyPick}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}
