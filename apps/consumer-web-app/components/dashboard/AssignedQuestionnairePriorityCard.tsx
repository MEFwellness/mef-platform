import Link from 'next/link';
import type { Route } from 'next';
import { Sparkles, ArrowRight } from 'lucide-react';
import type { CatalogCard } from '@/app/actions/questionnaireCatalog';

/**
 * Assignment-Gated Questionnaires task — the "top priority" placement for
 * a coach-assigned registry questionnaire. Reads catalog.assigned (already
 * batched by getMyQuestionnaireCatalog(), no new query), so it renders
 * exactly the questionnaires currently in the Assigned catalog section:
 * present the moment a coach assigns one, gone the moment it's completed
 * (assessment_assignments.status flips to 'completed' via migration 144's
 * trigger, which drops the row out of facts.pendingAssignment and this
 * array on the next page load).
 *
 * Deliberately its own dark forest-green/gold treatment — this app's
 * established "a real message from Root/your coach" chrome (matching
 * RootMessagePopupClient's pop-up chain) — rather than the app's usual
 * white card, so it visually outranks every ordinary section below it,
 * per the task's "draw the eye" requirement. Renders nothing at all when
 * there is nothing assigned, same "silently disappear" posture as every
 * other conditional dashboard zone.
 *
 * FIX 5 (2026-08-03): gained the gold "Waiting on you" badge once a
 * member has tapped "Maybe later" on this exact card's own pop-up
 * (RootMessagePopupClient's questionnaire_assigned branch) — same badge,
 * same precedent as CvsFollowUpCards.tsx's HighPriorityBadge, computed
 * from the same `member_root_popup_dismissals` row the pop-up itself
 * reads (see components/dashboard/DashboardInviteCards.tsx, the new
 * caller that fetches each card's dismissal state).
 */
function HighPriorityBadge() {
  return (
    <span className="relative mt-3 inline-flex w-fit shrink-0 items-center rounded-full bg-[#C4A050]/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#F5D98A]">
      Waiting on you
    </span>
  );
}

export function AssignedQuestionnairePriorityCard({
  cards,
  highPriorityAssignmentIds = new Set(),
}: {
  cards: CatalogCard[];
  highPriorityAssignmentIds?: ReadonlySet<string>;
}) {
  if (cards.length === 0) return null;

  return (
    <div className="space-y-3">
      {cards.map((card) => {
        const ctaLabel = card.flags.inProgress ? 'Continue' : 'Start now';
        return (
          <div
            key={card.key}
            className="mef-animate-in relative overflow-hidden rounded-[28px] bg-[#1B3A2D] p-6 text-[#F5F0E4] shadow-[0_20px_50px_-16px_rgba(27,58,45,0.5)]"
          >
            <div
              className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#C4A050]/16 blur-3xl"
              aria-hidden="true"
            />
            <div className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#C4A050]">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Assigned by your coach
            </div>
            <h2 className="relative mt-3 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#F5F0E4]">
              {card.title}
            </h2>
            {card.coachAssignmentReason && (
              <p className="relative mt-2 text-sm leading-relaxed text-[#F5F0E4]/75">
                {card.coachAssignmentReason}
              </p>
            )}
            {card.assignmentId && highPriorityAssignmentIds.has(card.assignmentId) && (
              <HighPriorityBadge />
            )}
            {card.primaryHref && (
              <Link
                href={card.primaryHref as Route}
                className="mef-press relative mt-5 inline-flex items-center gap-1.5 rounded-2xl bg-[#F5F0E4] px-5 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95"
              >
                {ctaLabel}
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
