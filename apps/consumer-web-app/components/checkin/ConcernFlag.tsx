'use client';

/**
 * Mid-day concern flagging — lets a member report a new or worsening
 * concern the moment it comes up, instead of waiting for the next
 * check-in. Writes through app/actions/events.ts's flagConcern(), which
 * both records a concern_flagged event in the standardized member event
 * stream and routes the text through the exact same evaluateConcern()
 * safety pipeline every other concern-reporting surface in this app uses.
 */

import { useState, useTransition } from 'react';
import { MessageCircleWarning, Check } from 'lucide-react';
import { flagConcern } from '@/app/actions/events';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export function ConcernFlag() {
  const [open, setOpen] = useState(false);
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
      setOpen(false);
      setJustSent(true);
      setTimeout(() => setJustSent(false), 2500);
    });
  }

  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-center gap-2 text-[#6B7A72]">
        <MessageCircleWarning className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Concern</p>
      </div>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-[#1B3A2D]/10 px-4 py-2.5 text-sm font-medium text-[#1B3A2D] transition hover:border-[#1B3A2D]/30"
        >
          {justSent ? (
            <>
              <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" /> Shared with your coach
            </>
          ) : (
            'Flag a new or worsening concern'
          )}
        </button>
      ) : (
        <div className="mt-3 space-y-3">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={3}
            autoFocus
            placeholder="What's new or worse today?"
            className="w-full rounded-2xl border border-[#1B3A2D]/10 p-3 text-sm text-[#1B3A2D] transition-colors duration-150 focus:border-[#F5B700] focus:outline-none"
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
              className="flex-1 rounded-2xl bg-[#1B3A2D] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {isPending ? 'Sending…' : 'Send'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError('');
              }}
              className="rounded-2xl border border-[#1B3A2D]/10 px-4 py-2.5 text-sm font-medium text-[#6B7A72] transition hover:border-[#1B3A2D]/30"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
