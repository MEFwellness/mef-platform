'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pin, PinOff, Lock, Unlock, Archive, Pencil } from 'lucide-react';
import type { NarrativeItem, NarrativeCategory } from '@mef/shared-types-contracts';
import {
  pinNarrativeItemAction,
  protectNarrativeItemAction,
  markNarrativeItemOutdatedAction,
  correctNarrativeItemAction,
  addCoachNarrativeItemAction,
} from '@/app/actions/narrative';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const CATEGORY_LABEL: Record<NarrativeCategory, string> = {
  current_goals: 'Current goals',
  primary_priorities: 'Primary priorities',
  four_doctors_balance: 'Four Doctors balance',
  recurring_patterns: 'Recurring pattern',
  recent_changes: 'Recent change',
  life_events: 'Life event',
  barriers_to_adherence: 'Barrier to adherence',
  successful_interventions: 'Successful intervention',
  unsuccessful_interventions: 'Unsuccessful intervention',
  coaching_preferences: 'Coaching preference',
  learning_preferences: 'Learning preference',
  motivation_patterns: 'Motivation pattern',
  member_reported_context: 'Member-reported context',
  coach_verified_observations: 'Coach-verified observation',
  unresolved_concerns: 'Unresolved concern',
  active_restrictions: 'Active restriction',
  recent_wins: 'Recent win',
  progress_trends: 'Progress trend',
};

const PROVENANCE_LABEL: Record<string, string> = {
  member_reported: 'Member-reported',
  coach_entered: 'Coach-entered',
  system_observed: 'System-observed',
  inferred: 'Inferred',
  confirmed_recurring: 'Confirmed recurring',
};

function NarrativeItemRow({ item, clientId }: { item: NarrativeItem; clientId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [summary, setSummary] = useState(item.summary);
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-xs font-medium text-[#1B3A2D]">
            {CATEGORY_LABEL[item.category]}
          </span>
          <span className="rounded-full bg-[#FAFAF8] px-2.5 py-1 text-xs text-[#6B7A72]">
            {PROVENANCE_LABEL[item.provenance] ?? item.provenance}
          </span>
          {!item.member_visible && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
              Coach-only
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => pinNarrativeItemAction(item.id, !item.is_pinned))}
            title={item.is_pinned ? 'Unpin' : 'Pin as important'}
            className="rounded-full p-1.5 text-[#1B3A2D]/60 hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D]"
          >
            {item.is_pinned ? (
              <Pin className="h-4 w-4 fill-current" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <PinOff className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => protectNarrativeItemAction(item.id, !item.coach_protected))}
            title={
              item.coach_protected
                ? 'Unprotect (allow automated updates)'
                : 'Protect from automated replacement'
            }
            className="rounded-full p-1.5 text-[#1B3A2D]/60 hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D]"
          >
            {item.coach_protected ? (
              <Lock className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Unlock className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setEditing((v) => !v)}
            title="Correct this item"
            className="rounded-full p-1.5 text-[#1B3A2D]/60 hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D]"
          >
            <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => markNarrativeItemOutdatedAction(item.id))}
            title="Mark outdated"
            className="rounded-full p-1.5 text-[#1B3A2D]/60 hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D]"
          >
            <Archive className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-full px-4 py-1.5 text-sm font-medium text-[#6B7A72]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(() => correctNarrativeItemAction(clientId, item.id, { title, summary }))
              }
              className="rounded-full bg-[#1B3A2D] px-4 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-40"
            >
              Save correction
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1.5 text-sm font-medium text-[#1B3A2D]">{item.title}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-[#1B3A2D]/80">{item.summary}</p>
        </>
      )}
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </li>
  );
}

const CATEGORY_OPTIONS: NarrativeCategory[] = Object.keys(CATEGORY_LABEL) as NarrativeCategory[];

export function NarrativePanel({ clientId, items }: { clientId: string; items: NarrativeItem[] }) {
  const router = useRouter();
  const [category, setCategory] = useState<NarrativeCategory>('coach_verified_observations');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [memberVisible, setMemberVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const active = items.filter((i) => i.status === 'active');
  const historical = items.filter((i) => i.status !== 'active');

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addCoachNarrativeItemAction(clientId, {
        category,
        title,
        summary,
        memberVisible,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setTitle('');
      setSummary('');
      router.refresh();
    });
  }

  return (
    <section className={`${CARD} p-6`}>
      <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
        Member Narrative
      </p>
      <p className="mt-1 text-xs text-[#6B7A72]">
        A structured, evolving understanding of this member — not a raw activity log.
      </p>

      {active.length === 0 ? (
        <p className="mt-3 text-sm text-[#6B7A72]">No active narrative items yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
          {active.map((item) => (
            <NarrativeItemRow key={item.id} item={item} clientId={clientId} />
          ))}
        </ul>
      )}

      {historical.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-[#6B7A72]">
            {historical.length} historical item{historical.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 divide-y divide-[#1B3A2D]/5 opacity-70">
            {historical.map((item) => (
              <NarrativeItemRow key={item.id} item={item} clientId={clientId} />
            ))}
          </ul>
        </details>
      )}

      <form onSubmit={handleAdd} className="mt-5 space-y-2 border-t border-[#1B3A2D]/5 pt-4">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as NarrativeCategory)}
          className="w-full rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
        >
          {CATEGORY_OPTIONS.map((key) => (
            <option key={key} value={key}>
              {CATEGORY_LABEL[key]}
            </option>
          ))}
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short title…"
          className="w-full rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
        />
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="What should be remembered…"
          rows={2}
          className="w-full resize-none rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
        />
        <label className="flex items-center gap-2 text-xs text-[#6B7A72]">
          <input
            type="checkbox"
            checked={memberVisible}
            onChange={(e) => setMemberVisible(e.target.checked)}
          />
          Visible to member
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending || !title.trim() || !summary.trim()}
            className="rounded-full bg-[#1B3A2D] px-5 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? 'Saving…' : 'Add to narrative'}
          </button>
        </div>
      </form>
    </section>
  );
}
