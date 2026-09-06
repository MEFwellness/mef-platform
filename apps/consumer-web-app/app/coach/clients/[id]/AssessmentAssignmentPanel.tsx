'use client';

import { useId, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, Search } from 'lucide-react';
import {
  assignAssessmentAction,
  cancelAssessmentAssignmentAction,
} from '@/app/actions/assessmentAssignments';
import type { AssessmentAssignment } from '@/app/actions/assessmentAssignments';
import {
  filterAssignableTemplates,
  templateStatusLine,
  type AssignableTemplate,
} from '@/lib/assignments/assignableCatalog';
import { useAssignSearchQueryRequests } from '@/lib/coach-detail/detailBus';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/**
 * WHAT KIND OF ROW THIS IS, in one word, and nothing more.
 *
 * It deliberately no longer carries the due date: that is part of one
 * sentence now, written on the server against the member's own timezone
 * and her own calendar day (getClientAssessmentAssignments), so a chip and
 * a line here can never disagree about whether something is late. Printing
 * the due date on its own was also how "Pending, due Sep 1" managed to
 * look identical whether that date was tomorrow or a week ago.
 */
const STATUS_LABEL: Record<AssessmentAssignment['status'], string> = {
  pending: 'Pending',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/**
 * THE PICKER IS A SEARCHABLE LIST, NOT A DROPDOWN (2026-09-06).
 *
 * It was a native select. That is the right control for five options and
 * the wrong one for a library that keeps growing: a coach on a phone got a
 * scrolling wheel of names with no way to type, and no way to see whether
 * the thing she was about to send had already been sent, already been
 * finished, or was sitting unopened on the client's screen.
 *
 * Three things changed and nothing else did. The list can be typed at. The
 * names come from the shared map rather than from the registry directly,
 * which is the map that exists so no surface prints the generic word. And
 * every row carries this client's own standing on that questionnaire,
 * taken from the assignment rows this panel was ALREADY given, using the
 * sentence the server already wrote. No new query, no second status
 * vocabulary, and the row lower down the page and the row in this list are
 * reading one string.
 *
 * What did NOT change: which questionnaires a coach may send, what the
 * Assign button does, and the three coach-assigned deep-dives, which keep
 * their own Assign buttons on their own panels.
 */
type Props = {
  clientId: string;
  assignableTemplates: AssignableTemplate[];
  assignmentsByDefinitionId: Record<string, string>; // assessment_definition_id -> displayName, for rendering existing assignments
  initialAssignments: AssessmentAssignment[];
};

export function AssessmentAssignmentPanel({
  clientId,
  assignableTemplates,
  assignmentsByDefinitionId,
  initialAssignments,
}: Props) {
  const router = useRouter();
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [isRequired, setIsRequired] = useState(true);
  const [reason, setReason] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /*
    THE PAGE'S OWN PINNED SEARCH CAN TYPE INTO THIS FIELD (2026-09-06).
    Choosing a questionnaire up there scrolls here and puts the same query
    in, so the list a coach lands on is the list she was already looking
    at. It is a subscription rather than a prop on purpose: this panel is
    rendered on its own in tests and on a page with no such search, and a
    request nobody sends simply never arrives. Nothing else about this
    field changed, and typing in it directly still works exactly as it did.
  */
  useAssignSearchQueryRequests((incoming) => setQuery(incoming));

  const visibleTemplates = useMemo(
    () => filterAssignableTemplates(assignableTemplates, query),
    [assignableTemplates, query]
  );
  // Only a row this panel can actually send may be the selection. A row
  // whose Assign button lives on its own card is never selectable, so the
  // Assign button below can never claim something it cannot do.
  const selectedTemplate =
    assignableTemplates.find((t) => t.id === selectedId && t.assignKey !== null) ?? null;

  function handleAssign(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedTemplate?.assignKey) return;
    const assignKey = selectedTemplate.assignKey;
    setError(null);
    startTransition(async () => {
      const result = await assignAssessmentAction(clientId, assignKey, {
        isRequired,
        reason,
        dueAt,
        stage: 'standard',
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSelectedId('');
      setQuery('');
      setReason('');
      setDueAt('');
      setIsRequired(true);
      router.refresh();
    });
  }

  function handleCancel(assignmentId: string) {
    startTransition(async () => {
      const result = await cancelAssessmentAssignmentAction(assignmentId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const pendingAssignments = initialAssignments.filter((a) => a.status === 'pending');
  const pastAssignments = initialAssignments.filter((a) => a.status !== 'pending');

  return (
    /*
      Named, so anything addressing this card addresses it by its
      accessible name rather than by copy another panel could also carry.
      The heading beside the icon is a paragraph, not a heading element, so
      the card had no name of its own to be found by.
    */
    <section className={`${CARD} p-6`} aria-label="Assign an Assessment">
      <div className="flex items-center gap-2 text-[#854D0E]">
        <ClipboardCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Assign an Assessment</p>
      </div>
      <p className="mt-1 text-xs text-[#6B7A72]">
        Assign a questionnaire for this client to complete, with an optional due date and reason.
      </p>

      <form onSubmit={handleAssign} className="mt-4 space-y-3">
        <div>
          <label htmlFor={searchId} className="sr-only">
            Search questionnaires by name or area
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7A72]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <input
              id={searchId}
              type="search"
              inputMode="search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or area"
              className="w-full rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] py-3 pl-11 pr-4 text-base text-[#1B3A2D] placeholder:text-[#6B7A72] focus:border-[#F5B700] focus:outline-none sm:text-sm"
            />
          </div>
        </div>

        <div
          /*
            A group, not a radiogroup. A radiogroup's children all have to
            be radios, and this list deliberately holds rows that are not
            controls at all.
          */
          role="group"
          aria-label="Questionnaires for this client"
          className="max-h-72 divide-y divide-[#1B3A2D]/5 overflow-y-auto rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8]"
        >
          {visibleTemplates.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[#6B7A72]">
              Nothing here matches that. Try part of a questionnaire name, or an area like Movement.
            </p>
          ) : (
            visibleTemplates.map((template) => {
              const selected = template.id === selectedId && template.assignKey !== null;
              /*
                Two kinds of row. One this panel can send, which behaves as
                the dropdown option it replaced did. One it cannot, whose
                Assign button lives on its own card further up the page, and
                which is therefore not a control at all: it is findable,
                it reports where this client stands, and it says where to go.
              */
              const body = (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-[#1B3A2D]">
                      {template.displayName}
                    </span>
                    <span className="shrink-0 rounded-full bg-[#1B3A2D]/5 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#4F645A]">
                      {template.areaLabel}
                    </span>
                  </div>
                  {/*
                    This client's own standing on this questionnaire, and it
                    is the assignment's own server written sentence, not a
                    second one built here. The row further down this page
                    prints the identical string.
                  */}
                  <p className="mt-0.5 text-xs text-[#6B7A72]">
                    {templateStatusLine(initialAssignments, template.definitionId)}
                  </p>
                  {template.assignedFromLabel && (
                    <p className="mt-0.5 text-xs italic text-[#8A9A92]">
                      {template.assignedFromLabel}
                    </p>
                  )}
                </>
              );

              if (template.assignKey === null) {
                return (
                  <div key={template.id} className="px-4 py-3">
                    {body}
                  </div>
                );
              }

              return (
                <button
                  key={template.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedId(template.id)}
                  className={`block w-full px-4 py-3 text-left transition ${
                    selected ? 'bg-[#F5B700]/15' : 'hover:bg-[#1B3A2D]/[0.03]'
                  }`}
                >
                  {body}
                </button>
              );
            })
          )}
        </div>

        {selectedTemplate && (
          <p className="text-xs text-[#4F645A]">
            Selected:{' '}
            <span className="font-medium text-[#1B3A2D]">{selectedTemplate.displayName}</span>
          </p>
        )}

        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Optional reason for this client…"
          rows={2}
          className="w-full resize-none rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-4 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
        />

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-[#1B3A2D]">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(event) => setIsRequired(event.target.checked)}
              className="h-4 w-4 rounded border-[#1B3A2D]/20"
            />
            Required
          </label>
          <label className="flex items-center gap-2 text-sm text-[#1B3A2D]">
            Due
            <input
              type="date"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              className="rounded-xl border border-[#1B3A2D]/10 bg-[#FAFAF8] px-3 py-1.5 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
            />
          </label>
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending || !selectedTemplate}
            className="rounded-full bg-[#1B3A2D] px-5 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      </form>

      <div className="mt-4 divide-y divide-[#1B3A2D]/5">
        {pendingAssignments.length === 0 && pastAssignments.length === 0 ? (
          <p className="py-4 text-sm text-[#6B7A72]">No assessments assigned yet.</p>
        ) : (
          [...pendingAssignments, ...pastAssignments].map((assignment) => (
            <div key={assignment.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium text-[#1B3A2D]">
                    {assignmentsByDefinitionId[assignment.assessmentDefinitionId] ?? 'Assessment'}
                  </p>
                  {assignment.progress.due.isOverdue && (
                    <span className="shrink-0 rounded-full bg-[#FDECEC] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#9B2C2C]">
                      Overdue
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[#6B7A72]">
                  {STATUS_LABEL[assignment.status]}
                  {assignment.isRequired ? ' · Required' : ' · Optional'}
                </p>
                {/*
                  One sentence, written on the server. It says when it was
                  sent, whether it has actually reached her screen
                  (member_assignment_deliveries, migration 210) and whether
                  it is late. This component formats none of it: its day
                  names belong to the member's timezone and this renders in
                  the coach's.
                */}
                <p className="mt-0.5 text-xs text-[#6B7A72]">{assignment.statusLine}</p>
              </div>
              {assignment.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => handleCancel(assignment.id)}
                  disabled={isPending}
                  className="shrink-0 text-xs font-medium text-[#6B7A72] hover:text-[#1B3A2D] disabled:opacity-40"
                >
                  Cancel
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
