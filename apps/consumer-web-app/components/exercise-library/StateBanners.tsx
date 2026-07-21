/**
 * Shared loading/empty/error presentation for the Exercise Library — one
 * copy of the "handle loading, no results, API unavailable, rate limits,
 * network errors gracefully" requirement, used by both the browse page and
 * the detail page rather than duplicated per page.
 */

import type { ReactNode } from 'react';

export type ExerciseApiErrorShape = {
  code: string;
  message: string;
  retryAfterSeconds: number | null;
};

export function StateBanner({
  tone,
  children,
}: {
  tone: 'loading' | 'empty';
  children: ReactNode;
}) {
  const styles =
    tone === 'loading'
      ? 'border-[#1B3A2D]/15 bg-white text-[#6B7A72]'
      : 'border-dashed border-[#1B3A2D]/15 bg-transparent text-[#6B7A72]';
  return (
    <div className={`mt-3 rounded-2xl border px-4 py-6 text-center text-sm ${styles}`}>
      {children}
    </div>
  );
}

const ERROR_COPY: Record<string, { title: string; tone: string }> = {
  NOT_CONFIGURED: {
    title: 'The Exercise Library is temporarily unavailable',
    tone: 'bg-[#EFF6F1] border-[#1B3A2D]/15 text-[#6B7A72]',
  },
  UNAUTHENTICATED: {
    title: 'Please sign in again',
    tone: 'bg-[#EFF6F1] border-[#1B3A2D]/15 text-[#6B7A72]',
  },
  INVALID_API_KEY: {
    title: 'The Exercise Library is temporarily unavailable',
    tone: 'bg-[#EFF6F1] border-[#1B3A2D]/15 text-[#6B7A72]',
  },
  RATE_LIMIT_EXCEEDED: {
    title: 'Search is briefly at capacity — try again shortly',
    tone: 'bg-amber-50 border-amber-200 text-amber-800',
  },
  OVERAGE_CAP_EXCEEDED: {
    title: 'Search is briefly at capacity — try again shortly',
    tone: 'bg-amber-50 border-amber-200 text-amber-800',
  },
  PAGINATION_DEPTH_EXCEEDED: {
    title: 'Try narrowing your search',
    tone: 'bg-amber-50 border-amber-200 text-amber-800',
  },
  NOT_FOUND: {
    title: 'Exercise not found',
    tone: 'bg-[#EFF6F1] border-[#1B3A2D]/15 text-[#6B7A72]',
  },
  SEARCH_TIMEOUT: {
    title: 'That search timed out — try narrowing your filters',
    tone: 'bg-amber-50 border-amber-200 text-amber-800',
  },
  NETWORK_ERROR: {
    title: 'Network error — check your connection and try again',
    tone: 'bg-red-50 border-red-200 text-red-800',
  },
};

export function ErrorBanner({ error }: { error: ExerciseApiErrorShape }) {
  const copy = ERROR_COPY[error.code] ?? {
    title: 'Something went wrong loading exercises',
    tone: 'bg-red-50 border-red-200 text-red-800',
  };
  return (
    <div className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${copy.tone}`}>
      <p className="font-semibold">{copy.title}</p>
      {error.retryAfterSeconds !== null && (
        <p className="mt-0.5 text-xs opacity-80">Retry in about {error.retryAfterSeconds}s.</p>
      )}
    </div>
  );
}
