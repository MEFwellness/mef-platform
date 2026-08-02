'use client';

/**
 * Case View — the headline measure (requirement 5): her own goal,
 * charted from her own periodic 1-5 ratings (member_goal_progress_checkins,
 * migration 107). Same hand-rolled-SVG house style as every other chart
 * in this app (see app/coach/clients/[id]/body-assessments/[assessmentId]/RightPanel/TrendChart.tsx) —
 * 2px line, round join/cap, endpoint marker + label, one recessive
 * hairline baseline, native <title> tooltips, "View as list" fallback.
 * No charting library, per this codebase's established convention.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitGoalProgressRatingAction } from '@/app/actions/caseView';
import type { GoalProgressView } from '@/lib/case-view/types';

const LINE_COLOR = '#1B3A2D';
const GRID_COLOR = 'rgba(27,58,45,0.10)';
const SURFACE_COLOR = '#FAFAF8';
const RATING_LABELS = ['Much worse', 'Worse', 'About the same', 'Better', 'Much better'];

/**
 * `timeZone: 'UTC'` is required, not cosmetic — without it,
 * toLocaleDateString resolves against the runtime's local timezone,
 * which differs between the Node server (SSR) and the browser (hydration),
 * producing a real hydration mismatch on this exact date text (caught by
 * driving this page in a real browser, not just typechecking).
 */
function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function Chart({ points }: { points: { date: string; rating: number }[] }) {
  const [tableOpen, setTableOpen] = useState(false);
  const width = 320;
  const height = 120;
  const padX = 14;
  const padTop = 22;
  const padBottom = 20;

  const xFor = (index: number) =>
    points.length === 1 ? width / 2 : padX + (index / (points.length - 1)) * (width - padX * 2);
  const yFor = (rating: number) => padTop + (height - padTop - padBottom) * (1 - (rating - 1) / 4);

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.rating)}`).join(' ');
  const first = points[0]!;
  const latest = points[points.length - 1]!;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2 w-full"
        role="img"
        aria-label={`Your goal progress across ${points.length} check-ins, most recently rated "${RATING_LABELS[latest.rating - 1]}"`}
      >
        <line x1={padX} y1={height - padBottom} x2={width - padX} y2={height - padBottom} stroke={GRID_COLOR} strokeWidth={1} />
        {points.length >= 2 && (
          <path d={linePath} fill="none" stroke={LINE_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {points.map((p, i) => {
          const isEndpoint = i === points.length - 1;
          const cx = xFor(i);
          const cy = yFor(p.rating);
          return (
            <g key={p.date}>
              <circle cx={cx} cy={cy} r={5} fill={LINE_COLOR} stroke={SURFACE_COLOR} strokeWidth={2}>
                {/* React special-cases <title> to expect a single string child;
                    multiple interpolated children ({a} — {b}) server-render as
                    empty even though they hydrate correctly client-side — a real
                    SSR/hydration mismatch caught by driving this in a browser.
                    One pre-joined template-literal child avoids it. */}
                <title>{`${formatDate(p.date)}: ${RATING_LABELS[p.rating - 1]}`}</title>
              </circle>
              {isEndpoint && (
                <text x={cx} y={cy - 10} textAnchor="end" className="fill-[#1B3A2D]" style={{ fontSize: 11, fontWeight: 600 }}>
                  {RATING_LABELS[p.rating - 1]}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="mt-1 flex items-center justify-between text-[10px] text-[#9AA79F]">
        <span>{formatDate(first.date)}</span>
        <button
          type="button"
          onClick={() => setTableOpen((o) => !o)}
          className="underline decoration-dotted underline-offset-2 hover:text-[#6B7A72]"
        >
          {tableOpen ? 'Hide values' : 'View as list'}
        </button>
        <span>{formatDate(latest.date)}</span>
      </div>

      {tableOpen && (
        <ul className="mt-2 space-y-1 rounded-xl bg-[#FAFAF8] p-2 text-[11px] text-[#6B7A72]">
          {points.map((p) => (
            <li key={p.date} className="flex items-center justify-between gap-2">
              <span>{formatDate(p.date)}</span>
              <span className="font-medium text-[#1B3A2D]">{RATING_LABELS[p.rating - 1]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function GoalProgressChart({
  goalProgress,
  localDate,
  readOnly = false,
}: {
  goalProgress: GoalProgressView;
  localDate: string;
  /** Coach view: shows the chart only, never the member's own rating prompt. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [error, setError] = useState('');

  function submitRating(rating: number) {
    setError('');
    startTransition(async () => {
      const result = await submitGoalProgressRatingAction(localDate, rating);
      if (result.error) {
        setError(result.error);
        return;
      }
      setJustSubmitted(true);
      router.refresh();
    });
  }

  return (
    <div className="mef-card p-6">
      <p className="text-xs font-medium uppercase tracking-wider text-[#6B7A72]">Your progress</p>

      {goalProgress.points.length === 0 ? (
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          No ratings yet. Answer below and this fills in over time.
        </p>
      ) : (
        <Chart points={goalProgress.points} />
      )}

      {!readOnly && goalProgress.promptDue && !justSubmitted && (
        <div className="mt-5 border-t border-[#1B3A2D]/[0.06] pt-5">
          <p className="text-[15px] leading-relaxed text-[#1B3A2D]">{goalProgress.promptText}</p>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={goalProgress.promptText}>
            {RATING_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                disabled={isPending}
                onClick={() => submitRating(i + 1)}
                className="rounded-full border border-[#1B3A2D]/10 bg-white px-3.5 py-2 text-[13px] font-medium text-[#6B7A72] transition-all duration-200 ease-out hover:border-[#1B3A2D]/25 hover:text-[#1B3A2D] disabled:opacity-60"
              >
                {label}
              </button>
            ))}
          </div>
          {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        </div>
      )}

      {!readOnly && justSubmitted && (
        <p className="mt-4 text-sm text-[#6B7A72]">Thanks, that&apos;s saved.</p>
      )}
    </div>
  );
}
