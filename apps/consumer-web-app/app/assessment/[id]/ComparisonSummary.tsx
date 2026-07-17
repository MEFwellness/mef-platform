import type { BodyAssessmentComparison } from '@mef/shared-types-contracts';
import { FINDING_TYPE_CONFIG } from '@/lib/body-assessment/findings';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const TREND_BADGE: Record<string, string> = {
  improved: 'bg-emerald-50 text-emerald-700',
  stable: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]',
  declined: 'bg-red-50 text-red-700',
  unknown: 'bg-amber-50 text-amber-700',
};

const TREND_LABEL: Record<string, string> = {
  improved: 'Improved',
  stable: 'Stable',
  declined: 'Declined',
  unknown: 'Not enough data',
};

/** Renders the reusable comparison engine's output (lib/body-assessment/comparison.ts) for this assessment vs. its most recent same-type predecessor — a plain presentational component, no client-side logic. */
export function ComparisonSummary({ rows }: { rows: BodyAssessmentComparison[] }) {
  const overall = rows.find((r) => r.dimension === 'overall');
  const dimensionRows = rows.filter((r) => r.dimension !== 'overall');

  return (
    <section className={`${CARD} p-6`}>
      <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        Progress since your last assessment
      </p>

      {overall ? (
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-[#FAFAF8] p-4">
          <p className="text-sm text-[#1B3A2D]">{overall.summary}</p>
          <span
            className={`ml-3 shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${TREND_BADGE[overall.trend]}`}
          >
            {TREND_LABEL[overall.trend]}
          </span>
        </div>
      ) : (
        <p className="mt-2 text-sm text-[#6B7A72]">Not enough findings yet to compare.</p>
      )}

      {dimensionRows.length > 0 && (
        <ul className="mt-3 divide-y divide-[#1B3A2D]/5">
          {dimensionRows.map((row) => (
            <li key={row.dimension} className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-[#1B3A2D]">
                  {row.dimension in FINDING_TYPE_CONFIG
                    ? FINDING_TYPE_CONFIG[row.dimension as keyof typeof FINDING_TYPE_CONFIG].label
                    : row.dimension}
                </p>
                <p className="text-xs text-[#6B7A72]">{row.summary}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${TREND_BADGE[row.trend]}`}
              >
                {TREND_LABEL[row.trend]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
