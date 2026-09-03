/**
 * Reading the acquisition report.
 *
 * ONE VIEW, ONE WINDOW, ONE TEST RULE. Everything below reads
 * `acquisition_report_rows` (migration 201), which has already resolved
 * each subject's attribution, its partner's physical place, its account,
 * its paid conversion and its is_test flag. Nothing recomputes any of them,
 * so a number on this screen and a number somebody types into SQL cannot
 * disagree.
 *
 * DETERMINISTIC ONLY. Every figure this returns is a count of rows that
 * satisfy a stated condition. There is no model, no inference, no generated
 * commentary and no number without a query behind it.
 *
 * WHAT IT WILL NEVER SELECT. An answer, a pattern key, an email address or
 * a member's name. The view does not expose the first two at all, and the
 * last two are not columns on any acquisition table. A funnel screen is not
 * a place to read what strangers said about their sleep.
 *
 * THE TEST FILTER IS SETTLED IN THE VIEW, NOT HERE. A subject is test
 * traffic when the SOURCE is one of ours or when the account is a test
 * account, and the view settles both from the same rule every other staff
 * surface uses. This reader always fetches both and separates them in one
 * place, so the screen can print how many it hid rather than silently
 * dropping them.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AcquisitionGroupBy, AcquisitionSubjectRow, KnownGroup } from './report';

const ROW_COLUMNS = [
  'row_kind',
  'session_id',
  'member_id',
  'source_code',
  'source_raw',
  'source_channel',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'had_ad_click',
  'geo_country',
  'geo_region',
  'geo_city',
  'partner_name',
  'location_name',
  'location_city',
  'location_region',
  'location_country',
  'is_test',
  'anchor_at',
  'landed_at',
  'started_at',
  'completed_at',
  'lead_captured_at',
  'account_created_at',
  'paid_at',
].join(', ');

/** The window as the database sees it: a calendar day pair becomes a half-open instant range, so nothing on the last day is lost and nothing on the day after is counted. */
export function windowBounds(start: string, end: string): { fromIso: string; toIso: string } {
  const to = new Date(`${end}T00:00:00.000Z`);
  to.setUTCDate(to.getUTCDate() + 1);
  return { fromIso: `${start}T00:00:00.000Z`, toIso: to.toISOString() };
}

function toRow(raw: Record<string, unknown>): AcquisitionSubjectRow {
  const text = (key: string): string | null => (raw[key] as string | null) ?? null;
  return {
    rowKind: raw.row_kind === 'account' ? 'account' : 'visit',
    sessionId: text('session_id'),
    memberId: text('member_id'),
    sourceCode: text('source_code'),
    sourceRaw: text('source_raw'),
    sourceChannel: text('source_channel'),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    utmContent: text('utm_content'),
    utmTerm: text('utm_term'),
    hadAdClick: Boolean(raw.had_ad_click),
    geoCountry: text('geo_country'),
    geoRegion: text('geo_region'),
    geoCity: text('geo_city'),
    partnerName: text('partner_name'),
    locationName: text('location_name'),
    locationCity: text('location_city'),
    locationRegion: text('location_region'),
    locationCountry: text('location_country'),
    isTest: Boolean(raw.is_test),
    anchorAt: text('anchor_at') ?? '',
    landedAt: text('landed_at'),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    leadCapturedAt: text('lead_captured_at'),
    accountCreatedAt: text('account_created_at'),
    paidAt: text('paid_at'),
  };
}

export interface AcquisitionReadResult {
  rows: AcquisitionSubjectRow[];
  hiddenTestCount: number;
  /** Set when a query failed, so the screen says so instead of printing zeros that look like an absence of activity. */
  error: string | null;
}

/**
 * Every subject anchored inside the window.
 *
 * Both the real and the test rows are fetched and separated here, in one
 * place, so no screen has to remember the rule and every screen can say how
 * many it hid. Ordered by the anchor so a page of rows is stable.
 */
export async function readAcquisitionRows(
  supabase: SupabaseClient,
  options: { start: string; end: string; includeTest: boolean }
): Promise<AcquisitionReadResult> {
  const { fromIso, toIso } = windowBounds(options.start, options.end);

  const { data, error } = await supabase
    .from('acquisition_report_rows')
    .select(ROW_COLUMNS)
    .gte('anchor_at', fromIso)
    .lt('anchor_at', toIso)
    .order('anchor_at', { ascending: false });

  if (error) {
    console.error('readAcquisitionRows failed', error);
    return {
      rows: [],
      hiddenTestCount: 0,
      error: 'The acquisition rows could not be read, so nothing below is a real count.',
    };
  }

  const all = ((data ?? []) as unknown[]).map((raw) => toRow(raw as Record<string, unknown>));
  const real = all.filter((row) => !row.isTest);
  return {
    rows: options.includeTest ? all : real,
    hiddenTestCount: options.includeTest ? 0 : all.length - real.length,
    error: null,
  };
}

type SourceRow = {
  code: string;
  label: string;
  channel: string;
  is_test: boolean;
  active: boolean;
  partner_name: string | null;
  location_name: string | null;
  location_city: string | null;
  location_region: string | null;
  location_country: string | null;
};

type LinkRow = {
  source_code: string;
  utm_campaign: string;
  utm_content: string | null;
  active: boolean;
};

/**
 * Every group that must appear on the report whether or not anybody arrived
 * on it.
 *
 * WHY THIS EXISTS AT ALL. A partner card that produced nothing is the most
 * useful thing this screen can say, and it can only say it by printing the
 * row. A report that lists only what happened cannot tell "this card is not
 * working" apart from "this card does not exist".
 *
 * A RETIRED CODE STILL GETS ITS ROW. Its printed cards and QR codes are
 * still out there and still resolve, so it keeps its row and is marked
 * rather than dropped.
 */
export async function readKnownGroups(
  supabase: SupabaseClient,
  options: { includeTest: boolean }
): Promise<Record<AcquisitionGroupBy, KnownGroup[]>> {
  const [sourcesResult, linksResult] = await Promise.all([
    supabase
      .from('public_entry_sources')
      .select(
        'code, label, channel, is_test, active, partner_name, location_name, location_city, location_region, location_country'
      )
      .order('code'),
    supabase
      .from('public_entry_links')
      .select('source_code, utm_campaign, utm_content, active')
      .order('utm_campaign'),
  ]);

  if (sourcesResult.error) console.error('readKnownGroups sources failed', sourcesResult.error);
  if (linksResult.error) console.error('readKnownGroups links failed', linksResult.error);

  const allSources = (sourcesResult.data ?? []) as SourceRow[];
  const sources = options.includeTest ? allSources : allSources.filter((s) => !s.is_test);
  const testCodes = new Set(allSources.filter((s) => s.is_test).map((s) => s.code));
  const allLinks = (linksResult.data ?? []) as LinkRow[];
  const links = options.includeTest
    ? allLinks
    : allLinks.filter((link) => !testCodes.has(link.source_code));

  const uniqueBy = (groups: KnownGroup[]): KnownGroup[] => {
    const seen = new Map<string, KnownGroup>();
    for (const group of groups) if (!seen.has(group.key)) seen.set(group.key, group);
    return [...seen.values()];
  };

  const place = (parts: (string | null)[]): string | null => {
    const stated = parts.filter((p): p is string => typeof p === 'string' && p.length > 0);
    return stated.length > 0 ? stated.join(', ') : null;
  };

  return {
    source: sources.map((source) => ({
      key: source.code,
      label: source.label,
      detail: source.channel,
      retired: !source.active,
    })),
    campaign: uniqueBy(
      links.map((link) => ({
        key: link.utm_campaign,
        label: link.utm_campaign,
        detail: null,
        retired: false,
      }))
    ),
    creative: uniqueBy(
      links
        .filter((link): link is LinkRow & { utm_content: string } => Boolean(link.utm_content))
        .map((link) => ({
          key: link.utm_content,
          label: link.utm_content,
          detail: null,
          retired: false,
        }))
    ),
    location: uniqueBy(
      sources
        .map((source) => ({
          source,
          key: place([
            source.location_name,
            source.location_city,
            source.location_region,
            source.location_country,
          ]),
        }))
        .filter((entry): entry is { source: SourceRow; key: string } => entry.key !== null)
        .map((entry) => ({
          key: entry.key,
          label: entry.key,
          detail: entry.source.partner_name ?? entry.source.label,
          retired: !entry.source.active,
        }))
    ),
    // Nothing to enumerate: a place a request came from exists only once a
    // request has come from it. Padding this with a guess would be
    // inventing coverage.
    geo: [],
  };
}
