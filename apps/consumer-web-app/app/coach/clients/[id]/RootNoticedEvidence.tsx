'use client';

/**
 * THE ROOT NOTICED EVIDENCE, as a coach opens it. Moved out of
 * RootNoticedPanel.tsx unchanged in substance so the full evidence and each
 * briefing card's "View evidence" draw the same thing from the same code.
 *
 * WHAT MOVED, AND WHAT WAS TRIMMED. Every finding, area, row, association,
 * consideration and trace line a coach could read before is still drawn.
 * Three repeated pieces of boilerplate are said once instead of once per
 * area or per card: "Why Root checked this area" is one line per map entry,
 * an area with nothing under it is a one line row, and the standing "not a
 * diagnosis" sentence is drawn once by the section that owns the findings.
 *
 * NOTHING ON IT WAS COMPOSED BY THIS COMPONENT. The association text, the
 * basis line and every coaching consideration are carried through character
 * for character from the version of the map entry the lookup read.
 *
 * COACH ONLY. Nothing here renders on a member screen.
 */

import { useState } from 'react';
import { ChevronDown, ShieldAlert } from 'lucide-react';
import {
  FINDING_HEADINGS,
  QUESTIONNAIRE_HEADING,
  STATE_LABELS,
  TRACE_HEADING,
  TRACE_LEAD,
  moreQuestionnaireFindingsLabel,
  whyCheckedEntryLine,
} from '@/lib/cross-system-root/copy';
import type { FindingAreaView, FindingRowLine, RootFindingView } from '@/lib/cross-system-root/view';
import type {
  QuestionnaireNoticedView,
  QuestionnaireTraceRow,
  QuestionnaireTraceSection,
} from '@/lib/cross-system-root/noticedView';

/** How many survey connections show before the rest are folded. */
const QUESTIONNAIRE_FINDINGS_SHOWN = 5;

export const BLOCK_TITLE = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-[#854D0E]';
export const BLOCK = 'rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-4';

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

/** One area the map sent Root to look at, where something sits under it. */
function Area({ area }: { area: FindingAreaView }) {
  return (
    <div className={BLOCK}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[14px] font-semibold text-[#1B3A2D]">{area.label}</p>
        <span className="rounded-full bg-[#1B3A2D]/6 px-2 py-0.5 text-[11px] text-[#1B3A2D]/70">
          {area.stateLabel}
        </span>
      </div>

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
    </div>
  );
}

/** The safety prompt, drawn wherever a finding or a block was withheld. */
export function SafetyPrompt(props: { heading: string | null; body: string | null; signalNames: readonly string[] }) {
  return (
    <div className="rounded-2xl border border-[#B45309]/25 bg-[#FEF3C7]/50 p-4" data-root-safety>
      <p className="flex items-center gap-2 text-[13px] font-semibold text-[#854D0E]">
        <ShieldAlert className="h-4 w-4" aria-hidden />
        {props.heading}
      </p>
      <p className="mt-1 text-[13px] text-[#1B3A2D]/80">{props.body}</p>
      {props.signalNames.length > 0 ? (
        <p className="mt-1 text-[12px] text-[#1B3A2D]/65">
          Responses involved: {props.signalNames.join(', ')}
        </p>
      ) : null}
    </div>
  );
}

export function Finding({ finding }: { finding: RootFindingView }) {
  const [open, setOpen] = useState(false);
  const observed = finding.areas.filter((area) => !area.notObserved);
  const empty = finding.areas.filter((area) => area.notObserved);

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
        <div className="mt-3">
          <SafetyPrompt
            heading={finding.suppressedHeading}
            body={finding.suppressedBody}
            signalNames={finding.suppressedSignalNames}
          />
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
              {finding.patternName ? (
                <div>
                  <p className={BLOCK_TITLE}>{FINDING_HEADINGS.whyChecked}</p>
                  <p className="mt-1 text-[12px] text-[#1B3A2D]/70">
                    {whyCheckedEntryLine(finding.patternName)}
                  </p>
                </div>
              ) : null}
              {observed.map((area) => (
                <Area key={`${area.refKind}:${area.refKey}`} area={area} />
              ))}
              {empty.length > 0 ? (
                // AN EMPTY AREA IS STILL A FINDING, and it is one line.
                <ul className="rounded-2xl border border-[#1B3A2D]/8 px-4 py-2" data-root-not-observed>
                  {empty.map((area) => (
                    <li
                      key={`${area.refKind}:${area.refKey}`}
                      className="flex items-baseline justify-between gap-2 border-t border-[#1B3A2D]/6 py-1 text-[12px] first:border-t-0"
                    >
                      <span className="text-[#1B3A2D]/80">{area.label}</span>
                      <span className="text-[11px] text-[#1B3A2D]/50">{STATE_LABELS.not_observed}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
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
        </>
      )}
    </article>
  );
}

/** One question on her newest sitting, from the answer to where it led. */
export function TraceRow({ row }: { row: QuestionnaireTraceRow }) {
  return (
    <li className="rounded-xl bg-[#FAFAF8] p-3" data-trace-question={row.questionRef}>
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
            <TraceRow key={row.questionRef} row={row} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Everything Root read from her newest Body Systems Survey. */
export function QuestionnaireBlock({ block }: { block: QuestionnaireNoticedView }) {
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
        <div className="mt-3">
          <SafetyPrompt
            heading={block.suppressedHeading}
            body={block.suppressedBody}
            signalNames={block.suppressedSignalNames}
          />
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
