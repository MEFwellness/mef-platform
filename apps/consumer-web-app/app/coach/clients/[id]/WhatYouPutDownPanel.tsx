'use client';

/**
 * The coach's What You Put Down card.
 *
 * BUILT TO FEED THE SESSION, and its order says so.
 *
 * THE SHELF IS AT THE TOP, because on this template the shelf is the
 * sitting. It is every line she wrote at question one, in the order she
 * shelved them, with two of them marked: the one that stings most to read
 * back, and the one she said still has a pulse. Beside them, where she put
 * her mark on question five's line, IN WORDS rather than as a number,
 * because a number there would look like a score and this experience scores
 * nothing.
 *
 * QUESTION SEVEN OPENS THE SESSION. The card she lifted back off the shelf
 * sits on its own, in her own words with nothing added, because it is the
 * one part of herself she said is not finished and it is the thing a coach
 * can act on in the first minute.
 *
 * ALL THE WRITTEN ANSWERS, RAW, UNDERNEATH. There is no score here, no
 * pattern and no summary, because this experience produced none. What a
 * coach reads is what she wrote, grouped by the three screens she wrote it
 * on. The two shelf questions appear in that list as the choices she made,
 * not as prose she did not write.
 *
 * NO FOLLOW-UP BAND. This template has no follow-up arm at all: it never
 * reads another template's rows, so there is nothing to put beside her
 * answers and no line to write about one.
 *
 * THREE STATES, SAID AS THREE DIFFERENT THINGS: not assigned (with the
 * button), assigned and waiting, and finished.
 *
 * Every row was fetched on the server by getClientWhatYouPutDownPanelAction,
 * which is where the coach check and the test-account exclusion live.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { formatDisplayDate } from '@/lib/time/displayDate';
import { hddPolePositionInWords } from '@/lib/happiness-deep-dive/interactive';
import { WYPD_COACH_COPY, WYPD_LABEL, sectionFor } from '@/lib/what-you-put-down/copy';
import { WYPD_QUESTIONS, wypdWritesProse } from '@/lib/what-you-put-down/questions';
import {
  WYPD_POLES,
  wypdCardText,
  wypdPlacedCards,
  type WypdShelfState,
} from '@/lib/what-you-put-down/shelf';
import {
  assignWhatYouPutDownAction,
  type CoachWypdPanelState,
} from '@/app/actions/whatYouPutDown';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function sittingLabel(completedAt: string | null): string {
  if (!completedAt) return 'Unfinished';
  return formatDisplayDate(completedAt.slice(0, 10), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function WhatYouPutDownPanel({
  clientId,
  state,
}: {
  clientId: string;
  state: CoachWypdPanelState;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(state.sessions[0]?.id ?? null);

  const selected = state.sessions.find((session) => session.id === selectedId) ?? null;

  function assign() {
    setError(null);
    startTransition(async () => {
      const result = await assignWhatYouPutDownAction(clientId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    // Named, so this card is addressable by what it IS rather than by
    // whichever sentence happens to be inside it today.
    <section aria-label={WYPD_LABEL} className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">{WYPD_LABEL}</p>
      </div>

      {state.pendingStatusLine ? (
        <div className="mt-3">
          {/*
            One sentence, written on the server
            (getClientWhatYouPutDownPanelAction). It says when it was sent,
            whether it has actually reached her screen
            (member_assignment_deliveries, migration 210) and whether it is
            late, from the same resolver every other coach assignment on
            this page reads.
          */}
          <p className="text-sm text-[#6B7A72]">{state.pendingStatusLine}</p>
          {state.pendingProgress?.due.isOverdue && (
            <span className="mt-2 inline-flex items-center rounded-full bg-[#FDECEC] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#9B2C2C]">
              Overdue
            </span>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-[#6B7A72]">
            {state.sessions.length === 0
              ? 'Not assigned. Nothing about this is offered to them until you send it.'
              : 'Nothing open right now. Sending it again starts a fresh sitting and keeps everything below.'}
          </p>
          <button
            type="button"
            onClick={assign}
            disabled={isPending}
            className="mef-focus-ring mef-press mt-3 rounded-full bg-[#1B3A2D] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#163025] disabled:opacity-50"
          >
            {isPending ? 'Sending' : `Assign ${WYPD_LABEL}`}
          </button>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}

      {state.sessions.length > 0 && (
        <div className="mt-5">
          {state.sessions.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {state.sessions.map((session) => {
                const active = session.id === selectedId;
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedId(session.id)}
                    aria-pressed={active}
                    className={`mef-focus-ring mef-press rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                      active
                        ? 'bg-[#1B3A2D] text-[#F5F0E4]'
                        : 'bg-[#F3F6F4] text-[#1B3A2D] hover:bg-[#E7EDE9]'
                    }`}
                  >
                    {sittingLabel(session.completedAt)}
                  </button>
                );
              })}
            </div>
          )}

          {selected && selected.answers ? (
            <div className="mt-4 space-y-5">
              <TheShelf shelf={selected.shelf} />

              {/* The session opener, above the written answers. */}
              <div className="rounded-2xl border border-[#C4A050]/40 bg-[#FDF9EF] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
                  {WYPD_COACH_COPY.openerHeading}
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words font-[family-name:var(--font-cormorant-garamond)] text-[20px] leading-relaxed text-[#1B3A2D]">
                  {wypdCardText(selected.shelf, selected.shelf.liftedCardId) ??
                    WYPD_COACH_COPY.noShelf}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                  {WYPD_COACH_COPY.answersHeading}
                </p>
                {([1, 2, 3] as const).map((screen) => (
                  <div key={screen} className="mt-4">
                    <p className="text-sm font-semibold text-[#1B3A2D]">
                      {sectionFor(screen).title}
                    </p>
                    <dl className="mt-2 space-y-3">
                      {WYPD_QUESTIONS.filter(
                        (question) => question.screen === screen && wypdWritesProse(question)
                      ).map((question) => (
                        <div key={question.key}>
                          <dt className="text-sm font-medium text-[#1B3A2D]">{question.prompt}</dt>
                          <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#3F5B50]">
                            {selected.answers![question.key]}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            </div>
          ) : selected ? (
            <p className="mt-4 text-sm text-[#6B7A72]">
              The stored answers for this sitting could not be read.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

/**
 * Her shelf, rendered plainly: every card in the order she placed them,
 * with her two picks marked and her position on the line in words.
 *
 * NOTHING IS INTERPRETED. There is no ordering by importance here, no count
 * that means something, and no sentence about what a shelf of nine cards
 * says about anybody. It is the list she made, in her order, with the two
 * things she said about it.
 */
function TheShelf({ shelf }: { shelf: WypdShelfState }) {
  const cards = wypdPlacedCards(shelf);
  const distance =
    shelf.distance === null
      ? WYPD_COACH_COPY.noDistance
      : `${WYPD_COACH_COPY.distanceLabel}: ${hddPolePositionInWords(shelf.distance, WYPD_POLES)}`;

  return (
    <div className="rounded-2xl border border-[#E7EDE9] bg-[#F9FBFA] p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
        {WYPD_COACH_COPY.shelfHeading}
      </p>

      {cards.length === 0 ? (
        <p className="mt-2 text-sm text-[#6B7A72]">{WYPD_COACH_COPY.noShelf}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {cards.map((card) => {
            const isSting = card.id === shelf.stingCardId;
            const isLifted = card.id === shelf.liftedCardId;
            return (
              <li
                key={card.id}
                className={`rounded-xl border px-3 py-2 ${
                  isLifted
                    ? 'border-[#C4A050] bg-[#FDF9EF]'
                    : isSting
                      ? 'border-[#C4A050]/45 bg-white'
                      : 'border-[#E7EDE9] bg-white'
                }`}
              >
                {(isSting || isLifted) && (
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#854D0E]">
                    {[isSting ? WYPD_COACH_COPY.stingLabel : null, isLifted ? WYPD_COACH_COPY.liftedLabel : null]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words font-[family-name:var(--font-cormorant-garamond)] text-[17px] leading-relaxed text-[#1B3A2D]">
                  {card.text}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-sm text-[#3F5B50]">{distance}</p>
    </div>
  );
}
