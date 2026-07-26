/**
 * Recommendation Engine — dashboard entry point (Prompt 11). Self-fetching
 * async server component, same shape as WhatWereNoticingCard.tsx and
 * RootMapCard.tsx: its own data (getMyRecommendations) streams in
 * independently via the Suspense boundary the dashboard wraps it in.
 * Renders nothing when there's nothing active — never a broken-looking
 * empty state.
 *
 * Home dashboard redesign: now an image-backed carousel tile
 * (components/dashboard/NoticingTile.tsx) instead of a stacked white
 * card. The whole tile is still the "See all recommendations" tap
 * target, navigating straight to /recommendations exactly as before —
 * that page already lists every active recommendation this card used to
 * preview inline, so nothing is lost, just reached with one tap instead
 * of shown up front. Headline is a <=6-word derivation
 * (lib/dashboard/toHeadline.ts) of the top active recommendation's own
 * title; never new wording.
 */

import { getMyRecommendations } from '@/app/actions/recommendations';
import { NoticingTile } from './NoticingTile';
import { toHeadline } from '@/lib/dashboard/toHeadline';

export async function RecommendationsCard() {
  const recommendations = await getMyRecommendations();
  const active = recommendations.filter((r) => r.status === 'shown');
  if (active.length === 0) return null;

  return (
    <NoticingTile
      imageSrc="/images/card-habit.jpg"
      kicker="Recommended For You"
      headline={toHeadline(active[0]!.title)}
      href="/recommendations"
    />
  );
}
