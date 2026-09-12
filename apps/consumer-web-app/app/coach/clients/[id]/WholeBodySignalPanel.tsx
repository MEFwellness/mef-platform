'use client';

/**
 * The coach's MEF Whole-Body Signal Assessment card.
 *
 * THE ORDER IS THE DECISION SUPPORT, and it is the order the brief asks
 * for:
 *
 *   1. Primary coaching priorities, with the two buttons under them.
 *   2. The signal map: every section, its score and its colour, compact
 *      enough to read the whole client in about five seconds.
 *   3. The Whole-Body Signal Load, its three components, and its change.
 *   4. Why this scored high, per section, with View All Answers.
 *   5. The Zone pattern panel, primary and secondary, each with the
 *      contributors that put it there.
 *   6. The associated coaching map: the verbatim organ and gland list, the
 *      spinal segments and the chakra lens.
 *   7. The cross section patterns that fired.
 *   8. Questions worth exploring, with asked, copy, hide and save.
 *   9. Choose coaching focus, holding his own choice beside the
 *      recommendation rather than instead of it.
 *  10. Reassessment, when there is a previous sitting to compare against.
 *
 * IT IS AN INTERPRETATION PANEL, NEVER A DIAGNOSIS PANEL, and it says so
 * in its own stored words. There is no Zone exercise, instruction, media
 * or hint anywhere in this feature to put beside it, and no anatomy
 * illustration: the associated map is text, exactly as the brief asks.
 *
 * NOTHING HERE WRITES A SENTENCE ABOUT A PATTERN. Every pattern line and
 * every coaching question is a column on the row that fired. The one
 * assembled sentence, the Zone contribution line, is built in
 * lib/whole-body-signal/coachView.ts from three stored fragments plus her
 * own top coach topics.
 *
 * IT IS A RESULT BLOCK, so it draws nothing at all until there is a
 * sitting behind it. Deciding to SEND it happens on its row in the
 * Assessment Status block at the top of Assessments and Findings.
 */

import { useMemo, useState, useTransition } from 'react';
import { Activity, Check, ChevronDown, Copy, EyeOff, Bookmark } from 'lucide-react';
import { formatDisplayDate } from '@/lib/time/displayDate';
import { hasDeepDiveResults } from '@/lib/coach-detail/deepDiveResults';
import { WBS_LABEL } from '@/lib/whole-body-signal/constants';
import { coachCopy } from '@/lib/whole-body-signal/copyKeys';
import { buildCoachReadingView } from '@/lib/whole-body-signal/coachView';
import {
  setWholeBodySignalFocusAction,
  setWholeBodySignalQuestionActionAction,
  type CoachWbsPanelState,
} from '@/app/actions/wholeBodySignal';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const SECTION_HEADING = 'text-xs font-semibold uppercase tracking-wider text-[#6B7A72]';
const BLOCK = 'rounded-2xl border border-[#1B3A2D]/8 bg-[#FBFAF7] p-4';

/** The coach's four colours. Direct, on the coach side only. */
const COLOR: Record<string, string> = {
  green: '#4E8C6A',
  yellow: '#C4A050',
  orange: '#C8803F',
  red: '#C4634A',
};

function sittingLabel(completedAt: string | null): string {
  if (!completedAt) return 'Unfinished';
  return formatDisplayDate(completedAt.slice(0, 10), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** A signed whole number, printed the way a coach reads it: 88 to 57, minus 31. */
function signed(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

export function WholeBodySignalPanel({ state }: { state: CoachWbsPanelState }) {
  const [selectedId, setSelectedId] = useState<string | null>(state.sessions[0]?.id ?? null);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [openAnswers, setOpenAnswers] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [focusBySession, setFocusBySession] = useState<Record<string, string>>(() =>
    Object.fromEntries(state.focus.map((entry) => [entry.sessionId, entry.sectionKey]))
  );
  const [actions, setActions] = useState(() =>
    Object.fromEntries(
      state.questionActions.map((entry) => [
        `${entry.sessionId}:${entry.questionKey}`,
        { asked: entry.askedAt !== null, hidden: entry.hiddenAt !== null, saved: entry.savedAt !== null },
      ])
    )
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = state.sessions.find((session) => session.id === selectedId) ?? null;
  const previous = useMemo(() => {
    if (!selected) return null;
    const index = state.sessions.findIndex((session) => session.id === selected.id);
    const older = state.sessions[index + 1];
    // A sitting with no stored results cannot be read, so it is not
    // compared against either. Nothing is invented for it.
    return older && older.results ? older : null;
  }, [selected, state.sessions]);

  const content = state.content;

  const view = useMemo(() => {
    if (!content || !selected?.results) return null;
    return buildCoachReadingView({
      content,
      answers: selected.answers,
      results: selected.results,
      previous:
        previous && previous.results
          ? { answers: previous.answers, results: previous.results }
          : null,
    });
  }, [content, selected, previous]);

  // Every hook above has already run, so this return adds no conditional
  // hook. A panel with no sitting behind it has nothing to say.
  if (!hasDeepDiveResults(state)) return null;

  const copy = content?.coachCopy ?? {};
  const sectionNameOf = (key: string) =>
    content?.sections.find((entry) => entry.sectionKey === key)?.displayName ?? key;

  const chosenFocus = selected ? (focusBySession[selected.id] ?? null) : null;
  const previousFocus = previous ? (focusBySession[previous.id] ?? null) : null;

  function chooseFocus(sectionKey: string) {
    if (!selected || !state.memberId) return;
    setError(null);
    startTransition(async () => {
      const result = await setWholeBodySignalFocusAction(selected.id, state.memberId, sectionKey);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFocusBySession((current) => ({ ...current, [selected.id]: result.sectionKey }));
      setChoosing(false);
    });
  }

  function markQuestion(questionKey: string, patch: { asked?: boolean; hidden?: boolean; saved?: boolean }) {
    if (!selected || !state.memberId) return;
    const mapKey = `${selected.id}:${questionKey}`;
    setError(null);
    startTransition(async () => {
      const result = await setWholeBodySignalQuestionActionAction(
        selected.id,
        state.memberId,
        questionKey,
        patch
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setActions((current) => ({
        ...current,
        [mapKey]: {
          asked: result.action.askedAt !== null,
          hidden: result.action.hiddenAt !== null,
          saved: result.action.savedAt !== null,
        },
      }));
    });
  }

  async function copyQuestion(questionKey: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(questionKey);
      window.setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      setError('Copying is not available in this browser.');
    }
  }

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#1B3A2D]">
        <Activity className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">{WBS_LABEL}</p>
      </div>

      {state.pendingStatusLine && (
        <div className="mt-3">
          <p className="text-sm text-[#6B7A72]">{state.pendingStatusLine}</p>
          {state.pendingProgress?.due.isOverdue && (
            <span className="mt-2 inline-flex items-center rounded-full bg-[#FDECEC] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#9B2C2C]">
              Overdue
            </span>
          )}
        </div>
      )}

      {state.sessions.length > 1 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {state.sessions.map((session) => {
            const active = session.id === selectedId;
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => {
                  setSelectedId(session.id);
                  setOpenSection(null);
                  setOpenAnswers(null);
                  setChoosing(false);
                }}
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

      {!view || !selected ? (
        <p className="mt-4 text-sm text-[#6B7A72]">
          The stored answers for this sitting could not be read.
        </p>
      ) : (
        <div className="mt-5 space-y-6">
          {error && (
            <p role="alert" className="text-sm text-[#9B2C2C]">
              {error}
            </p>
          )}

          {/* 1. PRIMARY COACHING PRIORITIES ------------------------- */}
          <div className="rounded-2xl border-2 border-[#C4A050]/35 bg-[#FDFBF4] p-4">
            <p className={SECTION_HEADING}>{coachCopy(copy, 'coach.priorities_heading')}</p>
            {view.priorities.length === 0 ? (
              <p className="mt-2 text-sm text-[#6B7A72]">{view.prioritiesLine}</p>
            ) : (
              <>
                <ul className="mt-3 space-y-2">
                  {view.priorities.map((row) => (
                    <li
                      key={row.sectionKey}
                      className="flex items-center justify-between gap-3 rounded-xl bg-white px-3.5 py-2.5"
                    >
                      <span className="text-sm font-semibold text-[#1B3A2D]">{row.sectionName}</span>
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: COLOR[row.color] }}
                        />
                        <span className="text-sm font-semibold tabular-nums text-[#1B3A2D]">
                          {`${row.percent}%`}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm leading-relaxed text-[#3F5B50]">{view.prioritiesLine}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => chooseFocus(view.priorities[0]!.sectionKey)}
                    className="mef-focus-ring mef-press rounded-full bg-[#1B3A2D] px-4 py-2 text-xs font-semibold text-[#F5F0E4] transition hover:brightness-110 disabled:opacity-50"
                  >
                    {coachCopy(copy, 'coach.use_as_focus')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setChoosing(true)}
                    className="mef-focus-ring mef-press rounded-full bg-[#F3F6F4] px-4 py-2 text-xs font-semibold text-[#1B3A2D] transition hover:bg-[#E7EDE9]"
                  >
                    {coachCopy(copy, 'coach.choose_different')}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* 2. THE SIGNAL MAP -------------------------------------- */}
          <div>
            <p className={SECTION_HEADING}>{coachCopy(copy, 'coach.signal_map_heading')}</p>
            <ul className="mt-3 divide-y divide-[#1B3A2D]/8">
              {view.signalMap.map((row) => (
                <li key={row.sectionKey} className="flex items-center gap-3 py-2">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: COLOR[row.color] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-[#1B3A2D]">
                    {row.sectionName}
                  </span>
                  <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-[#EFE9DB]">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${row.percent}%`, backgroundColor: COLOR[row.color] }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-[#1B3A2D]">
                    {`${row.percent}%`}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* 3. THE WHOLE-BODY SIGNAL LOAD -------------------------- */}
          <div className={BLOCK}>
            <p className={SECTION_HEADING}>{coachCopy(copy, 'coach.load_heading')}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-[#1B3A2D]">
              {view.load.current.value}
            </p>
            <dl className="mt-3 grid grid-cols-1 gap-1.5 text-sm text-[#3F5B50] sm:grid-cols-3">
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-xs text-[#6B7A72]">{coachCopy(copy, 'coach.load_component_a')}</dt>
                <dd className="font-semibold tabular-nums">{view.load.current.componentA}</dd>
              </div>
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-xs text-[#6B7A72]">{coachCopy(copy, 'coach.load_component_b')}</dt>
                <dd className="font-semibold tabular-nums">{view.load.current.componentB}</dd>
              </div>
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-xs text-[#6B7A72]">{coachCopy(copy, 'coach.load_component_c')}</dt>
                <dd className="font-semibold tabular-nums">{view.load.current.componentC}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-[#6B7A72]">
              {view.load.delta === null
                ? coachCopy(copy, 'coach.load_no_previous')
                : `${coachCopy(copy, 'coach.load_change_label')}: ${signed(view.load.delta)}`}
            </p>
          </div>

          {/* 4. WHY THIS SCORED HIGH -------------------------------- */}
          <div>
            <p className={SECTION_HEADING}>{coachCopy(copy, 'coach.why_heading')}</p>
            <ul className="mt-3 space-y-2">
              {view.signalMap.map((row) => {
                const why = view.why.find((entry) => entry.sectionKey === row.sectionKey);
                if (!why) return null;
                const open = openSection === row.sectionKey;
                return (
                  <li key={row.sectionKey} className="rounded-2xl border border-[#1B3A2D]/8">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => {
                        setOpenSection(open ? null : row.sectionKey);
                        setOpenAnswers(null);
                      }}
                      className="mef-focus-ring mef-press flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: COLOR[row.color] }}
                        />
                        <span className="truncate text-sm font-medium text-[#1B3A2D]">
                          {row.sectionName}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums text-[#1B3A2D]">
                          {`${row.percent}%`}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 text-[#6B7A72] transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
                          aria-hidden="true"
                        />
                      </span>
                    </button>

                    {open && (
                      <div className="border-t border-[#1B3A2D]/8 px-4 py-4">
                        <p className="text-sm text-[#3F5B50]">
                          {`${coachCopy(copy, 'coach.why_strong_label')} ${why.strongCount}, ${coachCopy(copy, 'coach.why_moderate_label')} ${why.moderateCount}, ${coachCopy(copy, 'coach.why_low_label')} ${why.lowCount}`}
                        </p>

                        {why.strongestTopics.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs uppercase tracking-wide text-[#6B7A72]">
                              {coachCopy(copy, 'coach.why_strongest_label')}
                            </p>
                            <ul className="mt-1.5 space-y-1">
                              {why.strongestTopics.map((entry) => (
                                <li
                                  key={`${entry.topic}-${entry.signal}`}
                                  className="flex items-center justify-between gap-3 text-sm text-[#1B3A2D]"
                                >
                                  <span>{entry.topic}</span>
                                  <span className="tabular-nums text-[#6B7A72]">{entry.signal}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {row.pntaCount > 0 && (
                          <p className="mt-3 text-xs leading-relaxed text-[#6B7A72]">
                            {`${row.pntaCount}. ${coachCopy(copy, 'coach.pnta_note')}`}
                          </p>
                        )}

                        <button
                          type="button"
                          aria-expanded={openAnswers === row.sectionKey}
                          onClick={() =>
                            setOpenAnswers(openAnswers === row.sectionKey ? null : row.sectionKey)
                          }
                          className="mef-focus-ring mef-press mt-4 rounded-full bg-[#F3F6F4] px-3.5 py-1.5 text-xs font-semibold text-[#1B3A2D] transition hover:bg-[#E7EDE9]"
                        >
                          {coachCopy(copy, 'coach.view_all_answers')}
                        </button>

                        {openAnswers === row.sectionKey && (
                          <ul className="mt-3 divide-y divide-[#1B3A2D]/8">
                            {why.allAnswers.map((answer) => (
                              <li key={answer.questionRef} className="py-2">
                                <p className="text-sm text-[#1B3A2D]">{answer.prompt}</p>
                                <p className="mt-0.5 text-xs text-[#6B7A72]">
                                  {`${answer.coachTopic}. ${answer.answerLabel}${answer.signal === null ? '' : ` (${answer.signal})`}`}
                                </p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* 5. THE ZONE PATTERN PANEL ------------------------------ */}
          <div className={BLOCK}>
            <p className={SECTION_HEADING}>{coachCopy(copy, 'coach.zone_heading')}</p>
            {!view.primaryZone ? (
              <p className="mt-2 text-sm text-[#6B7A72]">{coachCopy(copy, 'coach.zone_none')}</p>
            ) : (
              <div className="mt-3 space-y-4">
                {[
                  { label: coachCopy(copy, 'coach.zone_primary_label'), zone: view.primaryZone },
                  { label: coachCopy(copy, 'coach.zone_secondary_label'), zone: view.secondaryZone },
                ]
                  .filter((entry) => entry.zone !== null)
                  .map((entry) => (
                    <div key={entry.zone!.zoneKey} className="rounded-xl bg-white p-3.5">
                      <p className="text-xs uppercase tracking-wide text-[#6B7A72]">{entry.label}</p>
                      <p className="mt-1 text-sm font-semibold text-[#1B3A2D]">
                        {`${entry.zone!.zoneName}. ${entry.zone!.percent}%`}
                      </p>
                      {entry.zone!.sentence && (
                        <p className="mt-2 text-sm leading-relaxed text-[#3F5B50]">
                          {entry.zone!.sentence}
                        </p>
                      )}
                      {entry.zone!.contributors.length > 0 && (
                        <>
                          <p className="mt-3 text-xs uppercase tracking-wide text-[#6B7A72]">
                            {coachCopy(copy, 'coach.zone_why_label')}
                          </p>
                          <ul className="mt-1.5 space-y-1">
                            {entry.zone!.contributors.map((contributor) => (
                              <li
                                key={contributor.topic}
                                className="flex items-center justify-between gap-3 text-sm text-[#1B3A2D]"
                              >
                                <span>{contributor.topic}</span>
                                <span className="tabular-nums text-[#6B7A72]">
                                  {contributor.contributedPoints}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  ))}
                <p className="text-xs leading-relaxed text-[#6B7A72]">
                  {coachCopy(copy, 'coach.zone_interpretation_note')}
                </p>
              </div>
            )}
          </div>

          {/* 6. THE ASSOCIATED COACHING MAP ------------------------- */}
          {view.primaryZone && (
            <div>
              <p className={SECTION_HEADING}>{coachCopy(copy, 'coach.associated_map_heading')}</p>
              <div className="mt-3 space-y-3">
                {[view.primaryZone, view.secondaryZone]
                  .filter((zone) => zone !== null)
                  .map((zone) => (
                    <div
                      key={zone!.zoneKey}
                      className="rounded-2xl border border-[#1B3A2D]/8 bg-white p-4"
                    >
                      <p className="text-sm font-semibold text-[#1B3A2D]">{zone!.zoneName}</p>
                      <dl className="mt-2 space-y-1.5 text-sm">
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-[#6B7A72]">
                            {coachCopy(copy, 'coach.associated_spinal_label')}
                          </dt>
                          <dd className="text-[#3F5B50]">{zone!.spinalSegments}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-[#6B7A72]">
                            {coachCopy(copy, 'coach.associated_organs_label')}
                          </dt>
                          <dd className="text-[#3F5B50]">{zone!.organGlandList}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-[#6B7A72]">
                            {coachCopy(copy, 'coach.associated_chakra_label')}
                          </dt>
                          <dd className="text-[#3F5B50]">{zone!.chakraLens}</dd>
                        </div>
                      </dl>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* 7. PATTERNS ACROSS THE ASSESSMENT ---------------------- */}
          <div>
            <p className={SECTION_HEADING}>{coachCopy(copy, 'coach.patterns_heading')}</p>
            {view.patterns.length === 0 ? (
              <p className="mt-2 text-sm text-[#6B7A72]">{coachCopy(copy, 'coach.patterns_none')}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {view.patterns.map((pattern) => (
                  <li
                    key={pattern.patternKey}
                    className="rounded-2xl border border-[#1B3A2D]/8 bg-white p-4"
                  >
                    <p className="text-sm font-semibold text-[#1B3A2D]">{pattern.title}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#3F5B50]">
                      {pattern.coachText}
                    </p>
                    <p className="mt-2 text-xs text-[#6B7A72]">
                      {pattern.citedSections
                        .map((section) => `${sectionNameOf(section.sectionKey)} ${section.percent}%`)
                        .join(', ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 8. QUESTIONS WORTH EXPLORING --------------------------- */}
          <div>
            <p className={SECTION_HEADING}>{coachCopy(copy, 'coach.questions_heading')}</p>
            {view.coachingQuestions.length === 0 ? (
              <p className="mt-2 text-sm text-[#6B7A72]">
                {coachCopy(copy, 'coach.questions_none')}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {view.coachingQuestions.map((entry) => {
                  const marks = actions[`${selected.id}:${entry.questionKey}`] ?? {
                    asked: false,
                    hidden: false,
                    saved: false,
                  };
                  return (
                    <li
                      key={entry.questionKey}
                      className={`rounded-2xl border border-[#1B3A2D]/8 bg-white p-4 ${marks.hidden ? 'opacity-55' : ''}`}
                    >
                      <p className="text-xs uppercase tracking-wide text-[#6B7A72]">{entry.topic}</p>
                      <p className="mt-1.5 text-sm leading-relaxed text-[#1B3A2D]">
                        {entry.question}
                      </p>
                      <p className="mt-1.5 text-xs text-[#6B7A72]">{entry.because}</p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <ActionChip
                          on={marks.asked}
                          disabled={isPending}
                          onClick={() => markQuestion(entry.questionKey, { asked: !marks.asked })}
                          icon={<Check className="h-3.5 w-3.5" aria-hidden="true" />}
                          label={
                            marks.asked
                              ? coachCopy(copy, 'coach.question_asked')
                              : coachCopy(copy, 'coach.question_ask')
                          }
                        />
                        <ActionChip
                          on={copiedKey === entry.questionKey}
                          disabled={false}
                          onClick={() => void copyQuestion(entry.questionKey, entry.question)}
                          icon={<Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                          label={
                            copiedKey === entry.questionKey
                              ? coachCopy(copy, 'coach.question_copied')
                              : coachCopy(copy, 'coach.question_copy')
                          }
                        />
                        <ActionChip
                          on={marks.saved}
                          disabled={isPending}
                          onClick={() => markQuestion(entry.questionKey, { saved: !marks.saved })}
                          icon={<Bookmark className="h-3.5 w-3.5" aria-hidden="true" />}
                          label={
                            marks.saved
                              ? coachCopy(copy, 'coach.question_saved')
                              : coachCopy(copy, 'coach.question_save')
                          }
                        />
                        <ActionChip
                          on={marks.hidden}
                          disabled={isPending}
                          onClick={() => markQuestion(entry.questionKey, { hidden: !marks.hidden })}
                          icon={<EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
                          label={
                            marks.hidden
                              ? coachCopy(copy, 'coach.question_unhide')
                              : coachCopy(copy, 'coach.question_hide')
                          }
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* 9. CHOOSE COACHING FOCUS ------------------------------- */}
          <div className={BLOCK}>
            <p className={SECTION_HEADING}>{coachCopy(copy, 'coach.focus_heading')}</p>

            <div className="mt-3 space-y-2">
              <p className="text-sm text-[#3F5B50]">
                <span className="text-xs uppercase tracking-wide text-[#6B7A72]">
                  {coachCopy(copy, 'coach.focus_recommended_label')}
                </span>
                <br />
                {view.priorities.length > 0
                  ? view.priorities.map((row) => row.sectionName).join(', ')
                  : coachCopy(copy, 'coach.priorities_none')}
              </p>
              <p className="text-sm text-[#3F5B50]">
                <span className="text-xs uppercase tracking-wide text-[#6B7A72]">
                  {coachCopy(copy, 'coach.focus_selected_label')}
                </span>
                <br />
                {chosenFocus ? sectionNameOf(chosenFocus) : coachCopy(copy, 'coach.focus_none')}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setChoosing((current) => !current)}
              aria-expanded={choosing}
              className="mef-focus-ring mef-press mt-4 rounded-full bg-[#F3F6F4] px-4 py-2 text-xs font-semibold text-[#1B3A2D] transition hover:bg-[#E7EDE9]"
            >
              {coachCopy(copy, 'coach.focus_change')}
            </button>

            {choosing && (
              <ul className="mt-3 space-y-1.5">
                {view.signalMap.map((row) => (
                  <li key={row.sectionKey}>
                    <button
                      type="button"
                      disabled={isPending}
                      aria-pressed={chosenFocus === row.sectionKey}
                      onClick={() => chooseFocus(row.sectionKey)}
                      className={`mef-focus-ring mef-press flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm transition disabled:opacity-50 ${
                        chosenFocus === row.sectionKey
                          ? 'bg-[#1B3A2D] font-semibold text-[#F5F0E4]'
                          : 'bg-white text-[#1B3A2D] hover:bg-[#F3F6F4]'
                      }`}
                    >
                      <span>{row.sectionName}</span>
                      <span className="tabular-nums">{`${row.percent}%`}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 10. REASSESSMENT --------------------------------------- */}
          <div>
            <p className={SECTION_HEADING}>{coachCopy(copy, 'coach.reassessment_heading')}</p>
            {!view.comparison ? (
              <p className="mt-2 text-sm text-[#6B7A72]">
                {coachCopy(copy, 'coach.reassessment_none')}
              </p>
            ) : (
              <div className="mt-3 space-y-4">
                <ul className="divide-y divide-[#1B3A2D]/8">
                  {view.comparison.map((entry) => (
                    <li key={entry.sectionKey} className="py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-sm text-[#1B3A2D]">
                          {sectionNameOf(entry.sectionKey)}
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-[#3F5B50]">
                          {entry.previousPercent === null
                            ? `${entry.currentPercent}%`
                            : `${entry.previousPercent} to ${entry.currentPercent}, ${signed(entry.delta ?? 0)}`}
                        </span>
                      </div>
                      {/* The old bar fades into the new one. No arrows. */}
                      <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-[#EFE9DB]">
                        {entry.previousPercent !== null && (
                          <span
                            className="block h-full rounded-full bg-[#1B3A2D]/15"
                            style={{ width: `${entry.previousPercent}%` }}
                          />
                        )}
                        <span
                          className="-mt-1.5 block h-full rounded-full bg-[#1B3A2D]/55"
                          style={{ width: `${entry.currentPercent}%` }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>

                {view.zoneShift && (
                  <p className="text-sm text-[#3F5B50]">
                    {view.zoneShift.changed
                      ? `${coachCopy(copy, 'coach.reassessment_zone_previous')} ${zoneNameOf(content, view.zoneShift.previousZoneKey)}. ${coachCopy(copy, 'coach.reassessment_zone_current')} ${zoneNameOf(content, view.zoneShift.currentZoneKey)}.`
                      : coachCopy(copy, 'coach.reassessment_zone_unchanged')}
                  </p>
                )}

                <div>
                  <p className="text-xs uppercase tracking-wide text-[#6B7A72]">
                    {coachCopy(copy, 'coach.reassessment_contributors_heading')}
                  </p>
                  {view.contributorShifts.length === 0 ? (
                    <p className="mt-1.5 text-sm text-[#6B7A72]">
                      {coachCopy(copy, 'coach.reassessment_contributors_none')}
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {view.contributorShifts.map((shift) => (
                        <li
                          key={shift.sectionKey}
                          className="rounded-xl border border-[#1B3A2D]/8 bg-white p-3"
                        >
                          <p className="text-sm font-medium text-[#1B3A2D]">{shift.sectionName}</p>
                          <p className="mt-1 text-xs text-[#6B7A72]">
                            {`${shift.previousTopics.map((t) => t.topic).join(', ') || 'None'} to ${shift.currentTopics.map((t) => t.topic).join(', ') || 'None'}`}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <p className="text-sm text-[#3F5B50]">
                  {`${coachCopy(copy, 'coach.load_trend_label')}: ${view.load.previous?.value ?? '-'} to ${view.load.current.value}${view.load.delta === null ? '' : `, ${signed(view.load.delta)}`}`}
                </p>

                <p className="text-sm text-[#3F5B50]">
                  <span className="text-xs uppercase tracking-wide text-[#6B7A72]">
                    {coachCopy(copy, 'coach.reassessment_previous_focus_label')}
                  </span>
                  <br />
                  {previousFocus ? sectionNameOf(previousFocus) : coachCopy(copy, 'coach.focus_none')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function zoneNameOf(content: CoachWbsPanelState['content'], zoneKey: string | null): string {
  if (!zoneKey) return 'None';
  return content?.zones.find((zone) => zone.zoneKey === zoneKey)?.displayName ?? zoneKey;
}

function ActionChip({
  on,
  disabled,
  onClick,
  icon,
  label,
}: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={on}
      onClick={onClick}
      className={`mef-focus-ring mef-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
        on ? 'bg-[#1B3A2D] text-[#F5F0E4]' : 'bg-[#F3F6F4] text-[#1B3A2D] hover:bg-[#E7EDE9]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
