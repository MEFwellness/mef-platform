/**
 * Member Experience — "What We're Noticing" (Prompt 6). Same card
 * convention as Food Lens's "Patterns Worth Noticing" section
 * (app/food-lens/report/page.tsx) — plain, non-diagnostic wellness-
 * coaching language only. Renders nothing when the member has no active
 * findings yet, same "never show a broken-looking empty state" posture as
 * the rest of this dashboard.
 *
 * Navigation fix: this used to open a bottom sheet layered over Home
 * (components/dashboard/NoticingSheet.tsx) with the full findings list,
 * "Areas Worth Paying Attention To," and "Recommended For You" — a full
 * read, not a quick peek, and the sheet had a real stacking-context bug
 * (see NoticingSheet.tsx's own doc). This is a full read like the case
 * view, so it now gets its own page (/noticing, app/noticing/page.tsx),
 * same `href`-based navigation RootMapCard.tsx already uses — the tile
 * itself no longer renders any of the content, only decides whether the
 * card should appear at all.
 */

import { getMyNoticingView } from '@/app/actions/memberNoticing';
import { NoticingTile } from './NoticingTile';

export async function WhatWereNoticingCard() {
  const view = await getMyNoticingView();
  if (!view) return null;

  const hasAnything =
    view.noticing.length > 0 ||
    view.improving.length > 0 ||
    view.worthAttention.length > 0 ||
    view.recommendedInvestigation !== null;
  if (!hasAnything) return null;

  return (
    <NoticingTile
      imageSrc="/images/card-noticing.jpg"
      kicker="What We're Noticing"
      headline="Four Doctors Assessment"
      href="/noticing"
    />
  );
}
