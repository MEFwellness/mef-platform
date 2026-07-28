'use client';

/**
 * Home dashboard — Quick Actions zone. Replaces the horizontal scrolling
 * pill carousel (former QuickActionsCarousel.tsx) with a static grid: any
 * action past the "fold" of a scroll row was effectively undiscoverable.
 * Fixed grid, 4 per row, max 2 rows — every action is always visible with
 * no scrolling. Same actions, same hrefs/behavior as before; only the
 * presentation and label length changed (labels shortened to one word so
 * they never wrap under the icon).
 *
 * Flagging a concern still goes through the exact same flagConcern()
 * action and ConcernFlag copy as before — only the trigger moved from
 * ConcernFlag's own internal button to this grid tile. See
 * ConcernFlag.tsx's controlled open/onOpenChange props.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { Activity, UtensilsCrossed, BarChart2, Compass, MessageCircleWarning } from 'lucide-react';
import { useState } from 'react';
import { ConcernFlag } from '@/components/checkin/ConcernFlag';

const ICON_CIRCLE =
  'flex h-12 w-12 items-center justify-center rounded-full bg-[#E8F0EA] text-[#1B3A2D] transition';

const ITEM =
  'mef-press mef-focus-ring flex flex-col items-center gap-2 rounded-2xl py-1';

const ITEM_LABEL = 'text-xs font-medium text-[#1B3A2D] text-center leading-none';

type QuickAction = { label: string; href: Route; Icon: typeof Activity };

// Full labels kept in sync with each destination's own page title; the
// grid only ever renders the shortened `label` below so nothing wraps.
const LINKS: QuickAction[] = [
  { label: 'Case', href: '/case', Icon: Compass },
  { label: 'Movement', href: '/movement', Icon: Activity },
  { label: 'Lens', href: '/food-lens', Icon: UtensilsCrossed },
  { label: 'Progress', href: '/progress', Icon: BarChart2 },
];

export function QuickActionsGrid() {
  const [concernOpen, setConcernOpen] = useState(false);

  return (
    <div>
      <div className="grid grid-cols-4 gap-x-1 gap-y-5">
        {LINKS.map(({ label, href, Icon }) => (
          <Link key={href} href={href} className={ITEM}>
            <span className={ICON_CIRCLE}>
              <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className={ITEM_LABEL}>{label}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setConcernOpen((v) => !v)}
          aria-expanded={concernOpen}
          className={ITEM}
        >
          <span className={`${ICON_CIRCLE} ${concernOpen ? 'bg-[#1B3A2D]/[0.18]' : ''}`}>
            <MessageCircleWarning className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className={ITEM_LABEL}>Concern</span>
        </button>
      </div>

      <div className="mt-3">
        <ConcernFlag open={concernOpen} onOpenChange={setConcernOpen} />
      </div>
    </div>
  );
}
