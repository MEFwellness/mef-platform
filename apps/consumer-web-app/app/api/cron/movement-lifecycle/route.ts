/**
 * Movement lifecycle — the daily scheduled pass that starts, advances and
 * completes assigned programs (migration 172). The sixth cron job,
 * scheduled at 15:30 UTC so it lands after forecast-grading's 15:00 slot
 * and does not contend with it.
 *
 * Reads nothing another job writes, so it has no ordering dependency at
 * all; the stagger is only politeness about concurrency. Same service-role
 * client, CRON_SECRET check and JSON-summary response shape as
 * app/api/cron/driver-state-engine/route.ts.
 *
 * The whole pass is idempotent (see lib/program-lifecycle/service.ts), so
 * a retry, a double fire, or a manual run is safe.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { runProgramLifecyclePass } from '@/lib/program-lifecycle/service';

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

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let supabase;
  try {
    supabase = serviceRoleClient();
  } catch (err) {
    console.error('movement-lifecycle cron: Supabase misconfigured —', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Supabase misconfigured' },
      { status: 500 }
    );
  }

  const result = await runProgramLifecyclePass(supabase);
  return NextResponse.json(result);
}
