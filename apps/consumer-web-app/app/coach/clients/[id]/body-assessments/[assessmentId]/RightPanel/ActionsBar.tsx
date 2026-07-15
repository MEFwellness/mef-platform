'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FileDown, Save } from 'lucide-react';
import { addCoachReviewAction } from '@/app/actions/body-assessment';

/** Both buttons append a new body_assessment_coach_reviews row (same append-only audit discipline the table already has) rather than adding a duplicate free-text form — Coach Notes above is the freeform surface; this is just the review checkpoint. */
export function ActionsBar({ assessmentId, clientId }: { assessmentId: string; clientId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<'draft' | 'finalize' | null>(null);
  const [confirmed, setConfirmed] = useState<'draft' | 'finalize' | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(kind: 'draft' | 'finalize') {
    setError(null);
    setConfirmed(null);
    setPendingAction(kind);
    startTransition(async () => {
      const result = await addCoachReviewAction({
        assessmentId,
        clientId,
        reviewStatus: kind === 'finalize' ? 'completed' : 'in_review',
        reassessmentMarkedComplete: kind === 'finalize',
      });
      setPendingAction(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirmed(kind);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => run('draft')}
        disabled={isPending}
        className="flex items-center justify-center gap-2 rounded-full border border-[#1B3A2D]/15 px-5 py-2.5 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#1B3A2D]/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Save className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        {pendingAction === 'draft' ? 'Saving…' : 'Save Draft'}
      </button>
      <button
        type="button"
        onClick={() => run('finalize')}
        disabled={isPending}
        className="flex items-center justify-center gap-2 rounded-full bg-[#1B3A2D] px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        {pendingAction === 'finalize' ? 'Finalizing…' : 'Finalize Review'}
      </button>
      <a
        href={`/coach/clients/${clientId}/body-assessments/${assessmentId}/report`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-full border border-[#1B3A2D]/15 px-5 py-2.5 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#1B3A2D]/[0.04]"
      >
        <FileDown className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        Generate Client Report
      </a>

      {error && <p className="text-center text-xs text-red-700">{error}</p>}
      {confirmed && (
        <p className="mef-pop-in text-center text-xs font-medium text-emerald-700">
          {confirmed === 'finalize' ? 'Review finalized.' : 'Draft saved.'}
        </p>
      )}
    </div>
  );
}
