/**
 * The browser's side of the public entry API. One function, so every call
 * site sends the visitor token the same way and swallows a network failure
 * the same way.
 *
 * NOTHING HERE IS ALLOWED TO BREAK THE EXPERIENCE. A visitor answering nine
 * questions must never be stopped by a failed write. Every call resolves,
 * never rejects, and the two calls whose RESULT the screen actually needs
 * (complete and lead) say so by returning null, which those screens handle
 * as their own visible error state.
 */

import type { AcquisitionAttribution, PublicEntryEventType } from '@mef/shared-types-contracts';
import type { EnergyResult, ThreeDayNote } from './result';

const ENDPOINT = '/api/public-entry';

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

export type ArriveResponse = {
  ok: true;
  sourceCode: string | null;
  answers: Record<string, string>;
  completed: boolean;
  leadCaptured: boolean;
};

export function arrive(input: {
  visitorToken: string;
  sourceRaw: string | null;
  landingPath: string | null;
  referrer: string | null;
  /**
   * What the URL carried, read and normalised by the page. Coarse geo is
   * deliberately absent: the route reads that from the headers on this very
   * request, where a caller cannot forge it.
   */
  attribution: AcquisitionAttribution;
}): Promise<ArriveResponse | null> {
  return post<ArriveResponse>({ action: 'arrive', ...input });
}

export function start(visitorToken: string): Promise<unknown> {
  return post({ action: 'start', visitorToken });
}

export function saveAnswers(
  visitorToken: string,
  answers: Record<string, string>,
  chapter?: number
): Promise<unknown> {
  return post({ action: 'answer', visitorToken, answers, ...(chapter ? { chapter } : {}) });
}

/**
 * `signupRef` is the one-time, server-issued reference the create-account
 * button carries into signup. Null whenever it could not be minted, which
 * the screen treats as "no reference to carry" and nothing worse: the
 * button still works and the other two joins are untouched. See
 * lib/public-entry/signupRef.ts.
 */
export function complete(
  visitorToken: string,
  answers: Record<string, string>
): Promise<{ ok: true; result: EnergyResult; signupRef?: string | null } | null> {
  return post<{ ok: true; result: EnergyResult; signupRef?: string | null }>({
    action: 'complete',
    visitorToken,
    answers,
  });
}

export function captureLead(
  visitorToken: string,
  email: string
): Promise<{ ok: true; notes: ThreeDayNote[] } | null> {
  return post<{ ok: true; notes: ThreeDayNote[] }>({ action: 'lead', visitorToken, email });
}

/** The two fire-and-forget funnel signals the result screen sends. Never awaited by anything the visitor is waiting on. */
export function signal(
  visitorToken: string,
  event: Extract<PublicEntryEventType, 'result_engaged' | 'app_clicked'>,
  target?: string
): void {
  void post({
    action: event === 'result_engaged' ? 'engaged' : 'clicked',
    visitorToken,
    ...(target ? { target } : {}),
  });
}
