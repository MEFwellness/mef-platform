/**
 * Driver State Engine — the daily scheduled recompute. Reads
 * member_correlation_findings (written by the correlation engine's own
 * 14:00 UTC cron), so this is staggered to 14:30 UTC, after that run
 * completes. Same service-role client, member-listing query, and
 * per-member Promise.allSettled isolation as
 * app/api/cron/correlation-engine/route.ts.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { runDriverStateEngineForMember } from '@/lib/driver-state-engine/service';

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
    console.error('driver-state-engine cron: failed to list active members', error);
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
    console.error('driver-state-engine cron: Supabase misconfigured —', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Supabase misconfigured' },
      { status: 500 }
    );
  }

  const today = todayLocalDate();
  const members = await listActiveMembers(supabase);

  const results = await Promise.allSettled(
    members.map((member) => runDriverStateEngineForMember(supabase, member.id, today))
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const driversEvaluated = results.reduce(
    (sum, r) => sum + (r.status === 'fulfilled' ? r.value.driversEvaluated : 0),
    0
  );
  const failures = results
    .map((r, i) =>
      r.status === 'rejected' ? { memberId: members[i]!.id, reason: String(r.reason) } : null
    )
    .filter((f): f is { memberId: string; reason: string } => f !== null);

  if (failures.length > 0) {
    console.error('driver-state-engine cron: some members failed', failures);
  }

  return NextResponse.json({
    membersProcessed: members.length,
    succeeded,
    failed: members.length - succeeded,
    driversEvaluated,
  });
}
