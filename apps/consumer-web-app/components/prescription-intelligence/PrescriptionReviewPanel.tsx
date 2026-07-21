'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Unlock, X, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import type {
  PrescriptionBlockExercise,
  PrescriptionSnapshotWithContent,
} from '@mef/shared-types-contracts';
import { MOVEMENT_SESSION_SECTION_LABEL } from '@mef/shared-types-contracts';
import {
  lockPrescriptionExerciseAction,
  removePrescriptionExerciseAction,
  removePrescriptionBlockAction,
  findPrescriptionSubstituteAction,
  replacePrescriptionExerciseAction,
  approvePrescriptionAction,
  rejectPrescriptionAction,
} from '@/app/actions/prescription-intelligence';
import type { BlockExerciseDraft } from '@/lib/prescription-intelligence/exerciseSelection';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const INPUT =
  'w-full rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-base text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none';

const SEVERITY_STYLE: Record<string, string> = {
  low: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]',
  moderate: 'bg-[#F5B700]/[0.18] text-[#854D0E]',
  high: 'bg-orange-100 text-orange-800',
  blocking: 'bg-red-100 text-red-800',
};

const CONFIDENCE_STYLE: Record<string, string> = {
  building: 'bg-[#1B3A2D]/[0.06] text-[#6B7A72]',
  low: 'bg-orange-100 text-orange-800',
  moderate: 'bg-[#F5B700]/[0.18] text-[#854D0E]',
  high: 'bg-emerald-100 text-emerald-800',
};

function prescriptionSummary(exercise: PrescriptionBlockExercise): string {
  return [
    exercise.sets ? `${exercise.sets} sets` : null,
    exercise.reps ? `${exercise.reps} reps` : null,
    exercise.hold_duration_seconds ? `Hold ${exercise.hold_duration_seconds}s` : null,
    exercise.time_seconds ? `${exercise.time_seconds}s` : null,
    exercise.rest_seconds ? `${exercise.rest_seconds}s rest` : null,
    exercise.tempo ? `Tempo ${exercise.tempo}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function ExerciseRow({
  exercise,
  blockId,
  editable,
}: {
  exercise: PrescriptionBlockExercise;
  blockId: string;
  editable: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [candidate, setCandidate] = useState<BlockExerciseDraft | null>(null);
  const [candidateError, setCandidateError] = useState<string | null>(null);

  function handleLock() {
    startTransition(async () => {
      await lockPrescriptionExerciseAction(exercise.id, !exercise.is_locked);
      router.refresh();
    });
  }

  function handleRemove() {
    startTransition(async () => {
      await removePrescriptionExerciseAction(exercise.id);
      router.refresh();
    });
  }

  function handleFindSubstitute() {
    setCandidateError(null);
    startTransition(async () => {
      const result = await findPrescriptionSubstituteAction(blockId, exercise.id);
      if (!('provider' in result)) {
        setCandidateError(result.error ?? 'No suitable substitute exercise was found.');
        return;
      }
      setCandidate(result);
    });
  }

  function handleAcceptSubstitute() {
    if (!candidate) return;
    startTransition(async () => {
      await replacePrescriptionExerciseAction(exercise.id, {
        provider: candidate.provider,
        externalId: candidate.externalId,
        exerciseName: candidate.exerciseName,
        sets: candidate.sets,
        reps: candidate.reps,
        repRangeLow: candidate.repRangeLow,
        repRangeHigh: candidate.repRangeHigh,
        timeSeconds: candidate.timeSeconds,
        restSeconds: candidate.restSeconds,
        tempo: candidate.tempo,
        holdDurationSeconds: candidate.holdDurationSeconds,
        selectionReasoning: candidate.selectionReasoning,
        substitutionReason: `Coach-requested substitute for ${exercise.exercise_name}.`,
      });
      setCandidate(null);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#1B3A2D]">
            {exercise.exercise_name}
            {exercise.is_coach_modified && (
              <span className="ml-2 rounded-full bg-[#1B3A2D]/[0.08] px-2 py-0.5 text-[10px] font-medium uppercase text-[#1B3A2D]">
                Substituted
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-[#6B7A72]">{prescriptionSummary(exercise)}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${
            exercise.confidence >= 0.6
              ? CONFIDENCE_STYLE.high
              : exercise.confidence >= 0.4
                ? CONFIDENCE_STYLE.moderate
                : CONFIDENCE_STYLE.low
          }`}
        >
          Confidence {Math.round(exercise.confidence * 100)}%
        </span>
      </div>

      <p className="mt-2 rounded-xl bg-white p-3 text-xs text-[#1B3A2D]">
        <span className="font-semibold">Why this exercise: </span>
        {exercise.selection_reasoning}
      </p>

      {editable && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={handleLock}
            disabled={isPending}
            className="flex items-center gap-1 rounded-full border border-[#1B3A2D]/15 bg-white px-3 py-1.5 text-xs font-medium text-[#1B3A2D] hover:border-[#1B3A2D]/40 disabled:opacity-50"
          >
            {exercise.is_locked ? (
              <Lock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Unlock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            )}
            {exercise.is_locked ? 'Locked' : 'Lock'}
          </button>
          <button
            type="button"
            onClick={handleFindSubstitute}
            disabled={isPending}
            className="flex items-center gap-1 rounded-full border border-[#1B3A2D]/15 bg-white px-3 py-1.5 text-xs font-medium text-[#1B3A2D] hover:border-[#1B3A2D]/40 disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            Find Substitute
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={isPending}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-[#6B7A72] hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            Remove
          </button>
        </div>
      )}

      {candidateError && <p className="mt-2 text-xs text-red-700">{candidateError}</p>}
      {candidate && (
        <div className="mt-3 rounded-xl border border-[#F5B700]/40 bg-[#F5B700]/[0.08] p-3">
          <p className="text-xs font-semibold text-[#854D0E]">
            Suggested substitute: {candidate.exerciseName}
          </p>
          <p className="mt-1 text-xs text-[#6B7A72]">{candidate.selectionReasoning}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleAcceptSubstitute}
              disabled={isPending}
              className="rounded-full bg-[#1B3A2D] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Use this exercise
            </button>
            <button
              type="button"
              onClick={() => setCandidate(null)}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-[#6B7A72] hover:bg-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfidencePanel({ snapshot }: { snapshot: PrescriptionSnapshotWithContent }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
          Prescription Confidence (coach only)
        </p>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${CONFIDENCE_STYLE[snapshot.confidence_level]}`}
        >
          {snapshot.confidence_level} · {Math.round(snapshot.confidence * 100)}%
        </span>
      </button>
      {expanded && (
        <ul className="mt-2 space-y-1.5">
          {snapshot.confidence_reasons.map((reason, i) => (
            <li key={i} className="text-xs text-[#6B7A72]">
              <span className="font-medium text-[#1B3A2D]">{reason.label}.</span> {reason.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PrescriptionReviewPanel({
  snapshot,
  clientId,
  clientDisplayName,
}: {
  snapshot: PrescriptionSnapshotWithContent;
  clientId: string;
  clientDisplayName: string;
}) {
  const router = useRouter();
  const [templateName, setTemplateName] = useState(
    `${clientDisplayName} — ${new Date(snapshot.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} Prescription`
  );
  const [memberInstructions, setMemberInstructions] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const editable = snapshot.status === 'pending_coach_review';

  function handleRemoveBlock(blockId: string) {
    startTransition(async () => {
      await removePrescriptionBlockAction(blockId);
      router.refresh();
    });
  }

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approvePrescriptionAction({
        snapshotId: snapshot.id,
        templateName,
        memberInstructions: memberInstructions.trim() || null,
      });
      if ('error' in result) {
        setError(result.error);
        return;
      }
      router.push(`/coach/clients/${clientId}/programs`);
    });
  }

  function handleReject() {
    if (!rejectReason.trim()) {
      setError('Give a reason so this run’s history stays useful.');
      return;
    }
    setError(null);
    startTransition(async () => {
      await rejectPrescriptionAction(snapshot.id, rejectReason.trim());
      router.refresh();
    });
  }

  if (snapshot.status === 'blocked') {
    return (
      <section className={`${CARD} p-6`}>
        <p className="text-sm font-semibold uppercase tracking-wider text-red-700">
          Declined to prescribe
        </p>
        <p className="mt-2 text-sm text-[#1B3A2D]">
          Reason: {snapshot.block_reason?.replace(/_/g, ' ')}
        </p>
        <p className="mt-1 text-sm text-[#6B7A72]">
          Recommended instead: {snapshot.recommended_alternative?.replace(/_/g, ' ')}
        </p>
        {snapshot.constraints.length > 0 && (
          <div className="mt-4 space-y-2">
            {snapshot.constraints.map((c) => (
              <p
                key={c.id}
                className={`rounded-xl px-3 py-2 text-xs ${SEVERITY_STYLE[c.severity]}`}
              >
                {c.description}
              </p>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className={`${CARD} p-6`}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
            {snapshot.status === 'pending_coach_review'
              ? 'Awaiting Your Review'
              : snapshot.status === 'approved'
                ? 'Approved'
                : 'Rejected'}
          </p>
          <span className="text-xs text-[#6B7A72]">
            Generated {new Date(snapshot.generated_at).toLocaleString('en-US')}
          </span>
        </div>
        {snapshot.strategy_summary && (
          <p className="mt-2 text-sm text-[#1B3A2D]">{snapshot.strategy_summary}</p>
        )}
        {snapshot.rejection_reason && (
          <p className="mt-2 text-sm text-red-700">Rejected: {snapshot.rejection_reason}</p>
        )}

        <div className="mt-4">
          <ConfidencePanel snapshot={snapshot} />
        </div>

        {snapshot.constraints.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {snapshot.constraints.map((c) => (
              <span
                key={c.id}
                className={`rounded-full px-3 py-1 text-xs ${SEVERITY_STYLE[c.severity]}`}
              >
                {c.description}
              </span>
            ))}
          </div>
        )}
      </section>

      {snapshot.blocks.map((block) => (
        <section key={block.id} className={`${CARD} p-5`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#1B3A2D]">
                {MOVEMENT_SESSION_SECTION_LABEL[block.block_type]}
              </p>
              <p className="mt-0.5 text-xs text-[#6B7A72]">{block.primary_objective}</p>
            </div>
            {editable && (
              <button
                type="button"
                onClick={() => handleRemoveBlock(block.id)}
                disabled={isPending}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[#6B7A72] hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              >
                Remove block
              </button>
            )}
          </div>
          <p className="mt-2 rounded-xl bg-[#EFF6F1] p-3 text-xs text-[#1B3A2D]">
            {block.block_reasoning}
          </p>

          <div className="mt-3 space-y-2">
            {block.exercises.map((exercise) => (
              <ExerciseRow
                key={exercise.id}
                exercise={exercise}
                blockId={block.id}
                editable={editable}
              />
            ))}
            {block.exercises.length === 0 && (
              <p className="text-xs text-[#6B7A72]">
                No matching exercises were found in the catalog for this block — add one manually
                from the Program Builder after approving.
              </p>
            )}
          </div>
        </section>
      ))}

      {editable && (
        <section className={`${CARD} p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
            Approve &amp; Assign
          </p>
          <p className="mt-2 text-sm text-[#6B7A72]">
            Approving creates a real Program Template and assigns it to {clientDisplayName} as a
            published workout for today.
          </p>

          <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-[#6B7A72]">
            Template name
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className={INPUT}
            />
          </label>
          <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-[#6B7A72]">
            Member instructions (optional)
            <textarea
              value={memberInstructions}
              onChange={(e) => setMemberInstructions(e.target.value)}
              rows={2}
              className={INPUT}
            />
          </label>

          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleApprove}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-full bg-[#1B3A2D] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Approve &amp; Assign Today
            </button>
            <button
              type="button"
              onClick={() => setShowReject((v) => !v)}
              className="flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium text-[#6B7A72] hover:bg-red-50 hover:text-red-700"
            >
              <XCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Reject
            </button>
          </div>

          {showReject && (
            <div className="mt-3">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Why is this prescription being rejected?"
                rows={2}
                className={INPUT}
              />
              <button
                type="button"
                onClick={handleReject}
                disabled={isPending}
                className="mt-2 rounded-full border border-red-300 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Confirm Reject
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
