/**
 * Member Root Map — dashboard entry point (Prompt 10). Self-fetching async
 * server component, same shape as WhatWereNoticingCard: its own data
 * (getMyRootMap) streams in independently via the Suspense boundary the
 * dashboard already wraps it in, rather than blocking the rest of the page.
 *
 * Home dashboard redesign: now an image-backed carousel tile
 * (components/dashboard/NoticingTile.tsx) instead of a stacked white
 * card. The whole tile is still the "See your full Root Map" tap target,
 * navigating straight to /root-map exactly as before — that page already
 * has everything the old card's expanded state would have shown, so a
 * direct link (not a sheet) is the right fit here. The card-face headline
 * is a fixed, hand-written short label for this card, not derived from
 * the router's own dynamic memberMessage — that full sentence is still
 * exactly what /root-map itself shows.
 */

import { getMyRootMap } from '@/app/actions/rootMap';
import { NoticingTile } from './dashboard/NoticingTile';

export async function RootMapCard() {
  const rootMap = await getMyRootMap();
  if (!rootMap) return null;

  return (
    <NoticingTile
      imageSrc="/images/card-rootmap.jpg"
      kicker="Your Root Map"
      headline="An area worth exploring"
      href="/root-map"
    />
  );
}
