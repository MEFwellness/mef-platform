'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, RefreshCw } from 'lucide-react';
import type { DailyFeedItem, MefContentItem } from '@mef/shared-types-contracts';
import { coachReplaceFeedItemAction } from '@/app/actions/feed';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function formatDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

type FeedHistoryEntry = { feedItem: DailyFeedItem; content: MefContentItem | null };

export function FeedPanel({
  history,
  contentLibrary,
}: {
  history: FeedHistoryEntry[];
  contentLibrary: MefContentItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [newContentItemId, setNewContentItemId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const latest = history[0] ?? null;
  const rest = history.slice(1);

  function handleReplace(feedItemId: string) {
    if (!newContentItemId) return;
    setError(null);
    startTransition(async () => {
      const result = await coachReplaceFeedItemAction(feedItemId, newContentItemId, note);
      if (result.error) {
        setError(result.error);
        return;
      }
      setReplacingId(null);
      setNewContentItemId('');
      setNote('');
      router.refresh();
    });
  }

  function renderEntry(entry: FeedHistoryEntry) {
    const { feedItem, content } = entry;
    const isReplacing = replacingId === feedItem.id;
    return (
      <li key={feedItem.id} className="py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs text-[#6B7A72]">{formatDate(feedItem.local_date)}</p>
            <p className="text-sm font-medium text-[#1B3A2D]">
              {content?.title ?? 'Lesson unavailable'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6B7A72]">
              {feedItem.completed_at
                ? 'Completed'
                : feedItem.dismissed_at
                  ? 'Dismissed'
                  : 'Not completed'}
              {feedItem.reflection_submitted_at ? ' · Reflected' : ''}
            </span>
            <button
              type="button"
              onClick={() => setReplacingId(isReplacing ? null : feedItem.id)}
              title="Replace this lesson"
              className="rounded-full p-1.5 text-[#1B3A2D]/60 hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D]"
            >
              <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>

        {isReplacing && (
          <div className="mt-2 space-y-2 rounded-2xl bg-[#FAFAF8] p-3">
            <select
              value={newContentItemId}
              onChange={(e) => setNewContentItemId(e.target.value)}
              className="w-full rounded-2xl border border-[#1B3A2D]/10 bg-white p-2.5 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
            >
              <option value="">Choose a replacement lesson…</option>
              {contentLibrary.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note about why…"
              className="w-full rounded-2xl border border-[#1B3A2D]/10 bg-white p-2.5 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
            />
            <div className="flex justify-end">
              <button
                type="button"
                disabled={isPending || !newContentItemId}
                onClick={() => handleReplace(feedItem.id)}
                className="rounded-full bg-[#1B3A2D] px-4 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-40"
              >
                Replace
              </button>
            </div>
          </div>
        )}
      </li>
    );
  }

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Daily Coaching Feed</p>
      </div>

      {!latest ? (
        <p className="mt-3 text-sm text-[#6B7A72]">No coaching feed items yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-[#1B3A2D]/5">{renderEntry(latest)}</ul>
      )}

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {rest.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-[#6B7A72]">
            {rest.length} earlier lesson{rest.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 divide-y divide-[#1B3A2D]/5 opacity-80">{rest.map(renderEntry)}</ul>
        </details>
      )}
    </section>
  );
}
