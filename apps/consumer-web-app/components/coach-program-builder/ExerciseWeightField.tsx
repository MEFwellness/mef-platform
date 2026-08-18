'use client';

/**
 * "What did you use?" — the weight a member logs against one exercise, on
 * one day.
 *
 * IT IS OPTIONAL AND IT SAYS SO BY BEHAVING LIKE IT. Nothing blocks on it,
 * nothing marks it required, nothing turns red when it is blank, and
 * leaving it empty is never mentioned again. It saves when she looks away
 * from the field, so there is no Save button to forget and no confirmation
 * to dismiss.
 *
 * IT PREFILLS FROM LAST TIME, and says so when it does. A number that
 * appeared by itself and claims to be today's is a lie; a number that says
 * "last time: 25 lbs" is a starting point. She can type over it, and only
 * what she leaves in the field is stored.
 *
 * WHICH EXERCISES GET ONE is not decided here. lib/programs/weightLogging.ts
 * decides, from the prescription's own shape, and this component is only
 * rendered where that says yes.
 *
 * NO EM DASHES, per the house rule.
 */

import { useEffect, useState, useTransition } from 'react';
import type { CoachAssignedWorkoutExercise } from '@mef/shared-types-contracts';
import {
  LOGGED_LOAD_UNITS,
  WEIGHT_LOG_HELPER_TEXT,
  formatLoggedLoad,
  initialLoadUnit,
  parseLoggedLoad,
  type LoggedLoadUnit,
} from '@/lib/programs/weightLogging';
import {
  getLoggedWeightPrefillAction,
  logExerciseWeightAction,
} from '@/app/actions/exercise-feedback';

export function ExerciseWeightField({
  exercise,
  compact = false,
}: {
  exercise: Pick<
    CoachAssignedWorkoutExercise,
    'id' | 'unilateral' | 'load_unit' | 'logged_load' | 'logged_load_unit' | 'logged_load_per_side'
  >;
  /** The walk-through renders one exercise at a time on a big card, so it gets the roomier layout. */
  compact?: boolean;
}) {
  const perSide = exercise.unilateral === true;
  const [value, setValue] = useState(
    exercise.logged_load === null || exercise.logged_load === undefined
      ? ''
      : String(exercise.logged_load)
  );
  const [unit, setUnit] = useState<LoggedLoadUnit>(
    initialLoadUnit({
      lastLoggedUnit: exercise.logged_load_unit ?? null,
      prescribedUnit: exercise.load_unit ?? null,
    })
  );
  const [lastTime, setLastTime] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [, startTransition] = useTransition();

  // The prefill is a read, so it happens after paint rather than blocking
  // the exercise from rendering. A member who types before it arrives
  // keeps what she typed.
  useEffect(() => {
    let cancelled = false;
    getLoggedWeightPrefillAction(exercise.id).then((prefill) => {
      if (cancelled || !prefill || prefill.load === null) return;
      if (prefill.fromPreviousSession) {
        setLastTime(
          formatLoggedLoad({ load: prefill.load, unit: prefill.unit, perSide: prefill.perSide })
        );
        setValue((current) => (current === '' ? String(prefill.load) : current));
      }
      if (prefill.unit) setUnit(prefill.unit);
    });
    return () => {
      cancelled = true;
    };
  }, [exercise.id]);

  function save(nextUnit: LoggedLoadUnit = unit) {
    startTransition(async () => {
      const result = await logExerciseWeightAction(exercise.id, { load: value, unit: nextUnit });
      if (!result.error) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
      }
    });
  }

  const parsed = parseLoggedLoad(value);

  return (
    <div className={compact ? 'mt-4' : ''}>
      <label
        htmlFor={`weight-${exercise.id}`}
        className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]"
      >
        Weight used {perSide && <span className="normal-case tracking-normal">(per side)</span>}
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          id={`weight-${exercise.id}`}
          type="number"
          inputMode="decimal"
          min={0}
          step={0.5}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => save()}
          placeholder="Optional"
          aria-describedby={`weight-help-${exercise.id}`}
          className="w-28 rounded-xl border border-[#1B3A2D]/10 bg-white px-3 py-2 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
        />
        <div className="flex overflow-hidden rounded-full border border-[#1B3A2D]/15">
          {LOGGED_LOAD_UNITS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={unit === option}
              onClick={() => {
                setUnit(option);
                if (parsed !== null) save(option);
              }}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                unit === option ? 'bg-[#1B3A2D] text-white' : 'bg-white text-[#6B7A72]'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        {saved && <span className="text-xs font-medium text-[#1B3A2D]">Saved</span>}
      </div>
      {lastTime && (
        <p className="mt-1.5 text-xs text-[#6B7A72]">Last time: {lastTime}</p>
      )}
      <p
        id={`weight-help-${exercise.id}`}
        className="mt-1.5 text-xs leading-relaxed text-[#6B7A72]"
      >
        {WEIGHT_LOG_HELPER_TEXT}
      </p>
    </div>
  );
}
