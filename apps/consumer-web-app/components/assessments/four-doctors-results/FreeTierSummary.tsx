/**
 * Free / 7-Day Trial result depth for the Four Doctors Assessment — the
 * membership framework's free entry-point tier (section 5): basic
 * reflection, limited explanation, a few meaningful strengths, a
 * reflection question, and a note that this is one part of a broader
 * picture. No category-by-category guidance, no zone legend, no next
 * steps, no history/comparison — those stay Membership+ (see the
 * Nutrition & Lifestyle Questionnaire for the parallel "Membership
 * unlocks this" pattern). Purely presentational: reads only the same
 * already-computed categoryScores every paid tier sees, never a
 * different scoring path.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { Gem } from 'lucide-react';
import type { CategoryScoreResult, AssessmentCopy } from '@/lib/assessments/engine/types';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function pickStrengths(categories: CategoryScoreResult[]): CategoryScoreResult[] {
  const low = categories.filter((c) => c.priority === 'low');
  const source = low.length > 0 ? low : [...categories].sort((a, b) => a.score - b.score);
  return source.slice(0, 2);
}

export function FreeTierSummary({
  categories,
  copy,
}: {
  categories: CategoryScoreResult[];
  copy: AssessmentCopy;
}) {
  const strengths = pickStrengths(categories);

  return (
    <div className="space-y-5">
      <section className={`${CARD} mef-animate-in p-7`}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
          A Few Meaningful Strengths
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[#1B3A2D]">
          Every category tells part of your story. Here is where things are already working well for
          you.
        </p>
        <div className="mt-4 space-y-4">
          {strengths.map((category) => (
            <div key={category.categoryId} className="rounded-2xl bg-[#F3F6F4] p-5">
              <p className="text-sm font-semibold text-[#1B3A2D]">{category.categoryName}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[#1B3A2D]/80">
                {copy.categoryCopy[category.categoryId]?.shortDescription ??
                  'A part of your everyday wellness rhythm.'}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className={`${CARD} mef-animate-in p-7`}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
          A Question Worth Sitting With
        </p>
        <p className="mt-2 text-base leading-relaxed text-[#1B3A2D]">
          Looking at your results, which area feels most worth your attention this week, and what is
          one small step you could take toward it?
        </p>
      </section>

      <section className={`${CARD} mef-animate-in flex items-start gap-3 p-6`}>
        <Gem
          className="mt-0.5 h-4 w-4 shrink-0 text-[#1B3A2D]/60"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-semibold text-[#1B3A2D]">One part of the broader picture</p>
          <p className="mt-1.5 text-sm leading-relaxed text-[#6B7A72]">
            This is a basic reflection, not your full results. A membership unlocks personalized
            guidance for every category, your assessment history, and simple score trends over time.
          </p>
          <Link
            href={'/membership' as Route}
            className="mt-4 inline-block rounded-2xl bg-[#1B3A2D] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#163025]"
          >
            View Membership
          </Link>
        </div>
      </section>
    </div>
  );
}
