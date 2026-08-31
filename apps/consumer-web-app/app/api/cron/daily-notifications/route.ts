/**
 * The daily notification decision — the seventh scheduled job, and the
 * only one that runs every hour rather than once a day.
 *
 * WHY HOURLY. A cron fires in UTC and a member lives somewhere. Sending
 * "at nine" from a single daily job would reach Los Angeles at one in the
 * morning. So the schedule runs on the hour, every hour, and each member
 * is only acted on in the hour her OWN clock says is hers
 * (lib/push-decision/window.ts). Most invocations therefore send nothing
 * to most members, which is the design and not a symptom.
 *
 * That makes double-sending the risk worth engineering against, not
 * missing a run: twenty four opportunities a day to send one member one
 * notification. The cap is a unique (member_id, local_date) receipt in
 * migration 196, claimed before the push service is asked for anything.
 * There is no retry path in this job at all.
 *
 * Same service-role client, CRON_SECRET check and JSON-summary response
 * shape as app/api/cron/movement-lifecycle/route.ts.
 *
 * The pass is idempotent by that receipt rather than by a flag: a second
 * invocation in the same hour, a manual curl, or an overlapping run all
 * find today's row already claimed and send nothing.
 */

import { NextResponse } from 'next/server';
import { serviceRoleClient } from '@/lib/supabase/serviceRole';
import { runDailyNotificationPass } from '@/lib/push-decision/service';

export const dynamic = 'force-dynamic';
// A pass over every member with a live device runs the priority engine
// once each. The default 10 second serverless budget is not enough on a
// day when several members' windows open at once.
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let supabase;
  try {
    supabase = serviceRoleClient();
  } catch (err) {
    console.error('daily-notifications cron: Supabase misconfigured', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Supabase misconfigured' },
      { status: 500 }
    );
  }

  const result = await runDailyNotificationPass(supabase);
  return NextResponse.json(result);
}
