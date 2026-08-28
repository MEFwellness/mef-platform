import type { MemberExerciseCompletion } from '@mef/shared-types-contracts';
import { formatDisplayDate } from '@/lib/time/displayDate';

const STATUS_LABEL: Record<string, string> = {
  completed: 'Completed',
  partial: 'Partial',
  skipped: 'Skipped',
};

const STATUS_COLOR: Record<string, string> = {
  completed: 'text-[#1B3A2D]',
  partial: 'text-amber-700',
  skipped: 'text-[#6B7A72]',
};

/**
 * A staff surface since the internal movement tools moved, so this takes
 * the same UTC pin every other staff-read timestamp takes. It is rendered
 * inside a client component, so an unpinned call would hydrate differently
 * than it was served.
 */
function formatWhen(iso: string): string {
  return formatDisplayDate(iso, { month: 'short', day: 'numeric' });
}

/** Compact "your history with this exercise" list — server-rendered, read-only. Shown on the exercise detail page beneath the completion controls. */
export function ExerciseHistoryList({ history }: { history: MemberExerciseCompletion[] }) {
  if (history.length === 0) return null;

  return (
    <div className="rounded-2xl border border-[#1B3A2D]/10 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Your history</p>
      <ul className="mt-3 divide-y divide-[#1B3A2D]/5">
        {history.map((entry) => (
          <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className={`font-medium ${STATUS_COLOR[entry.status]}`}>
              {STATUS_LABEL[entry.status]}
            </span>
            <span className="text-xs text-[#6B7A72]">
              {[entry.difficulty_rating, entry.comfort_rating]
                .filter(Boolean)
                .map((v) => v!.replace(/_/g, ' '))
                .join(' · ')}
            </span>
            <span className="text-xs text-[#6B7A72]">{formatWhen(entry.occurred_at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
