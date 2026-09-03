/**
 * Building a tracking link, so nobody ever types one.
 *
 * WHY THIS EXISTS. A hand-typed link is where attribution goes wrong, and
 * it goes wrong silently: a missing `utm_campaign` produces a row that
 * looks like organic traffic, a capitalised `Card A` produces a second
 * creative that will never be added back to the first, and a partner code
 * with a typo in it produces a partner nobody can find. The link builder
 * generates every link from one form and stores the exact string it
 * generated, so what is on a card and what is in the database are the same
 * characters.
 *
 * THE SHAPE OF EVERY LINK.
 *
 *     https://app.mefwellness.com/energy/dr-okafor
 *       ?utm_source=dr-okafor
 *       &utm_medium=counter_card
 *       &utm_campaign=autumn_run
 *       &utm_content=card_a
 *
 * The code is in the PATH as well as in `utm_source`, deliberately and
 * redundantly. The path is the form that survives being read aloud, printed
 * on a card and typed by hand; the query is the form an ad platform or a
 * link shortener understands. Both resolve through
 * lib/public-entry/sources.ts's `resolveSourceCode`, the printed form wins
 * when they disagree, and they are normalised the same way so they cannot.
 *
 * NOTHING HERE TOUCHES THE DATABASE. It is pure string work, which is what
 * lets the admin screen show a live preview of the link as it is typed and
 * lets a test assert that the same inputs always produce the same URL.
 */

import { normalizeSourceCodeValue, normalizeTag } from './normalize';

/** What a human types into the builder, before anything is normalised. */
export interface LinkDraft {
  /** The partner or channel, as a human names them. "Ridgeway Physio". */
  partnerName: string;
  /** The code that will appear in the link. Suggested from the name, editable, permanent once handed out. */
  sourceCode: string;
  /** How the link is being handed out. "counter card", "instagram bio". */
  medium: string;
  campaign: string;
  /** The creative or ad label, when there is one. "card a", "story 2". */
  creative?: string;
  /** The keyword or search term, when there is one. Almost always empty. */
  term?: string;
}

/** The same draft, with every value in the exact shape the database will store. */
export interface NormalizedLink {
  sourceCode: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string | null;
  utmTerm: string | null;
}

export type LinkProblem =
  | 'source_code_required'
  | 'medium_required'
  | 'campaign_required';

/**
 * A code suggested from a partner's name. Only a suggestion: the builder
 * shows it, the administrator may replace it, and once a link has been
 * handed out the code is permanent because a printed card cannot be edited.
 */
export function suggestSourceCode(partnerName: string): string {
  return normalizeSourceCodeValue(partnerName) ?? '';
}

/**
 * Normalises a draft, or says which required value could not be made into
 * one. A required field that normalises to nothing ("!!!", "   ") is
 * reported as missing rather than stored as an empty string, because an
 * empty campaign is exactly the row that later reads as organic traffic.
 */
export function normalizeLinkDraft(
  draft: LinkDraft
): { ok: true; link: NormalizedLink } | { ok: false; problem: LinkProblem } {
  const sourceCode = normalizeSourceCodeValue(draft.sourceCode);
  if (!sourceCode) return { ok: false, problem: 'source_code_required' };

  const utmMedium = normalizeTag(draft.medium);
  if (!utmMedium) return { ok: false, problem: 'medium_required' };

  const utmCampaign = normalizeTag(draft.campaign);
  if (!utmCampaign) return { ok: false, problem: 'campaign_required' };

  return {
    ok: true,
    link: {
      sourceCode,
      // The source code, exactly, and never a second normalisation of the
      // partner's name. Two spellings of one partner is the failure this
      // whole file exists to prevent.
      utmSource: sourceCode,
      utmMedium,
      utmCampaign,
      utmContent: normalizeTag(draft.creative ?? null),
      utmTerm: normalizeTag(draft.term ?? null),
    },
  };
}

/**
 * The URL, built in a fixed parameter order so the same inputs always
 * produce the same string, byte for byte. An optional parameter that is
 * absent is omitted rather than written empty: `utm_content=` is a value
 * that reports as its own creative.
 */
export function buildTrackingUrl(origin: string, link: NormalizedLink): string {
  const base = `${origin.replace(/\/+$/, '')}/energy/${link.sourceCode}`;
  const params: [string, string][] = [
    ['utm_source', link.utmSource],
    ['utm_medium', link.utmMedium],
    ['utm_campaign', link.utmCampaign],
  ];
  if (link.utmContent) params.push(['utm_content', link.utmContent]);
  if (link.utmTerm) params.push(['utm_term', link.utmTerm]);
  return `${base}?${params.map(([k, v]) => `${k}=${v}`).join('&')}`;
}

/**
 * The identity of a link, matching the unique index migration 200 puts on
 * `public_entry_links`. Two drafts with this key are the same link however
 * differently they were typed, which is what stops one partner becoming two
 * rows in a report.
 */
export function linkIdentityKey(link: NormalizedLink): string {
  return [link.sourceCode, link.utmMedium, link.utmCampaign, link.utmContent ?? '', link.utmTerm ?? ''].join('|');
}

/** The problems, said in words an administrator can act on. */
export const LINK_PROBLEM_MESSAGE: Record<LinkProblem, string> = {
  source_code_required:
    'The link code cannot be empty. Use letters, numbers and hyphens, for example ridgeway-physio.',
  medium_required: 'Say how this link is being handed out, for example counter card or instagram bio.',
  campaign_required: 'Give this link a campaign name, for example autumn_run.',
};

/**
 * The physical place a source code stands for, as a human typed it, keeping
 * ONLY the fields that were actually stated.
 *
 * A BLANK FIELD MEANS "NOT STATED HERE", NOT "ERASE IT". Found by the live
 * run on 2026-09-03: building a second link for a partner who already had
 * one wiped that partner's recorded place, because the form resets after a
 * save and the blank fields were written straight over the location.
 * Silently erasing where a partner physically is, is worse than the drift
 * the link builder exists to prevent. Clearing a location is deliberately
 * not something this form can do by omission.
 */
export function statedPlaceFields(
  place: Record<string, string | null | undefined>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(place).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0
    )
  );
}

/**
 * The origin every generated link is built on.
 *
 * NEXT_PUBLIC_SITE_URL and not the request's own host, deliberately: a link
 * built while looking at a preview deployment would otherwise be printed on
 * a card pointing at a preview URL that stops existing. The fallback is the
 * production domain, which is a better wrong answer than a relative link
 * nobody can paste.
 *
 * It is a NEXT_PUBLIC_ variable, so the same call returns the same string
 * in the server action that stores the URL and in the browser that previews
 * it. One function, one answer, no chance of a preview that disagrees with
 * what was saved.
 */
export function trackingLinkOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.mefwellness.com').replace(/\/+$/, '');
}
