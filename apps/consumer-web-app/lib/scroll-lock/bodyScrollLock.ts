/**
 * The one body scroll lock, reference counted.
 *
 * WHY THIS IS COUNTED RATHER THAN A PLAIN APPLY/RESTORE PAIR. Every modal
 * in this app pins the page underneath it with `position: fixed` on
 * `<body>` plus a restored scroll offset (`overflow: hidden` alone is not
 * enough on iOS Safari — touchmove still rubber-bands the page behind a
 * fixed overlay). The obvious implementation is "save the current inline
 * styles, apply the lock, put the saved styles back on the way out", one
 * save per caller. That is exactly what this replaced, and it is wrong the
 * moment two callers overlap, which in this app they routinely do:
 *
 *   components/dashboard/RootMessagePopupClient.tsx locks for the whole
 *   pop-up chain, and components/priority/PriorityCardPopup.tsx and
 *   components/weekly-review/WeeklyReviewPopup.tsx — the two members of
 *   that chain that are their own components — each lock again for the
 *   same modal.
 *
 * With per-caller saving, the inner component's effect runs first (React
 * runs child effects before parent effects) and saves the genuinely clean
 * styles. The outer component's effect runs second and saves the styles
 * the inner one just applied — `position: fixed`. On close both cleanups
 * run, child first, so the outer cleanup runs LAST and faithfully restores
 * what it saw: the lock. The pop-up is gone and the page stays pinned, on
 * every screen, until a full reload. That was the "the app cannot be
 * scrolled after logging in" bug.
 *
 * Counting fixes it at the source for every caller at once: the real
 * styles are captured once, on the transition from no locks to one lock,
 * and restored once, on the transition back to none. Order of acquire and
 * release no longer matters, and a modal opened on top of another modal
 * (the sign-out confirmation over the profile sheet, say) is now just a
 * count of two.
 *
 * Deliberately a plain module rather than React state: the lock is a
 * property of the document, which is a single shared thing, and the
 * components that take it out are in different subtrees with no common
 * ancestor short of the root layout.
 */

interface SavedBodyStyles {
  position: string;
  top: string;
  width: string;
  overflow: string;
  scrollY: number;
}

let lockCount = 0;
let saved: SavedBodyStyles | null = null;

/** Takes out one lock. The page is pinned from the first one until the last is released. */
export function acquireBodyScrollLock(): void {
  if (typeof document === 'undefined') return;

  lockCount += 1;
  if (lockCount > 1) return; // already pinned — nothing to save, nothing to apply

  const { body } = document;
  saved = {
    position: body.style.position,
    top: body.style.top,
    width: body.style.width,
    overflow: body.style.overflow,
    scrollY: window.scrollY,
  };

  body.style.position = 'fixed';
  body.style.top = `-${saved.scrollY}px`;
  body.style.width = '100%';
  body.style.overflow = 'hidden';
}

/**
 * Releases one lock. Only the last release restores the page, and it
 * restores it to what was actually there before the first lock — not to
 * whatever an overlapping caller happened to observe.
 */
export function releaseBodyScrollLock(): void {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) return; // never let an unbalanced release go negative

  lockCount -= 1;
  if (lockCount > 0) return; // something else still wants the page pinned

  const previous = saved;
  saved = null;
  if (!previous) return;

  const { body } = document;
  body.style.position = previous.position;
  body.style.top = previous.top;
  body.style.width = previous.width;
  body.style.overflow = previous.overflow;
  window.scrollTo(0, previous.scrollY);
}

/** How many locks are currently held. For tests and diagnostics only. */
export function bodyScrollLockCount(): number {
  return lockCount;
}

/** Drops every lock and restores the page. For tests only. */
export function resetBodyScrollLock(): void {
  if (lockCount === 0) return;
  lockCount = 1;
  releaseBodyScrollLock();
}
