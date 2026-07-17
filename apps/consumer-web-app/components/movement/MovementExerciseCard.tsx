'use client';

import { useState } from 'react';
import { CheckCircle2, Circle, ChevronDown } from 'lucide-react';
import type { MovementSessionExerciseWithDetail } from '@mef/shared-types-contracts';
import { toggleMovementExerciseCompleted } from '@/app/actions/movement';

/**
 * Renders every field of the MovementExercise data model that has real
 * content today (title, prescription, cues, mistakes, instructions,
 * contraindications, notes). video_url/thumbnail are placeholders only —
 * intentionally not rendered as broken media, just omitted until a real
 * provider populates them.
 */
export function MovementExerciseCard({
  sessionExercise,
  disabled = false,
}: {
  sessionExercise: MovementSessionExerciseWithDetail;
  disabled?: boolean;
}) {
  const [completed, setCompleted] = useState(sessionExercise.completed);
  const [expanded, setExpanded] = useState(false);
  const { exercise } = sessionExercise;

  async function handleToggle() {
    if (disabled) return;
    const next = !completed;
    setCompleted(next);
    const result = await toggleMovementExerciseCompleted(sessionExercise.id, next);
    if (result.error) setCompleted(!next);
  }

  const prescriptionParts = [
    sessionExercise.prescribed_sets != null && sessionExercise.prescribed_reps
      ? `${sessionExercise.prescribed_sets} × ${sessionExercise.prescribed_reps}`
      : sessionExercise.prescribed_reps,
    sessionExercise.prescribed_tempo ? `Tempo ${sessionExercise.prescribed_tempo}` : null,
    sessionExercise.prescribed_rest_seconds
      ? `${sessionExercise.prescribed_rest_seconds}s rest`
      : null,
  ].filter(Boolean);

  return (
    <div className="rounded-2xl border border-[#1B3A2D]/8 bg-[#FAFAF8] p-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={handleToggle}
          disabled={disabled}
          aria-label={completed ? 'Mark exercise incomplete' : 'Mark exercise complete'}
          className="mt-0.5 shrink-0 disabled:opacity-40"
        >
          {completed ? (
            <CheckCircle2
              className="h-5 w-5 text-green-600"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          ) : (
            <Circle className="h-5 w-5 text-[#1B3A2D]/25" strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
            aria-expanded={expanded}
          >
            <span
              className={`text-sm font-medium ${completed ? 'text-[#1B3A2D]/50 line-through' : 'text-[#1B3A2D]'}`}
            >
              {exercise.title}
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 text-[#6B7A72] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>
          {prescriptionParts.length > 0 && (
            <p className="mt-0.5 text-xs text-[#6B7A72]">{prescriptionParts.join(' · ')}</p>
          )}

          {expanded && (
            <div className="mt-3 space-y-3 text-[13px] leading-relaxed text-[#6B7A72]">
              {exercise.instructions.length > 0 && (
                <ol className="list-decimal space-y-1 pl-4">
                  {exercise.instructions.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              )}

              {exercise.coaching_cues.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1B3A2D]/50">
                    Coaching cues
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {exercise.coaching_cues.map((cue, i) => (
                      <li key={i}>{cue}</li>
                    ))}
                  </ul>
                </div>
              )}

              {exercise.common_mistakes.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1B3A2D]/50">
                    Common mistakes
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {exercise.common_mistakes.map((mistake, i) => (
                      <li key={i}>{mistake}</li>
                    ))}
                  </ul>
                </div>
              )}

              {exercise.contraindications.length > 0 && (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                  Skip or modify if you have:{' '}
                  {exercise.contraindications.join(', ').replace(/_/g, ' ')}.
                </p>
              )}

              {exercise.notes && <p className="italic">{exercise.notes}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
