/**
 * apps/consumer-web-app/app/root-map/page.tsx
 *
 * The Member Root Map (Prompt 10) — the plain-language, per-domain view of
 * what Rooted Reset currently understands (Method §2, §4 stage 2; Root
 * Model and Router §16 closing recommendation 6). Reads only from
 * app/actions/rootMap.ts (lib/root-map/) — never calculates anything
 * itself, same discipline as app/root-score/page.tsx.
 *
 * FIRST SCREENFUL (2026-09-05). The arrival greeting's own call to action
 * is "See my Root Map", and what it landed on was 4853px of page at a
 * 390x844 phone: the one-thing line, the ring, its colour key, twelve
 * names, and only then, 1105px down and two screens below the fold, the
 * single line saying what had actually been noticed. Measured on
 * production before anything was changed.
 *
 * What that line and the map itself say is untouched. What changed is the
 * order and the fold: the map, its colour key and one counted line of
 * orientation come first; the one thing and the named area follow, both
 * inside the first screenful; and the twelve entries, with the numbered
 * key that names them, are present in full inside one "See all 12 areas"
 * reveal. Nothing is deleted and nothing is summarised. A tap on a ring
 * segment still lands on its own entry: it opens the reveal on the way
 * (components/root-map/scrollToDomain.ts).
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
import { ChevronDown, Compass, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getMyRootMap } from '@/app/actions/rootMap';
import { hasActiveRole } from '@/lib/auth/guards';
import { TodaysFocusLine } from '@/components/focus/TodaysFocusLine';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { BackButton } from '@/components/BackButton';
import { CenterStage, CardStack } from '@/components/layout';
import {
  groupRootMapDomains,
  resolveNamedAreaRecommendation,
  buildRootMapOrientationLine,
  ROOT_MAP_ALL_AREAS_LABEL,
  ROOT_MAP_TAP_HINT,
} from '@/lib/root-map';
import { ALL_AREAS_SECTION_ID } from '@/lib/root-map/anchors';
import { RootMapRing } from '@/components/root-map/RootMapRing';
import { RootMapAreaKey } from '@/components/root-map/RootMapAreaKey';
import { noticedDomainCount } from '@/components/root-map/ringDomains';
import { RootMapFindingCard } from '@/components/root-map/RootMapFindingCard';
import { RootMapBuildingRow } from '@/components/root-map/RootMapBuildingRow';
import { RootMapNotCoveredSection } from '@/components/root-map/RootMapNotCoveredSection';
import { getCachedUser } from '@/lib/supabase/currentUser';

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
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const [rootMap, isCoach] = await Promise.all([
    getMyRootMap(),
    hasActiveRole(supabase, user.id, 'coach'),
  ]);

  const groups = rootMap ? groupRootMapDomains(rootMap.domains) : null;
  // Only what the ring and its key need to draw themselves. Built once
  // here so the ring, the counted orientation line and the numbered key
  // are all reading the identical twelve objects rather than three
  // separate projections of the same rows.
  const ringDomains = (rootMap?.domains ?? []).map((d) => ({
    domain: d.domain,
    label: d.label,
    whatWeUnderstand: d.whatWeUnderstand,
    isUninstrumented: d.isUninstrumented,
  }));
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
            {/* THE MAP, FIRST. The ring, its colour key and one counted
                line, so a member arriving from "See my Root Map" is looking
                at the map and at where something was noticed rather than at
                a list of twelve names. The ring is drawn a little smaller
                than it was, which is the only visual change to it: what it
                encodes, segment for segment, is identical. */}
            <section className="mef-card mef-animate-in mt-3 p-7">
              <RootMapRing domains={ringDomains} coverageByDomain={rootMap.coverageByDomain} size={208} />
              <p className="mt-3 text-center text-[13px] leading-relaxed text-[#1B3A2D]">
                {buildRootMapOrientationLine(noticedDomainCount(ringDomains), ringDomains.length)}
              </p>
              <p className="mt-2 text-center text-xs text-[#6B7A72]">{ROOT_MAP_TAP_HINT}</p>
            </section>

            {/* ONE FOCUS (Member Interpretation Layer, 2026-08-17). The Root
                Map used to imply a focus of its own by naming its top domain
                ("Stress & Nervous System Regulation looks like a specific
                area worth exploring further"), which on 2026-08-17 was one of
                five different answers across six screens. The map still names
                the area worth exploring, because that is a real and different
                thing, and the member's actual one thing today is stated here
                from the single engine that authors it. */}
            <TodaysFocusLine className="mt-4" />

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

            {/* THE TWELVE, PRESENT IN FULL AND FOLDED. A native <details>,
                the same one the quiz result screen's own sections use: it
                opens with no JavaScript, it is keyboard reachable and
                screen reader announced with no aria attributes of ours, and
                every word is in the page for anybody reading it with
                assistive technology or printing it. Nothing here is hidden
                from anyone. It is folded. */}
            <details
              id={ALL_AREAS_SECTION_ID}
              className="group mt-6 overflow-hidden rounded-2xl border border-[#1B3A2D]/10 bg-white/60"
            >
              <summary className="mef-focus-ring flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold text-[#1B3A2D] [&::-webkit-details-marker]:hidden">
                {ROOT_MAP_ALL_AREAS_LABEL}
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-[#6B7A72] transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="px-5 pb-5">
                {/* The numbered key, which is what ties a ring segment's
                    number to its name. It opens with the entries it names. */}
                <RootMapAreaKey domains={ringDomains} />

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
              </div>
            </details>

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

      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
