'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateCoachReview } from '@/app/actions/safety';
import type { SafetyReviewStatus } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const STATUS_OPTIONS: { value: SafetyReviewStatus; label: string }[] = [
  { value: 'reviewing', label: 'Mark as reviewing' },
  { value: 'approved_for_limited_coaching', label: 'Approve limited coaching' },
  { value: 'referred_out', label: 'Document referral' },
  { value: 'urgent_follow_up', label: 'Mark urgent follow-up' },
  { value: 'closed', label: 'Close case' },
];

type Props = {
  reviewId: string;
  currentStatus: SafetyReviewStatus;
  currentNotes: string | null;
};

export function ReviewCaseControls({ reviewId, currentStatus, currentNotes }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<SafetyReviewStatus>(currentStatus);
  const [notes, setNotes] = useState(currentNotes ?? '');
  const [resolution, setResolution] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateCoachReview(reviewId, {
        status,
        coachNotes: notes,
        ...(resolution ? { resolution } : {}),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className={`${CARD} p-6`}>
      <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
        Coach Controls
      </p>
      <p className="mt-1 text-xs text-[#6B7A72]">
        A coach action here can never unlock diagnosis, medication advice, or unsafe guidance — only
        the review workflow status.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatus(option.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                status === option.value
                  ? 'bg-[#1B3A2D] text-white'
                  : 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D] hover:bg-[#1B3A2D]/[0.12]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="coach-review-notes" className="sr-only">
            Coach notes
          </label>
          <textarea
            id="coach-review-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Add notes about this case…"
            rows={3}
            className="w-full resize-none rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-4 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
        </div>

        {(status === 'referred_out' || status === 'closed') && (
          <div>
            <label htmlFor="coach-review-resolution" className="sr-only">
              Resolution
            </label>
            <input
              id="coach-review-resolution"
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              placeholder="Brief resolution summary…"
              className="w-full rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
            />
          </div>
        )}

        {error && <p className="text-sm text-red-700">{error}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-[#1B3A2D] px-5 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  );
}
