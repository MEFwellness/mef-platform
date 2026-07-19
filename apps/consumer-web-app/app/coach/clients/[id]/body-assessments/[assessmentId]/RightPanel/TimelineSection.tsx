import Link from 'next/link';
import { History } from 'lucide-react';
import type { BodyAssessment } from '@mef/shared-types-contracts';
import { getAssessmentTypeConfig } from '@/lib/body-assessment/assessmentTypes';
import { EmptyState } from './EmptyState';

function monthKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function TimelineSection({
  history,
  currentAssessmentId,
  clientId,
}: {
  history: BodyAssessment[];
  currentAssessmentId: string;
  clientId: string;
}) {
  if (history.length <= 1) {
    return (
      <EmptyState
        icon={History}
        title="No previous assessments"
        description="This is this client's first recorded assessment."
      />
    );
  }

  const groups = new Map<string, BodyAssessment[]>();
  for (const assessment of history) {
    const key = monthKey(assessment.started_at);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(assessment);
  }

  return (
    <div className="space-y-4">
      {Array.from(groups.entries()).map(([month, assessments]) => (
        <div key={month}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            {month}
          </p>
          <ul className="space-y-1">
            {assessments.map((assessment) => {
              const isCurrent = assessment.id === currentAssessmentId;
              return (
                <li key={assessment.id}>
                  <Link
                    href={`/coach/clients/${clientId}/body-assessments/${assessment.id}`}
                    className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition ${
                      isCurrent
                        ? 'bg-[#1B3A2D] text-white'
                        : 'text-[#1B3A2D] hover:bg-[#1B3A2D]/[0.05]'
                    }`}
                  >
                    <span>{getAssessmentTypeConfig(assessment.assessment_type).label}</span>
                    <span className={`text-xs ${isCurrent ? 'text-white/70' : 'text-[#6B7A72]'}`}>
                      {new Date(assessment.started_at).toLocaleDateString('en-US', {
                        day: 'numeric',
                      })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
