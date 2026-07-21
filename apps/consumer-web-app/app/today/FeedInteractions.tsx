'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Bookmark,
  X,
  ThumbsUp,
  ThumbsDown,
  MessageCircleQuestion,
} from 'lucide-react';
import type { DailyFeedItem } from '@mef/shared-types-contracts';
import { completionCelebration } from '@/lib/feed/encouragement';
import {
  markTodaysFeedOpened,
  completeFeedActionForMember,
  saveFeedItemForMember,
  dismissFeedItemForMember,
  submitFeedReflectionForMember,
  rateFeedHelpfulnessForMember,
} from '@/app/actions/feed';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export function FeedInteractions({
  feedItem,
  reflectionPrompt,
}: {
  feedItem: DailyFeedItem;
  reflectionPrompt: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reflection, setReflection] = useState(feedItem.reflection_response ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fires once per mount (a page view), not on every re-render — feedItem.id is stable for the day.
    void markTodaysFeedOpened(feedItem.id);
  }, [feedItem.id]);

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending || Boolean(feedItem.completed_at)}
          onClick={() => run(() => completeFeedActionForMember(feedItem.id))}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition duration-150 active:scale-95 disabled:cursor-not-allowed ${
            feedItem.completed_at
              ? 'mef-pop-in bg-green-50 text-green-700'
              : 'bg-[#1B3A2D] text-white hover:brightness-110'
          }`}
        >
          <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {feedItem.completed_at ? 'Completed' : "Mark today's action complete"}
        </button>
        <button
          type="button"
          disabled={isPending || Boolean(feedItem.saved_at)}
          onClick={() => run(() => saveFeedItemForMember(feedItem.id))}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition duration-150 active:scale-95 disabled:cursor-not-allowed ${
            feedItem.saved_at
              ? 'mef-pop-in bg-amber-50 text-amber-700'
              : 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D] hover:bg-[#1B3A2D]/[0.12]'
          }`}
        >
          <Bookmark className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {feedItem.saved_at ? 'Saved' : 'Save for later'}
        </button>
        {!feedItem.dismissed_at && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => dismissFeedItemForMember(feedItem.id))}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#1B3A2D]/[0.06] px-4 py-2 text-sm font-medium text-[#1B3A2D] transition duration-150 active:scale-95 hover:bg-[#1B3A2D]/[0.12] disabled:cursor-not-allowed"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Not today
          </button>
        )}
      </div>

      {feedItem.completed_at && (
        <p className="mef-pop-in flex items-center gap-1.5 px-1 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {completionCelebration(feedItem.id)}
        </p>
      )}

      <section className={`${CARD} p-6`}>
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <MessageCircleQuestion className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Today&apos;s Reflection</p>
        </div>
        {feedItem.reflection_submitted_at ? (
          <div className="mef-pop-in mt-3 rounded-2xl bg-[#FAFAF8] p-4">
            <p className="text-sm leading-relaxed text-[#1B3A2D]/80">
              {feedItem.reflection_response}
            </p>
          </div>
        ) : (
          <>
            <p className="mt-2 text-base leading-relaxed text-[#1B3A2D]">{reflectionPrompt}</p>
            <textarea
              value={reflection}
              onChange={(event) => setReflection(event.target.value)}
              placeholder="A few words is plenty…"
              rows={2}
              className="mt-3 w-full resize-none rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-4 text-base text-[#1B3A2D] transition focus:border-[#F5B700] focus:outline-none"
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                disabled={isPending || !reflection.trim()}
                onClick={() => run(() => submitFeedReflectionForMember(feedItem.id, reflection))}
                className="rounded-full bg-[#1B3A2D] px-5 py-2 text-sm font-medium text-white transition duration-150 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Save reflection
              </button>
            </div>
          </>
        )}
      </section>

      {feedItem.helpful === null && (
        <div className="flex items-center gap-2 text-sm text-[#6B7A72]">
          <span>Was this helpful?</span>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => rateFeedHelpfulnessForMember(feedItem.id, true))}
            className="rounded-full p-1.5 hover:bg-[#1B3A2D]/[0.06]"
            aria-label="Helpful"
          >
            <ThumbsUp className="h-4 w-4 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => rateFeedHelpfulnessForMember(feedItem.id, false))}
            className="rounded-full p-1.5 hover:bg-[#1B3A2D]/[0.06]"
            aria-label="Not helpful"
          >
            <ThumbsDown className="h-4 w-4 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
