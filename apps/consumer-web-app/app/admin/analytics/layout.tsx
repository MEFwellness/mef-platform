/**
 * The admin analytics section shell.
 *
 * The access check runs here, before any child route renders, and again
 * inside each page, and again inside every server action each page calls,
 * and again inside every database function those actions reach. A signed
 * out visitor, a member and a coach are each turned away at the first of
 * those four and could not get past any of the other three.
 *
 * Nothing in this subtree touches member-facing code. It renders the same
 * bottom navigation the rest of the admin area does and nothing else.
 */

import { requireAnalyticsAdmin } from './guard';
import { BottomNav } from '@/components/BottomNav';

export const dynamic = 'force-dynamic';

export default async function AdminAnalyticsLayout({ children }: { children: React.ReactNode }) {
  const { isCoach } = await requireAnalyticsAdmin();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F5F0E4] to-[#FAF8F1] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-6xl md:px-10 md:pb-20 md:pl-28">
        {children}
      </main>
      <BottomNav isCoach={isCoach} />
    </div>
  );
}
