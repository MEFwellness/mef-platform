/**
 * Every word of the push notification experience, in Root's voice, in one
 * place. No em dashes anywhere, per the app copy rule, and no promise with
 * no date attached: the ask says what she will actually get, which for now
 * is at most one reminder a day and only when something is genuinely
 * waiting.
 *
 * Held here rather than inline in the components so the ask, the settings
 * switch and the tests all read the same strings, and so the one place to
 * change a word is the one place that is read.
 */

export const PUSH_ASK_COPY = {
  eyebrow: 'From Root',
  title: 'Want a gentle reminder?',
  body:
    'I can send a short note to your phone when something is genuinely ready for you. One a day at most, and only when there is truly something waiting.',
  accept: 'Yes, send me one',
  decline: 'No thank you',
  /** Shown once the phone has granted permission and the device is saved. */
  acceptedTitle: 'That is set',
  accepted:
    "I will only reach out when there is something worth your time. You can turn this off any time from your profile.",
  /** Shown when she says yes and the phone itself says no. */
  blockedTitle: 'Your phone said no',
  blocked:
    'That is completely fine, and nothing here changes. If you want reminders later, your phone controls them in its own settings for this app, and the switch in your profile is always there.',
  declinedTitle: 'Understood',
  declined:
    'I will stay quiet. If you ever want a nudge, the switch is waiting in your profile.',
  done: 'Done',
} as const;

/**
 * The iPhone walkthrough. Written for someone who has never heard the
 * words "install" or "PWA", so it names what she can see on the screen
 * rather than what the thing is called.
 */
export const PUSH_IOS_INSTALL_COPY = {
  eyebrow: 'From Root',
  title: 'One small step first',
  body:
    'On an iPhone, reminders can only reach you once Rooted Reset is sitting on your Home Screen like your other apps. It takes about twenty seconds.',
  steps: [
    'Tap the Share button at the bottom of the screen. It is the little square with an arrow pointing up out of it.',
    'Scroll down that list and tap Add to Home Screen.',
    'Tap Add in the top corner. A Rooted Reset icon appears with your other apps.',
    'Open Rooted Reset from that new icon, and reminders can be turned on from your profile.',
  ],
  dismiss: 'Got it',
} as const;

export const PUSH_SETTINGS_COPY = {
  label: 'Reminders on your phone',
  on: 'On. At most one a day, and only when there is genuinely something waiting for you.',
  off: 'Off. Nothing is sent to your phone.',
  turningOn: 'Turning on',
  turningOff: 'Turning off',
  /** The settings screen version of the iPhone case, one line rather than a walkthrough. */
  iosNeedsInstall:
    'Add Rooted Reset to your Home Screen first, then open it from that icon and this switch will work. Tap the Share button at the bottom of the screen, then Add to Home Screen.',
  unsupported: 'This browser cannot send notifications. Open Rooted Reset on your phone to turn these on.',
  blocked:
    'Your phone is blocking notifications for Rooted Reset. Turn them back on in your phone settings for this app, then come back here.',
} as const;

/** The admin test push. Deliberately says it is a test, so nobody who receives one wonders. */
export const PUSH_TEST_NOTIFICATION = {
  title: 'Rooted Reset',
  body: 'This is a test notification. Nothing is waiting for you right now.',
  url: '/dashboard',
  tag: 'rooted-reset-test',
} as const;

/**
 * Which line sits under the reminders switch. Pure, because it is the
 * whole of what the switch SAYS about itself and the iPhone case is easy
 * to get subtly wrong: a member on an iPhone in a Safari tab must be told
 * what to do, not told the switch is simply off.
 *
 * Order matters. What is happening right now outranks what is true, and
 * "on" outranks every browser limitation, because a member who already has
 * reminders working must never be told her browser cannot do this.
 */
export function pushSwitchHelperText(state: {
  on: boolean;
  pending: boolean;
  capability: PushCapabilityForCopy;
}): string {
  if (state.pending) return state.on ? PUSH_SETTINGS_COPY.turningOff : PUSH_SETTINGS_COPY.turningOn;
  if (state.on) return PUSH_SETTINGS_COPY.on;
  if (state.capability === 'ios_needs_install') return PUSH_SETTINGS_COPY.iosNeedsInstall;
  if (state.capability === 'unsupported') return PUSH_SETTINGS_COPY.unsupported;
  return PUSH_SETTINGS_COPY.off;
}

/** Kept structurally identical to PushCapability, and null for "not worked out yet, on the server or before mount". */
export type PushCapabilityForCopy = 'ready' | 'ios_needs_install' | 'unsupported' | null;
