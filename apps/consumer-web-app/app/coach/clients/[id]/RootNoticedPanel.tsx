'use client';

/**
 * ROOT NOTICED. What the coach reads when a client has reported something.
 *
 * WHAT IT IS. One card per complaint that triggered an entry in the
 * Whole-Body Association Map. Each card shows what the client actually
 * said, in her own words, what Root read it as, which areas the map sent
 * Root to check, and exactly what was in each one, separated into what is
 * current and what is history.
 *
 * NOTHING ON IT WAS COMPOSED BY THIS COMPONENT. The association text, the
 * basis line and every coaching consideration are carried through character
 * for character from the version of the map entry the lookup read. This
 * file lays out; it does not write.
 *
 * IT IS NOT A DIAGNOSIS AND IT CANNOT BECOME ONE. It never says an area is
 * the reason for what she reported, and every card carries that in words at
 * the bottom. tests/cross-system-root-copy.test.ts holds every string in
 * this file to the Relationship Library's own banned list.
 *
 * THE SAFETY OVERRIDE ALWAYS WINS, and it has already happened by the time
 * this renders. A withheld finding arrives with no areas, no association
 * and no considerations at all (see lib/cross-system-root/view.ts), so
 * there is nothing in the payload for this component to leak, and what it
 * draws instead points at the existing red flag process.
 *
 * NOTHING IS SCORED AND NOTHING IS COMBINED. There is no total on this
 * card, no index and no percentage. The questionnaire scores stay exactly
 * where they are, on their own cards.
 *
 * COACH ONLY. Nothing in this feature renders on a member screen or reaches
 * a member API payload.
 */

import { useState } from 'react';
import { ChevronDown, Search, ShieldAlert, Sparkles } from 'lucide-react';
import {
  FINDING_HEADINGS,
  EMPTY_BODY,
  EMPTY_HEADING,
  QUESTIONNAIRE_HEADING,
  TRACE_HEADING,
  TRACE_LEAD,
  moreQuestionnaireFindingsLabel,
} from '@/lib/cross-system-root/copy';
import type { FindingAreaView, FindingRowLine, RootFindingView } from '@/lib/cross-system-root/view';
import type {
  QuestionnaireNoticedView,
  QuestionnaireTraceSection,
} from '@/lib/cross-system-root/noticedView';
import type { RootNoticedPanelState } from '@/app/actions/crossSystemRootFindings';

/** How many survey connections show before the rest are folded. */
const QUESTIONNAIRE_FINDINGS_SHOWN = 5;

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const BLOCK_TITLE = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-[#854D0E]';
const BLOCK = 'rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-4';

/** The signal's name with its side, where the side says something. */
function named(row: FindingRowLine): string {
  return row.sideLabel ? `${row.signalName} (${row.sideLabel})` : row.signalName;
}

/**
 * One of her rows, with everything behind it.
 *
 * THE SOURCE IS ON EVERY ROW, and the exact question under it where the
 * source recorded one. That is what makes a finding traceable back to a
 * questionnaire answer and a date rather than being an assertion.
 */
function Row({ row }: { row: FindingRowLine }) {
  return (
    <li className="border-t border-[#1B3A2D]/8 py-2 first:border-t-0 first:pt-0">
      <p className="text-[13px] text-[#1B3A2D]">
        <span className="font-semibold">{named(row)}</span>
        <span className="text-[#1B3A2D]/70">, {row.valueLabel}</span>
      </p>
      <p className="mt-0.5 text-[11px] text-[#1B3A2D]/55">
        {row.sourceLabel}, {row.capturedOnDisplay}
      </p>
      {row.sourceQuestionPrompt ? (
        <p className="mt-1 text-[12px] italic text-[#1B3A2D]/65">{row.sourceQuestionPrompt}</p>
      ) : null}
      {row.note ? (
        <p className="mt-1 text-[12px] text-[#1B3A2D]/65">Her words: {row.note}</p>
      ) : null}
    </li>
  );
}

/** One area the map sent Root to look at. */
function Area({ area }: { area: FindingAreaView }) {
  return (
    <div className={BLOCK}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[14px] font-semibold text-[#1B3A2D]">{area.label}</p>
        <span className="rounded-full bg-[#1B3A2D]/6 px-2 py-0.5 text-[11px] text-[#1B3A2D]/70">
          {area.stateLabel}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-[#1B3A2D]/55">{area.stateExplanation}</p>

      {area.currentRows.length > 0 ? (
        <div className="mt-3">
          <p className={BLOCK_TITLE}>{FINDING_HEADINGS.currentFindings}</p>
          <ul className="mt-1">
            {area.currentRows.map((row) => (
              <Row key={row.signalId} row={row} />
            ))}
          </ul>
        </div>
      ) : null}

      {area.historicalRows.length > 0 ? (
        <div className="mt-3">
          <p className={BLOCK_TITLE}>{FINDING_HEADINGS.historicalContext}</p>
          <ul className="mt-1">
            {area.historicalRows.map((row) => (
              <Row key={row.signalId} row={row} />
            ))}
          </ul>
        </div>
      ) : null}

      {area.notObserved ? (
        <div className="mt-3">
          <p className={BLOCK_TITLE}>{FINDING_HEADINGS.notObserved}</p>
          <p className="mt-1 text-[13px] text-[#1B3A2D]/70">
            Nothing in her data sits under this area at the moment.
          </p>
        </div>
      ) : null}

      <div className="mt-3">
        <p className={BLOCK_TITLE}>{FINDING_HEADINGS.whyChecked}</p>
        <p className="mt-1 text-[13px] text-[#1B3A2D]/75">{area.whyChecked}</p>
      </div>
    </div>
  );
}

function Finding({ finding }: { finding: RootFindingView }) {
  const [open, setOpen] = useState(false);

  return (
    <article
      className="rounded-2xl border border-[#1B3A2D]/10 bg-white p-4"
      data-root-finding-origin={finding.origin}
    >
      {finding.origin === 'questionnaire' ? (
        // A SURVEY CARD HAS NO SENTENCE OF HERS TO QUOTE. It names the
        // signals her answers currently support, and it names no score.
        <div>
          <p className="text-[13px] font-semibold text-[#1B3A2D]">{finding.triggerLine}</p>
          <p className="mt-1 text-[11px] text-[#1B3A2D]/55">
            {finding.complaintSurface}, {finding.complaintOnDisplay}
          </p>
        </div>
      ) : (
        <div>
          <p className={BLOCK_TITLE}>{FINDING_HEADINGS.presentingComplaint}</p>
          <blockquote className="mt-1 border-l-2 border-[#854D0E]/30 pl-3 text-[14px] italic text-[#1B3A2D]">
            {finding.complaintText}
          </blockquote>
          <p className="mt-1 text-[11px] text-[#1B3A2D]/55">
            {finding.complaintSurface}, {finding.complaintOnDisplay}
          </p>
          {finding.alsoSupportedBy ? (
            <p className="mt-1 text-[12px] text-[#1B3A2D]/70">{finding.alsoSupportedBy}</p>
          ) : null}
        </div>
      )}

      {finding.suppressed ? (
        <div className="mt-3 rounded-2xl border border-[#B45309]/25 bg-[#FEF3C7]/50 p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-[#854D0E]">
            <ShieldAlert className="h-4 w-4" aria-hidden />
            {finding.suppressedHeading}
          </p>
          <p className="mt-1 text-[13px] text-[#1B3A2D]/80">{finding.suppressedBody}</p>
          {finding.suppressedSignalNames.length > 0 ? (
            <p className="mt-1 text-[12px] text-[#1B3A2D]/65">
              Responses involved: {finding.suppressedSignalNames.join(', ')}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          {finding.interpretation.length > 0 ? (
            <p className="mt-2 text-[12px] text-[#1B3A2D]/70">
              Root read this as: {finding.interpretation.join('; ')}
            </p>
          ) : null}

          <p className="mt-3 text-[14px] font-semibold text-[#1B3A2D]">{finding.patternName}</p>
          {finding.summary ? (
            <p className="mt-0.5 text-[13px] text-[#1B3A2D]/75">{finding.summary}</p>
          ) : null}

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="mt-3 flex items-center gap-1 text-[12px] font-semibold text-[#854D0E]"
            aria-expanded={open}
          >
            {open ? 'Hide the areas Root checked' : FINDING_HEADINGS.areasChecked}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>

          {open ? (
            <div className="mt-3 space-y-3">
              {finding.areas.map((area) => (
                <Area key={`${area.refKind}:${area.refKey}`} area={area} />
              ))}
            </div>
          ) : null}

          {finding.possibleAssociation ? (
            <div className={`mt-3 ${BLOCK}`}>
              <p className={BLOCK_TITLE}>Possible association</p>
              <p className="mt-1 text-[13px] text-[#1B3A2D]/80">{finding.possibleAssociation}</p>
              {finding.basis ? (
                <p className="mt-2 text-[11px] text-[#1B3A2D]/55">{finding.basis}</p>
              ) : null}
            </div>
          ) : null}

          {finding.considerations.length > 0 ? (
            <div className={`mt-3 ${BLOCK}`}>
              <p className={BLOCK_TITLE}>{FINDING_HEADINGS.questions}</p>
              <ul className="mt-1 space-y-1">
                {finding.considerations.map((line) => (
                  <li key={line} className="text-[13px] text-[#1B3A2D]/80">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="mt-3 text-[11px] text-[#1B3A2D]/55">{finding.notADiagnosis}</p>
        </>
      )}
    </article>
  );
}

/** One section of the trace, folded until she opens it. */
function TraceSection({ section }: { section: QuestionnaireTraceSection }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-[#1B3A2D]/8 py-2 first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left text-[13px] font-semibold text-[#1B3A2D]"
      >
        <span>
          {section.sectionName}
          <span className="ml-2 text-[11px] font-normal text-[#1B3A2D]/55">
            {section.activeCount === 1 ? '1 active signal' : `${section.activeCount} active signals`}
          </span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open ? (
        <ul className="mt-2 space-y-2">
          {section.rows.map((row) => (
            <li key={row.questionRef} className="rounded-xl bg-[#FAFAF8] p-3" data-trace-question={row.questionRef}>
              <p className="text-[12px] italic text-[#1B3A2D]/75">{row.prompt}</p>
              <p className="mt-1 text-[13px] text-[#1B3A2D]">
                <span className="font-semibold">{row.answerLabel ?? 'No answer'}</span>
                {row.signalName ? <span className="text-[#1B3A2D]/70">, signal: {row.signalName}</span> : null}
              </p>
              <p className="mt-0.5 text-[12px] text-[#1B3A2D]/75">{row.decision}</p>
              {row.stateLabel ? (
                <p className="mt-0.5 text-[11px] text-[#1B3A2D]/55">On her timeline today: {row.stateLabel}</p>
              ) : null}
              <p className="mt-0.5 text-[11px] text-[#1B3A2D]/55">{row.ledTo}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Everything Root read from her newest Body Systems Survey. */
function QuestionnaireBlock({ block }: { block: QuestionnaireNoticedView }) {
  const [showAll, setShowAll] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const shown = showAll ? block.findings : block.findings.slice(0, QUESTIONNAIRE_FINDINGS_SHOWN);
  const hidden = block.findings.length - shown.length;

  return (
    <section className="mt-5" data-root-noticed-questionnaire>
      <p className={BLOCK_TITLE}>{QUESTIONNAIRE_HEADING}</p>
      <p className="mt-1 text-[13px] text-[#1B3A2D]/80">{block.intro}</p>
      {block.supportsLine ? (
        <p className="mt-1 text-[13px] font-semibold text-[#1B3A2D]">{block.supportsLine}</p>
      ) : null}

      {block.suppressed ? (
        <div className="mt-3 rounded-2xl border border-[#B45309]/25 bg-[#FEF3C7]/50 p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-[#854D0E]">
            <ShieldAlert className="h-4 w-4" aria-hidden />
            {block.suppressedHeading}
          </p>
          <p className="mt-1 text-[13px] text-[#1B3A2D]/80">{block.suppressedBody}</p>
          {block.suppressedSignalNames.length > 0 ? (
            <p className="mt-1 text-[12px] text-[#1B3A2D]/65">
              Responses involved: {block.suppressedSignalNames.join(', ')}
            </p>
          ) : null}
        </div>
      ) : null}

      {shown.length > 0 ? (
        <div className="mt-3 space-y-4">
          {shown.map((finding) => (
            <Finding key={`${finding.relationshipId}:${block.sittingId}`} finding={finding} />
          ))}
        </div>
      ) : null}
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-3 text-[12px] font-semibold text-[#854D0E]"
        >
          {moreQuestionnaireFindingsLabel(hidden)}
        </button>
      ) : null}

      {block.trace.length > 0 ? (
        <div className={`mt-4 ${BLOCK}`}>
          <button
            type="button"
            onClick={() => setTraceOpen((value) => !value)}
            aria-expanded={traceOpen}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className={BLOCK_TITLE}>{TRACE_HEADING}</span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-[#854D0E] transition-transform ${traceOpen ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
          {traceOpen ? (
            <>
              <p className="mt-1 text-[12px] text-[#1B3A2D]/65">{TRACE_LEAD}</p>
              <div className="mt-2">
                {block.trace.map((section) => (
                  <TraceSection key={section.sectionKey} section={section} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function RootNoticedPanel({ state }: { state: RootNoticedPanelState }) {
  if (!state.allowed) return null;
  const { view } = state;
  const questionnaire = view.questionnaire ?? null;

  if (view.findings.length === 0 && !questionnaire) {
    return (
      <div className={`${CARD} p-5`}>
        <p className="text-[14px] font-semibold text-[#1B3A2D]">{EMPTY_HEADING}</p>
        <p className="mt-1 text-[13px] text-[#1B3A2D]/70">{EMPTY_BODY}</p>
        <p className="mt-2 text-[11px] text-[#1B3A2D]/50">
          Your Whole-Body Association Map holds {view.mapEntryCount}{' '}
          {view.mapEntryCount === 1 ? 'active entry' : 'active entries'}.
        </p>
      </div>
    );
  }

  return (
    <div className={`${CARD} p-5`}>
      {view.complaintCount > 0 ? (
        <p className="flex items-center gap-2 text-[13px] font-semibold text-[#1B3A2D]">
          <Sparkles className="h-4 w-4 text-[#854D0E]" aria-hidden />
          Root read {view.complaintCount}{' '}
          {view.complaintCount === 1 ? 'report' : 'reports'} from this client and checked her
          whole-body data against your Association Map.
        </p>
      ) : null}

      {view.convergences.length > 0 ? (
        <div className="mt-3 rounded-2xl border border-[#854D0E]/20 bg-[#FEF9F0] p-4">
          <p className={BLOCK_TITLE}>Overlapping areas</p>
          <ul className="mt-1 space-y-1">
            {view.convergences.map((entry) => (
              <li key={entry.label} className="text-[13px] text-[#1B3A2D]/80">
                {entry.line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        {view.findings.map((finding) => (
          <Finding
            key={`${finding.relationshipId}:${finding.complaintOn}:${finding.complaintText.slice(0, 24)}`}
            finding={finding}
          />
        ))}
      </div>

      {questionnaire ? <QuestionnaireBlock block={questionnaire} /> : null}

      {view.unclassifiedCount > 0 ? (
        <p className="mt-4 flex items-center gap-1.5 text-[11px] text-[#1B3A2D]/50">
          <Search className="h-3 w-3" aria-hidden />
          {view.unclassifiedCount}{' '}
          {view.unclassifiedCount === 1 ? 'report had' : 'reports had'} no phrase Root recognizes
          yet. They are recorded in full and can be read in her check-ins.
        </p>
      ) : null}
    </div>
  );
}
