/**
 * apps/consumer-web-app/app/root-map/page.tsx
 *
 * The Member Root Map (Prompt 10) — the plain-language, per-domain view of
 * what Rooted Reset currently understands (Method §2, §4 stage 2; Root
 * Model and Router §16 closing recommendation 6). Reads only from
 * app/actions/rootMap.ts (lib/root-map/) — never calculates anything
 * itself, same discipline as app/root-score/page.tsx.
 *
 * Redesigned 2026-07-28: a twelve-segment ring map at the top
 * (components/root-map/RootMapRing.tsx), three real-state groups instead
 * of twelve identical flat cards (lib/root-map/grouping.ts), and a named
 * "What We're Noticing Overall" recommendation (lib/root-map/topArea.ts)
 * instead of an unnamed "a specific area." Purely a presentation change —
 * the underlying builder (lib/root-map/builder.ts), the coach view
 * (RootMapPanel.tsx), and RootMapDomainCard.tsx (still used by the coach
 * view) are untouched.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { Compass, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getMyRootMap } from '@/app/actions/rootMap';
import { hasActiveRole } from '@/lib/auth/guards';
import { TodaysFocusLine } from '@/components/focus/TodaysFocusLine';
import { BottomNav } from '@/components/BottomNav';
import { BackButton } from '@/components/BackButton';
import { CenterStage, CardStack } from '@/components/layout';
import { groupRootMapDomains, resolveNamedAreaRecommendation } from '@/lib/root-map';
import { RootMapRing } from '@/components/root-map/RootMapRing';
import { RootMapFindingCard } from '@/components/root-map/RootMapFindingCard';
import { RootMapBuildingRow } from '@/components/root-map/RootMapBuildingRow';
import { RootMapNotCoveredSection } from '@/components/root-map/RootMapNotCoveredSection';

const SAFETY_STATEMENT =
  'Your Root Map is a wellness coaching guide built from your own check-ins, activity, and assessments. It is not a medical diagnosis, a clinical measurement, or a prediction about your health. Working hypotheses only, held loosely, and always something to confirm or correct with your coach.';

/**
 * Screen Layout System (Prompt 2): the "Building your Root Map" state is
 * this page's one genuinely sparse render — a single card, previously
 * hugging the top of the viewport. Same reasoning/value as the identical
 * constant in app/root-score/page.tsx and app/case/page.tsx.
 */
const EMPTY_STATE_CHROME_OFFSET_PX = 200;

const NOTHING_STANDS_OUT_YET =
  "Nothing specific has stood out yet. Keep checking in and we'll name it here as soon as it does.";

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

  const groups = rootMap ? groupRootMapDomains(rootMap.domains) : null;
  const namedArea = rootMap ? resolveNamedAreaRecommendation(rootMap.routerOutcome, rootMap.domains) : null;
  const showGenericRecommendation =
    rootMap?.routerOutcome.outcome !== 'focused_investigation' && !!rootMap?.routerOutcome.investigation;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back to Dashboard" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Compass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Your Root Map</p>
        </div>

        {!rootMap || !groups ? (
          <CenterStage chromeOffsetPx={EMPTY_STATE_CHROME_OFFSET_PX}>
            <section className="mef-card mef-animate-in p-7">
              <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
                Building your Root Map
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
                Rooted Reset is still gathering information about you. Complete a check-in or an
                assessment and this page will start filling in.
              </p>
            </section>
          </CenterStage>
        ) : (
          <>
            {/* ONE FOCUS (Member Interpretation Layer, 2026-08-17). The Root
                Map used to imply a focus of its own by naming its top domain
                ("Stress & Nervous System Regulation looks like a specific
                area worth exploring further"), which on 2026-08-17 was one of
                five different answers across six screens. The map still names
                the area worth exploring, because that is a real and different
                thing, and the member's actual one thing today is stated here
                from the single engine that authors it. */}
            <TodaysFocusLine className="mt-3" />

            <section className="mef-card mef-animate-in mt-3 p-7">
              <RootMapRing
                domains={rootMap.domains.map((d) => ({
                  domain: d.domain,
                  label: d.label,
                  whatWeUnderstand: d.whatWeUnderstand,
                  isUninstrumented: d.isUninstrumented,
                }))}
                coverageByDomain={rootMap.coverageByDomain}
              />
              <p className="mt-3 text-center text-xs text-[#6B7A72]">
                Tap a segment or a name in the key to jump to that dimension.
              </p>
            </section>

            <section className="mef-card mef-animate-in mt-5 p-7">
              <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
                What We&apos;re Noticing Overall
              </h1>
              {namedArea ? (
                <>
                  <p className="mt-3 text-sm leading-relaxed text-[#1B3A2D]">
                    {namedArea.areaLabel} looks like a specific area worth exploring further.
                  </p>
                  <Link
                    href={namedArea.investigation.route as Route}
                    className="mef-press mt-4 inline-block rounded-2xl bg-[#F3F6F4] px-4 py-3 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#EFF6F1]"
                  >
                    {namedArea.investigation.displayName}
                  </Link>
                </>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-[#1B3A2D]">
                  {rootMap.routerOutcome.outcome === 'focused_investigation'
                    ? NOTHING_STANDS_OUT_YET
                    : rootMap.routerOutcome.memberMessage}
                </p>
              )}
              {showGenericRecommendation && rootMap.routerOutcome.investigation && (
                <Link
                  href={rootMap.routerOutcome.investigation.route as Route}
                  className="mef-press mt-4 inline-block rounded-2xl bg-[#F3F6F4] px-4 py-3 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#EFF6F1]"
                >
                  {rootMap.routerOutcome.investigation.displayName}
                </Link>
              )}
            </section>

            <div className="mt-6">
              <p className="px-1 text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                What We&apos;re Seeing
              </p>
              <div className="mt-3">
                {groups.seeing.length > 0 ? (
                  <CardStack>
                    {groups.seeing.map((domain) => (
                      <RootMapFindingCard
                        key={domain.domain}
                        domain={domain}
                        coverage={rootMap.coverageByDomain[domain.domain] ?? null}
                      />
                    ))}
                  </CardStack>
                ) : (
                  <p className="px-1 text-sm leading-relaxed text-[#6B7A72]">
                    Nothing has risen to a clear pattern yet. As you check in and complete
                    assessments, real findings will start appearing here.
                  </p>
                )}
              </div>
            </div>

            {groups.building.length > 0 && (
              <div className="mt-6">
                <p className="px-1 text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                  Building
                </p>
                <div className="mt-3 space-y-2">
                  {groups.building.map((domain) => (
                    <RootMapBuildingRow
                      key={domain.domain}
                      domain={domain}
                      coverage={rootMap.coverageByDomain[domain.domain] ?? null}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6">
              <RootMapNotCoveredSection domains={groups.notCovered} />
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
