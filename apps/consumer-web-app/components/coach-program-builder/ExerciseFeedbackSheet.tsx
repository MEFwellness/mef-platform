'use client';

/**
 * "Need another option?" — the sheet a member opens when an exercise is
 * not working for her.
 *
 * WHAT SHE NEVER SEES HERE. A search box. A browse list. The exercise
 * library. A count of how many alternatives exist. A difficulty grade. The
 * word "regression". She sees at most three named exercises with one plain
 * sentence each, or she sees a message explaining why there are none. Every
 * one of those decisions is made on the server
 * (lib/programs/feedback/offers.ts); this screen renders the answer and
 * cannot widen it.
 *
 * PAIN NEVER REACHES THE OPTIONS STATE. The server returns no options on
 * that branch, and this component has no code path that could show one
 * anyway, because the options list it renders is the list it was handed.
 *
 * Portalled to document.body: a modal inside a transformed ancestor stops
 * being fixed to the viewport and starts being fixed to that ancestor. See
 * .mef-modal-viewport in app/globals.css.
 *
 * NO EM DASHES and no exclamation marks, per the house rules.
 */

import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Lock, ShieldAlert, X } from 'lucide-react';
import type {
  ExerciseFeedbackDecision,
  ExerciseFeedbackReason,
} from '@mef/shared-types-contracts';
import { FEEDBACK_REASONS } from '@/lib/programs/feedback/reasons';
import {
  FEEDBACK_OTHER_PLACEHOLDER,
  FEEDBACK_SHEET_BLURB,
  FEEDBACK_SHEET_TITLE,
  KEEP_ORIGINAL_LABEL,
  LOCKED_MESSAGE,
  OPTIONS_HEADING,
} from '@/lib/programs/feedback/copy';
import {
  applyExerciseSwapAction,
  keepOriginalExerciseAction,
  submitExerciseFeedbackAction,
} from '@/app/actions/exercise-feedback';

type Stage = 'reasons' | 'decision' | 'done';

export function ExerciseFeedbackSheet({
  exerciseRowId,
  exerciseName,
  isLocked,
  onClose,
  onChanged,
}: {
  exerciseRowId: string;
  exerciseName: string;
  /** Her coach chose this one specifically. The sheet says so and offers nothing. */
  isLocked: boolean;
  onClose: () => void;
  /** Something about her program changed, so the page behind should re-read. */
  onChanged: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [stage, setStage] = useState<Stage>('reasons');
  const [reason, setReason] = useState<ExerciseFeedbackReason | null>(null);
  const [otherText, setOtherText] = useState('');
  const [decision, setDecision] = useState<ExerciseFeedbackDecision | null>(null);
  const [finalMessage, setFinalMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => setMounted(true), []);

  function submit(picked: ExerciseFeedbackReason) {
    setReason(picked);
    setError(null);
    startTransition(async () => {
      const result = await submitExerciseFeedbackAction(exerciseRowId, {
        reason: picked,
        otherText: picked === 'other' ? otherText : null,
      });
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setDecision(result);
      setStage('decision');
      if (result.stopped) onChanged();
    });
  }

  function choose(externalId: string) {
    if (!reason) return;
    setError(null);
    startTransition(async () => {
      const result = await applyExerciseSwapAction(exerciseRowId, {
        reason,
        externalId,
        feedbackId: decision?.feedbackId ?? null,
      });
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setFinalMessage(result.message);
      setStage('done');
      onChanged();
    });
  }

  function keepOriginal() {
    startTransition(async () => {
      if (decision?.feedbackId) await keepOriginalExerciseAction(decision.feedbackId);
      onClose();
    });
  }

  if (!mounted) return null;

  return createPortal(
    <div className="mef-modal-viewport fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]">
        <div className="flex items-start justify-between gap-3 border-b border-[#1B3A2D]/10 p-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
              {exerciseName}
            </p>
            <p className="mt-0.5 text-lg font-semibold text-[#1B3A2D]">{FEEDBACK_SHEET_TITLE}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1.5 text-[#6B7A72] hover:bg-[#1B3A2D]/5 hover:text-[#1B3A2D]"
          >
            <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <p className="mb-4 rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>
          )}

          {stage === 'reasons' && (
            <>
              <p className="text-sm leading-relaxed text-[#6B7A72]">{FEEDBACK_SHEET_BLURB}</p>
              {isLocked && (
                <p className="mt-4 flex items-start gap-2 rounded-2xl bg-[#EFF6F1] p-3 text-sm leading-relaxed text-[#1B3A2D]">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  <span>{LOCKED_MESSAGE} You can still tell us how it is going.</span>
                </p>
              )}
              <div className="mt-4 space-y-1.5">
                {FEEDBACK_REASONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      if (option.value === 'other') {
                        setReason('other');
                        return;
                      }
                      submit(option.value);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition disabled:opacity-50 ${
                      reason === option.value
                        ? 'border-[#1B3A2D] bg-[#EFF6F1] text-[#1B3A2D]'
                        : 'border-[#1B3A2D]/10 text-[#1B3A2D] hover:border-[#1B3A2D]/30 hover:bg-[#FAFAF8]'
                    }`}
                  >
                    <span>{option.label}</span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-[#6B7A72]"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>

              {reason === 'other' && (
                <div className="mt-4">
                  <textarea
                    value={otherText}
                    onChange={(e) => setOtherText(e.target.value)}
                    placeholder={FEEDBACK_OTHER_PLACEHOLDER}
                    rows={3}
                    maxLength={500}
                    aria-label={FEEDBACK_OTHER_PLACEHOLDER}
                    className="w-full resize-none rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => submit('other')}
                    className="mef-press mt-3 w-full rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                  >
                    Send this to my coach
                  </button>
                </div>
              )}
            </>
          )}

          {stage === 'decision' && decision && (
            <>
              <p
                className={`flex items-start gap-2 rounded-2xl p-4 text-sm leading-relaxed ${
                  decision.stopped
                    ? 'bg-[#F5B700]/[0.14] text-[#1B3A2D]'
                    : 'bg-[#EFF6F1] text-[#1B3A2D]'
                }`}
              >
                {decision.stopped && (
                  <ShieldAlert
                    className="mt-0.5 h-4 w-4 shrink-0"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                )}
                <span>{decision.message}</span>
              </p>

              {decision.options.length > 0 && (
                <>
                  <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                    {OPTIONS_HEADING}
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {decision.options.map((option) => (
                      <button
                        key={option.externalId}
                        type="button"
                        disabled={isPending}
                        onClick={() => choose(option.externalId)}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#1B3A2D]/10 px-4 py-3 text-left transition hover:border-[#1B3A2D]/30 hover:bg-[#EFF6F1] disabled:opacity-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-[#1B3A2D]">
                            {option.name}
                          </span>
                          <span className="mt-0.5 block text-xs text-[#6B7A72]">{option.note}</span>
                        </span>
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-[#1B3A2D]"
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                  </div>
                </>
              )}

              <button
                type="button"
                disabled={isPending}
                onClick={decision.options.length > 0 ? keepOriginal : onClose}
                className="mef-press mt-5 w-full rounded-full border border-[#1B3A2D]/15 px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:border-[#1B3A2D]/40 disabled:opacity-50"
              >
                {decision.options.length > 0 ? KEEP_ORIGINAL_LABEL : 'Close'}
              </button>
            </>
          )}

          {stage === 'done' && (
            <>
              <p className="rounded-2xl bg-[#EFF6F1] p-4 text-sm leading-relaxed text-[#1B3A2D]">
                {finalMessage}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mef-press mt-5 w-full rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
              >
                Back to my session
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
