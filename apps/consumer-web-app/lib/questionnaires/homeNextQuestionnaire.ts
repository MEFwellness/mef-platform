/**
 * THE ONE QUESTIONNAIRE HOME'S CARD NAMES, chosen from rows Home has
 * already read.
 *
 * Home's Questionnaires card is a summary, and a summary that only ever
 * says "8 of 13 complete" makes a member open a whole library to find the
 * one thing she had already started. So the card carries a single quiet
 * line naming that thing.
 *
 * NO NEW READ, AND NO NEW STATUS RULE. Everything below is decided from
 * the `QuestionnaireCatalog` the day frame already awaits
 * (`homeQuestionnaireCatalog`, request-memoized, and the same object the
 * Questionnaires destination itself renders from), and the destination it
 * hands back is `catalogCardPrimaryAction`'s, which is the exact link the
 * catalog page draws for that same card.
 *
 * IT NEVER SAYS A SECOND TIME WHAT "ASSIGNED TO YOU" IS ALREADY SAYING.
 * A coach-assigned questionnaire has a full deep-green card of its own
 * higher up Home, with its own button. Naming it again down here would be
 * the same request twice on one screen, and the quieter of the two would
 * be the one competing with the Priority Card. So anything already drawn
 * in that section is excluded by key, and when everything open is already
 * up there this card carries no second line at all.
 *
 * THE ORDER IS "WHAT SHE LEFT OPEN" BEFORE "WHAT SHE WAS GIVEN".
 * A half-finished questionnaire is her own unfinished sentence and costs
 * her the least to close; an untouched one is a fresh start. Within each
 * group the catalog's own order is kept, so this can never disagree with
 * the order she reads on the library screen.
 */

import type { CatalogCard, QuestionnaireCatalog } from '@/app/actions/questionnaireCatalog';
import { catalogCardPrimaryAction } from './catalogCardAction';

export type HomeNextQuestionnaire = {
  key: string;
  title: string;
  href: string;
  /** True when she has an open draft: the line says "Pick up where you left off" rather than offering a start. */
  inProgress: boolean;
};

function isOpen(card: CatalogCard): boolean {
  return !card.flags.locked && !card.flags.comingSoon;
}

export function pickHomeNextQuestionnaire(
  catalog: QuestionnaireCatalog,
  alreadyShownKeys: ReadonlySet<string> = new Set()
): HomeNextQuestionnaire | null {
  const eligible = [
    ...catalog.assigned,
    ...catalog.available,
    ...catalog.premium,
  ].filter((card) => isOpen(card) && !alreadyShownKeys.has(card.key));

  /* An open draft first, wherever it sits. `inProgress` is the registry's
     own flag for "started and never finished" (a draft on top of a
     completed one is `retakeInProgress` instead, which is not an unclosed
     first pass and is not surfaced here). */
  const started = eligible.find((card) => card.flags.inProgress);
  const chosen = started ?? eligible.find((card) => card.section === 'assigned') ?? null;
  if (!chosen) return null;

  const action = catalogCardPrimaryAction(chosen);
  if (!action) return null;

  return {
    key: chosen.key,
    title: chosen.title,
    href: action.href,
    inProgress: chosen.flags.inProgress,
  };
}
