/**
 * Forecast & Calibration Loop — the daily scheduled grading backfill.
 *
 * Grading (lib/energy-forecast/service.ts's scoreForecastOnce /
 * scoreRootForecastOnce) is otherwise purely view-triggered — it only
 * fires as a side effect of buildEndingScreenView, which only runs when a
 * member actually loads /checkin/result. A member who predicted but never
 * revisited that exact page for a given date would stay ungraded forever
 * without this. This cron closes that gap and also backfills any
 * forecasts that were already stored before this cron existed — same
 * service-role client, member-listing query, and per-member
 * Promise.allSettled isolation as every other cron in this directory.
 * Staggered to 15:00 UTC, after driver-state-engine (14:30 UTC), though
 * it doesn't actually depend on that run's output.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { backfillOutstandingForecastsForMember } from '@/lib/energy-forecast/service';

export const dynamic = 'force-dynamic';

function serviceRoleClient() {
  const { url } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing. Set it in your hosting provider's " +
        'project environment variables, then redeploy.'
    );
  }
  return createClient(url, serviceRoleKey);
}

function todayLocalDate(): string {
  return new Date().toISOString().slice(0, 10);
}

type MemberRow = { id: string };

async function listActiveMembers(
  supabase: ReturnType<typeof serviceRoleClient>
): Promise<MemberRow[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'member')
    .is('revoked_at', null);

  if (error) {
    console.error('forecast-grading cron: failed to list active members', error);
    return [];
  }
  return Array.from(new Set((data ?? []).map((row) => row.user_id as string))).map((id) => ({ id }));
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let supabase;
  try {
    supabase = serviceRoleClient();
  } catch (err) {
    console.error('forecast-grading cron: Supabase misconfigured —', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Supabase misconfigured' },
      { status: 500 }
    );
  }

  const today = todayLocalDate();
  const members = await listActiveMembers(supabase);

  const results = await Promise.allSettled(
    members.map((member) => backfillOutstandingForecastsForMember(supabase, member.id, today))
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const herScored = results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value.herScored : 0), 0);
  const rootScored = results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value.rootScored : 0), 0);
  const failures = results
    .map((r, i) => (r.status === 'rejected' ? { memberId: members[i]!.id, reason: String(r.reason) } : null))
    .filter((f): f is { memberId: string; reason: string } => f !== null);

  if (failures.length > 0) {
    console.error('forecast-grading cron: some members failed', failures);
  }

  return NextResponse.json({
    membersProcessed: members.length,
    succeeded,
    failed: members.length - succeeded,
    herScored,
    rootScored,
  });
}
