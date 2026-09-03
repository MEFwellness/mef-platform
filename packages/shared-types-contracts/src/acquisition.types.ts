/**
 * Acquisition attribution (migration 200): what brought somebody to the
 * public entry experience, kept from the first click through to the
 * account.
 *
 * THE RULE THESE TYPES CARRY. Attribution is BEHAVIOURAL ONLY. Every field
 * below is a normalised slug, an opaque ad click id, a host, a path, a
 * coarse place name or a timestamp. There is deliberately no field a health
 * answer, a result pattern or an email address could be written into, and
 * nothing here shares a type with `PublicEntryAnswer` or
 * `PublicEntryPatternKey`, so the two can never be handed to each other's
 * functions by accident.
 *
 * TWO KINDS OF PLACE, WHICH ARE NEVER THE SAME THING. `AcquisitionGeo`
 * describes where a REQUEST appeared to come from, read coarsely from the
 * edge and no finer than a city. `PublicEntrySourcePlace` describes the
 * PHYSICAL place a source code stands for, which a human types into the
 * link builder because no request header will ever know that a QR card sits
 * on a particular clinic's counter. A report may group by either. It must
 * never mistake one for the other.
 */

/** Whether this is the arrival that gets the credit, or a later one that carried different parameters. First touch wins, always. */
export type AcquisitionTouch = 'first' | 'last';

/** Where a request appeared to come from. Country, region, city and nothing finer, ever. */
export interface AcquisitionGeo {
  country: string | null;
  region: string | null;
  city: string | null;
}

/**
 * The full attribution set an arrival carried.
 *
 * `utmSource` keeps hyphens because it IS our own source code
 * (`partner-01`). The other four use underscores, which is what every ad
 * platform and every marketer already writes. Both are normalised on the
 * way in and on the way out, so one campaign can never become two rows in a
 * report.
 */
export interface AcquisitionAttribution {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  /** Our own per-partner code, once resolved against `public_entry_sources`. */
  sourceCode: string | null;
  /** What the link literally said, so an unregistered code stays investigable instead of being folded into direct traffic. */
  sourceRaw: string | null;
  /** Ad click ids, exactly as the platform wrote them. Opaque to us on purpose. */
  fbclid: string | null;
  ttclid: string | null;
  gclid: string | null;
  landingPath: string | null;
  referrerHost: string | null;
  geo: AcquisitionGeo;
}

/** One arrival's attribution as stored, with the times it happened. */
export interface AcquisitionAttributionRecord extends AcquisitionAttribution {
  sessionId: string;
  touch: AcquisitionTouch;
  landedAt: string;
  recordedAt: string;
}

/** A lead's own copy, taken at the moment she left an email. */
export interface CapturedLeadAcquisition extends AcquisitionAttribution {
  capturedLeadId: string;
  sessionId: string | null;
  /** The ORIGINAL landing time, carried across unchanged. */
  landedAt: string;
  leadCapturedAt: string;
}

/**
 * A member's own copy, attached once when her account was bound to the
 * arrival she took.
 *
 * `origin` is check-constrained to a single value in the database for the
 * same reason `MemberPublicEntryOrigin.origin` is: this row describes a
 * public acquisition arrival and can never be restated as anything else.
 * It joins to `member_subscriptions` and `member_wellness_events` on
 * `memberId`, which is how a later report reads paid conversion. Nothing
 * in this build reads it.
 */
export interface UserAcquisition extends AcquisitionAttribution {
  memberId: string;
  sessionId: string | null;
  capturedLeadId: string | null;
  experienceKey: string;
  landedAt: string;
  leadCapturedAt: string | null;
  accountCreatedAt: string | null;
  attributedAt: string;
  origin: 'public_acquisition';
}

/** The physical place a source code stands for, when it stands for one. Typed by a human in the link builder, never read from a header. */
export interface PublicEntrySourcePlace {
  partnerName: string | null;
  locationName: string | null;
  locationCity: string | null;
  locationRegion: string | null;
  locationCountry: string | null;
}

/** One tracking link, as built and stored by the admin link builder. */
export interface PublicEntryLink {
  id: string;
  sourceCode: string;
  label: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string | null;
  utmTerm: string | null;
  /** The whole URL, as it will be copied and pasted. Stored rather than re-derived so the row and the printed link can never disagree. */
  url: string;
  active: boolean;
  createdAt: string;
}
