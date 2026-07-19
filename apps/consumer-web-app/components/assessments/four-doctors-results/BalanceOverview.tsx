'use client';

/**
 * Visual "how balanced are you" storytelling, deliberately not a table:
 * four rows, ranked strongest to weakest (by health ratio,
 * `1 - score/maxScore`, the same "fuller is healthier" convention as
 * ScoreRing.tsx and CategoryRadarChart.tsx), each with its own doctor
 * icon and a bar filled in its zone color, with the strongest and
 * weakest called out by a badge on its own line (never sharing a line
 * with the score, so neither wraps into the other on a narrow phone) so
 * a member reads "where I'm strongest / where I need the most attention"
 * in one glance rather than by comparing four numbers themselves.
 */

import { useEffect, useState } from 'react';
import { getDoctorIcon } from '@/lib/assessments/four-doctors/premium/icons';
import { zoneForPriority } from '@/lib/assessments/four-doctors/premium/zones';
import type { CategoryScoreResult } from '@/lib/assessments/engine/types';

function healthRatio(category: CategoryScoreResult): number {
  return category.maxScore > 0
    ? Math.max(0, Math.min(1, 1 - category.score / category.maxScore))
    : 0;
}

export function BalanceOverview({ categories }: { categories: CategoryScoreResult[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const ranked = [...categories].sort((a, b) => healthRatio(b) - healthRatio(a));
  const strongestId = ranked[0]?.categoryId;
  const weakestId = ranked[ranked.length - 1]?.categoryId;

  return (
    <section className="rounded-[32px] bg-white p-7 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">Your Balance</p>
      <p className="mt-1 text-sm leading-relaxed text-[#6B7A72]">
        Where you&apos;re strongest, and where to focus next.
      </p>

      <div className="mt-7 space-y-6">
        {ranked.map((category, index) => {
          const Icon = getDoctorIcon(category.categoryId);
          const zone = zoneForPriority(category.priority);
          const ratio = healthRatio(category);
          const delayMs = index * 130;
          const isStrongest = category.categoryId === strongestId;
          const isWeakest = category.categoryId === weakestId;
          return (
            <div
              key={category.categoryId}
              className="transition-opacity duration-500 motion-reduce:transition-none"
              style={{ opacity: mounted ? 1 : 0, transitionDelay: `${delayMs}ms` }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: zone.tint, color: zone.color }}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-[#1B3A2D]">
                    {category.categoryName}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-medium text-[#6B7A72]">
                  {category.score} <span className="text-[#B7C1BA]">of</span> {category.maxScore}
                </span>
              </div>

              {(isStrongest || (isWeakest && !isStrongest)) && (
                <p className="ml-[42px] mt-1">
                  {isStrongest ? (
                    <span className="rounded-full bg-[#E8F0EA] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#4F7A63]">
                      Strongest
                    </span>
                  ) : (
                    <span className="rounded-full bg-[#F5E9E3] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#B0522D]">
                      Focus here
                    </span>
                  )}
                </p>
              )}

              <div
                className="mt-2.5 ml-[42px] h-4 overflow-hidden rounded-full bg-[#F3F6F4]"
                role="img"
                aria-label={`${category.categoryName}: ${zone.label} zone, ${category.score} of ${category.maxScore}`}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-[900ms] ease-out motion-reduce:transition-none"
                  style={{
                    width: mounted ? `${Math.max(6, ratio * 100)}%` : '0%',
                    backgroundColor: zone.color,
                    transitionDelay: `${delayMs}ms`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
