/**
 * Daily proactive wearable sync — the one new piece of background
 * infrastructure this milestone adds (see the plan's Part 3/6). Runs once
 * a day (vercel.json's cron entry) so a proactive message is already
 * waiting in a member's Coach Messages inbox before they open the app,
 * rather than only ever reacting to a manual "Sync now" tap.
 *
 * Uses the service-role client — there is no per-member session in a
 * cron invocation. This is the first caller in the app that needs one;
 * see lib/supabase/server.ts's own docblock, which already reserved the
 * service role for exactly this "future background job" case. RLS still
 * protects every table from anything else; the service role is scoped to
 * this one route, gated by CRON_SECRET below.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncWearableConnection } from '@/lib/wearables/sync';
import type { WearableConnection } from '@mef/shared-types-contracts';

export const dynamic = 'force-dynamic';

function serviceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const supabase = serviceRoleClient();

  const { data, error } = await supabase
    .from('wearable_connections')
    .select('*')
    .eq('status', 'connected');

  if (error) {
    console.error('wearable-daily cron: failed to list connections', error);
    return NextResponse.json({ error: 'Failed to list connections' }, { status: 500 });
  }

  const connections = (data ?? []) as WearableConnection[];
  const results = await Promise.allSettled(
    connections.map((connection) => syncWearableConnection(supabase, connection))
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;

  return NextResponse.json({
    connectionsProcessed: connections.length,
    succeeded,
    failed: connections.length - succeeded,
  });
}
