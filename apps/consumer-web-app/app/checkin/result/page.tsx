/**
 * Forecast & Calibration Loop — the ending screen (Part 4). Its own
 * screen after the morning check-in submits, same slot every day, not a
 * panel bolted onto the form: app/checkin/CheckinForm.tsx redirects here
 * instead of straight to /dashboard. What it shows grows with her
 * history (lib/energy-forecast/service.ts's buildEndingScreenView), but
 * the screen itself is always this one route.
 */
import type { Route } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getTodaysCheckin } from '@/app/actions/checkin';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { AvatarLink } from '@/components/AvatarLink';
import { buildEndingScreenView } from '@/lib/energy-forecast/service';
import { ForecastCalibrationChart } from '@/components/checkin/ForecastCalibrationChart';
import type { RootStatusView } from '@/lib/energy-forecast/types';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] p-7';

function RootStatusCard({ status }: { status: RootStatusView }) {
  return (
    <div className={CARD}>
      <p className="font-[family-name:var(--font-cormorant-garamond)] text-xl leading-tight text-[#1B3A2D]">
        Root&apos;s forecast
      </p>
      <p className="mt-3 text-sm leading-relaxed text-[#1B3A2D]">
        {status.kind === 'scored' ? status.forecast.sentence : status.sentence}
      </p>
    </div>
  );
}

export default async function CheckinResultPage({
  searchParams,
}: {
  searchParams: { date?: string; firstCheckin?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const localDate = searchParams?.date;
  if (!localDate) redirect('/checkin' as Route);

  const [{ data: profile }, isCoach, todaysCheckin] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
    hasActiveRole(supabase, user.id, 'coach'),
    getTodaysCheckin(localDate),
  ]);

  // This screen only exists to react to a just-submitted check-in — if
  // there isn't one (or it's missing the one field this whole loop is
  // built around), there is nothing to grade. Send her back rather than
  // showing a broken or misleading screen.
  if (!todaysCheckin || todaysCheckin.energy_level == null) redirect('/checkin' as Route);

  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';
  const view = await buildEndingScreenView(supabase, user.id, localDate, todaysCheckin);
  const continueHref = (searchParams?.firstCheckin === '1' ? '/dashboard?firstCheckin=1' : '/dashboard') as Route;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Today&apos;s forecast
          </h1>
          <AvatarLink firstName={firstName} />
        </div>

        <div className="mt-6 space-y-6">
          {view.kind === 'no_forecast' ? (
            <>
              <div className={`${CARD} mef-animate-in`}>
                <p className="font-[family-name:var(--font-cormorant-garamond)] text-xl leading-tight text-[#1B3A2D]">
                  This morning, for the record
                </p>
                <ul className="mt-4 space-y-2 text-sm text-[#1B3A2D]">
                  {view.readback.moodLabel && (
                    <li className="flex justify-between border-b border-[#1B3A2D]/[0.06] pb-2">
                      <span className="text-[#6B7A72]">Mood</span>
                      <span className="font-medium">{view.readback.moodLabel}</span>
                    </li>
                  )}
                  {view.readback.energyLabel && (
                    <li className="flex justify-between border-b border-[#1B3A2D]/[0.06] pb-2">
                      <span className="text-[#6B7A72]">Energy</span>
                      <span className="font-medium">{view.readback.energyLabel}</span>
                    </li>
                  )}
                  {view.readback.stressLabel && (
                    <li className="flex justify-between border-b border-[#1B3A2D]/[0.06] pb-2">
                      <span className="text-[#6B7A72]">Stress</span>
                      <span className="font-medium">{view.readback.stressLabel}</span>
                    </li>
                  )}
                  {view.readback.sleepQualityLabel && (
                    <li className="flex justify-between border-b border-[#1B3A2D]/[0.06] pb-2">
                      <span className="text-[#6B7A72]">Sleep quality</span>
                      <span className="font-medium">{view.readback.sleepQualityLabel}</span>
                    </li>
                  )}
                  {view.readback.painLabel && (
                    <li className="flex justify-between pb-1">
                      <span className="text-[#6B7A72]">Pain</span>
                      <span className="font-medium">{view.readback.painLabel}</span>
                    </li>
                  )}
                </ul>
              </div>

              <div className={`${CARD} mef-animate-in`} style={{ animationDelay: '60ms' }}>
                <p className="text-sm leading-relaxed text-[#1B3A2D]">{view.timeline.sentence}</p>
              </div>

              <div className="mef-animate-in" style={{ animationDelay: '120ms' }}>
                <RootStatusCard status={view.rootStatus} />
              </div>
            </>
          ) : (
            <>
              <div className={`${CARD} mef-animate-in`}>
                <p className="font-[family-name:var(--font-cormorant-garamond)] text-xl leading-tight text-[#1B3A2D]">
                  Your forecast, graded
                </p>
                <p className="mt-3 text-sm leading-relaxed text-[#1B3A2D]">{view.her.sentence}</p>
              </div>

              <div className="mef-animate-in" style={{ animationDelay: '60ms' }}>
                <RootStatusCard status={view.rootStatus} />
              </div>

              {view.handoffToCase && (
                <Link
                  href={'/case' as Route}
                  className={`${CARD} mef-animate-in block transition-shadow duration-300 hover:shadow-[0_6px_32px_-6px_rgba(27,58,45,0.14)]`}
                  style={{ animationDelay: '120ms' }}
                >
                  <p className="text-sm font-semibold text-[#1B3A2D]">Your patterns are showing up now</p>
                  <p className="mt-1 text-sm text-[#6B7A72]">See the full picture in your case →</p>
                </Link>
              )}

              {view.calibration && (
                <div className={`${CARD} mef-animate-in`} style={{ animationDelay: view.handoffToCase ? '180ms' : '120ms' }}>
                  <p className="font-[family-name:var(--font-cormorant-garamond)] text-xl leading-tight text-[#1B3A2D]">
                    Calibration over time
                  </p>
                  <p className="mt-1 text-[13px] leading-snug text-[#6B7A72]">
                    Within a point counts as a hit: the scale only has five steps, so exact and one-off are both a real
                    read; anything further off is a miss.
                  </p>
                  <div className="mt-3 flex gap-8">
                    <div>
                      <p className="text-2xl font-semibold text-[#1B3A2D]">{view.calibration.herAccuracyPct}%</p>
                      <p className="text-[13px] text-[#6B7A72]">You, within a point</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-[#B08900]">{view.calibration.rootAccuracyPct}%</p>
                      <p className="text-[13px] text-[#6B7A72]">Root, within a point</p>
                    </div>
                  </div>
                  <ForecastCalibrationChart series={view.calibration.series} />
                </div>
              )}
            </>
          )}
        </div>

        <Link
          href={continueHref}
          className="mt-8 flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition-all duration-200 ease-out hover:brightness-110 active:scale-[0.99]"
        >
          Continue
        </Link>
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
