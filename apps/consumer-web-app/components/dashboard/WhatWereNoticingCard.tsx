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
 *
 * Headline fix: this was hardcoded to "Four Doctors Assessment" — a
 * single named assessment — even though `getMyNoticingView()` pulls from
 * ANY active, member-visible registry finding regardless of source
 * (onboarding baseline, body assessment, questionnaire category, food
 * lens pattern, wearable, primal pattern, unified assessment — see
 * `registry_entries_source_feature_check`), not specifically the Four
 * Doctors assessment. There was no dynamic selection logic to fix — it
 * was a flat string literal picking one source name out of many possible
 * ones. Replaced with a fixed, honest, source-agnostic phrase that
 * doesn't claim a specific origin, matching the sibling cards' own
 * headline voice (`RootMapCard`'s "An area worth exploring",
 * `CoachingMessageCard`'s "More context could help" — short, generic,
 * never naming an internal system).
 */

import { getMyNoticingView } from '@/app/actions/memberNoticing';
import { NoticingTile } from './NoticingTile';

export async function WhatWereNoticingCard() {
  const view = await getMyNoticingView();
  if (!view) return null;

  const hasAnything =
    view.noticing.length > 0 ||
    view.improving.length > 0 ||
    view.recommendedInvestigation !== null;
  if (!hasAnything) return null;

  return (
    <NoticingTile
      imageSrc="/images/card-noticing.jpg"
      kicker="What We're Noticing"
      headline="A few things stand out"
      href="/noticing"
    />
  );
}
