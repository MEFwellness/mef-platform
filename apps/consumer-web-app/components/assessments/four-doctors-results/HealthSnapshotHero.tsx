/**
 * "This is where I am today" — the hero section framing the Four Doctors
 * Wheel. Deliberately minimal: a label, the completion date, the wheel
 * itself, and one quiet supporting line, no paragraph of generated
 * commentary. Visual hierarchy (label -> wheel -> the four zone chips
 * underneath) is what communicates the snapshot, not sentences.
 */

import { Sparkles } from 'lucide-react';
import { FourDoctorsWheel } from './FourDoctorsWheel';
import { zoneForPriority } from '@/lib/assessments/four-doctors/premium/zones';
import { formatAssessmentDate } from '@/lib/assessments/presentation';
import type { CategoryScoreResult, PriorityLevel } from '@/lib/assessments/engine/types';

type Props = {
  categories: CategoryScoreResult[];
  totalScore: number;
  totalMaxScore: number;
  totalPriority: PriorityLevel;
  completedAt: string;
};

export function HealthSnapshotHero({
  categories,
  totalScore,
  totalMaxScore,
  totalPriority,
  completedAt,
}: Props) {
  return (
    <section className="mef-animate-in rounded-[32px] bg-white p-7 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] sm:p-8">
      <div className="flex items-center justify-center gap-2 text-[#6B7A72]">
        <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-wider">Today&apos;s Snapshot</p>
      </div>
      <p className="mt-1 text-center text-xs text-[#6B7A72]">
        Completed {formatAssessmentDate(completedAt)}
      </p>

      <div className="mt-6">
        <FourDoctorsWheel
          categories={categories}
          totalScore={totalScore}
          totalMaxScore={totalMaxScore}
          totalPriority={totalPriority}
        />
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {categories.map((category) => {
          const zone = zoneForPriority(category.priority);
          return (
            <div
              key={category.categoryId}
              className="rounded-2xl p-3 text-center"
              style={{ backgroundColor: zone.tint }}
            >
              <p className="text-xs font-medium text-[#1B3A2D]">{category.categoryName}</p>
              <p
                className="mt-1 text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: zone.color }}
              >
                {zone.label}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
