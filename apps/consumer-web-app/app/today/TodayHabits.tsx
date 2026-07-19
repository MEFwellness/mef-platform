import Link from 'next/link';
import { CheckCircle2, Circle, ListChecks } from 'lucide-react';
import type { Habit } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/**
 * Premium UX Milestone 2's "Today's habits" — a read-only status summary
 * of the member's active habits (same getActiveHabits/getHabitLogsForDate
 * reads app/checkin/CheckinForm.tsx already uses, no new query and no new
 * business logic), with a link to the check-in where they're actually
 * logged. The interactive toggle stays exactly where it lives today; this
 * never duplicates that form, only reflects its result.
 */
export function TodayHabits({
  habits,
  habitLogs,
}: {
  habits: Habit[];
  habitLogs: Record<string, boolean>;
}) {
  if (habits.length === 0) return null;

  const completedCount = habits.filter((habit) => habitLogs[habit.id]).length;

  return (
    <section className={`${CARD} mef-animate-in mt-6 p-7`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <ListChecks className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Today&apos;s Habits</p>
        </div>
        <span className="text-xs text-[#6B7A72]">
          {completedCount} of {habits.length} done
        </span>
      </div>
      <ul className="mt-4 space-y-2.5">
        {habits.map((habit) => {
          const done = habitLogs[habit.id] ?? false;
          return (
            <li key={habit.id} className="flex items-center gap-2.5">
              {done ? (
                <CheckCircle2
                  className="h-5 w-5 shrink-0 text-green-600"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              ) : (
                <Circle
                  className="h-5 w-5 shrink-0 text-[#1B3A2D]/20"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              )}
              <span
                className={`text-sm ${done ? 'text-[#1B3A2D]/50 line-through' : 'text-[#1B3A2D]'}`}
              >
                {habit.title}
              </span>
            </li>
          );
        })}
      </ul>
      <Link
        href="/checkin"
        className="mt-4 inline-block text-sm font-medium text-[#1B3A2D] underline underline-offset-2"
      >
        Log today&apos;s habits in your check-in
      </Link>
    </section>
  );
}
