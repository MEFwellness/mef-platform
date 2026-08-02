'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import {
  grantResetPlanAccessAction,
  resetResetPlanForMemberAction,
  revokeResetPlanAccessAction,
  shiftResetPlanAction,
  type ResetPlanShiftPattern,
  type ResetPlanTestableMember,
} from '@/app/actions/resetPlanAdmin';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const PRIMARY_BUTTON =
  'mef-focus-ring inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1B3A2D] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#163025] disabled:opacity-50';
const SECONDARY_BUTTON =
  'mef-focus-ring inline-flex items-center justify-center gap-2 rounded-2xl border border-[#1B3A2D]/15 px-5 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4] disabled:opacity-50';

export function ResetPlanTestToolsPanel({ members }: { members: ResetPlanTestableMember[] }) {
  const [memberId, setMemberId] = useState('');
  const [pattern, setPattern] = useState<ResetPlanShiftPattern>('mostly_normal');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; summary?: string; error?: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(result.ok ? { kind: 'ok', text: result.summary ?? 'Done.' } : { kind: 'error', text: result.error ?? 'Something went wrong.' });
    });
  }

  return (
    <div className="mt-6 space-y-4">
      <section className={`${CARD} p-6`}>
        <label htmlFor="reset-plan-test-member" className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
          Test member
        </label>
        <select
          id="reset-plan-test-member"
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          className="mef-focus-ring mt-2 w-full rounded-2xl border border-[#1B3A2D]/15 bg-white px-4 py-3 text-sm text-[#1B3A2D]"
        >
          <option value="">Choose a member…</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
      </section>

      <section className={`${CARD} p-6`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Access</p>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          Grants or revokes profiles.reset_plan_granted_at. The future checkout flow will do this automatically; for
          now it is set manually here.
        </p>
        <div className="mt-4 flex gap-3">
          <button type="button" disabled={!memberId || isPending} onClick={() => run(() => grantResetPlanAccessAction(memberId))} className={`${PRIMARY_BUTTON} flex-1`}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Grant
          </button>
          <button type="button" disabled={!memberId || isPending} onClick={() => run(() => revokeResetPlanAccessAction(memberId))} className={`${SECONDARY_BUTTON} flex-1`}>
            Revoke
          </button>
        </div>
      </section>

      <section className={`${CARD} p-6`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Reset</p>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          Deletes this member&apos;s current Personal Reset Plan (versions and daily logs cascade). They can then
          create one fresh.
        </p>
        <button type="button" disabled={!memberId || isPending} onClick={() => run(() => resetResetPlanForMemberAction(memberId))} className={`${PRIMARY_BUTTON} mt-4 w-full`}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Reset Personal Reset Plan for this member
        </button>
      </section>

      <section className={`${CARD} p-6`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Time-shift the plan</p>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          Moves this member&apos;s active plan&apos;s start date back so it reads as day 3 or day 7 right now, and
          clears any earlier day-3/day-7 pop-up dismissal so it can fire again. The member needs to have already
          completed the creation flow (Begin My Plan) before this will do anything.
        </p>

        <button type="button" disabled={!memberId || isPending} onClick={() => run(() => shiftResetPlanAction(memberId, 3))} className={`${PRIMARY_BUTTON} mt-4 w-full`}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Fire day-3 check-in now
        </button>

        <div className="mt-4">
          <label htmlFor="reset-plan-day7-pattern" className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Day-7 daily pattern to seed
          </label>
          <select
            id="reset-plan-day7-pattern"
            value={pattern}
            onChange={(e) => setPattern(e.target.value as ResetPlanShiftPattern)}
            className="mef-focus-ring mt-2 w-full rounded-2xl border border-[#1B3A2D]/15 bg-white px-4 py-3 text-sm text-[#1B3A2D]"
          >
            <option value="mostly_normal">Mostly normal (5 normal / 1 not-today / 1 no response)</option>
            <option value="mixed">Mixed effort (normal + difficult-day)</option>
            <option value="mostly_not_today">Mostly not-today (triggers the difficult-day offer)</option>
            <option value="no_response">No response logged at all (honest zero-data case)</option>
          </select>
        </div>

        <button type="button" disabled={!memberId || isPending} onClick={() => run(() => shiftResetPlanAction(memberId, 7, pattern))} className={`${SECONDARY_BUTTON} mt-3 w-full`}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Fire day-7 reflection now
        </button>
      </section>

      {message && (
        <p role="status" className={`rounded-2xl px-5 py-4 text-sm leading-relaxed ${message.kind === 'ok' ? 'bg-[#EFF6F1] text-[#1B3A2D]' : 'bg-[#FDEEEE] text-[#9B4040]'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
