'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled app error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] px-5 font-[family-name:var(--font-dm-sans)]">
      <div className="w-full max-w-sm rounded-[28px] bg-white p-7 text-center shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
        <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm text-[#6B7A72]">
          That wasn&apos;t supposed to happen. You can try again, or head back to your dashboard.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={reset}
            className="flex w-full items-center justify-center rounded-full bg-[#F5B700] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="flex w-full items-center justify-center rounded-full border border-[#1B3A2D]/10 px-6 py-3 text-sm font-medium text-[#1B3A2D] transition hover:border-[#1B3A2D]/30"
          >
            Back to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
