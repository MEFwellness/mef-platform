/**
 * WHERE A CATALOG CARD ACTUALLY GOES, decided once.
 *
 * This was `primaryAction` inside components/questionnaires/
 * CatalogQuestionnaireCard.tsx, and it stayed private for as long as the
 * catalog page was the only screen that drew one of these cards. Home's
 * Questionnaires card now surfaces the one questionnaire she is partway
 * through, and a second copy of "resume is not always at /take" is exactly
 * how two screens end up offering the same questionnaire two different
 * doors. So it lives here, and both callers read it.
 *
 * Types only from the action module: nothing here runs on the server and
 * nothing here is a query. It decides a string from a row that has already
 * been fetched.
 */

import type { CatalogCard } from '@/app/actions/questionnaireCatalog';

export type CatalogCardAction = { label: string; href: string };

export function catalogCardPrimaryAction(card: CatalogCard): CatalogCardAction | null {
  if (card.flags.comingSoon || card.flags.locked || !card.primaryHref) return null;

  // RESUME IS NOT ALWAYS AT `/take`. Every registry questionnaire's taker
  // is a child of its overview route, and the four coach-assign-only ones
  // have no child at all: their one route hands back the question she
  // stopped on. A card that knows where its own resume lives says so.
  if (card.flags.inProgress)
    return { label: 'Resume', href: card.resumeHref ?? `${card.primaryHref}/take` };

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
