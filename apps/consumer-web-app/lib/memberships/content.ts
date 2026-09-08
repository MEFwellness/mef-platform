/**
 * The public MEF Wellness membership page, as data.
 *
 * THE COPY ON THIS PAGE IS APPROVED AND VERBATIM. Every string below is
 * ported word for word from the approved reference
 * (docs/assessments/memberships-reference.html). Nothing here is a
 * paraphrase, a shortening or an improvement, and nothing should become
 * one: a price, a policy sentence or a tier bullet that drifts from the
 * approved wording is a promise this business did not make. If the offer
 * itself changes, the reference changes first and this file follows it.
 *
 * WHY THE FOUR PRICES ARE CONSTANTS AND NOT LITERALS IN THE PAGE. The same
 * number appears in the tier card a prospect reads and, in future, anywhere
 * else this offer is described. One source of truth per number is the
 * standing rule in this codebase, and a price is the number where being
 * wrong costs the most. `MEMBERSHIP_PRICES` is the only place any of the
 * four is written down; app/memberships/page.tsx renders from here and
 * never types a dollar figure of its own.
 *
 * WHAT THIS PAGE IS NOT. It is marketing for NEW in-person training
 * clients. It has nothing to do with Rooted Reset app subscriptions, the
 * trial lock, the app's own pricing link or any entitlement this app
 * grants.
 * Those tiers live in lib/membership/ (singular) and are untouched by this
 * file, deliberately, including the route boundary: /memberships is a
 * public marketing page, /membership is the member's own subscription
 * screen, and MEMBER_ONLY_PREFIXES matches on path boundaries so the two
 * can never claim the same request.
 */

/**
 * The four prices, written down exactly once each.
 *
 * Formatted strings rather than numbers on purpose: what a prospect reads
 * is "$1,050", and a separate formatter would be a second place for the
 * comma, the currency and the rounding to disagree about one approved
 * figure.
 */
export const MEMBERSHIP_PRICES = {
  /** The Initial Assessment & Training Session, one time. */
  assessment: '$175',
  /** MEF Essential, monthly. */
  essential: '$550',
  /** MEF Performance, monthly. */
  performance: '$1,050',
  /** MEF Total Wellness, monthly. */
  total: '$1,350',
} as const;

export type MembershipPriceKey = keyof typeof MEMBERSHIP_PRICES;

export interface MembershipTier {
  /** Stable key, used for React keys and for the price lookup. */
  key: Exclude<MembershipPriceKey, 'assessment'>;
  name: string;
  /** Who this level is for. */
  audience: string;
  /** The gold flag above the name, on the one tier that carries it. */
  flag?: string;
  /** Rendered on the forest panel rather than the white card. */
  featured?: boolean;
  bullets: readonly string[];
}

export const MEMBERSHIP_TIERS: readonly MembershipTier[] = [
  {
    key: 'essential',
    name: 'MEF Essential',
    audience:
      'For the self-motivated person who wants expert direction, a weekly anchor, and a plan that holds together on their own days.',
    bullets: [
      '4 personal training sessions per month',
      'Individualized training and programming',
      'Rooted Reset and the MEF training platform included',
      'Guidance for what to do between sessions',
      'Accountability check-ins',
      'Travel-friendly programming when you need it',
    ],
  },
  {
    key: 'performance',
    name: 'MEF Performance',
    flag: 'The core MEF membership',
    featured: true,
    audience:
      'For the person ready for a true training relationship: twice-weekly coaching, steady progression, and a coach who always knows where you are.',
    bullets: [
      '8 personal training sessions per month',
      'Individualized programming that progresses with you',
      'Rooted Reset and the MEF training platform included',
      'Between-session guidance and accountability',
      'Travel programming and support when you are away',
      'Ongoing adjustment as your body and goals change',
    ],
  },
  {
    key: 'total',
    name: 'MEF Total Wellness',
    audience:
      'For the person who wants MEF Wellness involved in the whole picture: how you train, recover, eat, sleep, and live.',
    bullets: [
      'Everything in MEF Performance',
      'A dedicated monthly wellness coaching session, separate from your training',
      'Monthly review of your Rooted Reset check-ins and patterns',
      'Wellness priorities set with you and adjusted as your life changes',
      'Direct, ongoing focus on sleep, recovery, stress, and nutrition and lifestyle habits',
      'The highest level of accountability and personalization',
    ],
  },
] as const;

/** What the assessment session includes, on the starting-point card. */
export const ASSESSMENT_INCLUDES: readonly string[] = [
  'A full training session, experiencing the MEF approach',
  'Movement and posture assessment',
  'A real conversation about your goals, history, and lifestyle',
  'A clear recommendation for the membership that fits you',
] as const;

export const PHILOSOPHY_PILLARS: readonly { title: string; body: string }[] = [
  {
    title: 'Train with intention',
    body: 'In-person coaching built on a real assessment of your movement, posture, history, and goals. Every session has a purpose inside a larger plan.',
  },
  {
    title: 'Supported between sessions',
    body: 'Individualized programming, guidance, and accountability through the Rooted Reset platform, so progress continues on the days we are not together.',
  },
  {
    title: 'The whole picture',
    body: 'Strength is one piece. We also pay attention to recovery, stress, sleep, and lifestyle patterns, because that is where lasting results are made.',
  },
] as const;

export const TRAVEL_CLOSE_LINE = 'Travel is not a pause in your progress. It is part of the plan.';

export interface DisclosureItem {
  question: string;
  answer: string;
}

/** The two scheduling accordions. */
export const POLICY_ITEMS: readonly DisclosureItem[] = [
  {
    question: 'Rescheduling and cancellations',
    answer:
      'Sessions are designed to be used within the month they belong to. Plans change, so with at least 24 hours notice, we will find another time that month whenever possible.',
  },
  {
    question: 'Rollover',
    answer:
      'Up to one session canceled with proper notice may carry into the immediately following month, subject to scheduling availability. Sessions do not accumulate beyond that.',
  },
] as const;

/** What Rooted Reset carries, on the forest panel. */
export const ROOTED_PANEL_BULLETS: readonly string[] = [
  'Daily check-ins that keep you connected to your progress',
  'Your individualized programs, wherever you are',
  'Guidance shaped by what you actually report',
  'A record of your journey we both can see',
] as const;

/** All twelve, in the approved order. */
export const FAQ_ITEMS: readonly DisclosureItem[] = [
  {
    question: 'Do I have to choose a membership before my assessment?',
    answer:
      'No. The assessment comes first on purpose. You experience the work, I learn how you move and what you need, and then I recommend a level of support. You choose from there.',
  },
  {
    question: "What if I'm not sure whether I need one or two sessions per week?",
    answer:
      'Most people are not sure, and that is fine. Your assessment gives me what I need to make an honest recommendation, and your membership can change later as your life and goals change.',
  },
  {
    question: 'What happens when I travel?',
    answer:
      'Your coaching travels with you. Depending on your membership, that can mean remote workouts, programming built for the equipment you have, mobility and recovery work, and ongoing guidance through Rooted Reset until we are back in person. Travel shifts your support rather than storing it, so it does not create unlimited make-up sessions.',
  },
  {
    question: 'Do unused sessions roll over?',
    answer:
      'Within a clear limit, yes. Up to one session canceled with proper notice may carry into the immediately following month, subject to scheduling availability. Sessions do not accumulate beyond that; your membership is an ongoing coaching relationship with reserved capacity, not a stack of stored hours.',
  },
  {
    question: 'What if I have to cancel a session?',
    answer:
      'Give me at least 24 hours notice and we will find another time that month whenever possible. True emergencies are always handled personally.',
  },
  {
    question: 'Is Rooted Reset included?',
    answer: 'Yes. Full Rooted Reset access is included with every MEF Wellness membership.',
  },
  {
    question: 'Can I train remotely while traveling?',
    answer:
      'Yes. Remote and travel support is built into the memberships, because consistency should not depend on your zip code.',
  },
  {
    question: 'Is this only personal training?',
    answer:
      'No. Training is the anchor, but every membership includes programming, guidance, accountability, and Rooted Reset. Total Wellness goes further into recovery, stress, sleep, and lifestyle coaching.',
  },
  {
    question: 'What is different about Total Wellness?',
    answer:
      'It is not more workouts. It is a coaching layer on top of Performance: a dedicated monthly wellness coaching session separate from your training, a monthly review of your Rooted Reset check-ins and patterns, and hands-on adjustment of your priorities across sleep, recovery, stress, and nutrition and lifestyle habits.',
  },
  {
    question: 'Can I just purchase individual sessions?',
    answer:
      'MEF Wellness is designed around ongoing coaching relationships, because that is what actually produces results. The Initial Assessment & Training Session is the way to experience the work firsthand, and from there, ongoing training is membership-based. If your situation is unusual, bring it to your assessment and we will talk it through.',
  },
  {
    question: 'How does billing work?',
    answer:
      'Memberships bill monthly on a recurring basis. If your needs change, we talk before your next billing date and adjust your level of support.',
  },
  {
    question: 'What happens if my schedule changes?',
    answer:
      'We adapt. Session times can move, programming can shift, and busy seasons can lean more on remote support. The relationship is built to flex with your life, not break because of it.',
  },
] as const;
