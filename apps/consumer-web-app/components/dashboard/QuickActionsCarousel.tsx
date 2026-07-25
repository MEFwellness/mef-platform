'use client';

/**
 * Home dashboard redesign — Quick Actions zone. Same four actions the page
 * always offered (Movement, Food Lens, Progress via DashboardQuickLinks.tsx,
 * and Flag a Concern via ConcernFlag.tsx), now presented as one horizontal
 * carousel instead of three link-cards stacked above a fourth standalone
 * card. DashboardQuickLinks.tsx is no longer rendered on Home directly —
 * its three links are reproduced here as carousel tiles with identical
 * hrefs/labels/descriptions/icons; that component still exists for reuse
 * elsewhere but nothing else currently imports it.
 *
 * Flagging a concern still goes through the exact same flagConcern()
 * action and ConcernFlag copy as before — only the trigger moved from
 * ConcernFlag's own internal button to this tile, since Concern is now a
 * carousel tile rather than its own always-visible card. See
 * ConcernFlag.tsx's controlled open/onOpenChange props.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { Activity, UtensilsCrossed, BarChart2, MessageCircleWarning } from 'lucide-react';
import { useState } from 'react';
import { ConcernFlag } from '@/components/checkin/ConcernFlag';

const TILE =
  'mef-press flex w-[168px] shrink-0 snap-start flex-col items-start rounded-[24px] bg-white p-4 text-left shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] transition hover:shadow-[0_4px_28px_-4px_rgba(27,58,45,0.18)]';

const LINKS: { label: string; description: string; href: Route; Icon: typeof Activity }[] = [
  { label: 'Movement', description: "Today's session", href: '/movement', Icon: Activity },
  { label: 'Food Lens', description: 'Scan & log meals', href: '/food-lens', Icon: UtensilsCrossed },
  { label: 'Progress', description: 'Trends & history', href: '/progress', Icon: BarChart2 },
];

function TileIcon({ Icon }: { Icon: typeof Activity }) {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1B3A2D]/[0.06]">
      <Icon className="h-4 w-4 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

export function QuickActionsCarousel() {
  const [concernOpen, setConcernOpen] = useState(false);

  return (
    <div>
      <div className="mef-scrollbar-hidden flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 pb-1">
        {LINKS.map(({ label, description, href, Icon }) => (
          <Link key={href} href={href} className={TILE}>
            <TileIcon Icon={Icon} />
            <p className="mt-3 text-sm font-semibold text-[#1B3A2D]">{label}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-[#6B7A72]">{description}</p>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setConcernOpen((v) => !v)}
          aria-expanded={concernOpen}
          className={`${TILE} ${concernOpen ? 'ring-2 ring-[#F5B700]' : ''}`}
        >
          <TileIcon Icon={MessageCircleWarning} />
          <p className="mt-3 text-sm font-semibold text-[#1B3A2D]">Flag a Concern</p>
          <p className="mt-0.5 text-[11px] leading-snug text-[#6B7A72]">New or worsening?</p>
        </button>
      </div>

      <div className="mt-3">
        <ConcernFlag open={concernOpen} onOpenChange={setConcernOpen} />
      </div>
    </div>
  );
}
