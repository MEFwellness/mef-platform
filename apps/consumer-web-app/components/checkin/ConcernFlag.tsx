'use client';

/**
 * Mid-day concern flagging — lets a member report a new or worsening
 * concern the moment it comes up, instead of waiting for the next
 * check-in. Writes through app/actions/events.ts's flagConcern(), which
 * both records a concern_flagged event in the standardized member event
 * stream and routes the text through the exact same evaluateConcern()
 * safety pipeline every other concern-reporting surface in this app uses.
 *
 * Home dashboard redesign: this used to be its own always-visible white
 * card with an internal open/closed toggle button. It's now one of the
 * four Quick Actions carousel tiles (components/dashboard/
 * QuickActionsCarousel.tsx), which owns the open/closed state and renders
 * this as a plain reveal panel underneath the carousel instead — same
 * copy, same submit behavior, different trigger location.
 */

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { flagConcern } from '@/app/actions/events';

export function ConcernFlag({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [text, setText] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [justSent, setJustSent] = useState(false);

  function handleSubmit() {
    setError('');
    startTransition(async () => {
      const result = await flagConcern(text);
      if (result.error) {
        setError(result.error);
        return;
      }
      setText('');
      onOpenChange(false);
      setJustSent(true);
      setTimeout(() => setJustSent(false), 2500);
    });
  }

  if (!open) {
    if (!justSent) return null;
    return (
      <p className="mef-animate-in flex items-center gap-2 text-sm font-medium text-[#1B3A2D]">
        <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" /> Shared with your coach
      </p>
    );
  }

  return (
    <div className="mef-animate-in space-y-3 rounded-2xl border border-[#1B3A2D]/10 bg-white p-4">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        autoFocus
        placeholder="What's new or worse today?"
        className="w-full rounded-2xl border border-[#1B3A2D]/10 p-3 text-base text-[#1B3A2D] transition-colors duration-150 focus:border-[#F5B700] focus:outline-none"
      />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || !text.trim()}
          className="mef-press flex-1 rounded-2xl bg-[#1B3A2D] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {isPending ? 'Sending…' : 'Send'}
        </button>
        <button
          type="button"
          onClick={() => {
            onOpenChange(false);
            setError('');
          }}
          className="mef-press rounded-2xl border border-[#1B3A2D]/10 px-4 py-2.5 text-sm font-medium text-[#6B7A72] transition hover:border-[#1B3A2D]/30"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
