/**
 * ACQUISITION ATTRIBUTION, THE PURE HALF.
 *
 * The one failure attribution really has is that a value typed four
 * different ways becomes four rows, each holding a quarter of the truth,
 * and the report still looks like an answer. Everything below is about the
 * two things that stop that: one normaliser used on the way in and on the
 * way out, and a first touch that nothing can rewrite.
 */

import { describe, expect, it } from 'vitest';
import {
  normalizeClickId,
  normalizeCountry,
  normalizePlaceName,
  normalizeSourceCodeValue,
  normalizeTag,
} from '../lib/acquisition/normalize';
import {
  EMPTY_ATTRIBUTION,
  attributionsDiffer,
  isUntracked,
  readAttributionFromQuery,
  readCampaignParams,
  readClickIds,
} from '../lib/acquisition/attribution';
import { readRequestGeo } from '../lib/acquisition/geo';
import { touchFromSession } from '../lib/acquisition/data';
import type { AcquisitionAttribution, PublicEntrySessionRecord } from '@mef/shared-types-contracts';

// ---------------------------------------------------------------------
// Normalising
// ---------------------------------------------------------------------

describe('one campaign can never become two rows', () => {
  it('folds every spelling of one creative onto one value', () => {
    for (const spelling of ['Card A', 'card_a', 'CARD-A', ' card  a ', 'card.a']) {
      expect(normalizeTag(spelling)).toBe('card_a');
    }
  });

  it('folds every spelling of one partner onto one code', () => {
    for (const spelling of ['Ridgeway Physio', 'ridgeway_physio', 'RIDGEWAY-PHYSIO', 'Ridgeway  Physio']) {
      expect(normalizeSourceCodeValue(spelling)).toBe('ridgeway-physio');
    }
  });

  it('strips accents, so one clinic is not two clinics', () => {
    expect(normalizeSourceCodeValue('Dr Álvarez')).toBe('dr-alvarez');
    expect(normalizeSourceCodeValue('Dr Alvarez')).toBe('dr-alvarez');
    expect(normalizeTag('Été')).toBe('ete');
  });

  it('keeps a value that is already in shape exactly as it is', () => {
    // The one property that matters most: normalising twice must not
    // change anything. A link built here and read back on arrival goes
    // through this function on both journeys.
    for (const value of ['autumn_run', 'card_a', 'counter_card']) {
      expect(normalizeTag(value)).toBe(value);
      expect(normalizeTag(normalizeTag(value))).toBe(value);
    }
    for (const code of ['partner-01', 'dr-okafor', 'qr-card']) {
      expect(normalizeSourceCodeValue(code)).toBe(code);
      expect(normalizeSourceCodeValue(normalizeSourceCodeValue(code))).toBe(code);
    }
  });

  it('refuses anything that cannot be a value at all', () => {
    for (const junk of [null, undefined, '', '   ', '!!!', '___', '---']) {
      expect(normalizeTag(junk)).toBeNull();
      expect(normalizeSourceCodeValue(junk)).toBeNull();
    }
  });

  it('never produces something the database would reject', () => {
    // The same two patterns migration 200's check constraints enforce. A
    // value that got past here and failed there would lose a whole
    // arrival's attribution silently, because the insert is one row.
    const tagPattern = /^[a-z0-9][a-z0-9_]{0,79}$/;
    const codePattern = /^[a-z0-9][a-z0-9-]{0,39}$/;
    const inputs = [
      'Dr. Okafor',
      '  -leading',
      'trailing-  ',
      'a'.repeat(300),
      'ünïcödé',
      '../../etc/passwd',
      "'; drop table public_entry_links; --",
      '<script>alert(1)</script>',
    ];
    for (const input of inputs) {
      const tag = normalizeTag(input);
      if (tag !== null) expect(tag).toMatch(tagPattern);
      const code = normalizeSourceCodeValue(input);
      if (code !== null) expect(code).toMatch(codePattern);
    }
  });

  it('keeps two genuinely different values apart', () => {
    expect(normalizeTag('card_a')).not.toBe(normalizeTag('card_b'));
    expect(normalizeSourceCodeValue('partner-01')).not.toBe(normalizeSourceCodeValue('partner-02'));
  });
});

describe('an ad click id', () => {
  it('is kept exactly as the platform wrote it, case and all', () => {
    // Lowercasing one would destroy it. It is an opaque token that only
    // means anything to the platform that issued it.
    const id = 'IwAR2Xk_9aB.cD-eF';
    expect(normalizeClickId(id)).toBe(id);
  });

  it('drops characters that could not be part of one', () => {
    expect(normalizeClickId('abc<script>')).toBe('abcscript');
    expect(normalizeClickId('  ')).toBeNull();
    expect(normalizeClickId(null)).toBeNull();
  });

  it('never exceeds what the column will take', () => {
    expect(normalizeClickId('a'.repeat(400))!.length).toBe(255);
  });
});

describe('a coarse place name', () => {
  it('decodes what the edge percent-encoded', () => {
    expect(normalizePlaceName('Milton%20Keynes', 80)).toBe('Milton Keynes');
  });

  it('keeps its capitals, because a place is a name and not a slug', () => {
    expect(normalizePlaceName('Croydon', 80)).toBe('Croydon');
  });

  it('survives a header that is not valid percent-encoding', () => {
    expect(normalizePlaceName('100%', 80)).toBe('100%');
  });

  it('takes a two letter country and nothing else', () => {
    expect(normalizeCountry('gb')).toBe('GB');
    expect(normalizeCountry('GBR')).toBeNull();
    expect(normalizeCountry('United Kingdom')).toBeNull();
    expect(normalizeCountry(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------
// Reading a link
// ---------------------------------------------------------------------

describe('reading attribution off an inbound link', () => {
  it('reads all five campaign parameters', () => {
    expect(
      readCampaignParams({
        utm_source: 'dr-okafor',
        utm_medium: 'Counter Card',
        utm_campaign: 'Autumn Run',
        utm_content: 'Card A',
        utm_term: 'tired',
      })
    ).toEqual({
      utmSource: 'dr-okafor',
      utmMedium: 'counter_card',
      utmCampaign: 'autumn_run',
      utmContent: 'card_a',
      utmTerm: 'tired',
    });
  });

  it('normalises utm_source the way a source code is normalised, not the way a tag is', () => {
    // This is the whole reason there are two shapes. `/energy/dr-okafor`
    // and `?utm_source=dr_okafor` have to resolve to ONE partner.
    expect(readCampaignParams({ utm_source: 'dr_okafor' }).utmSource).toBe('dr-okafor');
    expect(normalizeSourceCodeValue('dr-okafor')).toBe('dr-okafor');
  });

  it('reads the three ad click ids and nothing else', () => {
    expect(readClickIds({ fbclid: 'FB123', ttclid: 'TT456', gclid: 'GC789' })).toEqual({
      fbclid: 'FB123',
      ttclid: 'TT456',
      gclid: 'GC789',
    });
    expect(readClickIds({})).toEqual({ fbclid: null, ttclid: null, gclid: null });
  });

  it('takes the first value when a parameter is repeated', () => {
    expect(readCampaignParams({ utm_campaign: ['autumn_run', 'spring_run'] }).utmCampaign).toBe(
      'autumn_run'
    );
  });

  it('builds the whole set from a real link', () => {
    const attribution = readAttributionFromQuery({
      query: {
        utm_source: 'dr-okafor',
        utm_medium: 'counter_card',
        utm_campaign: 'autumn_run',
        utm_content: 'card_a',
        fbclid: 'FB123',
      },
      sourceCode: 'dr-okafor',
      landingPath: '/energy/dr-okafor',
    });
    expect(attribution.sourceCode).toBe('dr-okafor');
    expect(attribution.utmCampaign).toBe('autumn_run');
    expect(attribution.fbclid).toBe('FB123');
    expect(attribution.landingPath).toBe('/energy/dr-okafor');
    expect(isUntracked(attribution)).toBe(false);
  });

  it('carries no field an answer, a pattern or an email could be written into', () => {
    // The privacy line, asserted on the shape itself rather than on a
    // habit. If somebody adds one, this fails.
    const attribution = readAttributionFromQuery({
      query: { utm_campaign: 'autumn_run', email: 'her@example.test', answer: 'poor_sleep' },
      sourceCode: null,
      landingPath: '/energy',
    });
    expect(Object.keys(attribution).sort()).toEqual(
      [
        'fbclid',
        'gclid',
        'geo',
        'landingPath',
        'referrerHost',
        'sourceCode',
        'sourceRaw',
        'ttclid',
        'utmCampaign',
        'utmContent',
        'utmMedium',
        'utmSource',
        'utmTerm',
      ].sort()
    );
    expect(JSON.stringify(attribution)).not.toContain('her@example.test');
    expect(JSON.stringify(attribution)).not.toContain('poor_sleep');
  });
});

describe('an arrival that carried nothing', () => {
  it('is untracked, and being untracked is a real and ordinary thing', () => {
    const bare = readAttributionFromQuery({ query: {}, sourceCode: null, landingPath: '/energy' });
    expect(isUntracked(bare)).toBe(true);
    // It still records where she landed. An untracked arrival is still an
    // arrival.
    expect(bare.landingPath).toBe('/energy');
  });

  it('is not made tracked by a landing path, a referrer or a place', () => {
    // If these counted, "untracked" would be a category with no members
    // and the number would mean nothing.
    const attribution: AcquisitionAttribution = {
      ...EMPTY_ATTRIBUTION,
      landingPath: '/energy',
      referrerHost: 'www.instagram.com',
      geo: { country: 'GB', region: 'ENG', city: 'Croydon' },
    };
    expect(isUntracked(attribution)).toBe(true);
  });
});

// ---------------------------------------------------------------------
// First touch
// ---------------------------------------------------------------------

describe('telling a second visit from the first', () => {
  const first: AcquisitionAttribution = {
    ...EMPTY_ATTRIBUTION,
    sourceCode: 'dr-okafor',
    utmCampaign: 'autumn_run',
  };

  it('sees no difference when she simply comes back on the same link', () => {
    expect(attributionsDiffer(first, { ...first })).toBe(false);
  });

  it('sees no difference when only the referrer or the place changed', () => {
    // Coming back from a different page, or from the next town, is not a
    // second campaign. Counting it as one would write a last-touch row on
    // almost every refresh.
    expect(
      attributionsDiffer(first, {
        ...first,
        referrerHost: 'l.instagram.com',
        geo: { country: 'GB', region: 'ENG', city: 'Sutton' },
      })
    ).toBe(false);
  });

  it('sees a difference when she comes back through a different source', () => {
    expect(attributionsDiffer(first, { ...first, sourceCode: 'ig' })).toBe(true);
  });

  it('sees a difference when she comes back on a different campaign', () => {
    expect(attributionsDiffer(first, { ...first, utmCampaign: 'spring_run' })).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Coarse geo
// ---------------------------------------------------------------------

describe('coarse request geo', () => {
  function headers(map: Record<string, string>) {
    return { get: (name: string) => map[name.toLowerCase()] ?? null };
  }

  it('reads country, region and city from the edge', () => {
    expect(
      readRequestGeo(
        headers({
          'x-vercel-ip-country': 'GB',
          'x-vercel-ip-country-region': 'ENG',
          'x-vercel-ip-city': 'Milton%20Keynes',
        })
      )
    ).toEqual({ country: 'GB', region: 'ENG', city: 'Milton Keynes' });
  });

  it('is all nulls where the headers do not exist, which is every local machine', () => {
    expect(readRequestGeo(headers({}))).toEqual({ country: null, region: null, city: null });
    expect(readRequestGeo(null)).toEqual({ country: null, region: null, city: null });
  });

  it('never reads a precise location, and there is no column for one', () => {
    // Vercel offers latitude and longitude on the same request. They are
    // deliberately not read, and this fails the build if that changes.
    const source = require('node:fs').readFileSync(
      require('node:path').resolve(__dirname, '../lib/acquisition/geo.ts'),
      'utf-8'
    ) as string;
    const code = source.slice(source.indexOf('export function readRequestGeo'));
    expect(code).not.toMatch(/latitude|longitude|x-vercel-ip-latitude|x-vercel-ip-longitude/i);
  });
});

// ---------------------------------------------------------------------
// The fallback for an arrival that predates all of this
// ---------------------------------------------------------------------

describe('an arrival with no attribution row of its own', () => {
  const session: PublicEntrySessionRecord = {
    id: 'session-1',
    visitorToken: 'token-000000001',
    experienceKey: 'energy_map',
    sourceCode: 'partner-01',
    sourceRaw: 'partner-01',
    landingPath: '/energy/partner-01',
    referrerHost: 'www.instagram.com',
    firstSeenAt: '2026-08-31T10:00:00.000Z',
    startedAt: '2026-08-31T10:00:30.000Z',
    completedAt: '2026-08-31T10:02:00.000Z',
    patternKey: 'wind_down_deficit',
    leadEmail: 'her@example.test',
    leadCapturedAt: '2026-08-31T10:03:00.000Z',
    capturedLeadId: 'lead-1',
  };

  it('says everything the session honestly knows', () => {
    const touch = touchFromSession(session);
    expect(touch.sourceCode).toBe('partner-01');
    expect(touch.landingPath).toBe('/energy/partner-01');
    expect(touch.referrerHost).toBe('www.instagram.com');
    expect(touch.landedAt).toBe('2026-08-31T10:00:00.000Z');
  });

  it('invents no campaign that was never on a link', () => {
    const touch = touchFromSession(session);
    expect(touch.utmSource).toBeNull();
    expect(touch.utmMedium).toBeNull();
    expect(touch.utmCampaign).toBeNull();
    expect(touch.utmContent).toBeNull();
    expect(touch.fbclid).toBeNull();
  });

  it('carries no answer, no pattern and no email out of the session it was built from', () => {
    const touch = touchFromSession(session);
    const serialised = JSON.stringify(touch);
    expect(serialised).not.toContain('wind_down_deficit');
    expect(serialised).not.toContain('her@example.test');
    expect(serialised).not.toContain('lead-1');
  });
});
