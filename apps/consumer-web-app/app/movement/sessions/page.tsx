/**
 * Root Movement, Level 1 — the six ready-made sessions.
 *
 * No assessment behind it, no coach approval in front of it, no
 * personalization: every member sees the same six, in the same order, and
 * picks one. That is the whole screen.
 *
 * Reached from the Movement screen's nav-link card stack, and now the only
 * entry in it: the Exercise Library and Movement Profile cards that used
 * to sit alongside this one were removed from the member app when both
 * became internal coaching tools (lib/auth/staffRouting.ts).
 *
 * The sessions themselves are rows (migration 153), so this page has no
 * knowledge of what is in any of them. If the templates table is not
 * there yet, listSessionSummaries returns an empty list and this renders
 * a plain, honest empty state rather than an error.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { Activity, ChevronRight, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { BackButton } from '@/components/BackButton';
import { CardStack } from '@/components/layout';
import { listSessionSummaries } from '@/lib/movement-sessions/data';
import { formatTargetDuration } from '@/lib/movement-sessions/duration';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export default async function MovementSessionsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [isCoach, sessions] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    listSessionSummaries(supabase),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-3xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/movement" label="Movement" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Activity className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Root Movement</p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Sessions
          </h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">
            Six sessions, ready when you are. Pick the one that fits the day you are having.
          </p>
        </div>

        {sessions.length === 0 ? (
          <div className={`${CARD} mt-7 p-6`}>
            <p className="text-sm leading-relaxed text-[#6B7A72]">
              No sessions are available yet. They will appear here once they are published.
            </p>
          </div>
        ) : (
          <CardStack className="mt-7">
            {sessions.map(({ template, exerciseCount }) => (
              <Link
                key={template.session_key}
                href={`/movement/sessions/${template.session_key}` as Route}
                className={`${CARD} mef-card-lift flex items-center gap-4 p-5 transition hover:shadow-[0_4px_28px_-4px_rgba(27,58,45,0.18)]`}
              >
                <span className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#1B3A2D]">{template.name}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[#6B7A72]">
                    {template.description}
                  </p>
                  <span className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#6B7A72]">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      {formatTargetDuration(
                        template.target_duration_min_minutes,
                        template.target_duration_max_minutes
                      )}
                    </span>
                    {exerciseCount > 0 && <span>{exerciseCount} exercises</span>}
                  </span>
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-[#1B3A2D]/30"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </Link>
            ))}
          </CardStack>
        )}

        <p className="mt-6 text-[13px] leading-relaxed text-[#6B7A72]">
          Do any of them as often as you like. Nothing here is counting.
        </p>
      </main>

      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
