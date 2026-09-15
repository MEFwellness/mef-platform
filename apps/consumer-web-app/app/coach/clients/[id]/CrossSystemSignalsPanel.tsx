'use client';

/**
 * The coach's Signals card: everything this member's body has said,
 * whoever it said it to.
 *
 * WHAT IT IS, AND WHAT IT IS NOT. It is the shared Signal Library (Prompt
 * 1 of the Cross-System Correlation Engine): one row per standardized
 * signal, grouped by category, each showing its latest value, where that
 * value came from and the day it was captured, and opening onto every
 * older dated entry for the same signal.
 *
 * IT IS NOT THE ROOTED RESET WHOLE-BODY SIGNAL ASSESSMENT and it is not
 * the Whole-Body Check-In. Those are questionnaires, and both have their
 * own cards in Assessments and Findings. This is a store fed by them among
 * others, and the source label on every row is what says which.
 *
 * NO CORRELATION IS DRAWN HERE. No relationship, no pattern card, no
 * "these two move together", and no field one could arrive in. Two signals
 * sitting in one category is a filing decision, not a claim. The
 * correlation engine is Prompt 3.
 *
 * THE SOURCE IS ALWAYS VISIBLE, on the latest row and on every older one,
 * because a value with no provenance is an assertion rather than a
 * finding. Where the source recorded the exact question, that question is
 * printed with the answer, so the original response can always be read
 * rather than inferred from a standardized label.
 *
 * COACH ONLY. Nothing in this feature renders on a member screen or
 * reaches a member API payload, and migration 240 gives its tables no
 * member select policy at all, so her session could not fetch a row even
 * if a screen tried to draw one.
 */

import { useState } from 'react';
import { Activity, ChevronDown } from 'lucide-react';
import { formatDisplayDate } from '@/lib/time/displayDate';
import { CROSS_SYSTEM_SIGNALS_LABEL } from '@/lib/cross-system-signals/constants';
import type {
  CoachSignalsView,
  SignalGroupRow,
  SignalHistoryEntry,
} from '@/lib/cross-system-signals/coachView';
import type { CoachSignalsPanelState } from '@/app/actions/crossSystemSignals';
import { AddSignalForm } from './AddSignalForm';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/** A stored capture day, printed in the day the row itself names. */
function day(value: string): string {
  return formatDisplayDate(value, { month: 'short', day: 'numeric', year: 'numeric' });
}

function EntryLine({ entry }: { entry: SignalHistoryEntry }) {
  return (
    <div className="py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-[#1B3A2D]">{entry.valueLabel}</span>
        <span className="text-xs text-[#6B7A72]">{day(entry.capturedOn)}</span>
      </div>
      <p className="mt-0.5 text-xs text-[#6B7A72]">{entry.sourceLabel}</p>
      {entry.sourceQuestionPrompt ? (
        <p className="mt-0.5 text-xs italic leading-relaxed text-[#6B7A72]">
          {entry.sourceQuestionPrompt}
        </p>
      ) : null}
      {entry.note ? (
        <p className="mt-0.5 text-xs leading-relaxed text-[#3E5C46]">{entry.note}</p>
      ) : null}
    </div>
  );
}

function SignalRow({ row }: { row: SignalGroupRow }) {
  const [open, setOpen] = useState(false);
  const historyCount = row.history.length;

  return (
    <li className="border-t border-[#1B3A2D]/5 first:border-t-0">
      <div className="py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[#1B3A2D]">{row.signalName}</span>
            {row.sideLabel ? (
              <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2 py-0.5 text-[11px] font-medium text-[#3E5C46]">
                {row.sideLabel}
              </span>
            ) : null}
          </span>
          <span className="text-sm font-medium text-[#3E5C46]">{row.latest.valueLabel}</span>
        </div>
        <p className="mt-0.5 text-xs text-[#6B7A72]">
          {row.latest.sourceLabel}, {day(row.latest.capturedOn)}
        </p>
        {row.latest.sourceQuestionPrompt ? (
          <p className="mt-0.5 text-xs italic leading-relaxed text-[#6B7A72]">
            {row.latest.sourceQuestionPrompt}
          </p>
        ) : null}
        {row.latest.note ? (
          <p className="mt-0.5 text-xs leading-relaxed text-[#3E5C46]">{row.latest.note}</p>
        ) : null}

        {historyCount > 0 ? (
          <>
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              aria-expanded={open}
              className="mef-focus-ring mt-2 inline-flex min-h-[36px] items-center gap-1 rounded-full px-2 text-xs font-medium text-[#3E5C46] hover:bg-[#1B3A2D]/[0.05]"
            >
              {historyCount === 1 ? '1 earlier entry' : `${historyCount} earlier entries`}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </button>
            {open ? (
              <div className="mt-1 divide-y divide-[#1B3A2D]/5 border-l-2 border-[#C4A050]/40 pl-3">
                {row.history.map((entry) => (
                  <EntryLine key={entry.id} entry={entry} />
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );
}

function SignalsList({ view }: { view: CoachSignalsView }) {
  if (view.groups.length === 0) {
    return (
      <p className="mt-3 text-sm text-[#6B7A72]">
        No signals yet. They arrive as assessments are completed, and you can add one above.
      </p>
    );
  }
  return (
    <div className="mt-4 space-y-5">
      {view.groups.map((group) => (
        <section key={group.categoryKey}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
            {group.categoryLabel}
          </h3>
          <ul className="mt-1">
            {group.rows.map((row) => (
              <SignalRow key={`${row.signalSlug}-${row.sideLabel ?? 'none'}`} row={row} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function CrossSystemSignalsPanel({ state }: { state: CoachSignalsPanelState }) {
  const { view } = state;
  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <Activity className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">
          {CROSS_SYSTEM_SIGNALS_LABEL}
        </p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-[#6B7A72]">
        Everything her assessments and your own entries have recorded, grouped by category. Each row
        names where its latest value came from. Nothing here is shown to her.
      </p>

      {state.memberId ? (
        <div className="mt-4">
          <AddSignalForm
            memberId={state.memberId}
            categories={state.categories}
            bodyAreas={state.bodyAreas}
            symptoms={state.symptoms}
            searchableNames={state.searchableNames}
          />
        </div>
      ) : null}

      <SignalsList view={view} />
    </section>
  );
}
