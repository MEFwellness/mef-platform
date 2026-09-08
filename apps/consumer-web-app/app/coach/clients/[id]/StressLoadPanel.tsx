'use client';

/**
 * The coach's Stress & Load Deep-Dive card.
 *
 * BUILT TO FEED THE SESSION, and everything about its order says so.
 *
 * WHAT SHE WOULD DROP TOMORROW OPENS IT. Q4 is lifted out of the answer
 * list and sits at the top, on its own, because it is the sentence a coach
 * should read first and the one the conversation starts from. It is her own
 * words, unedited.
 *
 * THE TWO SIDES ARE SHOWN SEPARATELY, never as one figure. The pattern name
 * sits above them, and the identical reading component the member read
 * renders both bands from the identical stored descriptors, so the coach
 * and the member are looking at one picture rather than two.
 *
 * WHAT TO PROTECT IS CALLED OUT BY NAME. Her recovery sources (Q9) and her
 * lean-on answers (Q11) are listed plainly, because a coach who does not
 * know what is already working can accidentally spend it.
 *
 * IT IS A RESULT BLOCK NOW (2026-09-08), so it draws nothing at all until
 * there is a sitting behind it. Deciding to SEND it happens on its row in
 * the Assessment Status block at the top of Assessments and Findings,
 * which is where its assigned and waiting states are said. What is left
 * here are the two states that have something to show: a finished sitting,
 * and a finished sitting with a fresh copy still open on her screen.
 *
 * Prior sittings are selectable chips, newest first and open on arrival,
 * exactly as the Weekly Reflection panel beside it does it.
 *
 * Every row was fetched on the server by getClientStressLoadPanelAction,
 * which is where the coach check and the test-account exclusion live.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Scale } from 'lucide-react';
import { formatDisplayDate } from '@/lib/time/displayDate';
import { StressLoadReadingBody } from '@/components/stress-load/StressLoadReadingBody';
import {
  STRESS_LOAD_ANSWERS_HEADING,
  STRESS_LOAD_LABEL,
  STRESS_LOAD_OPENER_HEADING,
  leanOnLabels,
  listSentence,
  recoverySourceLabels,
  sectionFor,
} from '@/lib/stress-load/copy';
import { STRESS_LOAD_QUESTIONS, readableAnswer } from '@/lib/stress-load/questions';
import {
  assignStressLoadDeepDiveAction,
  type CoachStressLoadPanelState,
} from '@/app/actions/stressLoad';
import { hasDeepDiveResults } from '@/lib/coach-detail/deepDiveResults';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function sittingLabel(completedAt: string | null): string {
  if (!completedAt) return 'Unfinished';
  return formatDisplayDate(completedAt.slice(0, 10), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function StressLoadPanel({
  clientId,
  state,
}: {
  clientId: string;
  state: CoachStressLoadPanelState;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(state.sessions[0]?.id ?? null);

  const selected = state.sessions.find((session) => session.id === selectedId) ?? null;

  /*
    A RESULT BLOCK, SO NOTHING TO SHOW IS NOTHING TO DRAW (2026-09-08).
    The decision to send this lives on its row in the Assessment Status
    block at the top of Assessments and Findings. A panel with no sitting
    behind it therefore has no finding, no narrative and no button, and it
    renders nothing rather than a card repeating one sentence. Every hook
    above has already run, so this return adds no conditional hook.
  */
  if (!hasDeepDiveResults(state)) return null;

  function assign() {
    setError(null);
    startTransition(async () => {
      const result = await assignStressLoadDeepDiveAction(clientId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <Scale className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">{STRESS_LOAD_LABEL}</p>
      </div>

      {state.pendingStatusLine ? (
        <div className="mt-3">
          {/*
            One sentence, written on the server (getClientStressLoadPanelAction).
            It says when it was sent, whether it has actually reached her
            screen (member_assignment_deliveries, migration 210) and whether
            it is late, from the same resolver every other coach assignment
            on this page reads. The panel formats none of it, because its
            day names belong to the member's timezone and this component
            renders in the coach's.

            Branching on the SENTENCE rather than on pendingAssignedAt: the
            two are written together and a line is what this branch has to
            print, so there is no fallback here that could ship untested.
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
            Nothing open right now. Sending it again starts a fresh sitting and keeps everything
            below.
          </p>
          <button
            type="button"
            onClick={assign}
            disabled={isPending}
            className="mef-focus-ring mef-press mt-3 rounded-full bg-[#1B3A2D] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#163025] disabled:opacity-50"
          >
            {isPending ? 'Sending' : `Assign ${STRESS_LOAD_LABEL}`}
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

          {selected && selected.answers && selected.interpretation ? (
            <div className="mt-4 space-y-5">
              {/* The session opener, above everything else. */}
              <div className="rounded-2xl border border-[#C4A050]/40 bg-[#FDF9EF] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
                  {STRESS_LOAD_OPENER_HEADING}
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-[#1B3A2D]">
                  {selected.answers.load_would_drop}
                </p>
              </div>

              <StressLoadReadingBody
                interpretation={selected.interpretation}
                answers={selected.answers}
                tone="light"
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[#1B3A2D]/10 bg-[#F3F6F4] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                    What restores them
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[#3F5B50]">
                    {listSentence(recoverySourceLabels(selected.answers))}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#1B3A2D]/10 bg-[#F3F6F4] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                    Who they can lean on
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[#3F5B50]">
                    {listSentence(leanOnLabels(selected.answers))}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                  {STRESS_LOAD_ANSWERS_HEADING}
                </p>
                {([1, 2, 3] as const).map((screen) => (
                  <div key={screen} className="mt-4">
                    <p className="text-sm font-semibold text-[#1B3A2D]">
                      {sectionFor(screen).name}
                    </p>
                    <dl className="mt-2 space-y-3">
                      {STRESS_LOAD_QUESTIONS.filter((question) => question.screen === screen).map(
                        (question) => (
                          <div key={question.key}>
                            <dt className="text-sm font-medium text-[#1B3A2D]">
                              {question.prompt}
                            </dt>
                            <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#3F5B50]">
                              {readableAnswer(question, selected.answers!).join(', ')}
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
