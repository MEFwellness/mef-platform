/**
 * The tools on a staff section home, as a grid of tiles instead of a
 * column of full-width cards.
 *
 * WHAT THIS REPLACES, MEASURED. The coach home stacked eight one-word
 * navigation cards, each `p-6` with a chevron, one under another: about
 * 620px of a 390px phone spent on eight words, sitting between the coach
 * and the client list they opened the app to read. The admin home did the
 * same with nine cards, each carrying a three-line paragraph explaining a
 * destination its own title already named, about 2,400px before the user
 * list. On both screens the work was below the tools.
 *
 * A tile keeps the icon, the name and the tap target, drops the chevron
 * and the paragraph, and puts two on a row. The same eight destinations
 * cost roughly a third of the height, so the work comes up the page
 * instead of the tools coming down.
 *
 * NOTHING IS REMOVED. Every destination that had a card has a tile, in the
 * same order, to the same href. A tile may carry a `badge` for a count a
 * coach acts on (an open safety case, a protein target waiting), which is
 * the one thing the old cards said that a name does not.
 *
 * `tone` is how a tile that is asking for something is told apart from one
 * that is merely available, and it is the only colour decision here: gold
 * for something waiting, forest for everything else. It is never used for
 * decoration, because a screen where several tiles glow is a screen where
 * none of them do.
 */

import Link from 'next/link';
import type { Route } from 'next';
import type { LucideIcon } from 'lucide-react';

export type StaffTool = {
  label: string;
  href: string;
  Icon: LucideIcon;
  /** A count worth acting on, shown as a pill. Omitted when there is nothing waiting. */
  badge?: string | undefined;
  /** 'waiting' draws the gold treatment. Anything else stays quiet. */
  tone?: 'waiting' | 'default' | undefined;
};

export function StaffToolGrid({ tools, label }: { tools: StaffTool[]; label: string }) {
  return (
    <nav aria-label={label}>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {tools.map((tool) => {
          const waiting = tool.tone === 'waiting';
          return (
            <li key={tool.href}>
              <Link
                href={tool.href as Route}
                className={`mef-focus-ring flex h-full min-h-[92px] flex-col justify-between gap-2 rounded-[20px] border p-4 transition ${
                  waiting
                    ? 'border-[#C4A050]/45 bg-[#C4A050]/10 hover:bg-[#C4A050]/16'
                    : 'border-[#1B3A2D]/8 bg-white hover:border-[#1B3A2D]/20'
                }`}
              >
                <tool.Icon
                  className={`h-5 w-5 shrink-0 ${waiting ? 'text-[#8A6A22]' : 'text-[#6B7A72]'}`}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium leading-snug text-[#1B3A2D]">
                    {tool.label}
                  </span>
                  {tool.badge ? (
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        waiting ? 'bg-[#C4A050]/25 text-[#6B4E14]' : 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]'
                      }`}
                    >
                      {tool.badge}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
