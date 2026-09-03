/**
 * THE LINK BUILDER.
 *
 * A hand-typed tracking link fails quietly: a missing campaign reads as
 * organic traffic, a capitalised creative becomes a second creative nobody
 * ever adds back to the first, and a typo in a code becomes a partner
 * nobody can find. Every assertion below is about one of those three, and
 * about the property that makes them impossible: the link the builder
 * generates and the values the arrival route reads back off that same link
 * are put through the same normalisers, so a round trip changes nothing.
 */

import { describe, expect, it } from 'vitest';
import {
  buildTrackingUrl,
  linkIdentityKey,
  normalizeLinkDraft,
  suggestSourceCode,
  LINK_PROBLEM_MESSAGE,
  type LinkDraft,
} from '../lib/acquisition/links';
import { readAttributionFromQuery } from '../lib/acquisition/attribution';
import { resolveSourceCode } from '../lib/public-entry/sources';

const ORIGIN = 'https://app.mefwellness.com';

function draft(overrides: Partial<LinkDraft> = {}): LinkDraft {
  return {
    partnerName: 'Ridgeway Physio',
    sourceCode: 'ridgeway-physio',
    medium: 'counter_card',
    campaign: 'autumn_run',
    creative: 'card_a',
    ...overrides,
  };
}

describe('suggesting a code from a name', () => {
  it('turns a partner name into a code somebody could read out over the phone', () => {
    expect(suggestSourceCode('Ridgeway Physio')).toBe('ridgeway-physio');
    expect(suggestSourceCode('Dr. Okafor')).toBe('dr-okafor');
  });

  it('is empty rather than wrong when a name cannot become a code', () => {
    expect(suggestSourceCode('!!!')).toBe('');
    expect(suggestSourceCode('')).toBe('');
  });
});

describe('normalising a draft', () => {
  it('puts every value into the shape the database stores', () => {
    const result = normalizeLinkDraft(
      draft({ sourceCode: 'Ridgeway Physio', medium: 'Counter Card', campaign: 'Autumn Run', creative: 'Card A' })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.link).toEqual({
      sourceCode: 'ridgeway-physio',
      utmSource: 'ridgeway-physio',
      utmMedium: 'counter_card',
      utmCampaign: 'autumn_run',
      utmContent: 'card_a',
      utmTerm: null,
    });
  });

  it('makes utm_source the source code exactly, never a second reading of the name', () => {
    // Two spellings of one partner is the failure this file exists to
    // prevent, and the easiest way to produce one is to normalise the name
    // twice by two different routes.
    const result = normalizeLinkDraft(draft({ partnerName: 'Ridgeway Physiotherapy', sourceCode: 'ridgeway-physio' }));
    expect(result.ok && result.link.utmSource).toBe('ridgeway-physio');
  });

  it('refuses a required value that normalises to nothing', () => {
    // An empty campaign is exactly the row that later reads as organic
    // traffic, so it is reported as missing rather than stored empty.
    expect(normalizeLinkDraft(draft({ campaign: '   ' }))).toEqual({
      ok: false,
      problem: 'campaign_required',
    });
    expect(normalizeLinkDraft(draft({ medium: '!!!' }))).toEqual({
      ok: false,
      problem: 'medium_required',
    });
    expect(normalizeLinkDraft(draft({ sourceCode: '---' }))).toEqual({
      ok: false,
      problem: 'source_code_required',
    });
  });

  it('says what to do about every problem it can report', () => {
    for (const problem of ['source_code_required', 'medium_required', 'campaign_required'] as const) {
      const message = LINK_PROBLEM_MESSAGE[problem];
      expect(message.length).toBeGreaterThan(20);
      expect(message).not.toContain('—');
    }
  });

  it('treats an absent creative as absent, not as an empty one', () => {
    const result = normalizeLinkDraft(draft({ creative: '' }));
    expect(result.ok && result.link.utmContent).toBeNull();
  });
});

describe('the URL', () => {
  it('is built in a fixed order, so the same inputs always produce the same string', () => {
    const first = normalizeLinkDraft(draft());
    const second = normalizeLinkDraft(draft({ campaign: 'Autumn Run', creative: 'CARD A' }));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(buildTrackingUrl(ORIGIN, first.link)).toBe(buildTrackingUrl(ORIGIN, second.link));
  });

  it('carries the code in the path as well as in utm_source', () => {
    const result = normalizeLinkDraft(draft());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(buildTrackingUrl(ORIGIN, result.link)).toBe(
      'https://app.mefwellness.com/energy/ridgeway-physio?utm_source=ridgeway-physio&utm_medium=counter_card&utm_campaign=autumn_run&utm_content=card_a'
    );
  });

  it('omits an absent parameter rather than writing it empty', () => {
    // `utm_content=` is a value, and it reports as a creative of its own.
    const result = normalizeLinkDraft(draft({ creative: '' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(buildTrackingUrl(ORIGIN, result.link)).not.toContain('utm_content');
  });

  it('tolerates a trailing slash on the origin', () => {
    const result = normalizeLinkDraft(draft());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(buildTrackingUrl('https://app.mefwellness.com/', result.link)).toBe(
      buildTrackingUrl('https://app.mefwellness.com', result.link)
    );
  });
});

// ---------------------------------------------------------------------
// The round trip, which is the whole point
// ---------------------------------------------------------------------

describe('a link built here, read back on arrival', () => {
  it('resolves to exactly the values it was built from', () => {
    const built = normalizeLinkDraft(
      draft({ sourceCode: 'Ridgeway Physio', medium: 'Counter Card', campaign: 'Autumn Run', creative: 'Card A' })
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const url = new URL(buildTrackingUrl(ORIGIN, built.link));
    const query = Object.fromEntries(url.searchParams.entries());
    const pathSegment = url.pathname.replace('/energy/', '');

    const sourceCode = resolveSourceCode({ pathSegment, query });
    const read = readAttributionFromQuery({ query, sourceCode, landingPath: url.pathname });

    expect(read.sourceCode).toBe(built.link.sourceCode);
    expect(read.utmSource).toBe(built.link.utmSource);
    expect(read.utmMedium).toBe(built.link.utmMedium);
    expect(read.utmCampaign).toBe(built.link.utmCampaign);
    expect(read.utmContent).toBe(built.link.utmContent);
  });

  it('resolves the path form and the utm_source form to one partner', () => {
    const built = normalizeLinkDraft(draft());
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const url = new URL(buildTrackingUrl(ORIGIN, built.link));
    const query = Object.fromEntries(url.searchParams.entries());
    expect(resolveSourceCode({ pathSegment: url.pathname.replace('/energy/', ''), query })).toBe(
      readAttributionFromQuery({ query, sourceCode: null, landingPath: null }).utmSource
    );
  });

  it('still resolves when only the query survives, which is what a link shortener leaves', () => {
    const built = normalizeLinkDraft(draft());
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const url = new URL(buildTrackingUrl(ORIGIN, built.link));
    const query = Object.fromEntries(url.searchParams.entries());
    expect(resolveSourceCode({ pathSegment: null, query })).toBe('ridgeway-physio');
  });
});

// ---------------------------------------------------------------------
// One partner, one row
// ---------------------------------------------------------------------

describe('the identity of a link', () => {
  it('is the same for two drafts that differ only in how they were typed', () => {
    const a = normalizeLinkDraft(draft({ campaign: 'Autumn Run', creative: 'Card A' }));
    const b = normalizeLinkDraft(draft({ campaign: 'autumn_run', creative: 'card-a' }));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(linkIdentityKey(a.link)).toBe(linkIdentityKey(b.link));
  });

  it('differs when the creative genuinely differs', () => {
    const a = normalizeLinkDraft(draft({ creative: 'card_a' }));
    const b = normalizeLinkDraft(draft({ creative: 'card_b' }));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(linkIdentityKey(a.link)).not.toBe(linkIdentityKey(b.link));
  });

  it('tells an absent creative apart from one called nothing in particular', () => {
    const withNone = normalizeLinkDraft(draft({ creative: '' }));
    const withOne = normalizeLinkDraft(draft({ creative: 'a' }));
    expect(withNone.ok && withOne.ok).toBe(true);
    if (!withNone.ok || !withOne.ok) return;
    expect(linkIdentityKey(withNone.link)).not.toBe(linkIdentityKey(withOne.link));
  });
});
