import { AssignedQuestionnairePriorityCard } from './AssignedQuestionnairePriorityCard';
import { FreeArcInviteCard } from './FreeArcInviteCard';
import { getMyRootPopupDismissalAction } from '@/app/actions/rootPopupMessages';
import { questionnaireAssignedPopupMessageKey } from '@/lib/root-popup-messages/data';
import { pickNextFreeArcCard, freeArcPopupMessageKey } from '@/lib/root-popup-messages/freeArc';
import type { QuestionnaireCatalog } from '@/app/actions/questionnaireCatalog';

/**
 * FIX 5 (2026-08-03) — the top-priority zone above app/dashboard/page.tsx's
 * `!hasCheckins` gate, now covering both cases that need to be reachable
 * regardless of check-in history: a coach-assigned questionnaire
 * (pre-existing) and the next unstarted free-arc conversation (new, see
 * lib/root-popup-messages/freeArc.ts). Async so it can read each card's
 * own pop-up dismissal state (member_root_popup_dismissals, via
 * getMyRootPopupDismissalAction) to decide the gold "Waiting on you"
 * badge — the exact same messageKey the Root pop-up chain itself uses, so
 * a card can only ever be badged after its own pop-up was actually shown
 * and snoozed, never guessed. Renders nothing at all when there is
 * neither an assignment nor a free-arc conversation left, same "silently
 * disappear" posture as every other conditional dashboard zone.
 */
export async function DashboardInviteCards({ catalog }: { catalog: QuestionnaireCatalog }) {
  const assignedCandidates = catalog.assigned.filter((card) => card.assignmentId && card.primaryHref);
  const freeArcCard = pickNextFreeArcCard(catalog);

  if (assignedCandidates.length === 0 && !freeArcCard) return null;

  const [assignedDismissals, freeArcDismissal] = await Promise.all([
    Promise.all(
      assignedCandidates.map((card) =>
        getMyRootPopupDismissalAction(questionnaireAssignedPopupMessageKey(card.assignmentId!))
      )
    ),
    freeArcCard
      ? getMyRootPopupDismissalAction(freeArcPopupMessageKey(freeArcCard.key))
      : Promise.resolve(null),
  ]);

  const highPriorityAssignmentIds = new Set(
    assignedCandidates
      .filter((_, index) => assignedDismissals[index]?.status === 'snoozed')
      .map((card) => card.assignmentId!)
  );

  return (
    <div className="space-y-3 pt-6">
      <AssignedQuestionnairePriorityCard
        cards={assignedCandidates}
        highPriorityAssignmentIds={highPriorityAssignmentIds}
      />
      {freeArcCard && (
        <FreeArcInviteCard card={freeArcCard} highPriority={freeArcDismissal?.status === 'snoozed'} />
      )}
    </div>
  );
}
