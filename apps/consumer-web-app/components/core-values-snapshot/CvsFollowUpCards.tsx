'use client';

/**
 * Root's day-3/day-7 Weekly Experiment follow-ups — the actual question
 * (day 3) and reflection (day 7), with real answer/acknowledge affordances,
 * factored out so both the dashboard's own "From Root" card
 * (components/dashboard/CvsCheckinCard.tsx) and the standalone experiment
 * page (components/core-values-snapshot/CvsExperimentPanel.tsx) render the
 * exact same check-in rather than two hand-kept copies. Previously this
 * only ever rendered on the standalone page, reached by tapping "View
 * Result" — a check-in Root promised the member has to actually reach the
 * member, not wait to be found.
 */

import { useState, useTransition } from 'react';
import { CVS_CARD } from './theme';
import {
  CVS_DAY3_OPTIONS,
  cvsDay3FollowUpText,
  cvsDay3ReflectionText,
  cvsDay7FollowUpText,
} from '@/lib/core-values-snapshot/copy';
import { acknowledgeCvsDay7Action, submitCvsDay3ResponseAction } from '@/app/actions/coreValuesSnapshot';
import { classifyDay7Pattern, type CvsDailyLogRow, type Day3Response } from '@/lib/core-values-snapshot/experiment';

/** Warm gold "waiting on you" accent, shown on the on-page card once a member has tapped "Maybe later" on this same message's pop-up — same amber token as the app's other highlight accents (see WearableWelcomeModal.tsx). */
function HighPriorityBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-[#C4A050]/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#854D0E]">
      Waiting on you
    </span>
  );
}

type Day3Props = {
  experimentId: string;
  topLabelText: string;
  cardClassName?: string;
  isHighPriority?: boolean;
};

export function CvsDay3FollowUp({ experimentId, topLabelText, cardClassName = CVS_CARD, isHighPriority = false }: Day3Props) {
  const [isPending, startTransition] = useTransition();
  const [response, setResponse] = useState<Day3Response | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (response) {
    return (
      <div className={`${cardClassName} mef-animate-in p-7`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">From Root</p>
        <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{cvsDay3ReflectionText(response)}</p>
      </div>
    );
  }

  return (
    <div className={`${cardClassName} mef-animate-in p-7`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">From Root</p>
        {isHighPriority && <HighPriorityBadge />}
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{cvsDay3FollowUpText(topLabelText)}</p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-5 space-y-2">
        {CVS_DAY3_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await submitCvsDay3ResponseAction(experimentId, option.value as Day3Response);
                if (!result.ok) {
                  setError(result.error ?? 'Could not save that.');
                  return;
                }
                setResponse(option.value as Day3Response);
              });
            }}
            className="mef-focus-ring block w-full rounded-2xl border border-[#1B3A2D]/10 px-5 py-3 text-left text-sm font-medium text-[#1B3A2D] transition hover:border-[#C4A050]/60 hover:bg-[#FAF7F0] disabled:opacity-50"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type Day7Props = {
  experimentId: string;
  topLabelText: string;
  logs: CvsDailyLogRow[];
  durationDays: number;
  cardClassName?: string;
  isHighPriority?: boolean;
};

export function CvsDay7FollowUp({
  experimentId,
  topLabelText,
  logs,
  durationDays,
  cardClassName = CVS_CARD,
  isHighPriority = false,
}: Day7Props) {
  const [isPending, startTransition] = useTransition();
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (acknowledged) return null;

  const day7Result = classifyDay7Pattern(logs, durationDays);

  return (
    <div className={`${cardClassName} mef-animate-in p-7`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">From Root</p>
        {isHighPriority && <HighPriorityBadge />}
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">
        {cvsDay7FollowUpText(topLabelText, day7Result.pattern)}
      </p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await acknowledgeCvsDay7Action(experimentId);
            if (!result.ok) {
              setError(result.error ?? 'Could not save that.');
              return;
            }
            setAcknowledged(true);
          });
        }}
        className="mef-focus-ring mt-5 inline-flex items-center justify-center rounded-2xl bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#163025] disabled:opacity-50"
      >
        Got it
      </button>
    </div>
  );
}
