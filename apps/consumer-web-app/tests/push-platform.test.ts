/**
 * What a browser can do with push, and what to call the device it runs on.
 *
 * The iPhone branch is the reason this file exists. Safari on iOS only
 * delivers push to an app that has been added to the Home Screen, and in a
 * plain Safari tab there is no PushManager at all. Getting that wrong in
 * either direction is a real member-facing failure: a dead permission
 * prompt on one side, or an add-to-Home-Screen lecture aimed at somebody
 * on Android on the other. Neither is reachable without a phone, so it is
 * decided by a pure function and proved here.
 */
import { describe, it, expect } from 'vitest';
import {
  describeDevice,
  isIosDevice,
  resolvePushCapability,
  type PushEnvironmentFacts,
} from '../lib/push/platform';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_OS_16 =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const WINDOWS_EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1';

function facts(overrides: Partial<PushEnvironmentFacts> = {}): PushEnvironmentFacts {
  return {
    userAgent: ANDROID_CHROME,
    maxTouchPoints: 5,
    isStandalone: false,
    hasServiceWorker: true,
    hasPushManager: true,
    hasNotification: true,
    ...overrides,
  };
}

describe('isIosDevice', () => {
  it('recognises an iPhone', () => {
    expect(isIosDevice(IPHONE_SAFARI, 5)).toBe(true);
  });

  it('recognises an iPad, which calls itself a Macintosh', () => {
    // This is the whole reason maxTouchPoints is a parameter: iPadOS 13
    // and later send a desktop Mac user agent, so the string alone says
    // Mac and only the touch points say otherwise.
    expect(isIosDevice(IPAD_OS_16, 5)).toBe(true);
  });

  it('does not mistake a real Mac for an iPad', () => {
    expect(isIosDevice(MAC_CHROME, 0)).toBe(false);
    expect(isIosDevice(IPAD_OS_16, 0)).toBe(false);
  });

  it('does not mistake Android for iOS', () => {
    expect(isIosDevice(ANDROID_CHROME, 5)).toBe(false);
  });
});

describe('resolvePushCapability', () => {
  it('is ready on Android with everything present', () => {
    expect(resolvePushCapability(facts())).toBe('ready');
  });

  it('is ready on an iPhone running from the Home Screen', () => {
    expect(
      resolvePushCapability(facts({ userAgent: IPHONE_SAFARI, isStandalone: true }))
    ).toBe('ready');
  });

  it('needs an install on an iPhone in a browser tab, even though push support looks absent', () => {
    // The trap: in that tab the support test ALSO fails, so a capability
    // check that ran the generic test first would answer "your browser
    // cannot do this", which is both wrong and a dead end.
    expect(
      resolvePushCapability(
        facts({
          userAgent: IPHONE_SAFARI,
          isStandalone: false,
          hasPushManager: false,
          hasServiceWorker: false,
        })
      )
    ).toBe('ios_needs_install');
  });

  it('needs an install on an iPad in a browser tab', () => {
    expect(
      resolvePushCapability(facts({ userAgent: IPAD_OS_16, maxTouchPoints: 5, isStandalone: false }))
    ).toBe('ios_needs_install');
  });

  it('is unsupported when a non-iOS browser is missing any one of the three pieces', () => {
    expect(resolvePushCapability(facts({ hasPushManager: false }))).toBe('unsupported');
    expect(resolvePushCapability(facts({ hasServiceWorker: false }))).toBe('unsupported');
    expect(resolvePushCapability(facts({ hasNotification: false }))).toBe('unsupported');
  });

  it('never tells a member on a desktop browser to add the app to her Home Screen', () => {
    expect(resolvePushCapability(facts({ userAgent: MAC_CHROME, maxTouchPoints: 0 }))).toBe('ready');
    expect(
      resolvePushCapability(facts({ userAgent: WINDOWS_EDGE, maxTouchPoints: 0, hasPushManager: false }))
    ).toBe('unsupported');
  });
});

describe('describeDevice', () => {
  it('names the phone and the browser in plain words', () => {
    expect(describeDevice(IPHONE_SAFARI, 5)).toBe('iPhone, Safari');
    expect(describeDevice(ANDROID_CHROME, 5)).toBe('Android, Chrome');
    expect(describeDevice(WINDOWS_EDGE, 0)).toBe('Windows, Edge');
    expect(describeDevice(MAC_CHROME, 0)).toBe('Mac, Chrome');
  });

  it('does not call Chrome on an iPhone "Safari", though its user agent says Safari', () => {
    expect(describeDevice(IPHONE_CHROME, 5)).toBe('iPhone, Chrome');
  });

  it('calls an iPad an iPad even when it claims to be a Mac', () => {
    expect(describeDevice(IPAD_OS_16, 5)).toBe('iPad, Safari');
  });

  it('says something rather than nothing for a user agent it cannot read', () => {
    expect(describeDevice('', 0)).toBe('Device, Browser');
  });
});
