'use client';

/**
 * The first thing a coach sees when Assessments and Findings opens: where
 * this client stands on every assessment, in three groups, one compact row
 * each.
 *
 * WHAT IT REPLACED. The section used to open on its findings, with the
 * assessment list at the very bottom of a long scroll, and every
 * unassigned deep-dive drawn as a full card repeating one sentence about
 * how nothing is offered until you send it. Nine cards said the same
 * sentence nine times, which is most of the height of the section and none
 * of its information.
 *
 * IT DECIDES NOTHING. The three groups and the three counts arrive already
 * decided (lib/coach-detail/assessmentStatus.ts), from the assignment rows
 * the page had already fetched, and the folded header's digest reads that
 * same object, so a header and a group heading cannot disagree. Every
 * sentence under a row is the assignment's own `statusLine`, written on
 * the server in the MEMBER's timezone. This component formats no date.
 *
 * THE ASSIGN FORM IS INLINE, AND IT BELONGS TO ITS ROW. Only one is open
 * at a time, because two open forms on one list is two ways to be halfway
 * through sending something. Its FIELDS come from the row's capability,
 * never from copy: the registry's questionnaires take a reason, a Required
 * flag and a due date, and the nine coach-assigned deep-dives take a due
 * date and are always required. The server drops anything else
 * (app/actions/coachAssessmentRowAssign.ts), so a stale page cannot write
 * something the ledger has nowhere to put.
 */

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck } from 'lucide-react';
import { assignAssessmentRowAction } from '@/app/actions/coachAssessmentRowAssign';
import { cancelAssessmentAssignmentAction } from '@/app/actions/assessmentAssignments';
import {
  assessmentRowElementId,
  type AssessmentStatusGroups,
  type AssessmentStatusRow,
} from '@/lib/coach-detail/assessmentStatus';
import { requestDetailSection, useAssessmentRowFocusRequests } from '@/lib/coach-detail/detailBus';
import { sectionIdForAnchor } from '@/lib/coach-detail/sections';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
/*
  THE ROW IS ONE LINE HIGH WHEREVER IT CAN BE, which is the whole reason
  this block replaced nineteen cards. The name takes the width it needs
  and the area chip sits beside it, dropping to a second line only when a
  long name on a narrow phone leaves it nowhere else to go. Nothing here
  is a new colour, a new radius or a new type size: the chip is the one
  the deleted Assign panel used, one step smaller.
*/
const CHIP =
  'shrink-0 rounded-full bg-[#1B3A2D]/5 px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-[#4F645A]';
const OVERDUE_CHIP =
  'shrink-0 rounded-full bg-[#FDECEC] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#9B2C2C]';
const FIELD =
  'w-full rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none';

/**
 * The one line of context the Not Yet Assigned group carries, said once
 * for the whole group instead of once per row.
 */
const NOT_YET_ASSIGNED_NOTE = 'Nothing here is offered to them until you send it.';

const GROUP_TITLE = {
  notYetAssigned: 'Not Yet Assigned',
  waiting: 'Assigned, Waiting',
  completed: 'Completed',
} as const;

const EMPTY_LINE = {
  notYetAssigned: 'Everything in the library has been sent.',
  waiting: 'Nothing is waiting on them right now.',
  completed: 'Nothing finished yet.',
} as const;

type GroupKey = keyof typeof GROUP_TITLE;

export function AssessmentStatusBlock({
  clientId,
  groups,
}: {
  clientId: string;
  groups: AssessmentStatusGroups;
}) {
  const router = useRouter();
  const [openFormRowId, setOpenFormRowId] = useState<string | null>(null);
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /*
    The pinned search at the top of the page can point at one of these
    rows. It is a subscription rather than a prop because this block is
    rendered on its own in tests and the search is a sibling under a Server
    Component, and a request nobody sends simply never arrives. The SCROLL
    belongs to the section, which is asked to scroll to this row's own DOM
    id and already knows to wait until the contents exist.
  */
  useAssessmentRowFocusRequests((rowId) => setHighlightedRowId(rowId));

  // The mark is a pointer, not a state. It fades on its own so a coach who
  // came back to this block later is not still being told where she once
  // looked.
  useEffect(() => {
    if (highlightedRowId === null) return;
    const timer = setTimeout(() => setHighlightedRowId(null), 6000);
    return () => clearTimeout(timer);
  }, [highlightedRowId]);

  function toggleForm(rowId: string) {
    setError(null);
    setOpenFormRowId((current) => (current === rowId ? null : rowId));
  }

  function cancelAssignment(assignmentId: string) {
    setError(null);
    startTransition(async () => {
      const result = await cancelAssessmentAssignmentAction(assignmentId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function goToResults(anchorId: string) {
    const sectionId = sectionIdForAnchor(anchorId);
    if (!sectionId) return;
    requestDetailSection({ sectionId, anchorId });
  }

  return (
    <section className={`${CARD} p-6`} aria-label="Assessment Status">
      <div className="flex items-center gap-2 text-[#854D0E]">
        <ClipboardCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Assessment Status</p>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 space-y-4">
        {(['notYetAssigned', 'waiting', 'completed'] as GroupKey[]).map((key) => (
          <div key={key} data-assessment-group={key}>
            <div className="flex items-baseline gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                {GROUP_TITLE[key]}
              </h3>
              <span className="text-xs font-semibold text-[#1B3A2D]">({groups[key].length})</span>
            </div>

            {key === 'notYetAssigned' && groups[key].length > 0 && (
              <p className="mt-1 text-xs text-[#6B7A72]">{NOT_YET_ASSIGNED_NOTE}</p>
            )}

            {groups[key].length === 0 ? (
              <p className="mt-2 text-sm text-[#6B7A72]">{EMPTY_LINE[key]}</p>
            ) : (
              <ul className="mt-1.5 divide-y divide-[#1B3A2D]/5 border-t border-[#1B3A2D]/5">
                {groups[key].map((row) => (
                  <AssessmentRow
                    key={row.id}
                    row={row}
                    group={key}
                    clientId={clientId}
                    highlighted={highlightedRowId === row.id}
                    formOpen={openFormRowId === row.id}
                    busy={isPending}
                    onToggleForm={() => toggleForm(row.id)}
                    onAssigned={() => {
                      setOpenFormRowId(null);
                      router.refresh();
                    }}
                    onCancel={cancelAssignment}
                    onOpenResults={goToResults}
                  />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function AssessmentRow({
  row,
  group,
  clientId,
  highlighted,
  formOpen,
  busy,
  onToggleForm,
  onAssigned,
  onCancel,
  onOpenResults,
}: {
  row: AssessmentStatusRow;
  group: GroupKey;
  clientId: string;
  highlighted: boolean;
  formOpen: boolean;
  busy: boolean;
  onToggleForm: () => void;
  onAssigned: () => void;
  onCancel: (assignmentId: string) => void;
  onOpenResults: (anchorId: string) => void;
}) {
  return (
    <li
      id={assessmentRowElementId(row.id)}
      data-assessment-row={row.id}
      className={`-mx-1 scroll-mt-24 rounded-xl px-1 py-2 transition ${
        highlighted ? 'bg-[#F5B700]/15' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium leading-snug text-[#1B3A2D]">
              {row.displayName}
            </span>
            <span className={CHIP}>{row.areaLabel}</span>
            {row.assignment?.isOverdue && <span className={OVERDUE_CHIP}>Overdue</span>}
          </div>
          {/*
            One sentence, written on the server: when it was sent, whether
            it reached her screen, whether it is late, or the day she
            finished. Nothing is formatted here, because this renders in the
            coach's timezone and those days belong to the member's.
          */}
          {row.assignment && (
            <p className="mt-0.5 text-xs leading-snug text-[#6B7A72]">
              {row.assignment.statusLine}
              {group === 'waiting' && (row.assignment.isRequired ? ' Required.' : ' Optional.')}
            </p>
          )}
        </div>

        {group === 'notYetAssigned' && row.capability.canAssign && (
          <button
            type="button"
            onClick={onToggleForm}
            aria-expanded={formOpen}
            className="mef-focus-ring mef-press shrink-0 rounded-full bg-[#1B3A2D] px-3.5 py-1 text-xs font-semibold text-white transition hover:bg-[#163025]"
          >
            {formOpen ? 'Close' : 'Assign'}
          </button>
        )}

        {group === 'waiting' && row.assignment && (
          <button
            type="button"
            onClick={() => onCancel(row.assignment!.id)}
            disabled={busy}
            className="mef-focus-ring shrink-0 text-xs font-medium text-[#6B7A72] transition hover:text-[#1B3A2D] disabled:opacity-40"
          >
            Cancel
          </button>
        )}

        {group === 'completed' && row.resultsAnchorId && (
          <button
            type="button"
            onClick={() => onOpenResults(row.resultsAnchorId!)}
            className="mef-focus-ring shrink-0 text-xs font-semibold text-[#1B3A2D] underline underline-offset-2 transition hover:text-[#163025]"
          >
            View results
          </button>
        )}
      </div>

      {formOpen && row.capability.canAssign && (
        <InlineAssignForm row={row} clientId={clientId} onAssigned={onAssigned} />
      )}
    </li>
  );
}

/**
 * The assign form for exactly one row.
 *
 * It draws the fields that row's own write path can actually store, and
 * nothing else. A deep-dive is written as required with no reason by its
 * own action, so this offers neither for one, and says the one true thing
 * about it instead.
 */
function InlineAssignForm({
  row,
  clientId,
  onAssigned,
}: {
  row: AssessmentStatusRow;
  clientId: string;
  onAssigned: () => void;
}) {
  const reasonId = useId();
  const dueId = useId();
  const [isRequired, setIsRequired] = useState(true);
  const [reason, setReason] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    reasonRef.current?.focus();
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await assignAssessmentRowAction(clientId, row.id, {
        isRequired,
        reason,
        dueDate,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onAssigned();
    });
  }

  return (
    <form
      onSubmit={submit}
      data-assign-form={row.id}
      aria-label={`Assign ${row.displayName}`}
      className="mt-3 space-y-3 rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-4"
    >
      {row.capability.acceptsReason && (
        <div>
          <label htmlFor={reasonId} className="sr-only">
            Optional reason for this client
          </label>
          <textarea
            id={reasonId}
            ref={reasonRef}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Optional reason for this client"
            rows={2}
            className={`${FIELD} resize-none`}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        {row.capability.acceptsRequired && (
          <label className="flex items-center gap-2 text-sm text-[#1B3A2D]">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(event) => setIsRequired(event.target.checked)}
              className="h-4 w-4 rounded border-[#1B3A2D]/20"
            />
            Required
          </label>
        )}
        {row.capability.acceptsDueDate && (
          <label htmlFor={dueId} className="flex items-center gap-2 text-sm text-[#1B3A2D]">
            Due
            <input
              id={dueId}
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="rounded-xl border border-[#1B3A2D]/10 bg-white px-3 py-1.5 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
            />
          </label>
        )}
      </div>

      {!row.capability.acceptsRequired && (
        <p className="text-xs text-[#6B7A72]">
          This one is always sent as required. Leave the date blank to use its own default.
        </p>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="mef-focus-ring mef-press rounded-full bg-[#1B3A2D] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#163025] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? 'Sending' : 'Assign'}
        </button>
      </div>
    </form>
  );
}
