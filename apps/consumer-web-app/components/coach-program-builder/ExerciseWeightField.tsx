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
 * AND FROM HER COACH, when her coach has set one (migration 178). A phase
 * her coach progressed her onto carries a target on the exercise row, and
 * the field opens on it and says whose it is: "Your coach set: 25 lbs",
 * with "Last time: 22.5 lbs" beside it. Two different facts, shown as two
 * different facts. It is still not a requirement and still not a floor:
 * she can type anything over it, including less, and nothing anywhere
 * remarks on the difference.
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
    | 'id'
    | 'unilateral'
    | 'load'
    | 'load_unit'
    | 'logged_load'
    | 'logged_load_unit'
    | 'logged_load_per_side'
  >;
  /** The walk-through renders one exercise at a time on a big card, so it gets the roomier layout. */
  compact?: boolean;
}) {
  const perSide = exercise.unilateral === true;

  // The weight her coach asked for, when there is one. `load` is a text
  // column and may say "bodyweight" or "red band" as easily as a number,
  // so anything that is not a plain positive number is no target at all.
  const coachTargetValue = (() => {
    const raw = (exercise.load ?? '').trim();
    if (raw === '') return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  })();
  const coachTargetUnit: LoggedLoadUnit =
    exercise.load_unit === 'kg' ? 'kg' : 'lbs';
  const coachTarget =
    coachTargetValue === null
      ? null
      : formatLoggedLoad({ load: coachTargetValue, unit: coachTargetUnit, perSide });

  const [value, setValue] = useState(
    exercise.logged_load === null || exercise.logged_load === undefined
      ? coachTargetValue === null
        ? ''
        : String(coachTargetValue)
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
        // Her coach's number wins the field when there is one: it is the
        // ask for this phase, and last time is the context beside it.
        setValue((current) =>
          current === '' && coachTargetValue === null ? String(prefill.load) : current
        );
      }
      if (prefill.unit && coachTargetValue === null) setUnit(prefill.unit);
    });
    return () => {
      cancelled = true;
    };
    // coachTargetValue is read from the frozen row and cannot change while
    // this field is mounted, so it is deliberately not a dependency: adding
    // it would re-run the prefill read for no new answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      {coachTarget && (
        <p className="mt-1.5 text-xs font-medium text-[#3E5C46]" data-coach-set-load="true">
          Your coach set: {coachTarget}
        </p>
      )}
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
