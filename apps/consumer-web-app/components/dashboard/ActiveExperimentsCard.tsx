'use client';

/**
 * ONE CARD FOR EVERY RUNNING EXPERIMENT, ONE SLIM ROW EACH.
 *
 * WHAT THIS REPLACED (2026-09-13). Every active experiment rendered its
 * own full-size card, stacked. A member running two or three of them
 * opened Home and found the whole screen taken by experiment cards, with
 * everything else pushed below them. Two experiments is normal, and the
 * cap is two plus whatever a deep-dive adds, so the crowded case was the
 * ordinary case.
 *
 * WHAT IT DOES INSTEAD. One card. One row per experiment: the question it
 * asks her, what day of it she is on, and whether today is logged. Tapping
 * a row opens that experiment's own panel underneath it, unchanged, and
 * tapping again closes it.
 *
 * NOTHING ABOUT AN EXPERIMENT CHANGED. The panel inside a row is the exact
 * component that used to be the card, with the exact props it used to get,
 * rendered by the exact same server section, and it is MOUNTED whether the
 * row is open or not, exactly as it was when it was a card. Logging still
 * happens in the panel, through the same server action, writing the same
 * row. This file decides only what is shown before she taps.
 *
 * THE ROW NEVER STATES SOMETHING THE PANEL CONTRADICTS. `Logged` /
 * `Not logged yet` is the server's answer, read when Home rendered. While
 * a row is open the row stops saying it at all, because the panel three
 * lines below is the live one and two statements about one fact on one
 * screen is exactly the thing this app does not do.
 *
 * ANYTHING GENUINELY WAITING ON HER OPENS BY ITSELF. A day 3 or day 7
 * follow-up is a question she has not answered, so its row is open when
 * Home arrives rather than folded behind a tap. Condensing the section
 * must not quietly hide the one thing in it that needed her.
 */

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export interface ActiveExperimentRow {
  /** The experiment's own id. Stable across a re-render, which is what keeps a row open while she logs inside it. */
  id: string;
  /** The question this experiment actually asks her, in its own words. */
  question: string;
  /**
   * The experiment's own short name, used as the row's label once it is
   * open. The panel underneath says the question in full, so repeating it
   * in the header above would be the same sentence twice on one screen.
   */
  title: string;
  /** "Day 3 of 7", counted by the same rule the panel counts it by. */
  dayLabel: string;
  /** Today's answer, or null when she has not answered today. */
  loggedToday: boolean | null;
  /** True when a follow-up is genuinely waiting. Opens the row on arrival. */
  waitingOnHer?: boolean | undefined;
  /** The experiment's own panel, exactly as it rendered when it was a card. */
  panel: ReactNode;
}

const ROW_QUESTION = 'block text-[15px] font-medium leading-snug text-[#1B3A2D]';
const ROW_QUESTION_OPEN = 'mef-home-label block';
const ROW_META = 'mt-1.5 block text-xs text-[#6B7A72]';

export function ActiveExperimentsCard({ rows }: { rows: readonly ActiveExperimentRow[] }) {
  const [openIds, setOpenIds] = useState<readonly string[]>(() =>
    rows.filter((row) => row.waitingOnHer).map((row) => row.id)
  );

  if (rows.length === 0) return null;

  function toggle(id: string): void {
    setOpenIds((previous) =>
      previous.includes(id) ? previous.filter((open) => open !== id) : [...previous, id]
    );
  }

  return (
    <div /* `:where(.mef-card)` sets the padding at zero specificity on purpose
          (app/globals.css), so a plain `p-0` from the utilities layer wins and
          the rows can own their own insets edge to edge. */
      className="mef-card overflow-hidden p-0"
      data-testid="active-experiments-card"
    >
      {rows.map((row, index) => {
        const open = openIds.includes(row.id);
        return (
          <div
            key={row.id}
            /* A hairline between rows, not a rule. At 8% it read as a
               gray line across a white card; at 5% it separates two rows
               without drawing anything. */
            className={index === 0 ? '' : 'border-t border-[#1B3A2D]/[0.05]'}
          >
            <button
              type="button"
              onClick={() => toggle(row.id)}
              aria-expanded={open}
              /* A stable handle for the production walk. The row's own text
                 deliberately changes when it opens (the day and the logged
                 state move to the panel), so a locator built from its words
                 loses the row it just tapped. */
              data-testid="active-experiment-row"
              className="mef-focus-ring flex w-full items-start gap-3 px-6 py-[18px] text-left transition hover:bg-[#1B3A2D]/[0.03]"
            >
              <span className="min-w-0 flex-1">
                {/*
                  OPEN, THE ROW STOPS COMPETING WITH THE PANEL. The panel
                  it just revealed carries the question in full, the day and
                  today's answer in its own words, so an open row falls back
                  to a quiet name saying only which one is open. Closed, the
                  row is the whole statement and says all three.
                */}
                <span className={open ? ROW_QUESTION_OPEN : ROW_QUESTION}>
                  {open ? row.title : row.question}
                </span>
                {!open && (
                  <span className={ROW_META}>
                    {`${row.dayLabel} · ${loggedText(row.loggedToday)}`}
                  </span>
                )}
              </span>
              <ChevronDown
                className={`mt-1 h-4 w-4 shrink-0 text-[#1B3A2D]/35 transition-transform ${
                  open ? 'rotate-180' : ''
                }`}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </button>
            {/*
              RENDERED ALWAYS, SHOWN ONLY WHEN OPEN, and that is deliberate
              rather than incidental. Every one of these panels was mounted
              on Home before this card existed, so mounting them exactly as
              before is what makes this change presentation and nothing
              else: the same components run, with the same props, doing the
              same things on mount. Only whether a member can see one
              changed.
            */}
            <div className={open ? 'px-3 pb-5' : 'hidden'}>{row.panel}</div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Deliberately says only whether today has an answer, not which answer it
 * was. "Not today" is a real, valid answer and a row is not the place to
 * repeat it back to her; the panel says it in that experiment's own words.
 */
function loggedText(loggedToday: boolean | null): string {
  return loggedToday === null ? 'Not logged yet' : 'Logged';
}
