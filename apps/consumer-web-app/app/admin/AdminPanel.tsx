'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  grantCoachRole,
  revokeCoachRole,
  assignClientToCoach,
  revokeAssignment
} from '@/app/actions/admin';
import type { CoachClientAssignment, Profile } from '@mef/shared-types-contracts';

type Props = {
  users: Profile[];
  coachIds: string[];
  assignments: CoachClientAssignment[];
};

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function nameFor(users: Profile[], id: string): string {
  return users.find((u) => u.id === id)?.display_name ?? id.slice(0, 8);
}

export function AdminPanel({ users, coachIds, assignments }: Props) {
  const router = useRouter();
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [coachSelect, setCoachSelect] = useState('');
  const [clientSelect, setClientSelect] = useState('');

  const coachSet = new Set(coachIds);
  const coaches = users.filter((u) => coachSet.has(u.id));

  async function handleRoleToggle(userId: string, isCoach: boolean) {
    setPendingUserId(userId);
    setError('');
    const result = isCoach ? await revokeCoachRole(userId) : await grantCoachRole(userId);
    setPendingUserId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleAssign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!coachSelect || !clientSelect) {
      setError('Choose both a coach and a client.');
      return;
    }
    setError('');
    const result = await assignClientToCoach(coachSelect, clientSelect);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCoachSelect('');
    setClientSelect('');
    router.refresh();
  }

  async function handleRevoke(assignmentId: string) {
    const reason = window.prompt('Reason for revoking this assignment?') ?? '';
    setError('');
    const result = await revokeAssignment(assignmentId, reason);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-7 space-y-5">
      {error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className={`${CARD} p-6`}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">Users</p>
        <div className="mt-3 divide-y divide-[#1B3A2D]/5">
          {users.map((u) => {
            const isCoach = coachSet.has(u.id);
            return (
              <div key={u.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium text-[#1B3A2D]">{u.display_name ?? 'Unnamed'}</p>
                  <p className="text-xs text-[#6B7A72]">{u.timezone}</p>
                </div>
                <button
                  type="button"
                  disabled={pendingUserId === u.id}
                  onClick={() => handleRoleToggle(u.id, isCoach)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                    isCoach
                      ? 'border-[#1B3A2D]/10 text-[#1B3A2D] hover:border-[#1B3A2D]/30'
                      : 'border-[#F5B700] bg-[#F5B700] text-[#1B3A2D] hover:brightness-95'
                  }`}
                >
                  {pendingUserId === u.id ? 'Working…' : isCoach ? 'Revoke coach' : 'Grant coach'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className={`${CARD} p-6`}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
          Assign a client to a coach
        </p>
        <form onSubmit={handleAssign} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-sm text-[#6B7A72]" htmlFor="coachSelect">
              Coach
            </label>
            <select
              id="coachSelect"
              value={coachSelect}
              onChange={(event) => setCoachSelect(event.target.value)}
              className="mt-1.5 w-full rounded-2xl border border-[#1B3A2D]/10 bg-white p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
            >
              <option value="">Select a coach</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name ?? c.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-sm text-[#6B7A72]" htmlFor="clientSelect">
              Client
            </label>
            <select
              id="clientSelect"
              value={clientSelect}
              onChange={(event) => setClientSelect(event.target.value)}
              className="mt-1.5 w-full rounded-2xl border border-[#1B3A2D]/10 bg-white p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
            >
              <option value="">Select a client</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name ?? u.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-full bg-[#F5B700] px-5 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95"
          >
            Assign
          </button>
        </form>
      </section>

      <section className={`${CARD} p-6`}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
          Assignment history
        </p>
        {assignments.length > 0 ? (
          <div className="mt-3 divide-y divide-[#1B3A2D]/5">
            {assignments.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span className="text-[#1B3A2D]">
                  {nameFor(users, a.coach_id)} → {nameFor(users, a.client_id)}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    a.status === 'active'
                      ? 'bg-[#EFF6F1] text-[#1B3A2D]'
                      : 'bg-[#F3F6F4] text-[#6B7A72]'
                  }`}
                >
                  {a.status}
                </span>
                {a.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => handleRevoke(a.id)}
                    className="text-xs font-medium text-[#854D0E] underline underline-offset-2"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[#6B7A72]">No assignments yet.</p>
        )}
      </section>
    </div>
  );
}
