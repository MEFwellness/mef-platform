/**
 * The bind: this member is the person who took the public experience in
 * this browser.
 *
 * WHY IT IS A ROUTE HANDLER. The same reason lib/analytics/beacon.ts is: it
 * is fired from a mounted effect on whatever page the member happens to be
 * on, and a Server Action would re-render that whole route on the server to
 * write one row. See feedback in app/actions/analytics.ts's own call sites
 * and the Home speed build. A route handler returns and re-renders nothing.
 *
 * WHAT AUTHORISES IT. The member's own session cookie, resolved server
 * side, exactly like the beacon. The browser gets to say ONE thing: which
 * visitor token it is holding. It cannot name a member, cannot name a
 * session id, and cannot re-point an existing bind, because
 * member_public_entry_origin has member_id as its primary key and
 * session_id unique, and claimSessionForMember treats a conflict as
 * "somebody got here first" rather than as something to overwrite.
 *
 * WHY THE WRITE ITSELF USES THE SERVICE ROLE. member_public_entry_origin
 * deliberately has NO insert policy for anybody, including the member
 * herself (migration 197). Where she came from is a fact about her arrival,
 * not something any session should be able to manufacture, re-point or
 * erase. The member is authorised from her own session FIRST, and only then
 * is the row written as the platform. This is the same shape the push
 * decision's administrator tool had to be corrected into on 2026-08-31.
 *
 * WHAT IT WRITES SINCE MIGRATION 200. The bind, as before, and alongside it
 * her `user_acquisition` row: the arrival's FIRST touch attribution copied
 * onto her account with every original timestamp carried forward. That row
 * is written once, is refused an update by the database itself, and is what
 * a later report joins to `member_subscriptions` and to
 * `member_wellness_events` to read paid conversion. Nothing reads it yet.
 *
 * IT IS COPIED, NOT JOINED, AND THAT IS DELIBERATE. Where a member came
 * from is a fact about her account, and it has to survive the deletion of
 * the anonymous session it came from; every verification run this year has
 * purged those sessions afterwards.
 *
 * WHAT IT DOES NOT DO, AND WILL NEVER DO. It does not copy a single public
 * answer into a check-in, an onboarding submission, an assessment session
 * or a scoring input. Public answers stay in public_entry_answers where
 * their provenance is structural. Attribution is behavioural only: no
 * answer, no pattern and no email reaches a `user_acquisition` column,
 * because no such column exists.
 */

import { getCachedUser } from '@/lib/supabase/currentUser';
import { createClient } from '@/lib/supabase/server';
import { serviceRoleClient } from '@/lib/supabase/serviceRole';
import { claimSessionForMember, getSessionByToken } from '@/lib/public-entry/data';
import {
  attachUserAcquisition,
  readAttributionTouch,
  touchFromSession,
} from '@/lib/acquisition/data';
import { fireAndForget, resolveMemberTimezone, trackProductEvent } from '@/lib/analytics/track';

export const dynamic = 'force-dynamic';

const NO_CONTENT = new Response(null, { status: 204 });

export async function POST(request: Request): Promise<Response> {
  let body: { visitorToken?: unknown };
  try {
    body = (await request.json()) as { visitorToken?: unknown };
  } catch {
    return NO_CONTENT;
  }

  const raw = typeof body.visitorToken === 'string' ? body.visitorToken.trim() : '';
  if (raw.length < 8 || raw.length > 64) return NO_CONTENT;

  // No session yet (still on an auth screen, or signed out). Not an error:
  // the caller keeps its token and tries again on a later page load, the
  // same contract app/GuestPreviewMigrator.tsx already relies on.
  const user = await getCachedUser();
  if (!user) return Response.json({ claimed: false, retry: true });

  const service = serviceRoleClient();
  const session = await getSessionByToken(service, raw);
  // A token this browser holds for a session that no longer exists. Stop
  // asking: there is nothing to bind and there never will be.
  if (!session) return Response.json({ claimed: false, retry: false });

  const { origin, newlyClaimed } = await claimSessionForMember(service, user.id, session);
  if (!origin) return Response.json({ claimed: false, retry: true });

  if (newlyClaimed) {
    // Her own copy of where she came from, before anything else, because
    // this is the only moment the arrival and the account are both in hand.
    // Awaited rather than fired and forgotten: an analytics row that goes
    // missing costs a number, and this one costs the origin of a real
    // member, permanently.
    const firstTouch =
      (await readAttributionTouch(service, session.id, 'first')) ?? touchFromSession(session);
    await attachUserAcquisition(service, {
      memberId: user.id,
      sessionId: session.id,
      experienceKey: origin.experienceKey,
      capturedLeadId: session.capturedLeadId,
      leadCapturedAt: session.leadCapturedAt,
      accountCreatedAt: user.created_at ?? null,
      attribution: firstTouch,
    });

    // Through the existing pipeline, so the post-account half of the funnel
    // is readable from product_analytics_events with no new machinery. The
    // member's own RLS-scoped client writes it, because it is her own event
    // on her own stream.
    const supabase = createClient();
    const timezone = await resolveMemberTimezone(supabase, user.id);
    fireAndForget(
      trackProductEvent(supabase, {
        memberId: user.id,
        eventType: 'public_entry_claimed',
        timezone,
        payload: {
          sourceCode: origin.sourceCode,
          experienceKey: origin.experienceKey,
        },
      })
    );
  }

  return Response.json({ claimed: true, retry: false });
}
