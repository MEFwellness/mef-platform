'use server';

/**
 * The member's own push notification writes: save this device, turn
 * reminders on or off, and record the one-time ask.
 *
 * Every function resolves the member from her own session and never takes
 * a member id, so there is no argument shape here that touches somebody
 * else's devices. The subscription itself is validated against the browser
 * shape before it is stored, because it arrives over the wire from a
 * client component and a stored object that is not a real subscription
 * would only fail much later, inside a send, with nothing to say why.
 *
 * Nothing here sends anything. See lib/push/send.ts.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import type { ActionResult } from './auth';
import {
  getMemberPushState,
  isPushSubscriptionJson,
  recordPushPromptShown,
  revokeAllPushSubscriptions,
  savePushSubscription,
  setPushNotificationsEnabled,
  type MemberPushState,
  type PushPromptAnswer,
} from '@/lib/push/data';

/** A device label is only ever displayed, so it is trimmed and capped rather than parsed. */
const MAX_DEVICE_LABEL = 60;

export async function getMyPushStateAction(): Promise<MemberPushState | null> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return null;
  return getMemberPushState(supabase, user.id);
}

/**
 * Saves the device she just granted permission on. The claim function this
 * calls also turns her preference on, because granting permission and then
 * finding the switch still off would be a lie about what just happened.
 */
export async function saveMyPushSubscriptionAction(
  subscription: unknown,
  deviceLabel?: string | null
): Promise<ActionResult> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { error: 'Not signed in.' };

  if (!isPushSubscriptionJson(subscription)) {
    return { error: 'That device did not send a usable subscription.' };
  }

  const label =
    typeof deviceLabel === 'string' && deviceLabel.trim().length > 0
      ? deviceLabel.trim().slice(0, MAX_DEVICE_LABEL)
      : null;

  const saved = await savePushSubscription(supabase, subscription, label);
  if ('error' in saved) return { error: saved.error };

  // Read it back. A write that matches no policy returns no rows and no
  // error, so "no error" is not "it worked".
  const state = await getMemberPushState(supabase, user.id);
  if (!state.enabled || state.liveDeviceCount === 0) {
    return { error: 'That device could not be saved. Nothing was changed.' };
  }

  return {};
}

/**
 * The one switch. Turning it off revokes every saved device as well as
 * setting the preference, so "off" means off at both locks rather than
 * leaving live rows behind a flag.
 *
 * Turning it ON here only sets the preference. The browser permission and
 * the subscription are the caller's job, because a permission prompt can
 * only be raised from a tap in the browser, never from the server.
 */
export async function setMyPushNotificationsEnabledAction(enabled: boolean): Promise<ActionResult> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { error: 'Not signed in.' };

  if (!enabled) {
    const revoked = await revokeAllPushSubscriptions(supabase, user.id);
    if (!revoked) return { error: 'Could not turn reminders off. Nothing was changed.' };
  }

  const updated = await setPushNotificationsEnabled(supabase, user.id, enabled);
  if (!updated) return { error: 'Could not save that. Nothing was changed.' };

  const state = await getMemberPushState(supabase, user.id);
  if (state.enabled !== enabled) return { error: 'Could not save that. Nothing was changed.' };
  if (!enabled && state.liveDeviceCount > 0) {
    return { error: 'Could not turn reminders off. Nothing was changed.' };
  }

  return {};
}

/**
 * Records that the one-time ask was actually put in front of her, and what
 * happened. Written by the ask itself the moment it is shown, which is why
 * "declined" is the answer stored first and then upgraded to "enabled"
 * only if she says yes and the phone agrees: a member who closes the app
 * mid-ask has still been asked, and must not be asked again.
 *
 * recordPushPromptShown refuses a profile that already carries a
 * push_prompt_shown_at, so a second call cannot move the timestamp. The
 * answer is deliberately allowed to be corrected by
 * saveMyPushSubscriptionAction's caller through
 * upgradeMyPushPromptAnswerAction below, which is the only writer that
 * touches the answer after the fact.
 */
export async function recordMyPushPromptShownAction(answer: PushPromptAnswer): Promise<ActionResult> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { error: 'Not signed in.' };

  const ok = await recordPushPromptShown(supabase, user.id, answer);
  if (!ok) return { error: 'Could not record that.' };
  return {};
}

/**
 * Corrects the recorded answer once the outcome is actually known, without
 * touching push_prompt_shown_at. Only the answer moves, so "she has been
 * asked" stays fixed at the first showing.
 */
export async function upgradeMyPushPromptAnswerAction(answer: PushPromptAnswer): Promise<ActionResult> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { error: 'Not signed in.' };

  const { error } = await supabase
    .from('profiles')
    .update({ push_prompt_answer: answer })
    .eq('id', user.id);

  if (error) {
    console.error('upgradeMyPushPromptAnswerAction failed', error);
    return { error: 'Could not record that.' };
  }
  return {};
}
