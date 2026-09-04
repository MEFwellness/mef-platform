/**
 * The browser's side of the Quick Wellness Check API. One function, so
 * every call site sends the visitor token the same way and swallows a
 * network failure the same way.
 *
 * NOTHING HERE IS ALLOWED TO BREAK THE EXPERIENCE. A guest answering seven
 * questions must never be stopped by a failed write. Every call resolves,
 * never rejects, and the screen keeps its own local copy regardless, so a
 * visitor whose writes are all failing still finishes and still reads her
 * result. Mirrors lib/public-entry/client.ts.
 */

const ENDPOINT = '/api/guest-preview';

async function post<T>(payload: Record<string, unknown>): Promise<T | null> {
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export type GuestArriveResponse = {
  ok: boolean;
  answers?: Record<string, string>;
  completed?: boolean;
};

export function arrive(visitorToken: string): Promise<GuestArriveResponse | null> {
  return post<GuestArriveResponse>({ action: 'arrive', visitorToken });
}

export function start(visitorToken: string): void {
  void post({ action: 'start', visitorToken });
}

export function saveAnswers(visitorToken: string, answers: Record<string, string>): void {
  void post({ action: 'answer', visitorToken, answers });
}

export function complete(visitorToken: string, answers: Record<string, string>): void {
  void post({ action: 'complete', visitorToken, answers });
}
