'use client';

/**
 * THE COACH BRIEFING. The top of Root Noticed: what deserves attention
 * before a session, in at most three cards, each reading as
 *
 *   1. a headline anchored on what she reported,
 *   2. what she reported, how often, where and when,
 *   3. related findings her own answers support,
 *   4. why they are worth reviewing together, kept apart from 2, and
 *   5. what to explore next,
 *
 * with "View evidence" opening everything behind the card: every answer in
 * its original wording, per signal timelines, the areas Root checked
 * including empty ones, the association details and the lines of "How Root
 * read each answer" that belong to it.
 *
 * NOTHING ON IT WAS DECIDED HERE. Order, change markers and review state
 * are built by lib/cross-system-root/briefing.ts under the rules in
 * briefingRules.ts; this file lays out.
 *
 * NO REVIEW ACTION HIDES EVIDENCE. "Reviewed" and "Not relevant" move a
 * card into a fold at its current evidence, and the full evidence below
 * the briefing is drawn whatever a coach has done.
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import { ChevronDown, Pin } from 'lucide-react';
import {
  ASSESSMENT_CONTEXT_NOTE,
  BRIEFING_EMPTY,
  BRIEFING_HEADING,
  BRIEFING_LEAD,
  BRIEFING_MARKERS,
  BRIEFING_PARTS,
  CONNECTED_THROUGH,
  EVIDENCE_HEADINGS,
  HER_WORDS,
  HIDE_EVIDENCE,
  NO_TIMELINE_ENTRIES,
  PINNED_SECTION_HEADING,
  PINNED_SECTION_LEAD,
  PRIORITY_SECTION_HEADING,
  RANK_REASON_HEADING,
  REVIEW_ACTION_LABELS,
  REVIEW_SAVE_FAILED,
  TRACE_HEADING,
  dismissedFoldLabel,
  dismissedJustNowLine,
  viewAllFindingsLabel,
} from '@/lib/cross-system-root/copy';
import type {
  BriefingCardView,
  BriefingDismissedView,
  BriefingSafetyView,
  RootBriefingView,
} from '@/lib/cross-system-root/briefing';
import type { BriefingReviewAction } from '@/lib/cross-system-root/briefingRules';
import { BRIEFING_REVIEW_ACTIONS } from '@/lib/cross-system-root/briefingRules';
import type { FullRootNoticedView } from '@/lib/cross-system-root/noticedView';
import { recordRootBriefingReviewAction } from '@/app/actions/crossSystemRootFindings';
import { sendBeacon } from '@/lib/analytics/beacon';
import { BLOCK, BLOCK_TITLE, Finding, SafetyPrompt, TraceRow } from './RootNoticedEvidence';

const CHIP = 'rounded-full px-2 py-0.5 text-[11px] font-semibold';

function Markers({ card, pinned }: { card: BriefingCardView; pinned: boolean }) {
  const chips: Array<{ text: string; tone: string }> = [];
  if (pinned) chips.push({ text: BRIEFING_MARKERS.pinned, tone: 'bg-[#854D0E]/10 text-[#854D0E]' });
  // Two different facts, two different chips: a visit is not a review.
  if (card.newSinceVisit) chips.push({ text: BRIEFING_MARKERS.newSinceVisit, tone: 'bg-[#1B3A2D] text-white' });
  if (card.changedSinceReview) {
    chips.push({ text: BRIEFING_MARKERS.changedSinceReview, tone: 'bg-[#1B3A2D] text-white' });
  }
  if (card.changeMarker) chips.push({ text: card.changeMarker, tone: 'bg-[#1B3A2D]/6 text-[#1B3A2D]/75' });
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span key={chip.text} className={`${CHIP} ${chip.tone}`} data-briefing-marker={chip.text}>
          {chip.text}
        </span>
      ))}
    </div>
  );
}

/** Everything behind one card. */
function CardEvidence({ card, view }: { card: BriefingCardView; view: FullRootNoticedView }) {
  const findings = [
    ...view.findings,
    ...(view.questionnaire?.findings ?? []),
  ].filter((finding) => card.evidence.relationshipIds.includes(finding.relationshipId));
  const traceRows = (view.questionnaire?.trace ?? [])
    .flatMap((section) => section.rows)
    .filter((row) => card.evidence.questionRefs.includes(row.questionRef));

  return (
    <div className="mt-4 space-y-4 border-t border-[#1B3A2D]/10 pt-4" data-briefing-evidence={card.targetKey}>
      <div>
        <p className={BLOCK_TITLE}>{RANK_REASON_HEADING}</p>
        <p className="mt-1 text-[13px] text-[#1B3A2D]/80">{card.rankReason}</p>
      </div>

      <div>
        <p className={BLOCK_TITLE}>{EVIDENCE_HEADINGS.answers}</p>
        <ul className="mt-1 space-y-2">
          {card.reported.map((line) => (
            <li key={`${line.signalSlug}:${line.sourceLabel}:${line.questionRef ?? ''}`} className={BLOCK}>
              <p className="text-[13px] font-semibold text-[#1B3A2D]">
                {line.sideLabel ? `${line.signalName} (${line.sideLabel})` : line.signalName}, {line.valueLabel}
              </p>
              {line.questionPrompt ? (
                <p className="mt-1 text-[12px] italic text-[#1B3A2D]/70">{line.questionPrompt}</p>
              ) : null}
              {line.note ? (
                <p className="mt-1 text-[12px] text-[#1B3A2D]/70">
                  {HER_WORDS}: {line.note}
                </p>
              ) : null}
              <p className="mt-1 text-[11px] text-[#1B3A2D]/55">
                {line.sourceLabel}. {line.reportedLine}.
              </p>
              <p className="mt-0.5 text-[11px] text-[#1B3A2D]/65">
                {line.change.line}
                {line.change.kind === 'first_recorded' ? `. ${line.change.note}` : '.'}
              </p>
            </li>
          ))}
          {card.evidence.allRelated.map((line) => (
            <li key={`related:${line.signalSlug}`} className={BLOCK}>
              <p className="text-[13px] font-semibold text-[#1B3A2D]">
                {line.signalName}, {line.valueLabel}
              </p>
              {line.questionPrompt ? (
                <p className="mt-1 text-[12px] italic text-[#1B3A2D]/70">{line.questionPrompt}</p>
              ) : null}
              <p className="mt-1 text-[11px] text-[#1B3A2D]/55">
                {line.sourceLabel}. {line.reportedLine}.
              </p>
              <p className="mt-0.5 text-[11px] text-[#1B3A2D]/55">
                {CONNECTED_THROUGH}: {line.viaPatternNames.join('; ')}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {card.evidence.assessmentContext.length > 0 ? (
        <div data-briefing-assessment-context>
          <p className={BLOCK_TITLE}>{EVIDENCE_HEADINGS.assessmentContext}</p>
          <ul className="mt-1">
            {card.evidence.assessmentContext.map((entry) => (
              <li key={`${entry.sectionName}:${entry.onDisplay}`} className="text-[12px] text-[#1B3A2D]/75">
                {entry.sectionName}: {entry.bandLabel} ({entry.sourceLabel}, {entry.onDisplay})
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-[#1B3A2D]/50">{ASSESSMENT_CONTEXT_NOTE}</p>
        </div>
      ) : null}

      {card.evidence.timelines.length > 0 ? (
        <div>
          <p className={BLOCK_TITLE}>{EVIDENCE_HEADINGS.timelines}</p>
          <div className="mt-1 space-y-2">
            {card.evidence.timelines.map((timeline) => (
              <div key={timeline.signalSlug} className="rounded-xl border border-[#1B3A2D]/8 px-3 py-2">
                <p className="text-[12px] font-semibold text-[#1B3A2D]">{timeline.signalName}</p>
                {timeline.entries.length === 0 ? (
                  <p className="text-[11px] text-[#1B3A2D]/55">{NO_TIMELINE_ENTRIES}</p>
                ) : (
                  <ul>
                    {timeline.entries.map((entry, index) => (
                      <li key={`${entry.on}:${index}`} className="text-[11px] text-[#1B3A2D]/70">
                        {entry.onDisplay}: {entry.valueLabel} ({entry.sourceLabel})
                        {entry.questionPrompt ? `, "${entry.questionPrompt}"` : ''}
                        {entry.note ? `, ${HER_WORDS.toLowerCase()}: ${entry.note}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {card.evidence.absences.length > 0 ? (
        <div>
          <p className={BLOCK_TITLE}>{EVIDENCE_HEADINGS.absences}</p>
          <ul className="mt-1">
            {card.evidence.absences.map((absence) => (
              <li
                key={absence.signalSlug}
                className="border-t border-[#1B3A2D]/6 py-1 text-[12px] first:border-t-0"
                data-briefing-absence={absence.kind}
              >
                <span className="text-[#1B3A2D]/85">{absence.signalName}: </span>
                <span className="text-[#1B3A2D]/60">{absence.line}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {findings.length > 0 ? (
        <div>
          <p className={BLOCK_TITLE}>{EVIDENCE_HEADINGS.associations}</p>
          <div className="mt-2 space-y-3">
            {findings.map((finding) => (
              <Finding
                key={`${finding.origin}:${finding.relationshipId}:${finding.complaintOn}:${finding.complaintText.slice(0, 24)}`}
                finding={finding}
              />
            ))}
          </div>
        </div>
      ) : null}

      {traceRows.length > 0 ? (
        <div>
          <p className={BLOCK_TITLE}>{TRACE_HEADING}</p>
          <ul className="mt-2 space-y-2">
            {traceRows.map((row) => (
              <TraceRow key={row.questionRef} row={row} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function BriefingCard(props: {
  card: BriefingCardView;
  view: FullRootNoticedView;
  pinned: boolean;
  canAct: boolean;
  pending: boolean;
  failed: boolean;
  onAction: (action: BriefingReviewAction) => void;
}) {
  const { card } = props;
  const [open, setOpen] = useState(false);

  return (
    <article
      className="rounded-2xl border border-[#1B3A2D]/12 bg-white p-4"
      data-briefing-card={card.targetKey}
    >
      <Markers card={card} pinned={props.pinned} />
      <h3 className="mt-2 text-[16px] font-semibold leading-snug text-[#1B3A2D]">{card.headline}</h3>

      <div className="mt-3" data-briefing-part="reported">
        <p className={BLOCK_TITLE}>{BRIEFING_PARTS.reported}</p>
        <ul className="mt-1 space-y-1.5">
          {card.reported.map((line) => (
            <li key={`${line.signalSlug}:${line.sourceLabel}:${line.questionRef ?? ''}`} className="text-[13px] text-[#1B3A2D]">
              <span className="font-semibold">
                {line.sideLabel ? `${line.signalName} (${line.sideLabel})` : line.signalName}
              </span>
              <span className="text-[#1B3A2D]/75">, {line.valueLabel}</span>
              <span className="block text-[11px] text-[#1B3A2D]/55">
                {line.sourceLabel}. {line.reportedLine}.
              </span>
              {line.change.kind !== 'first_recorded' ? (
                <span className="block text-[11px] text-[#1B3A2D]/70">{line.change.line}.</span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3" data-briefing-part="related">
        <p className={BLOCK_TITLE}>{BRIEFING_PARTS.related}</p>
        {card.related.length > 0 ? (
          <ul className="mt-1 space-y-1">
            {card.related.map((line) => (
              <li key={line.signalSlug} className="text-[13px] text-[#1B3A2D]">
                {line.signalName}
                <span className="text-[#1B3A2D]/70">, {line.valueLabel}</span>
                <span className="block text-[11px] text-[#1B3A2D]/55">
                  {line.sourceLabel}. {line.reportedLine}.
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[13px] text-[#1B3A2D]/70">{card.noRelatedLine}</p>
        )}
      </div>

      {/* OBSERVATION AND ASSOCIATION NEVER BLEND: the association sentence
          sits in its own tinted block, apart from what she reported. */}
      <div className="mt-3 rounded-xl bg-[#FEF9F0] px-3 py-2" data-briefing-part="why">
        <p className={BLOCK_TITLE}>{BRIEFING_PARTS.why}</p>
        <p className="mt-1 text-[13px] text-[#1B3A2D]/80">{card.whyReviewTogether}</p>
      </div>

      <div className="mt-3" data-briefing-part="explore">
        <p className={BLOCK_TITLE}>{BRIEFING_PARTS.explore}</p>
        {card.exploreNext.length > 0 ? (
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {card.exploreNext.map((question) => (
              <li key={question} className="text-[13px] text-[#1B3A2D]/85">
                {question}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[12px] text-[#1B3A2D]/60">{card.exploreEmptyLine}</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {props.canAct
          ? BRIEFING_REVIEW_ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                disabled={props.pending}
                onClick={() => props.onAction(action)}
                aria-pressed={action === 'discuss_next_session' ? props.pinned : undefined}
                className={`flex items-center gap-1 rounded-full border px-3 py-1 text-[12px] font-semibold disabled:opacity-50 ${
                  action === 'discuss_next_session' && props.pinned
                    ? 'border-[#854D0E] bg-[#854D0E]/10 text-[#854D0E]'
                    : 'border-[#1B3A2D]/15 text-[#1B3A2D]/80'
                }`}
                data-briefing-action={action}
              >
                {action === 'discuss_next_session' ? <Pin className="h-3 w-3" aria-hidden /> : null}
                {REVIEW_ACTION_LABELS[action]}
              </button>
            ))
          : null}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="ml-auto flex items-center gap-1 text-[12px] font-semibold text-[#854D0E]"
        >
          {open ? HIDE_EVIDENCE : BRIEFING_PARTS.evidence}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </div>
      {props.failed ? <p className="mt-2 text-[12px] text-[#B45309]">{REVIEW_SAVE_FAILED}</p> : null}

      {open ? <CardEvidence card={card} view={props.view} /> : null}
    </article>
  );
}

function DismissedFold({ entries }: { entries: BriefingDismissedView[] }) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-1 text-[12px] font-semibold text-[#1B3A2D]/65"
      >
        {dismissedFoldLabel(entries.length)}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open ? (
        <ul className="mt-2 space-y-1">
          {entries.map((entry) => (
            <li key={entry.targetKey} className="text-[12px] text-[#1B3A2D]/70" data-briefing-dismissed={entry.targetKey}>
              <span className="font-semibold text-[#1B3A2D]/85">{entry.headline}</span> {entry.line}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * THE SAFETY BLOCK, on its own, so the client detail page can draw it
 * OUTSIDE the collapsible Root Noticed section: a coach with the section
 * folded still sees it, and no review action anywhere can dismiss it.
 */
export function RootNoticedSafety({ safety }: { safety: BriefingSafetyView | null | undefined }) {
  if (!safety) return null;
  return (
    <div className="mb-3" data-root-noticed-safety>
      <SafetyPrompt heading={safety.heading} body={safety.body} signalNames={safety.signalNames} />
    </div>
  );
}

export function RootBriefing(props: {
  briefing: RootBriefingView;
  view: FullRootNoticedView;
  /** Absent in a render with no client to act on, which draws no action buttons. */
  clientId?: string | undefined;
  /** True when the page already draws the safety block above the section. */
  safetyShownAbove?: boolean | undefined;
}) {
  const { briefing, view, clientId } = props;
  const [showAll, setShowAll] = useState(false);
  const [local, setLocal] = useState<Record<string, BriefingReviewAction>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const stamped = useRef(false);

  // THE VISIT IS STAMPED FROM A MOUNTED EFFECT, through the beacon, never
  // from a render and never as a server action that re-renders the page.
  // The markers on this screen were measured against the PREVIOUS visit,
  // read on the server before this stamp can land.
  useEffect(() => {
    if (!clientId || stamped.current) return;
    stamped.current = true;
    sendBeacon({ event: 'root_briefing_seen', clientId });
  }, [clientId]);

  const act = (card: BriefingCardView, action: BriefingReviewAction) => {
    if (!clientId) return;
    setFailed(null);
    setPendingKey(card.targetKey);
    startTransition(async () => {
      const result = await recordRootBriefingReviewAction(clientId, card.targetKey, action);
      setPendingKey(null);
      if (result.ok) setLocal((held) => ({ ...held, [card.targetKey]: action }));
      else setFailed(card.targetKey);
    });
  };

  // What this screen has done since it loaded, laid over what the server
  // read. The newest action on a card wins, so reviewing a pinned card takes
  // it out of the pinned section.
  const statusOf = (card: BriefingCardView): 'pinned' | 'open' | 'dismissed' => {
    const action = local[card.targetKey];
    if (!action) return card.reviewStatus;
    return action === 'discuss_next_session' ? 'pinned' : 'dismissed';
  };
  const all = [...briefing.pinned, ...briefing.cards];
  const pinned = all.filter((card) => statusOf(card) === 'pinned');
  const open = all.filter((card) => statusOf(card) === 'open');
  const dismissedHere: BriefingDismissedView[] = all
    .filter((card) => local[card.targetKey] && statusOf(card) === 'dismissed')
    .map((card) => ({
      targetKey: card.targetKey,
      headline: card.headline,
      line: dismissedJustNowLine(REVIEW_ACTION_LABELS[local[card.targetKey]!]),
    }));

  const shown = showAll ? open : open.slice(0, briefing.priorityLimit);
  const hidden = open.length - shown.length;

  const drawCard = (card: BriefingCardView) => (
    <BriefingCard
      key={card.targetKey}
      card={card}
      view={view}
      pinned={statusOf(card) === 'pinned'}
      canAct={Boolean(clientId)}
      pending={pendingKey === card.targetKey}
      failed={failed === card.targetKey}
      onAction={(action) => act(card, action)}
    />
  );

  return (
    <section data-root-briefing>
      {props.safetyShownAbove ? null : <RootNoticedSafety safety={briefing.safety} />}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-semibold text-[#1B3A2D]">{BRIEFING_HEADING}</p>
        {briefing.updatedLine ? (
          <p className="text-[11px] text-[#1B3A2D]/55" data-briefing-updated>
            {briefing.updatedLine}
          </p>
        ) : null}
      </div>
      <p className="mt-0.5 text-[12px] text-[#1B3A2D]/65">{BRIEFING_LEAD}</p>

      {pinned.length > 0 ? (
        // PINNED CARDS HAVE THEIR OWN SECTION and never take a priority slot.
        <div className="mt-3 rounded-2xl border border-[#854D0E]/20 bg-[#FEF9F0] p-3" data-briefing-pinned>
          <p className={BLOCK_TITLE}>{PINNED_SECTION_HEADING}</p>
          <p className="mt-0.5 text-[11px] text-[#1B3A2D]/60">{PINNED_SECTION_LEAD}</p>
          <div className="mt-2 space-y-3">{pinned.map(drawCard)}</div>
        </div>
      ) : null}

      <div className="mt-3" data-briefing-priority>
        {pinned.length > 0 ? <p className={BLOCK_TITLE}>{PRIORITY_SECTION_HEADING}</p> : null}
        {open.length === 0 ? (
          <p className="mt-2 text-[13px] text-[#1B3A2D]/70">{BRIEFING_EMPTY}</p>
        ) : (
          <div className="mt-2 space-y-3">{shown.map(drawCard)}</div>
        )}
        {hidden > 0 ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-3 text-[12px] font-semibold text-[#854D0E]"
          >
            {viewAllFindingsLabel(hidden)}
          </button>
        ) : null}
      </div>

      <DismissedFold entries={[...dismissedHere, ...briefing.dismissed]} />

      <p className="mt-3 text-[11px] text-[#1B3A2D]/55" data-briefing-disclaimer>
        {briefing.disclaimer}
      </p>
    </section>
  );
}
