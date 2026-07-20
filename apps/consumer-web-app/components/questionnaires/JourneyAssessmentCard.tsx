/**
 * One assessment card on the guided-journey Questionnaires page. Renders
 * from a JourneyCard (app/actions/questionnaireJourney.ts) — a shape
 * normalized across every registered assessment system, so this one
 * component covers every status (Available, In Progress, Completed,
 * Scheduled, Locked, Coach Assigned, Coming Soon) without knowing which
 * underlying system produced the card. `variant="hero"` is used once, for
 * the single Recommended Next card; `variant="compact"` for every other
 * section.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { Clock3, Lock, ShieldCheck, UserRound } from 'lucide-react';
import type { JourneyCard } from '@/app/actions/questionnaireJourney';
import { formatAssessmentDate } from '@/lib/assessments/presentation';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const PRIMARY_BUTTON =
  'block w-full rounded-2xl bg-[#1B3A2D] px-5 py-3 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]';
const SECONDARY_LINK = 'text-sm font-medium text-[#1B3A2D] hover:underline';

function primaryAction(card: JourneyCard): { label: string; href: string } | null {
  if (card.status === 'in_progress' && card.primaryHref) {
    return { label: 'Resume', href: `${card.primaryHref}/take` };
  }
  if (card.status === 'completed' && card.resultHref) {
    return { label: 'View Results', href: card.resultHref };
  }
  if ((card.status === 'available' || card.status === 'coach_assigned') && card.primaryHref) {
    return { label: 'Start', href: card.primaryHref };
  }
  return null;
}

export function JourneyAssessmentCard({
  card,
  variant = 'compact',
}: {
  card: JourneyCard;
  variant?: 'hero' | 'compact';
}) {
  const action = primaryAction(card);
  const isHero = variant === 'hero';

  return (
    <div className={`${CARD} mef-animate-in ${isHero ? 'p-7' : 'p-6'}`}>
      <div className="flex items-start justify-between gap-3">
        <h3
          className={`font-[family-name:var(--font-cormorant-garamond)] leading-snug text-[#1B3A2D] ${isHero ? 'text-2xl' : 'text-xl'}`}
        >
          {card.title}
        </h3>
        {card.status === 'coach_assigned' && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            <UserRound className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            Coach Assigned
          </span>
        )}
        {card.status === 'locked' && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#F3F6F4] px-3 py-1 text-xs font-semibold text-[#1B3A2D]/70">
            <Lock className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            Locked
          </span>
        )}
        {card.status === 'scheduled' && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#EFF6F1] px-3 py-1 text-xs font-semibold text-[#1B3A2D]">
            Scheduled
          </span>
        )}
        {card.status === 'coming_soon' && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#F3F6F4] px-3 py-1 text-xs font-semibold text-[#1B3A2D]/70">
            Coming Soon
          </span>
        )}
      </div>

      <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">{card.description}</p>

      {card.estimatedMinutes > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#1B3A2D]">
          <span className="flex items-center gap-1.5 rounded-full bg-[#F3F6F4] px-3 py-1.5">
            <Clock3 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            About {card.estimatedMinutes} min
          </span>
        </div>
      )}

      {card.status === 'in_progress' && card.draftProgress && (
        <p className="mt-3 text-xs text-[#6B7A72]">
          {card.draftProgress.answered} of {card.draftProgress.total} questions answered
        </p>
      )}

      {card.status === 'completed' && card.latestCompletedAt && (
        <p className="mt-3 text-xs text-[#6B7A72]">
          Last completed {formatAssessmentDate(card.latestCompletedAt)}
        </p>
      )}

      {card.status === 'coach_assigned' && card.coachAssignmentReason && (
        <p className="mt-3 text-xs text-[#6B7A72]">
          Your coach&apos;s note: {card.coachAssignmentReason}
        </p>
      )}

      {card.status === 'scheduled' && card.reassessmentDueAt && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-[#6B7A72]">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          Available {formatAssessmentDate(card.reassessmentDueAt)}
        </p>
      )}

      {card.status === 'locked' && card.lockMessage && (
        <p className="mt-3 text-xs text-[#6B7A72]">{card.lockMessage}</p>
      )}

      <div className="mt-5 space-y-2">
        {action && (
          <Link href={action.href as Route} className={PRIMARY_BUTTON}>
            {action.label}
          </Link>
        )}

        {card.status === 'completed' && card.primaryHref && (
          <Link href={card.primaryHref as Route} className={`${SECONDARY_LINK} block text-center`}>
            Retake
          </Link>
        )}

        {card.status === 'locked' && (
          <Link href={'/membership' as Route} className={`${SECONDARY_LINK} block text-center`}>
            View Membership
          </Link>
        )}
      </div>
    </div>
  );
}
