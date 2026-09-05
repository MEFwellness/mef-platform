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
import {
  bindOriginFromEmailMatch,
  claimSessionForMember,
  getSessionByToken,
} from '@/lib/public-entry/data';
import {
  attachUserAcquisitionFromArrival,
  attachUserAcquisitionFromLead,
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
  // A token this browser holds for a session that no longer exists. There
  // is nothing here to bind and there never will be, so the browser stops
  // asking, but her address is still a join worth trying before it does.
  if (!session) return await settleByEmail(service, user, 'session_missing');

  const { origin, outcome } = await claimSessionForMember(service, user.id, session);

  // THE BIND LOST A RACE IT COULD NEVER WIN, AND THAT IS TERMINAL.
  //
  // Found on a real phone on 2026-09-05. The phone still held the visitor
  // token from an earlier scan of the same QR card, so opening the quiz
  // resumed that older session, and that session had already been claimed
  // by another account. First bind wins is correct and stays. What was
  // wrong is what happened next: this route reported the loss as "no
  // session yet, ask again later", the browser retried on every page load
  // forever, the email match at signup had been skipped because the browser
  // said it was holding a token, and the member ended up bound to nothing
  // by any path at all.
  //
  // So a taken session now falls through to the other join and then stops
  // asking, which is the whole of the fix on this side.
  if (outcome === 'session_taken') return await settleByEmail(service, user, 'session_taken');

  // A genuinely broken read or write. Worth asking again on a later page
  // load, which is what it always was.
  if (!origin) return Response.json({ claimed: false, retry: true });

  const newlyClaimed = outcome === 'claimed';

  if (newlyClaimed) {
    // Her own copy of where she came from, before anything else, because
    // this is the only moment the arrival and the account are both in hand.
    // Awaited rather than fired and forgotten: an analytics row that goes
    // missing costs a number, and this one costs the origin of a real
    // member, permanently.
    await attachUserAcquisitionFromArrival(service, {
      memberId: user.id,
      session,
      experienceKey: origin.experienceKey,
      accountCreatedAt: user.created_at ?? null,
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

/**
 * The fallback join, run at the one moment the browser path is KNOWN to
 * have failed rather than merely to be waiting.
 *
 * TWO WRITES, AND NEITHER CAN OVERWRITE ANYTHING. The quiz bind
 * (member_public_entry_origin, keyed by member and unique by session) and
 * her acquisition attribution (user_acquisition, refused an update by the
 * database itself). Both are no-ops for a member who already has one.
 *
 * IT ALWAYS ANSWERS `retry: false`. Whether or not the address matched
 * anything, this browser's token cannot produce a bind, so asking again on
 * the next page load would be asking a question that has already been
 * answered for the rest of this browser's life.
 */
async function settleByEmail(
  service: ReturnType<typeof serviceRoleClient>,
  user: { id: string; email?: string | undefined; created_at?: string | undefined },
  why: 'session_missing' | 'session_taken'
): Promise<Response> {
  const email = typeof user.email === 'string' ? user.email : '';
  if (!email) return Response.json({ claimed: false, retry: false, reason: why });

  const accountCreatedAt = user.created_at ?? null;
  const bind = await bindOriginFromEmailMatch(service, {
    memberId: user.id,
    email,
    accountCreatedAt,
  });
  // Attribution is a separate record from the bind and is attached the same
  // way it is on a signup that carried no token at all. Without this, the
  // taken-session path lost her origin AND her attribution, because the
  // signup form had already said "yes, this browser is holding something".
  await attachUserAcquisitionFromLead(service, {
    memberId: user.id,
    email,
    accountCreatedAt,
  });

  return Response.json({ claimed: bind.bound, retry: false, reason: why });
}
