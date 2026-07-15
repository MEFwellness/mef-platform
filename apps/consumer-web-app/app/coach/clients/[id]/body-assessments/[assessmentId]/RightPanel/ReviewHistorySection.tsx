import { ClipboardCheck } from 'lucide-react';
import type { BodyAssessmentCoachReview, BodyAssessmentReviewStatus } from '@mef/shared-types-contracts';
import { EmptyState } from './EmptyState';

/**
 * Chronological list of every body_assessment_coach_reviews row for this
 * assessment — append-only, same discipline as coach_notes, but until now
 * only ever surfaced via coachReviews[0] (the latest). This closes that
 * gap: a coach can see the full review history (who, what status, when),
 * not just the most recent entry.
 */

const STATUS_TONE: Record<BodyAssessmentReviewStatus, string> = {
  in_review: 'bg-amber-50 text-amber-700',
  approved: 'bg-blue-50 text-blue-700',
  changes_requested: 'bg-red-50 text-red-700',
  completed: 'bg-emerald-50 text-emerald-700',
};

const STATUS_LABEL: Record<BodyAssessmentReviewStatus, string> = {
  in_review: 'In review',
  approved: 'Approved',
  changes_requested: 'Changes requested',
  completed: 'Completed',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ReviewHistorySection({
  reviews,
  coachNames = {},
}: {
  reviews: BodyAssessmentCoachReview[];
  /** coach_id -> display name. Falls back to "A coach" when a name isn't available. */
  coachNames?: Record<string, string>;
}) {
  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No reviews yet"
        description="Save a draft or finalize a review to start this assessment's review history."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {reviews.map((review) => (
        <li key={review.id} className="rounded-2xl bg-[#FAFAF8] p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-[#1B3A2D]">
              {coachNames[review.coach_id] ?? 'A coach'}
            </p>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_TONE[review.review_status]}`}>
              {STATUS_LABEL[review.review_status]}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-[#9AA79F]">{formatDateTime(review.created_at)}</p>
          {review.observations && (
            <p className="mt-2 text-xs leading-relaxed text-[#6B7A72]">
              <span className="font-medium text-[#1B3A2D]">Observations: </span>
              {review.observations}
            </p>
          )}
          {review.recommendations && (
            <p className="mt-1 text-xs leading-relaxed text-[#6B7A72]">
              <span className="font-medium text-[#1B3A2D]">Recommendations: </span>
              {review.recommendations}
            </p>
          )}
          {(review.findings_approved || review.reassessment_marked_complete) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {review.findings_approved && (
                <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2 py-0.5 text-[10px] font-medium text-[#1B3A2D]">
                  Findings approved
                </span>
              )}
              {review.reassessment_marked_complete && (
                <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2 py-0.5 text-[10px] font-medium text-[#1B3A2D]">
                  Reassessment marked complete
                </span>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
