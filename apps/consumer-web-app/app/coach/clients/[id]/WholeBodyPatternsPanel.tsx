'use client';

/**
 * The coach's Whole-Body Patterns card.
 *
 * WHAT IT IS. One card per ACTIVE definition in the Relationship Library
 * that this member's stored signals currently satisfy. Every word of
 * interpretation on it was typed by a coach, in her own library, and is
 * carried through unchanged. This component composes nothing.
 *
 * IT IS NOT A DIAGNOSIS AND IT CANNOT BECOME ONE. It says what she
 * reported, what was found alongside it, how much of it there is, and what
 * the coach wrote that may be worth exploring. It never says a cause, a
 * condition or a confirmation, and tests/cross-system-pattern-copy.test.ts
 * holds every string in this file to the Relationship Library's own banned
 * list.
 *
 * THE BLOCKS ARE NEVER BLENDED. Observed, Related Signals, Pattern
 * Strength and Possible Association are four separately headed regions
 * with their own treatment, in that order, and no sentence is shared
 * between them. A paragraph that ran them together is how a careful "may
 * be relevant" turns into a finding.
 *
 * THE SAFETY OVERRIDE ALWAYS WINS, and it has already happened by the time
 * this renders. A suppressed card arrives with every pattern field null
 * and every list empty (see lib/cross-system-patterns/view.ts), so there
 * is nothing in the payload for this component to leak, and what it draws
 * instead is the safety treatment the Body Systems Survey card already
 * uses with a prompt pointing at the existing safety process.
 *
 * NOTHING IS SCORED AND NOTHING IS COMBINED. There is no total on this
 * card, no index and no percentage. The questionnaire scores stay exactly
 * where they are, on their own cards; this sits alongside them.
 *
 * COACH ONLY. Nothing in this feature renders on a member screen or
 * reaches a member API payload.
 */

import { useState } from 'react';
import { ChevronDown, Layers, ShieldAlert } from 'lucide-react';
import { formatDisplayDate } from '@/lib/time/displayDate';
import { requestDetailSection } from '@/lib/coach-detail/detailBus';
import { sectionIdForAnchor } from '@/lib/coach-detail/sections';
import {
  PATTERN_CARD_BLOCKS,
  SAFETY_SUPPRESSION_ACTION,
  SAFETY_SUPPRESSION_ANCHOR_ID,
  SAFETY_SUPPRESSION_BODY,
  SAFETY_SUPPRESSION_HEADING,
  WHOLE_BODY_PATTERNS_LABEL,
} from '@/lib/cross-system-patterns/copy';
import type {
  ContributingResponseLine,
  PatternCard,
  PatternSourceLine,
} from '@/lib/cross-system-patterns/types';
import type { WholeBodyPatternsPanelState } from '@/app/actions/crossSystemPatterns';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const BLOCK_TITLE = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-[#854D0E]';
const BLOCK = 'rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-4';

/** A stored capture day, printed in the day the row itself names. */
function day(value: string): string {
  return formatDisplayDate(value, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The signal's name with its side, where the side says something. */
function named(entry: { signalName: string; sideLabel: string | null }): string {
  return entry.sideLabel ? `${entry.signalName} (${entry.sideLabel})` : entry.signalName;
}

/**
 * Opens the section holding a card and scrolls to it.
 *
 * The sitting a signal came from is read on its own questionnaire card, on
 * this same page, inside a section that starts folded. A bare anchor would
 * land nowhere, so the section is asked to open first and performs the
 * scroll once its contents exist. Same mechanism the pinned search uses.
 */
function jumpTo(anchorId: string): void {
  const sectionId = sectionIdForAnchor(anchorId);
  if (!sectionId) return;
  requestDetailSection({ sectionId, anchorId });
}

function JumpLink({ anchorId, label }: { anchorId: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => jumpTo(anchorId)}
      className="mef-focus-ring min-h-[32px] rounded-full px-2 text-xs font-medium text-[#3E5C46] underline decoration-[#C4A050]/60 underline-offset-2 hover:bg-[#1B3A2D]/[0.05]"
    >
      {label}
    </button>
  );
}

function blockTitle(key: (typeof PATTERN_CARD_BLOCKS)[number]['key']): string {
  return PATTERN_CARD_BLOCKS.find((block) => block.key === key)?.title ?? key;
}

/**
 * THE SAFETY TREATMENT, lifted from the Body Systems Survey card's own
 * pinned red flags block rather than invented, so a coach meets one visual
 * language for safety across this page.
 *
 * It names the signals carrying the response, because those are ordinary
 * facts already on her Signals card, and it names NOTHING about a pattern:
 * no pattern name, no strength, no possible association and no coaching
 * consideration exists in this card's payload to draw.
 */
function SuppressedCard({ card }: { card: PatternCard }) {
  return (
    <li className="rounded-2xl border-2 border-[#9B2C2C]/30 bg-[#FDF6F5] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-[#9B2C2C]" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-wider text-[#9B2C2C]">
          {SAFETY_SUPPRESSION_HEADING}
        </p>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[#3F5B50]">{SAFETY_SUPPRESSION_BODY}</p>
      {card.suppressedSignalNames.length > 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-[#6B7A72]">
          {card.suppressedSignalNames.join(', ')}
        </p>
      ) : null}
      <div className="mt-2">
        <JumpLink anchorId={SAFETY_SUPPRESSION_ANCHOR_ID} label={SAFETY_SUPPRESSION_ACTION} />
      </div>
    </li>
  );
}

function SourceRow({ entry }: { entry: PatternSourceLine }) {
  return (
    <li className="py-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-sm font-medium text-[#1B3A2D]">
          {named(entry)}, {entry.valueLabel}
        </span>
        <span className="text-xs text-[#6B7A72]">{day(entry.capturedOn)}</span>
      </div>
      <p className="mt-0.5 text-xs text-[#6B7A72]">{entry.sourceLabel}</p>
    </li>
  );
}

/**
 * One exact original response, as the expanded list prints it.
 *
 * THE EXACT QUESTION IS PRINTED WHERE THE SOURCE RECORDED ONE, because the
 * whole promise of this card is that a coach never has to take a
 * standardized label on trust.
 */
function ResponseRow({ entry }: { entry: ContributingResponseLine }) {
  return (
    <li className="border-t border-[#1B3A2D]/5 py-2.5 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-sm font-medium text-[#1B3A2D]">
          {named(entry)}, {entry.valueLabel}
        </span>
        <span className="text-xs text-[#6B7A72]">{day(entry.capturedOn)}</span>
      </div>
      <p className="mt-0.5 text-xs text-[#6B7A72]">
        {entry.sourceLabel}, answering the input {entry.componentLabel}
      </p>
      {entry.sourceQuestionPrompt ? (
        <p className="mt-0.5 text-xs italic leading-relaxed text-[#6B7A72]">
          {entry.sourceQuestionPrompt}
        </p>
      ) : null}
      {entry.note ? (
        <p className="mt-0.5 text-xs leading-relaxed text-[#3E5C46]">{entry.note}</p>
      ) : null}
      {entry.anchorId ? (
        <div className="mt-1">
          <JumpLink anchorId={entry.anchorId} label="Open the sitting this came from" />
        </div>
      ) : null}
    </li>
  );
}

function PatternCardBody({ card }: { card: PatternCard }) {
  const [open, setOpen] = useState(false);

  return (
    <li className={`${CARD} border border-[#1B3A2D]/8 p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h3 className="text-[15px] font-semibold leading-snug text-[#1B3A2D]">
          {card.patternName}
        </h3>
        {card.versionNumber !== null ? (
          <span className="shrink-0 rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-[#3E5C46]">
            {`Version ${card.versionNumber}`}
          </span>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {/* 1. OBSERVED. Her own reported signals, with her own values. */}
        <section className={BLOCK}>
          <p className={BLOCK_TITLE}>{blockTitle('observed')}</p>
          <ul className="mt-1.5">
            {card.observed.map((entry) => (
              <SourceRow key={`${entry.signalName}-${entry.capturedOn}-${entry.valueLabel}`} entry={entry} />
            ))}
          </ul>
        </section>

        {/* 2. RELATED SIGNALS. Each related input, with a count under it. */}
        <section className={BLOCK}>
          <p className={BLOCK_TITLE}>{blockTitle('related_signals')}</p>
          {card.relatedSystems.length === 0 ? (
            <p className="mt-1.5 text-sm text-[#6B7A72]">
              This pattern names no related input of its own.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {card.relatedSystems.map((entry) => (
                <li
                  key={`${entry.refKind}-${entry.refKey}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm"
                >
                  <span className="font-medium text-[#1B3A2D]">{entry.label}</span>
                  <span className="text-[#3E5C46]">
                    {entry.supportingCount === 1
                      ? '1 supporting response'
                      : `${entry.supportingCount} supporting responses`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 3. PATTERN STRENGTH. Her level, and one of the two fixed lines. */}
        <section className={BLOCK}>
          <p className={BLOCK_TITLE}>{blockTitle('pattern_strength')}</p>
          <p className="mt-1.5 text-sm font-semibold text-[#1B3A2D]">{card.levelLabel}</p>
          <p className="mt-1 text-sm leading-relaxed text-[#3F5B50]">{card.displayLine}</p>
        </section>

        {/* 4. POSSIBLE ASSOCIATION. Her wording, and nothing else ever. */}
        <section className="rounded-2xl border border-[#C4A050]/40 bg-[#FDF9EF] p-4">
          <p className={BLOCK_TITLE}>{blockTitle('possible_association')}</p>
          {card.possibleAssociation ? (
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-[#3F5B50]">
              {card.possibleAssociation}
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-[#6B7A72]">
              No Possible Association text has been written for this pattern yet.
            </p>
          )}
        </section>
      </div>

      {/* WHY ROOT NOTICED THIS. The arithmetic, said plainly. */}
      <p className="mt-4 text-sm font-medium text-[#3E5C46]">{card.whyNoticed}</p>

      {/* THE TIMELINE, from the dated rows. Observational only. */}
      {card.movement ? (
        <div className="mt-3 rounded-2xl border border-[#1B3A2D]/10 bg-white p-4">
          <p className={BLOCK_TITLE}>Change over time</p>
          <ul className="mt-1.5 space-y-1">
            {card.movement.trajectories.map((entry) => (
              <li
                key={`${entry.signalSlug}-${entry.sideLabel ?? 'none'}`}
                className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm"
              >
                <span className="font-medium text-[#1B3A2D]">{named(entry)}</span>
                <span className="text-[#3E5C46]">
                  {entry.line ?? 'Recorded once, so there is nothing to compare yet'}
                </span>
              </li>
            ))}
          </ul>
          {card.movement.lines.map((line) => (
            <p key={line} className="mt-2 text-sm leading-relaxed text-[#3F5B50]">
              {line}
            </p>
          ))}
        </div>
      ) : null}

      {/* SOURCES. Every contributing signal, with its source and its day. */}
      <section className="mt-3">
        <p className={BLOCK_TITLE}>{blockTitle('sources')}</p>
        <ul className="mt-1.5">
          {card.sources.map((entry) => (
            <SourceRow
              key={`${entry.signalName}-${entry.sourceLabel}-${entry.capturedOn}-${entry.valueLabel}`}
              entry={entry}
            />
          ))}
        </ul>
      </section>

      {/* COACHING CONSIDERATIONS. Her list, in her order, unchanged. */}
      {card.considerations.length > 0 ? (
        <section className="mt-3">
          <p className={BLOCK_TITLE}>{blockTitle('coaching_considerations')}</p>
          <ul className="mt-1.5 space-y-1.5">
            {card.considerations.map((body) => (
              <li key={body} className="flex gap-2 text-sm leading-relaxed text-[#3F5B50]">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#C4A050]" aria-hidden="true" />
                <span>{body}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* EVERY EXACT ORIGINAL RESPONSE, behind one control. */}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="mef-focus-ring mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-sm font-medium text-[#3E5C46] hover:bg-[#1B3A2D]/[0.05]"
      >
        {blockTitle('contributing_signals')}
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <ul className="mt-1 border-l-2 border-[#C4A050]/40 pl-3">
          {card.contributingResponses.map((entry) => (
            <ResponseRow key={entry.signalId} entry={entry} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function WholeBodyPatternsPanel({ state }: { state: WholeBodyPatternsPanelState }) {
  const { view } = state;

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <Layers className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">
          {WHOLE_BODY_PATTERNS_LABEL}
        </p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-[#6B7A72]">
        Predefined patterns from your Relationship Library that her stored signals currently meet,
        for you to review. Nothing here is scored, nothing is added to a questionnaire result, and
        nothing here is shown to her.
      </p>

      {view.cards.length === 0 ? (
        <p className="mt-4 text-sm text-[#6B7A72]">
          {view.activeRelationshipCount === 0
            ? 'No pattern in your Relationship Library is active yet. A pattern surfaces here once you switch it on and her signals meet the minimum you set for it.'
            : 'Nothing to review. Her signals do not yet meet the minimum supporting signals any active pattern asks for.'}
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {view.cards.map((card) =>
            card.suppressed ? (
              <SuppressedCard key={card.patternKey} card={card} />
            ) : (
              <PatternCardBody key={card.patternKey} card={card} />
            )
          )}
        </ul>
      )}
    </section>
  );
}
