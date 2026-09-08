'use client';

/**
 * The coach's Your Own Company card.
 *
 * BUILT TO FEED THE SESSION, and its order says so.
 *
 * THE THREE LINES ARE AT THE TOP, because they are the session opener on
 * this template: the things she said her voice repeats, in her own words,
 * with the one she said cuts deepest marked. A coach can read those three
 * sentences in ten seconds and open the hour with them.
 *
 * THEN THE REWRITE, BESIDE THE ORIGINAL. The same two sentences her closing
 * screen showed her, side by side and both labelled, because the whole
 * sitting is one being replaced by the other and a coach reading only the
 * rewrite would not know what it replaced.
 *
 * THEN THE INSTINCT PICKS AND THE ROUND, EACH WITH ITS OWN QUESTION. A pick
 * printed on its own is unreadable ("Someone I know"), so every one is
 * printed under the statement it completed. The round's count is the same
 * sentence she was shown, from the same function, so a coach and a member
 * can never be looking at two different numbers.
 *
 * ALL THE WRITTEN ANSWERS, RAW, UNDERNEATH. There is no score here, no
 * pattern and no summary, because this experience produced none. What a
 * coach reads is what she wrote, grouped by the three screens she wrote it
 * on.
 *
 * NO FOLLOW-UP BAND. This template has no follow-up arm at all: it never
 * reads another template's rows, so there is nothing to put beside her
 * answers and no line to write about one.
 *
 * IT IS A RESULT BLOCK NOW (2026-09-08), so it draws nothing at all until
 * there is a sitting behind it. Deciding to SEND it happens on its row in
 * the Assessment Status block at the top of Assessments and Findings,
 * which is where its assigned and waiting states are said. What is left
 * here are the two states that have something to show: a finished sitting,
 * and a finished sitting with a fresh copy still open on her screen.
 *
 * Every row was fetched on the server by getClientYourOwnCompanyPanelAction,
 * which is where the coach check and the test-account exclusion live.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { formatDisplayDate } from '@/lib/time/displayDate';
import { YOC_COACH_COPY, YOC_LABEL, sectionFor } from '@/lib/your-own-company/copy';
import {
  YOC_QUESTIONS,
  yocLeadPromptFor,
  yocPickText,
  yocTallySentence,
} from '@/lib/your-own-company/questions';
import { yocLineText, type YocInstinctState } from '@/lib/your-own-company/instinct';
import { assignYourOwnCompanyAction, type CoachYocPanelState } from '@/app/actions/yourOwnCompany';
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

export function YourOwnCompanyPanel({
  clientId,
  state,
}: {
  clientId: string;
  state: CoachYocPanelState;
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
      const result = await assignYourOwnCompanyAction(clientId);
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
    <section aria-label={YOC_LABEL} className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">{YOC_LABEL}</p>
      </div>

      {state.pendingStatusLine ? (
        <div className="mt-3">
          {/*
            One sentence, written on the server
            (getClientYourOwnCompanyPanelAction). It says when it was sent,
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
            Nothing open right now. Sending it again starts a fresh sitting and keeps everything
            below.
          </p>
          <button
            type="button"
            onClick={assign}
            disabled={isPending}
            className="mef-focus-ring mef-press mt-3 rounded-full bg-[#1B3A2D] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#163025] disabled:opacity-50"
          >
            {isPending ? 'Sending' : `Assign ${YOC_LABEL}`}
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
              <TheLines instinct={selected.instinct} />

              <TheRewrite instinct={selected.instinct} rewrite={selected.rewrittenLine} />

              <ThePicks instinct={selected.instinct} />

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                  {YOC_COACH_COPY.answersHeading}
                </p>
                {([1, 2, 3] as const).map((screen) => (
                  <div key={screen} className="mt-4">
                    <p className="text-sm font-semibold text-[#1B3A2D]">
                      {sectionFor(screen).title}
                    </p>
                    <dl className="mt-2 space-y-3">
                      {YOC_QUESTIONS.filter((question) => question.screen === screen).map(
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

/**
 * Her question three lines, plainly, with the one she named marked.
 *
 * NOTHING IS INTERPRETED. There is no ordering by severity here, no count
 * that means something, and no sentence about what three lines say about
 * anybody. It is the list she wrote, in her order, with the one thing she
 * said about it.
 */
function TheLines({ instinct }: { instinct: YocInstinctState }) {
  return (
    <div className="rounded-2xl border border-[#E7EDE9] bg-[#F9FBFA] p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
        {YOC_COACH_COPY.linesHeading}
      </p>

      {instinct.lines.length === 0 ? (
        <p className="mt-2 text-sm text-[#6B7A72]">{YOC_COACH_COPY.noLines}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {instinct.lines.map((line) => {
            const deepest = line.id === instinct.deepestCutLineId;
            return (
              <li
                key={line.id}
                className={`rounded-xl border px-3 py-2 ${
                  deepest ? 'border-[#C4A050] bg-[#FDF9EF]' : 'border-[#E7EDE9] bg-white'
                }`}
              >
                {deepest && (
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#854D0E]">
                    {YOC_COACH_COPY.deepestLabel}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words font-[family-name:var(--font-cormorant-garamond)] text-[17px] leading-relaxed text-[#1B3A2D]">
                  {line.text}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {instinct.lines.length > 0 && !instinct.deepestCutLineId && (
        <p className="mt-3 text-sm text-[#3F5B50]">{YOC_COACH_COPY.noDeepest}</p>
      )}
    </div>
  );
}

/**
 * The line she named and the rewrite of it, side by side.
 *
 * BOTH, ALWAYS, AND LABELLED. The rewrite on its own would read as a
 * pleasant sentence with nothing behind it. The pair is the sitting.
 */
function TheRewrite({ instinct, rewrite }: { instinct: YocInstinctState; rewrite: string | null }) {
  const original = yocLineText(instinct, instinct.deepestCutLineId);

  return (
    <div className="rounded-2xl border border-[#C4A050]/40 bg-[#FDF9EF] p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
        {YOC_COACH_COPY.rewriteHeading}
      </p>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7A72]">
            {YOC_COACH_COPY.originalLabel}
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words font-[family-name:var(--font-cormorant-garamond)] text-[18px] leading-relaxed text-[#1B3A2D]">
            {original ?? YOC_COACH_COPY.noDeepest}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#854D0E]">
            {YOC_COACH_COPY.rewriteLabel}
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words font-[family-name:var(--font-cormorant-garamond)] text-[18px] leading-relaxed text-[#1B3A2D]">
            {rewrite ?? YOC_COACH_COPY.noPick}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Her three picks and her round, each printed under the question it answers.
 *
 * THE QUESTION IS PRINTED WITH THE ANSWER, always, because "Someone I know"
 * on its own is not a readable fact about anybody. The round's count is the
 * same sentence she read on her own screen, from the same function.
 */
function ThePicks({ instinct }: { instinct: YocInstinctState }) {
  const picks = YOC_QUESTIONS.filter((question) => question.kind === 'instinct');

  return (
    <div className="rounded-2xl border border-[#E7EDE9] bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
        {YOC_COACH_COPY.picksHeading}
      </p>

      <dl className="mt-3 space-y-3">
        {picks.map((question) => (
          <div key={question.key}>
            <dt className="text-sm text-[#6B7A72]">{yocLeadPromptFor(question)}</dt>
            <dd className="mt-0.5 text-sm font-semibold text-[#1B3A2D]">
              {yocPickText(instinct, question) ?? YOC_COACH_COPY.noPick}
            </dd>
          </div>
        ))}

        <div>
          <dt className="text-sm text-[#6B7A72]">{YOC_COACH_COPY.roundLabel}</dt>
          <dd className="mt-0.5 text-sm font-semibold text-[#1B3A2D]">
            {yocTallySentence(instinct)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
