/**
 * apps/consumer-web-app/app/root-map/page.tsx
 *
 * The Member Root Map (Prompt 10) — the plain-language, per-domain view of
 * what Rooted Reset currently understands (Method §2, §4 stage 2; Root
 * Model and Router §16 closing recommendation 6). Reads only from
 * app/actions/rootMap.ts (lib/root-map/) — never calculates anything
 * itself, same discipline as app/root-score/page.tsx.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { ChevronLeft, Compass, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getMyRootMap } from '@/app/actions/rootMap';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { RootMapDomainCard } from '@/components/RootMapDomainCard';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const SAFETY_STATEMENT =
  'Your Root Map is a wellness coaching guide built from your own check-ins, activity, and assessments — it is not a medical diagnosis, a clinical measurement, or a prediction about your health. Working hypotheses only, held loosely, and always something to confirm or correct with your coach.';

export default async function RootMapPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [rootMap, isCoach] = await Promise.all([
    getMyRootMap(),
    hasActiveRole(supabase, user.id, 'coach'),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to Dashboard
        </Link>

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Compass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Your Root Map</p>
        </div>

        {!rootMap ? (
          <section className={`${CARD} mef-animate-in mt-3 p-7`}>
            <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
              Building your Root Map
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
              Rooted Reset is still gathering information about you — complete a check-in or an
              assessment and this page will start filling in.
            </p>
          </section>
        ) : (
          <>
            <section className={`${CARD} mef-animate-in mt-3 p-7`}>
              <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
                What We&apos;re Noticing Overall
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-[#1B3A2D]">
                {rootMap.routerOutcome.memberMessage}
              </p>
              {rootMap.routerOutcome.investigation && (
                <Link
                  href={rootMap.routerOutcome.investigation.route as Route}
                  className="mt-4 inline-block rounded-2xl bg-[#F3F6F4] px-4 py-3 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#EFF6F1]"
                >
                  {rootMap.routerOutcome.investigation.displayName}
                </Link>
              )}
            </section>

            <div className="mt-5 space-y-5">
              {rootMap.domains.map((domain) => (
                <RootMapDomainCard key={domain.domain} domain={domain} />
              ))}
            </div>

            <section className="mt-5 flex items-start gap-3 px-1">
              <ShieldCheck
                className="mt-0.5 h-4 w-4 shrink-0 text-[#6B7A72]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-[#6B7A72]">{SAFETY_STATEMENT}</p>
            </section>
          </>
        )}
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
