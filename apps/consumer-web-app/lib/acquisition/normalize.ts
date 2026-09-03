/**
 * Normalising an attribution value, so one partner and one campaign can
 * never become two rows in a report.
 *
 * THE PROBLEM THIS SOLVES, WHICH IS THE ONLY PROBLEM ATTRIBUTION REALLY
 * HAS. "Card A", "card_a", "Card-A" and "CARD A" are one creative. Typed by
 * hand into four links over four weeks they become four rows, each with a
 * quarter of the truth, and the report is worse than having no report at
 * all because it looks like an answer. So every value is put through one of
 * the two functions below on the way IN from a link and on the way OUT of
 * the link builder, and the database's own check constraints refuse
 * anything that skipped them.
 *
 * TWO SHAPES, AND THE REASON THERE ARE TWO.
 *
 *   A SOURCE CODE uses hyphens: `partner-01`, `dr-okafor`. It has to,
 *   because it is a path segment in a printed link (`/energy/dr-okafor`),
 *   it has been that shape since migration 197, and codes already handed
 *   out cannot be restyled.
 *
 *   EVERY OTHER UTM VALUE uses underscores: `counter_card`, `autumn_run`.
 *   That is what every ad platform and every marketer already writes, so a
 *   pasted campaign name normalises to itself instead of being quietly
 *   rewritten.
 *
 * `utm_source` is the source code, so it takes the hyphen shape. That is
 * not an inconsistency, it is the whole point: the source code appears in
 * the path AND in `utm_source`, and if the two normalised differently one
 * partner would arrive as two.
 */

/** The shape a source code must have. The same rule `public_entry_sources.code` and every attribution table's `source_code` enforce. */
const CODE_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** The shape every other utm value must have. The same rule the attribution tables enforce. */
const TAG_PATTERN = /^[a-z0-9][a-z0-9_]{0,79}$/;

/**
 * Strips accents so "Dr Álvarez" and "Dr Alvarez" are one partner rather
 * than two. NFKD splits a letter from its mark and the range drops the
 * marks, which is the whole of it.
 */
function fold(raw: string): string {
  return raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * A source code: lowercase, accents folded, every run of anything else
 * turned into a single hyphen, trimmed of leading and trailing hyphens,
 * capped at forty characters.
 *
 * UNDERSCORES BECOME HYPHENS, WHICH IS A CORRECTION. This used to delete
 * them outright, so `dr_okafor` became `drokafor` while
 * `utm_source=dr_okafor` normalised to `dr-okafor` through the link
 * builder: one partner, two codes, two rows, and nothing to say they were
 * the same person. Registered codes have never contained an underscore, so
 * the only behaviour that changes is what a mistyped or invented code is
 * recorded as, and it now agrees with itself whichever door it came in
 * through.
 */
export function normalizeSourceCodeValue(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = fold(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  if (!cleaned) return null;
  return CODE_PATTERN.test(cleaned) ? cleaned : null;
}

/**
 * Every other utm value: lowercase, accents folded, every run of anything
 * else turned into a single underscore, trimmed, capped at eighty
 * characters. Returns null for anything that cannot be a value at all, so
 * a junk parameter is dropped rather than stored as a row of its own.
 */
export function normalizeTag(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = fold(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+/, '')
    .slice(0, 80)
    .replace(/_+$/, '');
  if (!cleaned) return null;
  return TAG_PATTERN.test(cleaned) ? cleaned : null;
}

/**
 * An ad click id, exactly as the platform wrote it. NOT normalised in the
 * sense the values above are: it is an opaque token that only means
 * anything to the platform that issued it, so lowercasing it would destroy
 * it. All that happens here is the removal of anything that could not be
 * part of one, and a length cap.
 */
export function normalizeClickId(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 255);
  return cleaned.length > 0 ? cleaned : null;
}

/** A coarse place name off an edge header: percent-decoded, whitespace collapsed, capped. Never lowercased, because "Milton Keynes" is a name and not a slug. */
export function normalizePlaceName(raw: string | null | undefined, maxLength: number): string | null {
  if (typeof raw !== 'string') return null;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // A header that is not valid percent-encoding is used as it stands.
  }
  const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
  return cleaned.length > 0 ? cleaned : null;
}

/** A two letter country code, or nothing. The database will only accept `^[A-Z]{2}$`, so anything else is dropped here rather than failing a write. */
export function normalizeCountry(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(cleaned) ? cleaned : null;
}
