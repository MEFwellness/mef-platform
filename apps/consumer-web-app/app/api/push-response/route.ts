/**
 * The delivery route for the one-time push notification ask.
 *
 * Exactly the same reasoning, and the same shape, as
 * app/api/popup-response/route.ts: it runs the SAME server actions, adds
 * no logic and no second write path, and exists only because of how the
 * answer gets to the server.
 *
 * The extra reason it matters here. This ask lives on /checkin/result,
 * whose render builds and grades the forecast she just submitted. A server
 * action called from a client component re-renders the route it was called
 * from, so answering the ask through one would re-run that whole screen
 * behind a tap that has nothing to do with it. A plain fetch returns a few
 * bytes of JSON instead, and the screen she is reading stays exactly as it
 * is.
 *
 * Nothing here trusts the browser. Each action resolves the member from
 * her own session, and the subscription is validated against the real
 * browser shape inside saveMyPushSubscriptionAction, so an argument
 * arriving over this route is exactly as constrained as one arriving over
 * a server action.
 */

import { NextResponse } from 'next/server';
import {
  recordMyPushPromptShownAction,
  saveMyPushSubscriptionAction,
  upgradeMyPushPromptAnswerAction,
} from '@/app/actions/pushNotifications';
import type { PushPromptAnswer } from '@/lib/push/data';

const ANSWERS: readonly PushPromptAnswer[] = ['enabled', 'declined', 'needs_install'];

function readAnswer(value: unknown): PushPromptAnswer | null {
  return typeof value === 'string' && (ANSWERS as readonly string[]).includes(value)
    ? (value as PushPromptAnswer)
    : null;
}

type PushResponseBody = {
  kind?: unknown;
  answer?: unknown;
  subscription?: unknown;
  deviceLabel?: unknown;
};

export async function POST(request: Request): Promise<NextResponse> {
  let body: PushResponseBody;
  try {
    body = (await request.json()) as PushResponseBody;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  switch (body.kind) {
    case 'prompt_shown': {
      const answer = readAnswer(body.answer);
      if (!answer) return NextResponse.json({ ok: false }, { status: 400 });
      return NextResponse.json(await recordMyPushPromptShownAction(answer));
    }
    case 'prompt_answer': {
      const answer = readAnswer(body.answer);
      if (!answer) return NextResponse.json({ ok: false }, { status: 400 });
      return NextResponse.json(await upgradeMyPushPromptAnswerAction(answer));
    }
    case 'save_subscription':
      return NextResponse.json(
        await saveMyPushSubscriptionAction(
          body.subscription,
          typeof body.deviceLabel === 'string' ? body.deviceLabel : null
        )
      );
    default:
      return NextResponse.json({ ok: false }, { status: 400 });
  }
}
