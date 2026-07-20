'use client';

/**
 * Assessment history comparison — lets a member pick which prior point to
 * compare their latest assessment against (immediately previous, or a
 * fixed window: 30/90/182/365 days back) and shows the per-category and
 * overall delta. Calls the getMyAssessmentComparison server action
 * directly (Server Actions are callable from Client Components in the
 * App Router — no separate API route needed), re-fetching whenever the
 * selected window changes.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { getMyAssessmentComparison } from '@/app/actions/assessments';
import { toPublicSlug } from '@/lib/assessments/publicSlug';
import type { ComparisonMode } from '@/lib/assessments/store';
import type { AssessmentComparison } from '@/lib/assessments/comparison';
import {
  DIRECTION_LABEL,
  directionToStatus,
  formatAssessmentDate,
} from '@/lib/assessments/presentation';
import { STATUS_STYLES } from '@/lib/wellness/status';
import type { Questionnaire } from '@/lib/assessments/engine/types';

type ModeOption = { key: string; label: string; mode: ComparisonMode };

const MODE_OPTIONS: ModeOption[] = [
  { key: 'previous', label: 'Previous', mode: 'previous' },
  { key: '30d', label: '30 days', mode: { daysAgo: 30 } },
  { key: '90d', label: '90 days', mode: { daysAgo: 90 } },
  { key: '6mo', label: '6 months', mode: { daysAgo: 182 } },
  { key: '1yr', label: '1 year', mode: { daysAgo: 365 } },
];

function DirectionIcon({ direction }: { direction: AssessmentComparison['totalDirection'] }) {
  if (direction === 'improved')
    return <TrendingDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />;
  if (direction === 'regressed')
    return <TrendingUp className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />;
  if (direction === 'unchanged')
    return <Minus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />;
  return null;
}

export function AssessmentComparisonPanel({
  questionnaire,
  latestAssessmentId,
}: {
  questionnaire: Questionnaire;
  latestAssessmentId: string;
}) {
  const [selectedKey, setSelectedKey] = useState('previous');
  const [comparison, setComparison] = useState<AssessmentComparison | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const option = MODE_OPTIONS.find((o) => o.key === selectedKey)!;
    setLoading(true);
    getMyAssessmentComparison(questionnaire.id, latestAssessmentId, option.mode).then((result) => {
      if (!cancelled) {
        setComparison(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedKey, questionnaire.id, latestAssessmentId]);

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Compare against">
        {MODE_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={selectedKey === option.key}
            onClick={() => setSelectedKey(option.key)}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
              selectedKey === option.key
                ? 'bg-[#1B3A2D] text-white'
                : 'bg-[#F3F6F4] text-[#1B3A2D] hover:bg-[#EFF6F1]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading && <p className="mt-4 text-sm text-[#6B7A72]">Loading comparison…</p>}

      {!loading && comparison && !comparison.previous && (
        <p className="mt-4 text-sm text-[#6B7A72]">
          No completed assessment falls in that window yet. Complete another assessment to unlock
          this comparison.
        </p>
      )}

      {!loading && comparison && comparison.previous && (
        <div className="mt-4">
          <div
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${STATUS_STYLES[directionToStatus(comparison.totalDirection)].bg} ${STATUS_STYLES[directionToStatus(comparison.totalDirection)].text}`}
          >
            <DirectionIcon direction={comparison.totalDirection} />
            Overall: {DIRECTION_LABEL[comparison.totalDirection]}
            {comparison.totalDelta !== null && comparison.totalDelta !== 0
              ? ` (${comparison.totalDelta > 0 ? '+' : ''}${comparison.totalDelta} pts)`
              : ''}
          </div>
          <p className="mt-2 text-xs text-[#6B7A72]">
            Compared to {formatAssessmentDate(comparison.previous.record.completedAt!)}
          </p>

          <div className="mt-4 divide-y divide-[#1B3A2D]/8">
            {comparison.categories.map((category) => {
              const status = directionToStatus(category.direction);
              const categoryName =
                questionnaire.categories.find((c) => c.id === category.categoryId)?.name ??
                category.categoryId;
              return (
                <div
                  key={category.categoryId}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <Link
                    href={
                      `/assessments/${toPublicSlug(questionnaire.id)}/results/${latestAssessmentId}/category/${category.categoryId}` as Route
                    }
                    className="text-sm font-medium text-[#1B3A2D] hover:underline"
                  >
                    {categoryName}
                  </Link>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-[#6B7A72]">
                      {category.previousScore ?? 'N/A'} → {category.currentScore}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status].bg} ${STATUS_STYLES[status].text}`}
                    >
                      <DirectionIcon direction={category.direction} />
                      {DIRECTION_LABEL[category.direction]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
