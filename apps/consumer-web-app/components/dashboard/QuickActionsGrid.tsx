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
 *
 * TREATMENT (Home cleanup pass, 2026-08-14). The pill SHAPE is settled and
 * unchanged: two rounded-full capsules, one row, same hrefs, same icons,
 * same status lines. What changed is that they no longer read as plain
 * labels sitting under the image-backed cards above them:
 *
 *   - each pill's icon now sits in a small illustrated tile — a flat
 *     brand-palette gradient (forest #1B3A2D into warm gold #C4A050) with
 *     a single soft highlight, the same flat artwork language the Noticing
 *     cards use, rather than the flat forest circle it used to be;
 *   - the pill itself carries a cream-to-white gradient (#F5F0E4 into
 *     white) and a slightly deeper shadow, so it reads as a raised door
 *     into a feature rather than a tinted label.
 *
 * A trailing chevron was tried and removed: at 390px each pill has about
 * 145px of inner width, and the chevron took enough of it to truncate
 * "2 of 9 complete" to "2 of 9 com...". A real status line is worth more
 * than a second affordance cue, and the raised tile already reads as a
 * door. Caught by screenshotting the real rendered pills, not by reading
 * the markup.
 *
 * No new artwork files, no new dependency, no fourth colour: every value
 * here is one of the three brand colours already in app/globals.css.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { Activity, Compass } from 'lucide-react';

const PILL =
  'mef-press mef-focus-ring flex min-h-[64px] items-center gap-2.5 rounded-full border border-[#1B3A2D]/12 bg-gradient-to-br from-[#F5F0E4] to-white px-3 py-3 shadow-[0_4px_16px_-6px_rgba(27,58,45,0.22)] transition hover:border-[#1B3A2D]/25 hover:shadow-[0_6px_20px_-6px_rgba(27,58,45,0.28)]';

/**
 * The illustrated icon tile. A rounded square rather than a circle so it
 * reads as a small piece of artwork inside the capsule instead of a bullet,
 * with the gradient running forest -> gold on the diagonal and one soft
 * cream highlight in the top-left corner (the `::before` equivalent, done
 * as a real child element below so it needs no extra CSS).
 */
const ICON_TILE =
  'relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-gradient-to-br from-[#1B3A2D] via-[#24503C] to-[#C4A050] text-[#F5F0E4] shadow-[0_2px_8px_-2px_rgba(27,58,45,0.45)]';

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
          <span className={ICON_TILE}>
            {/* The one highlight. Purely decorative, hidden from assistive
                tech, and inside the tile's own overflow-hidden so it can
                never bleed past the rounded corners. */}
            <span
              className="pointer-events-none absolute -left-2 -top-3 h-7 w-7 rounded-full bg-[#F5F0E4]/25 blur-[6px]"
              aria-hidden="true"
            />
            <Icon className="relative h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block ${LABEL}`}>{label}</span>
            {status && <span className={`block truncate ${STATUS}`}>{status}</span>}
          </span>
        </Link>
      ))}
    </div>
  );
}
