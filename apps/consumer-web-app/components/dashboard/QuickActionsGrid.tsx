'use client';

/**
 * Home — Quick Actions, the compact row directly under the hero.
 *
 * WHAT THIS ROW IS FOR. It answers the second of the seven questions
 * Home exists to answer ("what can I do right now"), and it answers it
 * in the least space the page spends on anything: a horizontal row of
 * small tiles she can thumb through, immediately under the day's one
 * chosen action and above everything that is waiting on her.
 *
 * IT WAS TWO FULL-WIDTH CAPSULES (Case, Movement) IN A GRID. Two pills
 * running the whole width of the column, 64px tall, sitting a long way
 * down the page under the program hero and the eleven assignment cards.
 * They read as two more section-sized objects rather than as shortcuts,
 * and a row of exactly two things that exactly fills its container tells
 * a member there is nothing else. Both problems are the same problem: a
 * shortcut that takes a section's worth of room is not a shortcut.
 *
 * THE NEXT TILE IS DELIBERATELY EXPOSED. The tile width is a fraction of
 * the column, not a pixel value (`.mef-home-quick-tile`, app/globals.css),
 * so two whole tiles, one gap and a fifth of the third are visible at
 * rest at every phone width: 20 percent of the next tile at 320px, at
 * 390px and at 430px alike. That slice is the whole signal that the row
 * scrolls, and it is the reason the width is computed rather than fixed.
 *
 * WITH TWO TILES OR FEWER THERE IS NOTHING TO SCROLL TO, so the row
 * becomes a plain grid and the tiles fill the column. A peek at a tile
 * that does not exist is a lie about the row, and a 148px tile with 200px
 * of empty space beside it reads as broken rather than as scrollable.
 *
 * EVERY TILE IS A DOOR SHE ALREADY HAS. Nothing here is a new feature and
 * nothing here is a new permission: Daily Reset and Progress are in the
 * bottom bar on every screen in the app, Food Lens is decided by the same
 * `tracker.food_lens` rule that decides its bottom-bar tab, and Case and
 * Movement keep the exact visibility rules they have always had. Which
 * tiles exist is decided on the server (app/dashboard/page.tsx) and handed
 * down; this component invents nothing and gates nothing.
 *
 * THE HINT LINE IS REAL OR IT IS STATIC, NEVER INVENTED. The Movement
 * tile carries the true completion status when one exists ("Completed 26
 * days ago"), the Daily Reset tile says whether today's check-in is
 * already logged, and the rest carry a fixed line saying what is on the
 * other side of the tap. The hint is held to two lines rather than
 * truncated, because cutting a true sentence to an ellipsis is the bug
 * the previous treatment shipped with.
 */

import { QuietLink } from '@/components/nav/QuietLink';
import type { Route } from 'next';
import { Activity, BarChart2, Compass, Sunrise, UtensilsCrossed } from 'lucide-react';

/**
 * A server component cannot hand a client component a function, so the
 * icon travels as a key and is resolved here. The keys are the five doors
 * this row can offer and nothing else.
 */
const ICONS = {
  dailyReset: Sunrise,
  foodLens: UtensilsCrossed,
  movement: Activity,
  progress: BarChart2,
  case: Compass,
} as const;

export type QuickActionIcon = keyof typeof ICONS;

export type QuickAction = {
  /** Stable key, used for React's list identity and for the icon. */
  icon: QuickActionIcon;
  label: string;
  /** The one short line under the label. Real status where one exists, otherwise what the tap opens. */
  hint: string;
  href: string;
  /**
   * The single lit tile, when there is one. Decided on the server from a
   * real row (today's check-in either exists or it does not), never from
   * the copy and never more than once in the row.
   */
  accent?: boolean;
};

export function QuickActionsGrid({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null;

  // Two or fewer has nothing off screen to promise, so it is a grid.
  const scrolls = actions.length > 2;

  return (
    <div
      className={
        scrolls
          ? 'mef-home-quick-row mef-scrollbar-hidden'
          : `grid gap-3 ${actions.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`
      }
    >
      {actions.map(({ icon, label, hint, href, accent }) => {
        const Icon = ICONS[icon];
        return (
          <QuietLink
            key={icon}
            href={href as Route}
            className={`mef-press mef-focus-ring mef-home-quick-tile ${
              accent ? 'mef-home-quick-tile-accent' : ''
            }`}
          >
            <span className="mef-home-quick-icon">
              <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="mef-home-quick-label">{label}</span>
            <span className="mef-home-quick-hint">{hint}</span>
          </QuietLink>
        );
      })}
    </div>
  );
}
