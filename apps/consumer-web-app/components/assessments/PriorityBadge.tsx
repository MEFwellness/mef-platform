import { STATUS_STYLES } from '@/lib/wellness/status';
import { PRIORITY_LABEL, priorityToStatus } from '@/lib/assessments/presentation';
import type { PriorityLevel } from '@/lib/assessments/engine/types';

export function PriorityBadge({ priority }: { priority: PriorityLevel }) {
  const status = priorityToStatus(priority);
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[status].bg} ${STATUS_STYLES[status].text}`}
    >
      {PRIORITY_LABEL[priority]}
    </span>
  );
}
