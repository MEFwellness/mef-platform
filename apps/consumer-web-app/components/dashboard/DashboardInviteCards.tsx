import { AssignedQuestionnairePriorityCard } from './AssignedQuestionnairePriorityCard';
import { FreeArcInviteCard } from './FreeArcInviteCard';
import { getMyRootPopupDismissalAction } from '@/app/actions/rootPopupMessages';
import { questionnaireAssignedPopupMessageKey } from '@/lib/root-popup-messages/data';
import { pickNextFreeArcCard, freeArcPopupMessageKey } from '@/lib/root-popup-messages/freeArc';
import type { CatalogCard, QuestionnaireCatalog } from '@/app/actions/questionnaireCatalog';

/**
 * FIX 5 (2026-08-03) — the zone above app/dashboard/page.tsx's
 * `!hasCheckins` gate, covering both cases that need to be reachable
 * regardless of check-in history: a coach-assigned questionnaire
 * (pre-existing) and the next unstarted free-arc conversation (see
 * lib/root-popup-messages/freeArc.ts). Async so each card can read its
 * own pop-up dismissal state (member_root_popup_dismissals, via
 * getMyRootPopupDismissalAction) to decide the gold "Waiting on you"
 * badge — the exact same messageKey the Root pop-up chain itself uses, so
 * a card can only ever be badged after its own pop-up was actually shown
 * and snoozed, never guessed. Renders nothing at all when there is
 * nothing to draw, same "silently disappear" posture as every other
 * conditional dashboard zone.
 *
 * IT IS TWO COMPONENTS NOW, BECAUSE THEY ARE TWO DIFFERENT KINDS OF
 * THING (Home final structural pass, 2026-09-13). It used to render both
 * in one block, below the program card, which put a questionnaire a
 * coach assigned BY NAME further down Home than anything else that was
 * waiting on her, and left "Assigned to You" as a section that did not
 * contain every assigned thing. So:
 *
 *   `AssignedInviteCards` is what a coach asked her for and has not had
 *   back. It renders inside the Assigned to You section, with the
 *   deep-dives and the intakes it belongs beside.
 *
 *   `FreeArcInviteCards` is an INVITATION rather than an assignment: the
 *   next unstarted conversation, which nobody is waiting on. It keeps
 *   the place the pair used to share, below the program.
 *
 * WHO SEES WHAT DID NOT CHANGE. Both halves are drawn on exactly the
 * conditions the single component drew them on, both are still behind
 * `home.invite_cards` at the call site, each still reads its own
 * dismissal row, and `assignedInviteCandidates` below is the one
 * definition of which cards count as assigned so the section's heading
 * and its contents can never disagree.
 *
 * Coach-Assign-Only Gating task (2026-08-04): `bodyAssessmentCard` is
 * Body Assessment's own assignment card (getMyBodyAssessmentAssignmentCard,
 * questionnaireCatalog.ts), fetched and passed in separately by
 * app/dashboard/page.tsx rather than folded into `catalog` itself — the
 * Questionnaires catalog has always deliberately excluded Body Assessment
 * (its own dedicated system), and that stays true; only the assignment
 * card and the Root pop-up (see rootPopupMessages.ts's identical merge)
 * need to treat it the same as any other coach assignment.
 */
export function assignedInviteCandidates(
  catalog: QuestionnaireCatalog,
  bodyAssessmentCard: CatalogCard | null = null
): CatalogCard[] {
  return [
    ...catalog.assigned.filter((card) => card.assignmentId && card.primaryHref),
    ...(bodyAssessmentCard?.assignmentId && bodyAssessmentCard.primaryHref
      ? [bodyAssessmentCard]
      : []),
  ];
}

/**
 * The coach-assigned questionnaires, for the Assigned to You section.
 *
 * Takes the already-computed candidate list rather than the catalog,
 * because the section's own heading is drawn from the same list: the
 * caller has to know whether there are any before it draws a name over
 * them, and counting them twice is how a heading ends up over nothing.
 */
export async function AssignedInviteCards({ cards }: { cards: CatalogCard[] }) {
  if (cards.length === 0) return null;

  const dismissals = await Promise.all(
    cards.map((card) =>
      getMyRootPopupDismissalAction(questionnaireAssignedPopupMessageKey(card.assignmentId!))
    )
  );

  const highPriorityAssignmentIds = new Set(
    cards
      .filter((_, index) => dismissals[index]?.status === 'snoozed')
      .map((card) => card.assignmentId!)
  );

  return (
    <AssignedQuestionnairePriorityCard
      cards={cards}
      highPriorityAssignmentIds={highPriorityAssignmentIds}
    />
  );
}

/**
 * The next unstarted free-arc conversation. An offer, not an assignment,
 * which is why it is not in the Assigned to You section.
 */
export async function FreeArcInviteCards({ catalog }: { catalog: QuestionnaireCatalog }) {
  const freeArcCard = pickNextFreeArcCard(catalog);
  if (!freeArcCard) return null;

  const dismissal = await getMyRootPopupDismissalAction(freeArcPopupMessageKey(freeArcCard.key));

  /* `mef-home-section` is Home's own rhythm (app/globals.css); this
     component renders on Home and nowhere else, so it takes the same gap
     every other section on that page takes rather than a `pt-6` of its
     own. */
  return (
    <div className="mef-home-section">
      <FreeArcInviteCard card={freeArcCard} highPriority={dismissal?.status === 'snoozed'} />
    </div>
  );
}
