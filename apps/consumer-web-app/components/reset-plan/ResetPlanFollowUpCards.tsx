'use client';

/**
 * Personal Reset Plan's day-3 check-in and day-7 reflection — built
 * against the plan's own tables (member_reset_plan_daily_logs), never the
 * Weekly Experiment follow-up engine, per the build brief. Shared by both
 * the persistent dashboard card (ResetPlanActiveCard.tsx) and the pop-up
 * (ResetPlanPopup.tsx) so "answer here" and "answer on the card" are one
 * real implementation, same discipline as CvsFollowUpCards.tsx.
 */

import { useState, useTransition } from 'react';
import { CVS_CARD } from '@/components/core-values-snapshot/theme';
import { RESET_PLAN_DAY3_OPTIONS, type ResetPlanDay3Response } from '@/lib/reset-plan/constants';
import { buildResetPlanDay3Prompt, buildResetPlanDay3Reflection, buildResetPlanDay7Reflection } from '@/lib/reset-plan/copy';
import type { Signal } from '@/lib/life-signal-check/constants';
import type { ResetPlanDailyLog } from '@/lib/reset-plan/types';
import { acknowledgeResetPlanDay7Action, submitResetPlanDay3ResponseAction } from '@/app/actions/resetPlan';

type Day3Props = {
  planId: string;
  focusSignal: Signal;
  cardClassName?: string;
  onAnswered?: (response: ResetPlanDay3Response) => void;
};

export function ResetPlanDay3FollowUp({ planId, focusSignal, cardClassName = CVS_CARD, onAnswered }: Day3Props) {
  const [isPending, startTransition] = useTransition();
  const [response, setResponse] = useState<ResetPlanDay3Response | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (response) {
    return (
      <div className={`${cardClassName} mef-animate-in p-7`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">From Root</p>
        <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{buildResetPlanDay3Reflection(response)}</p>
      </div>
    );
  }

  return (
    <div className={`${cardClassName} mef-animate-in p-7`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">From Root</p>
      <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{buildResetPlanDay3Prompt(focusSignal)}</p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-5 space-y-2">
        {RESET_PLAN_DAY3_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await submitResetPlanDay3ResponseAction(planId, option.value);
                if (!result.ok) {
                  setError(result.error ?? 'Could not save that.');
                  return;
                }
                setResponse(option.value);
                onAnswered?.(option.value);
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
  planId: string;
  focusSignal: Signal;
  logs: ResetPlanDailyLog[];
  cardClassName?: string;
  onAcknowledged?: () => void;
};

export function ResetPlanDay7Reflection({ planId, focusSignal, logs, cardClassName = CVS_CARD, onAcknowledged }: Day7Props) {
  const [isPending, startTransition] = useTransition();
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (acknowledged) return null;

  return (
    <div className={`${cardClassName} mef-animate-in p-7`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">From Root · Day 7</p>
      <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{buildResetPlanDay7Reflection(logs, focusSignal)}</p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await acknowledgeResetPlanDay7Action(planId);
            if (!result.ok) {
              setError(result.error ?? 'Could not save that.');
              return;
            }
            setAcknowledged(true);
            onAcknowledged?.();
          });
        }}
        className="mef-focus-ring mt-5 inline-flex items-center justify-center rounded-2xl bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#163025] disabled:opacity-50"
      >
        Got it
      </button>
    </div>
  );
}
