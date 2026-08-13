/**
 * How a Root pop-up answer leaves the browser.
 *
 * One `fetch` with `keepalive`, to app/api/popup-response/route.ts, which
 * runs the same server actions this used to call directly. See that file
 * for the whole reason: a server-action call is the router's, so it is
 * cancelled by a navigation and by leaving the page, and its response is a
 * re-render of the entire page rather than a few bytes of JSON. A member
 * who tapped an answer and then tapped a nav link half a second later
 * genuinely lost the write.
 *
 * `keepalive` is what makes "she can leave immediately" and "the answer
 * still lands" both true. The bodies here are a few dozen bytes, far
 * inside the 64KB the specification allows for a keepalive request.
 *
 * Returns whether the write landed. Never throws — the caller
 * (lib/client/optimisticWrite.ts) decides what a false means, and for
 * every one of these it means retry.
 */

export type PopupResponse =
  | { kind: 'priority_done' }
  | { kind: 'priority_save' }
  | { kind: 'priority_help' }
  | { kind: 'weekly_review_acknowledge' }
  | { kind: 'weekly_review_answer'; questionKey: string; option: string };

export async function deliverPopupResponse(response: PopupResponse): Promise<boolean> {
  try {
    const result = await fetch('/api/popup-response', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(response),
      keepalive: true,
    });
    if (!result.ok) return false;
    const parsed: unknown = await result.json();
    return (parsed as { ok?: unknown } | null)?.ok === true;
  } catch {
    return false;
  }
}
