/**
 * The visitor's own copy of what brought them here.
 *
 * WHY THE BROWSER KEEPS A COPY AT ALL, WHEN THE DATABASE IS THE TRUTH. The
 * session row is written on the first arrival and is never overwritten, so
 * attribution already survives a refresh, a back step and the whole nine
 * question walk without any help from here. This exists for the one case
 * the server cannot see: a visitor who opens `/energy/dr-okafor?utm...`,
 * goes off to look at something else, and comes back to a bare `/energy`.
 * The second arrival carries nothing, and without a stash the browser would
 * report an untracked visit for somebody it had already been told about.
 *
 * SESSIONSTORAGE AND NOT LOCALSTORAGE, DELIBERATELY. It lasts exactly as
 * long as the tab, which is the right lifetime for "what this visit
 * carried". A value that outlived the browser session would start
 * re-attributing genuinely new visits to a campaign from last month.
 *
 * IT CANNOT OVERWRITE ANYTHING. Whatever this hands back is sent as an
 * ordinary arrival, and the server's first-touch row is write-once and
 * refuses an update. The worst a corrupted or stale stash can do is produce
 * a last-touch row.
 */

import type { AcquisitionAttribution } from '@mef/shared-types-contracts';

const KEY = 'mef.publicEntry.attribution.v1';

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

/** Stores what this arrival carried, once, so a later bare arrival in the same tab still knows. First write in a tab wins, for the same reason first touch wins. */
export function rememberAttribution(attribution: AcquisitionAttribution): void {
  if (!hasStorage()) return;
  try {
    if (window.sessionStorage.getItem(KEY)) return;
    window.sessionStorage.setItem(KEY, JSON.stringify(attribution));
  } catch {
    // Storage unavailable or full. The database already has the arrival;
    // this was only ever an assist.
  }
}

/** What this tab was told on its first arrival, or null. A corrupt value is treated as absent rather than repaired. */
export function recallAttribution(): AcquisitionAttribution | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<AcquisitionAttribution>;
    // Shape check rather than trust: this value is sent to the server, and
    // the server normalises and length-checks everything it receives, but a
    // stash that is not the right shape is not worth sending at all.
    if (typeof candidate.geo !== 'object' || candidate.geo === null) return null;
    return candidate as AcquisitionAttribution;
  } catch {
    return null;
  }
}
