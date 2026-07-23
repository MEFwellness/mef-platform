/**
 * Member Root Map — dashboard entry point (Prompt 10). Self-fetching async
 * server component, same shape as WhatWereNoticingCard: its own data
 * (getMyRootMap) streams in independently via the Suspense boundary the
 * dashboard already wraps it in, rather than blocking the rest of the page.
 */

import Link from 'next/link';
import { ChevronRight, Map as MapIcon } from 'lucide-react';
import { getMyRootMap } from '@/app/actions/rootMap';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export async function RootMapCard() {
  const rootMap = await getMyRootMap();
  if (!rootMap) return null;

  const needsAttention = rootMap.domains.filter(
    (d) => !d.isUninstrumented && d.priority === 'needs_attention_now'
  ).length;

  return (
    <Link
      href="/root-map"
      className={`${CARD} mef-animate-in group block p-7 transition hover:bg-[#FAFAF8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B3A2D]`}
    >
      <div className="flex items-center gap-2 text-[#6B7A72]">
        <MapIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Your Root Map</p>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[#1B3A2D]">{rootMap.routerOutcome.memberMessage}</p>
      {needsAttention > 0 && (
        <p className="mt-2 text-xs font-medium text-[#6B7A72]">
          {needsAttention} {needsAttention === 1 ? 'area' : 'areas'} worth a closer look
        </p>
      )}
      <div className="mt-4 flex items-center gap-1 text-sm font-medium text-[#1B3A2D] opacity-70 transition group-hover:opacity-100">
        See your full Root Map
        <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </div>
    </Link>
  );
}
