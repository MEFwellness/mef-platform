'use client';

/**
 * Her results. Editorial and calm, and the only reading of this assessment
 * she is ever shown.
 *
 * NOT ONE NUMBER, NOT ONE COLOUR, NOT ONE ZONE. This component cannot
 * print any of them, because the view it is handed
 * (lib/whole-body-signal/memberView.ts) has no field for one. Bar length
 * is the band's own step in the band order, which is why four bands make
 * four lengths and no percentage ever crosses to the browser.
 *
 * STRONGEST AREAS FIRST, GROUPED UNDER BAND NAMES. Soft tonal differences
 * rather than traffic lights: the loudest group is a warmer, higher
 * contrast card and the quietest is barely lifted off the panel. Nothing
 * here is red, amber or green, and none of those words appears either.
 *
 * THE LANDSCAPE IS A LANDSCAPE, NOT A RADAR. Thin bars in one column,
 * loudest first, each labelled with a plain intensity word from its band's
 * own row.
 *
 * ONE CARD OPENS AT A TIME, and tapping the open one closes it. A screen
 * with nine open cards is the list she was trying to make sense of.
 *
 * THE LEAD SENTENCE IS ONLY PRINTED WHERE IT IS TRUE. `isElevated` is
 * decided in the view builder from the same threshold the coach's side
 * uses, so a quiet card carries its band's calm line and nothing that
 * claims something is showing up strongly.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { fillToken, memberCopy } from '@/lib/whole-body-signal/copyKeys';
import type { MemberResultsView, MemberSectionCard } from '@/lib/whole-body-signal/memberView';

/**
 * Tone by band step, quietest first. Warmth and contrast step up with the
 * band, which is the whole colour language on this screen: no hue carries
 * a verdict.
 */
const TONES = [
  {
    card: 'border-[#F5F0E4]/10 bg-[#F5F0E4]/[0.04]',
    bar: 'bg-[#F5F0E4]/35',
    label: 'text-[#F5F0E4]/55',
  },
  {
    card: 'border-[#F5F0E4]/14 bg-[#F5F0E4]/[0.07]',
    bar: 'bg-[#F5F0E4]/55',
    label: 'text-[#F5F0E4]/65',
  },
  {
    card: 'border-[#C4A050]/30 bg-[#C4A050]/[0.10]',
    bar: 'bg-[#C4A050]/70',
    label: 'text-[#F5F0E4]/80',
  },
  { card: 'border-[#C4A050]/55 bg-[#C4A050]/[0.16]', bar: 'bg-[#C4A050]', label: 'text-[#F5F0E4]' },
];

function toneFor(step: number) {
  return TONES[Math.min(Math.max(step, 1), TONES.length) - 1]!;
}

/** The share of the rail one bar fills. The band's step, drawn. */
function widthFor(card: MemberSectionCard): string {
  const steps = Math.max(1, card.bandCount);
  const share = Math.min(Math.max(card.bandStep, 1), steps) / steps;
  // A floor, so the quietest band is still a bar rather than a dot.
  return `${Math.round(Math.max(0.22, share) * 100)}%`;
}

export function WholeBodySignalResults({
  view,
  copy,
  action,
}: {
  view: MemberResultsView;
  copy: Record<string, string>;
  action: React.ReactNode;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div>
      <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-tight text-[#F5F0E4]">
        {memberCopy(copy, 'member.results_heading')}
      </h1>
      <p className="mt-3 text-[16px] leading-relaxed text-[#F5F0E4]/80">
        {memberCopy(copy, 'member.results_intro')}
      </p>

      {view.topSectionName && (
        <div className="mef-wbs-card-in mt-7 rounded-3xl border border-[#C4A050]/45 bg-[#C4A050]/[0.13] p-5">
          <p className="font-[family-name:var(--font-cormorant-garamond)] text-[22px] leading-snug text-[#F5F0E4]">
            {view.topSectionName}
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-[#F5F0E4]/75">
            {memberCopy(copy, 'member.priority_card_line')}
          </p>
        </div>
      )}

      {/*
        The signal landscape. One column, thin bars, loudest first.

        THE HEADING ONLY EXISTS WHEN THERE ARE BARS UNDER IT. A sitting
        whose stored sections could not be matched to content has no
        landscape, and a label over nothing is a promise the screen does
        not keep.
      */}
      {view.cards.length > 0 && (
        <section className="mt-9" aria-label={memberCopy(copy, 'member.results_landscape_label')}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
            {memberCopy(copy, 'member.results_landscape_label')}
          </p>
          <ul className="mt-4 list-none space-y-3">
            {view.cards.map((card, index) => {
              const tone = toneFor(card.bandStep);
              return (
                <li key={card.sectionKey} className="flex items-center gap-3">
                  <span className="w-[42%] shrink-0 truncate text-[13px] text-[#F5F0E4]/75">
                    {card.sectionName}
                  </span>
                  <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-[#F5F0E4]/10">
                    <span
                      className={`mef-wbs-bar block h-full rounded-full ${tone.bar}`}
                      style={{ width: widthFor(card), animationDelay: `${180 + index * 70}ms` }}
                    />
                  </span>
                  <span className={`w-[62px] shrink-0 text-right text-[11px] ${tone.label}`}>
                    {card.intensityWord}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* The cards, grouped under their band names, loudest group first. */}
      <div className="mt-9 space-y-8">
        {view.groups.map((group) => (
          <section key={group.bandKey} aria-label={group.bandLabel}>
            <h2 className="font-[family-name:var(--font-cormorant-garamond)] text-[20px] text-[#F5F0E4]">
              {group.bandLabel}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-[#F5F0E4]/55">{group.bandLine}</p>

            <ul className="mt-4 list-none space-y-3">
              {group.sectionKeys.map((sectionKey) => {
                const card = view.cards.find((entry) => entry.sectionKey === sectionKey);
                if (!card) return null;
                const tone = toneFor(card.bandStep);
                const open = openKey === card.sectionKey;
                return (
                  <li key={card.sectionKey}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenKey(open ? null : card.sectionKey)}
                      className={`mef-focus-ring mef-press flex w-full items-center justify-between gap-3 rounded-3xl border px-5 py-4 text-left transition ${tone.card}`}
                    >
                      <span className="font-[family-name:var(--font-cormorant-garamond)] text-[20px] leading-snug text-[#F5F0E4]">
                        {card.sectionName}
                      </span>
                      <ChevronDown
                        className={`h-5 w-5 shrink-0 text-[#F5F0E4]/55 transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                      />
                    </button>

                    {open && (
                      <div className="mef-wbs-card-in mt-2 rounded-3xl border border-[#F5F0E4]/10 bg-[#F5F0E4]/[0.04] px-5 py-5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
                          {card.bandLabel}
                        </p>
                        <p className="mt-2 text-[15px] leading-relaxed text-[#F5F0E4]/85">
                          {card.isElevated
                            ? fillToken(
                                memberCopy(copy, 'member.section_card_lead'),
                                'area',
                                card.areaPhrase
                              )
                            : card.bandLine}
                        </p>

                        {card.themes.length > 0 && (
                          <div className="mt-4">
                            <p className="text-[12px] uppercase tracking-wide text-[#F5F0E4]/45">
                              {memberCopy(copy, 'member.section_card_themes_label')}
                            </p>
                            <ul className="mt-2 list-none space-y-1.5">
                              {card.themes.map((theme) => (
                                <li
                                  key={theme}
                                  className="flex items-start gap-2 text-[15px] leading-relaxed text-[#F5F0E4]/85"
                                >
                                  <span
                                    aria-hidden="true"
                                    className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#C4A050]"
                                  />
                                  <span>{theme}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="mt-5 border-t border-[#F5F0E4]/10 pt-4">
                          <p className="text-[15px] font-semibold text-[#F5F0E4]">
                            {memberCopy(copy, 'member.section_card_next_heading')}
                          </p>
                          <p className="mt-1.5 text-[14px] leading-relaxed text-[#F5F0E4]/70">
                            {memberCopy(copy, 'member.section_card_next_body')}
                          </p>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-10 border-t border-[#F5F0E4]/10 pt-7">
        <p className="font-[family-name:var(--font-cormorant-garamond)] text-[22px] leading-snug text-[#F5F0E4]">
          {memberCopy(copy, 'member.closing_line_1')}
        </p>
        <p className="mt-3 text-[16px] leading-relaxed text-[#F5F0E4]/80">
          {memberCopy(copy, 'member.closing_line_2')}
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-[#F5F0E4]/60">
          {memberCopy(copy, 'member.closing_line_3')}
        </p>
        {action}
      </div>
    </div>
  );
}
