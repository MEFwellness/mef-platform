'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { Settings2, X } from 'lucide-react';

const DISMISS_KEY = 'mef_primal_pattern_banner_dismissed';

/**
 * Setup nudge for members who haven't set a Primal Pattern target yet.
 * Only ever rendered when the server-side pattern lookup is null (see
 * app/food-lens/page.tsx), so it already disappears permanently once a
 * target exists — this component's own job is the session-scoped part:
 * closing it hides it for the rest of the browser session (sessionStorage,
 * not localStorage) without suppressing it forever.
 */
export function PrimalPatternSetupBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.sessionStorage.getItem(DISMISS_KEY)) return;
    setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div className="mt-3 flex items-center gap-2.5 rounded-[28px] bg-white p-4 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
      <Link
        href={'/food-lens/pattern' as Route}
        className="flex min-w-0 flex-1 items-center gap-2.5"
      >
        <Settings2 className="h-4 w-4 shrink-0 text-[#9AA79F]" strokeWidth={1.75} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#1B3A2D]">Set your Primal Pattern target</p>
          <p className="mt-0.5 text-xs text-[#6B7A72]">Needed for a personalized comparison</p>
        </div>
      </Link>
      <button
        type="button"
        onClick={() => {
          window.sessionStorage.setItem(DISMISS_KEY, '1');
          setVisible(false);
        }}
        aria-label="Dismiss"
        className="mef-press shrink-0 rounded-full p-1.5 text-[#9AA79F] hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D]"
      >
        <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
