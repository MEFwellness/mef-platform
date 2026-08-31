/**
 * What this browser can actually do with push, and what to call the device
 * it is running on.
 *
 * Pure functions over a plain facts object rather than reads of `window`,
 * so the iPhone case (the only one with a real branch in the UI) is
 * testable without a phone. The component gathers the facts; this file
 * decides what they mean.
 *
 * THE IPHONE RULE, WHICH IS THE WHOLE REASON THIS FILE EXISTS. Safari on
 * iOS has supported web push since iOS 16.4, but ONLY for a site that has
 * been added to the Home Screen and is running as an installed app. In an
 * ordinary Safari tab there is no PushManager at all, so asking for
 * permission there does nothing at best and shows a dead prompt at worst.
 * A member on an iPhone who has not installed the app therefore needs a
 * different screen, not a permission request.
 */

export type PushCapability =
  /** Permission can be requested here and a subscription will work. */
  | 'ready'
  /** An iPhone browser that has to be added to the Home Screen first. */
  | 'ios_needs_install'
  /** This browser has no push support and installing will not change that. */
  | 'unsupported';

export type PushEnvironmentFacts = {
  userAgent: string;
  /** navigator.maxTouchPoints. iPadOS 13 and later report a desktop Mac user agent, and this is what separates the two. */
  maxTouchPoints: number;
  /** Running as an installed Home Screen app rather than in a browser tab. */
  isStandalone: boolean;
  /** 'serviceWorker' in navigator */
  hasServiceWorker: boolean;
  /** 'PushManager' in window */
  hasPushManager: boolean;
  /** 'Notification' in window */
  hasNotification: boolean;
};

/**
 * iPhone, iPad or iPod. iPadOS 13 and later deliberately lie in their user
 * agent, calling themselves Macintosh, so a Mac user agent that also
 * reports touch points is an iPad.
 */
export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPad|iPhone|iPod/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

export function resolvePushCapability(facts: PushEnvironmentFacts): PushCapability {
  const ios = isIosDevice(facts.userAgent, facts.maxTouchPoints);
  const complete = facts.hasServiceWorker && facts.hasPushManager && facts.hasNotification;

  // An iPhone in a browser tab is the case with a real way forward, and it
  // is checked before the generic support test on purpose: in that tab the
  // support test also fails, and answering "your browser cannot do this"
  // would be both wrong and useless.
  if (ios && !facts.isStandalone) return 'ios_needs_install';

  if (!complete) return 'unsupported';
  return 'ready';
}

/**
 * A short, plain "which phone is this" label for the saved subscription,
 * so an administrator picking a device to test against sees something
 * human instead of a hundred characters of user agent string.
 *
 * Never used to decide anything, only ever displayed.
 */
export function describeDevice(userAgent: string, maxTouchPoints = 0): string {
  const ua = userAgent || '';

  const platform = /iPhone/i.test(ua)
    ? 'iPhone'
    : /iPad/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1)
      ? 'iPad'
      : /Android/i.test(ua)
        ? 'Android'
        : /Macintosh|Mac OS X/i.test(ua)
          ? 'Mac'
          : /Windows/i.test(ua)
            ? 'Windows'
            : /Linux/i.test(ua)
              ? 'Linux'
              : 'Device';

  // Order matters: every one of these browsers puts "Safari" in its user
  // agent, and Chrome, Edge and Opera all put "Chrome" in theirs.
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /OPR\//i.test(ua)
      ? 'Opera'
      : /FxiOS|Firefox/i.test(ua)
        ? 'Firefox'
        : /CriOS|Chrome/i.test(ua)
          ? 'Chrome'
          : /Safari/i.test(ua)
            ? 'Safari'
            : 'Browser';

  return `${platform}, ${browser}`;
}
