'use client';

/**
 * "Bring your coach into this" — extracted from
 * app/conversation/ConversationView.tsx so the floating coach panel
 * (part 5's "coach handoff option when appropriate") reuses the exact
 * same request flow instead of a second, smaller one. Fully self-contained
 * (owns its own pending/sent state and calls requestCoachHandoffAction
 * directly) so a caller only ever needs `<HandoffForm sessionId={...} />`.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LifeBuoy } from 'lucide-react';
import type { ConversationHandoffUrgency } from '@mef/shared-types-contracts';
import { requestCoachHandoffAction } from '@/app/actions/conversation-coach';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export function HandoffForm({
  sessionId,
  compact = false,
}: {
  sessionId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showHandoff, setShowHandoff] = useState(false);
  const [handoffNote, setHandoffNote] = useState('');
  const [handoffUrgency, setHandoffUrgency] = useState<ConversationHandoffUrgency>('medium');
  const [handoffSent, setHandoffSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await requestCoachHandoffAction(sessionId, handoffNote, handoffUrgency);
      if (result.error) {
        setError(result.error);
        return;
      }
      setHandoffSent(true);
      setShowHandoff(false);
      setHandoffNote('');
      router.refresh();
    });
  }

  if (handoffSent) {
    return (
      <p className="text-sm text-[#6B7A72]">
        Your coach has been notified — we won&apos;t promise an exact response time, but
        they&apos;ll follow up as soon as they&apos;re able to.
      </p>
    );
  }

  if (!showHandoff) {
    return (
      <button
        type="button"
        onClick={() => setShowHandoff(true)}
        className="flex items-center gap-2 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]"
      >
        <LifeBuoy className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        {compact
          ? 'Ask your coach to follow up'
          : 'Ask your assigned coach to follow up on this conversation'}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`${CARD} space-y-3 ${compact ? 'p-4' : 'p-5'}`}>
      <p className="text-sm font-medium text-[#1B3A2D]">Bring your coach into this</p>
      <textarea
        value={handoffNote}
        onChange={(e) => setHandoffNote(e.target.value)}
        rows={2}
        placeholder="What would you like them to know? (optional)"
        className="w-full resize-none rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <label className="text-xs text-[#6B7A72]" htmlFor="handoff-urgency">
          Urgency
        </label>
        <select
          id="handoff-urgency"
          value={handoffUrgency}
          onChange={(e) => setHandoffUrgency(e.target.value as ConversationHandoffUrgency)}
          className="rounded-full border border-[#1B3A2D]/10 bg-[#FAFAF8] px-3 py-1.5 text-base text-[#1B3A2D]"
        >
          <option value="low">Low — whenever they can</option>
          <option value="medium">Medium — this week</option>
          <option value="high">High — as soon as possible</option>
        </select>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setShowHandoff(false)}
          className="rounded-full px-4 py-1.5 text-sm font-medium text-[#6B7A72]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-[#1B3A2D] px-5 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-40"
        >
          Send to my coach
        </button>
      </div>
    </form>
  );
}
