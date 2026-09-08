'use client';

/**
 * The coach's The Life You're Building card.
 *
 * BUILT TO FEED THE SESSION, and its order says so.
 *
 * THE THREE POSITIONS ARE AT THE TOP, in words rather than as numbers,
 * because they are the fastest read on this template: where she put herself
 * on three lines, each one under the statement she was completing. A coach
 * can take those three sentences in ten seconds and know what the hour is
 * about. The sentence beside each mark comes from the same function the
 * member's own screen used, so a coach and a member can never be looking at
 * two different descriptions of one mark.
 *
 * THEN THE FIRST STONE, AS THE SESSION OPENER. It is the one concrete
 * commitment in the whole sitting, dated to the next seven days, and it is
 * the thing to hold her to. Everything else here is context for it.
 *
 * THEN THE THEN/NOW PAIR, WHEN THE FOLLOW-UP RAN. The sentence she left in
 * Owning Your Value beside what she says back to it today, both labelled,
 * under a band that names where the first one came from. A sitting that ran
 * standalone says so rather than showing nothing, so a coach never has to
 * guess whether the follow-up failed.
 *
 * ALL THE WRITTEN ANSWERS, RAW, UNDERNEATH, grouped by the three screens
 * she wrote them on. There is no score here, no pattern and no summary,
 * because this experience produced none. What a coach reads is what she
 * wrote.
 *
 * IT IS A RESULT BLOCK NOW (2026-09-08), so it draws nothing at all until
 * there is a sitting behind it. Deciding to SEND it happens on its row in
 * the Assessment Status block at the top of Assessments and Findings,
 * which is where its assigned and waiting states are said. What is left
 * here are the two states that have something to show: a finished sitting,
 * and a finished sitting with a fresh copy still open on her screen.
 *
 * Every row was fetched on the server by
 * getClientTheLifeYoureBuildingPanelAction, which is where the coach check
 * and the test-account exclusion live.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { formatDisplayDate } from '@/lib/time/displayDate';
import { hddPolePositionInWords } from '@/lib/happiness-deep-dive/interactive';
import { TLYB_COACH_COPY, TLYB_LABEL, sectionFor } from '@/lib/the-life-youre-building/copy';
import {
  TLYB_FOLLOW_UP_KEY,
  TLYB_QUESTIONS,
  followUpPromptFor,
  tlybLeadPromptFor,
} from '@/lib/the-life-youre-building/questions';
import { tlybPositionFor, type TlybSliderState } from '@/lib/the-life-youre-building/sliders';
import {
  assignTheLifeYoureBuildingAction,
  type CoachTlybPanelState,
  type CoachTlybSession,
} from '@/app/actions/theLifeYoureBuilding';
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

/**
 * The wording a question was shown in, for THIS sitting.
 *
 * Only question nine can differ, and it differs by what the ROW records
 * rather than by what is true today, so a coach reads the question the
 * member was actually asked.
 */
function promptForSitting(session: CoachTlybSession, key: string): string {
  const question = TLYB_QUESTIONS.find((entry) => entry.key === key);
  if (!question) return '';
  if (key !== TLYB_FOLLOW_UP_KEY) return question.prompt;
  if (!session.followUpSourceExperienceKey || !session.followUpSourceAnswer) {
    return question.prompt;
  }
  return followUpPromptFor(session.followUpSourceAnswer);
}

export function TheLifeYoureBuildingPanel({
  clientId,
  state,
}: {
  clientId: string;
  state: CoachTlybPanelState;
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
      const result = await assignTheLifeYoureBuildingAction(clientId);
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
    <section aria-label={TLYB_LABEL} className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">{TLYB_LABEL}</p>
      </div>

      {state.pendingStatusLine ? (
        <div className="mt-3">
          {/*
            One sentence, written on the server
            (getClientTheLifeYoureBuildingPanelAction). It says when it was
            sent, whether it has actually reached her screen
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
            {isPending ? 'Sending' : `Assign ${TLYB_LABEL}`}
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
              <ThePositions sliders={selected.sliders} />

              <TheFirstStone session={selected} />

              {selected.followUpSourceExperienceKey ? (
                <div
                  aria-label={TLYB_COACH_COPY.followUpHeading}
                  className="rounded-2xl border border-[#1B3A2D]/15 bg-[#F3F6F4] p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#1B3A2D]">
                    {TLYB_COACH_COPY.followUpHeading}
                  </p>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7A72]">
                        {TLYB_COACH_COPY.followUpThenLabel}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#3F5B50]">
                        {selected.followUpSourceAnswer ?? TLYB_COACH_COPY.followUpMissingThen}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7A72]">
                        {TLYB_COACH_COPY.followUpNowLabel}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#3F5B50]">
                        {selected.answers[TLYB_FOLLOW_UP_KEY]}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[#6B7A72]">{TLYB_COACH_COPY.standaloneNote}</p>
              )}

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                  {TLYB_COACH_COPY.answersHeading}
                </p>
                {([1, 2, 3] as const).map((screen) => (
                  <div key={screen} className="mt-4">
                    <p className="text-sm font-semibold text-[#1B3A2D]">
                      {sectionFor(screen).title}
                    </p>
                    <dl className="mt-2 space-y-3">
                      {TLYB_QUESTIONS.filter((question) => question.screen === screen).map(
                        (question) => (
                          <div key={question.key}>
                            <dt className="text-sm font-medium text-[#1B3A2D]">
                              {promptForSitting(selected, question.key)}
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
 * Her three marks, in words, each under the statement it completed.
 *
 * NOTHING IS INTERPRETED. There is no total here, no average of the three,
 * no band and no adjective. Each line is her position between the two words
 * she was given, from hddPolePositionInWords, which is the same function
 * her own screen read.
 */
function ThePositions({ sliders }: { sliders: TlybSliderState }) {
  const lines = TLYB_QUESTIONS.filter((question) => question.kind === 'slider');

  return (
    <div className="rounded-2xl border border-[#E7EDE9] bg-[#F9FBFA] p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
        {TLYB_COACH_COPY.slidersHeading}
      </p>
      <dl className="mt-3 space-y-3">
        {lines.map((question) => {
          const value = tlybPositionFor(sliders, question.key);
          return (
            <div key={question.key}>
              <dt className="text-sm text-[#6B7A72]">{tlybLeadPromptFor(question)}</dt>
              <dd className="mt-0.5 text-sm font-semibold text-[#1B3A2D]">
                {value === null || !question.poles
                  ? TLYB_COACH_COPY.noPosition
                  : hddPolePositionInWords(value, question.poles)}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/**
 * Question eight, on its own, as the thing to open the session with.
 *
 * Read from the row's own column (migration 219) rather than out of the
 * answer sheet, so a coach and any later feature are reading the same
 * stored string.
 */
function TheFirstStone({ session }: { session: CoachTlybSession }) {
  return (
    <div className="rounded-2xl border border-[#C4A050]/40 bg-[#FDF9EF] p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
        {TLYB_COACH_COPY.openerHeading}
      </p>
      <p className="mt-1 text-xs text-[#6B7A72]">{TLYB_COACH_COPY.openerNote}</p>
      <p className="mt-2 whitespace-pre-wrap break-words font-[family-name:var(--font-cormorant-garamond)] text-[20px] leading-relaxed text-[#1B3A2D]">
        {session.firstStone ?? TLYB_COACH_COPY.noStone}
      </p>
    </div>
  );
}
