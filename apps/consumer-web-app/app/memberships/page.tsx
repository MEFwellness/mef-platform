import type { Metadata } from 'next';
import Image from 'next/image';
import {
  ASSESSMENT_INCLUDES,
  FAQ_ITEMS,
  MEMBERSHIP_PRICES,
  MEMBERSHIP_TIERS,
  PHILOSOPHY_PILLARS,
  POLICY_ITEMS,
  ROOTED_PANEL_BULLETS,
  TRAVEL_CLOSE_LINE,
  type DisclosureItem,
} from '@/lib/memberships/content';
import { assessmentBookingUrl, ASSESSMENT_CTA_LABEL } from '@/lib/memberships/booking';

/**
 * THE PUBLIC MEF WELLNESS MEMBERSHIP PAGE.
 *
 * Who this is for: somebody who has never trained with MEF Wellness and is
 * deciding whether to book the initial assessment. Not a member, not signed
 * in, and quite possibly on a phone from a link somebody sent them.
 *
 * PUBLIC, AND IT HAS TO STAY PUBLIC. /memberships is on PUBLIC_PATHS in
 * middleware.ts, so a logged-out direct load and a hard refresh both render
 * rather than being redirected to /login. The three photographs live under
 * public/images/, which the middleware matcher already excludes, so they
 * were never gated. This page reads no session, calls no Supabase client
 * and renders nothing conditional on who is looking, which is why a
 * signed-in visitor sees exactly the same page rather than being bounced
 * into the app: somebody with a Rooted Reset account may perfectly well
 * want to read about in-person training.
 *
 * NO MEMBER CHROME. No bottom nav, no check-in bar, no avatar. Same
 * decision as /start and /energy, and for the same reason: a prospect who
 * has no account is not helped by the furniture of an app they cannot use.
 * The design system is shared though, not re-invented: forest #1B3A2D,
 * gold #C4A050, cream #F5F0E4, Cormorant Garamond for display and DM Sans
 * for body, the same palette and type pairing every public surface in this
 * product already wears (components/core-values-snapshot/theme.ts).
 *
 * IT DECIDES NOTHING AND WRITES NOTHING. A pure render: no insert, no
 * claim, no schedule, no analytics beacon. There is no migration behind
 * this page and no row anywhere that knows it was opened.
 *
 * THE COPY IS APPROVED AND VERBATIM, and lives in lib/memberships/content.ts
 * so it can be read and checked without reading layout. The four prices are
 * written down exactly once, there, and rendered from there.
 *
 * NO SERVER COMPONENT BOUNDARY IS CROSSED FOR INTERACTIVITY. The two
 * accordion groups are native `<details>` elements, so the whole page ships
 * as static HTML with no client JavaScript at all. That is not a
 * micro-optimisation: it is why the page opens instantly on a phone on a
 * bad connection, which is the only device most of its readers will ever
 * use.
 */

const BOOKING_URL = assessmentBookingUrl();

const FOREST = '#1B3A2D';
const FOREST_DEEP = '#132A20';
const GOLD = '#C4A050';
const CREAM = '#F5F0E4';
const INK = '#2A3B33';

const DISPLAY = 'font-[family-name:var(--font-cormorant-garamond)]';
const BODY = 'font-[family-name:var(--font-dm-sans)]';

/** The one content column width, matching the approved reference exactly. */
const WRAP = 'mx-auto w-full max-w-[1040px] px-[22px]';

/** Section rhythm: tighter on a phone, generous from tablet up. */
const SECTION = 'py-[46px] min-[641px]:py-16';

/** Every section heading on this page is the same size. */
const SECTION_HEADING = `${DISPLAY} text-[clamp(30px,4.6vw,42px)] font-semibold leading-[1.15]`;

const BTN =
  'inline-block rounded-full border-2 px-[34px] py-4 text-[16px] font-bold no-underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#C4A050] focus-visible:ring-offset-[3px]';

/** Filled forest, for a call to action sitting on cream or white. */
const BTN_PRIMARY = `${BTN} border-[#1B3A2D] bg-[#1B3A2D] text-[#F5F0E4] hover:border-[#132A20] hover:bg-[#132A20]`;

/** Filled cream, for a call to action sitting on forest. Warms to gold on hover. */
const BTN_ON_CREAM = `${BTN} border-[#F5F0E4] bg-[#F5F0E4] text-[#1B3A2D] hover:border-[#C4A050] hover:bg-[#C4A050] hover:text-[#132A20]`;

/** Outlined cream, the quiet second action beside a primary one on forest. */
const BTN_QUIET_ON_FOREST = `${BTN} border-[#F5F0E4] bg-transparent text-[#F5F0E4] hover:bg-[#F5F0E4] hover:text-[#1B3A2D]`;

const DESCRIPTION =
  'MEF Wellness combines personal training, movement, recovery, and holistic coaching into one ongoing relationship. In-person training in Brooklyn and Manhattan, with coaching that continues wherever life takes you.';

export const metadata: Metadata = {
  title: 'Memberships | MEF Wellness',
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  openGraph: {
    title: 'MEF Wellness Memberships',
    description: DESCRIPTION,
    type: 'website',
  },
};

/** The short gold rule that opens most sections. */
function Rule() {
  return <hr className="mb-[22px] h-[3px] w-14 border-0 bg-[#C4A050]" aria-hidden="true" />;
}

/** A gold-dotted list item, the one bullet style this page uses. */
function Checks({ items, tone }: { items: readonly string[]; tone: 'ink' | 'cream' }) {
  return (
    <ul className="m-0 list-none p-0">
      {items.map((item) => (
        <li
          key={item}
          className={`relative mb-2.5 pl-[26px] text-[16px] leading-[1.65] ${
            tone === 'cream' ? 'text-[#EFEADB]' : 'text-[#2A3B33]'
          }`}
        >
          <span
            aria-hidden="true"
            className="absolute left-0 top-[9px] h-[9px] w-[9px] rounded-full bg-[#C4A050]"
          />
          {item}
        </li>
      ))}
    </ul>
  );
}

/**
 * One accordion row.
 *
 * A native `<details>`, closed on first paint, so it works with no
 * JavaScript, is keyboard operable for free, and is findable by the
 * browser's own in-page search. The plus sign is drawn with CSS and rotated
 * into a cross when the row is open.
 */
function Disclosure({ item }: { item: DisclosureItem }) {
  return (
    <details className="group border-b border-[#E3DCC8] py-1.5 first-of-type:mt-7 first-of-type:border-t">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-1 py-4 text-[17px] font-bold text-[#1B3A2D] [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#C4A050]">
        <span>{item.question}</span>
        <span
          aria-hidden="true"
          className="flex-none text-[24px] font-medium leading-none text-[#C4A050] transition-transform duration-200 group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className="max-w-[66ch] px-1 pb-4 text-[16px] leading-[1.65]">{item.answer}</div>
    </details>
  );
}

export default function MembershipsPage() {
  return (
    <div
      className={`${BODY} w-full text-[17px] leading-[1.65]`}
      style={{ backgroundColor: CREAM, color: INK }}
    >
      {/* HERO */}
      <header
        className="w-full py-[56px] pb-[50px] min-[641px]:py-[84px] min-[641px]:pb-[76px]"
        style={{ backgroundColor: FOREST, color: CREAM }}
      >
        <div className={WRAP}>
          <div className="grid gap-9 min-[900px]:grid-cols-[1.1fr_0.9fr] min-[900px]:items-center min-[900px]:gap-[52px]">
            <div>
              <div
                className="mb-[26px] text-[15px] font-bold tracking-[0.14em]"
                style={{ color: GOLD }}
              >
                MEF WELLNESS
              </div>
              <h1
                className={`${DISPLAY} mb-5 max-w-[16ch] text-[clamp(38px,6.5vw,60px)] font-semibold leading-[1.15]`}
                style={{ color: CREAM }}
              >
                More than training. A system for your health.
              </h1>
              <p className="mb-9 max-w-[56ch] text-[19px] text-[#E8E2D2]">
                MEF Wellness combines personal training, movement, recovery, and holistic coaching
                into one ongoing relationship, built around your body, your goals, and the way you
                actually live.
              </p>
              <div className="flex flex-wrap items-center gap-3.5">
                <a className={BTN_ON_CREAM} href={BOOKING_URL}>
                  {ASSESSMENT_CTA_LABEL}
                </a>
                <a className={BTN_QUIET_ON_FOREST} href="#memberships">
                  See the Memberships
                </a>
              </div>
              <p className="mt-4 text-[14px] text-[#CFC9B8]">
                In-person training in Brooklyn and Manhattan. Coaching that continues wherever life
                takes you.
              </p>
            </div>

            {/*
              Desktop: the photograph sits in the right-hand column beside
              the copy, editorial style. Phone: the grid collapses and it
              drops below the copy, cropped left of centre so she stays the
              subject rather than the wall behind her. Fixed heights per
              breakpoint rather than an intrinsic ratio, so the space is
              reserved before the file arrives and nothing on the page moves
              when it does. No text is ever laid over it.
            */}
            <figure className="relative m-0 h-[220px] w-full overflow-hidden rounded-[18px] border border-[#C4A050]/35 min-[641px]:h-[300px] min-[900px]:h-[380px]">
              <Image
                src="/images/memberships/membership-hero.jpg"
                alt="A woman sitting on a mat in a training studio after a session, one arm resting on her knee, with a stability ball, a water bottle and a rolled towel behind her."
                fill
                priority
                sizes="(min-width: 900px) 430px, 100vw"
                className="object-cover object-[35%_28%] min-[900px]:object-[45%_22%]"
              />
            </figure>
          </div>
        </div>
      </header>

      {/* PHILOSOPHY */}
      <section className={SECTION}>
        <div className={WRAP}>
          <Rule />
          <h2 className={SECTION_HEADING} style={{ color: FOREST }}>
            This is not personal training by the hour.
          </h2>
          <p className="mt-4 max-w-[62ch]">
            Anyone can sell you a workout. What most people are missing is a system that holds
            together between sessions: a plan that fits your life, someone paying attention to your
            progress, and support for the things that quietly decide your results: recovery, stress,
            sleep, and consistency.
          </p>
          <p
            className={`${DISPLAY} mb-2 mt-7 max-w-[26ch] text-[clamp(24px,3.6vw,32px)] font-semibold leading-[1.3]`}
            style={{ color: FOREST }}
          >
            You are not purchasing workout sessions. You are entering an ongoing wellness and
            training system.
          </p>
          <div className="mt-10 grid gap-[26px] min-[820px]:grid-cols-3">
            {PHILOSOPHY_PILLARS.map((pillar) => (
              <div key={pillar.title}>
                <h3
                  className={`${DISPLAY} mb-2 text-2xl font-semibold leading-[1.15]`}
                  style={{ color: FOREST }}
                >
                  {pillar.title}
                </h3>
                <p className="max-w-[62ch] text-[16px]">{pillar.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STARTING POINT */}
      <section id="start" className={`${SECTION} bg-white`}>
        <div className={WRAP}>
          <div className="grid gap-9 min-[880px]:grid-cols-[1.1fr_0.9fr] min-[880px]:items-center">
            <div>
              <Rule />
              <h2 className={SECTION_HEADING} style={{ color: FOREST }}>
                Every client begins in the same place.
              </h2>
              <p className="mt-4 max-w-[62ch]">
                Before recommending anything, I need to understand you: how you move, where you are
                starting from, what your life demands, and what you want your health to look like.
                That is what your first session is for.
              </p>
              <p className="mt-3.5 max-w-[62ch]">
                You will train, you will experience the MEF approach firsthand, and you will leave
                with a clear, professional recommendation for your level of support. You never have
                to diagnose yourself or guess at a package. The decision is always yours, but you
                will not be making it alone.
              </p>
            </div>

            <div className="rounded-[18px] border border-[#E3DCC8] px-[30px] py-[34px]" style={{ backgroundColor: CREAM }}>
              <div className="mb-1.5 text-[15px] font-bold" style={{ color: FOREST }}>
                Your starting point
              </div>
              <h3
                className={`${DISPLAY} mb-1.5 text-[28px] font-semibold leading-[1.15]`}
                style={{ color: FOREST }}
              >
                Initial Assessment &amp; Training Session
              </h3>
              <span className="mb-[18px] block text-[22px] font-bold" style={{ color: FOREST }}>
                {MEMBERSHIP_PRICES.assessment}{' '}
                <small className="text-[15px] font-medium text-[#6B7A70]">one time</small>
              </span>
              <div className="mb-6">
                <Checks items={ASSESSMENT_INCLUDES} tone="ink" />
              </div>
              <a className={BTN_PRIMARY} href={BOOKING_URL}>
                Book Your Assessment
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* MEMBERSHIPS */}
      <section id="memberships" className={SECTION} style={{ backgroundColor: CREAM }}>
        <div className={WRAP}>
          <Rule />
          <h2 className={SECTION_HEADING} style={{ color: FOREST }}>
            Three levels of support.
          </h2>
          <p className="mb-2 mt-4 max-w-[62ch]">
            Every membership is an ongoing coaching relationship, billed monthly. Each one includes
            individualized programming, full access to Rooted Reset, and support between sessions.
            The difference is how much of your life we work on together.
          </p>

          <div className="mt-9 grid gap-[22px] min-[920px]:grid-cols-3 min-[920px]:items-stretch">
            {MEMBERSHIP_TIERS.map((tier) => (
              <div
                key={tier.key}
                className={`flex flex-col rounded-[18px] border px-7 py-[34px] ${
                  tier.featured ? 'border-[#1B3A2D] bg-[#1B3A2D]' : 'border-[#E3DCC8] bg-white'
                }`}
              >
                {tier.flag && (
                  <span
                    className="mb-4 self-start rounded-full px-3.5 py-[5px] text-[13px] font-bold tracking-[0.04em]"
                    style={{ backgroundColor: GOLD, color: FOREST_DEEP }}
                  >
                    {tier.flag}
                  </span>
                )}
                <h3
                  className={`${DISPLAY} mb-1 text-[27px] font-semibold leading-[1.15]`}
                  style={{ color: tier.featured ? CREAM : FOREST }}
                >
                  {tier.name}
                </h3>
                <p
                  className={`mb-3.5 max-w-[62ch] text-[15px] ${
                    tier.featured ? 'text-[#CFC9B8]' : 'text-[#5C6B62]'
                  }`}
                >
                  {tier.audience}
                </p>
                <span
                  className="text-[30px] font-bold"
                  style={{ color: tier.featured ? CREAM : FOREST }}
                >
                  {MEMBERSHIP_PRICES[tier.key]}
                  <span
                    className={`text-[15px] font-medium ${
                      tier.featured ? 'text-[#B9C4BC]' : 'text-[#6B7A70]'
                    }`}
                  >
                    /month
                  </span>
                </span>
                <div className="mt-[18px] flex-1">
                  <Checks items={tier.bullets} tone={tier.featured ? 'cream' : 'ink'} />
                </div>
              </div>
            ))}
          </div>

          <p className="mt-[30px] max-w-[62ch] text-[16px]">
            <strong style={{ color: FOREST }}>Not sure which level fits?</strong> That is what your
            assessment is for. After we train together, I will recommend the level that matches your
            body, goals, and schedule.
          </p>
        </div>
      </section>

      {/* TRAVEL */}
      <section className={SECTION} style={{ backgroundColor: FOREST, color: '#E8E2D2' }}>
        <div className={WRAP}>
          <div className="grid gap-9 min-[900px]:grid-cols-[1fr_0.85fr] min-[900px]:items-center min-[900px]:gap-[52px]">
            <div>
              <Rule />
              <h2 className={`${SECTION_HEADING} max-w-[20ch]`} style={{ color: CREAM }}>
                {"Your training location may change. Your coaching relationship doesn't have to."}
              </h2>
              <p className="mt-4 max-w-[62ch] text-[#E8E2D2]">
                Many MEF clients travel often, for work and for life. When you are away, your
                coaching shifts with you. Depending on your membership, remote and travel workouts,
                individualized programming, mobility and recovery work, and Rooted Reset guidance
                and accountability can replace some in-person sessions until you are back.
              </p>
              <p className="mt-3.5 max-w-[62ch] text-[#E8E2D2]">
                Travel shifts your support rather than storing it: it does not create unlimited
                make-up sessions, and unused in-person sessions do not stack up while you are away.
                You return on track instead of behind.
              </p>
              <p className={`${DISPLAY} mt-7 text-2xl`} style={{ color: GOLD }}>
                {TRAVEL_CLOSE_LINE}
              </p>
            </div>

            {/*
              Phone: below the copy, cropped so she and the mug stay the
              subject. Desktop: the right-hand column beside it.
            */}
            <figure className="relative m-0 h-[210px] w-full overflow-hidden rounded-[18px] border border-[#C4A050]/35 min-[641px]:h-[280px] min-[900px]:h-[380px]">
              <Image
                src="/images/memberships/membership-travel.jpg"
                alt="A woman working at a hotel room desk with an open laptop, holding a mug that reads Health Travels With You, a packed suitcase standing beside the bed."
                fill
                sizes="(min-width: 900px) 430px, 100vw"
                className="object-cover object-[48%_30%] min-[900px]:object-[45%_40%]"
              />
            </figure>
          </div>
        </div>
      </section>

      {/* SCHEDULING AND POLICY */}
      <section className={`${SECTION} bg-white`}>
        <div className={WRAP}>
          <Rule />
          <h2 className={SECTION_HEADING} style={{ color: FOREST }}>
            Scheduling, cancellations, and missed sessions.
          </h2>
          <p className="mt-4 max-w-[62ch]">
            Your membership reserves dedicated coaching capacity every month. Two simple guidelines
            keep that time valuable for you and fair for everyone.
          </p>
          {POLICY_ITEMS.map((item) => (
            <Disclosure key={item.question} item={item} />
          ))}
          <p className="mt-[26px] max-w-[62ch]">
            Real life happens. Emergencies and unusual situations are always handled personally, not
            by policy.
          </p>
        </div>
      </section>

      {/* ROOTED RESET */}
      <section className={SECTION} style={{ backgroundColor: CREAM }}>
        <div className={WRAP}>
          <div className="grid gap-8 min-[860px]:grid-cols-[1.1fr_0.9fr] min-[860px]:items-center">
            <div>
              <div className="mb-3.5 text-[14px] font-bold tracking-[0.1em]" style={{ color: GOLD }}>
                INCLUDED WITH EVERY MEMBERSHIP
              </div>
              <h2 className={SECTION_HEADING} style={{ color: FOREST }}>
                Rooted Reset
              </h2>
              <p className="mt-4 max-w-[62ch]">
                Rooted Reset is the MEF Wellness digital platform, and it is how your coaching
                continues after the session ends. It carries your programs, your daily check-ins,
                and your progress, and it keeps me connected to how you are actually doing between
                sessions.
              </p>
              <p className="mt-3.5 max-w-[62ch]">
                Rooted Reset also offers its own standalone memberships. As an MEF Wellness member,
                full access is simply included.
              </p>
            </div>

            <div>
              {/* Above the green panel, per the approved layout. */}
              <figure className="relative m-0 mb-[18px] h-[170px] w-full overflow-hidden rounded-[18px] border border-[#E3DCC8] min-[641px]:h-[200px]">
                <Image
                  src="/images/memberships/membership-rooted.jpg"
                  alt="A woman sitting cross-legged on a mat at home, tapping through her program on a tablet, with a notebook, a water bottle and a folded towel beside her."
                  fill
                  sizes="(min-width: 860px) 430px, 100vw"
                  className="object-cover object-[46%_32%] min-[860px]:object-[46%_38%]"
                />
              </figure>
              <div
                className="rounded-[18px] px-7 py-8"
                style={{ backgroundColor: FOREST, color: '#EFEADB' }}
              >
                <h3
                  className={`${DISPLAY} mb-3 text-2xl font-semibold leading-[1.15]`}
                  style={{ color: CREAM }}
                >
                  {"Your coaching doesn't end when the session does."}
                </h3>
                <Checks items={ROOTED_PANEL_BULLETS} tone="cream" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className={`${SECTION} bg-white`}>
        <div className={WRAP}>
          <Rule />
          <h2 className={SECTION_HEADING} style={{ color: FOREST }}>
            Questions people actually ask.
          </h2>
          {FAQ_ITEMS.map((item) => (
            <Disclosure key={item.question} item={item} />
          ))}
        </div>
      </section>

      {/* FINAL CALL TO ACTION */}
      <section className="py-[60px] text-center min-[641px]:py-20" style={{ backgroundColor: FOREST }}>
        <div className={WRAP}>
          <h2
            className={`${SECTION_HEADING} mx-auto max-w-[18ch]`}
            style={{ color: CREAM }}
          >
            Begin with MEF Wellness.
          </h2>
          <p className="mx-auto mb-8 mt-4 max-w-[62ch] text-[#E8E2D2]">
            Your first session gives us everything we need to map the right path forward: how you
            move, where you are starting, and the level of support that fits your life.
          </p>
          <a className={BTN_ON_CREAM} href={BOOKING_URL}>
            {ASSESSMENT_CTA_LABEL}
          </a>
          <p className="mt-4 text-[14px] text-[#CFC9B8]">
            Questions first? Ask them at your assessment. That is what it is for.
          </p>
        </div>
      </section>

      <footer className="py-[34px] text-[14px]" style={{ backgroundColor: FOREST_DEEP, color: '#B9C4BC' }}>
        <div className={WRAP}>
          <div className="mb-1.5 text-[14px] font-bold tracking-[0.12em]" style={{ color: CREAM }}>
            MEF WELLNESS
          </div>
          <div>
            In-person training in Brooklyn and Manhattan. Coaching, Rooted Reset, and travel support
            wherever you are.
          </div>
          <div className="mt-1.5">
            Rooted Reset is the digital wellness platform of MEF Wellness.
          </div>
        </div>
      </footer>
    </div>
  );
}
