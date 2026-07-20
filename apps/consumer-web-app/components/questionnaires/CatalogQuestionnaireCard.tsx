/**
 * One assessment card on the Questionnaires catalog page. Renders from a
 * CatalogCard (app/actions/questionnaireCatalog.ts) — a shape normalized
 * across every registered assessment system, so this one component covers
 * every section (Assigned, Completed, Premium, Available) and every flag
 * (locked, scheduled, reassessment due, coming soon, in progress) without
 * knowing which underlying system produced the card.
 *
 * Locked/scheduled/reassessment-due/coming-soon are rendered as badges
 * layered onto whichever section the card is already in — never as a
 * reason to move the card somewhere else or hide its content.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { Clock3, Lock, Sparkles, UserRound, CalendarClock } from 'lucide-react';
import type { CatalogCard } from '@/app/actions/questionnaireCatalog';
import { formatAssessmentDate } from '@/lib/assessments/presentation';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const PRIMARY_BUTTON =
  'block w-full rounded-2xl bg-[#1B3A2D] px-5 py-3 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]';
const SECONDARY_LINK = 'text-sm font-medium text-[#1B3A2D] hover:underline';

function primaryAction(card: CatalogCard): { label: string; href: string } | null {
  if (card.flags.comingSoon || card.flags.locked || !card.primaryHref) return null;

  if (card.flags.inProgress) return { label: 'Resume', href: `${card.primaryHref}/take` };

  if (card.section === 'completed') {
    return card.resultHref ? { label: 'View Results', href: card.resultHref } : null;
  }

  // Not yet due — nothing to start until the schedule fires.
  if (card.flags.scheduledAt && !card.flags.reassessmentDueAt) return null;

  return {
    label: card.flags.reassessmentDueAt ? 'Start Reassessment' : 'Start',
    href: card.primaryHref,
  };
}

export function CatalogQuestionnaireCard({ card }: { card: CatalogCard }) {
  const action = primaryAction(card);

  return (
    <div className={`${CARD} mef-animate-in p-6`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-[family-name:var(--font-cormorant-garamond)] text-xl leading-snug text-[#1B3A2D]">
          {card.title}
        </h3>
        {card.section === 'premium' && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#C4A050]/15 px-3 py-1 text-xs font-semibold text-[#8A6D2F]">
            <Sparkles className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            Premium
          </span>
        )}
        {card.section === 'assigned' && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            <UserRound className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            Coach Assigned
          </span>
        )}
      </div>

      <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">{card.description}</p>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#1B3A2D]">
        {card.estimatedMinutes > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-[#F3F6F4] px-3 py-1.5">
            <Clock3 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            About {card.estimatedMinutes} min
          </span>
        )}
        {card.flags.comingSoon && (
          <span className="rounded-full bg-[#F3F6F4] px-3 py-1.5 font-semibold text-[#1B3A2D]/70">
            Coming Soon
          </span>
        )}
        {card.flags.locked && (
          <span className="flex items-center gap-1.5 rounded-full bg-[#F3F6F4] px-3 py-1.5 font-semibold text-[#1B3A2D]/70">
            <Lock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            Locked
          </span>
        )}
        {card.flags.reassessmentDueAt && (
          <span className="rounded-full bg-[#C4A050]/15 px-3 py-1.5 font-semibold text-[#8A6D2F]">
            Reassessment due
          </span>
        )}
        {card.flags.scheduledAt && !card.flags.reassessmentDueAt && (
          <span className="flex items-center gap-1.5 rounded-full bg-[#EFF6F1] px-3 py-1.5 font-semibold text-[#1B3A2D]">
            <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            Scheduled
          </span>
        )}
      </div>

      {card.flags.inProgress && card.draftProgress && (
        <p className="mt-3 text-xs text-[#6B7A72]">
          {card.draftProgress.answered} of {card.draftProgress.total} questions answered
        </p>
      )}

      {card.section === 'completed' && card.latestCompletedAt && (
        <p className="mt-3 text-xs text-[#6B7A72]">
          Last completed {formatAssessmentDate(card.latestCompletedAt)}
        </p>
      )}

      {card.section === 'assigned' && card.coachAssignmentReason && (
        <p className="mt-3 text-xs text-[#6B7A72]">
          Your coach&apos;s note: {card.coachAssignmentReason}
        </p>
      )}

      {card.flags.scheduledAt && !card.flags.reassessmentDueAt && (
        <p className="mt-3 text-xs text-[#6B7A72]">
          Next available {formatAssessmentDate(card.flags.scheduledAt)}
        </p>
      )}

      {card.flags.locked && card.flags.lockMessage && (
        <p className="mt-3 text-xs text-[#6B7A72]">{card.flags.lockMessage}</p>
      )}

      <div className="mt-5 space-y-2">
        {action && (
          <Link href={action.href as Route} className={PRIMARY_BUTTON}>
            {action.label}
          </Link>
        )}

        {card.section === 'completed' && card.flags.retakeAvailable && card.primaryHref && (
          <Link href={card.primaryHref as Route} className={`${SECONDARY_LINK} block text-center`}>
            Retake
          </Link>
        )}

        {card.flags.locked && card.section === 'premium' && (
          <Link href={'/membership' as Route} className={`${SECONDARY_LINK} block text-center`}>
            View Membership
          </Link>
        )}
      </div>
    </div>
  );
}
