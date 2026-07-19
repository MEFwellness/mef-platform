/**
 * Four premium expandable "Doctor" cards, one per category. Built on
 * native <details>/<summary> (keyboard-operable and screen-reader
 * friendly with zero extra state management), same accessible-accordion
 * pattern already proven in components/primal-pattern/results/
 * EducationAccordion.tsx. Collapsed state is the "at a glance" summary
 * (icon, name, a small health-ratio ring, zone badge); expanded state
 * adds the category's own already-approved short description
 * (four-doctors/copy.ts), what the zone means, the full
 * strengths/opportunity/recommendations/weekly-habit guidance for this
 * category+zone (always read from the centralized guidance config, never
 * generated here), and the category's coaching focus, the same
 * evergreen educational line the generic per-category page already
 * shows elsewhere in the app, surfaced here too for a richer close.
 */

import { Check, Compass, Sparkle, Target } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { getDoctorIcon } from '@/lib/assessments/four-doctors/premium/icons';
import { zoneForPriority } from '@/lib/assessments/four-doctors/premium/zones';
import { getGuidance } from '@/lib/assessments/four-doctors/premium/guidance';
import type { AssessmentCopy, CategoryScoreResult } from '@/lib/assessments/engine/types';

type Props = {
  categories: CategoryScoreResult[];
  copy: AssessmentCopy;
};

export function DoctorSummaryCards({ categories, copy }: Props) {
  return (
    <section>
      <p className="px-1 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        Your Four Doctors
      </p>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {categories.map((category) => (
          <DoctorCard key={category.categoryId} category={category} copy={copy} />
        ))}
      </div>
    </section>
  );
}

/** Small at-a-glance health-ratio ring for a card's collapsed state — same `1 - score/maxScore` "fuller is healthier" convention as ScoreRing.tsx. */
function MiniRing({ score, maxScore, color }: { score: number; maxScore: number; color: string }) {
  const size = 44;
  const stroke = 4.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const healthRatio = maxScore > 0 ? Math.max(0, Math.min(1, 1 - score / maxScore)) : 0;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="h-11 w-11 shrink-0 -rotate-90"
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#EFEBE0"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - healthRatio)}
      />
    </svg>
  );
}

function SectionLabel({ icon: Icon, children }: { icon: typeof Sparkle; children: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      {children}
    </p>
  );
}

function DoctorCard({ category, copy }: { category: CategoryScoreResult; copy: AssessmentCopy }) {
  const Icon = getDoctorIcon(category.categoryId);
  const zone = zoneForPriority(category.priority);
  const categoryCopy = copy.categoryCopy[category.categoryId];
  const guidance = getGuidance(category.categoryId, zone.id);

  return (
    <details className="group overflow-hidden rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] transition-shadow duration-300 open:shadow-[0_8px_36px_-8px_rgba(27,58,45,0.18)]">
      <summary className="mef-focus-ring flex cursor-pointer list-none items-center justify-between gap-3 rounded-[28px] p-6">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: zone.tint, color: zone.color }}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-[family-name:var(--font-cormorant-garamond)] text-xl leading-tight text-[#1B3A2D]">
              {category.categoryName}
            </p>
            <span
              className="mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: zone.color, backgroundColor: zone.tint }}
            >
              {zone.label}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <MiniRing score={category.score} maxScore={category.maxScore} color={zone.color} />
          <ChevronDown
            className="h-4 w-4 shrink-0 text-[#6B7A72] transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </div>
      </summary>

      <div className="space-y-5 border-t border-[#EDEBE3] px-6 pb-6 pt-5">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            This assessment
          </p>
          <p className="text-sm font-semibold text-[#1B3A2D]">
            {category.score}{' '}
            <span className="text-xs font-normal text-[#6B7A72]">of {category.maxScore}</span>
          </p>
        </div>

        {categoryCopy && (
          <div>
            <SectionLabel icon={Compass}>What this doctor represents</SectionLabel>
            <p className="mt-1.5 text-sm leading-relaxed text-[#1B3A2D]">
              {categoryCopy.shortDescription}
            </p>
          </div>
        )}

        <div>
          <SectionLabel icon={Target}>What your score means</SectionLabel>
          <p className="mt-1.5 text-sm leading-relaxed text-[#1B3A2D]">{zone.meaning}</p>
        </div>

        <div className="rounded-2xl border border-[#EDEBE3] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#4F7A63]">
            Your current strengths
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-[#1B3A2D]">{guidance.strengths}</p>
        </div>

        <div className="rounded-2xl border border-[#EDEBE3] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#B0522D]">
            Your biggest opportunity
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-[#1B3A2D]">{guidance.opportunity}</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Three ways to move this forward
          </p>
          <ul className="mt-2 space-y-2.5">
            {guidance.recommendations.map((recommendation) => (
              <li
                key={recommendation}
                className="flex items-start gap-2.5 text-sm leading-relaxed text-[#1B3A2D]"
              >
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: zone.tint, color: zone.color }}
                >
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                </span>
                {recommendation}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl p-4" style={{ backgroundColor: zone.tint }}>
          <p
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: zone.color }}
          >
            Focus this week
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-[#1B3A2D]">{guidance.weeklyHabit}</p>
        </div>

        {categoryCopy && (
          <div className="border-t border-dashed border-[#EDEBE3] pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
              Coach&apos;s focus
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-[#1B3A2D]">
              {categoryCopy.coachingFocus}
            </p>
          </div>
        )}
      </div>
    </details>
  );
}
