'use client';

/**
 * The coach's Breathing Pattern Check-In card.
 *
 * IT NAMES THE INSTRUMENT, BECAUSE A COACH NEEDS THAT AND A MEMBER DOES
 * NOT. She is told what the thing measures, in her own words, on her own
 * screens. He is told which published instrument produced the number he is
 * looking at, because a score with no instrument beside it cannot be
 * interpreted at all. The name comes from
 * lib/breathing-check-in/coachCopy.ts, the module no member surface
 * imports, and tests/breathing-check-in-layers.test.ts walks the import
 * graph of every member facing file in the feature and fails if one ever
 * reaches it.
 *
 * THE ORDER IS THE ORDER A COACH READS IT.
 *
 *   THE SCORE AND WHAT THE THRESHOLD MEANS, first, because that is what he
 *     opened the card for. The sentence beside the threshold is the careful
 *     one: it reports a higher burden of the symptoms the instrument asks
 *     about, and it does not say the figure diagnoses anything.
 *   THEN THE HIGHEST-RESPONSE SYMPTOMS, which is a sort of her own answers
 *     and not a finding. The line under it says so, because a list ordered
 *     by magnitude invites a causal read.
 *   THEN THE FOUR COACHING QUESTIONS, which are fixed and are asked of
 *     every reading. A prompt list that changed with the total would be the
 *     app telling him what it thinks is going on.
 *   THEN ALL SIXTEEN RESPONSES, with her answer and its points, because the
 *     total is only readable against what produced it.
 *
 * HISTORY IS A PICKER, NOT AN OVERWRITE. Every completed sitting is kept
 * (migration 231: completion is write once and a retake is a new row), so
 * the list at the top selects which one is being read and the previous
 * values stand beside their dates. NOTHING HERE COMPARES THEM IN WORDS. No
 * percentage, no "improved", no arrow: two numbers and two dates, and the
 * coach draws the conclusion.
 *
 * IT IS A RESULT BLOCK, so it draws nothing at all until there is a
 * sitting behind it. Deciding to SEND it happens on its row in the
 * Assessment Status block at the top of Assessments and Findings, which is
 * where its assigned and waiting states are said.
 *
 * Every row was fetched on the server by
 * getClientBreathingCheckInPanelAction, which is where the coach check and
 * the test-account exclusion live.
 */

import { useState } from 'react';
import { Wind } from 'lucide-react';
import { formatDisplayDate } from '@/lib/time/displayDate';
import { BPC_LABEL } from '@/lib/breathing-check-in/constants';
import { BPC_COACHING_QUESTIONS, BPC_COACH_COPY } from '@/lib/breathing-check-in/coachCopy';
import { bpcScoreSentence } from '@/lib/breathing-check-in/coachView';
import { hasDeepDiveResults } from '@/lib/coach-detail/deepDiveResults';
import type { CoachBpcPanelState } from '@/app/actions/breathingCheckInCoach';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/**
 * A completed sitting's date, in the member's own stored day.
 *
 * `formatDisplayDate` over the bare `YYYY-MM-DD` rather than
 * `toLocaleDateString` on the instant, which is the standing rule: a staff
 * surface reads a bare calendar day and never asks the server's clock what
 * day it is.
 */
function sittingLabel(completedAt: string | null): string {
  if (!completedAt) return 'Unfinished';
  return formatDisplayDate(completedAt.slice(0, 10), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function BreathingCheckInPanel({ state }: { state: CoachBpcPanelState }) {
  const [selectedId, setSelectedId] = useState<string | null>(state.sessions[0]?.id ?? null);

  const selected = state.sessions.find((session) => session.id === selectedId) ?? null;

  // A result block, so nothing to show is nothing to draw. Every hook above
  // has already run, so this return adds no conditional hook.
  if (!hasDeepDiveResults(state)) return null;

  const reading = selected?.reading ?? null;

  return (
    // Named by what it IS rather than by whichever sentence is inside it
    // today, so the pinned search and a test can both address it.
    <section aria-label={BPC_LABEL} className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <Wind className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">{BPC_LABEL}</p>
      </div>

      {/* What the member sees is the name above. What produced the number is
          the name below, and a coach needs both. */}
      <p className="mt-1 text-[13px] text-[#6B7280]">{BPC_COACH_COPY.instrumentHeading}</p>

      {state.pendingStatusLine && (
        <p className="mt-3 rounded-2xl bg-[#FEF6E7] px-4 py-3 text-[13px] leading-relaxed text-[#854D0E]">
          {/* One sentence, written on the server in HER timezone. It says
              when it was sent, whether it has actually reached her screen
              and whether it is late. */}
          {state.pendingStatusLine}
        </p>
      )}

      {/* ============================================================
          HISTORY. Every completed sitting, newest first, and nothing is
          ever overwritten by a later one.
          ============================================================ */}
      {state.sessions.length > 1 && (
        <div className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
            {BPC_COACH_COPY.historyHeading}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {state.sessions.map((session) => {
              const isSelected = session.id === selectedId;
              return (
                <button
                  key={session.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedId(session.id)}
                  className={`mef-focus-ring mef-press rounded-full border px-3.5 py-1.5 text-[13px] transition ${
                    isSelected
                      ? 'border-[#1B3A2D] bg-[#1B3A2D] font-semibold text-white'
                      : 'border-[#1B3A2D]/15 bg-white text-[#1B3A2D] hover:bg-[#F7FAF8]'
                  }`}
                >
                  {/*
                    THE DATE AND THE NUMBER TOGETHER, and no comparison
                    between them. "Previous 31, current 21" is two facts a
                    coach can read; "improved by 32 percent" is an
                    interpretation nobody designed.
                  */}
                  {`${sittingLabel(session.completedAt)}: ${session.reading.totalScore}`}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-[#6B7280]">
            {BPC_COACH_COPY.historyNote}
          </p>
        </div>
      )}

      {reading && (
        <>
          {/* ========================================================
              THE SCORE.
              ======================================================== */}
          <div className="mt-5 rounded-2xl border border-[#1B3A2D]/10 bg-[#F7FAF8] p-5">
            <p className="font-[family-name:var(--font-cormorant-garamond)] text-[26px] leading-tight text-[#1B3A2D]">
              {bpcScoreSentence(reading)}
            </p>

            {!reading.isComplete && (
              <p className="mt-2 text-[13px] leading-relaxed text-[#8A3B2A]">
                {`${BPC_COACH_COPY.partialNote} (${reading.answeredCount} of ${reading.itemCount})`}
              </p>
            )}

            <p className="mt-3 text-[13px] font-semibold text-[#1B3A2D]">
              {BPC_COACH_COPY.thresholdLabel}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#4F645A]">
              {BPC_COACH_COPY.thresholdNote}
            </p>
          </div>

          {/* ========================================================
              HIGHEST-RESPONSE SYMPTOMS. A sort, not a finding.
              ======================================================== */}
          <div className="mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
              {BPC_COACH_COPY.highestHeading}
            </p>

            {reading.highest.length === 0 ? (
              <p className="mt-2 text-[14px] leading-relaxed text-[#4F645A]">
                {BPC_COACH_COPY.highestEmpty}
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {reading.highest.map((row) => (
                  <li key={row.itemId} className="text-[14px] leading-relaxed text-[#1B3A2D]">
                    {`${row.prompt}: ${row.responseLabel}`}
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-2 text-[12px] leading-relaxed text-[#6B7280]">
              {BPC_COACH_COPY.highestNote}
            </p>
          </div>

          {/* ========================================================
              COACHING QUESTIONS. Fixed, and asked of every reading.
              ======================================================== */}
          <div className="mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
              {BPC_COACH_COPY.coachingHeading}
            </p>
            <ul className="mt-2 space-y-1.5">
              {BPC_COACHING_QUESTIONS.map((question) => (
                <li key={question} className="text-[14px] leading-relaxed text-[#1B3A2D]">
                  {question}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] leading-relaxed text-[#6B7280]">
              {BPC_COACH_COPY.coachingNote}
            </p>
          </div>

          {/* ========================================================
              ALL SIXTEEN RESPONSES. The total is only readable against
              what produced it.
              ======================================================== */}
          <div className="mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
              {BPC_COACH_COPY.responsesHeading}
            </p>

            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-[14px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-[#6B7280]">
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      {BPC_COACH_COPY.responseColumnQuestion}
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      {BPC_COACH_COPY.responseColumnResponse}
                    </th>
                    <th scope="col" className="py-2 text-right font-semibold">
                      {BPC_COACH_COPY.responseColumnScore}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1B3A2D]/8">
                  {reading.responses.map((row) => (
                    <tr key={row.itemId}>
                      <th
                        scope="row"
                        className="py-2.5 pr-3 font-normal leading-snug text-[#1B3A2D]"
                      >
                        {row.prompt}
                      </th>
                      <td className="py-2.5 pr-3 leading-snug text-[#4F645A]">
                        {row.responseLabel ?? BPC_COACH_COPY.unansweredLabel}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-[#4F645A]">
                        {row.score ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
