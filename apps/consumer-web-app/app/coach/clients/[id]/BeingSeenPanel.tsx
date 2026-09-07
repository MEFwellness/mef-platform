'use client';

/**
 * The coach's Being Seen card.
 *
 * BUILT TO FEED THE SESSION, and its order says so.
 *
 * QUESTION NINE OPENS IT. "One thing you wish someone would notice about
 * you without being told" is lifted out of the answer list and sits at the
 * top, on its own, in her own words with nothing added. It is deliberately
 * the same question as the one her closing screen printed back to her and
 * the one migration 215 stores in noticed_wish, and on this template that
 * is correct rather than redundant: it is the one answer a coach can act on
 * in the first minute of a session, by noticing it out loud.
 *
 * ALL NINE ANSWERS, RAW, UNDERNEATH. There is no score here, no pattern and
 * no summary, because this experience produced none. What a coach reads is
 * what she wrote, grouped by the three screens she wrote it on.
 *
 * NO FOLLOW-UP BAND. This template has no follow-up arm at all: it never
 * reads another template's rows, so there is nothing to put beside her
 * answers and no line to write about one.
 *
 * THREE STATES, SAID AS THREE DIFFERENT THINGS: not assigned (with the
 * button), assigned and waiting, and finished.
 *
 * Every row was fetched on the server by getClientBeingSeenPanelAction,
 * which is where the coach check and the test-account exclusion live.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { formatDisplayDate } from '@/lib/time/displayDate';
import { BSN_COACH_COPY, BSN_LABEL, sectionFor } from '@/lib/being-seen/copy';
import { BSN_OPENER_KEY, BSN_QUESTIONS } from '@/lib/being-seen/questions';
import { assignBeingSeenAction, type CoachBsnPanelState } from '@/app/actions/beingSeen';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function sittingLabel(completedAt: string | null): string {
  if (!completedAt) return 'Unfinished';
  return formatDisplayDate(completedAt.slice(0, 10), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function BeingSeenPanel({
  clientId,
  state,
}: {
  clientId: string;
  state: CoachBsnPanelState;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(state.sessions[0]?.id ?? null);

  const selected = state.sessions.find((session) => session.id === selectedId) ?? null;

  function assign() {
    setError(null);
    startTransition(async () => {
      const result = await assignBeingSeenAction(clientId);
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
    <section aria-label={BSN_LABEL} className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">{BSN_LABEL}</p>
      </div>

      {state.pendingStatusLine ? (
        <div className="mt-3">
          {/*
            One sentence, written on the server
            (getClientBeingSeenPanelAction). It says when it was sent,
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
            {isPending ? 'Sending' : `Assign ${BSN_LABEL}`}
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
              {/* The session opener, above the full answer list. */}
              <div className="rounded-2xl border border-[#C4A050]/40 bg-[#FDF9EF] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
                  {BSN_COACH_COPY.openerHeading}
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words font-[family-name:var(--font-cormorant-garamond)] text-[20px] leading-relaxed text-[#1B3A2D]">
                  {selected.answers[BSN_OPENER_KEY]}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                  {BSN_COACH_COPY.answersHeading}
                </p>
                {([1, 2, 3] as const).map((screen) => (
                  <div key={screen} className="mt-4">
                    <p className="text-sm font-semibold text-[#1B3A2D]">
                      {sectionFor(screen).title}
                    </p>
                    <dl className="mt-2 space-y-3">
                      {BSN_QUESTIONS.filter((question) => question.screen === screen).map(
                        (question) => (
                          <div key={question.key}>
                            <dt className="text-sm font-medium text-[#1B3A2D]">
                              {question.prompt}
                            </dt>
                            <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#3F5B50]">
                              {selected.answers![question.key]}
                            </dd>
                          </div>
                        )
                      )}
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
