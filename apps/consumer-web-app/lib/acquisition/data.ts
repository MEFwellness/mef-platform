/**
 * Every read and write of acquisition attribution, in one file.
 *
 * WHO CALLS THIS WITH WHAT CLIENT. The anonymous half runs with the service
 * role, for the same reason lib/public-entry/data.ts does: the tables have
 * no public policy at all (migration 200), the visitor has no session, and
 * the boundary for those calls is the route handler's own origin check and
 * rate limit. The admin half runs with the administrator's own RLS-scoped
 * client under her `platform_administrator` policies.
 *
 * WHAT THIS FILE WILL NEVER DO. It will never write to an assessment, a
 * check-in or a scoring table, and it will never carry a health answer, a
 * result pattern or an email into an attribution row. Attribution is
 * behavioural: where a click came from and what the link said.
 * tests/public-entry-provenance.test.ts scans this directory and fails the
 * build if that changes.
 *
 * THE ONE SEQUENCE THIS FILE IMPLEMENTS.
 *
 *   arrive  -> recordArrivalAttribution   first touch, written once
 *   email   -> attachLeadAcquisition      copied onto the lead
 *   signup  -> attachUserAcquisition      copied onto the account
 *
 * Each step copies the FIRST touch, never the current request, and each
 * carries the original timestamps forward. The database refuses to update
 * any of the three, so this is the only place they can be written and they
 * can only be written once.
 *
 * AND THE ONE STEP THAT DOES NOT GO THROUGH THE BROWSER AT ALL.
 *
 *   signup  -> attachUserAcquisitionFromLead   matched by email address
 *
 * The three steps above all depend on the visitor token this browser is
 * holding, so a person who answers on her phone and signs up on her laptop
 * arrives carrying nothing. Her email address is the only join left, and it
 * was already in `captured_leads`. The browser path still wins whenever it
 * has anything to say: the signup form knows whether this browser holds a
 * token, and the email match runs only when it does not.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AcquisitionAttribution,
  AcquisitionAttributionRecord,
  AcquisitionTouch,
  PublicEntrySessionRecord,
} from '@mef/shared-types-contracts';
import { EMPTY_GEO, attributionsDiffer, isUntracked } from './attribution';

const SHAPE_COLUMNS =
  'utm_source, utm_medium, utm_campaign, utm_content, utm_term, source_code, source_raw, fbclid, ttclid, gclid, landing_path, referrer_host, geo_country, geo_region, geo_city';

type ShapeRow = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  source_code: string | null;
  source_raw: string | null;
  fbclid: string | null;
  ttclid: string | null;
  gclid: string | null;
  landing_path: string | null;
  referrer_host: string | null;
  geo_country: string | null;
  geo_region: string | null;
  geo_city: string | null;
};

/** The one place the camelCase shape becomes the snake_case row, so three writers cannot spell one column three ways. */
export function toShapeRow(attribution: AcquisitionAttribution): ShapeRow {
  return {
    utm_source: attribution.utmSource,
    utm_medium: attribution.utmMedium,
    utm_campaign: attribution.utmCampaign,
    utm_content: attribution.utmContent,
    utm_term: attribution.utmTerm,
    source_code: attribution.sourceCode,
    source_raw: attribution.sourceRaw,
    fbclid: attribution.fbclid,
    ttclid: attribution.ttclid,
    gclid: attribution.gclid,
    landing_path: attribution.landingPath,
    referrer_host: attribution.referrerHost,
    geo_country: attribution.geo.country,
    geo_region: attribution.geo.region,
    geo_city: attribution.geo.city,
  };
}

/** And back again. */
export function fromShapeRow(row: ShapeRow): AcquisitionAttribution {
  return {
    utmSource: row.utm_source,
    utmMedium: row.utm_medium,
    utmCampaign: row.utm_campaign,
    utmContent: row.utm_content,
    utmTerm: row.utm_term,
    sourceCode: row.source_code,
    sourceRaw: row.source_raw,
    fbclid: row.fbclid,
    ttclid: row.ttclid,
    gclid: row.gclid,
    landingPath: row.landing_path,
    referrerHost: row.referrer_host,
    geo: {
      country: row.geo_country,
      region: row.geo_region,
      city: row.geo_city,
    },
  };
}

/**
 * A source code that is not registered must not be written into a column
 * that has a foreign key into `public_entry_sources`, or the whole write
 * fails and an arrival loses everything else it carried. The raw value is
 * kept regardless, in `source_raw`, which is exactly how
 * `public_entry_sessions` already treats an unregistered code.
 */
async function settleSourceCode(
  supabase: SupabaseClient,
  code: string | null
): Promise<string | null> {
  if (!code) return null;
  const { data, error } = await supabase
    .from('public_entry_sources')
    .select('code')
    .eq('code', code)
    .maybeSingle();
  if (error) {
    console.error('settleSourceCode failed', error);
    return null;
  }
  return (data?.code as string | undefined) ?? null;
}

export async function readAttributionTouch(
  supabase: SupabaseClient,
  sessionId: string,
  touch: AcquisitionTouch
): Promise<AcquisitionAttributionRecord | null> {
  const { data, error } = await supabase
    .from('public_entry_attribution')
    .select(`session_id, touch, landed_at, recorded_at, ${SHAPE_COLUMNS}`)
    .eq('session_id', sessionId)
    .eq('touch', touch)
    .maybeSingle();
  if (error) {
    console.error('readAttributionTouch failed', error);
    return null;
  }
  if (!data) return null;
  const row = data as ShapeRow & {
    session_id: string;
    touch: AcquisitionTouch;
    landed_at: string;
    recorded_at: string;
  };
  return {
    ...fromShapeRow(row),
    sessionId: row.session_id,
    touch: row.touch,
    landedAt: row.landed_at,
    recordedAt: row.recorded_at,
  };
}

/**
 * Records what this arrival carried.
 *
 * FIRST TOUCH IS ATTEMPTED EVERY TIME AND WINS ONLY ONCE. The insert
 * ignores a duplicate, so the second, fifth and hundredth arrival on one
 * visitor token change nothing at all. There is no read-then-write here on
 * purpose: two tabs opening together would both read "no first touch" and
 * both insert, and the unique index is the only thing that can settle that
 * correctly.
 *
 * LAST TOUCH IS WRITTEN ONLY WHEN IT WOULD SAY SOMETHING DIFFERENT. An
 * arrival with no campaign parameters at all, or with exactly the ones
 * already recorded, produces no last-touch row. Otherwise every refresh
 * would write one and "she came back through a different link" would stop
 * meaning anything.
 *
 * Returns the first touch as it now stands, which is what the lead and the
 * account are later copied from.
 */
export async function recordArrivalAttribution(
  supabase: SupabaseClient,
  sessionId: string,
  incoming: AcquisitionAttribution
): Promise<AcquisitionAttributionRecord | null> {
  const settled: AcquisitionAttribution = {
    ...incoming,
    sourceCode: await settleSourceCode(supabase, incoming.sourceCode),
  };

  const { error: firstError } = await supabase
    .from('public_entry_attribution')
    .upsert({ session_id: sessionId, touch: 'first', ...toShapeRow(settled) }, {
      onConflict: 'session_id,touch',
      ignoreDuplicates: true,
    });
  if (firstError) console.error('recordArrivalAttribution first touch failed', firstError);

  const first = await readAttributionTouch(supabase, sessionId, 'first');

  if (first && !isUntracked(settled) && attributionsDiffer(first, settled)) {
    const { error: lastError } = await supabase
      .from('public_entry_attribution')
      .upsert({ session_id: sessionId, touch: 'last', ...toShapeRow(settled) }, {
        onConflict: 'session_id,touch',
      });
    if (lastError) console.error('recordArrivalAttribution last touch failed', lastError);
  }

  return first;
}

/**
 * Copies the arrival's first touch onto the lead, with the ORIGINAL landing
 * time.
 *
 * A copy rather than a join, because a lead is a historical record that has
 * to outlive the anonymous session it came from, and sessions are routinely
 * purged. `ignoreDuplicates` because a lead's origin, once attached, is
 * never revised; the database refuses an update to this table outright, so
 * a second attempt has to be a no-op rather than an error.
 */
export async function attachLeadAcquisition(
  supabase: SupabaseClient,
  input: {
    capturedLeadId: string;
    sessionId: string;
    attribution: AcquisitionAttributionRecord;
  }
): Promise<void> {
  const { error } = await supabase.from('captured_lead_acquisition').upsert(
    {
      captured_lead_id: input.capturedLeadId,
      session_id: input.sessionId,
      landed_at: input.attribution.landedAt,
      ...toShapeRow(input.attribution),
    },
    { onConflict: 'captured_lead_id', ignoreDuplicates: true }
  );
  if (error) console.error('attachLeadAcquisition failed', error);
}

/**
 * Copies the arrival's first touch onto the account, with every original
 * timestamp carried forward.
 *
 * ATTACHED ONCE, NEVER OVERWRITTEN BY A LATER VISIT. `member_id` is the
 * primary key, the insert ignores a duplicate, and the database refuses an
 * update to this table at all. A member who takes the experience again a
 * year later on a partner's link keeps the source that actually brought her
 * here.
 *
 * WHAT MAKES IT USEFUL LATER. It joins to `member_subscriptions` and
 * `member_wellness_events` on `member_id`, which is how the acquisition
 * report reads paid conversion, and to `profiles` on the same column, which
 * is how test accounts are excluded exactly as they are everywhere else.
 * Nothing in this build reads it.
 */
export async function attachUserAcquisition(
  supabase: SupabaseClient,
  input: {
    memberId: string;
    sessionId: string;
    experienceKey: string;
    capturedLeadId: string | null;
    leadCapturedAt: string | null;
    accountCreatedAt: string | null;
    attribution: AcquisitionAttributionRecord;
  }
): Promise<void> {
  const { error } = await supabase.from('user_acquisition').upsert(
    {
      member_id: input.memberId,
      session_id: input.sessionId,
      captured_lead_id: input.capturedLeadId,
      experience_key: input.experienceKey,
      landed_at: input.attribution.landedAt,
      lead_captured_at: input.leadCapturedAt,
      account_created_at: input.accountCreatedAt,
      ...toShapeRow(input.attribution),
    },
    { onConflict: 'member_id', ignoreDuplicates: true }
  );
  if (error) console.error('attachUserAcquisition failed', error);
}

/**
 * A first-touch record built from the session row itself, for an arrival
 * that has no attribution row of its own.
 *
 * Only reachable for a session that predates migration 200, or one whose
 * attribution write failed. It is not a guess: `public_entry_sessions` has
 * recorded the source code, the landing path, the referring host and the
 * first-seen time since migration 197, so everything it can honestly say is
 * carried across and everything it cannot is null. Better than attaching
 * nothing to a real member, and it can never invent a campaign that was
 * never on a link.
 */
export function touchFromSession(session: PublicEntrySessionRecord): AcquisitionAttributionRecord {
  return {
    sessionId: session.id,
    touch: 'first',
    landedAt: session.firstSeenAt,
    recordedAt: session.firstSeenAt,
    // Null rather than the source code: `utm_source` describes what the
    // LINK said, and this arrival's link said nothing of the kind. Writing
    // the code in here would make a report believe a campaign parameter
    // existed that never did.
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    sourceCode: session.sourceCode,
    sourceRaw: session.sourceRaw,
    fbclid: null,
    ttclid: null,
    gclid: null,
    landingPath: session.landingPath,
    referrerHost: session.referrerHost,
    geo: EMPTY_GEO,
  };
}

/**
 * THE CROSS DEVICE HALF: the most recent lead left at this email address.
 *
 * WHY IT EXISTS. The lead to account link worked only through the browser,
 * because the only thing joining an arrival to an account was the visitor
 * token in that browser's localStorage. Somebody who answered the nine
 * questions on her phone, left her email there, and then created her
 * account on a laptop arrived as an untracked account, and the partner who
 * actually sent her was credited with nothing. Her email address was
 * sitting in `captured_leads` the whole time.
 *
 * WHY THE MATCH IS A DATABASE FUNCTION. Case insensitive matching through
 * PostgREST means `ilike`, whose SQL wildcards include the underscore, and
 * an underscore is an ordinary character in an email address. `a_b@x.com`
 * would have matched `axb@x.com` and attached one stranger's origin to
 * another person's account. `lower(x) = lower(y)` is the only exact version
 * of this question, so it lives in `lead_acquisition_for_email`
 * (migration 201) next to the index that serves it.
 *
 * NO EMAIL IS RETURNED AND NONE IS STORED. The address goes in, attribution
 * comes back. There is no column on any acquisition table an email could be
 * written into, which is the point.
 */
export async function findLeadAcquisitionByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<{
  capturedLeadId: string;
  sessionId: string | null;
  experienceKey: string;
  landedAt: string;
  leadCapturedAt: string;
  attribution: AcquisitionAttribution;
} | null> {
  const trimmed = email.trim();
  if (!trimmed) return null;

  const { data, error } = await supabase.rpc('lead_acquisition_for_email', { p_email: trimmed });
  if (error) {
    console.error('findLeadAcquisitionByEmail failed', error);
    return null;
  }
  const row = (data as unknown[] | null)?.[0] as
    | (ShapeRow & {
        captured_lead_id: string;
        session_id: string | null;
        experience_key: string;
        landed_at: string;
        lead_captured_at: string;
      })
    | undefined;
  if (!row) return null;

  return {
    capturedLeadId: row.captured_lead_id,
    sessionId: row.session_id,
    experienceKey: row.experience_key,
    landedAt: row.landed_at,
    leadCapturedAt: row.lead_captured_at,
    attribution: fromShapeRow(row),
  };
}

/**
 * Attaches a matched lead's attribution to a brand new account.
 *
 * THE BROWSER STILL WINS, AND THAT IS DECIDED BEFORE THIS IS CALLED. The
 * signup form knows whether this browser is holding a public entry visitor
 * token, and when it is, this is not called at all: the claim in the root
 * layout binds her to the arrival she actually took, and that path also
 * writes `member_public_entry_origin`. This is the fallback for a browser
 * that carries nothing.
 *
 * ATTACHED ONCE, LIKE EVERY OTHER COPY. `member_id` is the primary key, the
 * insert ignores a duplicate, and the database refuses an update to this
 * table outright, so this can never revise an origin that already stands.
 *
 * THE SESSION IS CLAIMED ONLY WHEN IT IS FREE. `user_acquisition.session_id`
 * is unique, so an arrival can back at most one account. If the lead's
 * session has been purged, or already belongs to another account, this
 * writes null there and keeps everything else. The attribution is a COPY
 * and does not depend on the session existing, which is exactly why
 * migration 200 made it a copy.
 *
 * WHAT IT DOES NOT WRITE, AND WHAT NOW WRITES IT INSTEAD (2026-09-05).
 * `member_public_entry_origin`. This function stays behavioural: it copies
 * attribution and nothing else, and it never touches that table.
 *
 * It used to be documented here that an email match must never bind the
 * quiz arrival at all, on the grounds that an email match is not consent to
 * show somebody the answers attached to an address. A real-phone test found
 * the cost of that position: a member who finishes the quiz on her phone
 * and signs up anywhere else is bound to nothing, so Root has nothing
 * honest to say about the two minutes she just spent, on the welcome or on
 * any day of her first week.
 *
 * The bind by email now exists, in the module that owns that table
 * (lib/public-entry/data.ts, bindOriginFromEmailMatch), under four
 * conditions and marked with its own weaker provenance
 * (bind_method 'email_match', migration 207) rather than being laundered
 * into the same fact as a browser handing over its own token. Both are
 * called together from the two places an email is the only join left: the
 * signup action, and the claim route when the browser path has failed.
 */
export async function attachUserAcquisitionFromLead(
  supabase: SupabaseClient,
  input: { memberId: string; email: string; accountCreatedAt: string | null }
): Promise<{ attached: boolean; sourceCode: string | null }> {
  const existing = await supabase
    .from('user_acquisition')
    .select('member_id')
    .eq('member_id', input.memberId)
    .maybeSingle();
  if (existing.error) {
    console.error('attachUserAcquisitionFromLead read failed', existing.error);
    return { attached: false, sourceCode: null };
  }
  // Something already attached her origin. Never revised, by rule and by
  // trigger, so there is nothing to do and nothing to report.
  if (existing.data) return { attached: false, sourceCode: null };

  const match = await findLeadAcquisitionByEmail(supabase, input.email);
  if (!match) return { attached: false, sourceCode: null };

  const sessionId = match.sessionId ? await freeSessionOrNull(supabase, match.sessionId) : null;

  const { error } = await supabase.from('user_acquisition').upsert(
    {
      member_id: input.memberId,
      session_id: sessionId,
      captured_lead_id: match.capturedLeadId,
      experience_key: match.experienceKey,
      landed_at: match.landedAt,
      lead_captured_at: match.leadCapturedAt,
      account_created_at: input.accountCreatedAt,
      ...toShapeRow(match.attribution),
    },
    { onConflict: 'member_id', ignoreDuplicates: true }
  );
  if (error) {
    console.error('attachUserAcquisitionFromLead failed', error);
    return { attached: false, sourceCode: null };
  }

  // Read back rather than trusting the absence of an error: a write that
  // matches no policy returns zero rows and no error at all.
  const written = await supabase
    .from('user_acquisition')
    .select('source_code')
    .eq('member_id', input.memberId)
    .maybeSingle();
  if (written.error || !written.data) return { attached: false, sourceCode: null };
  return { attached: true, sourceCode: (written.data as { source_code: string | null }).source_code };
}

/** The arrival's id when no account has claimed it yet, and null otherwise. `user_acquisition.session_id` is unique, so one arrival can back at most one account. */
async function freeSessionOrNull(
  supabase: SupabaseClient,
  sessionId: string
): Promise<string | null> {
  const [session, taken] = await Promise.all([
    supabase.from('public_entry_sessions').select('id').eq('id', sessionId).maybeSingle(),
    supabase.from('user_acquisition').select('member_id').eq('session_id', sessionId).maybeSingle(),
  ]);
  if (session.error || !session.data) return null;
  if (taken.error || taken.data) return null;
  return sessionId;
}
