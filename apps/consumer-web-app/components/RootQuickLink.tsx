'use client';

/**
 * Replaces the old inline pills that navigated to the full /conversation
 * page (a second, duplicate Root entry point — see root-launcher-bus.ts).
 * Same pill styling as before; a button that asks the page's floating
 * launcher to open in place instead of an <a> that changes the route.
 */

import type { ConversationEntryPoint } from '@mef/shared-types-contracts';
import { requestOpenRoot } from '@/lib/root-launcher-bus';

const PILL_CLASS =
  'rounded-full border border-[#1B3A2D]/10 bg-[#FAFAF8] px-4 py-2 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#1B3A2D]/[0.06]';

export function RootQuickLink({
  entryPoint,
  entryContext,
  className = PILL_CLASS,
  children,
}: {
  entryPoint: ConversationEntryPoint;
  entryContext: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => requestOpenRoot({ entryPoint, entryContext })}
      className={className}
    >
      {children}
    </button>
  );
}
