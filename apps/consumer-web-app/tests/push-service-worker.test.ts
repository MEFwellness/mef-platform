/**
 * The service worker (public/sw.js), executed for real.
 *
 * It is a plain script rather than a module and it never runs in this
 * app's own page context, so nothing else in the suite would ever touch
 * it. Every one of its behaviours is invisible until a real push arrives
 * on a real phone, which is exactly the kind of code that quietly rots.
 *
 * So this loads the actual file, runs it inside a stand-in for the worker
 * global, and drives the two events it exists for.
 *
 * The three rules being proved:
 *   1. A push ALWAYS shows something. A push that shows no notification
 *      spends the app's delivery allowance and, on iOS, can get push
 *      switched off for the site entirely. Malformed and empty payloads
 *      therefore fall back, they do not return early.
 *   2. A tap opens the path the payload named, and only a path. A payload
 *      is data from the network; an absolute URL in it must never become a
 *      window this app opens.
 *   3. A tap reuses an open window rather than opening a second copy of
 *      the app beside the one already running.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SOURCE = readFileSync(path.resolve(__dirname, '../public/sw.js'), 'utf-8');
const ORIGIN = 'https://app.mefwellness.com';

/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- the worker is handed real ServiceWorker events; this stand-in describes their shape loosely on purpose. */
type Listener = (event: any) => void;

type Harness = {
  listeners: Map<string, Listener>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- NotificationOptions plus the `data` bag the worker puts the path in.
  shown: { title: string; options: any }[];
  openedWindows: string[];
  navigated: string[];
  focused: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WindowClient stand-ins, each with only the members the worker touches.
  windowClients: any[];
  skipWaiting: ReturnType<typeof vi.fn>;
  claim: ReturnType<typeof vi.fn>;
};

function loadWorker(): Harness {
  const harness: Harness = {
    listeners: new Map(),
    shown: [],
    openedWindows: [],
    navigated: [],
    focused: 0,
    windowClients: [],
    skipWaiting: vi.fn(),
    claim: vi.fn(async () => undefined),
  };

  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: Listener) => harness.listeners.set(type, listener),
    skipWaiting: harness.skipWaiting,
    registration: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see the Harness.shown note above.
      showNotification: async (title: string, options: any) => {
        harness.shown.push({ title, options });
      },
    },
    clients: {
      claim: harness.claim,
      matchAll: async () => harness.windowClients,
      openWindow: async (url: string) => {
        harness.openedWindows.push(url);
        return null;
      },
    },
  };

  // eslint-disable-next-line no-new-func
  new Function('self', SOURCE)(self);
  return harness;
}

/** A push event whose data behaves the way the browser's does. */
function pushEvent(data: { json?: () => unknown; text?: () => string } | null) {
  const waits: Promise<unknown>[] = [];
  return {
    data,
    waitUntil: (p: Promise<unknown>) => waits.push(p),
    settle: () => Promise.all(waits),
  };
}

function clickEvent(notificationData: unknown) {
  const waits: Promise<unknown>[] = [];
  const closed = { count: 0 };
  return {
    notification: {
      data: notificationData,
      close: () => {
        closed.count += 1;
      },
    },
    closed,
    waitUntil: (p: Promise<unknown>) => waits.push(p),
    settle: () => Promise.all(waits),
  };
}

let worker: Harness;
beforeEach(() => {
  worker = loadWorker();
});

describe('the worker registers the handlers it exists for', () => {
  it('listens for push and for notificationclick', () => {
    expect([...worker.listeners.keys()].sort()).toEqual([
      'activate',
      'install',
      'notificationclick',
      'push',
    ]);
  });

  it('takes over immediately rather than waiting for every tab to close', () => {
    worker.listeners.get('install')!({});
    expect(worker.skipWaiting).toHaveBeenCalledTimes(1);
  });
});

describe('a push always shows something', () => {
  it('shows exactly what the payload said', async () => {
    const event = pushEvent({
      json: () => ({ title: 'Rooted Reset', body: 'Your Daily Reset is ready.', url: '/checkin', tag: 'daily' }),
    });
    worker.listeners.get('push')!(event);
    await event.settle();

    expect(worker.shown).toHaveLength(1);
    expect(worker.shown[0]!.title).toBe('Rooted Reset');
    expect(worker.shown[0]!.options.body).toBe('Your Daily Reset is ready.');
    expect(worker.shown[0]!.options.tag).toBe('daily');
    expect(worker.shown[0]!.options.data.url).toBe('/checkin');
  });

  it('still shows a notification when the payload is not JSON at all', async () => {
    const event = pushEvent({
      json: () => {
        throw new Error('not json');
      },
      text: () => 'Something is ready for you.',
    });
    worker.listeners.get('push')!(event);
    await event.settle();

    expect(worker.shown).toHaveLength(1);
    expect(worker.shown[0]!.title).toBe('Rooted Reset');
    expect(worker.shown[0]!.options.body).toBe('Something is ready for you.');
  });

  it('still shows a notification when there is no payload at all', async () => {
    const event = pushEvent(null);
    worker.listeners.get('push')!(event);
    await event.settle();

    expect(worker.shown).toHaveLength(1);
    expect(worker.shown[0]!.options.body.length).toBeGreaterThan(0);
  });

  it('refuses a payload url that is not an in-app path', async () => {
    const event = pushEvent({ json: () => ({ url: 'https://example.test/phish' }) });
    worker.listeners.get('push')!(event);
    await event.settle();

    expect(worker.shown[0]!.options.data.url).toBe('/dashboard');
  });
});

describe('tapping a notification', () => {
  it('opens the app at the path the notification carried', async () => {
    const event = clickEvent({ url: '/checkin' });
    worker.listeners.get('notificationclick')!(event);
    await event.settle();

    expect(worker.openedWindows).toEqual([`${ORIGIN}/checkin`]);
    expect(event.closed.count).toBe(1);
  });

  it('moves a window that is already open instead of opening a second one', async () => {
    const navigate = vi.fn(async (url: string) => {
      worker.navigated.push(url);
    });
    const focus = vi.fn(async () => existing);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a WindowClient stand-in with only focus and navigate on it.
    const existing: any = { focus, navigate };
    worker.windowClients = [existing];

    const event = clickEvent({ url: '/today' });
    worker.listeners.get('notificationclick')!(event);
    await event.settle();

    expect(focus).toHaveBeenCalledTimes(1);
    expect(worker.navigated).toEqual([`${ORIGIN}/today`]);
    expect(worker.openedWindows).toEqual([]);
  });

  it('falls back to the Home screen when the notification carries nothing usable', async () => {
    const event = clickEvent({ url: 'https://example.test/phish' });
    worker.listeners.get('notificationclick')!(event);
    await event.settle();

    expect(worker.openedWindows).toEqual([`${ORIGIN}/dashboard`]);
  });

  it('falls back to the Home screen when the notification carries no data at all', async () => {
    const event = clickEvent(undefined);
    worker.listeners.get('notificationclick')!(event);
    await event.settle();

    expect(worker.openedWindows).toEqual([`${ORIGIN}/dashboard`]);
  });
});
