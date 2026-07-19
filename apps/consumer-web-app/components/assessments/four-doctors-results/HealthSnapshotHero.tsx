/**
 * "This is where I am today" — the hero section framing the Four Doctors
 * Wheel. Same premium dark-gradient treatment as the Primal Pattern
 * results hero (components/primal-pattern/results/HeroResultCard.tsx):
 * deep forest gradient, blurred glow orbs, gold accents, so the two
 * flagship assessment results open with a consistent, considered first
 * impression rather than two different visual languages. Deliberately
 * minimal in content: a label, the completion date, the wheel itself,
 * and the four zone chips underneath, no paragraph of generated
 * commentary. Visual hierarchy (label -> wheel -> chips) is what
 * communicates the snapshot, not sentences.
 */

import { Sparkles } from 'lucide-react';
import { FourDoctorsWheel } from './FourDoctorsWheel';
import { getDoctorIcon } from '@/lib/assessments/four-doctors/premium/icons';
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
    <section className="mef-animate-in relative overflow-hidden rounded-[36px] bg-gradient-to-br from-[#1B3A2D] to-[#12261D] p-7 text-center shadow-[0_16px_56px_-16px_rgba(27,58,45,0.55)] sm:p-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#F5B700]/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-[#4F7A63]/20 blur-3xl"
      />

      <div className="relative flex items-center justify-center gap-2 text-[#E9EFEA]">
        <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-[0.16em]">Today&apos;s Snapshot</p>
      </div>
      <p className="relative mt-1.5 text-xs font-medium text-[#93A69A]">
        Completed {formatAssessmentDate(completedAt)}
      </p>

      <div className="relative mt-7">
        <FourDoctorsWheel
          categories={categories}
          totalScore={totalScore}
          totalMaxScore={totalMaxScore}
          totalPriority={totalPriority}
        />
      </div>

      <div className="relative mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {categories.map((category) => {
          const Icon = getDoctorIcon(category.categoryId);
          const zone = zoneForPriority(category.priority);
          return (
            <div
              key={category.categoryId}
              className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 text-center backdrop-blur-sm"
            >
              <span
                className="mx-auto flex h-8 w-8 items-center justify-center rounded-full"
                style={{ backgroundColor: `${zone.color}26`, color: zone.color }}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <p className="mt-2 text-xs font-medium text-white">{category.categoryName}</p>
              <p
                className="mt-1 text-[10px] font-semibold uppercase tracking-wider"
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
