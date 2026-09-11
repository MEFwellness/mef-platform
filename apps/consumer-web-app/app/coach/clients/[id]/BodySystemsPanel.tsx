'use client';

/**
 * The coach's MEF Body Systems Survey card.
 *
 * THE ORDER IS THE DECISION SUPPORT.
 *
 *   1. Red flags, pinned at the top, with the level and the exact response
 *      the member was shown. Separated from everything below by its own
 *      treatment, because it is safety and nothing under it is.
 *   2. The session opener: the loudest section and the answers that made
 *      it loudest, which is the way into the conversation.
 *   3. The bars, loudest first, with exact percentages and retake deltas.
 *   4. Every answer, by contribution, foldable per section, with the
 *      related answers a fired association read alongside each one.
 *   5. The pattern analysis.
 *   6. The possible associations, each with its own why-surfaced citation.
 *   7. What changed since the previous sitting.
 *
 * EVERY STATEMENT PRINTS ITS UNCERTAINTY LABEL. Not as a tone of voice but
 * as a visible chip, from the label the builder attached. The fourth label,
 * Confirmed medical information, is printed once at the bottom with the
 * sentence saying this assessment never generates it, so a coach knows the
 * label exists and knows nothing here can wear it.
 *
 * IT WRITES NO SENTENCE ABOUT A PATTERN. Every word about an association
 * is a column on the row that fired. A section that is Speaking loudly
 * with nothing matching prints the stored coverage note, which is also a
 * row. There is no fallback sentence in this file to invent one with.
 *
 * IT IS A RESULT BLOCK, so it draws nothing at all until there is a
 * sitting behind it. Deciding to SEND it happens on its row in the
 * Assessment Status block at the top of Assessments and Findings.
 */

import { useMemo, useState } from 'react';
import { Stethoscope } from 'lucide-react';
import { formatDisplayDate } from '@/lib/time/displayDate';
import { hasDeepDiveResults } from '@/lib/coach-detail/deepDiveResults';
import { coachCopy, type CoachCopyKey } from '@/lib/body-systems/copyKeys';
import { BODY_SYSTEMS_LABEL } from '@/lib/body-systems/constants';
import { buildCoachReadingView } from '@/lib/body-systems/coachView';
import { PATTERN_CHANGE_COPY_KEY } from '@/lib/body-systems/retake';
import { UNCERTAINTY_COPY_KEY, type AssessmentUncertainty } from '@/lib/body-systems/uncertainty';
import type { CoachBodySystemsPanelState } from '@/app/actions/bodySystems';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const SECTION_HEADING = 'text-xs font-semibold uppercase tracking-wider text-[#6B7A72]';

const BAND_DOT: Record<string, string> = {
  green: '#4E8C6A',
  yellow: '#C4A050',
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

/** The visible uncertainty chip. Every statement on this card carries one. */
function Label({
  level,
  copy,
}: {
  level: AssessmentUncertainty;
  copy: Record<string, string>;
}) {
  return (
    <span className="inline-flex items-center rounded-full bg-[#1B3A2D]/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#4F645A]">
      {coachCopy(copy, UNCERTAINTY_COPY_KEY[level] as CoachCopyKey)}
    </span>
  );
}

export function BodySystemsPanel({ state }: { state: CoachBodySystemsPanelState }) {
  const [selectedId, setSelectedId] = useState<string | null>(state.sessions[0]?.id ?? null);

  const selected = state.sessions.find((session) => session.id === selectedId) ?? null;
  const previous = useMemo(() => {
    if (!selected) return null;
    const index = state.sessions.findIndex((session) => session.id === selected.id);
    const older = state.sessions[index + 1];
    // A sitting with no stored branch or no stored results cannot be read,
    // so it is not compared against either. Nothing is invented for it.
    return older && older.results && older.branch ? { ...older, branch: older.branch } : null;
  }, [selected, state.sessions]);

  const content = state.content;

  const view = useMemo(() => {
    if (!content || !selected?.results || !selected.branch) return null;
    return buildCoachReadingView({
      sections: content.sections,
      questions: content.questions,
      scale: content.scale,
      bands: content.bands,
      redFlags: content.redFlags,
      safetyLevels: content.safetyLevels,
      library: content.library,
      answers: selected.answers,
      redFlagAnswers: selected.redFlagAnswers,
      results: selected.results,
      branch: selected.branch,
      previous:
        previous && previous.results
          ? {
              answers: previous.answers,
              results: previous.results,
              branch: previous.branch,
            }
          : null,
      minDeltaPercent: content.minDeltaPercent,
    });
  }, [content, selected, previous]);

  // Every hook above has already run, so this return adds no conditional
  // hook. A panel with no sitting behind it has nothing to say.
  if (!hasDeepDiveResults(state)) return null;

  const copy = content?.coachCopy ?? {};

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <Stethoscope className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">{BODY_SYSTEMS_LABEL}</p>
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

      {!view ? (
        <p className="mt-4 text-sm text-[#6B7A72]">
          The stored answers for this sitting could not be read.
        </p>
      ) : (
        <div className="mt-5 space-y-6">
          {/* 1. RED FLAGS, PINNED, SEPARATE FROM EVERYTHING BELOW. */}
          <div className="rounded-2xl border-2 border-[#9B2C2C]/30 bg-[#FDF6F5] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className={SECTION_HEADING}>{coachCopy(copy, 'coach.red_flags_heading')}</p>
              <Label level={view.redFlags.uncertainty} copy={copy} />
            </div>
            {view.redFlags.value.length === 0 ? (
              <p className="mt-2 text-sm text-[#6B7A72]">
                {coachCopy(copy, 'coach.red_flags_none')}
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {view.redFlags.value.map((flag) => (
                  <li key={flag.flagKey} className="rounded-xl bg-white p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#9B2C2C] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        {`Level ${flag.level}. ${flag.levelLabel}`}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-[#1B3A2D]">{flag.prompt}</p>
                    <p className="mt-2 text-sm leading-relaxed text-[#3F5B50]">
                      {flag.memberResponse}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-[#6B7A72]">
                      {coachCopy(copy, 'coach.red_flags_note')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 2. THE SESSION OPENER. */}
          {view.opener && (
            <div className="rounded-2xl border border-[#C4A050]/40 bg-[#FDF9EF] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
                  {coachCopy(copy, 'coach.opener_heading')}
                </p>
                <Label level={view.opener.uncertainty} copy={copy} />
              </div>
              <p className="mt-2 text-[15px] font-medium text-[#1B3A2D]">
                {`${view.opener.value.sectionName}, ${view.opener.value.percent}%`}
              </p>
              <p className="mt-1 text-xs text-[#6B7A72]">
                {coachCopy(copy, 'coach.opener_note')}
              </p>
              <ul className="mt-3 space-y-1.5">
                {view.opener.value.topAnswers.map((answer) => (
                  <li key={answer.questionRef} className="text-sm leading-relaxed text-[#3F5B50]">
                    {`${answer.prompt} ${answer.answerLabel}`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 3 and 4. THE BARS, AND EVERY ANSWER BY CONTRIBUTION. */}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className={SECTION_HEADING}>{coachCopy(copy, 'coach.sections_heading')}</p>
              <Label level={view.sections.uncertainty} copy={copy} />
            </div>
            <ul className="mt-3 space-y-3">
              {view.sections.value.map((row) => (
                <li key={row.sectionKey} className="rounded-2xl bg-[#F3F6F4] p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold text-[#1B3A2D]">{row.sectionName}</p>
                    <p className="shrink-0 text-sm tabular-nums text-[#3F5B50]">
                      {`${row.percent}% ${row.bandLabel}`}
                    </p>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#1B3A2D]/10">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${row.percent}%`,
                        backgroundColor: BAND_DOT[row.colorKey] ?? BAND_DOT.green,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-[#6B7A72]">
                    {`${row.points} of ${row.possible} points across ${row.answeredCount} answered ${
                      row.answeredCount === 1 ? 'question' : 'questions'
                    }`}
                    {row.dnaCount > 0
                      ? `, ${row.dnaCount} marked as not applying. ${coachCopy(copy, 'coach.dna_note')}`
                      : '.'}
                  </p>

                  {row.comparison?.previousPercent !== null && row.comparison && (
                    <p className="mt-1 text-xs text-[#6B7A72]">
                      {`Previous sitting ${row.comparison.previousPercent}%.`}
                    </p>
                  )}

                  {/*
                    A LOUD SECTION WITH NO MATCH SAYS SO, in the stored
                    words, and nothing is invented to fill the gap.
                  */}
                  {row.needsCoverageNote && (
                    <p className="mt-2 rounded-xl bg-white p-3 text-xs leading-relaxed text-[#3F5B50]">
                      {coachCopy(copy, 'coach.coverage_note')}
                    </p>
                  )}

                  <details className="mt-3">
                    <summary className="mef-focus-ring cursor-pointer text-xs font-semibold uppercase tracking-wider text-[#4F645A]">
                      {coachCopy(copy, 'coach.questions_heading')}
                    </summary>
                    <dl className="mt-3 space-y-2.5">
                      {row.answers.map((answer) => (
                        <div key={answer.questionRef}>
                          <dt className="text-sm text-[#1B3A2D]">
                            {`${answer.questionRef}. ${answer.prompt}`}
                          </dt>
                          <dd className="mt-0.5 text-sm text-[#3F5B50]">
                            {answer.isDna
                              ? `${answer.answerLabel}. ${coachCopy(copy, 'coach.dna_note')}`
                              : `${answer.answerLabel}, ${answer.points} points`}
                            {answer.relatedRefs.length > 0
                              ? ` Related: ${answer.relatedRefs.join(', ')}.`
                              : ''}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                </li>
              ))}
            </ul>
          </div>

          {/* 5. THE PATTERN ANALYSIS. */}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className={SECTION_HEADING}>{coachCopy(copy, 'coach.patterns_heading')}</p>
              <Label level={view.patterns.uncertainty} copy={copy} />
            </div>

            <div className="mt-3 space-y-4">
              <div>
                <p className="text-xs font-semibold text-[#4F645A]">
                  {coachCopy(copy, 'coach.high_frequency_heading')}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {view.patterns.value.highFrequency.map((answer) => (
                    <li key={answer.questionRef} className="text-sm leading-relaxed text-[#3F5B50]">
                      {`${answer.sectionName}. ${answer.prompt} ${answer.answerLabel}`}
                    </li>
                  ))}
                </ul>
              </div>

              {view.patterns.value.clusters.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#4F645A]">
                    {coachCopy(copy, 'coach.cluster_heading')}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {view.patterns.value.clusters.map((cluster) => (
                      <li key={cluster.sectionKey} className="text-sm leading-relaxed text-[#3F5B50]">
                        {`${cluster.sectionName}: ${cluster.elevatedCount} of ${cluster.answeredCount} answered questions at Often or Almost always (${cluster.members
                          .map((member) => member.questionRef)
                          .join(', ')}).`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {view.patterns.value.crossSection && (
                <div>
                  <p className="text-xs font-semibold text-[#4F645A]">
                    {coachCopy(copy, 'coach.cross_section_heading')}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#3F5B50]">
                    {view.patterns.value.crossSection.sections
                      .map((entry) => `${entry.sectionName} ${entry.percent}%`)
                      .join(', ')}
                    {'.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 6. THE POSSIBLE ASSOCIATIONS. */}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className={SECTION_HEADING}>{coachCopy(copy, 'coach.associations_heading')}</p>
              <Label level={view.associations.uncertainty} copy={copy} />
            </div>
            <ul className="mt-3 space-y-3">
              {view.associations.value.map((entry) => (
                <li key={entry.entryCode} className="rounded-2xl border border-[#1B3A2D]/10 p-4">
                  <p className="text-sm font-semibold text-[#1B3A2D]">
                    {`${entry.entryCode}. ${entry.title}`}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-[#3F5B50]">
                    {entry.associationText}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-[#3F5B50]">
                    {`${coachCopy(copy, 'coach.next_step_label')}: ${entry.nextStep}`}
                  </p>
                  <div className="mt-3 rounded-xl bg-[#F3F6F4] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#4F645A]">
                      {coachCopy(copy, 'coach.why_surfaced_label')}
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {entry.whySurfacedAnswers.map((answer) => (
                        <li key={answer.questionRef} className="text-xs leading-relaxed text-[#3F5B50]">
                          {`${answer.questionRef}. ${answer.prompt} ${answer.answerLabel}`}
                        </li>
                      ))}
                      {entry.whySurfacedSections.map((section) => (
                        <li key={section.sectionKey} className="text-xs leading-relaxed text-[#3F5B50]">
                          {`${section.sectionName} at ${section.percent}%, ${section.bandLabel}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* 7. WHAT CHANGED. */}
          {view.patternChanges && (
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className={SECTION_HEADING}>
                  {coachCopy(copy, 'coach.association_compare_heading')}
                </p>
                <Label level={view.patternChanges.uncertainty} copy={copy} />
              </div>
              <ul className="mt-3 space-y-1.5">
                {view.patternChanges.value.map((change) => (
                  <li key={change.entryCode} className="text-sm leading-relaxed text-[#3F5B50]">
                    {`${change.entryCode}. ${change.title}: ${coachCopy(
                      copy,
                      PATTERN_CHANGE_COPY_KEY[change.change] as CoachCopyKey
                    )}`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* The fourth label, named so a coach knows it exists and knows
              nothing on this card can ever wear it. */}
          <div className="rounded-2xl bg-[#F3F6F4] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#4F645A]">
              {coachCopy(copy, 'coach.label_confirmed')}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-[#6B7A72]">
              {coachCopy(copy, 'coach.confirmed_never_generated')}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
