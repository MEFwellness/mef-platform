'use client';

/**
 * The form, the live preview, and the list.
 *
 * THE PREVIEW IS THE POINT. Every value is normalised as it is typed and
 * the whole URL is rebuilt on every keystroke, by the SAME function the
 * server action uses to build the string it stores. What is on screen
 * before the save and what ends up on a card afterwards are the same
 * characters, so "Card A" visibly becoming `card_a` is something the
 * administrator sees happen rather than something she discovers in a report
 * three weeks later.
 *
 * NO OPTIMISTIC STATE. After a save the page is refreshed and the list is
 * re-read, so what is on screen is always what the database actually holds.
 * Same trade and same reasoning as app/admin/access/MemberAccessPanel.tsx.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy } from 'lucide-react';
import {
  createTrackingLinkAction,
  setTrackingLinkActiveAction,
  type TrackingLinkRow,
} from '@/app/actions/acquisitionLinks';
import {
  buildTrackingUrl,
  normalizeLinkDraft,
  suggestSourceCode,
  LINK_PROBLEM_MESSAGE,
} from '@/lib/acquisition/links';
import { normalizeCountry, normalizePlaceName } from '@/lib/acquisition/normalize';
import { formatDisplayDate } from '@/lib/time/displayDate';
import type { PublicEntrySourceChannel } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const FIELD =
  'mef-focus-ring mt-1 w-full rounded-2xl border border-[#1B3A2D]/12 bg-white px-4 py-3 text-[15px] text-[#1B3A2D] placeholder:text-[#9AA8A0] focus:border-[#F5B700]/60 focus:outline-none';
const LABEL = 'text-xs font-semibold uppercase tracking-wider text-[#6B7A72]';
const HINT = 'mt-1 text-[13px] leading-relaxed text-[#6B7A72]';

/**
 * The channels a link can be handed out through, in the words a person uses
 * about them. Exactly the set `public_entry_sources.channel` accepts, minus
 * `direct`, which is what an arrival with no code at all is recorded as and
 * therefore can never be a link somebody builds.
 */
const CHANNELS: { value: PublicEntrySourceChannel; label: string; medium: string }[] = [
  { value: 'partner', label: 'Referral partner (a practice, a clinic, a business)', medium: 'partner_card' },
  { value: 'client', label: 'A current or past client sharing it', medium: 'client_share' },
  { value: 'network', label: 'Personal network', medium: 'personal_share' },
  { value: 'social', label: 'Social post or profile link', medium: 'social_post' },
  { value: 'corporate', label: 'Corporate wellness contact', medium: 'corporate' },
  { value: 'qa', label: 'Our own testing', medium: 'testing' },
];

type Draft = {
  partnerName: string;
  sourceCode: string;
  codeTouched: boolean;
  channel: PublicEntrySourceChannel;
  medium: string;
  campaign: string;
  creative: string;
  linkLabel: string;
  locationName: string;
  locationCity: string;
  locationRegion: string;
  locationCountry: string;
  isTest: boolean;
};

const EMPTY_DRAFT: Draft = {
  partnerName: '',
  sourceCode: '',
  codeTouched: false,
  channel: 'partner',
  medium: 'partner_card',
  campaign: '',
  creative: '',
  linkLabel: '',
  locationName: '',
  locationCity: '',
  locationRegion: '',
  locationCountry: '',
  isTest: false,
};

export function LinkBuilderPanel({
  origin,
  initialLinks,
  loadError,
  takenCodes,
}: {
  origin: string;
  initialLinks: TrackingLinkRow[];
  loadError: string | null;
  takenCodes: { code: string; label: string; isTest: boolean }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError('');
    setNotice('');
  }

  /**
   * The code follows the partner's name until the moment somebody edits it
   * by hand, and then it stops following, because a code that changed
   * itself after a card was printed would be the worst possible bug on this
   * screen.
   */
  function setPartnerName(value: string) {
    setDraft((current) => ({
      ...current,
      partnerName: value,
      sourceCode: current.codeTouched ? current.sourceCode : suggestSourceCode(value),
    }));
    setError('');
    setNotice('');
  }

  function setChannel(value: PublicEntrySourceChannel) {
    const chosen = CHANNELS.find((entry) => entry.value === value);
    setDraft((current) => ({
      ...current,
      channel: value,
      // The medium follows the channel only while it is still one of the
      // channel defaults, so choosing "social post" does not leave
      // "partner_card" behind in a field nobody looked at again, and a
      // medium somebody typed themselves is never overwritten.
      medium:
        chosen && CHANNELS.some((entry) => entry.medium === current.medium)
          ? chosen.medium
          : current.medium,
    }));
    setError('');
  }

  const normalized = useMemo(
    () =>
      normalizeLinkDraft({
        partnerName: draft.partnerName,
        sourceCode: draft.sourceCode,
        medium: draft.medium,
        campaign: draft.campaign,
        creative: draft.creative,
      }),
    [draft.partnerName, draft.sourceCode, draft.medium, draft.campaign, draft.creative]
  );

  const previewUrl = normalized.ok ? buildTrackingUrl(origin, normalized.link) : null;
  const existingCode = normalized.ok
    ? takenCodes.find((entry) => entry.code === normalized.link.sourceCode)
    : undefined;

  function submit() {
    if (!normalized.ok) {
      setError(LINK_PROBLEM_MESSAGE[normalized.problem]);
      return;
    }
    setError('');
    setNotice('');
    startTransition(async () => {
      const result = await createTrackingLinkAction({
        partnerName: draft.partnerName,
        sourceCode: draft.sourceCode,
        medium: draft.medium,
        campaign: draft.campaign,
        creative: draft.creative,
        linkLabel: draft.linkLabel,
        channel: draft.channel,
        locationName: draft.locationName,
        locationCity: draft.locationCity,
        locationRegion: draft.locationRegion,
        locationCountry: draft.locationCountry,
        isTest: draft.isTest,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(`Link created for ${result.data.sourceLabel}. Copy it below.`);
      setDraft({ ...EMPTY_DRAFT, channel: draft.channel, medium: draft.medium });
      router.refresh();
    });
  }

  function toggleActive(link: TrackingLinkRow) {
    setError('');
    setNotice('');
    startTransition(async () => {
      const result = await setTrackingLinkActiveAction(link.id, !link.active);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  async function copy(link: { id: string; url: string }) {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiedId(link.id);
      window.setTimeout(() => setCopiedId((current) => (current === link.id ? null : current)), 2000);
    } catch {
      setError('This browser would not let the page copy. Select the link and copy it by hand.');
    }
  }

  return (
    <>
      <section className={`${CARD} mt-6 p-6`}>
        <h2 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
          Build a link
        </h2>

        <div className="mt-5">
          <label className={LABEL} htmlFor="partnerName">
            Partner or channel name
          </label>
          <input
            id="partnerName"
            className={FIELD}
            value={draft.partnerName}
            onChange={(event) => setPartnerName(event.target.value)}
            placeholder="Ridgeway Physio"
            autoComplete="off"
          />
          <p className={HINT}>Who or what is handing this link out. This is the name a report prints.</p>
        </div>

        <div className="mt-5">
          <label className={LABEL} htmlFor="sourceCode">
            Link code
          </label>
          <input
            id="sourceCode"
            className={`${FIELD} font-mono`}
            value={draft.sourceCode}
            onChange={(event) => {
              const value = event.target.value;
              setDraft((current) => ({ ...current, codeTouched: true, sourceCode: value }));
              setError('');
              setNotice('');
            }}
            placeholder="ridgeway-physio"
            autoComplete="off"
          />
          <p className={HINT}>
            The part that appears in the link itself. It is suggested from the name above until you
            edit it. Once a link has been handed out or printed, this code is permanent: change the
            name instead, which relabels everything that code has ever brought in.
          </p>
          {existingCode && (
            <p className="mt-2 rounded-2xl bg-[#F5B700]/10 px-4 py-3 text-[13px] leading-relaxed text-[#4F645A]">
              This code already exists as {existingCode.label}
              {existingCode.isTest ? ' (test)' : ''}. Saving will keep the code and every arrival it
              has ever had, and update the name and location to what is on this form.
            </p>
          )}
        </div>

        <div className="mt-5">
          <label className={LABEL} htmlFor="channel">
            How it is being handed out
          </label>
          <select
            id="channel"
            className={FIELD}
            value={draft.channel}
            onChange={(event) => setChannel(event.target.value as PublicEntrySourceChannel)}
          >
            {CHANNELS.map((channel) => (
              <option key={channel.value} value={channel.value}>
                {channel.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-5">
          <label className={LABEL} htmlFor="medium">
            Medium
          </label>
          <input
            id="medium"
            className={`${FIELD} font-mono`}
            value={draft.medium}
            onChange={(event) => set('medium', event.target.value)}
            placeholder="counter_card"
            autoComplete="off"
          />
          <p className={HINT}>The kind of placement: a counter card, a bio link, a story.</p>
        </div>

        <div className="mt-5">
          <label className={LABEL} htmlFor="campaign">
            Campaign
          </label>
          <input
            id="campaign"
            className={`${FIELD} font-mono`}
            value={draft.campaign}
            onChange={(event) => set('campaign', event.target.value)}
            placeholder="autumn_run"
            autoComplete="off"
          />
          <p className={HINT}>What push this link belongs to. Required, because a link without one reads as untracked traffic later.</p>
        </div>

        <div className="mt-5">
          <label className={LABEL} htmlFor="creative">
            Creative or ad label
          </label>
          <input
            id="creative"
            className={`${FIELD} font-mono`}
            value={draft.creative}
            onChange={(event) => set('creative', event.target.value)}
            placeholder="card_a"
            autoComplete="off"
          />
          <p className={HINT}>Which version of the card, post or ad this is. Leave it empty if there is only one.</p>
        </div>

        <div className="mt-6 border-t border-[#1B3A2D]/8 pt-5">
          <p className={LABEL}>Physical location, if this code stands for a place</p>
          <p className={HINT}>
            A card on a clinic counter is a place, and nothing about a click will ever say so. This
            is separate from the country and city a visitor appears to be browsing from, which is
            recorded on its own.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor="locationName">
                Place
              </label>
              <input
                id="locationName"
                className={FIELD}
                value={draft.locationName}
                onChange={(event) => set('locationName', event.target.value)}
                placeholder="Ridgeway Physio, front desk"
                autoComplete="off"
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="locationCity">
                City
              </label>
              <input
                id="locationCity"
                className={FIELD}
                value={draft.locationCity}
                onChange={(event) => set('locationCity', event.target.value)}
                placeholder="Croydon"
                autoComplete="off"
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="locationRegion">
                Region or state
              </label>
              <input
                id="locationRegion"
                className={FIELD}
                value={draft.locationRegion}
                onChange={(event) => set('locationRegion', event.target.value)}
                placeholder="Greater London"
                autoComplete="off"
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="locationCountry">
                Country code
              </label>
              <input
                id="locationCountry"
                className={`${FIELD} font-mono uppercase`}
                value={draft.locationCountry}
                onChange={(event) => set('locationCountry', event.target.value)}
                placeholder="GB"
                maxLength={2}
                autoComplete="off"
              />
              <p className={HINT}>
                Two letters.
                {draft.locationCountry.trim() !== '' && normalizeCountry(draft.locationCountry) === null
                  ? ' This is not a two letter code, so it will not be saved.'
                  : ''}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-[#1B3A2D]/8 pt-5">
          <label className={LABEL} htmlFor="linkLabel">
            What this link is for
          </label>
          <input
            id="linkLabel"
            className={FIELD}
            value={draft.linkLabel}
            onChange={(event) => set('linkLabel', event.target.value)}
            placeholder="Counter card, autumn run"
            autoComplete="off"
          />
          <p className={HINT}>Optional. Left empty, the partner name is used.</p>

          {!existingCode && (
            <label className="mef-focus-ring mt-4 flex items-start gap-3 rounded-2xl border border-[#1B3A2D]/12 px-4 py-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-[#1B3A2D]"
                checked={draft.isTest}
                onChange={(event) => set('isTest', event.target.checked)}
              />
              <span className="text-[14px] leading-relaxed text-[#4F645A]">
                This is one of ours, for testing. Every arrival on this code stays out of the real
                funnel numbers. It can only be set while the code is new, because turning it on or
                off later would move every arrival that code has ever had.
              </span>
            </label>
          )}
        </div>

        <div className="mt-6 rounded-2xl bg-[#EFF6F1] p-4">
          <p className={LABEL}>The link</p>
          {previewUrl ? (
            <p className="mt-2 break-all font-mono text-[13px] leading-relaxed text-[#1B3A2D]">
              {previewUrl}
            </p>
          ) : (
            <p className="mt-2 text-[13px] leading-relaxed text-[#6B7A72]">
              {normalized.ok ? '' : LINK_PROBLEM_MESSAGE[normalized.problem]}
            </p>
          )}
        </div>

        {error && (
          <p className="mt-4 rounded-2xl bg-[#B3261E]/8 px-4 py-3 text-[14px] leading-relaxed text-[#8C1D18]">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-4 rounded-2xl bg-[#1B3A2D]/8 px-4 py-3 text-[14px] leading-relaxed text-[#1B3A2D]">
            {notice}
          </p>
        )}

        <button
          type="button"
          className="mef-button-primary mt-5 w-full"
          onClick={submit}
          disabled={isPending || !previewUrl}
        >
          {isPending ? 'Saving' : 'Create this link'}
        </button>
      </section>

      <section className="mt-8 pb-6">
        <h2 className={LABEL}>Every link built here</h2>
        {loadError && (
          <p className="mef-card mt-2 p-5 text-sm text-[#8C1D18]">{loadError}</p>
        )}
        {!loadError && initialLinks.length === 0 && (
          <p className="mef-card mt-2 p-5 text-sm text-[#6B7A72]">
            No links yet. The first one you build will appear here with its full address.
          </p>
        )}
        {initialLinks.length > 0 && (
          <ul className="mt-2 space-y-3">
            {initialLinks.map((link) => (
              <li key={link.id} className={`${CARD} p-5 ${link.active ? '' : 'opacity-70'}`}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <p className="text-[15px] font-medium text-[#1B3A2D]">{link.sourceLabel}</p>
                  <span className="font-mono text-xs text-[#6B7A72]">{link.sourceCode}</span>
                  {link.isTest && (
                    <span className="rounded-full bg-[#1B3A2D]/8 px-2 py-0.5 text-[11px] font-semibold text-[#6B7A72]">
                      test
                    </span>
                  )}
                  {!link.active && (
                    <span className="rounded-full bg-[#1B3A2D]/8 px-2 py-0.5 text-[11px] font-semibold text-[#6B7A72]">
                      retired
                    </span>
                  )}
                </div>

                <p className="mt-0.5 text-[13px] text-[#6B7A72]">{link.label}</p>

                <p className="mt-3 break-all rounded-2xl bg-[#EFF6F1] px-4 py-3 font-mono text-[13px] leading-relaxed text-[#1B3A2D]">
                  {link.url}
                </p>

                <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-[#6B7A72]">
                  <div>
                    <dt className="inline font-medium text-[#4F645A]">Campaign: </dt>
                    <dd className="inline font-mono">{link.utmCampaign}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-[#4F645A]">Medium: </dt>
                    <dd className="inline font-mono">{link.utmMedium}</dd>
                  </div>
                  {link.utmContent && (
                    <div>
                      <dt className="inline font-medium text-[#4F645A]">Creative: </dt>
                      <dd className="inline font-mono">{link.utmContent}</dd>
                    </div>
                  )}
                  {placeLine(link) && (
                    <div>
                      <dt className="inline font-medium text-[#4F645A]">Location: </dt>
                      <dd className="inline">{placeLine(link)}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="inline font-medium text-[#4F645A]">Built: </dt>
                    <dd className="inline">{formatDisplayDate(link.createdAt, { year: 'numeric', month: 'short', day: 'numeric' })}</dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="mef-button-secondary inline-flex items-center gap-2"
                    onClick={() => copy(link)}
                  >
                    {copiedId === link.id ? <Check size={16} /> : <Copy size={16} />}
                    {copiedId === link.id ? 'Copied' : 'Copy link'}
                  </button>
                  <button
                    type="button"
                    className="mef-button-secondary"
                    onClick={() => toggleActive(link)}
                    disabled={isPending}
                  >
                    {link.active ? 'Retire' : 'Bring back'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** The physical place, as one readable line, or nothing when a code does not stand for a place. */
function placeLine(link: TrackingLinkRow): string | null {
  const parts = [link.locationName, link.locationCity, link.locationRegion, link.locationCountry]
    .map((part) => (part ? normalizePlaceName(part, 120) : null))
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(', ') : null;
}
