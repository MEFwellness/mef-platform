/**
 * Every word a visitor reads in Where Your Energy Goes.
 *
 * THE VOICE. Observational, never diagnostic. This experience is allowed to
 * say what somebody told us and what that combination often looks like. It
 * is not allowed to say what is wrong with them, what is causing it, or
 * what will happen if they do or do not act. There is no medical claim
 * anywhere in this file, no promise with no date on it, and no sentence
 * that would still be true if they had answered differently.
 *
 * WHY THE ECHOES ARE A TABLE. Every evidence line in a result is one entry
 * from ANSWER_ECHOES, chosen by what the visitor actually tapped. That is
 * what makes "this was built from your answers" a true statement rather
 * than a claim: there is no sentence in a result that is not keyed to an
 * option value, and tests/public-entry-result-copy.test.ts fails the build
 * if a single option anywhere is missing its echo, or if an echo exists for
 * an option no question offers.
 *
 * NO EM DASHES ANYWHERE, per the standing rule, and enforced for this file
 * like every other by tests/no-em-dash-guard.test.ts.
 */

import type { PublicEntryPatternKey } from '@mef/shared-types-contracts';

export const ENERGY_EXPERIENCE_TITLE = 'Where Your Energy Goes';

/**
 * The entry screen, and the one rule it is written to.
 *
 * A COLD VISITOR DECIDES IN ABOUT A SECOND. The first version of this
 * screen said the right things in about sixty words, which on a phone is a
 * wall of text somebody scrolls past. This says the same things in about
 * half of that, and the three facts that actually decide whether a stranger
 * starts (how long, what it costs, what they get) are lifted out of the
 * prose into `facts` so they can be read at a glance rather than found in a
 * sentence.
 *
 * Nothing was softened to make it shorter. The disclaimer is unchanged and
 * still sits on this screen, before a single question is asked.
 */
export const ENERGY_INTRO = {
  eyebrow: 'A short look at your energy',
  title: 'Where Your Energy Goes',
  lines: [
    'Nine questions about your days and your nights.',
    'At the end, what we noticed in your own answers, and one thing worth trying.',
  ],
  /** The three facts that decide whether somebody begins. Read at a glance, never buried in a sentence. */
  facts: ['About 2 minutes', 'No account', 'No email'],
  buttonLabel: 'Begin',
  reassurance: 'Nothing here is a diagnosis, and nothing here is medical advice.',
} as const;

/**
 * One clause per option, per question. Written to slot into "You told us
 * ..." so an evidence line is unambiguously a restatement of what the
 * visitor said, never an inference layered on top of it.
 */
export const ANSWER_ECHOES: Record<string, Record<string, string>> = {
  low_point: {
    early_morning: 'the tiredness is there before the day even starts',
    late_morning: 'tiredness hits hardest late morning, once the first push is over',
    early_afternoon: 'tiredness hits hardest in the early afternoon, somewhere after lunch',
    evening: 'tiredness hits hardest in the evening, once things finally go quiet',
    all_day: 'there is no single worst time, because your energy is low all day',
  },
  morning_start: {
    up_and_going: 'you are up and going with no real effort',
    slow_but_fine: 'you are slow to start but fine once you are moving',
    heavy_and_slow: 'the first half hour feels like moving through water',
    need_something_first: 'you need coffee or a shower before you are a person',
  },
  sleep_hours: {
    under_five: 'a normal night is under five hours',
    five_to_six: 'a normal night is five to six hours',
    six_to_seven: 'a normal night is six to seven hours',
    seven_to_eight: 'a normal night is seven to eight hours',
    over_eight: 'a normal night is more than eight hours',
  },
  night_pattern: {
    hard_to_fall_asleep: 'falling asleep is the hard part, because your head will not stop',
    wake_in_the_night: 'you fall asleep fine and then wake in the night',
    sleep_fine_wake_tired: 'you sleep right through and still wake up tired',
    nights_are_fine: 'your nights are genuinely fine',
  },
  wind_down: {
    screen_until_lights_out: 'the last hour before bed is a screen, right up until lights out',
    working_or_chores: 'the last hour before bed is still working, or catching up on the house',
    genuine_wind_down: 'the last hour before bed is something calm, on purpose',
    collapse_without_warning: 'you go from upright to asleep with nothing in between',
  },
  first_food: {
    within_an_hour: 'you eat a real meal within an hour of waking',
    mid_morning: 'you do not eat until mid morning',
    not_until_lunch: 'you do not eat a real meal until lunch',
    no_pattern: 'when you first eat changes completely day to day',
  },
  afternoon_reach: {
    caffeine: 'when it hits, you reach for more caffeine',
    something_sweet: 'when it hits, you reach for something sweet or quick',
    push_through: 'when it hits, you reach for nothing and push through it',
    move_or_air: 'when it hits, you go for air or a walk',
    real_meal: 'when it hits, you eat an actual meal',
  },
  mental_load: {
    most_of_it: 'most of your day is spent responsible for other people or decisions, and it does not really stop',
    a_lot: 'a lot of your day is spent responsible for other people or decisions',
    some: 'some of your day is spent responsible for other people or decisions',
    not_much: 'not much of your day is spent responsible for other people or decisions',
  },
  off_switch: {
    this_week: 'you had a stretch of time with nothing asked of you this week',
    this_month: 'you had a stretch of time with nothing asked of you sometime this month',
    cant_remember: 'you genuinely cannot remember the last stretch of time with nothing asked of you',
    not_the_way_life_is: 'a stretch of time with nothing asked of you is not what your life looks like right now',
  },
};

export type EnergyPatternCopy = {
  /** The name she reads. Editorial and plain, never a condition and never a label she could take to a doctor. */
  readonly title: string;
  /** One sentence saying what the pattern is. Present tense, observational. */
  readonly summary: string;
  /**
   * Which questions to echo as evidence, in order. The first three that
   * hold an answer are shown. Always begins with the questions the rule
   * that chose this pattern actually read.
   */
  readonly evidenceOrder: readonly string[];
  /** What this pattern often looks like, said as a tendency and never as a cause. */
  readonly whatItOftenLooksLike: string;
  /** The honest limits. This is the trust move and it is never softened. */
  readonly whatThisDoesNotTellUs: string;
  /** One safe, specific, reversible thing to try. Never a prescription, never a dose, never a supplement. */
  readonly tryToday: { readonly title: string; readonly body: string };
  /** The email-gated extra: three days of things to watch. Genuinely additional, never a restatement of the free result. */
  readonly threeDayNotes: readonly { readonly day: string; readonly watchFor: string }[];
};

export const ENERGY_PATTERN_COPY: Record<PublicEntryPatternKey, EnergyPatternCopy> = {
  depletion_pattern: {
    title: 'Running on an empty tank',
    summary:
      'The nights are short, and the days are being run on whatever is left over from them.',
    evidenceOrder: ['sleep_hours', 'low_point', 'morning_start', 'night_pattern'],
    whatItOftenLooksLike:
      'When sleep is genuinely short rather than merely late, the tiredness tends to spread out instead of arriving at one time of day. People often describe it as flat rather than as a dip, and the usual afternoon fixes stop making much difference.',
    whatThisDoesNotTellUs:
      'Nine questions cannot tell us why the nights are short. A schedule, a small child, shift work, pain, worry and plenty of other things all produce the same answer here, and they are not the same problem. This says where to look first, not what is going on.',
    tryToday: {
      title: 'Pick one night, not seven',
      body: 'Choose a single night this week and move lights out thirty minutes earlier than usual. Then notice the next morning specifically, not the whole day. One night is not proof of anything. It is just the cheapest information you can get about whether the nights are the thing.',
    },
    threeDayNotes: [
      { day: 'Day one', watchFor: 'Write down the time you actually fell asleep, not the time you went to bed. For a lot of people those turn out to be an hour apart, and only one of them is sleep.' },
      { day: 'Day two', watchFor: 'Notice the first moment of the day you feel genuinely awake. If that moment is after eleven, the morning is being carried rather than lived, and that is worth knowing.' },
      { day: 'Day three', watchFor: 'Compare the day after your shortest night with the day after your longest one. If they feel the same, sleep length may not be the whole story, and that is useful too.' },
    ],
  },
  wind_down_deficit: {
    title: 'The day never closes',
    summary:
      'The day does not end, it just stops. Nothing in the last hour tells your body that the day is over.',
    evidenceOrder: ['wind_down', 'night_pattern', 'low_point', 'mental_load'],
    whatItOftenLooksLike:
      'When the hour before bed looks exactly like the rest of the day, falling asleep often takes longer than it feels like it should, and the sleep that follows tends to be reported as lighter. People frequently describe lying down tired and finding their head still going.',
    whatThisDoesNotTellUs:
      'This says nothing about how much sleep you are getting, only about how the day hands over to it. Someone can wind down beautifully and still be exhausted, and someone can go straight from a screen to a deep eight hours.',
    tryToday: {
      title: 'Build a twenty minute edge',
      body: 'Tonight, give the day a visible ending twenty minutes before you plan to sleep. Not a routine, not an app, just something that is clearly not the day: a shower, a walk to the end of the road, tidying one surface. The point is the boundary, not the activity.',
    },
    threeDayNotes: [
      { day: 'Day one', watchFor: 'Notice what the actual last thing you do is. Most people are surprised, because the intended last thing and the real last thing are usually different.' },
      { day: 'Day two', watchFor: 'Notice how long it takes to fall asleep on a night with a clear ending versus a night without one. You are looking for a difference, not a number.' },
      { day: 'Day three', watchFor: 'Notice whether the thoughts that keep you up are about today or about tomorrow. Those two respond to completely different things.' },
    ],
  },
  rhythm_disruption: {
    title: 'Sleep that does not restore',
    summary:
      'The hours are being spent asleep. They are not coming back as energy in the morning.',
    evidenceOrder: ['night_pattern', 'morning_start', 'sleep_hours', 'low_point'],
    whatItOftenLooksLike:
      'When sleep is happening but mornings still feel heavy, the interesting question is usually about the shape of the night rather than its length. People describe waking at a similar time each night, or sleeping through and waking unrefreshed, and both tend to show up in the first hour of the day.',
    whatThisDoesNotTellUs:
      'There are many reasons sleep stops being restorative, and several of them are medical. Nine questions cannot separate them and should not try. If this has been going on for months, this is a conversation to have with a doctor as well as with us.',
    tryToday: {
      title: 'Anchor the wake time, not the bedtime',
      body: 'For the next few days, get up at the same time regardless of how the night went, and get daylight on your face within the first half hour. Bedtimes are hard to control. Wake times mostly are not, and they are the end of the rope that tends to move the other one.',
    },
    threeDayNotes: [
      { day: 'Day one', watchFor: 'If you wake in the night, note roughly what time. A consistent time and a random time point in different directions.' },
      { day: 'Day two', watchFor: 'Notice how long after waking you feel like yourself. Thirty minutes is ordinary. Three hours is information.' },
      { day: 'Day three', watchFor: 'Notice whether a weekend morning feels different from a weekday one. If it does, something about the weekday is doing it.' },
    ],
  },
  fuel_timing_pattern: {
    title: 'The gap before the dip',
    summary:
      'The tiredness arrives at a specific time, and there is a gap in the day sitting just in front of it.',
    evidenceOrder: ['low_point', 'first_food', 'afternoon_reach', 'morning_start'],
    whatItOftenLooksLike:
      'A drop that lands at a predictable hour behaves differently from a general flatness. When it lines up with a long gap since eating, or with something quick used to lift it, the pattern people often describe is a lift followed by a steeper drop an hour or two later.',
    whatThisDoesNotTellUs:
      'A predictable afternoon dip is also just a normal thing human bodies do. This does not tell us whether yours is worth changing, and it says nothing at all about what you should eat. It only says the timing is worth watching before anything else.',
    tryToday: {
      title: 'Move one meal, change nothing else',
      body: 'Tomorrow, eat something proper within an hour of waking, and keep the rest of the day exactly as it usually is. Then notice what the dip does. Changing one thing is the only way to find out whether that thing mattered.',
    },
    threeDayNotes: [
      { day: 'Day one', watchFor: 'Note the clock time the dip arrives. If it is within about thirty minutes each day, it is a rhythm rather than a random bad afternoon.' },
      { day: 'Day two', watchFor: 'Note how long it has been since you last ate when the dip arrives. That gap is the number worth knowing.' },
      { day: 'Day three', watchFor: 'Notice what happens forty five minutes after whatever you reach for. A quick lift with a steeper drop behind it is a very different thing from a steady one.' },
    ],
  },
  overload_pattern: {
    title: 'More asked than the day holds',
    summary:
      'The day is carrying more than it has room for, and it has been doing that for a while.',
    evidenceOrder: ['mental_load', 'off_switch', 'low_point', 'afternoon_reach'],
    whatItOftenLooksLike:
      'When the demand does not let up and there is no gap anywhere in it, tiredness often stops behaving like a dip and starts behaving like a baseline. People frequently report that rest does not seem to touch it, which is usually less about the rest and more about the fact that nothing has actually been put down.',
    whatThisDoesNotTellUs:
      'This is a description of a load, not of you. It does not tell us whether the load is temporary or permanent, chosen or imposed, or whether anything about it can be moved at all. Those are the parts a person has to answer, and they change what would help enormously.',
    tryToday: {
      title: 'Find the twenty minutes that already exist',
      body: 'Look at tomorrow and find one twenty minute stretch that is already unclaimed. Do not create it and do not defend a bigger one. Just notice whether it exists, and if it does, leave it empty on purpose once. What you learn is whether the gap is missing or whether it is being filled.',
    },
    threeDayNotes: [
      { day: 'Day one', watchFor: 'Count how many times the day is interrupted by somebody else needing something. Not to fix it, only to see the number.' },
      { day: 'Day two', watchFor: 'Notice whether the tiredness lifts at any point at all. If there is one time of day it lifts, that time is a clue.' },
      { day: 'Day three', watchFor: 'Notice what you do with a gap when one appears. Filling it immediately is a very common and very informative habit.' },
    ],
  },
  stress_loading_pattern: {
    title: 'Carrying it without putting it down',
    summary:
      'A lot is being held, and there has not been a real gap in it for some time.',
    evidenceOrder: ['mental_load', 'off_switch', 'night_pattern', 'wind_down'],
    whatItOftenLooksLike:
      'Sustained responsibility with no break in it tends to show up as tiredness that sleep does not fully answer. People often describe being tired and wired at the same time, and describe the evening as the first moment anything is theirs.',
    whatThisDoesNotTellUs:
      'Nine questions cannot tell the difference between a demanding season and something that has become permanent, and those two need different things. It also says nothing about how you are coping, only about what you are carrying.',
    tryToday: {
      title: 'Put one thing down on paper',
      body: 'Before bed tonight, write down the three things you are currently holding in your head. Not a plan and not a to do list. Just the three. A lot of people find that the list is shorter written down than it feels carried, and that alone changes the evening.',
    },
    threeDayNotes: [
      { day: 'Day one', watchFor: 'Notice the first moment in the day that is genuinely yours. Note the time. For many people it is later than they expected.' },
      { day: 'Day two', watchFor: 'Notice whether the tiredness is physical or mental. Try to say which, out loud. They are surprisingly hard to tell apart and they need different things.' },
      { day: 'Day three', watchFor: 'Notice what happens in the twenty minutes after you stop for the day. That handover is where a lot of the energy actually goes.' },
    ],
  },
  recovery_deficit: {
    title: 'Spending more than you are putting back',
    summary:
      'Nothing in your answers points at one single place the energy is going, which is itself worth knowing.',
    evidenceOrder: ['low_point', 'sleep_hours', 'mental_load', 'morning_start'],
    whatItOftenLooksLike:
      'When no single area stands out, what usually shows up is a small deficit in several places at once rather than a large one anywhere. That is genuinely harder to see from the inside, and it is the reason people in this position often report that nothing they try seems to make much difference.',
    whatThisDoesNotTellUs:
      'This is the honest answer rather than the interesting one. Nine questions found no dominant signal, and we are not going to invent one. It may mean the picture is genuinely even. It may also mean the thing that matters was not one of the nine questions.',
    tryToday: {
      title: 'Take three readings, not one',
      body: 'For the next three days, note how you feel at three fixed times: mid morning, mid afternoon, and an hour before bed. Same times, three words each, nothing more. A pattern that is invisible on one day is often obvious across three.',
    },
    threeDayNotes: [
      { day: 'Day one', watchFor: 'Take your three readings and resist the urge to explain them. You are collecting, not diagnosing.' },
      { day: 'Day two', watchFor: 'Notice which of the three readings moved most from yesterday. The one that moves is the one carrying information.' },
      { day: 'Day three', watchFor: 'Look at all nine readings together. If one time of day is consistently the lowest, that is where to look first, and you found it in three days.' },
    ],
  },
  compensation_pattern: {
    title: 'Working around something',
    summary: 'Part of the day is being worked around rather than moved through.',
    evidenceOrder: ['low_point', 'morning_start', 'mental_load', 'sleep_hours'],
    whatItOftenLooksLike:
      'When something is being avoided or worked around, the cost usually shows up somewhere other than where the original thing is.',
    whatThisDoesNotTellUs:
      'Nine questions about energy cannot see what is being worked around. This pattern is included for completeness of the shared vocabulary and is not one this experience assigns.',
    tryToday: {
      title: 'Take three readings, not one',
      body: 'For the next three days, note how you feel at three fixed times: mid morning, mid afternoon, and an hour before bed. Same times, three words each, nothing more.',
    },
    threeDayNotes: [
      { day: 'Day one', watchFor: 'Take your three readings and resist the urge to explain them.' },
      { day: 'Day two', watchFor: 'Notice which of the three readings moved most from yesterday.' },
      { day: 'Day three', watchFor: 'Look at all nine readings together and see whether one time of day is consistently lowest.' },
    ],
  },
};

/** The honest, undecorated limits every result carries, whatever pattern it names. */
export const RESULT_UNIVERSAL_LIMITS =
  'This came from nine questions and took two minutes. It is a first impression, not an assessment, and it is not a diagnosis or medical advice. If something here has been going on for a long time, or is getting worse, that is a conversation for a doctor.';

export const RESULT_HEADINGS = {
  pattern: 'What we noticed',
  evidence: 'This came from what you told us',
  looksLike: 'What this often looks like',
  limits: 'What this does not tell us',
  action: 'One thing worth trying',
  notes: 'Your three day notes',
  invitation: 'If you want to keep going',
} as const;

export const EMAIL_STEP_COPY = {
  eyebrow: 'Optional, and your result above is already complete',
  title: 'Three day notes',
  body: 'Three specific things to watch over the next three days, written for the pattern above. Leave your email and they open right here on this page.',
  honesty:
    'Nothing lands in your inbox today. Your email does two things: it lets a MEF Wellness coach see this result, so a real person can reach out if you want one to, and it means we can find your answers again if you come back.',
  buttonLabel: 'Open my three day notes',
  fieldLabel: 'Email',
  successTitle: 'Here they are',
  errorMessage: 'That email did not look right. Check it and try again.',
  failureMessage: 'Something went wrong saving that. Your result above is unaffected, please try again.',
} as const;

export const INVITATION_COPY = {
  title: 'If you want to keep going',
  lines: [
    'Rooted Reset is where this stops being a snapshot and starts being a picture. It is the same kind of noticing, done daily, so a pattern can prove itself over weeks instead of being guessed at in two minutes.',
    'If you create an account, what you told us today comes with you. Root will show it back to you as what it is: a first impression from before we knew anything about you.',
  ],
  buttonLabel: 'Create a free account',
  secondaryLabel: 'I already have an account',
} as const;

/**
 * What Root says the first time she sees a member who arrived through the
 * public entry experience.
 *
 * THE ACCURACY RULE, APPLIED. Every sentence here is literally true of this
 * member and is stated at exactly the strength the evidence supports. It
 * says she answered nine questions before she had an account, it names what
 * came back, and it says out loud that this was a first impression and not
 * a measurement. It does not treat it as an assessment, does not carry it
 * into anything, and does not claim to know anything about her health.
 */
export const ROOT_WELCOME_COPY = {
  eyebrow: 'From Root',
  title: 'I already know where you started',
  ctaLabel: 'Start my Baseline Assessment',
  /** When she finished the experience and a pattern was named. */
  bodyWithPattern: (patternTitle: string): string =>
    `Before you had an account, you spent two minutes on Where Your Energy Goes, and what came back was "${patternTitle}". That was a first impression from nine questions, not a measurement, and I have kept it as exactly that. Your Baseline Assessment is where the real picture starts, and I will not ask you the same things twice.`,
  /** When she arrived and created an account without finishing the nine questions. */
  bodyWithoutPattern:
    'Before you had an account, you started Where Your Energy Goes but did not finish it, so there is nothing from it worth telling you back. Your Baseline Assessment is where the real picture starts.',

  /**
   * WHEN HER BASELINE IS ALREADY DONE (2026-09-05).
   *
   * The ordinary new-member path runs the welcome flow and the Baseline
   * Assessment before she ever reaches Home, so this is the shape most
   * arrivals will actually read. It is a GREETING, not an invitation:
   * nothing is being asked of her, the button goes to the picture she has
   * already started building rather than to something she has finished,
   * and the closing word is "Got it" rather than "Maybe later", because
   * this is shown once and does not come back.
   *
   * It still says out loud that the quiz was a first impression and not a
   * measurement. That sentence is the whole reason the arrival is allowed
   * to be spoken about at all, and it does not become optional just
   * because a real assessment now sits underneath it.
   */
  settled: {
    ctaLabel: 'See my Root Map',
    dismissLabel: 'Got it',
    bodyWithPattern: (patternTitle: string): string =>
      `Before you had an account, you spent two minutes on Where Your Energy Goes, and what came back was "${patternTitle}". That was a first impression from nine questions, not a measurement, and I have kept it as exactly that. Your Baseline Assessment has already gone underneath it, so the real picture has started.`,
    bodyWithoutPattern:
      'Before you had an account, you started Where Your Energy Goes but did not finish it, so there is nothing from it worth telling you back. Your Baseline Assessment is done, so the real picture has started from your own answers instead.',
  },
} as const;

/**
 * What the Baseline Assessment says instead of asking a member who arrived
 * through the public entry experience to name her main concern cold.
 *
 * It CONFIRMS rather than assumes. Choosing to open a link about energy is
 * a real signal about what she came for, and it is not the same thing as
 * her telling us that energy is what matters most, so the screen asks.
 */
export const ONBOARDING_PUBLIC_ENTRY_CONFIRM = {
  prompt: 'Does that still feel right?',
  context:
    'When you first arrived, you came in through a look at where your energy goes.',
  stillTrue: 'Energy is still the thing',
  somethingElse: 'Something else matters more',
} as const;
