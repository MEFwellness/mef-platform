'use client';

/**
 * Root's day-3/day-7 Weekly Experiment follow-ups — the actual question
 * (day 3) and reflection (day 7), with real answer/acknowledge affordances,
 * factored out so both experiences' dashboard "From Root" cards
 * (components/dashboard/ActiveExperimentsSection.tsx) and
 * standalone experiment pages render the exact same check-in rather than
 * hand-kept copies. Previously this only ever rendered on Core Values
 * Snapshot's own standalone page, reached by tapping "View Result" — a
 * check-in Root promised the member has to actually reach the member, not
 * wait to be found.
 *
 * `experience` is a plain string, not a function prop, on purpose: several
 * callers (CvsCheckinCard.tsx, LscCheckinCard.tsx) are Server Components,
 * and Next.js can only pass Server Actions (not ordinary functions) across
 * that boundary into a Client Component — a real bug caught during this
 * build (passing lscDay7FollowUpText directly as a prop crashed with
 * "Functions cannot be passed directly to Client Components"). The two
 * experiences' copy functions are resolved from this string internally,
 * inside the Client Component, instead.
 */

import { useState, useTransition } from 'react';
import { CVS_CARD } from './theme';
import {
  CVS_DAY3_OPTIONS,
  cvsDay3FollowUpText,
  cvsDay3ReflectionText,
  cvsDay7FollowUpText,
} from '@/lib/core-values-snapshot/copy';
import { lscDay3FollowUpText, lscDay3ReflectionText, lscDay7FollowUpText } from '@/lib/life-signal-check/copy';
import { acknowledgeCvsDay7Action, submitCvsDay3ResponseAction } from '@/app/actions/coreValuesSnapshot';
import { classifyDay7Pattern, type CvsDailyLogRow, type Day3Response } from '@/lib/core-values-snapshot/experiment';

export type FollowUpExperience = 'core-values-snapshot' | 'life-signal-check';

const DAY3_FOLLOW_UP_TEXT: Record<FollowUpExperience, typeof cvsDay3FollowUpText> = {
  'core-values-snapshot': cvsDay3FollowUpText,
  'life-signal-check': lscDay3FollowUpText,
};
const DAY3_REFLECTION_TEXT: Record<FollowUpExperience, typeof cvsDay3ReflectionText> = {
  'core-values-snapshot': cvsDay3ReflectionText,
  'life-signal-check': lscDay3ReflectionText,
};
const DAY7_FOLLOW_UP_TEXT: Record<FollowUpExperience, typeof cvsDay7FollowUpText> = {
  'core-values-snapshot': cvsDay7FollowUpText,
  'life-signal-check': lscDay7FollowUpText,
};

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
  /** Defaults to Core Values Snapshot. Life Signal Check's dashboard card/pop-up/experiment panel pass 'life-signal-check' instead — same component, different experience's action and copy underneath. */
  experience?: FollowUpExperience;
  /** Defaults to Core Values Snapshot's own action. Life Signal Check passes submitLscDay3ResponseAction here instead — a real Server Action, safe to pass as a prop even from a Server Component parent (unlike the copy functions above). */
  onSubmit?: typeof submitCvsDay3ResponseAction;
};

export function CvsDay3FollowUp({
  experimentId,
  topLabelText,
  cardClassName = CVS_CARD,
  isHighPriority = false,
  experience = 'core-values-snapshot',
  onSubmit = submitCvsDay3ResponseAction,
}: Day3Props) {
  const [isPending, startTransition] = useTransition();
  const [response, setResponse] = useState<Day3Response | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (response) {
    return (
      <div className={`${cardClassName} mef-animate-in p-7`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">From Root</p>
        <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{DAY3_REFLECTION_TEXT[experience](response)}</p>
      </div>
    );
  }

  return (
    <div className={`${cardClassName} mef-animate-in p-7`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">From Root</p>
        {isHighPriority && <HighPriorityBadge />}
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{DAY3_FOLLOW_UP_TEXT[experience](topLabelText)}</p>
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
                const result = await onSubmit(experimentId, option.value as Day3Response);
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
  experience?: FollowUpExperience;
  /** Defaults to Core Values Snapshot's own action. Life Signal Check's dashboard card/pop-up pass acknowledgeLscDay7Action here instead. */
  onAcknowledge?: typeof acknowledgeCvsDay7Action;
};

export function CvsDay7FollowUp({
  experimentId,
  topLabelText,
  logs,
  durationDays,
  cardClassName = CVS_CARD,
  isHighPriority = false,
  experience = 'core-values-snapshot',
  onAcknowledge = acknowledgeCvsDay7Action,
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
        {DAY7_FOLLOW_UP_TEXT[experience](topLabelText, day7Result.pattern)}
      </p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await onAcknowledge(experimentId);
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
