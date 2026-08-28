import Link from 'next/link';
import type { Route } from 'next';
import { CheckCircle2 } from 'lucide-react';
import { BeginAssessmentForm } from './BeginAssessmentForm';

/**
 * COMPLETION IS PERMANENT (2026-08-27). The overview screen of an
 * experience she has already finished, for all three free conversations
 * and for the Whole-Body Check-In, written once here rather than four
 * times.
 *
 * What it replaces: every one of those overview screens offered exactly
 * one button, "Let's begin", to everybody, including a member who had
 * answered every question the night before. Tapping it opened the take
 * route, which started a brand-new empty session as a side effect of
 * rendering, and that empty session then made every surface in the app
 * forget she had ever finished. One member answered all twelve Core
 * Values Snapshot questions four separate times.
 *
 * So a finished experience leads with her results, and a retake is a
 * second, quieter, clearly-labelled choice. Nothing here writes anything:
 * the retake is a Server Action she presses, not a link a browser can
 * follow on her behalf (2026-08-27, see BeginAssessmentForm).
 */
export function CompletedExperienceActions({
  resultsHref,
  retakeAction,
  resultsLabel = 'See your results',
}: {
  resultsHref: string;
  /** Starts a fresh attempt, then redirects into it. Never returns. */
  retakeAction: () => Promise<void>;
  resultsLabel?: string;
}) {
  return (
    <div className="mt-6">
      <div className="flex items-start gap-2 rounded-2xl bg-[#F5F0E4] px-4 py-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#3C7F5E]" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm leading-relaxed text-[#1B3A2D]">
          You have finished this one. Your answers and what Root found are saved.
        </p>
      </div>

      <Link
        href={resultsHref as Route}
        className="mt-5 block rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
      >
        {resultsLabel}
      </Link>

      <BeginAssessmentForm action={retakeAction} label="Take it again" variant="secondary" className="mt-3" />
      <p className="mt-3 text-center text-xs leading-relaxed text-[#6B7A72]">
        Taking it again starts a fresh conversation. What you saved before stays exactly where it is.
      </p>
    </div>
  );
}
