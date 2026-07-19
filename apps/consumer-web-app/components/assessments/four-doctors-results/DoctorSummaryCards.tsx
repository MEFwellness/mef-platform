/**
 * Four premium expandable "Doctor" cards, one per category. Built on
 * native <details>/<summary> (keyboard-operable and screen-reader
 * friendly with zero extra state management), same accessible-accordion
 * pattern already proven in components/primal-pattern/results/
 * EducationAccordion.tsx. Collapsed state is the "at a glance" summary
 * (name, zone badge, score); expanded state adds the category's own
 * already-approved short description (four-doctors/copy.ts), what the
 * zone means, and the one guidance sentence for this category+zone,
 * always read from the centralized guidance config, never generated here.
 */

import { Footprints, Moon, Sparkles, UtensilsCrossed } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { zoneForPriority } from '@/lib/assessments/four-doctors/premium/zones';
import { getGuidance } from '@/lib/assessments/four-doctors/premium/guidance';
import type { AssessmentCopy, CategoryScoreResult } from '@/lib/assessments/engine/types';

const ICON: Record<string, typeof Sparkles> = {
  dr_happiness: Sparkles,
  dr_quiet: Moon,
  dr_diet: UtensilsCrossed,
  dr_movement: Footprints,
};

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

function DoctorCard({ category, copy }: { category: CategoryScoreResult; copy: AssessmentCopy }) {
  const Icon = ICON[category.categoryId] ?? Sparkles;
  const zone = zoneForPriority(category.priority);
  const categoryCopy = copy.categoryCopy[category.categoryId];
  const guidance = getGuidance(category.categoryId, zone.id);

  return (
    <details className="group rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
      <summary className="mef-focus-ring flex cursor-pointer list-none items-start justify-between gap-3 rounded-lg">
        <div className="flex items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: zone.tint, color: zone.color }}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div>
            <p className="font-[family-name:var(--font-cormorant-garamond)] text-xl leading-tight text-[#1B3A2D]">
              {category.categoryName}
            </p>
            <p className="mt-1 text-sm text-[#6B7A72]">
              {category.score} <span className="text-xs">of {category.maxScore}</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: zone.color, backgroundColor: zone.tint }}
          >
            {zone.label}
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-[#6B7A72] transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </div>
      </summary>

      <div className="mt-5 space-y-4 border-t border-[#EDEBE3] pt-4">
        {categoryCopy && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
              About this area
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]">
              {categoryCopy.shortDescription}
            </p>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            What {zone.label} means
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]">{zone.meaning}</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Guidance</p>
          <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]">{guidance.sentence}</p>
          {!guidance.approved && (
            <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wider text-[#B0522D]">
              Pending content review
            </p>
          )}
        </div>
      </div>
    </details>
  );
}
