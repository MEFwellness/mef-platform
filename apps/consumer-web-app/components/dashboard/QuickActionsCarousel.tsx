'use client';

/**
 * Home dashboard redesign — Quick Actions zone. Same four actions the page
 * always offered (Movement, Food Lens, Progress via DashboardQuickLinks.tsx,
 * and Flag a Concern via ConcernFlag.tsx), now presented as one horizontal
 * scroll of compact pill chips — lightweight navigation, not content cards
 * — instead of three link-cards stacked above a fourth standalone card.
 * DashboardQuickLinks.tsx is no longer rendered on Home directly — its
 * three links are reproduced here with identical hrefs/labels/icons (no
 * subtitles now); that component still exists for reuse elsewhere but
 * nothing else currently imports it.
 *
 * Flagging a concern still goes through the exact same flagConcern()
 * action and ConcernFlag copy as before — only the trigger moved from
 * ConcernFlag's own internal button to this chip, since Concern is now a
 * scroll-row chip rather than its own always-visible card. See
 * ConcernFlag.tsx's controlled open/onOpenChange props.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { Activity, UtensilsCrossed, BarChart2, Compass, MessageCircleWarning } from 'lucide-react';
import { useState } from 'react';
import { ConcernFlag } from '@/components/checkin/ConcernFlag';

const CHIP =
  'mef-press inline-flex shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-full bg-[#1B3A2D]/[0.06] px-4 py-2.5 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#1B3A2D]/[0.1]';

const LINKS: { label: string; href: Route; Icon: typeof Activity }[] = [
  { label: 'Your Case', href: '/case', Icon: Compass },
  { label: 'Movement', href: '/movement', Icon: Activity },
  { label: 'Food Lens', href: '/food-lens', Icon: UtensilsCrossed },
  { label: 'Progress', href: '/progress', Icon: BarChart2 },
];

export function QuickActionsCarousel() {
  const [concernOpen, setConcernOpen] = useState(false);

  return (
    <div>
      <div className="mef-scrollbar-hidden flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-px-5 pb-1">
        {LINKS.map(({ label, href, Icon }) => (
          <Link key={href} href={href} className={CHIP}>
            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setConcernOpen((v) => !v)}
          aria-expanded={concernOpen}
          className={`${CHIP} ${concernOpen ? 'bg-[#1B3A2D]/[0.12] ring-1 ring-[#1B3A2D]/20' : ''}`}
        >
          <MessageCircleWarning className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Flag a Concern
        </button>
      </div>

      <div className="mt-3">
        <ConcernFlag open={concernOpen} onOpenChange={setConcernOpen} />
      </div>
    </div>
  );
}
