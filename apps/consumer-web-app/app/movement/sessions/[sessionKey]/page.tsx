/**
 * One ready-made session: its lineup, and the player that walks it.
 *
 * Everything the player needs is loaded here, server-side, in one pass:
 * the slots and the catalog fields for each of them. The player itself
 * fetches nothing except the video URL for the exercise the member
 * actually taps, which is the existing tap-to-play discipline and the
 * reason opening a session costs no Your Move quota at all.
 *
 * An unknown or retired session key renders notFound(), which is also
 * what happens before migration 153 is applied: the read fails closed,
 * getSessionDetail returns null, and the route 404s instead of throwing.
 */

import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { getSessionDetail } from '@/lib/movement-sessions/data';
import { MovementSessionPlayer } from '@/components/movement-sessions/MovementSessionPlayer';
import { getCachedUser } from '@/lib/supabase/currentUser';

export default async function MovementSessionPage({
  params,
}: {
  params: { sessionKey: string };
}) {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const [isCoach, detail] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    getSessionDetail(supabase, params.sessionKey),
  ]);

  if (!detail) notFound();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-3xl md:px-10 md:pb-16 md:pl-28">
        <MovementSessionPlayer detail={detail} />
      </main>

      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
