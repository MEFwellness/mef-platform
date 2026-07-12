import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TrendingUp, Flame } from 'lucide-react';
import { getRecentCheckins } from '@/app/actions/checkin';
import { BottomNav } from '@/components/BottomNav';
import type { DailyCheckin } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function calculateStreak(checkinsOldestFirst: DailyCheckin[]): number {
  if (checkinsOldestFirst.length === 0) return 0;

  let streak = 1;
  for (let i = checkinsOldestFirst.length - 1; i > 0; i--) {
    const current = new Date(checkinsOldestFirst[i]!.local_date);
    const previous = new Date(checkinsOldestFirst[i - 1]!.local_date);
    const dayDiff = Math.round((current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24));
    if (dayDiff === 1) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

function formatDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

export default async function ProgressPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const recentCheckins = await getRecentCheckins(30);
  const streak = calculateStreak(recentCheckins);
  const history = [...recentCheckins].reverse(); // most recent first for the list

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Progress
        </h1>
        <p className="mt-2 text-[15px] text-[#6B7A72]">Your check-in history and trends over time.</p>

        <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-3">
          <section className={`${CARD} p-6`}>
            <div className="flex items-center gap-2 text-[#854D0E]">
              <Flame className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Current streak</p>
            </div>
            {streak > 0 ? (
              <p className="mt-3 text-3xl font-semibold text-[#1B3A2D]">
                {streak} <span className="text-base font-normal text-[#6B7A72]">day{streak === 1 ? '' : 's'}</span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-[#6B7A72]">Check in today to start a streak.</p>
            )}
          </section>

          <section className={`${CARD} p-6`}>
            <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">Check-ins logged</p>
            <p className="mt-3 text-3xl font-semibold text-[#1B3A2D]">{recentCheckins.length}</p>
            <p className="mt-1 text-sm text-[#6B7A72]">In the last 30 recorded days</p>
          </section>

          <section className={`${CARD} p-6`}>
            <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">Average energy</p>
            {recentCheckins.length > 0 ? (
              <p className="mt-3 text-3xl font-semibold text-[#1B3A2D]">
                {(
                  recentCheckins.reduce((sum, c) => sum + (c.energy_level ?? 0), 0) / recentCheckins.length
                ).toFixed(1)}
                <span className="text-base font-normal text-[#6B7A72]"> / 5</span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-[#6B7A72]">Not enough data yet</p>
            )}
          </section>
        </div>

        <section className={`${CARD} mt-5 p-6`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#854D0E]">
              <TrendingUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Energy trend</p>
            </div>
            <span className="text-xs text-[#6B7A72]">
              {recentCheckins.length > 0 ? `Last ${recentCheckins.length} check-ins` : ''}
            </span>
          </div>
          {recentCheckins.length > 0 ? (
            <div className="mt-4 flex h-40 items-end gap-1 rounded-2xl bg-[#F3F6F4] p-4">
              {recentCheckins.map((c) => (
                <div
                  key={c.id}
                  className="flex-1 rounded-t-full bg-[#1B3A2D]/15"
                  style={{ height: `${Math.max(4, ((c.energy_level ?? 0) / 5) * 100)}%` }}
                  title={`${c.local_date}: energy ${c.energy_level ?? '—'}/5`}
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 flex h-40 items-center justify-center rounded-2xl bg-[#F3F6F4] p-4">
              <p className="text-sm text-[#6B7A72]">Trends will show up here after a few check-ins.</p>
            </div>
          )}
        </section>

        <section className={`${CARD} mt-5 p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">History</p>
          {history.length > 0 ? (
            <div className="mt-3 divide-y divide-[#1B3A2D]/5">
              {history.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <span className="w-28 shrink-0 font-medium text-[#1B3A2D]">{formatDate(c.local_date)}</span>
                  <span className="flex-1 text-[#6B7A72]">
                    Mood {c.mood_level ?? '—'} · Energy {c.energy_level ?? '—'} · Stress {c.stress_level ?? '—'}
                    {c.sleep_duration ? ` · Sleep ${c.sleep_duration}` : ''}
                  </span>
                  {c.checkin_version > 1 && (
                    <span className="shrink-0 rounded-full bg-[#EFF6F1] px-2 py-0.5 text-xs text-[#1B3A2D]">
                      edited
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#6B7A72]">No check-ins logged yet.</p>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
