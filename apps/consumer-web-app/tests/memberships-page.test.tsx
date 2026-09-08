/**
 * THE PUBLIC MEF WELLNESS MEMBERSHIP PAGE.
 *
 * Three things have to stay true about /memberships and none of them is a
 * matter of taste.
 *
 * 1. THE COPY IS THE PRODUCT. Every word on this page was approved before
 *    it was built (docs/assessments/memberships-reference.html). A price, a
 *    cancellation sentence or a tier bullet that drifts is a promise this
 *    business did not make, so the reference file itself is read here and
 *    the shipped page is checked against it rather than against a second
 *    copy of the strings typed into this test.
 *
 * 2. IT IS REACHABLE WITH NO ACCOUNT. Everybody it is written for is
 *    logged out.
 *
 * 3. IT CHANGES NOTHING THAT BELONGS TO A MEMBER. Not the Rooted Reset
 *    subscription screen at /membership, not the trial lock, not
 *    MEMBERSHIP_PRICING_URL, not one route's protection.
 *
 * The rendering assertions run the real page component through
 * renderToStaticMarkup and read the real HTML, so document order and
 * attributes are facts rather than claims about the source.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import MembershipsPage from '../app/memberships/page';
import { EnergyResultView } from '../components/public-entry/EnergyResultView';
import { buildEnergyResult } from '../lib/public-entry/result';
import {
  ASSESSMENT_INCLUDES,
  FAQ_ITEMS,
  MEMBERSHIP_PRICES,
  MEMBERSHIP_TIERS,
  PHILOSOPHY_PILLARS,
  POLICY_ITEMS,
  ROOTED_PANEL_BULLETS,
  TRAVEL_CLOSE_LINE,
} from '../lib/memberships/content';
import {
  ASSESSMENT_BOOKING_FALLBACK,
  ASSESSMENT_CTA_LABEL,
  assessmentBookingUrl,
} from '../lib/memberships/booking';
import { MEMBERSHIP_CHECKOUT_URLS } from '../lib/memberships/content';

const REPO_ROOT = path.resolve(__dirname, '..');
const MONOREPO_ROOT = path.resolve(REPO_ROOT, '..', '..');

const html = renderToStaticMarkup(<MembershipsPage />);

const referenceHtml = fs.readFileSync(
  path.resolve(MONOREPO_ROOT, 'docs/assessments/memberships-reference.html'),
  'utf-8'
);

/** HTML entities the renderer emits, resolved back to the characters a reader sees. */
function asText(source: string): string {
  return source
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** The rendered page as plain text, tags stripped, whitespace collapsed. */
const pageText = asText(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ');

/** The approved reference as plain text, the same way, so the two are comparable. */
const referenceText = asText(referenceHtml.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ');

function normalise(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

describe('the approved copy shipped verbatim', () => {
  const APPROVED_SENTENCES = [
    // Hero
    'More than training. A system for your health.',
    'MEF Wellness combines personal training, movement, recovery, and holistic coaching into one ongoing relationship, built around your body, your goals, and the way you actually live.',
    'In-person training in Brooklyn and Manhattan. Coaching that continues wherever life takes you.',
    'See the Memberships',
    // Philosophy
    'This is not personal training by the hour.',
    'You are not purchasing workout sessions. You are entering an ongoing wellness and training system.',
    // Starting point
    'Every client begins in the same place.',
    'Your starting point',
    'Initial Assessment & Training Session',
    'Book Your Assessment',
    // Memberships
    'Three levels of support.',
    'The core MEF membership',
    'Not sure which level fits?',
    // Travel, including the two sentences that must never be softened
    "Your training location may change. Your coaching relationship doesn't have to.",
    'it does not create unlimited make-up sessions, and unused in-person sessions do not stack up while you are away',
    'You return on track instead of behind.',
    TRAVEL_CLOSE_LINE,
    // Policy
    'Scheduling, cancellations, and missed sessions.',
    'Your membership reserves dedicated coaching capacity every month. Two simple guidelines keep that time valuable for you and fair for everyone.',
    'Real life happens. Emergencies and unusual situations are always handled personally, not by policy.',
    // Rooted Reset
    'INCLUDED WITH EVERY MEMBERSHIP',
    'Rooted Reset',
    'Rooted Reset also offers its own standalone memberships. As an MEF Wellness member, full access is simply included.',
    "Your coaching doesn't end when the session does.",
    // FAQ heading and final CTA
    'Questions people actually ask.',
    'Begin with MEF Wellness.',
    'Questions first? Ask them at your assessment. That is what it is for.',
    // Footer
    'MEF WELLNESS',
    'In-person training in Brooklyn and Manhattan. Coaching, Rooted Reset, and travel support wherever you are.',
    'Rooted Reset is the digital wellness platform of MEF Wellness.',
  ];

  it.each(APPROVED_SENTENCES)('renders, word for word: %s', (sentence) => {
    expect(pageText).toContain(normalise(sentence));
  });

  it('every approved sentence checked above is genuinely in the reference file, so this suite cannot drift from the source of truth', () => {
    for (const sentence of APPROVED_SENTENCES) {
      expect(referenceText, `not in the reference: ${sentence}`).toContain(normalise(sentence));
    }
  });

  it('renders all three philosophy pillars, both their headings and their bodies', () => {
    for (const pillar of PHILOSOPHY_PILLARS) {
      expect(pageText).toContain(normalise(pillar.title));
      expect(pageText).toContain(normalise(pillar.body));
      expect(referenceText).toContain(normalise(pillar.body));
    }
  });

  it('renders every assessment inclusion', () => {
    for (const item of ASSESSMENT_INCLUDES) {
      expect(pageText).toContain(normalise(item));
      expect(referenceText).toContain(normalise(item));
    }
  });

  it('renders all three tiers, with their audience line and every bullet', () => {
    expect(MEMBERSHIP_TIERS).toHaveLength(3);
    for (const tier of MEMBERSHIP_TIERS) {
      expect(pageText).toContain(tier.name);
      expect(pageText).toContain(normalise(tier.audience));
      expect(referenceText).toContain(normalise(tier.audience));
      for (const bullet of tier.bullets) {
        expect(pageText).toContain(normalise(bullet));
        expect(referenceText).toContain(normalise(bullet));
      }
    }
  });

  it('keeps the Total Wellness differentiation intact, which is the one thing prospects ask about', () => {
    const total = MEMBERSHIP_TIERS.find((tier) => tier.key === 'total');
    expect(total?.bullets[0]).toBe('Everything in MEF Performance');
    expect(pageText).toContain(
      'A dedicated monthly wellness coaching session, separate from your training'
    );
    expect(pageText).toContain('Monthly review of your Rooted Reset check-ins and patterns');
    // And the FAQ answer that explains it is not simply more workouts.
    expect(pageText).toContain('It is not more workouts. It is a coaching layer on top of Performance');
  });

  it('renders both policy accordions in full', () => {
    expect(POLICY_ITEMS).toHaveLength(2);
    for (const item of POLICY_ITEMS) {
      expect(pageText).toContain(normalise(item.question));
      expect(pageText).toContain(normalise(item.answer));
      expect(referenceText).toContain(normalise(item.answer));
    }
  });

  it('renders every Rooted Reset panel bullet', () => {
    for (const bullet of ROOTED_PANEL_BULLETS) {
      expect(pageText).toContain(normalise(bullet));
      expect(referenceText).toContain(normalise(bullet));
    }
  });

  it('renders all twelve FAQ items, question and answer, in the approved order', () => {
    expect(FAQ_ITEMS).toHaveLength(12);
    let previous = -1;
    for (const item of FAQ_ITEMS) {
      const at = pageText.indexOf(normalise(item.question));
      expect(at, `not rendered: ${item.question}`).toBeGreaterThan(previous);
      previous = at;
      expect(pageText).toContain(normalise(item.answer));
      expect(referenceText).toContain(normalise(item.answer));
    }
  });

  it('contains no em dash, the standing rule for anything a person reads here', () => {
    expect(html).not.toContain('—');
  });
});

describe('the hero headline', () => {
  const h1 = html.slice(html.indexOf('<h1'), html.indexOf('</h1>'));

  it('is set in capitals by CSS, not by retyping the sentence in capitals', () => {
    expect(h1).toContain('uppercase');
    // The approved sentence, in its approved casing, is what is really in
    // the markup: what a screen reader announces, what a search engine
    // indexes, and what somebody gets if they copy the line.
    expect(asText(h1)).toContain('More than training.');
    expect(asText(h1)).toContain('system for your health.');
    expect(html).not.toContain('MORE THAN TRAINING');
  });

  it('still reads as the approved sentence once whitespace is normalised', () => {
    // The non-breaking space that keeps "A system" together is still a
    // space: \s matches it, so the verbatim check above is unaffected.
    expect(pageText).toContain('More than training. A system for your health.');
  });

  it('keeps "A" tied to the word it belongs with, so it is never stranded at a line end', () => {
    expect(asText(h1)).toContain('A\u00A0system');
  });

  it('carries the tracking and tighter leading that capitals need', () => {
    expect(h1).toMatch(/tracking-\[/);
    expect(h1).toMatch(/leading-\[1\.0/);
  });

  it('is the only heading on the page set in capitals, so the hero keeps its own weight', () => {
    const headings = [...html.matchAll(/<h[123]\b[^>]*>/g)].map((m) => m[0]);
    expect(headings.filter((tag) => tag.includes('uppercase'))).toHaveLength(1);
  });
});

describe('the four prices', () => {
  it('are the approved figures', () => {
    expect(MEMBERSHIP_PRICES).toEqual({
      assessment: '$175',
      essential: '$550',
      performance: '$1,050',
      total: '$1,350',
    });
  });

  it.each(Object.values(MEMBERSHIP_PRICES))('appears exactly once on the page: %s', (price) => {
    const occurrences = pageText.split(price).length - 1;
    expect(occurrences).toBe(1);
  });

  it('each is the same figure the approved reference carries', () => {
    for (const price of Object.values(MEMBERSHIP_PRICES)) {
      expect(referenceText).toContain(price);
    }
  });

  it('is written down in exactly one file: the page itself types no dollar figure', () => {
    const pageSrc = fs.readFileSync(path.resolve(REPO_ROOT, 'app/memberships/page.tsx'), 'utf-8');
    expect(pageSrc).not.toMatch(/\$\d/);
  });
});

describe('every call to action points at one address', () => {
  const hrefs = [...html.matchAll(/<a\b[^>]*href="([^"]*)"/g)].map((m) => m[1]!);

  it('renders seven links out of the page: three assessment buttons, three tier buttons, and the in-page anchor', () => {
    expect(hrefs).toHaveLength(7);
    expect(hrefs.filter((href) => href === '#memberships')).toHaveLength(1);
  });

  it('sends all three assessment buttons to one and the same resolved address', () => {
    const booking = hrefs.filter((href) => href === assessmentBookingUrl());
    expect(booking).toHaveLength(3);
  });

  it('resolves the assessment buttons to the committed Stripe one-time checkout, not the mail draft', () => {
    // Nothing is configured in the test environment, which is exactly the
    // state production runs in: no override set, so the committed address
    // is what a prospect gets.
    expect(assessmentBookingUrl()).toBe(MEMBERSHIP_CHECKOUT_URLS.assessment);
    expect(assessmentBookingUrl()).not.toBe(ASSESSMENT_BOOKING_FALLBACK);
  });

  it('still lets NEXT_PUBLIC_ASSESSMENT_BOOKING_URL override it, so a link can be changed with no deploy', () => {
    // Read at call time rather than captured at module load, which is what
    // makes the override a configuration change rather than a rebuild.
    const before = process.env.NEXT_PUBLIC_ASSESSMENT_BOOKING_URL;
    try {
      process.env.NEXT_PUBLIC_ASSESSMENT_BOOKING_URL = 'https://example.test/override';
      expect(assessmentBookingUrl()).toBe('https://example.test/override');
      // Whitespace is not a destination: it falls through to the committed one.
      process.env.NEXT_PUBLIC_ASSESSMENT_BOOKING_URL = '   ';
      expect(assessmentBookingUrl()).toBe(MEMBERSHIP_CHECKOUT_URLS.assessment);
    } finally {
      if (before === undefined) delete process.env.NEXT_PUBLIC_ASSESSMENT_BOOKING_URL;
      else process.env.NEXT_PUBLIC_ASSESSMENT_BOOKING_URL = before;
    }
  });

  it('keeps the mail draft as the floor under both, so the button can never go nowhere', () => {
    expect(ASSESSMENT_BOOKING_FALLBACK).toBe(
      'mailto:info@mefwellness.com?subject=Assessment%20Booking'
    );
  });

  it('carries the primary call to action label in the hero and again at the close', () => {
    expect(ASSESSMENT_CTA_LABEL).toBe('Start With Your Assessment');
    expect(pageText.split(ASSESSMENT_CTA_LABEL).length - 1).toBe(2);
  });

  it('builds no checkout of its own: Stripe does the whole transaction on its own page', () => {
    const pageSrc = fs.readFileSync(path.resolve(REPO_ROOT, 'app/memberships/page.tsx'), 'utf-8');
    // Links out, never a form in. Nothing here collects a card, posts a
    // payment, or records that one happened.
    expect(pageSrc).not.toContain('<form');
    expect(pageSrc).not.toContain('<input');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<input');
    // And the page never types a Stripe address of its own: every one comes
    // from the single table in content.ts.
    expect(pageSrc).not.toContain('buy.stripe.com');
  });

  it('never repoints the Rooted Reset app links: this page does not read MEMBERSHIP_PRICING_URL or the discovery call', () => {
    const bookingSrc = fs.readFileSync(path.resolve(REPO_ROOT, 'lib/memberships/booking.ts'), 'utf-8');
    const pageSrc = fs.readFileSync(path.resolve(REPO_ROOT, 'app/memberships/page.tsx'), 'utf-8');
    for (const src of [bookingSrc, pageSrc]) {
      // Nothing here IMPORTS the app's own conversion links module, which
      // is what would couple this marketing page to the Rooted Reset
      // subscription funnel. Naming it in prose is fine and deliberate:
      // both files explain why the two are separate.
      expect(src).not.toMatch(/from '[^']*conversionLinks'/);
    }
    // And the app's own conversion links module is untouched by this build.
    const conversionSrc = fs.readFileSync(
      path.resolve(REPO_ROOT, 'lib/config/conversionLinks.ts'),
      'utf-8'
    );
    expect(conversionSrc).not.toContain('ASSESSMENT_BOOKING');
    expect(conversionSrc).not.toContain('/memberships');
  });
});

describe('the four Stripe checkout links', () => {
  const anchors = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);

  /** The opening tag of the one link whose href is exactly this. */
  function anchorFor(href: string): string {
    const found = anchors.filter((tag) => tag.includes(`href="${href}"`));
    expect(found.length, `expected at least one link to ${href}`).toBeGreaterThan(0);
    return found[0]!;
  }

  it('are the four addresses verified in a browser on 2026-09-08, unchanged', () => {
    // These exact strings were each loaded and read before they shipped:
    // the assessment page says "Pay MEF Wellness" and $175.00 with no
    // recurring terms, and the three tier pages each say "Subscribe to"
    // that tier, its monthly figure, and "Billed monthly". If one of these
    // changes, re-verify it the same way before trusting it.
    expect(MEMBERSHIP_CHECKOUT_URLS).toEqual({
      assessment: 'https://buy.stripe.com/6oU14mgSu3DX2WFaLKdQQ05',
      essential: 'https://buy.stripe.com/00wbJ031E1vP68R4nmdQQ06',
      performance: 'https://buy.stripe.com/14A00iau66Q9btb4nmdQQ07',
      total: 'https://buy.stripe.com/3cIfZgbya6Q98gZ9HGdQQ08',
    });
  });

  it('are four different addresses, so no two buttons charge the same thing', () => {
    const all = Object.values(MEMBERSHIP_CHECKOUT_URLS);
    expect(new Set(all).size).toBe(4);
    for (const url of all) expect(url.startsWith('https://buy.stripe.com/')).toBe(true);
  });

  it('cover exactly the four priced things, keyed identically to the prices', () => {
    expect(Object.keys(MEMBERSHIP_CHECKOUT_URLS).sort()).toEqual(
      Object.keys(MEMBERSHIP_PRICES).sort()
    );
  });

  it('live in one file: neither the page nor the booking module types a Stripe address', () => {
    for (const file of ['app/memberships/page.tsx', 'lib/memberships/booking.ts']) {
      const src = fs.readFileSync(path.resolve(REPO_ROOT, file), 'utf-8');
      expect(src, `${file} types a Stripe URL of its own`).not.toContain('buy.stripe.com');
    }
    const contentSrc = fs.readFileSync(
      path.resolve(REPO_ROOT, 'lib/memberships/content.ts'),
      'utf-8'
    );
    // Once each in the table, and nowhere else in that file either.
    for (const url of Object.values(MEMBERSHIP_CHECKOUT_URLS)) {
      expect(contentSrc.split(url).length - 1).toBe(1);
    }
  });

  it('gives each tier card its own button, pointing at that tier and no other', () => {
    for (const tier of MEMBERSHIP_TIERS) {
      const href = MEMBERSHIP_CHECKOUT_URLS[tier.key];
      const matching = anchors.filter((tag) => tag.includes(`href="${href}"`));
      expect(matching, `${tier.name} has no button`).toHaveLength(1);
      expect(pageText).toContain(tier.joinLabel);
    }
  });

  it('labels the three tier buttons the way a customer reads them', () => {
    expect(MEMBERSHIP_TIERS.map((t) => t.joinLabel)).toEqual([
      'Join Essential',
      'Join Performance',
      'Join Total Wellness',
    ]);
  });

  it('keeps the assessment as the primary action: the tier buttons are outlined, never filled', () => {
    // A filled background that is NOT behind a hover: prefix. The tier
    // buttons may well fill on hover, and should; they must not arrive
    // filled, which is what would make them read as the main action.
    const restingFill = /(^|\s)bg-\[#[0-9A-Fa-f]{6}\]/;
    for (const tier of MEMBERSHIP_TIERS) {
      const tag = anchorFor(MEMBERSHIP_CHECKOUT_URLS[tier.key]);
      expect(tag).toContain('bg-transparent');
      expect(tag, `${tier.name} arrives filled`).not.toMatch(restingFill);
    }
    // While the assessment buttons stay filled at rest.
    expect(anchorFor(assessmentBookingUrl())).toMatch(restingFill);
  });

  it('opens every checkout in a new tab, with the opener closed off', () => {
    const checkoutHrefs = [assessmentBookingUrl(), ...Object.values(MEMBERSHIP_CHECKOUT_URLS)];
    for (const href of new Set(checkoutHrefs)) {
      for (const tag of anchors.filter((t) => t.includes(`href="${href}"`))) {
        expect(tag, `not new-tab: ${href}`).toContain('target="_blank"');
        expect(tag, `no rel=noopener: ${href}`).toContain('rel="noopener"');
      }
    }
  });

  it('leaves the in-page anchor alone: "See the Memberships" must not open a tab', () => {
    const anchor = anchorFor('#memberships');
    expect(anchor).not.toContain('target="_blank"');
  });

  it('adds no urgency copy and no new sentence beside a price', () => {
    for (const word of ['Limited', 'limited time', 'Only', 'Hurry', 'spots left', 'Save ', 'Best value']) {
      expect(pageText).not.toContain(word);
    }
  });
});

describe('the three photographs', () => {
  const PHOTOS = [
    'membership-hero.jpg',
    'membership-travel.jpg',
    'membership-rooted.jpg',
  ] as const;

  it.each(PHOTOS)('the file is really in the repo: %s', (file) => {
    const full = path.resolve(REPO_ROOT, 'public/images/memberships', file);
    expect(fs.existsSync(full), `missing: ${full}`).toBe(true);
    expect(fs.statSync(full).size).toBeGreaterThan(1000);
  });

  it('renders all three through next/image, as local assets', () => {
    const pageSrc = fs.readFileSync(path.resolve(REPO_ROOT, 'app/memberships/page.tsx'), 'utf-8');
    expect(pageSrc).toContain("import Image from 'next/image'");
    for (const file of PHOTOS) {
      expect(pageSrc).toContain(`/images/memberships/${file}`);
    }
    // Three <img> elements in the output, all from next/image's optimizer.
    const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    expect(imgs).toHaveLength(3);
    for (const img of imgs) {
      // next/image's own optimizer endpoint, and the responsive candidate
      // set it generates. React emits the attribute as `srcSet` in static
      // markup; the browser receives `srcset`.
      expect(img).toContain('/_next/image');
      expect(img.toLowerCase()).toContain('srcset=');
      expect(img).toContain('sizes=');
    }
  });

  it('gives each photograph meaningful alt text describing what is in it, not a filename', () => {
    const alts = [...html.matchAll(/<img\b[^>]*\salt="([^"]*)"/g)].map((m) => asText(m[1]!));
    expect(alts).toHaveLength(3);
    for (const alt of alts) {
      expect(alt.length).toBeGreaterThan(40);
      expect(alt).not.toContain('.jpg');
      expect(alt.toLowerCase()).toContain('woman');
    }
    expect(alts[0]).toContain('training studio');
    expect(alts[1]).toContain('hotel room');
    expect(alts[2]).toContain('tablet');
  });

  it('loads the hero first and the other two lazily, so the first thing on screen is not waiting behind the other two', () => {
    const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    // priority on the hero: fetched at high priority, never deferred.
    expect(imgs[0]).toContain('fetchpriority="high"');
    expect(imgs[0]).not.toContain('loading="lazy"');
    expect(imgs[1]).toContain('loading="lazy"');
    expect(imgs[2]).toContain('loading="lazy"');
  });

  it('reserves each photograph its space at every breakpoint, so nothing on the page moves when a file arrives', () => {
    const pageSrc = fs.readFileSync(path.resolve(REPO_ROOT, 'app/memberships/page.tsx'), 'utf-8');
    // Every figure carries a fixed height per breakpoint plus overflow-hidden,
    // rather than growing to whatever the image turns out to be.
    const figures = [...pageSrc.matchAll(/<figure className="([^"]*)"/g)].map((m) => m[1]!);
    expect(figures).toHaveLength(3);
    for (const className of figures) {
      expect(className).toMatch(/\bh-\[\d+px\]/);
      expect(className).toContain('overflow-hidden');
      expect(className).toContain('relative');
    }
  });

  it('crops toward the subject rather than stretching, and tunes the crop per breakpoint', () => {
    const pageSrc = fs.readFileSync(path.resolve(REPO_ROOT, 'app/memberships/page.tsx'), 'utf-8');
    const imageClasses = [...pageSrc.matchAll(/className="object-cover ([^"]*)"/g)].map((m) => m[1]!);
    expect(imageClasses).toHaveLength(3);
    for (const className of imageClasses) {
      // A base object-position and a wider-viewport override for each.
      expect(className).toMatch(/^object-\[/);
      expect(className).toMatch(/min-\[\d+px\]:object-\[/);
    }
    // object-cover everywhere: never object-fill, which would distort a face.
    expect(pageSrc).not.toContain('object-fill');
    expect(pageSrc).not.toContain('object-contain');
  });

  it('never lays text over a photograph: every figure holds the image and nothing else', () => {
    const pageSrc = fs.readFileSync(path.resolve(REPO_ROOT, 'app/memberships/page.tsx'), 'utf-8');
    for (const block of pageSrc.split('<figure').slice(1)) {
      const figure = block.slice(0, block.indexOf('</figure>'));
      expect(figure).toContain('<Image');
      expect(figure).not.toContain('<p');
      expect(figure).not.toContain('<h1');
      expect(figure).not.toContain('<h2');
      expect(figure).not.toContain('<span');
    }
  });
});

describe('the accordions work with no JavaScript at all', () => {
  it('renders fourteen native details elements, two policy plus twelve FAQ', () => {
    const details = [...html.matchAll(/<details\b/g)];
    expect(details).toHaveLength(POLICY_ITEMS.length + FAQ_ITEMS.length);
    expect(details).toHaveLength(14);
  });

  it('starts every one of them closed', () => {
    const openTags = [...html.matchAll(/<details\b[^>]*>/g)].map((m) => m[0]);
    for (const tag of openTags) {
      expect(tag).not.toContain('open');
    }
  });

  it('gives every one a summary, which is what makes it keyboard operable without a click handler', () => {
    expect([...html.matchAll(/<summary\b/g)]).toHaveLength(14);
    expect(html).not.toContain('onClick');
  });

  it('the page ships as a server component, so none of this depends on hydration', () => {
    const pageSrc = fs.readFileSync(path.resolve(REPO_ROOT, 'app/memberships/page.tsx'), 'utf-8');
    expect(pageSrc).not.toContain("'use client'");
    expect(pageSrc).not.toContain('useState');
    expect(pageSrc).not.toContain('useEffect');
  });
});

describe('the page is public, and nothing else about route protection moved', () => {
  const middlewareSrc = fs.readFileSync(path.resolve(REPO_ROOT, 'middleware.ts'), 'utf-8');
  const publicPathsBlock = middlewareSrc.slice(
    middlewareSrc.indexOf('const PUBLIC_PATHS'),
    middlewareSrc.indexOf('];', middlewareSrc.indexOf('const PUBLIC_PATHS')) + 2
  );

  /**
   * The entries themselves, not the prose around them. The comments in that
   * block name neighbouring routes while explaining why each exemption
   * exists, and a substring search over the whole block would read one of
   * those as an entry.
   */
  const publicPaths = [...publicPathsBlock.matchAll(/^\s*'([^']+)',$/gm)].map((m) => m[1]!);

  it('/memberships is on the public allowlist, the same way /start and /energy are', () => {
    expect(publicPaths).toContain('/memberships');
    expect(publicPaths).toContain('/start');
    expect(publicPaths).toContain('/energy');
  });

  it('the member subscription screen at /membership is NOT made public by that entry', () => {
    expect(publicPaths).not.toContain('/membership');
    // The allowlist test is a startsWith, and '/membership' does not begin
    // with '/memberships', so the singular route keeps its login redirect.
    expect('/membership'.startsWith('/memberships')).toBe(false);
    expect('/memberships'.startsWith('/memberships')).toBe(true);
  });

  it('the page itself reads no session and redirects nobody, so a logged-out load and a hard refresh render identically', () => {
    const pageSrc = fs.readFileSync(path.resolve(REPO_ROOT, 'app/memberships/page.tsx'), 'utf-8');
    expect(pageSrc).not.toContain('redirect(');
    expect(pageSrc).not.toContain('getUser');
    expect(pageSrc).not.toContain('createClient');
    expect(pageSrc).not.toContain('cookies(');
  });

  it('renders no member chrome', () => {
    const pageSrc = fs.readFileSync(path.resolve(REPO_ROOT, 'app/memberships/page.tsx'), 'utf-8');
    expect(pageSrc).not.toContain('BottomNav');
    expect(pageSrc).not.toContain('AvatarLink');
    expect(pageSrc).not.toContain('FloatingCoachLauncher');
    expect(pageSrc).not.toContain('CheckinBar');
  });

  it('writes nothing: no insert, no upsert, no server action, no fetch', () => {
    const pageSrc = fs.readFileSync(path.resolve(REPO_ROOT, 'app/memberships/page.tsx'), 'utf-8');
    expect(pageSrc).not.toContain('.insert(');
    expect(pageSrc).not.toContain('.upsert(');
    expect(pageSrc).not.toContain("'use server'");
    expect(pageSrc).not.toContain('fetch(');
  });

  it('leaves the member-only prefix list exactly as it was, /membership included', () => {
    const routingSrc = fs.readFileSync(
      path.resolve(REPO_ROOT, 'lib/auth/staffRouting.ts'),
      'utf-8'
    );
    expect(routingSrc).toContain("'/membership'");
    expect(routingSrc).not.toContain("'/memberships'");
  });
});

describe('it is linked from one place in the public experience', () => {
  const resultSrc = fs.readFileSync(
    path.resolve(REPO_ROOT, 'components/public-entry/EnergyResultView.tsx'),
    'utf-8'
  );

  it('the public entry result screen carries exactly one link to it', () => {
    expect(resultSrc.split('href="/memberships"').length - 1).toBe(1);
  });

  it('the link sits below every existing offer on that screen, so it competes with none of them', () => {
    expect(resultSrc.indexOf('href="/memberships"')).toBeGreaterThan(
      resultSrc.indexOf('EMAIL_STEP_COPY.buttonLabel')
    );
    expect(resultSrc.indexOf('href="/memberships"')).toBeGreaterThan(
      resultSrc.indexOf('INVITATION_COPY.buttonLabel')
    );
  });

  it('really renders in the result screen\'s own HTML, as a link a reader can press', () => {
    const rendered = renderToStaticMarkup(
      <EnergyResultView
        result={buildEnergyResult({
          low_point: 'evening',
          morning_start: 'slow_but_fine',
          sleep_hours: 'six_to_seven',
          night_pattern: 'hard_to_fall_asleep',
          wind_down: 'screen_until_lights_out',
          first_food: 'mid_morning',
          afternoon_reach: 'caffeine',
          mental_load: 'a_lot',
          off_switch: 'cant_remember',
        })}
        visitorToken="visitor-token"
        onGoToSignup={() => {}}
      />
    );
    expect(rendered).toContain('href="/memberships"');
    expect(rendered).toContain('See the MEF Wellness memberships');
    // Last on that screen, after the email step, not competing with it.
    expect(rendered.indexOf('href="/memberships"')).toBeGreaterThan(
      rendered.indexOf('energy-email')
    );
  });

  it('is not added to member navigation anywhere', () => {
    const navSrc = fs.readFileSync(
      path.resolve(REPO_ROOT, 'components/BottomNav.tsx'),
      'utf-8'
    );
    expect(navSrc).not.toContain('/memberships');
  });
});
