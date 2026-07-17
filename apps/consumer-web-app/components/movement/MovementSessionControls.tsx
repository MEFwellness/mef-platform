'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { MovementSessionStatus } from '@mef/shared-types-contracts';
import {
  completeMovementSession,
  skipMovementSession,
  startMovementSession,
} from '@/app/actions/movement';

export function MovementSessionControls({
  sessionId,
  status,
}: {
  sessionId: string;
  status: MovementSessionStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  function run(action: () => Promise<{ error?: string }>) {
    setError('');
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (status === 'completed') {
    return <p className="text-sm font-medium text-green-700">Session completed — nice work.</p>;
  }

  if (status === 'skipped') {
    return <p className="text-sm text-[#6B7A72]">This session was skipped.</p>;
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-3">
        {status === 'ready' && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => startMovementSession(sessionId))}
            className="inline-flex items-center justify-center rounded-full bg-[#1B3A2D] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-6px_rgba(27,58,45,0.35)] transition hover:brightness-110 disabled:opacity-60"
          >
            Start Session
          </button>
        )}
        {status === 'in_progress' && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => completeMovementSession(sessionId))}
            className="inline-flex items-center justify-center rounded-full bg-[#1B3A2D] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-6px_rgba(27,58,45,0.35)] transition hover:brightness-110 disabled:opacity-60"
          >
            Mark Session Complete
          </button>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => skipMovementSession(sessionId, 'Skipped by member'))}
          className="inline-flex items-center justify-center rounded-full border border-[#1B3A2D]/15 px-7 py-3.5 text-sm font-semibold text-[#6B7A72] transition hover:border-[#1B3A2D]/25 hover:text-[#1B3A2D] disabled:opacity-60"
        >
          Skip Today
        </button>
      </div>
    </div>
  );
}
