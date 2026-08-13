/**
 * The delivery route for a Root pop-up answer.
 *
 * WHY A ROUTE AND NOT THE SERVER ACTION DIRECTLY. It runs the SAME server
 * actions — this file adds no logic, no second write path and no second
 * set of guards; every case below is one line that hands straight to the
 * function that already owned that write. What changes is only how the
 * browser gets the answer to the server, and that turned out to matter.
 *
 * A server action call from a client component is a POST whose response is
 * the re-rendered React tree for the page the member is currently on. It
 * therefore stays open long after the write itself is finished, and it is
 * bound to the router: found reproducibly while measuring this, on a
 * production build with Slow 3G, tapping "Help me" and then a bottom-nav
 * link half a second later aborted that POST (`net::ERR_ABORTED`) with the
 * write never landing — and the retries, now issued from a page mid
 * navigation, were aborted the same way. Three attempts, no row. The
 * member's answer was simply gone, and nothing on screen said so.
 *
 * A plain `fetch` with `keepalive` has neither property. It is not the
 * router's, so navigating does not cancel it and it survives the page
 * being left entirely; and its response is a few bytes of JSON rather than
 * a whole re-rendered page, so the tap no longer drags a full server
 * render behind it.
 *
 * Nothing here trusts the browser. Each action resolves the member from
 * her own session and validates its own arguments against the closed
 * allowlists it always did (lib/analytics/surfaces.ts, and the weekly
 * review's own question/option checks), so an argument arriving over this
 * route is exactly as constrained as one arriving over a server action.
 */

import { NextResponse } from 'next/server';
import {
  completePriorityAction,
  savePriorityForLaterAction,
  trackPriorityHelpAction,
} from '@/app/actions/priority';
import {
  acknowledgeWeeklyReviewAction,
  answerWeeklyReviewQuestionAction,
} from '@/app/actions/weeklyReview';

/** The closed set of answers a pop-up can deliver. Anything else is a 400. */
type PopupResponseBody = {
  kind: string;
  questionKey?: unknown;
  option?: unknown;
};

export async function POST(request: Request): Promise<NextResponse> {
  let body: PopupResponseBody;
  try {
    body = (await request.json()) as PopupResponseBody;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  switch (body.kind) {
    case 'priority_done':
      return NextResponse.json(await completePriorityAction());
    case 'priority_save':
      return NextResponse.json(await savePriorityForLaterAction());
    case 'priority_help':
      return NextResponse.json(await trackPriorityHelpAction());
    case 'weekly_review_acknowledge':
      return NextResponse.json(await acknowledgeWeeklyReviewAction());
    case 'weekly_review_answer':
      return NextResponse.json(
        await answerWeeklyReviewQuestionAction(
          typeof body.questionKey === 'string' ? body.questionKey : '',
          typeof body.option === 'string' ? body.option : ''
        )
      );
    default:
      return NextResponse.json({ ok: false }, { status: 400 });
  }
}
