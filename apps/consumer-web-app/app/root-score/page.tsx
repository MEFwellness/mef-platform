/**
 * apps/consumer-web-app/app/root-score/page.tsx
 *
 * The Root Score detail experience — everything the dashboard card's tap
 * target opens into: current score, change over time, confidence/baseline
 * status, domain breakdown, strongest area, biggest opportunity,
 * contributing/limiting factors, one prioritized next action, historical
 * trend, a plain-language explanation of how the score works, Momentum
 * and Resilience, and the required safety statement. Reads only from
 * lib/scoring/service.ts (via app/actions/scoring.ts) — never calculates
 * anything itself.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldCheck,
  Gauge,
  Activity,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { resolveLocalDate } from '@/app/actions/checkin';
import { getMyRootScore, getMyRootScoreHistory } from '@/app/actions/scoring';
import { hasActiveRole } from '@/lib/auth/guards';
import { TodaysFocusLine } from '@/components/focus/TodaysFocusLine';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { BackButton } from '@/components/BackButton';
import { CenterStage, WhenNotEmpty } from '@/components/layout';
import { scoreLabel } from '@/lib/wellness/wellness-index';
import { STATUS_STYLES } from '@/lib/wellness/status';
import { RootScoreDomainRow } from '@/components/RootScoreDomainRow';
import { AnimatedRootScoreTrendChart } from '@/components/AnimatedRootScoreTrendChart';
import { DOMAIN_ORDER } from '@/lib/scoring/config';
import { SAFETY_STATEMENT } from '@/lib/scoring/copy';
import type { MomentumState, ResilienceState } from '@mef/shared-types-contracts';

/**
 * Screen Layout System (Prompt 2): the "Building your Root Score" state is
 * this page's one genuinely sparse render — a single card, previously
 * hugging the top of the viewport. Offset covers `pt-safe-header` (2rem) +
 * `pb-safe-nav` (7rem) + the BackButton/label rows above it (~3.5rem),
 * same reasoning as the identical constant in app/root-map/page.tsx and
 * app/case/page.tsx (all three share this exact header/footer shape).
 */
const EMPTY_STATE_CHROME_OFFSET_PX = 200;

/**
 * Trust cleanup, 2026-08-17: the score line no longer prints a confidence
 * label. It read "High confidence" directly above a domain breakdown where
 * all five domains read "Building", because the roll-up's history term
 * counts calculations (a daily cron) rather than the member's own evidence.
 * The calculation is untouched and still stored; only the on-screen claim
 * is gone. The baseline state is the one thing still worth saying, and it
 * claims nothing about how sure we are.
 */
const BASELINE_NOTE = 'Still building your baseline';

const MOMENTUM_LABEL: Record<MomentumState, string> = {
  improving: 'Improving',
  declining: 'Declining',
  stable: 'Steady',
  insufficient_data: 'Building',
};

const RESILIENCE_LABEL: Record<ResilienceState, string> = {
  building_baseline: 'Building your resilience baseline',
  stable: 'Stable',
  recovering: 'Recovering',
  strained: 'Strained',
};

function ChangeBadge({ change }: { change: number | null }) {
  if (change === null) return null;
  const status = change > 0 ? 'good' : change < 0 ? 'poor' : 'attention';
  const Icon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${STATUS_STYLES[status].bg} ${STATUS_STYLES[status].text}`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      {change === 0
        ? 'Steady since last calculation'
        : `${Math.abs(change)} pt${Math.abs(change) === 1 ? '' : 's'} ${change > 0 ? 'up' : 'down'} since last calculation`}
    </span>
  );
}

export default async function RootScorePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, isCoach] = await Promise.all([
    supabase.from('profiles').select('timezone').eq('id', user.id).single(),
    hasActiveRole(supabase, user.id, 'coach'),
  ]);

  const timezone = profile?.timezone ?? 'America/New_York';
  const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  const localDate = await resolveLocalDate(nowInTz, false);

  const [snapshot, history] = await Promise.all([
    getMyRootScore(localDate, timezone),
    getMyRootScoreHistory(90),
  ]);

  const isBuilding = !snapshot || snapshot.root_score === null;
  const orderedDomains = snapshot
    ? [...snapshot.domain_scores].sort(
        (a, b) => DOMAIN_ORDER.indexOf(a.domain) - DOMAIN_ORDER.indexOf(b.domain)
      )
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back to Dashboard" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Root Score</p>
        </div>

        {isBuilding ? (
          <CenterStage chromeOffsetPx={EMPTY_STATE_CHROME_OFFSET_PX}>
            <section className="mef-card mef-animate-in p-7">
              <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
                Building your Root Score
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
                {snapshot?.explanation_summary ||
                  "Root Score combines your check-ins, Food Lens activity, movement, and assessments into one longer-term wellness picture. It's not ready to show yet. A few more real data points will get it there."}
              </p>
              <div className="mt-5 space-y-2">
                <Link
                  href="/checkin"
                  className="mef-press block rounded-2xl bg-[#F3F6F4] px-4 py-3 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#EFF6F1]"
                >
                  Complete today&apos;s check-in
                </Link>
                <Link
                  href="/food-lens"
                  className="mef-press block rounded-2xl bg-[#F3F6F4] px-4 py-3 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#EFF6F1]"
                >
                  Log a meal in Food Lens
                </Link>
                <Link
                  href="/movement"
                  className="mef-press block rounded-2xl bg-[#F3F6F4] px-4 py-3 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#EFF6F1]"
                >
                  Complete a movement session
                </Link>
              </div>
            </section>
          </CenterStage>
        ) : (
          <>
            {/* Hero */}
            <section className="mef-card mef-animate-in mt-3 p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-baseline gap-3">
                  <span className="font-[family-name:var(--font-cormorant-garamond)] text-6xl leading-none text-[#1B3A2D]">
                    {snapshot!.root_score}
                  </span>
                  <span className="text-lg text-[#6B7A72]">/ 100</span>
                </div>
                <ChangeBadge change={snapshot!.root_score_change} />
              </div>
              <p className="mt-2 text-sm font-medium text-[#6B7A72]">
                {scoreLabel(snapshot!.root_score!)}
                {snapshot!.root_confidence_level === 'building' ? ` · ${BASELINE_NOTE}` : ''}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[#1B3A2D]">
                {snapshot!.explanation_summary}
              </p>

              {/* ONE FOCUS (Member Interpretation Layer, 2026-08-17). This
                  box used to render `snapshot.next_action`, which is a fixed
                  sentence per Root Score domain ("Complete today's movement
                  session, even a short one."), chosen by the scoring engine.
                  On 2026-08-17 it said that while Home's brief said Stress,
                  Today said Daily Reset, and the noticing carousel said
                  Consistency. It reads the Priority Card engine now, like
                  every other surface that names a focus, so it can only ever
                  say what Home says. */}
              <TodaysFocusLine className="mt-5" />
            </section>

            {/* Trend */}
            <section className="mef-card mt-5 p-6">
              <div className="flex items-center gap-2 text-[#6B7A72]">
                <TrendingUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Root Score Trend</p>
              </div>
              <AnimatedRootScoreTrendChart snapshots={history} todayLocalDate={localDate} />
            </section>

            {/* Momentum + Resilience */}
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <section className="mef-card p-6">
                <div className="flex items-center gap-2 text-[#6B7A72]">
                  <Activity className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <p className="text-sm font-semibold uppercase tracking-wider">Momentum</p>
                </div>
                {snapshot!.momentum_score !== null ? (
                  <>
                    <p className="mt-3 text-3xl font-semibold text-[#1B3A2D]">
                      {snapshot!.momentum_score}
                      <span className="ml-2 text-base font-normal text-[#6B7A72]">
                        {MOMENTUM_LABEL[snapshot!.momentum_state]}
                      </span>
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
                      Your last 7 days compared with the 7 before that.
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
                    Keep checking in. Momentum needs at least two weeks of recent activity to show
                    a direction.
                  </p>
                )}
              </section>

              <section className="mef-card p-6">
                <div className="flex items-center gap-2 text-[#6B7A72]">
                  <Gauge className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <p className="text-sm font-semibold uppercase tracking-wider">Resilience</p>
                </div>
                {snapshot!.resilience_score !== null ? (
                  <>
                    <p className="mt-3 text-3xl font-semibold text-[#1B3A2D]">
                      {snapshot!.resilience_score}
                      <span className="ml-2 text-base font-normal text-[#6B7A72]">
                        {RESILIENCE_LABEL[snapshot!.resilience_state]}
                      </span>
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
                      How consistently you&apos;ve returned to baseline after a disrupted stretch.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-lg font-semibold text-[#1B3A2D]">
                      {RESILIENCE_LABEL['building_baseline']}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
                      MEF Wellness needs more history to understand how you recover after a
                      disrupted period. Keep checking in. There&apos;s nothing else to do here.
                    </p>
                  </>
                )}
              </section>
            </div>

            {/* Domain breakdown. Honesty guard: heading and rows together or not at all. */}
            <WhenNotEmpty items={orderedDomains}>
              {(domains) => (
                <section className="mef-card mt-5 p-6">
                  <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
                    Domain Breakdown
                  </p>
                  <div className="mt-1 divide-y divide-[#1B3A2D]/8">
                    {domains.map((domain) => (
                      <RootScoreDomainRow key={domain.domain} domain={domain} />
                    ))}
                  </div>
                </section>
              )}
            </WhenNotEmpty>

            {/* Factors */}
            {(snapshot!.positive_factors.length > 0 || snapshot!.limiting_factors.length > 0) && (
              <section className="mef-card mt-5 p-6">
                <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
                  What&apos;s Shaping Your Score
                </p>
                <div className="mt-4 space-y-4">
                  {snapshot!.positive_factors.map((factor) => (
                    <div key={`positive-${factor.domain}`} className="flex items-start gap-3">
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-600"
                        aria-hidden="true"
                      />
                      <p className="text-sm leading-relaxed text-[#1B3A2D]">
                        <span className="font-semibold">{factor.label}:</span> {factor.detail}
                      </p>
                    </div>
                  ))}
                  {snapshot!.limiting_factors.map((factor) => (
                    <div key={`limiting-${factor.domain}`} className="flex items-start gap-3">
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                        aria-hidden="true"
                      />
                      <p className="text-sm leading-relaxed text-[#1B3A2D]">
                        <span className="font-semibold">{factor.label}:</span> {factor.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* How it works */}
            <section className="mef-card mt-5 p-6">
              <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
                How Root Score Works
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
                Root Score blends up to five areas (recovery, stress, nutrition, movement, and
                consistency) using a rolling 30-day window, so no single day, meal, or workout can
                move it very far. A domain only counts when there&apos;s real data behind it, so
                missing data narrows what the score is built from rather than lowering the score
                itself. Momentum looks at your most
                recent 7 days against the 7 before that. Resilience only shows a real number once
                MEF Wellness has seen enough of your history to understand how you recover after a
                disrupted stretch.
              </p>
            </section>

            {/* Safety statement */}
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
