import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { listAssignedClients, getClientCheckins } from '@/app/actions/coach';
import { BottomNav } from '@/components/BottomNav';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function formatDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default async function CoachPage({ searchParams }: { searchParams: { client?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const clients = await listAssignedClients();
  const selectedClientId = searchParams?.client ?? clients[0]?.id;
  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;
  const checkins = selectedClientId ? await getClientCheckins(selectedClientId) : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Your clients
        </h1>
        <p className="mt-2 text-[15px] text-[#6B7A72]">
          {clients.length > 0
            ? `${clients.length} client${clients.length === 1 ? '' : 's'} currently assigned to you.`
            : 'No clients are currently assigned to you.'}
        </p>

        {clients.length > 0 && (
          <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-[280px_1fr]">
            <section className={`${CARD} h-fit p-4`}>
              <div className="space-y-1">
                {clients.map((client) => {
                  const active = client.id === selectedClientId;
                  return (
                    <Link
                      key={client.id}
                      href={{ pathname: '/coach', query: { client: client.id } }}
                      className={`block rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]'
                          : 'text-[#6B7A72] hover:bg-[#1B3A2D]/[0.03] hover:text-[#1B3A2D]'
                      }`}
                    >
                      {client.display_name ?? 'Unnamed client'}
                    </Link>
                  );
                })}
              </div>
            </section>

            <section className={`${CARD} p-6`}>
              <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
                {selectedClient?.display_name ?? 'Client'} — recent check-ins
              </p>

              {checkins.length > 0 ? (
                <div className="mt-4 divide-y divide-[#1B3A2D]/5">
                  {checkins.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                    >
                      <span className="w-28 shrink-0 font-medium text-[#1B3A2D]">
                        {formatDate(c.local_date)}
                      </span>
                      <span className="flex-1 text-[#6B7A72]">
                        Mood {c.mood_level ?? '—'} · Energy {c.energy_level ?? '—'} · Stress{' '}
                        {c.stress_level ?? '—'} · Pain {c.pain_discomfort_level ?? '—'}
                      </span>
                      {c.new_or_worsening_concern && (
                        <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                          Flagged concern
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-[#6B7A72]">
                  No check-ins logged by this client yet.
                </p>
              )}
            </section>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
