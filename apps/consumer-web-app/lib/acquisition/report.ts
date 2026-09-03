/**
 * The acquisition report's arithmetic. Pure: no Supabase client, no React,
 * no I/O, so every rule about what a number means is testable without a
 * database and cannot drift between the screen and the query.
 *
 * WHAT THE REPORT COUNTS. Six stages, in the order somebody moves through
 * them: a visit, an assessment start, a completion, an email lead, an
 * account, a paid conversion. Every one of them is a timestamp on a row in
 * `acquisition_report_rows` (migration 201). Nothing here estimates,
 * models, infers or describes. If a number is on the screen, a row in the
 * database has a value in a column that produced it.
 *
 * EVERY COLUMN FOLLOWS THE SAME PEOPLE. The window being looked at selects
 * the ARRIVALS that landed inside it, and then every later column counts
 * what those same arrivals went on to do, whenever they did it. That is the
 * only reading under which a stage to stage conversion rate means anything:
 * counting each stage by its own date would let a rate exceed a hundred per
 * cent whenever last month's arrivals paid this month. An account with no
 * arrival at all has no landing time, so it is placed by the day the
 * account was created, and it can only ever reach the last two columns.
 *
 * THREE KINDS OF ROW, AND THEY ARE NOT THE SAME KIND OF EMPTY.
 *
 *   A named group      a source code, a campaign, a creative, a partner's
 *                      physical location, a coarse place.
 *   Not set            the arrival IS tracked, but carried nothing for this
 *                      particular dimension. A printed QR card has a source
 *                      and no creative, and calling that untracked would be
 *                      a lie about the card.
 *   Untracked          the arrival carried nothing identifying at all, or
 *                      the account never came through the public entry
 *                      experience. It is always present, including at zero,
 *                      because a report whose rows only add up to the part
 *                      that was tracked is worse than no report.
 *
 * ZERO IS A RESULT AND IS PRINTED. Every source code the link builder knows
 * about appears, and every campaign and creative any link was ever built
 * for appears, whether or not anybody arrived on it. A card that is
 * producing nothing is the single most useful thing this screen can say, and
 * it can only say it by printing the row.
 *
 * A RATE WITH NO DENOMINATOR IS NULL AND IS PRINTED AS NOTHING. Never zero
 * per cent, which reads as "nobody converted" when the truth is "nobody
 * reached this stage yet".
 */

/** The dimensions a report can be grouped by. Each one answers a different question and none of them is derived from another. */
export type AcquisitionGroupBy = 'source' | 'campaign' | 'creative' | 'location' | 'geo';

export const ACQUISITION_GROUP_BY: AcquisitionGroupBy[] = [
  'source',
  'campaign',
  'creative',
  'location',
  'geo',
];

export const GROUP_BY_LABEL: Record<AcquisitionGroupBy, string> = {
  source: 'Source',
  campaign: 'Campaign',
  creative: 'Creative',
  location: 'Partner location',
  geo: 'Where the click came from',
};

/** What each grouping is actually asking, said once so the screen and a test read the same sentence. */
export const GROUP_BY_DEFINITION: Record<AcquisitionGroupBy, string> = {
  source:
    'The individual partner, client or channel whose code was on the link. This is the question the whole experiment is for.',
  campaign: 'The campaign name the link carried, as built in the link builder.',
  creative: 'The creative or ad the link carried, for example one card among several.',
  location:
    'The physical place a source code stands for, typed into the link builder by a person. A clinic counter is a location and no request header will ever say so.',
  geo: 'Where the request appeared to come from, no finer than a city. Never confused with a partner location.',
};

export const UNTRACKED_KEY = '__untracked__';
export const NOT_SET_KEY = '__not_set__';

/** One row of `acquisition_report_rows`, in the shape the reader hands over. Behavioural only: there is no answer and no pattern key here. */
export interface AcquisitionSubjectRow {
  rowKind: 'visit' | 'account';
  sessionId: string | null;
  memberId: string | null;
  sourceCode: string | null;
  sourceRaw: string | null;
  sourceChannel: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  hadAdClick: boolean;
  geoCountry: string | null;
  geoRegion: string | null;
  geoCity: string | null;
  partnerName: string | null;
  locationName: string | null;
  locationCity: string | null;
  locationRegion: string | null;
  locationCountry: string | null;
  isTest: boolean;
  anchorAt: string;
  landedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  leadCapturedAt: string | null;
  accountCreatedAt: string | null;
  paidAt: string | null;
}

/** A group the report must print even when nothing arrived on it. */
export interface KnownGroup {
  key: string;
  label: string;
  detail: string | null;
  /** A code that is no longer being handed out. Its printed cards still work, so it keeps its row and says so. */
  retired?: boolean;
}

export interface FunnelCounts {
  visits: number;
  starts: number;
  completions: number;
  leads: number;
  accounts: number;
  paid: number;
}

export interface AcquisitionGroupRow extends FunnelCounts {
  key: string;
  label: string;
  detail: string | null;
  kind: 'named' | 'not_set' | 'untracked';
  retired: boolean;
}

export const FUNNEL_STAGES = [
  { key: 'visits', label: 'Visits', from: null },
  { key: 'starts', label: 'Started', from: 'visits' },
  { key: 'completions', label: 'Finished', from: 'starts' },
  { key: 'leads', label: 'Email leads', from: 'completions' },
  { key: 'accounts', label: 'Accounts', from: 'leads' },
  { key: 'paid', label: 'Paid', from: 'accounts' },
] as const satisfies readonly {
  key: keyof FunnelCounts;
  label: string;
  from: keyof FunnelCounts | null;
}[];

/** What each column counts, in plain language, said once. */
export const STAGE_DEFINITION: Record<keyof FunnelCounts, string> = {
  visits: 'Arrivals at the public entry experience that landed inside this window.',
  starts: 'Of those arrivals, the ones that reached the first question.',
  completions: 'Of those arrivals, the ones that produced a result.',
  leads: 'Of those arrivals, the ones that left an email address.',
  accounts: 'Of those arrivals, the ones that became an account.',
  paid:
    'Of those accounts, the ones that moved to a paid plan. A purchase event counts the day anything starts emitting one.',
};

const EMPTY: FunnelCounts = {
  visits: 0,
  starts: 0,
  completions: 0,
  leads: 0,
  accounts: 0,
  paid: 0,
};

/**
 * Whether this row carried nothing at all that identifies where it came
 * from.
 *
 * MIRRORS `TRACKING_KEYS` IN attribution.ts, and it has to, because that is
 * the definition the collection half writes by. The landing path, the
 * referring host and the geo are deliberately not among them: every arrival
 * has those, including somebody who typed the address in, and counting them
 * would leave "untracked" a category with no members. The three ad click
 * ids arrive here already collapsed into one boolean, because the ids
 * themselves are opaque and are never shown to anybody.
 */
export function isUntrackedRow(row: AcquisitionSubjectRow): boolean {
  return (
    row.sourceCode === null &&
    row.sourceRaw === null &&
    row.utmSource === null &&
    row.utmMedium === null &&
    row.utmCampaign === null &&
    row.utmContent === null &&
    row.utmTerm === null &&
    !row.hadAdClick
  );
}

function placeKey(parts: (string | null)[]): string | null {
  const stated = parts.filter((part): part is string => typeof part === 'string' && part.length > 0);
  return stated.length > 0 ? stated.join(', ') : null;
}

/** The value of one dimension for one row, or null when the row says nothing about it. */
export function groupValueOf(row: AcquisitionSubjectRow, groupBy: AcquisitionGroupBy): string | null {
  switch (groupBy) {
    case 'source':
      // The resolved code first, then what an unregistered link literally
      // said, then utm_source. An invented code stays its own row so it can
      // be investigated, instead of quietly inflating direct traffic.
      return row.sourceCode ?? row.sourceRaw ?? row.utmSource ?? null;
    case 'campaign':
      return row.utmCampaign;
    case 'creative':
      return row.utmContent;
    case 'location':
      return placeKey([row.locationName, row.locationCity, row.locationRegion, row.locationCountry]);
    case 'geo':
      return placeKey([row.geoCity, row.geoRegion, row.geoCountry]);
  }
}

/** Which bucket a row lands in for this dimension: a named group, "not set", or untracked. */
export function bucketOf(
  row: AcquisitionSubjectRow,
  groupBy: AcquisitionGroupBy
): { key: string; kind: AcquisitionGroupRow['kind'] } {
  const value = groupValueOf(row, groupBy);
  if (value !== null) return { key: value, kind: 'named' };
  if (isUntrackedRow(row)) return { key: UNTRACKED_KEY, kind: 'untracked' };
  return { key: NOT_SET_KEY, kind: 'not_set' };
}

/**
 * The six counts for one row.
 *
 * A stage counts when its own timestamp is present, and the account leg of
 * the view carries null for the first four on purpose: its visit is either
 * already counted on the arrival leg or no longer exists as a row anywhere,
 * so counting it from the account's copy would double count the funnel.
 */
function countsOf(row: AcquisitionSubjectRow): FunnelCounts {
  return {
    visits: row.rowKind === 'visit' ? 1 : 0,
    starts: row.startedAt ? 1 : 0,
    completions: row.completedAt ? 1 : 0,
    leads: row.leadCapturedAt ? 1 : 0,
    accounts: row.memberId ? 1 : 0,
    paid: row.paidAt ? 1 : 0,
  };
}

function add(a: FunnelCounts, b: FunnelCounts): FunnelCounts {
  return {
    visits: a.visits + b.visits,
    starts: a.starts + b.starts,
    completions: a.completions + b.completions,
    leads: a.leads + b.leads,
    accounts: a.accounts + b.accounts,
    paid: a.paid + b.paid,
  };
}

/** Sums the counts across every group. Read from the group rows rather than the raw rows so the table and its total can never disagree. */
export function totalsOf(rows: AcquisitionGroupRow[]): FunnelCounts {
  return rows.reduce<FunnelCounts>((total, row) => add(total, row), { ...EMPTY });
}

export const UNTRACKED_LABEL = 'Untracked';
export const NOT_SET_LABEL = 'Tracked, nothing for this grouping';

/**
 * Rolls the rows up into one row per group.
 *
 * `known` is every group that must appear whether or not anything arrived
 * on it: every source code the link builder knows about, every campaign and
 * creative any link was ever built for. The untracked row is always
 * present, at zero when nothing is untracked, because its absence would
 * read as "everything is accounted for".
 */
export function rollUp(
  rows: AcquisitionSubjectRow[],
  groupBy: AcquisitionGroupBy,
  known: KnownGroup[] = []
): AcquisitionGroupRow[] {
  const bucket = new Map<string, AcquisitionGroupRow>();

  const ensure = (
    key: string,
    kind: AcquisitionGroupRow['kind'],
    label: string,
    detail: string | null,
    retired = false
  ): AcquisitionGroupRow => {
    const existing = bucket.get(key);
    if (existing) return existing;
    const created: AcquisitionGroupRow = { key, label, detail, kind, retired, ...EMPTY };
    bucket.set(key, created);
    return created;
  };

  for (const group of known) {
    ensure(group.key, 'named', group.label, group.detail, Boolean(group.retired));
  }
  ensure(UNTRACKED_KEY, 'untracked', UNTRACKED_LABEL, null);

  for (const row of rows) {
    const { key, kind } = bucketOf(row, groupBy);
    const label =
      kind === 'untracked' ? UNTRACKED_LABEL : kind === 'not_set' ? NOT_SET_LABEL : key;
    const entry = ensure(key, kind, label, null);
    const counted = add(entry, countsOf(row));
    entry.visits = counted.visits;
    entry.starts = counted.starts;
    entry.completions = counted.completions;
    entry.leads = counted.leads;
    entry.accounts = counted.accounts;
    entry.paid = counted.paid;
  }

  return [...bucket.values()].sort(compareGroupRows);
}

/**
 * Busiest first, then alphabetical, with the two catch-all rows last.
 * "Not set" and "Untracked" belong at the bottom of a table somebody reads
 * top down looking for the partner who is working.
 */
function compareGroupRows(a: AcquisitionGroupRow, b: AcquisitionGroupRow): number {
  const rank = (row: AcquisitionGroupRow) =>
    row.kind === 'named' ? 0 : row.kind === 'not_set' ? 1 : 2;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (a.visits !== b.visits) return b.visits - a.visits;
  if (a.accounts !== b.accounts) return b.accounts - a.accounts;
  return a.label.localeCompare(b.label);
}

/**
 * A stage to stage conversion rate, as a fraction, or null when there is no
 * denominator. Null is printed as nothing at all: zero per cent would read
 * as "nobody converted" when the truth is "nobody has reached this stage".
 */
export function conversionRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

/** A rate as a percentage string, or null. One decimal place below ten per cent, none above, so a small experiment does not read as false precision. */
export function formatRate(rate: number | null): string | null {
  if (rate === null) return null;
  const percent = rate * 100;
  if (percent >= 10 || percent === 0) return `${Math.round(percent)}%`;
  return `${percent.toFixed(1)}%`;
}

/** Every stage to stage rate for one set of counts, keyed by the stage it lands on. */
export function ratesOf(counts: FunnelCounts): Partial<Record<keyof FunnelCounts, number | null>> {
  const rates: Partial<Record<keyof FunnelCounts, number | null>> = {};
  for (const stage of FUNNEL_STAGES) {
    if (stage.from === null) continue;
    rates[stage.key] = conversionRate(counts[stage.key], counts[stage.from]);
  }
  return rates;
}
