'use client';

/**
 * The controls. One card per member, each one a complete answer to "what
 * does this person have, and how do I change it".
 *
 * Every button here calls a server action that calls one database function.
 * There is no optimistic state and no local cache: after a change the page
 * is refreshed and the row is re-read, so what is on screen is always what
 * the database actually holds. For a screen whose entire job is deciding
 * whether a paying customer can open the app, showing a hopeful guess would
 * be the wrong trade.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { expireMemberAccessAction, setMemberAccessAction } from '@/app/actions/memberAccess';
import { setTrialArcSuppressionAction } from '@/app/actions/trialArc';
import type { MemberAccessRow } from '@/app/actions/memberAccess';
import {
  ACCESS_SOURCE_LABEL,
  ACCESS_TIERS,
  ACCESS_TIER_LABEL,
  isAccessSource,
} from '@/lib/membership/types';
import type { AccessTier } from '@/lib/membership/types';
import { formatDisplayDate } from '@/lib/time/displayDate';

export interface MemberAccessView extends MemberAccessRow {
  /** Computed on the server, see the page's own note on why. */
  accessLabel: string;
  allowed: boolean;
  trialDaysLeft: number | null;
}

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/**
 * B3 (2026-08-28): this used to be `toLocaleDateString(undefined, ...)`.
 * With no locale and no timeZone, it resolved against whichever machine
 * ran it: Vercel renders in UTC, the administrator's browser renders in
 * their own zone and locale, so a trial timestamp near a day boundary
 * produced different text on the two passes and React threw hydration
 * errors #418, #423 and #425 on every load of this screen.
 *
 * The shared helper already existed and pins both. Same three dates, same
 * wording, one text.
 */
function formatDate(value: string | null): string {
  if (!value) return 'not set';
  return formatDisplayDate(value, { year: 'numeric', month: 'short', day: 'numeric' });
}

function sourceLabel(source: string | null): string {
  if (isAccessSource(source)) return ACCESS_SOURCE_LABEL[source];
  return 'No record yet';
}

export function MemberAccessPanel({
  rows,
  includeTest,
}: {
  rows: MemberAccessView[];
  includeTest: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function run(memberId: string, work: () => Promise<{ ok: boolean; error?: string }>) {
    setPendingId(memberId);
    setError('');
    setNotice('');
    startTransition(async () => {
      const result = await work();
      setPendingId(null);
      if (!result.ok) {
        setError(result.error ?? 'That change could not be saved.');
        return;
      }
      setNotice('Saved.');
      router.refresh();
    });
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={
            (includeTest ? '/admin/access' : '/admin/access?includeTest=1') as Route
          }
          className="mef-focus-ring rounded-full border border-[#1B3A2D]/10 px-4 py-2 text-xs font-medium text-[#1B3A2D] transition hover:border-[#1B3A2D]/30"
        >
          {includeTest ? 'Hide test accounts' : 'Show test accounts'}
        </Link>
      </div>

      {error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && !error && (
        <p role="status" className="rounded-2xl bg-[#EFF6F1] px-4 py-3 text-sm text-[#1B3A2D]">
          {notice}
        </p>
      )}

      {rows.length === 0 ? (
        <p className={`${CARD} p-6 text-sm text-[#6B7A72]`}>No members to show.</p>
      ) : (
        rows.map((row) => (
          <MemberCard
            key={row.memberId}
            row={row}
            busy={isPending && pendingId === row.memberId}
            disabled={isPending}
            onRun={run}
          />
        ))
      )}
    </div>
  );
}

function MemberCard({
  row,
  busy,
  disabled,
  onRun,
}: {
  row: MemberAccessView;
  busy: boolean;
  disabled: boolean;
  onRun: (memberId: string, work: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [tier, setTier] = useState<AccessTier>(row.tier ?? 'trial');
  const [note, setNote] = useState('');

  const buttonBase =
    'mef-focus-ring shrink-0 rounded-full px-3.5 py-2 text-xs font-medium transition disabled:opacity-50';
  const quiet = `${buttonBase} border border-[#1B3A2D]/10 text-[#1B3A2D] hover:border-[#1B3A2D]/30`;
  const strong = `${buttonBase} bg-[#F5B700] text-[#1B3A2D] hover:brightness-95`;

  return (
    <section className={`${CARD} p-5 md:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-[#1B3A2D]">
            {row.displayName ?? 'Unnamed'}
          </p>
          <p className="truncate text-sm text-[#6B7A72]">{row.email ?? row.memberId}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            row.allowed ? 'bg-[#EFF6F1] text-[#1B3A2D]' : 'bg-red-50 text-red-700'
          }`}
        >
          {row.accessLabel}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-4">
        <Fact label="Tier" value={row.tier ? ACCESS_TIER_LABEL[row.tier] : 'No record yet'} />
        <Fact label="Granted by" value={sourceLabel(row.source)} />
        <Fact label="Status" value={row.status ?? 'no record'} />
        <Fact label="Full access" value={row.fullAccess ? 'Yes' : 'No'} />
        <Fact label="Trial started" value={formatDate(row.trialStartedAt)} />
        <Fact
          label="Trial ends"
          value={
            row.trialEndsAt
              ? `${formatDate(row.trialEndsAt)}${
                  row.trialDaysLeft !== null && row.trialDaysLeft > 0
                    ? ` (${row.trialDaysLeft} days left)`
                    : ''
                }`
              : 'not set'
          }
        />
        <Fact label="Last assigned" value={formatDate(row.assignedAt)} />
        <Fact label="Test account" value={row.isTest ? 'Yes' : 'No'} />
      </dl>

      {row.note && (
        <p className="mt-3 rounded-2xl bg-[#FAFAF8] px-4 py-2.5 text-sm text-[#4F645A]">
          Note: {row.note}
        </p>
      )}

      <div className="mt-4 border-t border-[#1B3A2D]/5 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#1B3A2D]">Suppress trial arc</p>
            <p className="mt-0.5 text-sm leading-relaxed text-[#6B7A72]">
              Stops all trial arc messages for this member. Does not change their access or trial
              dates.
            </p>
            <p className="mt-1 text-xs text-[#6B7A72]">
              {row.trialArcSuppressedAt
                ? `Suppressed since ${formatDate(row.trialArcSuppressedAt)}`
                : 'Not suppressed'}
            </p>
          </div>
          <button
            type="button"
            disabled={disabled}
            className={quiet}
            onClick={() =>
              onRun(row.memberId, () =>
                setTrialArcSuppressionAction(row.memberId, !row.trialArcSuppressedAt)
              )
            }
          >
            {row.trialArcSuppressedAt ? 'Allow trial arc' : 'Suppress trial arc'}
          </button>
        </div>
      </div>

      <div className="mt-4 border-t border-[#1B3A2D]/5 pt-4">
        <label
          className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]"
          htmlFor={`note-${row.memberId}`}
        >
          Note for the next change (optional)
        </label>
        <input
          id={`note-${row.memberId}`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Paid by Zelle, 12 Aug"
          className="mt-1.5 w-full rounded-2xl border border-[#1B3A2D]/10 bg-white p-2.5 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`tier-${row.memberId}`}>
          Tier for {row.displayName ?? row.email ?? row.memberId}
        </label>
        <select
          id={`tier-${row.memberId}`}
          value={tier}
          onChange={(event) => setTier(event.target.value as AccessTier)}
          className="rounded-full border border-[#1B3A2D]/10 bg-white px-3.5 py-2 text-xs text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
        >
          {ACCESS_TIERS.map((key) => (
            <option key={key} value={key}>
              {ACCESS_TIER_LABEL[key]}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={disabled}
          className={strong}
          onClick={() =>
            onRun(row.memberId, () =>
              setMemberAccessAction({
                memberId: row.memberId,
                tier,
                status: 'active',
                ...(note ? { note } : {}),
              })
            )
          }
        >
          {busy ? 'Working…' : 'Assign tier'}
        </button>

        <button
          type="button"
          disabled={disabled}
          className={quiet}
          onClick={() =>
            onRun(row.memberId, () =>
              setMemberAccessAction({
                memberId: row.memberId,
                fullAccess: !row.fullAccess,
                ...(note ? { note } : {}),
              })
            )
          }
        >
          {row.fullAccess ? 'Revoke full access' : 'Grant full access'}
        </button>

        <button
          type="button"
          disabled={disabled}
          className={quiet}
          onClick={() =>
            onRun(row.memberId, () =>
              setMemberAccessAction({
                memberId: row.memberId,
                tier: 'trial',
                status: 'active',
                extendTrialDays: 30,
                ...(note ? { note } : {}),
              })
            )
          }
        >
          Extend trial 30 days
        </button>

        <button
          type="button"
          disabled={disabled}
          className={quiet}
          onClick={() =>
            onRun(row.memberId, () =>
              setMemberAccessAction({
                memberId: row.memberId,
                tier: 'trial',
                status: 'active',
                extendTrialDays: 7,
                ...(note ? { note } : {}),
              })
            )
          }
        >
          Extend trial 7 days
        </button>

        <button
          type="button"
          disabled={disabled}
          className={`${buttonBase} border border-red-200 text-red-700 hover:bg-red-50`}
          onClick={() =>
            onRun(row.memberId, () =>
              expireMemberAccessAction(row.memberId, note ? note : undefined)
            )
          }
        >
          End access now
        </button>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-[#6B7A72]">{label}</dt>
      <dd className="mt-0.5 text-[#1B3A2D]">{value}</dd>
    </div>
  );
}
