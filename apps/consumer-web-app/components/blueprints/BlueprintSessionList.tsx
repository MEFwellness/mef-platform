/**
 * Every weekly session of a blueprint, slot by slot: what it prescribes,
 * how important it is, whether it is locked, whether it is per side, and
 * what any week changes about it.
 *
 * A server component with no state of its own. The admin detail screen and
 * anything else that needs to READ a blueprint share it, so a slot never
 * reads one way on one screen and another way on another.
 *
 * The prescription sentence comes from the same formatter the member's own
 * screen uses (lib/coach-program-builder/prescription.ts), so what an
 * administrator approves is what she is shown.
 *
 * VIDEO IS STRICTLY ON TAP, and it is here so that approving a program
 * does not mean opening the Exercise Library in a second tab to remember
 * what a movement is. Every slot renders a stored poster frame and a play
 * button; the metered video URL is requested only when somebody taps one.
 * Opening this screen and scrolling all 24 slots of it spends nothing.
 * Asserted by tests/program-screens-no-video-requests.test.tsx.
 */
import { Lock } from 'lucide-react';
import type { ProgramBlueprintSlot } from '@mef/shared-types-contracts';
import { TapToPlayVideo } from '@/components/exercise-library/TapToPlayVideo';
import type { AssignedExerciseMediaMap } from '@/lib/coach-program-builder/assignedWorkoutMedia';
import { formatPrescriptionLine } from '@/lib/coach-program-builder/prescription';
import { sessionDesignationsOf, slotsForSession } from '@/lib/programs/blueprints/data';
import { BLUEPRINT_BLOCK_SECTION_NAME } from '@/lib/programs/blueprints/materialize';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/** "Week 3: 4 sets" for every week this slot changes something in. */
function weekChangeLines(slot: ProgramBlueprintSlot): string[] {
  return Object.entries(slot.week_overrides ?? {})
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([week, patch]) => {
      const parts: string[] = [];
      if (typeof patch.sets === 'number') parts.push(`${patch.sets} sets`);
      if (typeof patch.reps === 'number') parts.push(`${patch.reps} reps`);
      if (typeof patch.hold_duration_seconds === 'number') {
        parts.push(`${patch.hold_duration_seconds} second hold`);
      }
      if (typeof patch.tempo === 'string') parts.push(`tempo ${patch.tempo}`);
      if (typeof patch.rest_seconds === 'number') parts.push(`${patch.rest_seconds} seconds rest`);
      return parts.length > 0 ? `Week ${week}: ${parts.join(', ')}` : `Week ${week}: no change`;
    });
}

export function BlueprintSessionList({
  slots,
  durationWeeks,
  media = {},
}: {
  slots: ProgramBlueprintSlot[];
  durationWeeks: number | null;
  /** Poster and cues per exercise, loaded server side. An absent entry renders the placeholder poster, never a broken image, and an omitted map renders no player at all. */
  media?: AssignedExerciseMediaMap;
}) {
  const sessions = sessionDesignationsOf(slots);

  return (
    <div className="space-y-4">
      {sessions.map((session) => {
        const sessionSlots = slotsForSession(slots, session);
        return (
          <section key={session} className={`${CARD} p-6`}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
                Session {session}
              </p>
              <p className="text-xs text-[#9AA79F]">
                {sessionSlots.length} exercises
                {durationWeeks ? `, ${durationWeeks} weeks` : ''}
              </p>
            </div>

            <div className="mt-4 space-y-1.5">
              {sessionSlots.map((slot) => {
                const changes = weekChangeLines(slot);
                return (
                  <div key={slot.id} className="overflow-hidden rounded-2xl bg-[#FAFAF8]">
                    {slot.external_id && media[slot.external_id] && (
                      <TapToPlayVideo
                        externalId={slot.external_id}
                        name={slot.exercise_name ?? 'Exercise'}
                        primaryMuscle={media[slot.external_id]!.primaryMuscle}
                        category={media[slot.external_id]!.category}
                        posterUrl={media[slot.external_id]!.posterUrl}
                        cues={media[slot.external_id]!.cues}
                        heightClassName="h-40"
                      />
                    )}
                    <div className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-sm font-medium text-[#1B3A2D]">
                            {slot.exercise_name ?? 'Slot not filled'}
                          </p>
                          {slot.is_locked && (
                            <span className="flex items-center gap-1 rounded-full bg-[#1B3A2D]/[0.08] px-2 py-0.5 text-[10px] font-semibold text-[#1B3A2D]">
                              <Lock className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                              Locked
                            </span>
                          )}
                          {slot.is_per_side && (
                            <span className="rounded-full bg-[#F5B700]/[0.18] px-2 py-0.5 text-[10px] font-semibold text-[#854D0E]">
                              Per side
                            </span>
                          )}
                        </div>

                        <p className="mt-0.5 text-[11px] text-[#6B7A72]">
                          {formatPrescriptionLine({
                            sets: slot.sets,
                            reps: slot.reps === null ? null : String(slot.reps),
                            hold_duration_seconds: slot.hold_duration_seconds,
                            tempo: slot.tempo,
                            rest_seconds: slot.rest_seconds,
                          }) ?? 'No prescription set'}
                        </p>

                        {changes.map((line) => (
                          <p key={line} className="mt-0.5 text-[11px] font-medium text-[#854D0E]">
                            {line}
                          </p>
                        ))}

                        {slot.purpose && (
                          <p className="mt-1.5 text-[11px] leading-relaxed text-[#9AA79F]">
                            {slot.purpose}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7A72]">
                          {BLUEPRINT_BLOCK_SECTION_NAME[slot.block]}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#9AA79F]">
                          Priority {slot.priority_rank}
                        </p>
                        {!slot.is_required && (
                          <p className="mt-0.5 text-[11px] text-[#9AA79F]">Optional</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
