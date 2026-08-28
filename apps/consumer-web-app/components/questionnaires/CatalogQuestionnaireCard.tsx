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
import { Clock3, Sparkles, UserRound, CalendarClock } from 'lucide-react';
import type { CatalogCard } from '@/app/actions/questionnaireCatalog';
import { formatAssessmentDate } from '@/lib/assessments/presentation';
import { Card } from '@/components/layout';
import { LockedCardButton } from '@/components/locked/LockedCardButton';
import { CoachLockBadge } from '@/components/locked/CoachLockBadge';
import {
  COACH_LOCK_NOTE_MESSAGE,
  MONTHLY_PLAN_LOCK_MESSAGE,
  PROGRAM_ENROLLMENT_LOCK_MESSAGE,
  PROGRAM_PHASE_LOCK_MESSAGE,
  PROGRAM_PLAN_LOCK_MESSAGE,
  PREREQUISITE_LOCK_MESSAGE,
} from '@/lib/locked-content/copy';
import { UNBUILT_PLACEHOLDER_LABEL, showUnbuiltPlaceholder } from '@/lib/naming/unbuiltPlaceholders';

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

/**
 * ONE LOCK, ONE TREATMENT (2026-08-27). A coach-assignment lock used to
 * get the dimmed + gold-corner-marker + tap-to-reveal card while a plan
 * lock got a "Locked" pill, an always-visible sentence and an inline
 * "View Membership" link. Two designs, and worse, two different sentences
 * about the same lock on one screen. Every lock now reads the same way:
 * dimmed card, gold marker, and one Root-voiced note on tap, with the
 * plan link living inside that note when the lock is one she can act on.
 * `isLocked` is what the card branches on.
 */
function CardBody({ card, action, isLocked }: { card: CatalogCard; action: ReturnType<typeof primaryAction>; isLocked: boolean }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-[family-name:var(--font-cormorant-garamond)] text-xl leading-snug text-[#1B3A2D]">
          {card.title}
        </h3>
        {card.section === 'premium' && !isLocked && (
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
        {card.flags.comingSoon && showUnbuiltPlaceholder() && (
          <span className="rounded-full bg-[#F3F6F4] px-3 py-1.5 font-semibold text-[#1B3A2D]/70">
            {UNBUILT_PLACEHOLDER_LABEL}
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

      {/* A draft on top of something she has already finished is a retake,
          and it says so. It never replaces the completed state of the card,
          which is what a bare "in progress" reading of the same draft used
          to do (2026-08-27). */}
      {card.flags.retakeInProgress && card.draftProgress && (
        <p className="mt-3 text-xs text-[#6B7A72]">
          Retake in progress, {card.draftProgress.answered} of {card.draftProgress.total} questions answered
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

      {!isLocked && (
        <div className="mt-5 space-y-2">
          {action && (
            <Link href={action.href as Route} className={PRIMARY_BUTTON}>
              {action.label}
            </Link>
          )}

          {card.section === 'completed' && card.flags.retakeAvailable && card.primaryHref && (
            <Link
              href={
                (card.flags.retakeInProgress
                  ? `${card.primaryHref}/take`
                  : card.primaryHref) as Route
              }
              className={`${SECONDARY_LINK} block text-center`}
            >
              {card.flags.retakeInProgress ? 'Resume retake' : 'Retake'}
            </Link>
          )}

        </div>
      )}
    </>
  );
}

/** Root's note for this card's lock. The card only ever knows the kind, so this is the one place the kind becomes a sentence. */
function noteForLock(card: CatalogCard): string {
  switch (card.flags.lockReasonKind) {
    case 'not_assigned':
      return COACH_LOCK_NOTE_MESSAGE;
    case 'membership':
      return card.flags.lockRequiredLevel === 'holistic_reset'
        ? PROGRAM_PLAN_LOCK_MESSAGE
        : MONTHLY_PLAN_LOCK_MESSAGE;
    case 'program_enrollment':
      return PROGRAM_ENROLLMENT_LOCK_MESSAGE;
    case 'program_phase':
      return PROGRAM_PHASE_LOCK_MESSAGE;
    case 'prerequisite':
      return PREREQUISITE_LOCK_MESSAGE;
    default:
      return COACH_LOCK_NOTE_MESSAGE;
  }
}

export function CatalogQuestionnaireCard({ card }: { card: CatalogCard }) {
  const action = primaryAction(card);
  const isLocked = card.flags.locked;

  if (isLocked) {
    return (
      <div className="relative">
        <LockedCardButton
          ariaLabel={`${card.title}, locked. Tap to hear from Root about it.`}
          analyticsFeature={card.key}
          message={noteForLock(card)}
          lockReason={card.flags.lockReasonKind ?? 'membership'}
          planHref={card.flags.lockReasonKind === 'membership' ? '/membership' : undefined}
        >
          <Card className="mef-animate-in opacity-55 grayscale-[0.4]">
            <CardBody card={card} action={action} isLocked />
          </Card>
        </LockedCardButton>
        <CoachLockBadge />
      </div>
    );
  }

  return (
    <Card className="mef-animate-in">
      <CardBody card={card} action={action} isLocked={false} />
    </Card>
  );
}
