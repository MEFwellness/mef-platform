/**
 * The This Week band, rendered.
 *
 * A pure presentational component. Every sentence arrives already written
 * by lib/coach-week/rows.ts, from readers that ran on the server, so this
 * file formats nothing, counts nothing and decides no date. That is what
 * makes the whole band testable against real HTML without a database, and
 * it is also what keeps it out of the class of bugs where a client render
 * and a server render disagree about what day it is.
 *
 * THE WINDOW IS PRINTED AT THE TOP, ALWAYS. Every count below it is
 * counted over exactly those seven days, and a counted claim with no
 * window named is the thing this band was built to stop.
 *
 * The overdue chip is the only colour in here, and it is drawn only where
 * lib/assignments/status.ts said a real stored deadline has already
 * passed. Nothing else is coloured, because nothing else on this band is a
 * judgement.
 */

import { CalendarRange } from 'lucide-react';
import type { ThisWeekBand } from '@/lib/coach-week/types';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export function ThisWeekBandView({ band }: { band: ThisWeekBand }) {
  return (
    <section className={`${CARD} p-6`} data-section="this-week">
      <div className="flex items-center gap-2 text-[#854D0E]">
        <CalendarRange className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">This week</p>
      </div>

      <p className="mt-2 text-sm font-medium text-[#1B3A2D]" data-testid="this-week-window">
        {band.window.label}
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-[#6B7A72]">
        The 7 days ending on her own Friday, which is the same week her Weekly Reflection reports
        on. Every count below is counted over exactly these days.
      </p>

      <ul className="mt-4 divide-y divide-[#1B3A2D]/5">
        {band.rows.map((row) => (
          <li key={row.key} className="py-3" data-week-row={row.key}>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
              {row.label}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]">{row.statement}</p>
            {row.details.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {row.details.map((detail) => (
                  <li
                    key={detail.text}
                    className="flex flex-wrap items-center gap-1.5 text-sm leading-relaxed text-[#1B3A2D]/80"
                  >
                    <span>{detail.text}</span>
                    {detail.overdue && (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                        Overdue
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
