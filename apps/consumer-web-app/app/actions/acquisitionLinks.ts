/**
 * apps/consumer-web-app/app/actions/acquisitionLinks.ts
 *
 * The administrator's own entry points into acquisition tracking links:
 * list every link, build a new one, retire one, bring one back.
 *
 * WHY THE LINK AND THE MAPPING ARE WRITTEN BY ONE ACTION. A tracking link
 * and the record of what its code stands for are the same decision made
 * once. Written separately, they drift: a code gets handed out on a card
 * and the row that says whose card it was is filled in next week, or never,
 * and a report then prints `partner-04` at somebody who has no idea who
 * that is. `createTrackingLinkAction` writes the source row and the link
 * row from one form, in one call, so the mapping and the link cannot
 * disagree about anything.
 *
 * WHAT IS PERMANENT AND WHAT IS NOT. The CODE is permanent the moment a
 * link leaves this screen, because a printed card and a QR code cannot be
 * edited and every arrival already recorded carries it. Everything else
 * about a source (its label, the partner it names, the place it stands in)
 * is free to be corrected at any time and correcting it re-labels history
 * rather than splitting it. `is_test` is the one exception among those: it
 * is settable only when the code is new, because flipping it later would
 * silently add or remove every arrival that code has ever had from the real
 * funnel numbers.
 *
 * AUTHORIZATION. Same shape as app/actions/memberAccess.ts: requireAdmin
 * here, using the same hasActiveRole check against the same
 * has_active_role database function the RLS policies themselves use, and
 * then the administrator's OWN client does the writing, so her
 * `platform_administrator` policies on public_entry_sources and
 * public_entry_links are the second check. There is deliberately no service
 * role client in this file.
 */

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import {
  buildTrackingUrl,
  normalizeLinkDraft,
  trackingLinkOrigin,
  LINK_PROBLEM_MESSAGE,
  type LinkDraft,
} from '@/lib/acquisition/links';
import { normalizeCountry, normalizePlaceName } from '@/lib/acquisition/normalize';
import type { PublicEntrySourceChannel } from '@mef/shared-types-contracts';

type SupabaseServerClient = ReturnType<typeof createClient>;

export type AcquisitionActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** One row of the list: the link, and everything its code stands for. */
export interface TrackingLinkRow {
  id: string;
  label: string;
  url: string;
  sourceCode: string;
  sourceLabel: string;
  channel: string;
  isTest: boolean;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string | null;
  utmTerm: string | null;
  partnerName: string | null;
  locationName: string | null;
  locationCity: string | null;
  locationRegion: string | null;
  locationCountry: string | null;
  active: boolean;
  createdAt: string;
}

async function requireAdmin(): Promise<
  { ok: true; supabase: SupabaseServerClient } | { ok: false; error: string }
> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const isAdmin = await hasActiveRole(supabase, user.id, 'platform_administrator');
  if (!isAdmin) return { ok: false, error: 'Admin access required.' };
  return { ok: true, supabase };
}

/**
 * A failure an administrator can act on, as opposed to one she cannot. Its
 * message reaches the screen verbatim; every other error becomes the same
 * neutral sentence, because a raw database message is not something to show
 * anybody.
 */
class ActionError extends Error {}

/** One wrapper so no action can forget the guard, and so a raw database error never reaches a browser. */
async function guarded<T>(
  label: string,
  run: (supabase: SupabaseServerClient) => Promise<T>
): Promise<AcquisitionActionResult<T>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  try {
    return { ok: true, data: await run(guard.supabase) };
  } catch (error) {
    if (error instanceof ActionError) return { ok: false, error: error.message };
    console.error(`${label} failed`, error);
    return { ok: false, error: 'That change could not be saved. Please try again.' };
  }
}

type LinkJoinRow = {
  id: string;
  label: string;
  url: string;
  source_code: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string | null;
  utm_term: string | null;
  active: boolean;
  created_at: string;
  public_entry_sources: {
    label: string;
    channel: string;
    is_test: boolean;
    partner_name: string | null;
    location_name: string | null;
    location_city: string | null;
    location_region: string | null;
    location_country: string | null;
  } | null;
};

function toRow(raw: LinkJoinRow): TrackingLinkRow {
  const source = raw.public_entry_sources;
  return {
    id: raw.id,
    label: raw.label,
    url: raw.url,
    sourceCode: raw.source_code,
    sourceLabel: source?.label ?? raw.source_code,
    channel: source?.channel ?? 'partner',
    isTest: Boolean(source?.is_test),
    utmMedium: raw.utm_medium,
    utmCampaign: raw.utm_campaign,
    utmContent: raw.utm_content,
    utmTerm: raw.utm_term,
    partnerName: source?.partner_name ?? null,
    locationName: source?.location_name ?? null,
    locationCity: source?.location_city ?? null,
    locationRegion: source?.location_region ?? null,
    locationCountry: source?.location_country ?? null,
    active: raw.active,
    createdAt: raw.created_at,
  };
}

const LINK_COLUMNS =
  'id, label, url, source_code, utm_medium, utm_campaign, utm_content, utm_term, active, created_at, public_entry_sources(label, channel, is_test, partner_name, location_name, location_city, location_region, location_country)';

/** Every link ever built, newest first. Retired ones are included and marked, because a retired link is still printed on somebody's card. */
export async function listTrackingLinksAction(): Promise<AcquisitionActionResult<TrackingLinkRow[]>> {
  return guarded('listTrackingLinksAction', async (supabase) => {
    const { data, error } = await supabase
      .from('public_entry_links')
      .select(LINK_COLUMNS)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as unknown as LinkJoinRow[]).map(toRow);
  });
}

export interface CreateTrackingLinkInput extends LinkDraft {
  /** What this particular link is for, in words. Falls back to the partner name when left blank. */
  linkLabel?: string;
  channel: PublicEntrySourceChannel;
  /** The PHYSICAL place this code stands for, when it stands for one. Never confused with request geo. */
  locationName?: string;
  locationCity?: string;
  locationRegion?: string;
  locationCountry?: string;
  /** Our own traffic. Settable only while the code is new, for the reason in this file's header. */
  isTest?: boolean;
}

/**
 * Builds one link and writes the mapping it depends on, in that order.
 *
 * THE SOURCE ROW FIRST, ALWAYS. `public_entry_links.source_code` has a
 * foreign key into `public_entry_sources`, so a link whose code has never
 * been registered cannot be inserted at all. Writing the source first is
 * what makes "the mapping and the link can never disagree" structural
 * rather than a habit.
 *
 * A CODE THAT ALREADY EXISTS IS RE-LABELLED, NEVER REPLACED. Its label,
 * partner and location are updated to what this form says, because those
 * are corrections and a correction should reach every arrival that code has
 * ever had. Its `is_test` and its channel are left exactly as they were.
 */
export async function createTrackingLinkAction(
  input: CreateTrackingLinkInput
): Promise<AcquisitionActionResult<TrackingLinkRow>> {
  const normalized = normalizeLinkDraft(input);
  if (!normalized.ok) {
    return { ok: false, error: LINK_PROBLEM_MESSAGE[normalized.problem] };
  }
  const link = normalized.link;

  const partnerName = (input.partnerName ?? '').trim().slice(0, 120);
  if (!partnerName) {
    return { ok: false, error: 'Give this partner or channel a name, for example Ridgeway Physio.' };
  }

  return guarded('createTrackingLinkAction', async (supabase) => {
    const { data: existing, error: readError } = await supabase
      .from('public_entry_sources')
      .select('code')
      .eq('code', link.sourceCode)
      .maybeSingle();
    if (readError) throw readError;

    const place = {
      partner_name: partnerName,
      location_name: normalizePlaceName(input.locationName ?? null, 120),
      location_city: normalizePlaceName(input.locationCity ?? null, 80),
      location_region: normalizePlaceName(input.locationRegion ?? null, 60),
      location_country: normalizeCountry(input.locationCountry ?? null),
    };

    if (existing) {
      const { error } = await supabase
        .from('public_entry_sources')
        .update({ label: partnerName, ...place })
        .eq('code', link.sourceCode);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('public_entry_sources').insert({
        code: link.sourceCode,
        label: partnerName,
        channel: input.channel,
        is_test: Boolean(input.isTest),
        active: true,
        ...place,
      });
      if (error) throw error;
    }

    const origin = trackingLinkOrigin();
    const url = buildTrackingUrl(origin, link);
    const linkLabel = (input.linkLabel ?? '').trim().slice(0, 120) || partnerName;

    const { data, error } = await supabase
      .from('public_entry_links')
      .insert({
        source_code: link.sourceCode,
        label: linkLabel,
        utm_source: link.utmSource,
        utm_medium: link.utmMedium,
        utm_campaign: link.utmCampaign,
        utm_content: link.utmContent,
        utm_term: link.utmTerm,
        url,
      })
      .select(LINK_COLUMNS)
      .single();

    if (error) {
      // 23505 is the unique index that makes one partner one row. Not a
      // failure to report as a database problem: the link already exists,
      // and saying so is the whole reason the index is there.
      if ((error as { code?: string }).code === '23505') {
        throw new ActionError(
          'That link already exists. This partner, medium, campaign and creative are already a link on this screen, which is what stops one partner becoming two rows in a report. Change the campaign or the creative, or copy the link that is already there.'
        );
      }
      throw error;
    }

    revalidatePath('/admin/acquisition/links');
    revalidatePath('/admin/acquisition');
    return toRow(data as unknown as LinkJoinRow);
  });
}

/** Retires a link, or brings one back. The code and every arrival it produced are untouched: this only decides whether the link is still being handed out. */
export async function setTrackingLinkActiveAction(
  linkId: string,
  active: boolean
): Promise<AcquisitionActionResult<true>> {
  return guarded('setTrackingLinkActiveAction', async (supabase) => {
    const { error } = await supabase
      .from('public_entry_links')
      .update({ active })
      .eq('id', linkId);
    if (error) throw error;
    revalidatePath('/admin/acquisition/links');
    return true as const;
  });
}
