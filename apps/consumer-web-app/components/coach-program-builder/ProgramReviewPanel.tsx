'use client';

/**
 * The review screen's working half: the recommendation, the six outcomes,
 * the load suggestions the coach edits, and the draft she then approves or
 * discards.
 *
 * THE SHAPE OF THE DECISION, top to bottom, because the order is the
 * coaching:
 *
 *   1. What the rules recommend, and WHY, in a paragraph she can argue
 *      with. The basis numbers sit under it so she can check the paragraph
 *      rather than trust it. When a pain report is unread the rules
 *      recommend NOTHING: the heading is "Coach review required", the
 *      reports are listed first, and each one carries the two things a coach
 *      can do about one exercise without touching the other three weeks.
 *
 *      THE SINGLE-EXERCISE ACTIONS ARE WIRED, NOT BUILT. "Mark reviewed" is
 *      the existing resolveFeedbackReportAction, the same one the signal
 *      panel uses. "Replace it, regress it or change its dose" is a link
 *      into the existing program editor at /coach/programs/[templateId],
 *      which already edits one exercise's sets, reps, load and tempo and
 *      already swaps one exercise for another. No new machinery.
 *   2. The signals themselves, which is the same panel she came from.
 *   3. The weights. Only for exercises she has logged one for; the rest of
 *      the program simply has no row here, and the panel says so in words.
 *   4. The six outcomes, every one of them available whatever the
 *      recommendation says, each behind a confirm.
 *   5. The draft, once there is one. Approve gives it to her. Discard
 *      throws it away. Until one of those two, she has nothing new.
 *
 * THE COACH'S EDIT WINS. A number she types is what gets written. A number
 * she CLEARS is a deliberate "no prescribed weight", and it does not come
 * back as the suggestion on save: see resolveApprovedLoad's three-way rule.
 *
 * NO EM DASHES, per the house rule.
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { AlertTriangle, Check, Sparkles, Trash2 } from 'lucide-react';
import type { ProgramReviewScreen } from '@/app/actions/program-review';
import {
  approveReviewDraftAction,
  chooseReviewOutcomeAction,
  discardReviewDraftAction,
  resolveFeedbackReportAction,
} from '@/app/actions/program-review';
import type { ReviewOutcome } from '@/lib/programs/review/outcomes';
import { COACH_REVIEW_REQUIRED } from '@/lib/programs/review/recommend';
import { describeSuggestion, type ApprovedLoadMap } from '@/lib/programs/progression/suggest';
import { NO_INSIGHTS_YET, NO_LOGGED_WEIGHTS_YET } from '@/lib/programs/signals/insights';
import { LOGGED_LOAD_UNITS, parseLoggedLoad, type LoggedLoadUnit } from '@/lib/programs/weightLogging';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

interface DraftState {
  programGroupTag: string;
  assignmentIds: string[];
  templateIds: string[];
  unchangedExercises: string[];
  outcome: ReviewOutcome;
}

export function ProgramReviewPanel({
  firstName,
  screen,
  programsHref,
  defaultStartDate,
}: {
  firstName: string;
  screen: ProgramReviewScreen;
  programsHref: string;
  defaultStartDate: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { review, panel, recommendation, outcomes } = screen;

  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(defaultStartDate ?? today);
  const [confirming, setConfirming] = useState<ReviewOutcome | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(
    review.status === 'drafted' && review.chosen_outcome
      ? {
          programGroupTag: review.draft_program_group_key ?? '',
          assignmentIds: review.draft_assignment_ids,
          templateIds: review.draft_template_ids,
          unchangedExercises: [],
          outcome: review.chosen_outcome,
        }
      : null
  );
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(review.status === 'approved');
  const [notes, setNotes] = useState(review.coach_notes ?? '');
  // Pain reports she has marked reviewed without leaving this screen. The
  // suggestions they release are computed on the server, so the row says to
  // reload rather than pretending a number appeared.
  const [resolvedReports, setResolvedReports] = useState<Set<string>>(new Set());
  const templateIds = panel.templateIds;

  function resolveReport(feedbackId: string) {
    startTransition(async () => {
      const result = await resolveFeedbackReportAction({
        feedbackId,
        memberId: review.member_id,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setResolvedReports((current) => new Set(current).add(feedbackId));
      router.refresh();
    });
  }

  // The coach's edits, keyed by external id. A key present with `null`
  // means she cleared the field on purpose.
  const [edits, setEdits] = useState<ApprovedLoadMap>({});
  const [fieldText, setFieldText] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      panel.loads.suggestions.map((s) => [
        s.externalId,
        s.suggestedLoad === null ? '' : String(s.suggestedLoad),
      ])
    )
  );
  const [fieldUnit, setFieldUnit] = useState<Record<string, LoggedLoadUnit>>(() =>
    Object.fromEntries(panel.loads.suggestions.map((s) => [s.externalId, s.unit]))
  );

  function editLoad(externalId: string, raw: string, unit: LoggedLoadUnit) {
    setFieldText((current) => ({ ...current, [externalId]: raw }));
    const parsed = parseLoggedLoad(raw);
    setEdits((current) => ({
      ...current,
      [externalId]: raw.trim() === '' ? null : parsed === null ? null : { load: parsed, unit },
    }));
  }

  function choose(outcome: ReviewOutcome) {
    startTransition(async () => {
      const result = await chooseReviewOutcomeAction({
        reviewId: review.id,
        outcome,
        startDate,
        approvedLoads: edits,
        coachNotes: notes.trim() || null,
      });
      setConfirming(null);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setError(null);
      if (result.redirectTo) {
        router.push(result.redirectTo as Route);
        return;
      }
      if (result.draft) {
        setDraft({ ...result.draft, outcome });
        return;
      }
      // Complete and archive: nothing drafted, nothing to approve.
      router.push(programsHref as Route);
      router.refresh();
    });
  }

  function approveDraft() {
    startTransition(async () => {
      const result = await approveReviewDraftAction(review.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setApproved(true);
      router.refresh();
    });
  }

  function discardDraft() {
    startTransition(async () => {
      const result = await discardReviewDraftAction(review.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setDraft(null);
      router.push(programsHref as Route);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5" data-program-review={review.id}>
      {error && (
        <p className={`${CARD} p-4 text-sm text-red-700`} role="alert">
          {error}
        </p>
      )}

      {/* 1. The recommendation. */}
      <section
        className={`${CARD} p-5`}
        data-review-recommendation={recommendation.outcome ?? COACH_REVIEW_REQUIRED}
      >
        <div className="flex items-center gap-2">
          {recommendation.requiresCoachReview ? (
            <AlertTriangle className="h-4 w-4 text-red-600" strokeWidth={2} aria-hidden="true" />
          ) : (
            <Sparkles className="h-4 w-4 text-[#3E5C46]" strokeWidth={1.75} aria-hidden="true" />
          )}
          <p
            className={`text-xs font-semibold uppercase tracking-wider ${
              recommendation.requiresCoachReview ? 'text-red-700' : 'text-[#3E5C46]'
            }`}
          >
            {recommendation.requiresCoachReview
              ? 'Waiting on you'
              : 'What the signals suggest'}
          </p>
        </div>
        <h2 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#1B3A2D]">
          {recommendation.headline}
        </h2>

        {/* The reports themselves, above the paragraph, because they are the
            thing to read. Each one carries the two single-exercise actions. */}
        {recommendation.painFirst.length > 0 && (
          <ul className="mt-3 space-y-2" data-review-pain-first="true">
            {recommendation.painFirst.map((report) => (
              <li
                key={report.feedbackId}
                data-review-pain-report={report.feedbackId}
                className="rounded-2xl border border-red-200 bg-red-50/60 p-3"
              >
                <p className="text-sm font-medium text-[#1B3A2D]">
                  {report.exerciseName}
                  {report.programWeek ? `, week ${report.programWeek}` : ''}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-[#6B7A72]">
                  She reported pain on this one and it has not been reviewed. There is no load
                  suggestion for it until you have.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {resolvedReports.has(report.feedbackId) ? (
                    <span
                      data-pain-reviewed={report.feedbackId}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700"
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                      Marked reviewed. Reload to see the suggestions it releases.
                    </span>
                  ) : (
                    <button
                      type="button"
                      data-resolve-pain={report.feedbackId}
                      disabled={isPending}
                      onClick={() => resolveReport(report.feedbackId)}
                      className="mef-focus-ring rounded-full border border-[#1B3A2D]/20 px-3 py-1 text-xs font-medium text-[#1B3A2D] disabled:opacity-50"
                    >
                      Mark reviewed
                    </button>
                  )}
                  {templateIds.map((templateId, index) => (
                    <Link
                      key={templateId}
                      href={`/coach/programs/${templateId}` as Route}
                      data-edit-one-exercise={report.feedbackId}
                      className="mef-focus-ring rounded-full border border-[#1B3A2D]/20 px-3 py-1 text-xs font-medium text-[#1B3A2D]"
                    >
                      Replace it, regress it or change its dose
                      {templateIds.length > 1 ? ` (session ${index + 1})` : ''}
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-sm leading-relaxed text-[#1B3A2D]">{recommendation.reasoning}</p>
        <p className="mt-3 text-xs leading-relaxed text-[#6B7A72]">
          Read from: {recommendation.basis.completedSessions} of{' '}
          {recommendation.basis.totalSessions} sessions ({recommendation.basis.completionPercent}%),{' '}
          {recommendation.basis.openPainReports} unreviewed pain report
          {recommendation.basis.openPainReports === 1 ? '' : 's'},{' '}
          {recommendation.basis.tooDifficultFlags} too difficult, {recommendation.basis.tooEasyFlags}{' '}
          too easy, {recommendation.basis.frictionExercises} exercise
          {recommendation.basis.frictionExercises === 1 ? '' : 's'} she worked around.
          {review.opened_early ? ' You opened this before the phase ended.' : ''}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[#6B7A72]">
          {recommendation.requiresCoachReview
            ? `Nothing is recommended while a pain report is unread, and nothing is blocked either. All six options below are still available, and none of them gives ${firstName} anything until you approve the draft it writes.`
            : `This is a suggestion. All six options below are available, and none of them gives ${firstName} anything until you approve the draft it writes.`}
        </p>
      </section>

      {/* 2. The signals, in short. */}
      <section className={`${CARD} p-5`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#3E5C46]">
          What happened in this phase
        </p>
        <div className="mt-3 space-y-1.5">
          {panel.insights.length === 0 ? (
            <p className="text-sm leading-relaxed text-[#6B7A72]">{NO_INSIGHTS_YET}</p>
          ) : (
            panel.insights.map((insight, index) => (
              <p
                key={index}
                data-review-insight={insight.tone}
                className="text-sm leading-relaxed text-[#1B3A2D]"
              >
                {insight.tone === 'attention' && (
                  <AlertTriangle
                    className="mr-1.5 inline h-3.5 w-3.5 -translate-y-px text-red-600"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                )}
                {insight.text}
              </p>
            ))
          )}
        </div>
      </section>

      {/* 3. The weights. */}
      <section className={`${CARD} p-5`} data-review-loads="true">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#3E5C46]">
          Weights for the next phase
        </p>
        {panel.loads.noLoggedWeights ? (
          <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]" data-no-logged-weights="true">
            {NO_LOGGED_WEIGHTS_YET}
          </p>
        ) : (
          <>
            <p className="mt-1.5 text-xs leading-relaxed text-[#6B7A72]">{panel.loads.modelReason}</p>
            <ul className="mt-3 space-y-4">
              {panel.loads.suggestions.map((suggestion) => (
                <li
                  key={suggestion.externalId}
                  data-load-suggestion={suggestion.externalId}
                  data-load-direction={suggestion.direction}
                >
                  <p className="text-sm font-medium text-[#1B3A2D]">{suggestion.exerciseName}</p>
                  <p
                    className={`mt-0.5 text-xs ${
                      suggestion.direction === 'needs_review' ? 'text-red-700' : 'text-[#6B7A72]'
                    }`}
                  >
                    {describeSuggestion(suggestion)} {suggestion.reason}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.5}
                      aria-label={`Weight for ${suggestion.exerciseName}`}
                      data-load-input={suggestion.externalId}
                      value={fieldText[suggestion.externalId] ?? ''}
                      onChange={(e) =>
                        editLoad(
                          suggestion.externalId,
                          e.target.value,
                          fieldUnit[suggestion.externalId] ?? suggestion.unit
                        )
                      }
                      placeholder="Leave blank for none"
                      className="w-32 rounded-xl border border-[#1B3A2D]/10 bg-white px-3 py-2 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
                    />
                    <div className="flex overflow-hidden rounded-full border border-[#1B3A2D]/15">
                      {LOGGED_LOAD_UNITS.map((unit) => (
                        <button
                          key={unit}
                          type="button"
                          aria-pressed={(fieldUnit[suggestion.externalId] ?? suggestion.unit) === unit}
                          onClick={() => {
                            setFieldUnit((current) => ({ ...current, [suggestion.externalId]: unit }));
                            editLoad(
                              suggestion.externalId,
                              fieldText[suggestion.externalId] ?? '',
                              unit
                            );
                          }}
                          className={`px-3 py-1.5 text-xs font-medium transition ${
                            (fieldUnit[suggestion.externalId] ?? suggestion.unit) === unit
                              ? 'bg-[#1B3A2D] text-white'
                              : 'bg-white text-[#6B7A72]'
                          }`}
                        >
                          {unit}
                        </button>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-[#6B7A72]">
              Edit any number or clear it. What you leave here is what gets written into the draft,
              and what {firstName} eventually reads as &ldquo;Your coach set&rdquo;. Only Progress to
              next phase carries these across.
            </p>
          </>
        )}
      </section>

      {/* 4. The six outcomes. */}
      <section className={`${CARD} p-5`} data-review-outcomes="true">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#3E5C46]">
          What happens next
        </p>

        <label className="mt-3 block text-xs font-medium text-[#6B7A72]" htmlFor="review-start-date">
          The next program starts
        </label>
        <input
          id="review-start-date"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="mt-1 rounded-xl border border-[#1B3A2D]/10 bg-white px-3 py-2 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
        />

        <label className="mt-4 block text-xs font-medium text-[#6B7A72]" htmlFor="review-notes">
          Your notes on this phase. Coach facing, and she never sees them.
        </label>
        <textarea
          id="review-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full rounded-xl border border-[#1B3A2D]/10 px-3 py-2 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
        />

        <ul className="mt-4 space-y-3">
          {outcomes.map((outcome) => (
            <li
              key={outcome.key}
              data-review-outcome={outcome.key}
              className={`rounded-2xl border p-4 ${
                outcome.key === recommendation.outcome
                  ? 'border-[#3E5C46]/40 bg-[#EFF6F1]/60'
                  : 'border-[#1B3A2D]/10'
              }`}
            >
              <p className="text-sm font-medium text-[#1B3A2D]">
                {outcome.label}
                {outcome.key === recommendation.outcome && (
                  <span className="ml-2 rounded-full bg-[#3E5C46] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                    Suggested
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#6B7A72]">{outcome.description}</p>

              {confirming === outcome.key ? (
                <div className="mt-2">
                  <p className="text-xs leading-relaxed text-[#1B3A2D]">{outcome.confirm}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      data-confirm-outcome={outcome.key}
                      disabled={isPending}
                      onClick={() => choose(outcome.key)}
                      className="rounded-full bg-[#1B3A2D] px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {isPending ? 'Working' : 'Yes, do it'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="rounded-full border border-[#1B3A2D]/15 px-4 py-1.5 text-xs font-medium text-[#6B7A72]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  data-choose-outcome={outcome.key}
                  disabled={isPending || draft !== null || approved}
                  onClick={() => setConfirming(outcome.key)}
                  className="mef-focus-ring mt-2 rounded-full border border-[#1B3A2D]/20 px-4 py-1.5 text-xs font-medium text-[#1B3A2D] disabled:opacity-40"
                >
                  {outcome.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* 5. The draft. */}
      {draft && (
        <section className={`${CARD} p-5`} data-review-draft={draft.outcome}>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#3E5C46]">
            Draft written, not given
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[#1B3A2D]">
            {draft.assignmentIds.length} weekly session
            {draft.assignmentIds.length === 1 ? '' : 's'} drafted, starting {startDate}.{' '}
            {firstName} cannot see any of it. She is still reading the message her finished program
            gives her.
          </p>
          {draft.unchangedExercises.length > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-[#6B7A72]">
              These kept their exercise, because the slot is locked or nothing else qualified:{' '}
              {draft.unchangedExercises.join(', ')}.
            </p>
          )}
          {approved ? (
            <p
              data-review-approved="true"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700"
            >
              <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Approved. {firstName} has it now.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                data-approve-draft="true"
                disabled={isPending}
                onClick={approveDraft}
                className="mef-focus-ring rounded-full bg-[#1B3A2D] px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Approve and give it to {firstName}
              </button>
              <button
                type="button"
                data-discard-draft="true"
                disabled={isPending}
                onClick={discardDraft}
                className="mef-focus-ring inline-flex items-center gap-1.5 rounded-full border border-[#1B3A2D]/20 px-5 py-2 text-sm font-medium text-[#6B7A72] disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Discard
              </button>
            </div>
          )}
        </section>
      )}

      {/* 6. What she reviewed before. */}
      {screen.history.length > 0 && (
        <section className={`${CARD} p-5`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#3E5C46]">
            Earlier reviews of this program
          </p>
          <ul className="mt-2 space-y-2 text-xs text-[#6B7A72]">
            {screen.history.map((entry) => (
              <li key={entry.id}>
                {entry.created_at.slice(0, 10)}: suggested {entry.recommended_outcome.replace(/_/g, ' ')}
                {entry.chosen_outcome
                  ? `, you chose ${entry.chosen_outcome.replace(/_/g, ' ')} (${entry.status})`
                  : ', nothing chosen'}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
