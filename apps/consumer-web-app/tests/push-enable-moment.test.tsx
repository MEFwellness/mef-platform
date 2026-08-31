/**
 * The one time Root asks about reminders: when it is due, what it says,
 * and where it is allowed to appear.
 *
 * Three separate things are proved here, because the ask is one of those
 * features where every part can be individually correct and the feature
 * still be wrong.
 *
 *  1. THE DUE RULE. Never asked, and reminders are off. A member who
 *     already turned them on from her profile has nothing to be asked.
 *  2. THE WORDS. Rendered for real, not grepped from the source, so what
 *     is asserted is what a member would actually read on the screen.
 *  3. WHERE IT LIVES. A source sweep, because "never during onboarding and
 *     never on first login" is a claim about the screens that do NOT have
 *     it, and no render of any one screen can prove that.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isPushEnableAskDue, isPushSubscriptionJson, type MemberPushState } from '../lib/push/data';
import {
  PUSH_ASK_COPY,
  PUSH_IOS_INSTALL_COPY,
  PUSH_SETTINGS_COPY,
  pushSwitchHelperText,
} from '../lib/push/copy';
import { PushEnableAskCard } from '../components/push/PushEnableAsk';

const ROOT = resolve(__dirname, '..');

function state(overrides: Partial<MemberPushState> = {}): MemberPushState {
  return { enabled: false, promptShownAt: null, promptAnswer: null, liveDeviceCount: 0, ...overrides };
}

// ---------------------------------------------------------------------------
// 1. The due rule
// ---------------------------------------------------------------------------

describe('isPushEnableAskDue', () => {
  it('is due for a member who has never been asked and has reminders off', () => {
    expect(isPushEnableAskDue(state())).toBe(true);
  });

  it('is never due again once she has been asked, whatever she answered', () => {
    expect(isPushEnableAskDue(state({ promptShownAt: '2026-08-30T12:00:00Z', promptAnswer: 'declined' }))).toBe(false);
    expect(isPushEnableAskDue(state({ promptShownAt: '2026-08-30T12:00:00Z', promptAnswer: 'enabled' }))).toBe(false);
    expect(
      isPushEnableAskDue(state({ promptShownAt: '2026-08-30T12:00:00Z', promptAnswer: 'needs_install' }))
    ).toBe(false);
  });

  it('is not due for a member who already turned reminders on from her profile', () => {
    expect(isPushEnableAskDue(state({ enabled: true }))).toBe(false);
  });

  it('is not due for a member who already has a device saved', () => {
    // She can only have one by having agreed somewhere, so asking would be
    // asking for something she has already given.
    expect(isPushEnableAskDue(state({ liveDeviceCount: 1 }))).toBe(false);
  });

  it('is due again for a member who turned reminders off, only if she was somehow never recorded as asked', () => {
    // Turning the switch off revokes every device, so this is the state a
    // member reaches by using settings without ever meeting the ask.
    expect(isPushEnableAskDue(state({ enabled: false, liveDeviceCount: 0 }))).toBe(true);
    expect(
      isPushEnableAskDue(state({ enabled: false, liveDeviceCount: 0, promptShownAt: '2026-08-30T12:00:00Z' }))
    ).toBe(false);
  });
});

describe('isPushSubscriptionJson', () => {
  const valid = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    keys: { p256dh: 'BK-key', auth: 'auth-secret' },
  };

  it('accepts what a browser actually returns', () => {
    expect(isPushSubscriptionJson(valid)).toBe(true);
    expect(isPushSubscriptionJson({ ...valid, expirationTime: null })).toBe(true);
  });

  it('refuses anything missing a piece a send needs', () => {
    expect(isPushSubscriptionJson({ ...valid, endpoint: '' })).toBe(false);
    expect(isPushSubscriptionJson({ endpoint: valid.endpoint })).toBe(false);
    expect(isPushSubscriptionJson({ ...valid, keys: { p256dh: 'BK-key', auth: '' } })).toBe(false);
    expect(isPushSubscriptionJson({ ...valid, keys: { auth: 'auth-secret' } })).toBe(false);
  });

  it('refuses things that are not objects at all', () => {
    expect(isPushSubscriptionJson(null)).toBe(false);
    expect(isPushSubscriptionJson('https://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(isPushSubscriptionJson(42)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. The words, rendered
// ---------------------------------------------------------------------------

function render(stage: Parameters<typeof PushEnableAskCard>[0]['stage'], error: string | null = null) {
  return renderToStaticMarkup(
    <PushEnableAskCard
      stage={stage}
      busy={false}
      error={error}
      onAccept={() => {}}
      onDecline={() => {}}
      onClose={() => {}}
    />
  );
}

/** HTML entity escaping, so an assertion about a sentence with an apostrophe still matches. */
function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('the ask, as a member reads it', () => {
  it('offers reminders in Root voice, with both ways out on the screen', () => {
    const rendered = text(render('ask'));
    expect(rendered).toContain(PUSH_ASK_COPY.title);
    expect(rendered).toContain('One a day at most');
    expect(rendered).toContain(PUSH_ASK_COPY.accept);
    expect(rendered).toContain(PUSH_ASK_COPY.decline);
    expect(rendered).toContain('From Root');
  });

  it('shows an error in the ask itself rather than swallowing it', () => {
    expect(text(render('ask', 'Something went wrong.'))).toContain('Something went wrong.');
    expect(text(render('ask'))).not.toContain('Something went wrong.');
  });

  it('walks an iPhone member through Add to Home Screen, in order, with no jargon', () => {
    const rendered = text(render('ios_install'));
    expect(rendered).toContain(PUSH_IOS_INSTALL_COPY.title);
    for (const step of PUSH_IOS_INSTALL_COPY.steps) {
      expect(rendered).toContain(step);
    }
    // The step numbers are what make it a walkthrough rather than a list.
    expect(rendered).toMatch(/1[\s\S]*2[\s\S]*3[\s\S]*4/);
    // Words a member of this audience would not recognise.
    expect(rendered.toLowerCase()).not.toContain('pwa');
    expect(rendered.toLowerCase()).not.toContain('install');
    expect(rendered.toLowerCase()).not.toContain('service worker');
    expect(rendered.toLowerCase()).not.toContain('subscription');
    // It never offers a permission button that could not work here.
    expect(rendered).not.toContain(PUSH_ASK_COPY.accept);
  });

  it('says something warm and non-prescriptive after each of the three outcomes', () => {
    expect(text(render('accepted'))).toContain(PUSH_ASK_COPY.accepted);
    expect(text(render('blocked'))).toContain('That is completely fine');
    expect(text(render('declined'))).toContain(PUSH_ASK_COPY.declined);
    // No outcome tells her to go and do something about it.
    for (const stage of ['accepted', 'blocked', 'declined'] as const) {
      expect(text(render(stage)).toLowerCase()).not.toContain('you should');
      expect(text(render(stage)).toLowerCase()).not.toContain('you need to');
    }
  });

  it('carries no em dash on any stage, which the source guard cannot see through a template', () => {
    for (const stage of ['ask', 'ios_install', 'accepted', 'blocked', 'declined'] as const) {
      expect(render(stage)).not.toContain('—');
    }
  });
});

describe('the switch, and the line under it', () => {
  it('says what is happening while it is happening', () => {
    expect(pushSwitchHelperText({ on: false, pending: true, capability: 'ready' })).toBe(
      PUSH_SETTINGS_COPY.turningOn
    );
    expect(pushSwitchHelperText({ on: true, pending: true, capability: 'ready' })).toBe(
      PUSH_SETTINGS_COPY.turningOff
    );
  });

  it('never tells a member whose reminders are working that her browser cannot do this', () => {
    // The real bug this guards: capability is read after mount, so an
    // installed-app member briefly has a null capability and an iPhone
    // member in a tab could have reminders on from another device.
    expect(pushSwitchHelperText({ on: true, pending: false, capability: 'ios_needs_install' })).toBe(
      PUSH_SETTINGS_COPY.on
    );
    expect(pushSwitchHelperText({ on: true, pending: false, capability: 'unsupported' })).toBe(
      PUSH_SETTINGS_COPY.on
    );
  });

  it('tells an iPhone member in a browser tab what to do instead of just saying off', () => {
    expect(pushSwitchHelperText({ on: false, pending: false, capability: 'ios_needs_install' })).toBe(
      PUSH_SETTINGS_COPY.iosNeedsInstall
    );
    expect(pushSwitchHelperText({ on: false, pending: false, capability: 'unsupported' })).toBe(
      PUSH_SETTINGS_COPY.unsupported
    );
    expect(pushSwitchHelperText({ on: false, pending: false, capability: 'ready' })).toBe(
      PUSH_SETTINGS_COPY.off
    );
    expect(pushSwitchHelperText({ on: false, pending: false, capability: null })).toBe(
      PUSH_SETTINGS_COPY.off
    );
  });

  it('carries no em dash in any of its lines', () => {
    for (const line of Object.values(PUSH_SETTINGS_COPY)) {
      expect(line).not.toContain('—');
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Where the ask is allowed to appear
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('the ask appears on exactly one screen', () => {
  const files = [join(ROOT, 'app'), join(ROOT, 'components')].flatMap((d) => walk(d));

  it('is rendered only by the Daily Reset ending screen', () => {
    const renderers = files.filter((file) => {
      if (file.endsWith(join('components', 'push', 'PushEnableAsk.tsx'))) return false;
      return /<PushEnableAsk\s*\/?>/.test(readFileSync(file, 'utf-8'));
    });

    expect(renderers.map((f) => f.slice(ROOT.length + 1))).toEqual([
      join('app', 'checkin', 'result', 'page.tsx'),
    ]);
  });

  it('is never reachable from onboarding, the welcome flow or a login screen', () => {
    const forbidden = files.filter((file) => {
      const relative = file.slice(ROOT.length + 1);
      const inForbiddenTree =
        relative.startsWith(join('app', 'onboarding')) ||
        relative.startsWith(join('app', 'welcome')) ||
        relative.startsWith(join('app', '(auth)')) ||
        relative.startsWith(join('app', 'start')) ||
        relative.startsWith(join('app', 'name'));
      if (!inForbiddenTree) return false;
      return readFileSync(file, 'utf-8').includes('PushEnableAsk');
    });

    expect(forbidden).toEqual([]);
  });

  it('is gated by the shared due rule, not by a second idea of due-ness on the page', () => {
    const page = readFileSync(join(ROOT, 'app', 'checkin', 'result', 'page.tsx'), 'utf-8');
    expect(page).toContain('isPushEnableAskDue');
    // A render never decides anything: the page reads the state and never
    // records that she was asked.
    expect(page).not.toContain('recordPushPromptShown');
    expect(page).not.toContain('recordMyPushPromptShownAction');
  });
});
