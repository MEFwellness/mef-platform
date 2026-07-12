'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { NotebookPen } from 'lucide-react';
import { addCoachNote } from '@/app/actions/coach';
import type { CoachNote } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function formatTimestamp(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

type Props = {
  clientId: string;
  initialNotes: CoachNote[];
  coachName: string;
};

export function CoachNotesPanel({ clientId, initialNotes, coachName }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await addCoachNote(clientId, draft);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDraft('');
      router.refresh();
    });
  }

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <NotebookPen className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Coach Notes</p>
      </div>
      <p className="mt-1 text-xs text-[#6B7A72]">
        Private to your coaching team — notes are not visible to this client.
      </p>

      <form onSubmit={handleSubmit} className="mt-4">
        <label htmlFor="coach-note" className="sr-only">
          Add a private note
        </label>
        <textarea
          id="coach-note"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a private note about this client's progress…"
          rows={3}
          className="w-full resize-none rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-4 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
        />
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <div className="mt-2 flex justify-end">
          <button
            type="submit"
            disabled={isPending || !draft.trim()}
            className="rounded-full bg-[#1B3A2D] px-5 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? 'Saving…' : 'Save note'}
          </button>
        </div>
      </form>

      <div className="mt-2 divide-y divide-[#1B3A2D]/5">
        {initialNotes.length === 0 ? (
          <p className="py-4 text-sm text-[#6B7A72]">No notes yet.</p>
        ) : (
          initialNotes.map((note) => (
            <div key={note.id} className="py-4">
              <div className="flex items-center justify-between gap-2 text-xs text-[#6B7A72]">
                <span className="font-medium text-[#1B3A2D]">{coachName}</span>
                <span>{formatTimestamp(note.created_at)}</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-[#1B3A2D]/85">{note.note}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
