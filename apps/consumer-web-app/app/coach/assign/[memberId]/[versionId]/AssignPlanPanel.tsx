'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { Lock, LockOpen, Save, ShieldAlert } from 'lucide-react';
import type { BlueprintPeriodization } from '@mef/shared-types-contracts';
import { correctiveApprovalDefaults } from '@/lib/corrective-engine/approvalDefaults';
import { endDateFor } from '@/lib/program-lifecycle/transitions';
import { formatPrescriptionLine } from '@/lib/coach-program-builder/prescription';
import {
  previewWeeks,
  weeksWorthShowing,
  type PlannedSession,
} from '@/lib/programs/blueprints/plan';
import {
  assignPlanToMemberAction,
  saveProgramAsBlueprintDraftAction,
} from '@/app/actions/program-blueprints';
import { SlotSwapModal, type SwapPick } from './SlotSwapModal';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function readableDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/** Today, in the coach's own browser. The server recomputes the same defaults in the member's timezone, and the field is editable either way. */
function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * The last step before a member is given a program.
 *
 * The whole program is held in local state, edited locally, and written
 * once. Nothing is saved as you go, because nothing has been assigned yet:
 * pressing Approve and Assign is the moment anything at all is written,
 * and until then this screen has changed nothing anywhere.
 *
 * WHAT UNLOCKING MEANS. A locked slot is the movement the program is built
 * around, and the picker refuses to open on one. Unlock is here anyway,
 * because a coach in front of a real member sometimes has a reason a
 * blueprint author could not have. Unlocking is visible, per slot, and
 * lasts only as long as this screen: it changes the blueprint for nobody
 * else and for no other member.
 */
export function AssignPlanPanel({
  memberId,
  memberName,
  blueprintVersionId,
  programName,
  memberTitle,
  memberDescription,
  cautions,
  durationWeeks: blueprintWeeks,
  periodization,
  blockedReason,
  initialSessions,
}: {
  memberId: string;
  memberName: string;
  blueprintVersionId: string;
  programName: string;
  memberTitle: string | null;
  memberDescription: string | null;
  cautions: string | null;
  durationWeeks: number;
  periodization: BlueprintPeriodization | null;
  blockedReason: string | null;
  initialSessions: PlannedSession[];
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<PlannedSession[]>(initialSessions);
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const [programNotes, setProgramNotes] = useState('');
  const [picker, setPicker] = useState<{
    sessionIndex: number;
    exerciseIndex: number;
    unlocked: boolean;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const defaults = useMemo(
    () => correctiveApprovalDefaults(sessions.length, todayLocal()),
    [sessions.length]
  );
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [durationWeeks, setDurationWeeks] = useState(String(blueprintWeeks));

  const parsedDuration = Math.min(52, Math.max(1, Number(durationWeeks) || blueprintWeeks));
  const endDate = endDateFor(startDate, parsedDuration);

  const weeks = useMemo(
    () => previewWeeks(sessions, parsedDuration),
    [sessions, parsedDuration]
  );
  const shownWeeks = useMemo(() => weeksWorthShowing(weeks), [weeks]);

  function applyPick(pick: SwapPick) {
    if (!picker) return;
    const { sessionIndex, exerciseIndex } = picker;
    setSessions((current) =>
      current.map((session, sIdx) => {
        if (sIdx !== sessionIndex) return session;
        return {
          ...session,
          exercises: session.exercises.map((exercise, eIdx) =>
            eIdx !== exerciseIndex
              ? exercise
              : {
                  ...exercise,
                  // The slot keeps its dose, its rank, its lock and its per
                  // week plan. What changed is which exercise fills it.
                  provider: pick.provider,
                  externalId: pick.externalId,
                  exerciseName: pick.name,
                  isCoachOverride: pick.isCoachOverride,
                  key: `${pick.externalId}:${eIdx}`,
                }
          ),
        };
      })
    );
    setPicker(null);
  }

  function toggleLock(key: string) {
    setUnlocked((current) => ({ ...current, [key]: !current[key] }));
  }

  async function handleAssign() {
    setError(null);
    setNotice(null);
    setBusy('assign');
    const result = await assignPlanToMemberAction({
      memberId,
      blueprintVersionId,
      sessions,
      startDate,
      durationWeeks: parsedDuration,
      programNotes: programNotes.trim() || null,
      publish: true,
    });
    setBusy(null);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    router.push(`/coach/clients/${memberId}/programs` as Route);
  }

  async function handleSaveAsTemplate() {
    setError(null);
    setNotice(null);
    setBusy('template');
    const result = await saveProgramAsBlueprintDraftAction({
      sessions,
      displayName: templateName,
      memberTitle: templateName,
      memberDescription,
      coachPurpose: `Proposed from ${programName}, edited during an assign for one member.`,
      cautions,
      durationWeeks: parsedDuration,
      equipmentMode: 'home',
      periodization,
    });
    setBusy(null);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setSavingTemplate(false);
    setTemplateName('');
    setNotice(
      `Saved as a draft named ${result.displayName}. An administrator approves it in the Blueprint Library before anyone can be given it.`
    );
  }

  return (
    <>
      <div className="mt-2">
        <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          {memberTitle ?? programName}
        </h1>
        <p className="mt-2 text-[15px] text-[#6B7A72]">
          {parsedDuration} weeks for {memberName}, {sessions.length} sessions a week. Nothing is
          written until you approve it.
        </p>
      </div>

      {blockedReason && (
        <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{blockedReason}</div>
      )}
      {error && <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {notice && (
        <div className="mt-4 rounded-2xl bg-[#EFF6F1] p-4 text-sm text-[#1B3A2D]">{notice}</div>
      )}

      {cautions && (
        <section className={`${CARD} mt-6 p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
            Before you assign this
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">{cautions}</p>
        </section>
      )}

      {/* ------------------------------------------------------ */}
      {/* Schedule, pre-filled                                    */}
      {/* ------------------------------------------------------ */}
      <section className={`${CARD} mt-6 p-6`}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">Schedule</p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            <span className="text-xs font-medium text-[#6B7A72]">Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="Program start date"
              className="rounded-full border border-[#1B3A2D]/10 bg-white px-3 py-1.5 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-xs font-medium text-[#6B7A72]">Weeks</span>
            <input
              type="number"
              min={1}
              max={52}
              inputMode="numeric"
              value={durationWeeks}
              onChange={(e) => setDurationWeeks(e.target.value)}
              aria-label="Program duration in weeks"
              className="w-20 rounded-full border border-[#1B3A2D]/10 bg-white px-3 py-1.5 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
            />
          </label>
        </div>
        <p className="mt-3 text-sm text-[#1B3A2D]">
          Runs {readableDate(startDate)} to {readableDate(endDate)}, {parsedDuration} week
          {parsedDuration === 1 ? '' : 's'}, on{' '}
          {defaults.daysOfWeek.map((d) => WEEKDAY_LABELS[d]).join(' and ')}.
        </p>
        <p className="mt-1 text-xs text-[#6B7A72]">
          These are filled in for you. Change them if this member needs something different.
        </p>
      </section>

      {/* ------------------------------------------------------ */}
      {/* The program, week by week                               */}
      {/* ------------------------------------------------------ */}
      <div className="mt-6 space-y-5">
        {weeks
          .filter((week) => shownWeeks.includes(week.week))
          .map((week) => (
            <section key={week.week} className={`${CARD} p-6`}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
                  Week {week.week}
                  {week.week === 1 && parsedDuration > 1 ? ' and every week like it' : ''}
                </p>
                {week.differsFromWeekOne && (
                  <span className="rounded-full bg-[#F5B700]/[0.18] px-2.5 py-0.5 text-[11px] font-semibold text-[#854D0E]">
                    Changes this week
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-5">
                {week.sessions.map((session, sessionIndex) => (
                  <div key={session.session}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#1B3A2D]">
                      {session.label}
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {session.exercises.map((exercise, exerciseIndex) => {
                        const planned = sessions[sessionIndex]?.exercises[exerciseIndex];
                        const lockKey = planned?.key ?? exercise.key;
                        const isUnlocked = unlocked[lockKey] === true;
                        const canSwap = week.week === 1 && (!exercise.isLocked || isUnlocked);

                        return (
                          <div key={exercise.key} className="rounded-2xl bg-[#FAFAF8] px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <p className="text-sm font-medium text-[#1B3A2D]">
                                    {exercise.exerciseName}
                                  </p>
                                  {exercise.isPerSide && (
                                    <span className="rounded-full bg-[#F5B700]/[0.18] px-2 py-0.5 text-[10px] font-semibold text-[#854D0E]">
                                      Per side
                                    </span>
                                  )}
                                  {planned?.isCoachOverride && (
                                    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                      <ShieldAlert
                                        className="h-3 w-3"
                                        strokeWidth={2}
                                        aria-hidden="true"
                                      />
                                      Coach override
                                    </span>
                                  )}
                                </div>

                                <p className="mt-0.5 text-[11px] text-[#6B7A72]">
                                  {exercise.sectionName} ·{' '}
                                  {formatPrescriptionLine({
                                    sets: exercise.prescription.sets,
                                    reps:
                                      exercise.prescription.reps === null
                                        ? null
                                        : String(exercise.prescription.reps),
                                    hold_duration_seconds: exercise.prescription.holdSeconds,
                                    tempo: exercise.prescription.tempo,
                                    rest_seconds: exercise.prescription.restSeconds,
                                  }) ?? 'No prescription set'}
                                </p>

                                {exercise.changedFromWeekOne && (
                                  <p className="mt-0.5 text-[11px] font-medium text-[#854D0E]">
                                    Different from week 1
                                  </p>
                                )}
                              </div>

                              {week.week === 1 && (
                                <div className="flex shrink-0 items-center gap-1">
                                  {exercise.isLocked && (
                                    <button
                                      type="button"
                                      onClick={() => toggleLock(lockKey)}
                                      aria-label={
                                        isUnlocked
                                          ? `Lock ${exercise.exerciseName} again`
                                          : `Unlock ${exercise.exerciseName}`
                                      }
                                      title={
                                        isUnlocked
                                          ? 'Locked by the program. Unlocked for this member only.'
                                          : 'Locked by the program. Unlock to swap it for this member only.'
                                      }
                                      className="rounded-full p-1.5 text-[#6B7A72] hover:bg-[#1B3A2D]/[0.08] hover:text-[#1B3A2D]"
                                    >
                                      {isUnlocked ? (
                                        <LockOpen
                                          className="h-3.5 w-3.5"
                                          strokeWidth={2}
                                          aria-hidden="true"
                                        />
                                      ) : (
                                        <Lock
                                          className="h-3.5 w-3.5"
                                          strokeWidth={2}
                                          aria-hidden="true"
                                        />
                                      )}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    disabled={!canSwap}
                                    onClick={() =>
                                      setPicker({ sessionIndex, exerciseIndex, unlocked: isUnlocked })
                                    }
                                    className="rounded-full px-2.5 py-1 text-[11px] font-medium text-[#1B3A2D] hover:bg-[#1B3A2D]/[0.08] disabled:opacity-40"
                                  >
                                    Swap
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

        {shownWeeks.length === 1 && parsedDuration > 1 && (
          <p className="px-2 text-xs text-[#9AA79F]">
            Every week of this program prescribes the same thing, so there is one week to read.
          </p>
        )}
      </div>

      {/* ------------------------------------------------------ */}
      {/* Notes, save as template, assign                         */}
      {/* ------------------------------------------------------ */}
      <section className={`${CARD} mt-6 p-6`}>
        <label className="block">
          <span className="text-xs font-medium text-[#6B7A72]">
            Coach notes for {memberName}. She reads these once the program starts.
          </span>
          <textarea
            value={programNotes}
            onChange={(e) => setProgramNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] px-4 py-2.5 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
        </label>

        <div className="mt-5 border-t border-[#1B3A2D]/10 pt-5">
          {!savingTemplate ? (
            <button
              type="button"
              onClick={() => {
                setSavingTemplate(true);
                setTemplateName(`${programName} variation`);
              }}
              disabled={busy !== null}
              className="flex items-center gap-1.5 text-sm font-medium text-[#1B3A2D] hover:opacity-80 disabled:opacity-40"
            >
              <Save className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Save these edits as a new program
            </button>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-[#6B7A72]">
                  Name for the new program. It is saved as a draft, with your edits, for an
                  administrator to approve. Nothing about {programName} changes and nothing is
                  assigned by doing this.
                </span>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  aria-label="Name for the new program"
                  className="mt-1 w-full rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] px-4 py-2.5 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
                />
              </label>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setSavingTemplate(false)}
                  disabled={busy !== null}
                  className="flex-1 rounded-full bg-[#1B3A2D]/[0.08] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#1B3A2D]/[0.14] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAsTemplate}
                  disabled={busy !== null || templateName.trim() === ''}
                  className="flex-1 rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {busy === 'template' ? 'Saving…' : 'Save as a draft program'}
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleAssign}
          disabled={busy !== null || blockedReason !== null}
          className="mt-5 w-full rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy === 'assign' ? 'Assigning…' : 'Approve & Assign'}
        </button>
      </section>

      {picker && (
        <SlotSwapModal
          slotId={sessions[picker.sessionIndex]!.exercises[picker.exerciseIndex]!.slotId ?? ''}
          exerciseName={
            sessions[picker.sessionIndex]!.exercises[picker.exerciseIndex]!.exerciseName
          }
          excludeExternalIds={sessions[picker.sessionIndex]!.exercises
            .filter((_, i) => i !== picker.exerciseIndex)
            .map((e) => e.externalId)}
          unlockedByCoach={picker.unlocked}
          onPick={applyPick}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}
