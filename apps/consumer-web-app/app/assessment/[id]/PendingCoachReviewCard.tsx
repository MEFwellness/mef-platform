import { Clock } from 'lucide-react';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/**
 * The only thing a member sees immediately after submitting — deliberately
 * contains no AI-derived content (no findings, no confidence, no analysis
 * status jargon). What the AI pipeline produces behind the scenes stays
 * coach-only (RLS-enforced, see migration 39) until the coach explicitly
 * publishes a report.
 */
export function PendingCoachReviewCard({ typeLabel }: { typeLabel: string }) {
  return (
    <section className={`${CARD} mef-animate-in p-8 text-center`}>
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F5B700]/15 text-[#854D0E]">
        <Clock className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <h2 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
        Your assessment has been received
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[#6B7A72]">
        Your {typeLabel.toLowerCase()} assessment is now under review by your coach. They&apos;re
        putting together a personalized report with their observations and recommendations — we&apos;ll
        let you know the moment it&apos;s ready.
      </p>
      <div className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-[#FAFAF8] px-4 py-1.5 text-xs font-medium text-[#6B7A72]">
        <span className="mef-pulse-dot h-1.5 w-1.5 rounded-full bg-[#F5B700]" aria-hidden="true" />
        Pending coach review
      </div>
    </section>
  );
}
