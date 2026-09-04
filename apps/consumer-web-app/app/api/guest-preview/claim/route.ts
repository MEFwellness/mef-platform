/**
 * The bind: this member is the person who took the Quick Wellness Check in
 * this browser.
 *
 * WHAT THIS REPLACED, AND WHY. app/GuestPreviewMigrator.tsx used to sit in
 * the root layout and, on the first page load after signup, copy the
 * guest's seven answers into a real daily_checkins row through the ordinary
 * member check-in action. Nothing recorded that they had come from a
 * stranger with no account and no consent flow, so from that moment they
 * were indistinguishable from a Daily Reset she had sat down and completed,
 * and every honesty threshold that counts check-ins counted a day she had
 * never checked in. This route does the one honest half of that: it records
 * that the run in this browser was hers. It copies nothing anywhere.
 *
 * WHY IT IS A ROUTE HANDLER. The same reason app/api/public-entry/claim is:
 * it fires from a mounted effect on whatever page the member happens to be
 * on, and a Server Action would re-render that whole route on the server to
 * write one row.
 *
 * WHAT AUTHORISES IT. The member's own session cookie, resolved server
 * side. The browser gets to say ONE thing: which visitor token it is
 * holding. It cannot name a member and cannot re-point an existing bind,
 * because claimed_by is unique and the update only ever touches a session
 * that is still unclaimed.
 *
 * WHY THE WRITE ITSELF USES THE SERVICE ROLE. guest_wellness_check_sessions
 * deliberately has NO insert or update policy for anybody, including the
 * member herself (migration 202). How she arrived is a fact about her
 * arrival, not something any session should be able to manufacture,
 * re-point or erase. She is authorised from her own session FIRST, and only
 * then is the row written as the platform.
 *
 * THE RETRY CONTRACT. `retry: true` means "no session yet, ask again on a
 * later page load", which is what happens while she is still on the signup
 * or verify screen. `retry: false` means stop asking, either because the
 * bind now exists or because the token names nothing.
 */

import { getCachedUser } from '@/lib/supabase/currentUser';
import { serviceRoleClient } from '@/lib/supabase/serviceRole';
import { claimGuestSessionForMember, getGuestSessionByToken } from '@/lib/guest-preview/data';

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

  const user = await getCachedUser();
  if (!user) return Response.json({ claimed: false, retry: true });

  const service = serviceRoleClient();
  const session = await getGuestSessionByToken(service, raw);
  // A token this browser holds for a run that no longer exists. Stop
  // asking: there is nothing to bind and there never will be.
  if (!session) return Response.json({ claimed: false, retry: false });

  const { claimed } = await claimGuestSessionForMember(service, user.id, session.id);
  // Not claimed means this run already belongs to somebody else, which is a
  // settled outcome rather than a transient one. Either way, stop asking.
  return Response.json({ claimed, retry: false });
}
