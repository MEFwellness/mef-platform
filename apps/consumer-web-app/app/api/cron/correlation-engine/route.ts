/**
 * Correlation Engine — the daily scheduled recompute.
 *
 * lib/correlation-engine/service.ts's runCorrelationEngineForMember() does
 * real work (fetching each member's check-in/wearable history and running
 * Spearman correlation over it) and is deliberately never called from a
 * page load — "recompute on a schedule rather than on every page load"
 * (requirement 8). This route is that schedule, staggered an hour after
 * the other two crons (wearable-daily at 12:00 UTC, daily-coaching-scan
 * at 13:00 UTC) so it always runs against that day's already-synced
 * wearable data.
 *
 * Same service-role client, member-listing query, and per-member
 * Promise.allSettled isolation as app/api/cron/daily-coaching-scan/route.ts
 * — one member's failure (e.g. malformed history) never aborts the run
 * for everyone else.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { runCorrelationEngineForMember } from '@/lib/correlation-engine/service';

export const dynamic = 'force-dynamic';

function serviceRoleClient() {
  const { url } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing — set it in your hosting provider's " +
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
    console.error('correlation-engine cron: failed to list active members', error);
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
    console.error('correlation-engine cron: Supabase misconfigured —', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Supabase misconfigured' },
      { status: 500 }
    );
  }

  const today = todayLocalDate();
  const members = await listActiveMembers(supabase);

  const results = await Promise.allSettled(
    members.map((member) => runCorrelationEngineForMember(supabase, member.id, today))
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const pairsEvaluated = results.reduce(
    (sum, r) => sum + (r.status === 'fulfilled' ? r.value.pairsEvaluated : 0),
    0
  );
  const failures = results
    .map((r, i) =>
      r.status === 'rejected' ? { memberId: members[i]!.id, reason: String(r.reason) } : null
    )
    .filter((f): f is { memberId: string; reason: string } => f !== null);

  if (failures.length > 0) {
    console.error('correlation-engine cron: some members failed', failures);
  }

  return NextResponse.json({
    membersProcessed: members.length,
    succeeded,
    failed: members.length - succeeded,
    pairsEvaluated,
  });
}
