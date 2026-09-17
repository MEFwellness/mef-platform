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
import { ChevronDown, Pin, RotateCcw } from 'lucide-react';
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
  PINNED_SECTION_LEAD,
  RANK_REASON_HEADING,
  RESTORE_ACTION_LABEL,
  REVIEW_ACTION_LABELS,
  REVIEW_HISTORY_HEADING,
  REVIEW_HISTORY_JUST_NOW,
  REVIEW_HISTORY_LABELS,
  REVIEW_SAVE_FAILED,
  SHOW_FEWER_FINDINGS,
  TRACE_HEADING,
  dismissedFoldLabel,
  dismissedJustNowLine,
  moreFindingsHeading,
  pinnedSectionHeading,
  prioritySectionHeading,
  reviewHistoryLine,
  viewAllFindingsLabel,
} from '@/lib/cross-system-root/copy';
import type {
  BriefingCardView,
  BriefingSafetyView,
  RootBriefingView,
} from '@/lib/cross-system-root/briefing';
import type { BriefingHistoryAction, BriefingReviewAction } from '@/lib/cross-system-root/briefingRules';
import { BRIEFING_RESTORE_ACTION, BRIEFING_REVIEW_ACTIONS } from '@/lib/cross-system-root/briefingRules';
import type { FullRootNoticedView } from '@/lib/cross-system-root/noticedView';
import {
  recordRootBriefingReviewAction,
  restoreRootBriefingCardAction,
} from '@/app/actions/crossSystemRootFindings';
import { sendBeacon } from '@/lib/analytics/beacon';
import { BLOCK, BLOCK_TITLE, Finding, SafetyPrompt, TraceRow } from './RootNoticedEvidence';

const CHIP = 'inline-block rounded-full px-2 py-0.5 align-middle text-[11px] font-semibold leading-tight';
/** A label and its value on one line: "Reported: Headaches, Often." */
const INLINE_LABEL = 'font-semibold text-[#854D0E]';

/** A card's history as this screen knows it: what the server read, then anything done here since. */
type HistoryView = Array<{ key: string; label: string; onDisplay: string }>;

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
    <>
      {chips.map((chip) => (
        <span key={chip.text} className={`${CHIP} ${chip.tone} ml-1.5`} data-briefing-marker={chip.text}>
          {chip.text}
        </span>
      ))}
    </>
  );
}

/** Everything behind one card. */
function CardEvidence({
  card,
  view,
  history,
}: {
  card: BriefingCardView;
  view: FullRootNoticedView;
  history: HistoryView;
}) {
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

      {history.length > 0 ? (
        // EVERY REVIEW AND EVERY RESTORE, oldest first. A restore never
        // removes the review before it.
        <div data-briefing-history>
          <p className={BLOCK_TITLE}>{REVIEW_HISTORY_HEADING}</p>
          <ul className="mt-1">
            {history.map((entry) => (
              <li key={entry.key} className="text-[12px] text-[#1B3A2D]/75">
                {reviewHistoryLine(entry.label, entry.onDisplay)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
  history: HistoryView;
  canAct: boolean;
  pending: boolean;
  failed: boolean;
  onAction: (action: BriefingReviewAction) => void;
}) {
  const { card } = props;
  const [open, setOpen] = useState(false);

  // COMPACT: one line per part, no box inside the card, and on a phone no
  // box around it either (a divider separates cards), so the text keeps
  // the width. Text stays at the app's readable sizes.
  return (
    <article
      className="border-t border-[#1B3A2D]/12 pt-3 first:border-t-0 first:pt-0 sm:rounded-2xl sm:border sm:p-4 sm:first:border-t sm:first:pt-4"
      data-briefing-card={card.targetKey}
    >
      <div className="leading-snug">
        <h3 className="inline text-[15px] font-semibold text-[#1B3A2D]">{card.headline}</h3>
        <Markers card={card} pinned={props.pinned} />
      </div>
      {card.sharedSource ? (
        // SAID ONCE PER CARD. A line from another source carries its own
        // short label instead, and full details stay in View evidence.
        <p className="mt-0.5 text-[12px] leading-snug text-[#1B3A2D]/60" data-briefing-source>
          {card.sharedSource}
        </p>
      ) : null}

      <p className="mt-1.5 text-[13px] leading-snug text-[#1B3A2D]" data-briefing-part="reported">
        <span className={INLINE_LABEL}>{BRIEFING_PARTS.reported}:</span> {card.reportedSummary}
      </p>

      <div className="mt-1 text-[13px] leading-snug text-[#1B3A2D]" data-briefing-part="related">
        {card.related.length > 0 ? (
          <>
            <p className={INLINE_LABEL}>{BRIEFING_PARTS.related}:</p>
            <ul>
              {card.related.map((line) => (
                <li key={line.signalSlug}>
                  {line.signalName}, {line.valueLabel}
                  {line.inlineSource ? (
                    <span className="text-[#1B3A2D]/60" data-briefing-inline-source>
                      {' '}
                      {line.inlineSource}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>
            <span className={INLINE_LABEL}>{BRIEFING_PARTS.related}:</span>{' '}
            <span className="text-[#1B3A2D]/70">{card.noRelatedLine}</span>
          </p>
        )}
      </div>

      {card.whyReviewTogether ? (
        <p className="mt-1 text-[13px] leading-snug text-[#1B3A2D]/80" data-briefing-part="why">
          <span className={INLINE_LABEL}>{BRIEFING_PARTS.why}:</span> {card.whyReviewTogether}
        </p>
      ) : null}

      <p className="mt-1 text-[13px] leading-snug text-[#1B3A2D]/85" data-briefing-part="explore">
        <span className={INLINE_LABEL}>{BRIEFING_PARTS.explore}:</span>{' '}
        {card.exploreNext.length > 0 ? card.exploreNext.join(' ') : card.exploreEmptyLine}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {props.canAct
          ? BRIEFING_REVIEW_ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                disabled={props.pending}
                onClick={() => props.onAction(action)}
                aria-pressed={action === 'discuss_next_session' ? props.pinned : undefined}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50 ${
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
          className="ml-auto flex items-center gap-1 py-1 text-[12px] font-semibold text-[#854D0E]"
        >
          {open ? HIDE_EVIDENCE : BRIEFING_PARTS.evidence}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </div>
      {props.failed ? <p className="mt-2 text-[12px] text-[#B45309]">{REVIEW_SAVE_FAILED}</p> : null}

      {open ? <CardEvidence card={card} view={props.view} history={props.history} /> : null}
    </article>
  );
}

type DismissedEntry = { card: BriefingCardView; line: string };

function DismissedFold(props: {
  entries: DismissedEntry[];
  canAct: boolean;
  pendingKey: string | null;
  failedKey: string | null;
  onRestore: (card: BriefingCardView) => void;
}) {
  const [open, setOpen] = useState(false);
  if (props.entries.length === 0) return null;
  return (
    <div className="mt-3" data-briefing-dismissed-fold>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-1 text-[12px] font-semibold text-[#1B3A2D]/65"
      >
        {dismissedFoldLabel(props.entries.length)}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open ? (
        <ul className="mt-2 space-y-2">
          {props.entries.map(({ card, line }) => (
            <li
              key={card.targetKey}
              className="text-[12px] leading-snug text-[#1B3A2D]/70"
              data-briefing-dismissed={card.targetKey}
            >
              <span className="font-semibold text-[#1B3A2D]/85">{card.headline}</span> {line}
              {props.canAct ? (
                <button
                  type="button"
                  disabled={props.pendingKey === card.targetKey}
                  onClick={() => props.onRestore(card)}
                  className="mt-1 flex items-center gap-1 rounded-full border border-[#1B3A2D]/15 px-2.5 py-1 text-[12px] font-semibold text-[#1B3A2D]/80 disabled:opacity-50"
                  data-briefing-action={BRIEFING_RESTORE_ACTION}
                >
                  <RotateCcw className="h-3 w-3" aria-hidden />
                  {RESTORE_ACTION_LABEL}
                </button>
              ) : null}
              {props.failedKey === card.targetKey ? (
                <p className="mt-1 text-[12px] text-[#B45309]">{REVIEW_SAVE_FAILED}</p>
              ) : null}
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
  const [local, setLocal] = useState<Record<string, BriefingHistoryAction[]>>({});
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

  const run = (card: BriefingCardView, action: BriefingHistoryAction) => {
    if (!clientId) return;
    setFailed(null);
    setPendingKey(card.targetKey);
    startTransition(async () => {
      const result =
        action === BRIEFING_RESTORE_ACTION
          ? await restoreRootBriefingCardAction(clientId, card.targetKey)
          : await recordRootBriefingReviewAction(clientId, card.targetKey, action);
      setPendingKey(null);
      if (result.ok) setLocal((held) => ({ ...held, [card.targetKey]: [...(held[card.targetKey] ?? []), action] }));
      else setFailed(card.targetKey);
    });
  };

  // What this screen has done since it loaded, laid over what the server
  // read. The newest entry on a card wins: reviewing a pinned card takes it
  // out of the pinned section, and a restore returns a card to the briefing.
  const lastLocal = (card: BriefingCardView): BriefingHistoryAction | null => {
    const actions = local[card.targetKey];
    return actions && actions.length > 0 ? actions[actions.length - 1]! : null;
  };
  const statusOf = (card: BriefingCardView): 'pinned' | 'open' | 'dismissed' => {
    const action = lastLocal(card);
    if (!action) return card.reviewStatus;
    if (action === BRIEFING_RESTORE_ACTION) return 'open';
    return action === 'discuss_next_session' ? 'pinned' : 'dismissed';
  };
  const historyOf = (card: BriefingCardView): HistoryView => [
    ...card.history.map((entry, index) => ({
      key: `server:${index}`,
      label: entry.label,
      onDisplay: entry.onDisplay,
    })),
    ...(local[card.targetKey] ?? []).map((action, index) => ({
      key: `local:${index}`,
      label: REVIEW_HISTORY_LABELS[action],
      onDisplay: REVIEW_HISTORY_JUST_NOW,
    })),
  ];

  // ONE RANKED ORDER across every card, so a restored card lands wherever
  // the rules place it.
  const serverLine = new Map(briefing.dismissed.map((entry) => [entry.targetKey, entry.line]));
  const all = [...briefing.pinned, ...briefing.cards, ...briefing.dismissed.map((entry) => entry.card)].sort(
    (a, b) => a.rank - b.rank
  );
  const pinned = all.filter((card) => statusOf(card) === 'pinned');
  const open = all.filter((card) => statusOf(card) === 'open');
  const dismissed: DismissedEntry[] = all
    .filter((card) => statusOf(card) === 'dismissed')
    .map((card) => {
      const action = lastLocal(card);
      const line =
        action && action !== BRIEFING_RESTORE_ACTION && action !== 'discuss_next_session'
          ? dismissedJustNowLine(REVIEW_ACTION_LABELS[action])
          : (serverLine.get(card.targetKey) ?? '');
      return { card, line };
    });

  const priority = open.slice(0, briefing.priorityLimit);
  const beyond = open.slice(briefing.priorityLimit);

  const drawCard = (card: BriefingCardView) => (
    <BriefingCard
      key={card.targetKey}
      card={card}
      view={view}
      pinned={statusOf(card) === 'pinned'}
      history={historyOf(card)}
      canAct={Boolean(clientId)}
      pending={pendingKey === card.targetKey}
      failed={failed === card.targetKey}
      onAction={(action) => run(card, action)}
    />
  );

  return (
    <section data-root-briefing>
      {props.safetyShownAbove ? null : <RootNoticedSafety safety={briefing.safety} />}

      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
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
          <p className={BLOCK_TITLE} data-briefing-count="pinned">
            {pinnedSectionHeading(pinned.length)}
          </p>
          <p className="mt-0.5 text-[11px] text-[#1B3A2D]/60">{PINNED_SECTION_LEAD}</p>
          <div className="mt-2 space-y-3">{pinned.map(drawCard)}</div>
        </div>
      ) : null}

      <div className="mt-3" data-briefing-priority>
        {open.length === 0 ? (
          <p className="mt-2 text-[13px] text-[#1B3A2D]/70">{BRIEFING_EMPTY}</p>
        ) : (
          <>
            <p className={BLOCK_TITLE} data-briefing-count="priority">
              {prioritySectionHeading(priority.length)}
            </p>
            <div className="mt-2 space-y-3" data-briefing-priority-cards>
              {priority.map(drawCard)}
            </div>
          </>
        )}
        {beyond.length > 0 && showAll ? (
          <div className="mt-4" data-briefing-more>
            <p className={BLOCK_TITLE}>{moreFindingsHeading(beyond.length)}</p>
            <div className="mt-2 space-y-3">{beyond.map(drawCard)}</div>
          </div>
        ) : null}
        {beyond.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            aria-expanded={showAll}
            className="mt-3 text-[12px] font-semibold text-[#854D0E]"
            data-briefing-count="more"
          >
            {showAll ? SHOW_FEWER_FINDINGS : viewAllFindingsLabel(beyond.length)}
          </button>
        ) : null}
      </div>

      <DismissedFold
        entries={dismissed}
        canAct={Boolean(clientId)}
        pendingKey={pendingKey}
        failedKey={failed}
        onRestore={(card) => run(card, BRIEFING_RESTORE_ACTION)}
      />

      <p className="mt-3 text-[11px] text-[#1B3A2D]/55" data-briefing-disclaimer>
        {briefing.disclaimer}
      </p>
    </section>
  );
}
