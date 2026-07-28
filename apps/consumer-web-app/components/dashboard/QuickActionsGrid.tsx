'use client';

/**
 * Home dashboard — Quick Actions zone. Two capsule pills (Case, Movement)
 * side by side. Food Lens and Progress moved to the member bottom nav
 * (components/BottomNav.tsx); Flag a Concern was removed from here
 * entirely — see app/dashboard/page.tsx's doc comment on where it needs a
 * new home, since this was its only entry point in the member app.
 *
 * `status` is real, already-fetched data passed down from
 * app/dashboard/page.tsx (questionnaire completion count, most recent
 * completed movement assessment) — never computed or invented here. A
 * null status renders the pill with its label only, no second line, so
 * both pills stay the same height either way (fixed min-height + centered
 * content, rather than reserving space for a line that may not exist).
 */

import Link from 'next/link';
import type { Route } from 'next';
import { Activity, Compass } from 'lucide-react';

const PILL =
  'mef-press mef-focus-ring flex min-h-[64px] items-center gap-2 rounded-full border border-[#1B3A2D]/10 bg-[#EFF6F1] px-3 py-3 shadow-[0_2px_10px_-4px_rgba(27,58,45,0.12)] transition hover:bg-[#E8F0EA]';

const ICON_CIRCLE =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1B3A2D] text-[#F5F0E4]';

const LABEL = 'text-sm font-semibold leading-tight text-[#1B3A2D]';

const STATUS = 'mt-0.5 text-[11px] leading-tight text-[#6B7A72]';

type QuickAction = { label: string; href: Route; Icon: typeof Activity; status: string | null };

export function QuickActionsGrid({
  caseStatus,
  movementStatus,
}: {
  caseStatus: string | null;
  movementStatus: string | null;
}) {
  const ACTIONS: QuickAction[] = [
    { label: 'Case', href: '/case', Icon: Compass, status: caseStatus },
    { label: 'Movement', href: '/movement', Icon: Activity, status: movementStatus },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {ACTIONS.map(({ label, href, Icon, status }) => (
        <Link key={href} href={href} className={PILL}>
          <span className={ICON_CIRCLE}>
            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className={`block ${LABEL}`}>{label}</span>
            {status && <span className={`block truncate ${STATUS}`}>{status}</span>}
          </span>
        </Link>
      ))}
    </div>
  );
}
