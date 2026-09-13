'use client';

/**
 * Home — Quick Actions, the compact row directly under the hero.
 *
 * WHAT THIS ROW IS FOR. It answers the first question a member asks once
 * she has read how she is doing ("what can I do right now"), it is the
 * FIRST thing in <main> since the final structural pass (2026-09-13), and
 * it answers it in the least space the page spends on anything: a
 * horizontal row of small tiles she can thumb through.
 *
 * IT WAS TWO FULL-WIDTH CAPSULES (Case, Movement) IN A GRID. Two pills
 * running the whole width of the column, 64px tall, sitting a long way
 * down the page under the program hero and the eleven assignment cards.
 * They read as two more section-sized objects rather than as shortcuts,
 * and a row of exactly two things that exactly fills its container tells
 * a member there is nothing else. Both problems are the same problem: a
 * shortcut that takes a section's worth of room is not a shortcut.
 *
 * AND THEN IT WAS FIVE IDENTICAL NEAR-WHITE TILES, which is the defect
 * this pass fixes. A row where every door looks the same tells a member
 * that none of them is worth more than any other, and a near-white tile
 * on a cream page is the quietest object the palette has. Each tile now
 * carries a TONE from the Rooted Reset palette (warm cream, muted sage,
 * deep forest, muted gold, charcoal), decided on the server, and no two
 * neighbouring tiles carry the same one. Nothing is loud: a tone is the
 * brand colour at the weight a 148px tile can hold, and the whole system
 * lives in one block of app/globals.css so a tile's surface, edge, ink,
 * icon chip and sheen can never be half applied.
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
 * nothing here is a new permission: Daily Reset and Progress are the gold
 * button and, until this pass, a tab in the bottom bar; Food Lens is
 * decided by the same `tracker.food_lens` rule that used to decide its
 * bottom-bar tab; Case and Movement keep the exact visibility rules they
 * have always had; and Your Week with Root is the Weekly Root Review
 * entry that already stands further down this same page, drawn on
 * exactly the condition that entry is drawn on. Which tiles exist is
 * decided on the server (app/dashboard/page.tsx) and handed down; this
 * component invents nothing and gates nothing.
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
import { Activity, BarChart2, CalendarRange, Compass, Sunrise, UtensilsCrossed } from 'lucide-react';

/**
 * A server component cannot hand a client component a function, so the
 * icon travels as a key and is resolved here. The keys are the six doors
 * this row can offer and nothing else.
 */
const ICONS = {
  dailyReset: Sunrise,
  foodLens: UtensilsCrossed,
  weekWithRoot: CalendarRange,
  movement: Activity,
  progress: BarChart2,
  case: Compass,
} as const;

export type QuickActionIcon = keyof typeof ICONS;

/**
 * The five tones a tile may carry, and the only five. Each maps to one
 * `.mef-home-quick-tile--*` class, which is where the colours live. A
 * tile with no tone is warm cream, which is the row's base surface.
 */
const TONE_CLASS = {
  cream: '',
  sage: 'mef-home-quick-tile--sage',
  forest: 'mef-home-quick-tile--forest',
  gold: 'mef-home-quick-tile--gold',
  charcoal: 'mef-home-quick-tile--charcoal',
} as const;

export type QuickActionTone = keyof typeof TONE_CLASS;

export type QuickAction = {
  /** Stable key, used for React's list identity and for the icon. */
  icon: QuickActionIcon;
  label: string;
  /** The one short line under the label. Real status where one exists, otherwise what the tap opens. */
  hint: string;
  href: string;
  /** Which of the five Rooted Reset tones this tile is drawn in. Cream when omitted. */
  tone?: QuickActionTone;
  /**
   * The single lit tile, when there is one. Decided on the server from a
   * real row (today's check-in either exists or it does not), never from
   * the copy and never more than once in the row. A tone says what kind
   * of door this is; the accent says this one is waiting.
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
      {actions.map(({ icon, label, hint, href, tone, accent }) => {
        const Icon = ICONS[icon];
        return (
          <QuietLink
            key={icon}
            href={href as Route}
            className={`mef-press mef-focus-ring mef-home-quick-tile ${TONE_CLASS[tone ?? 'cream']} ${
              accent ? 'mef-home-quick-tile-accent' : ''
            }`}
          >
            <span className="mef-home-quick-icon">
              <Icon className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="mef-home-quick-label">{label}</span>
            <span className="mef-home-quick-hint">{hint}</span>
          </QuietLink>
        );
      })}
    </div>
  );
}
