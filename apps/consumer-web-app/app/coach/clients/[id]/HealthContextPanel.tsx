'use client';

/**
 * The coach's Health Context card.
 *
 * IT ANSWERS ONE QUESTION IN ABOUT FIFTEEN SECONDS: what is the background
 * behind this person. So it opens on a dense block of labelled lines rather
 * than on a replay of ninety answers, and the detail (every medication,
 * every event, every note she wrote) sits under it in named groups, read
 * when it matters.
 *
 * TWO HEADINGS, AND THE SEPARATION IS THE POINT. Everything above
 * "Questions worth exploring" is something she reported, in her own
 * answers' words. Everything under it is a question a coach MAY want to
 * ask, built by eight fixed co-occurrence rules that fire only when both of
 * the things they name genuinely exist. Nothing in this card says one thing
 * caused another, and nothing in it names a condition.
 *
 * WHAT SHE REMOVED IS NOT IN THIS PAYLOAD AT ALL. A branch she closed by
 * changing a gate is archived in its own column and never sent to this
 * screen, which is what makes "no stale hidden answers anywhere" a fact
 * about the wire rather than a convention a card has to remember.
 *
 * NO DATE IS FORMATTED IN THE BROWSER'S OWN ZONE. Every day printed here
 * goes through lib/time/displayDate.ts's formatDisplayDate, pinned to UTC,
 * which is the right zone for a staff surface reading a record's timestamp.
 */

import { useMemo, useState } from 'react';
import { ChevronDown, ClipboardList, AlertCircle, HelpCircle } from 'lucide-react';
import { formatDisplayDate } from '@/lib/time/displayDate';
import { HLI_LABEL } from '@/lib/health-intake/constants';
import { buildHealthContextView, followUpLine } from '@/lib/health-intake/coachView';
import type { CoachHliPanelState } from '@/app/actions/healthIntake';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const SECTION_HEADING = 'text-xs font-semibold uppercase tracking-wider text-[#6B7A72]';
const BLOCK = 'rounded-2xl border border-[#1B3A2D]/8 bg-[#FBFAF7] p-4';

function dayLabel(instant: string | null): string {
  if (!instant) return 'not yet';
  return formatDisplayDate(instant.slice(0, 10), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function HealthContextPanel({ state }: { state: CoachHliPanelState }) {
  const completed = state.sessions.filter((session) => session.completedAt !== null);
  const [selectedId, setSelectedId] = useState<string | null>(completed[0]?.id ?? null);
  const [openGroups, setOpenGroups] = useState(false);

  const session = completed.find((entry) => entry.id === selectedId) ?? completed[0] ?? null;
  const view = useMemo(
    () => (session ? buildHealthContextView(session.answers) : null),
    [session]
  );

  if (!session || !view) {
    return (
      <section className={`${CARD} p-6`}>
        <Heading />
        <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
          {state.pendingStatusLine
            ? `Sent, and not finished yet. ${state.pendingStatusLine}`
            : 'Nothing here yet. Send it from the Assessment Status block at the top of Assessments and Findings.'}
        </p>
      </section>
    );
  }

  return (
    <section className={`${CARD} p-6`}>
      <Heading />

      <p className="mt-1 text-xs text-[#6B7A72]">
        {`Completed ${dayLabel(session.completedAt)}. Last updated ${dayLabel(session.updatedAt)}.`}
      </p>

      {completed.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {completed.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSelectedId(entry.id)}
              aria-pressed={entry.id === session.id}
              className={`mef-focus-ring rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                entry.id === session.id
                  ? 'border-[#1B3A2D] bg-[#1B3A2D] text-white'
                  : 'border-[#1B3A2D]/12 text-[#3E5C46] hover:bg-[#1B3A2D]/5'
              }`}
            >
              {dayLabel(entry.completedAt)}
            </button>
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------------
          WHAT SHE REPORTED.
      --------------------------------------------------------------- */}
      <h3 className={`${SECTION_HEADING} mt-6`}>What she reported</h3>
      <dl className="mt-3 space-y-2">
        {view.rows.map((row) => (
          <div key={row.label} className="flex flex-wrap gap-x-2 gap-y-0.5">
            <dt className="text-[13px] font-semibold text-[#3E5C46]">{`${row.label}:`}</dt>
            <dd className="text-[13px] leading-relaxed text-[#1B3A2D]">{row.value}</dd>
          </div>
        ))}
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          <dt className="text-[13px] font-semibold text-[#3E5C46]">Follow-up:</dt>
          <dd className="text-[13px] leading-relaxed text-[#1B3A2D]">
            {followUpLine(view.safetySignals)}
          </dd>
        </div>
      </dl>

      {view.groups.length > 0 && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setOpenGroups((current) => !current)}
            aria-expanded={openGroups}
            className="mef-focus-ring flex w-full items-center justify-between gap-3 rounded-2xl border border-[#1B3A2D]/8 px-4 py-3 text-left"
          >
            <span className="text-[13px] font-semibold text-[#3E5C46]">
              {openGroups ? 'Hide the detail' : 'Show the detail'}
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-[#6B7A72] transition-transform duration-200 ${
                openGroups ? 'rotate-180' : ''
              }`}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>

          {openGroups && (
            <div className="mt-3 space-y-3">
              {view.groups.map((group) => (
                <div key={group.label} className={BLOCK}>
                  <p className={SECTION_HEADING}>{group.label}</p>
                  <ul className="mt-2 space-y-1">
                    {group.items.map((item, index) => (
                      <li key={`${group.label}-${index}`} className="text-[13px] leading-relaxed text-[#1B3A2D]">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {view.notes.map((note) => (
                <div key={note.label} className={BLOCK}>
                  <p className={SECTION_HEADING}>{note.label}</p>
                  <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[#1B3A2D]">
                    {note.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------
          THE SAFETY SIGNALS, kept apart from everything else.
      --------------------------------------------------------------- */}
      {view.safetySignals.length > 0 && (
        <div className="mt-6 rounded-2xl border border-[#C4A050]/50 bg-[#FBF7EC] p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#8A6A1F]">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            Follow-up may be appropriate
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {view.safetySignals.map((signal) => (
              <li key={signal.ruleKey} className="text-[13px] leading-relaxed text-[#1B3A2D]">
                {signal.coachLine}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] leading-relaxed text-[#6B7A72]">
            A case has been opened in the Safety Review Queue. She was shown one neutral line
            suggesting she speak to her healthcare provider, and nothing else.
          </p>
        </div>
      )}

      {/* ---------------------------------------------------------------
          QUESTIONS WORTH EXPLORING, under its own heading, so a coach
          reading quickly cannot mistake one of these for something she
          said.
      --------------------------------------------------------------- */}
      {view.exploring.length > 0 && (
        <div className="mt-6">
          <h3 className={`${SECTION_HEADING} flex items-center gap-2`}>
            <HelpCircle className="h-4 w-4" aria-hidden="true" />
            Questions worth exploring
          </h3>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[#6B7A72]">
            Co-occurrences in what she reported. Not a finding, not a cause, and nothing she has
            been shown.
          </p>
          <div className="mt-3 space-y-3">
            {view.exploring.map((prompt) => (
              <div key={prompt.key} className={BLOCK}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7A72]">
                  What she reported
                </p>
                <ul className="mt-1.5 space-y-1">
                  {prompt.reported.map((line) => (
                    <li key={line} className="text-[13px] leading-relaxed text-[#1B3A2D]">
                      {line}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 border-t border-[#1B3A2D]/8 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8A6A1F]">
                    A question the coach may want to explore
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[#1B3A2D]">
                    {prompt.question}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Heading() {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[#3E5C46]">
      <ClipboardList className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      {HLI_LABEL}
    </h2>
  );
}
