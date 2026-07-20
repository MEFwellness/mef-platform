'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck } from 'lucide-react';
import {
  assignAssessmentAction,
  cancelAssessmentAssignmentAction,
} from '@/app/actions/assessmentAssignments';
import type { AssessmentAssignment } from '@/app/actions/assessmentAssignments';
import type { AssessmentKey } from '@/lib/assessment-registry/types';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function formatTimestamp(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const STATUS_LABEL: Record<AssessmentAssignment['status'], string> = {
  pending: 'Pending',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

type Props = {
  clientId: string;
  assignableAssessments: { key: AssessmentKey; displayName: string }[];
  assignmentsByDefinitionId: Record<string, string>; // assessment_definition_id -> displayName, for rendering existing assignments
  initialAssignments: AssessmentAssignment[];
};

export function AssessmentAssignmentPanel({
  clientId,
  assignableAssessments,
  assignmentsByDefinitionId,
  initialAssignments,
}: Props) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState<AssessmentKey | ''>('');
  const [isRequired, setIsRequired] = useState(true);
  const [reason, setReason] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAssign(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedKey) return;
    setError(null);
    startTransition(async () => {
      const result = await assignAssessmentAction(clientId, selectedKey, {
        isRequired,
        reason,
        dueAt,
        stage: 'standard',
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSelectedKey('');
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
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <ClipboardCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Assign an Assessment</p>
      </div>
      <p className="mt-1 text-xs text-[#6B7A72]">
        Assign a questionnaire for this client to complete, with an optional due date and reason.
      </p>

      <form onSubmit={handleAssign} className="mt-4 space-y-3">
        <select
          value={selectedKey}
          onChange={(event) => setSelectedKey(event.target.value as AssessmentKey)}
          className="w-full rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
        >
          <option value="">Choose an assessment…</option>
          {assignableAssessments.map((a) => (
            <option key={a.key} value={a.key}>
              {a.displayName}
            </option>
          ))}
        </select>

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
            disabled={isPending || !selectedKey}
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
                <p className="truncate text-sm font-medium text-[#1B3A2D]">
                  {assignmentsByDefinitionId[assignment.assessmentDefinitionId] ?? 'Assessment'}
                </p>
                <p className="mt-0.5 text-xs text-[#6B7A72]">
                  {STATUS_LABEL[assignment.status]}
                  {assignment.dueAt ? ` · Due ${formatTimestamp(assignment.dueAt)}` : ''}
                  {assignment.isRequired ? ' · Required' : ' · Optional'}
                </p>
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
